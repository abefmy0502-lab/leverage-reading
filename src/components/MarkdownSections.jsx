// Renders AI output that uses `## <emoji> <heading>` lines as section breaks.
// Lightweight (no markdown library) — splits on `## ` boundaries and renders
// each section as a card with a styled heading + body.
//
// Lines starting with `### ` are treated as sub-headings inside a section.
// Other lines are rendered as `<p>` blocks. `**bold**` is rendered as <strong>.
// Lists (`- ` or `1. ` etc) are rendered as a styled <ul> / <ol>.

import { memo, useMemo } from 'react';
import { parseRelatedBookHeading, visibleSections, hasVisibleSections } from '../lib/markdownSections';
import {
  getAmazonSearchLink,
  handleAmazonClick,
  AMAZON_DISCLOSURE_TEXT,
  AMAZON_LINK_REL,
} from '../lib/amazonLink';
import { groupTitle, btnGhost, btnGhostOff, btnLink } from '../styles/ui';
import { ExternalLink as IcExternal } from 'lucide-react';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { PLAN_NO_TOC_LINE, PLAN_NO_MATCH_LINE } from '../lib/prompts';

// minWidth:0 が肝。flex column の子は既定 min-width:auto なので、中に幅広な
// 要素（Markdown 表など）があると縮まずページ全体を横にはみ出させる（横スクロール）。
const wrap = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', minWidth: 0 }; // 上との間は呼び出す側の gap に任せる
const sectionStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
  boxShadow: 'none',
  minWidth: 0,
  maxWidth: '100%',
};
const headingStyle = {
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  color: 'var(--text)',
  margin: '0 0 var(--space-2)',
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
};
const subHeadingStyle = {
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  color: 'var(--text)',
  margin: 'var(--space-3) 0 var(--space-1)',
  overflowWrap: 'anywhere',
};
// AI の答え・まとめ・解析の本文＝読む文章（明朝 18・行間 1.6・DESIGN §2/§7）。
const paraStyle = {
  fontFamily: 'var(--font-read)',
  fontSize: 'var(--text-read)',
  color: 'var(--text)',
  lineHeight: 1.6,
  margin: 'var(--space-2) 0',
  whiteSpace: 'pre-wrap',
  // 長い英語タイトル/URL でカードが横にはみ出して「横幅が合わない」現象を防ぐ。
  overflowWrap: 'anywhere',
  // 段落も箇条書きと同じくふつうの日本語の折り返し（禁則は line-break: strict）でそのまま流す（2026-10-04 ui-critic）。
  //   以前の keep-all＋文節の <wbr> は、入りきらない文節ごと次の行へ送るので、明朝 18 では右が大きく空いていた。
  //   最後の行に 1〜2 字だけ残らないよう text-wrap: pretty（対応していないブラウザはふつうの折り返し）。
  wordBreak: 'normal',
  lineBreak: 'strict',
  textWrap: 'pretty',
};
// 読書計画シートの「目次が手に入らないため、章の名前は挙げていません。」は AI の本文ではなく注記として
// 13/--text-3 で見せる（文がそのままのときだけ・言い換えられていれば本文のまま・2026-10-02 ui-critic）。
const noteParaStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, margin: 'var(--space-2) 0', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
function renderPara(text, key) {
  const t = String(text || '').trim();
  if (t === PLAN_NO_TOC_LINE || t === PLAN_NO_MATCH_LINE) return <p key={key} style={noteParaStyle}>{withPhraseBreaks(t)}</p>;
  return <p key={key} style={paraStyle}>{renderInline(text, { phrase: false })}</p>;
}
const listStyle = {
  fontFamily: 'var(--font-read)',
  fontSize: 'var(--text-read)',
  color: 'var(--text)',
  lineHeight: 1.6,
  // 項目の間は gap で 8（最後の項目の下に余りを作らない＝カードの上下の余白をそろえる）。
  margin: 'var(--space-2) 0 0',
  paddingLeft: 0,
  listStyleType: 'none',
  overflowWrap: 'anywhere',
  // 箇条書きは文節で止めずにそのまま流す（2026-10-04 ui-critic）。keep-all＋文節の <wbr> だと、行に入りきらない
  // 文節（「健康・人間関係）」「説明している部分」など 7〜9 字のまとまり）ごと次の行へ送るので、明朝 18 の狭い
  // 箇条書き（点の分だけ幅が狭い）では 10〜14 字で折り返して右がぎざぎざに空いていた。相談の引用（2026-09-30）と同じく
  // ふつうの日本語の折り返し（禁則は line-break: strict）に。段落（paraStyle）は今までどおり文節で。
  wordBreak: 'normal',
  lineBreak: 'strict',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};
const liStyle = { display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' };
// 文の部分は残りの幅いっぱいに（flex の子が中身の幅で縮んで早めに折り返さないように）。
const liTextStyle = { flex: 1, minWidth: 0, textWrap: 'pretty' };
// 「ChatGPT 出力」っぽさを消すための上品な箇条書きマーカー（小さなアクセントの点）。
const bulletDot = { flexShrink: 0, width: 'var(--space-1)', height: 'var(--space-1)', borderRadius: '50%', background: 'var(--text-3)', marginTop: 'var(--space-3)' };
const olNumStyle = { flexShrink: 0, minWidth: 'var(--space-4)', color: 'var(--text-3)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' };
// 見出し冒頭の絵文字（🏆🔑📚 …）を表示から外す。AI 出力の「素の markdown 感」を
// 払拭する最大のレバー。
function stripLeadingEmoji(text) {
  if (typeof text !== 'string') return text;
  // 絵文字の範囲を網羅する（⏩⌛ など U+23xx も含む）。
  const stripped = text.replace(/^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]+\s*)+/u, '').trim();
  return stripped || text;
}
// flat: 本の詳細の畳み（<details>）の中など、すでに面の上にあるときの見た目。
// 区画に面・枠・内側の余白を付けず、見出しは ui.js の groupTitle と同じ小見出しにする。
// 区画（見出し＋中身）の間は 24（区画の中の箇条の間 8 より広く＝まとまりが分かる・DESIGN §1・2026-10-02 ui-critic）。
const flatWrap = { ...wrap, gap: 'var(--space-6)' };
const flatSectionStyle = { minWidth: 0, maxWidth: '100%' };
const flatHeadingStyle = { ...groupTitle, margin: '0 0 var(--space-2)', lineHeight: 1.4, overflowWrap: 'anywhere' };

// Markdown 表のレンダリング。モバイル幅で 3 列が潰れないよう、横スクロール
// 可能なコンテナに収める。先頭行をヘッダーとして強調。
function renderTable(rows, key) {
  if (!rows || rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div key={key} style={{ overflowX: 'auto', maxWidth: '100%', margin: 'var(--space-2) 0', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--text-caption)', lineHeight: 1.6 }}>
        <thead>
          <tr>
            {head.map((c, j) => (
              <th
                key={j}
                style={{
                  textAlign: 'left',
                  padding: 'var(--space-1) var(--space-2)',
                  background: 'var(--fill)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  border: '1px solid var(--separator)',
                  whiteSpace: 'nowrap',
                }}
              >
                {renderInline(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: 'var(--space-1) var(--space-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--separator)',
                    verticalAlign: 'top',
                    // 1 列目（順番など）は折り返さず、それ以外は折り返して読みやすく
                    whiteSpace: ci === 0 ? 'nowrap' : 'normal',
                    minWidth: ci === 0 ? 0 : 90,
                  }}
                >
                  {renderInline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text, { phrase = true } = {}) {
  // Very small inline parser: **bold**
  const parts = [];
  let cursor = 0;
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  let i = 0;
  // 文は文節の切れ目に <wbr> を入れる（段落・箇条書きの keep-all と組で、語の途中で折り返さない・2026-09-30）。
  //   箇条書き（phrase: false）は <wbr> を入れずにそのまま流す（listStyle の説明）。
  const brk = (str) => (phrase ? withPhraseBreaks(str) : str);
  const phrased = (str, key) => <span key={key}>{brk(str)}</span>;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(phrased(text.slice(cursor, m.index), `t-${i}`));
    parts.push(<strong key={`b-${i}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{brk(m[1])}</strong>);
    cursor = m.index + m[0].length;
    i += 1;
  }
  if (cursor < text.length) parts.push(phrased(text.slice(cursor), 'tail'));
  return parts.length ? parts : text;
}

// 関連書籍の 1 行の読み方（1 冊と言い切れない行はカードにしない）は lib/markdownSections.js の parseRelatedBookHeading。

function renderLines(lines, opts) {
  // Group consecutive list items into a single <ul> / <ol>.
  const blocks = [];
  let listBuf = null; // { type: 'ul' | 'ol', items: [] }
  let tableBuf = null; // { type: 'table', rows: [[...cells]] }
  const flushList = () => {
    if (!listBuf) return;
    blocks.push(listBuf);
    listBuf = null;
  };
  // Markdown table helpers: `| a | b |` rows + a `|---|---|` separator row.
  const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  const isTableSep = (l) => /-/.test(l) && /^\s*\|?[\s:|-]+\|?\s*$/.test(l);
  const parseRow = (l) =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const flushTable = () => {
    if (!tableBuf) return;
    if (tableBuf.rows.length) blocks.push(tableBuf);
    tableBuf = null;
  };
  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      flushTable();
      return;
    }
    // テーブル行（`| … |`）はまとめて 1 つの table ブロックに。区切り行
    // （`|---|---|`）はスキップ。これで AI が出す Markdown 表が崩れず描画される。
    if (isTableRow(line)) {
      flushList();
      if (!tableBuf) tableBuf = { type: 'table', rows: [] };
      if (!isTableSep(line)) tableBuf.rows.push(parseRow(line));
      return;
    }
    flushTable();
    if (/^### /.test(line)) {
      flushList();
      blocks.push({ type: 'subhead', text: line.replace(/^### /, '') });
      return;
    }
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    const ulMatch = line.match(/^[-・*]\s+(.+)$/);
    if (olMatch) {
      if (!listBuf || listBuf.type !== 'ol') {
        flushList();
        listBuf = { type: 'ol', items: [] };
      }
      listBuf.items.push(olMatch[2]);
      return;
    }
    if (ulMatch) {
      if (!listBuf || listBuf.type !== 'ul') {
        flushList();
        listBuf = { type: 'ul', items: [] };
      }
      listBuf.items.push(ulMatch[1]);
      return;
    }
    flushList();
    blocks.push({ type: 'p', text: line });
  });
  flushList();
  flushTable();

  // For 関連書籍 sections: each `### N. 『title』- 著者` becomes a card
  // with a 「読みたいに追加」 button. Following paragraphs (until the
  // next subhead) are absorbed as the description.
  if (opts?.relatedBooks && opts?.onAddRelatedBook) {
    const out = [];
    // 続けて並ぶカードは 1 つの縦並び（間 12・カード自身には外側の余白を付けない・2026-10-04 ui-critic）。
    let cards = [];
    const flushCards = () => {
      if (cards.length === 0) return;
      out.push(<div key={`cards-${out.length}`} style={relatedCardsStyle}>{cards}</div>);
      cards = [];
    };
    const push = (node) => { flushCards(); out.push(node); };
    let pending = null; // { book, lines: [] }
    const flushPending = (key) => {
      if (!pending) return;
      // ★ pending は let で、この後 null / 別の本に再代入される。onAdd の
      //   アロー関数が外側の pending を参照すると、クリック時には pending が
      //   null になっていて `pending.book` で例外→「押しても本当に無反応」に
      //   なる。各カードごとに book / description をローカル const へ確定捕捉する。
      if (pending.skip) { pending = null; return; }
      const book = pending.book;
      const description = pending.lines.join('\n').trim();
      cards.push(
        <RelatedBookCard
          key={`rel-${key}`}
          book={book}
          description={description}
          onAdd={() => opts.onAddRelatedBook(book)}
          isAdding={opts.addingTitles?.has(book.title)}
        />,
      );
      pending = null;
    };
    blocks.forEach((b, i) => {
      if (b.type === 'subhead') {
        const parsed = parseRelatedBookHeading(b.text);
        flushPending(i);
        if (parsed?.skip) {
          pending = { skip: true, lines: [] };
        } else if (parsed) {
          pending = { book: parsed, lines: [] };
        } else {
          push(<h4 key={i} style={subHeadingStyle}>{renderInline(stripLeadingEmoji(b.text))}</h4>);
        }
        return;
      }
      if (pending) {
        if (b.type === 'p') pending.lines.push(b.text);
        else if (b.type === 'ul') pending.lines.push(...b.items.map((it) => `- ${it}`));
        else if (b.type === 'ol') pending.lines.push(...b.items.map((it, j) => `${j + 1}. ${it}`));
        return;
      }
      // Non-related fallthrough — render normally.
      if (b.type === 'table') {
        push(renderTable(b.rows, i));
      } else if (b.type === 'ul') {
        push(
          <ul key={i} style={listStyle}>
            {b.items.map((it, j) => (
              <li key={j} style={liStyle}>
                <span style={bulletDot} aria-hidden="true" />
                <span style={liTextStyle}>{renderInline(it, { phrase: false })}</span>
              </li>
            ))}
          </ul>,
        );
      } else if (b.type === 'ol') {
        push(
          <ol key={i} style={listStyle}>
            {b.items.map((it, j) => (
              <li key={j} style={liStyle}>
                <span style={olNumStyle} aria-hidden="true">{j + 1}.</span>
                <span style={liTextStyle}>{renderInline(it, { phrase: false })}</span>
              </li>
            ))}
          </ol>,
        );
      } else {
        push(renderPara(b.text, i));
      }
    });
    flushPending('end');
    flushCards();
    return out;
  }

  return blocks.map((b, i) => {
    if (b.type === 'subhead') return <h4 key={i} style={subHeadingStyle}>{renderInline(stripLeadingEmoji(b.text))}</h4>;
    if (b.type === 'table') return renderTable(b.rows, i);
    if (b.type === 'ul') {
      return (
        <ul key={i} style={listStyle}>
          {b.items.map((it, j) => (
            <li key={j} style={liStyle}>
              <span style={bulletDot} aria-hidden="true" />
              <span style={liTextStyle}>{renderInline(it, { phrase: false })}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (b.type === 'ol') {
      return (
        <ol key={i} style={listStyle}>
          {b.items.map((it, j) => (
            <li key={j} style={liStyle}>
              <span style={olNumStyle} aria-hidden="true">{j + 1}.</span>
              <span style={liTextStyle}>{renderInline(it, { phrase: false })}</span>
            </li>
          ))}
        </ol>
      );
    }
    return renderPara(b.text, i);
  });
}

// 画面には出さず、読み上げにだけ伝える文字（visually hidden）。
const srOnly = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 };
const relatedCardsStyle = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', margin: 'var(--space-2) 0' };
const relatedCardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-3) var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};
// 「読みたいに追加」は全幅の副ボタン（btnGhost・高さ 48）、Amazon は文字リンク（btnLink＋↗）。
// AI 選書の推薦カード（BookAdvisor の AdvisorStoreLinks）と同じ組み立て（2026-10-04 ui-critic）。
const relatedStoreLink = { ...btnLink, gap: 'var(--space-1)', textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box' };

function RelatedBookCard({ book, description, onAdd, isAdding }) {
  // 旧 isAdding は「処理中」(短時間で消える) だったが、新実装では
  // App.jsx の addedRelatedTitles state Set に永続化される「追加済み」
  // フラグになった。従って「✅ 追加済み」表示で disabled にする。
  const isAdded = !!isAdding;
  const amazonHref = getAmazonSearchLink(book.title, book.author);
  return (
    <div style={relatedCardStyle}>
      {/* 書名の頭に 📚 を付けない（DESIGN §3: 絵文字をアイコン代わりにしない・2026-10-04 ui-critic）。『 はぶら下げる。 */}
      <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.5, textIndent: '-0.5em', overflowWrap: 'anywhere' }}>
        『{book.title}』
        {/* 「— 著者」はひとまとまり（inline-block）で、入りきらなければ名前ごと次の行へ（大きな文字で名前の途中で割れていた・2026-10-04 ui-critic）。
            textIndent は書名のぶら下げ用なので打ち消す。 */}
        {/* 同じ行での間は書名の後ろの空白（{' '}）だけ。左の余白を付けると、折り返したとき行頭が 4 右にずれる（2026-10-04 ui-critic）。 */}
        {book.author && <>{' '}<span style={{ display: 'inline-block', textIndent: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontWeight: 400 }}>— {book.author}</span></>}
      </p>
      {description && (
        <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
          {description}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (typeof onAdd !== 'function') return;
            onAdd();
          }}
          disabled={isAdded}
          aria-label={isAdded ? `『${book.title}』は本棚にあります` : `『${book.title}』を読みたいに追加`}
          // 文字が最大でも「追／加」と割れず「読みたいに／追加」で折り返す（文節の <wbr>＋keep-all・2026-10-04 ui-critic）
          style={{ ...(isAdded ? btnGhostOff : btnGhost), touchAction: 'manipulation', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
        >
          {withPhraseBreaks(isAdded ? '追加済み' : '読みたいに追加')}
        </button>
        {/* 文字の左端をカードの本文にそろえる（btnLink の左右 4 を打ち消す）。 */}
        <div style={{ display: 'flex', marginLeft: 'calc(-1 * var(--space-1))' }}>
          <a
            href={amazonHref}
            target="_blank"
            rel={AMAZON_LINK_REL}
            aria-label={`Amazon で『${book.title}』を見る（外部リンク）`}
            onClick={(e) => { e.stopPropagation(); handleAmazonClick(e, amazonHref); }}
            style={{ ...relatedStoreLink, touchAction: 'manipulation' }}
          >
            Amazon<IcExternal size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}

// 節の分け方・関連書籍の見出し・画面に出す節の決まりは lib/markdownSections.js（App.jsx の畳みの出し分けと共通）。
export { hasVisibleSections };

// memo 化: 編集フォームの毎キーストローク（setForm → 親再レンダー）で、不変の
// text（AI 解析 / 計画シート）に対する数百要素の Markdown ツリー再構築を防ぐ。
// props はどれも参照安定（text=string / addingTitles=state の Set / handler=useCallback）。
// hideRelatedBooks: 書誌で確かめていない AI の出力（以前の AI 解析・以前の AI まとめ）では、本を挙げる節
//   （関連書籍・おすすめの本…）を出さない（実在を確かめていない書名を、本として見せない・2026-10-04）。
// 関連書籍の節は、本のカードが 1 枚も出ないなら見出しも Amazon の注記も出さない（2026-10-04 ui-critic・lib/markdownSections.js）。
// pendingRelated: 書いている途中・書誌で確かめている途中（読書計画シート）。関連書籍の節は、見出しと 2 行の骨組みだけを出す
//   （確かめる前の書名を小見出しのまま見せない・確かめ終わってカードになる／消える・2026-10-04 ui-critic）。
function MarkdownSections({ text, density = 'normal', flat = false, onAddRelatedBook, addingTitles, hideRelatedBooks = false, pendingRelated = false }) {
  const sections = useMemo(
    () => visibleSections(text, { relatedCards: !!onAddRelatedBook, hideRelatedBooks, pendingRelated }),
    [text, onAddRelatedBook, hideRelatedBooks, pendingRelated],
  );
  if (sections.length === 0) return null;

  // If the whole text has no `## ` headings, fall back to a single card.
  if (sections.length === 1 && !sections[0].heading) {
    return (
      <div style={flat ? flatSectionStyle : sectionStyle}>
        {renderLines(sections[0].lines)}
      </div>
    );
  }

  return (
    <div style={flat ? flatWrap : wrap}>
      {sections.map((s, i) => {
        const styles = flat ? flatSectionStyle : sectionStyle;
        const related = onAddRelatedBook && s.related;
        return (
          <section key={i} className={flat ? 'long-text md-section md-section--flat' : 'long-text md-section'} style={styles}>
            {s.heading && <h3 style={flat ? flatHeadingStyle : headingStyle}>{stripLeadingEmoji(s.heading)}</h3>}
            {pendingRelated && s.related ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                {/* 骨組みは見た目だけ。読み上げには「本を確かめています」と伝える（2026-10-04 ui-critic） */}
                <span role="status" style={srOnly}>本を確かめています</span>
                <SkeletonBlock width="70%" height={16} />
                <SkeletonBlock width="90%" height={14} />
              </div>
            ) : renderLines(s.lines, related ? { relatedBooks: true, onAddRelatedBook, addingTitles } : undefined)}
            {related && !pendingRelated && (
              // AI 選書の購入リンクの注記と同じ 13/--text-3（2026-10-04 ui-critic）
              <small style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, marginTop: 'var(--space-2)' }}>
                {AMAZON_DISCLOSURE_TEXT}
              </small>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default memo(MarkdownSections);
