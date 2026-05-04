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
  AMAZON_DISCLOSURE_TEXT,
  AMAZON_LINK_REL,
} from '../lib/amazonLink';

const wrap = { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 };
const sectionStyle = {
  background: '#faf6f0',
  border: '1px solid #e4ddd0',
  borderRadius: 12,
  padding: '12px 14px',
};
const headingStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#5c5043',
  margin: '0 0 6px',
  lineHeight: 1.4,
};
const subHeadingStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#3d362c',
  margin: '8px 0 2px',
};
const paraStyle = {
  fontSize: 13,
  color: '#4a4036',
  lineHeight: 'var(--leading-relaxed)',
  letterSpacing: '0.02em',
  margin: 'var(--space-2) 0',
  whiteSpace: 'pre-wrap',
};
const listStyle = {
  fontSize: 13,
  color: '#4a4036',
  lineHeight: 'var(--leading-relaxed)',
  margin: 'var(--space-2) 0 var(--space-2) var(--space-5)',
  paddingLeft: 0,
};
const highlightSection = {
  ...sectionStyle,
  background: '#f5efde',
  borderColor: '#d4c089',
};

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
    parts.push(<strong key={`b-${i}`} style={{ color: '#3d362c' }}>{m[1]}</strong>);
    cursor = m.index + m[0].length;
    i += 1;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length ? parts : text;
}

// "### 1. 『title』- 著者" / "『title』 — 著者" / "『title』" all parse the
// same way: title in 『』 + an optional author suffix after - / – / — / ・.
const RELATED_BOOK_RE = /^\s*(?:\d+\.\s*)?『([^』]+)』(?:\s*[-–—・]\s*(.+))?\s*$/;
function parseRelatedBookHeading(text) {
  const m = (text || '').match(RELATED_BOOK_RE);
  if (!m) return null;
  const title = (m[1] || '').trim();
  const author = (m[2] || '').trim();
  if (!title) return null;
  return { title, author };
}

function renderLines(lines, opts) {
  // Group consecutive list items into a single <ul> / <ol>.
  const blocks = [];
  let listBuf = null; // { type: 'ul' | 'ol', items: [] }
  const flushList = () => {
    if (!listBuf) return;
    blocks.push(listBuf);
    listBuf = null;
  };
  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      return;
    }
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

  // For 関連書籍 sections: each `### N. 『title』- 著者` becomes a card
  // with an "📚 読みたいに追加" button. Following paragraphs (until the
  // next subhead) are absorbed as the description.
  if (opts?.relatedBooks && opts?.onAddRelatedBook) {
    const out = [];
    let pending = null; // { book, lines: [] }
    const flushPending = (key) => {
      if (!pending) return;
      out.push(
        <RelatedBookCard
          key={`rel-${key}`}
          book={pending.book}
          description={pending.lines.join('\n').trim()}
          onAdd={() => opts.onAddRelatedBook(pending.book)}
          isAdding={opts.addingTitles?.has(pending.book.title)}
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
          out.push(<h4 key={i} style={subHeadingStyle}>{renderInline(b.text)}</h4>);
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
      if (b.type === 'ul') {
        out.push(
          <ul key={i} style={listStyle}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
            ))}
          </ul>,
        );
      } else if (b.type === 'ol') {
        out.push(
          <ol key={i} style={listStyle}>
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it)}</li>
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
    if (b.type === 'subhead') return <h4 key={i} style={subHeadingStyle}>{renderInline(b.text)}</h4>;
    if (b.type === 'ul') {
      return (
        <ul key={i} style={listStyle}>
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    }
    if (b.type === 'ol') {
      return (
        <ol key={i} style={listStyle}>
          {b.items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
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
  border: '1px solid #d4ccbe',
  background: '#5c5043',
  color: '#faf6f0',
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
      <p style={{ fontSize: 13, fontWeight: 600, color: '#3d362c', margin: 0, lineHeight: 1.5 }}>
        📚 『{book.title}』
        {book.author && <span style={{ fontSize: 11, color: '#8a7e6b', fontWeight: 400 }}> — {book.author}</span>}
      </p>
      {description && (
        <p style={{ fontSize: 12, color: '#5c5548', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
          {description}
        </p>
      )}
      {/* flexWrap を撤去し常に横並び。狭幅でもラベル短縮 + nowrap で
          縦割れを防ぐ。touch-action: manipulation で iOS の 300ms 遅延も解消 */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
          disabled={isAdded}
          aria-label={isAdded ? `『${book.title}』は本棚にあります` : `『${book.title}』を読みたいに追加`}
          style={{
            ...relatedAddBtn,
            background: isAdded ? '#E0E0E0' : relatedAddBtn.background,
            color: isAdded ? '#666' : relatedAddBtn.color,
            cursor: isAdded ? 'not-allowed' : 'pointer',
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'rgba(92,74,46,0.18)',
          }}
        >
          {isAdded ? '✅ 追加済み' : '📚 読みたい'}
        </button>
        <a
          href={amazonHref}
          target="_blank"
          rel={AMAZON_LINK_REL}
          aria-label={`Amazon で『${book.title}』を購入（外部リンク）`}
          onClick={(e) => e.stopPropagation()}
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
  return /関連書籍|次に読む|併読|おすすめの本|参考書籍/.test(heading);
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
            {s.heading && <h3 style={headingStyle}>{s.heading}</h3>}
            {renderLines(s.lines, related ? { relatedBooks: true, onAddRelatedBook, addingTitles } : undefined)}
            {related && (
              <small style={{ display: 'block', fontSize: 10, color: '#a89e8c', lineHeight: 1.6, marginTop: 8 }}>
                {AMAZON_DISCLOSURE_TEXT}
              </small>
            )}
          </section>
        );
      })}
    </div>
  );
}
