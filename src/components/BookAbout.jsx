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

// 画面に出す文: 文節の切れ目でだけ折り返す（BudouX の <wbr>＋keep-all）うえで、
//   - 数と、後ろの助数詞（「3つ」「100年」）の間
//   - 数の前の決まった字（第・約・対・全・各・計・毎＝「第1章」「約3割」「1対1」）と数の間
//     （どの字の後ろでも結ぶと「、1対1の」のような長い塊ができ、行の後ろが空いていた・2026-10-02 ui-critic）
//   - カタカナの中黒（「リ・クリエーション」）の前後
// には見えない結合文字（U+2060）を入れて、語の途中で折れないようにする（2026-10-02 ui-critic）。
const WJ = '\u2060';
export function glueForDisplay(text) {
  return String(text ?? '')
    .replace(/(\d)(?=[^\x00-\x7F\s])/g, `$1${WJ}`)
    .replace(/([第約対全各計毎])(?=\d)/g, `$1${WJ}`)
    .replace(/([ァ-ヺー])・(?=[ァ-ヺー])/g, `$1${WJ}・${WJ}`);
}
// 結合文字の隣に BudouX が置いた <wbr> は外す（<wbr> は折り返してよい印なので、結合文字より強い）。
const readable = (text) => {
  const parts = withPhraseBreaks(glueForDisplay(text));
  if (!Array.isArray(parts)) return parts;
  return parts.filter((p, i) => {
    if (typeof p === 'string') return true;
    const prev = parts[i - 1];
    const next = parts[i + 1];
    return !((typeof prev === 'string' && prev.endsWith(WJ)) || (typeof next === 'string' && next.startsWith(WJ)));
  });
};

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
  display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
  fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5,
  overflowWrap: 'anywhere', wordBreak: 'keep-all',
};
// 折り返した 2 行目を 1 字下げる（次の項目の頭と見分ける）。
const tocItemStyle = { paddingLeft: '1em', textIndent: '-1em' };
const tocSummary = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)',
  minHeight: 48, fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none',
};

// flush: 下の余白を持たない（畳む見出しの中＝外側の下 16 だけにする。カードの目次の畳みは下 12 を持つ）。
function TocList({ toc, note, flush = false }) {
  return (
    <>
      <ol style={{ ...tocListStyle, ...(flush ? { paddingBottom: 0 } : null) }}>
        {toc.map((line, i) => <li key={i} style={tocItemStyle}>{readable(line)}</li>)}
      </ol>
      {note && <p style={{ ...metaStyle, margin: flush ? 'var(--space-2) 0 0' : '0 0 var(--space-3)' }}>{note}</p>}
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
      {/* 3 行で切っている間は 1 つのまとまり。開いたとき・畳む見出しの中は、改行ごとに段落にして間を 16 空ける。 */}
      {clamped ? (
        <p ref={ref} style={{ ...descStyle, ...clamp3 }}>{readable(text)}</p>
      ) : (
        <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {String(text || '').split(/\n+/).map((t) => t.trim()).filter(Boolean).map((t, i) => (
            <p key={i} style={{ ...descStyle, whiteSpace: 'normal' }}>{readable(t)}</p>
          ))}
        </div>
      )}
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

/**
 * 読み込み中の骨組み。目次の無いカード（見出し＋紹介文 3 行＋「続きを読む」の行＋添え書きの行）と同じ高さ
 * （約 208）。目次のある本は、読み込み後に目次の行（48＋12）のぶんだけ伸びる（はじめて開いたときだけ・2 回目からは控えから即座に）。
 */
export function BookAboutSkeleton({ style }) {
  const line = { height: 'calc(var(--text-read) * 1.6)', display: 'flex', alignItems: 'center' };
  return (
    <section aria-busy="true" aria-label="この本について（読み込み中）" style={{ ...cardStyle, ...style }}>
      <p style={groupTitle}>この本について</p>
      <div style={{ marginTop: 'var(--space-2)' }} aria-hidden="true">
        <div style={line}><SkeletonBlock width="94%" height={14} radius="var(--radius-full)" /></div>
        <div style={line}><SkeletonBlock width="86%" height={14} radius="var(--radius-full)" /></div>
        <div style={line}><SkeletonBlock width="58%" height={14} radius="var(--radius-full)" /></div>
        {/* 「続きを読む」の行（高さ 44・下の余り 8 を詰めるのも本物と同じ） */}
        <div style={{ height: 44, display: 'flex', alignItems: 'center', marginBottom: 'calc(-1 * var(--space-2))' }}>
          <SkeletonBlock width={72} height={14} radius="var(--radius-full)" />
        </div>
        {/* 添え書きの行（13・行間 1.5） */}
        <div style={{ height: 'calc(var(--text-meta) * 1.5)', marginTop: 'var(--space-2)', display: 'flex', alignItems: 'center' }}>
          <SkeletonBlock width="62%" height={12} radius="var(--radius-full)" />
        </div>
      </div>
    </section>
  );
}

/**
 * 畳む見出しの読み込み中: 同じ形の行（押せない div・見出し 17/600・右に中身の一覧の場所の骨組み 64×12）。
 * 読み込んで紹介も目次も無ければ消える（はじめて開いたときだけ・2 回目からは端末の控えから即座に）。
 */
export function BookAboutFoldSkeleton({ style }) {
  return (
    // 本物と同じ 2 段（外側＝枠の foldStyle・内側＝48 の行の foldSummary）にして、高さを本物とそろえる。
    <div role="status" aria-busy="true" style={{ ...foldStyle, ...style }}>
      <div style={{ ...foldSummary, cursor: 'default' }}>
        この本について
        <SkeletonBlock width={64} height={12} radius="var(--radius-full)" style={{ marginRight: 'var(--space-1)' }} />
      </div>
    </div>
  );
}

// briefSlot: 「この本で学べること」（BookBrief.jsx・2026-10-08）。紹介文・添え書きの下、目次の上に置く。
export default function BookAbout({ info, loading = false, variant = 'card', style, briefSlot = null }) {
  if (variant === 'card' && loading) return <BookAboutSkeleton style={style} />;
  if (variant === 'fold' && loading) return <BookAboutFoldSkeleton style={style} />;
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
          {briefSlot}
          {toc.length > 0 && (
            <div>
              <p style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>目次</p>
              <TocList toc={toc} note={info.description ? tocNote : meta} flush />
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
      {briefSlot}
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
