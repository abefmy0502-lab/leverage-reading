// 📖 本の詳細の「この本について」（2026-10-02・SPEC §2）。
//
// 出版社・書店が公開している紹介文と目次（lib/bookInfo.js ← /api/cover?info=1）をそのまま見せる。
// AI は使わない（無料プランも同じ）。どこの文かを小さく添える（出版社の内容紹介／楽天ブックスの商品説明）。
// 見つからない本では何も出さない（作らない・空の案内も置かない）。
//
//   variant="card"（読みたい・積読）: カード 1 枚。紹介文は 3 行＋「続きを読む」、目次は畳む。読み込み中は同じ形の骨組み。
//   variant="fold"（読書中）: 畳む見出し「この本について」1 つ（メモが主役なので、下の読書計画の近くに畳んで置く）。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { groupTitle, btnLink } from '../styles/ui';
import { SkeletonBlock } from './Skeleton';
import { withPhraseBreaks } from './TightBubble';
import { BOOK_INFO_SOURCE_LABELS, bookInfoMetaLine, hasBookInfo } from '../lib/bookInfo';

// サーバーで描く（テスト）ときの警告を出さない。
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
};
// DESIGN §5「畳む見出し」（App.jsx の detailsStyle / summaryStyle と同じ形）。
const foldStyle = { ...cardStyle, padding: '0 var(--space-4)' };
const foldSummary = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)',
  minHeight: 48, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none',
};
// 紹介文＝読む文章（明朝 18・行間 1.6・文節で折り返す・DESIGN §2）。
const descStyle = {
  fontFamily: 'var(--font-read)',
  fontSize: 'var(--text-read)',
  lineHeight: 1.6,
  color: 'var(--text)',
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  wordBreak: 'keep-all',
};
const clamp3 = { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const metaStyle = { fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 'var(--space-2) 0 0', lineHeight: 1.5 };
const tocListStyle = {
  listStyle: 'none', margin: 0, padding: '0 0 var(--space-3)',
  display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
  fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5,
  overflowWrap: 'anywhere', wordBreak: 'keep-all',
};
const tocSummary = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)',
  minHeight: 48, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none',
};

function TocList({ toc, note }) {
  return (
    <>
      <ol style={tocListStyle}>
        {toc.map((line, i) => <li key={i}>{withPhraseBreaks(line)}</li>)}
      </ol>
      {note && <p style={{ ...metaStyle, margin: '0 0 var(--space-3)' }}>{note}</p>}
    </>
  );
}

// 紹介文（3 行で切って「続きを読む」）。全文が 3 行に収まるときはボタンを出さない。
function Description({ text, clamp }) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useIsoLayoutEffect(() => {
    if (!clamp || expanded) return;
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 2);
  }, [text, clamp, expanded]);
  const clamped = clamp && !expanded;
  return (
    <>
      <p ref={ref} style={{ ...descStyle, ...(clamped ? clamp3 : null) }}>{withPhraseBreaks(text)}</p>
      {clamp && (overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          // 文字の端を本文の左端にそろえる（btnLink の左右 4 を打ち消す）。
          style={{ ...btnLink, marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-2))' }}
        >
          {expanded ? '閉じる' : '続きを読む'}
        </button>
      )}
    </>
  );
}

/** 読み込み中の骨組み（見出し＋紹介文 3 行・本物と同じ高さ）。 */
export function BookAboutSkeleton({ style }) {
  const line = { height: 'calc(var(--text-read) * 1.6)', display: 'flex', alignItems: 'center' };
  return (
    <section aria-busy="true" aria-label="この本について（読み込み中）" style={{ ...cardStyle, ...style }}>
      <p style={groupTitle}>この本について</p>
      <div style={{ marginTop: 'var(--space-2)' }} aria-hidden="true">
        <div style={line}><SkeletonBlock width="94%" height={14} radius="var(--radius-full)" /></div>
        <div style={line}><SkeletonBlock width="86%" height={14} radius="var(--radius-full)" /></div>
        <div style={line}><SkeletonBlock width="58%" height={14} radius="var(--radius-full)" /></div>
      </div>
    </section>
  );
}

export default function BookAbout({ info, loading = false, variant = 'card', style }) {
  if (variant === 'card' && loading) return <BookAboutSkeleton style={style} />;
  if (!hasBookInfo(info)) return null;
  const toc = info.toc || [];
  const meta = bookInfoMetaLine(info);
  // 目次が紹介文と別の取得元なら、目次の下にその名前を添える。
  const tocNote = toc.length && info.description && info.tocSource && info.tocSource !== info.source
    ? `目次は${BOOK_INFO_SOURCE_LABELS[info.tocSource]}より` : '';

  if (variant === 'fold') {
    const parts = [info.description && '紹介', toc.length && '目次'].filter(Boolean).join('・');
    return (
      <details style={{ ...foldStyle, ...style }}>
        <summary style={foldSummary}>
          この本について
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
            <span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)' }}>{parts}</span>
            <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </span>
        </summary>
        <div style={{ paddingBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {info.description && (
            <div>
              <Description text={info.description} clamp={false} />
              {meta && <p style={metaStyle}>{meta}</p>}
            </div>
          )}
          {toc.length > 0 && (
            <div>
              <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>目次</p>
              <TocList toc={toc} note={info.description ? tocNote : meta} />
            </div>
          )}
        </div>
      </details>
    );
  }

  return (
    <section aria-labelledby="book-about-title" style={{ ...cardStyle, ...(toc.length ? { paddingBottom: 0 } : null), ...style }}>
      <h2 id="book-about-title" style={groupTitle}>この本について</h2>
      {info.description && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Description text={info.description} clamp />
          {meta && <p style={metaStyle}>{meta}</p>}
        </div>
      )}
      {!info.description && meta && <p style={metaStyle}>{meta}</p>}
      {toc.length > 0 && (
        <details style={{ marginTop: 'var(--space-3)', borderTop: '1px solid var(--separator)' }}>
          <summary style={tocSummary}>
            目次
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{toc.length} 項目</span>
              <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </span>
          </summary>
          <TocList toc={toc} note={tocNote} />
        </details>
      )}
    </section>
  );
}
