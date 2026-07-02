// Renders AI output that uses `## <emoji> <heading>` lines as section breaks.
// Lightweight (no markdown library) — splits on `## ` boundaries and renders
// each section as a card with a styled heading + body.
//
// Lines starting with `### ` are treated as sub-headings inside a section.
// Other lines are rendered as `<p>` blocks. `**bold**` is rendered as <strong>.
// Lists (`- ` or `1. ` etc) are rendered as a styled <ul> / <ol>.

import { useMemo } from 'react';
import {
  getAmazonSearchLink,
  handleAmazonClick,
  AMAZON_DISCLOSURE_TEXT,
  AMAZON_LINK_REL,
} from '../lib/amazonLink';

// minWidth:0 が肝。flex column の子は既定 min-width:auto なので、中に幅広な
// 要素（Markdown 表など）があると縮まずページ全体を横にはみ出させる（横スクロール）。
const wrap = { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, minWidth: 0 };
const sectionStyle = {
  background: 'var(--c-card)',
  border: '1px solid #f0ebe1',
  borderRadius: 14,
  padding: '14px 16px',
  boxShadow: '0 1px 3px rgba(60, 48, 30, 0.05)',
  minWidth: 0,
  maxWidth: '100%',
};
const headingStyle = {
  fontSize: 15,
  fontWeight: 700,
  color: '#2e271c',
  margin: '0 0 9px',
  lineHeight: 1.4,
  letterSpacing: '-0.01em',
  overflowWrap: 'anywhere',
};
const subHeadingStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--c-ink)',
  margin: '10px 0 3px',
  overflowWrap: 'anywhere',
};
const paraStyle = {
  fontSize: 13,
  color: '#4a4036',
  lineHeight: 1.85,
  margin: '6px 0',
  whiteSpace: 'pre-wrap',
  // 長い英語タイトル/URL でカードが横にはみ出して「横幅が合わない」現象を防ぐ。
  overflowWrap: 'anywhere',
};
const listStyle = {
  fontSize: 13,
  color: '#4a4036',
  lineHeight: 1.8,
  margin: '8px 0 8px 2px',
  paddingLeft: 0,
  listStyleType: 'none',
  overflowWrap: 'anywhere',
};
const liStyle = { marginBottom: 6, display: 'flex', gap: 9, alignItems: 'flex-start' };
// 「ChatGPT 出力」っぽさを消すための上品な箇条書きマーカー（小さなアクセントの点）。
const bulletDot = { flexShrink: 0, width: 5, height: 5, borderRadius: '50%', background: '#b9a77f', marginTop: 8 };
const olNumStyle = { flexShrink: 0, minWidth: 16, color: '#8a7c5f', fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
// 見出し冒頭の絵文字（🏆🔑📚 …）を表示から外す。AI 出力の「素の markdown 感」を
// 払拭する最大のレバー。ハイライト判定は元テキスト(絵文字込み)で行うので装飾は保つ。
function stripLeadingEmoji(text) {
  if (typeof text !== 'string') return text;
  const stripped = text.replace(/^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{2122}\u{2139}\u{2194}-\u{2199}\u{231A}-\u{231B}\u{2934}-\u{2935}]+\s*)+/u, '').trim();
  return stripped || text;
}
const highlightSection = {
  ...sectionStyle,
  background: '#f5efde',
  borderColor: '#d4c089',
};

// Markdown 表のレンダリング。モバイル幅で 3 列が潰れないよう、横スクロール
// 可能なコンテナに収める。先頭行をヘッダーとして強調。
function renderTable(rows, key) {
  if (!rows || rows.length === 0) return null;
  const [head, ...body] = rows;
  return (
    <div key={key} style={{ overflowX: 'auto', maxWidth: '100%', margin: 'var(--space-2) 0', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, lineHeight: 1.6 }}>
        <thead>
          <tr>
            {head.map((c, j) => (
              <th
                key={j}
                style={{
                  textAlign: 'left',
                  padding: '6px 8px',
                  background: 'var(--c-soft)',
                  color: 'var(--c-brand)',
                  fontWeight: 700,
                  border: '1px solid #e0d7c6',
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
                    padding: '6px 8px',
                    color: '#4a4036',
                    border: '1px solid #e7ddcc',
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

// Some headings deserve emphasis. Match by emoji or keyword fragments.
function isHighlight(headingText) {
  return (
    /重点|👉|⭐|🌟|🏆|💎|🎯/.test(headingText) === false
      ? false
      : /(重点|TOP3|TOP 3|アクション|主要|投資の効果|投資対効果|投資戦略)/.test(headingText)
  );
}

function renderInline(text) {
  // Very small inline parser: **bold**
  const parts = [];
  let cursor = 0;
  const re = /\*\*([^*]+)\*\*/g;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) parts.push(text.slice(cursor, m.index));
    parts.push(<strong key={`b-${i}`} style={{ color: 'var(--c-ink)' }}>{m[1]}</strong>);
    cursor = m.index + m[0].length;
    i += 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
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
        out.push(<p key={i} style={paraStyle}>{renderInline(b.text)}</p>);
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
    return <p key={i} style={paraStyle}>{renderInline(b.text)}</p>;
  });
}

const relatedCardStyle = {
  background: '#fff',
  border: '1px solid #e0d0a8',
  borderRadius: 10,
  padding: '10px 12px',
  margin: '8px 0',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
// flex: 1 で 2 ボタンを均等幅、padding を抑えめに、whiteSpace: nowrap で
// 「Amazon で買 / う」のような縦割れを物理的に防ぐ。minHeight: 44 で
// iOS HIG のタップ領域を確保。textAlign: center と inline-flex の組合せで
// ラベルが必ず中央 1 行に収まる。
const relatedAddBtn = {
  flex: 1,
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: 999,
  border: '1px solid var(--c-hairline-strong)',
  background: 'var(--c-brand)',
  color: 'var(--c-card)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
};
const relatedAmazonBtn = {
  flex: 1,
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: 999,
  background: '#FF9900',
  color: '#000',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  fontFamily: 'inherit',
  minHeight: 44,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
};

function RelatedBookCard({ book, description, onAdd, isAdding }) {
  // 旧 isAdding は「処理中」(短時間で消える) だったが、新実装では
  // App.jsx の addedRelatedTitles state Set に永続化される「追加済み」
  // フラグになった。従って「✅ 追加済み」表示で disabled にする。
  const isAdded = !!isAdding;
  const amazonHref = getAmazonSearchLink(book.title, book.author);
  return (
    <div style={relatedCardStyle}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', margin: 0, lineHeight: 1.5 }}>
        📚 『{book.title}』
        {book.author && <span style={{ fontSize: 11, color: 'var(--c-ink-2)', fontWeight: 400 }}> — {book.author}</span>}
      </p>
      {description && (
        <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
          {description}
        </p>
      )}
      {/* flexWrap を撤去し常に横並び。狭幅でもラベル短縮 + nowrap で
          縦割れを防ぐ。touch-action: manipulation で iOS の 300ms 遅延も解消 */}
      <div style={{ display: 'flex', gap: 6 }}>
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
            background: isAdded ? '#E0E0E0' : relatedAddBtn.background,
            color: isAdded ? '#666' : relatedAddBtn.color,
            cursor: isAdded ? 'not-allowed' : 'pointer',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'rgba(92,74,46,0.18)',
            pointerEvents: 'auto',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {isAdded ? '✅ 追加済み' : '📚 読みたい'}
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
            WebkitTapHighlightColor: 'rgba(255,153,0,0.18)',
          }}
        >
          🛒 Amazon
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

export default function MarkdownSections({ text, density = 'normal', onAddRelatedBook, addingTitles }) {
  const sections = useMemo(() => parseSections(text), [text]);
  if (sections.length === 0) return null;

  // If the whole text has no `## ` headings, fall back to a single card.
  if (sections.length === 1 && !sections[0].heading) {
    return (
      <div style={sectionStyle}>
        {renderLines(sections[0].lines)}
      </div>
    );
  }

  return (
    <div style={wrap}>
      {sections.map((s, i) => {
        const styles = isHighlight(s.heading || '') ? highlightSection : sectionStyle;
        const related = onAddRelatedBook && isRelatedBooksHeading(s.heading);
        return (
          <section key={i} className="long-text" style={styles}>
            {s.heading && <h3 style={headingStyle}>{stripLeadingEmoji(s.heading)}</h3>}
            {renderLines(s.lines, related ? { relatedBooks: true, onAddRelatedBook, addingTitles } : undefined)}
            {related && (
              <small style={{ display: 'block', fontSize: 10, color: 'var(--c-ink-2)', lineHeight: 1.6, marginTop: 8 }}>
                {AMAZON_DISCLOSURE_TEXT}
              </small>
            )}
          </section>
        );
      })}
    </div>
  );
}
