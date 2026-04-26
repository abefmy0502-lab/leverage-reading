// Renders AI output that uses `## <emoji> <heading>` lines as section breaks.
// Lightweight (no markdown library) — splits on `## ` boundaries and renders
// each section as a card with a styled heading + body.
//
// Lines starting with `### ` are treated as sub-headings inside a section.
// Other lines are rendered as `<p>` blocks. `**bold**` is rendered as <strong>.
// Lists (`- ` or `1. ` etc) are rendered as a styled <ul> / <ol>.

import { useMemo } from 'react';

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
  lineHeight: 1.8,
  margin: '4px 0',
  whiteSpace: 'pre-wrap',
};
const listStyle = {
  fontSize: 13,
  color: '#4a4036',
  lineHeight: 1.8,
  margin: '4px 0 4px 18px',
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
      : /(重点|TOP3|TOP 3|アクション|主要|ROI 評価|投資戦略)/.test(headingText)
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

function renderLines(lines) {
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

export default function MarkdownSections({ text, density = 'normal' }) {
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
        return (
          <section key={i} style={styles}>
            {s.heading && <h3 style={headingStyle}>{s.heading}</h3>}
            {renderLines(s.lines)}
          </section>
        );
      })}
    </div>
  );
}
