// Renders AI output that uses `## <emoji> <heading>` lines as section breaks.
// Lightweight (no markdown library) — splits on `## ` boundaries and renders
// each section as a card with a styled heading + body.
//
// Lines starting with `### ` are treated as sub-headings inside a section.
// Other lines are rendered as `<p>` blocks. `**bold**` is rendered as <strong>.
// Lists (`- ` or `1. ` etc) are rendered as a styled <ul> / <ol>.

import { memo, useMemo } from 'react';
import {
  getAmazonSearchLink,
  handleAmazonClick,
  AMAZON_DISCLOSURE_TEXT,
  AMAZON_LINK_REL,
} from '../lib/amazonLink';
import { groupTitle } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';
import { PLAN_NO_TOC_LINE } from '../lib/prompts';

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
  // 文節の切れ目でだけ折り返す（BudouX の <wbr>＋keep-all。iOS の Safari は auto-phrase を知らない・2026-09-30）。
  wordBreak: 'keep-all',
};
// 読書計画シートの「目次が手に入らないため、章の名前は挙げていません。」は AI の本文ではなく注記として
// 13/--text-3 で見せる（文がそのままのときだけ・言い換えられていれば本文のまま・2026-10-02 ui-critic）。
const noteParaStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, margin: 'var(--space-2) 0', wordBreak: 'keep-all', overflowWrap: 'anywhere' };
function renderPara(text, key) {
  if (String(text || '').trim() === PLAN_NO_TOC_LINE) return <p key={key} style={noteParaStyle}>{withPhraseBreaks(PLAN_NO_TOC_LINE)}</p>;
  return <p key={key} style={paraStyle}>{renderInline(text)}</p>;
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
  wordBreak: 'keep-all',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};
const liStyle = { display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' };
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

function renderInline(text) {
  // Very small inline parser: **bold**
  const parts = [];
  let cursor = 0;
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  let i = 0;
  // 文は文節の切れ目に <wbr> を入れる（段落・箇条書きの keep-all と組で、語の途中で折り返さない・2026-09-30）。
  const phrased = (str, key) => <span key={key}>{withPhraseBreaks(str)}</span>;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(phrased(text.slice(cursor, m.index), `t-${i}`));
    parts.push(<strong key={`b-${i}`} style={{ color: 'var(--text)', fontWeight: 600 }}>{withPhraseBreaks(m[1])}</strong>);
    cursor = m.index + m[0].length;
    i += 1;
  }
  if (cursor < text.length) parts.push(phrased(text.slice(cursor), 'tail'));
  return parts.length ? parts : text;
}

// "### 1. 『title』- 著者" / "『title』 — 著者" / "『title』" all parse the
// same way: title in 『』 + an optional author suffix after - / – / — / ・.
const RELATED_BOOK_RE = /^\s*(?:\d+\.\s*)?『([^』]+)』(?:\s*[-–—・]\s*(.+))?\s*$/;
// 『』 なしのフォールバック: "### 1. タイトル - 著者" のような番号付き行を本として拾う。
// 番号プレフィックス必須にして、通常の文や見出しを誤って本扱いしないようにする。
const RELATED_BOOK_RE_PLAIN = /^\s*\d+\.\s*([^-–—・\n]{2,80}?)(?:\s*[-–—・]\s*(.+))?\s*$/;
function parseRelatedBookHeading(text) {
  const raw = text || '';
  let m = raw.match(RELATED_BOOK_RE);
  if (!m) m = raw.match(RELATED_BOOK_RE_PLAIN);
  if (!m) return null;
  const title = (m[1] || '').trim().replace(/^『|』$/g, '');
  const author = (m[2] || '').trim();
  if (!title) return null;
  return { title, author };
}

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
  // with an "📚 読みたいに追加" button. Following paragraphs (until the
  // next subhead) are absorbed as the description.
  if (opts?.relatedBooks && opts?.onAddRelatedBook) {
    const out = [];
    let pending = null; // { book, lines: [] }
    const flushPending = (key) => {
      if (!pending) return;
      // ★ pending は let で、この後 null / 別の本に再代入される。onAdd の
      //   アロー関数が外側の pending を参照すると、クリック時には pending が
      //   null になっていて `pending.book` で例外→「押しても本当に無反応」に
      //   なる。各カードごとに book / description をローカル const へ確定捕捉する。
      const book = pending.book;
      const description = pending.lines.join('\n').trim();
      out.push(
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
        if (parsed) {
          pending = { book: parsed, lines: [] };
        } else {
          out.push(<h4 key={i} style={subHeadingStyle}>{renderInline(stripLeadingEmoji(b.text))}</h4>);
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
        out.push(renderTable(b.rows, i));
      } else if (b.type === 'ul') {
        out.push(
          <ul key={i} style={listStyle}>
            {b.items.map((it, j) => (
              <li key={j} style={liStyle}>
                <span style={bulletDot} aria-hidden="true" />
                <span>{renderInline(it)}</span>
              </li>
            ))}
          </ul>,
        );
      } else if (b.type === 'ol') {
        out.push(
          <ol key={i} style={listStyle}>
            {b.items.map((it, j) => (
              <li key={j} style={liStyle}>
                <span style={olNumStyle} aria-hidden="true">{j + 1}.</span>
                <span>{renderInline(it)}</span>
              </li>
            ))}
          </ol>,
        );
      } else {
        out.push(renderPara(b.text, i));
      }
    });
    flushPending('end');
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
              <span>{renderInline(it)}</span>
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
              <span>{renderInline(it)}</span>
            </li>
          ))}
        </ol>
      );
    }
    return renderPara(b.text, i);
  });
}

const relatedCardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-3) var(--space-4)',
  margin: 'var(--space-2) 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};
// flex: 1 で 2 ボタンを均等幅、padding を抑えめに、whiteSpace: nowrap で
// 「Amazon で買 / う」のような縦割れを物理的に防ぐ。minHeight: 44 で
// iOS HIG のタップ領域を確保。textAlign: center と inline-flex の組合せで
// ラベルが必ず中央 1 行に収まる。
const relatedAddBtn = {
  flex: 1,
  minWidth: 0,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
};
const relatedAmazonBtn = {
  flex: 1,
  minWidth: 0,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  textDecoration: 'none',
  fontFamily: 'inherit',
  minHeight: 44,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
};

function RelatedBookCard({ book, description, onAdd, isAdding }) {
  // 旧 isAdding は「処理中」(短時間で消える) だったが、新実装では
  // App.jsx の addedRelatedTitles state Set に永続化される「追加済み」
  // フラグになった。従って「✅ 追加済み」表示で disabled にする。
  const isAdded = !!isAdding;
  const amazonHref = getAmazonSearchLink(book.title, book.author);
  return (
    <div style={relatedCardStyle}>
      <p style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
        📚 『{book.title}』
        {book.author && <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontWeight: 400 }}> — {book.author}</span>}
      </p>
      {description && (
        <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
          {description}
        </p>
      )}
      {/* flexWrap を撤去し常に横並び。狭幅でもラベル短縮 + nowrap で
          縦割れを防ぐ。touch-action: manipulation で iOS の 300ms 遅延も解消 */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (typeof onAdd !== 'function') return;
            onAdd();
          }}
          disabled={isAdded}
          aria-label={isAdded ? `『${book.title}』は本棚にあります` : `『${book.title}』を読みたいに追加`}
          style={{
            ...relatedAddBtn,
            background: isAdded ? 'var(--fill)' : relatedAddBtn.background,
            color: isAdded ? 'var(--text-3)' : relatedAddBtn.color,
            cursor: isAdded ? 'not-allowed' : 'pointer',
            touchAction: 'manipulation',
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {isAdded ? '追加済み' : '読みたいに追加'}
        </button>
        <a
          href={amazonHref}
          target="_blank"
          rel={AMAZON_LINK_REL}
          aria-label={`Amazon で『${book.title}』を購入（外部リンク）`}
          onClick={(e) => { e.stopPropagation(); handleAmazonClick(e, amazonHref); }}
          style={{
            ...relatedAmazonBtn,
            touchAction: 'manipulation',
          }}
        >
          Amazon
        </a>
      </div>
    </div>
  );
}

function parseSections(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const sections = [];
  const lines = text.split('\n');
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    if (/^## /.test(line)) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: line.replace(/^## /, '').trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.heading || current.lines.length) sections.push(current);
  return sections;
}

// Heading like "## 📚 関連書籍" / "おすすめの本" / "次に読む" → render
// each `### N. 『title』- author` as a clickable add card.
function isRelatedBooksHeading(heading) {
  if (!heading) return false;
  // AI の見出しは揺れる（おすすめ書籍 / 次に読むべき本 / あわせて読みたい 等）。
  // 取りこぼすと「追加」ボタンが出ず "押しても何も起きない" に見えるため広めに拾う。
  return /関連(書籍|本|する本|図書)|次に読む|次に読むべき|次の(一冊|本)|併読|あわせて読みたい|おすすめ(の本|書籍|図書|の一冊)|参考(書籍|図書|文献)|読むべき本/.test(heading);
}

// memo 化: 編集フォームの毎キーストローク（setForm → 親再レンダー）で、不変の
// text（AI 解析 / 計画シート）に対する数百要素の Markdown ツリー再構築を防ぐ。
// props はどれも参照安定（text=string / addingTitles=state の Set / handler=useCallback）。
function MarkdownSections({ text, density = 'normal', flat = false, onAddRelatedBook, addingTitles }) {
  const sections = useMemo(() => parseSections(text), [text]);
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
        const related = onAddRelatedBook && isRelatedBooksHeading(s.heading);
        return (
          <section key={i} className={flat ? 'long-text md-section md-section--flat' : 'long-text md-section'} style={styles}>
            {s.heading && <h3 style={flat ? flatHeadingStyle : headingStyle}>{stripLeadingEmoji(s.heading)}</h3>}
            {renderLines(s.lines, related ? { relatedBooks: true, onAddRelatedBook, addingTitles } : undefined)}
            {related && (
              <small style={{ display: 'block', fontSize: 'var(--text-caption)', color: 'var(--text-3)', lineHeight: 1.5, marginTop: 'var(--space-2)' }}>
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
