// 🔎 すべての本の検索で、メモ（この本のまとめ・読書準備）の言葉から見つかった本の行（2026-09-30）。
// 本の行（表紙 44・書名・状態 · 著者）の下に、いちばん合うメモの一節（約 40 字・見つかった言葉に印）。
// 行ぜんぶが 1 つのボタン: 押すとその本を開き、カード式のメモならそのメモまで送って少し示す。
import { memo } from 'react';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { MiniCover, StatusLabel } from './BookCards';
import { btnLink, groupTitle } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

// 見つかった言葉の印（DESIGN §5「検索の一致の印」）: 選択中と同じ淡い面＋太さ 600（色だけに頼らない）。
const markStyle = {
  background: 'var(--accent-soft)',
  color: 'var(--text)',
  fontWeight: 600,
  padding: 0,
  borderRadius: 0,
};

export function hitLabel(hit) {
  if (!hit) return '';
  if (hit.kind === 'memo') return Number.isFinite(hit.page) ? `p.${hit.page}` : 'メモ';
  return hit.label || '';
}

// 文節の切れ目でだけ折り返す（BudouX の <wbr>＋keep-all・DESIGN §5）。印と地の文の境目でも折り返せる。
export function SnippetText({ segments }) {
  return (
    <>
      {(segments || []).map((s, i) => (
        <span key={i}>
          {i > 0 && <wbr />}
          {s.match ? <mark style={markStyle}>{s.text}</mark> : withPhraseBreaks(s.text)}
        </span>
      ))}
    </>
  );
}

const LibrarySearchHit = memo(function LibrarySearchHit({ result, onOpen, onAutoRetry, showStatus = true }) {
  const { book, hit } = result;
  const label = hitLabel(hit);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(book, hit?.kind === 'memo' ? hit.memoId : undefined)}
      style={{
        display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
        background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)',
        padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', color: 'var(--text)',
      }}
    >
      {/* 上の行は、すべての本のリストの行（SwipeableBookCard）と同じ組み立て。 */}
      <span style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <MiniCover book={book} width={44} onAutoRetry={onAutoRetry} />
        <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
          <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)', minWidth: 0 }}>
            {showStatus && <StatusLabel status={book.status} />}
            {book.author && showStatus && <span aria-hidden="true" style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', flexShrink: 0 }}>·</span>}
            {book.author && <span style={{ flex: 1, fontSize: 'var(--text-meta)', color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</span>}
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={1.75} color="var(--text-3)" aria-hidden="true" />
      </span>
      {hit && (
        // 一節は書名の列（表紙 44＋間 12）にそろえる。ページ・欄の名前は 13/--text-3、一節は読む文章（明朝）で 2 行まで。
        <span style={{ display: 'block', marginTop: 'var(--space-2)', paddingLeft: 'calc(44px + var(--space-3))' }}>
          {(label || hit.tag) && (
            <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
              {label}
              {/* メモのタグだけで見つかったときは、そのタグに印（本文に言葉が無くても理由が分かる・2026-09-30） */}
              {hit.tag && <>{label ? ' · ' : ''}<mark style={{ ...markStyle, color: 'var(--text-2)' }}>#{hit.tag}</mark></>}
            </span>
          )}
          <span
            style={{
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)',
              wordBreak: 'keep-all', overflowWrap: 'anywhere',
            }}
          >
            <SnippetText segments={hit.segments} />
          </span>
        </span>
      )}
    </button>
  );
});

export default LibrarySearchHit;

// 検索の結果の一覧。書名・著者・タグで見つかった本 → メモなどで見つかった本 の 2 つのまとまり
// （見出しは、両方があるとき・メモで見つかった本があるときだけ）。いちばん下に文字ボタン「相談で探す」。
// renderBookRow: 一節の無い本の行（すべての本のリストと同じ行＝スワイプ・長押しつき）を描く関数。
export function LibrarySearchResults({ books, hits, renderBookRow, onOpen, onAutoRetry, showStatus, memoStatus, onRetry, onConsult }) {
  const meta = books.filter((b) => hits.get(b.id)?.meta);
  const fromMemo = books.filter((b) => !hits.get(b.id)?.meta);
  const row = (b, i) => {
    const r = hits.get(b.id);
    return r?.hit
      ? <LibrarySearchHit key={b.id} result={r} onOpen={onOpen} onAutoRetry={onAutoRetry} showStatus={showStatus} />
      : renderBookRow(b, i);
  };
  const group = (title, list, offset) => (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} aria-label={title || undefined}>
      {title && <h2 style={groupTitle}>{title}</h2>}
      {list.map((b, i) => row(b, offset + i))}
    </section>
  );
  const showHeads = fromMemo.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {meta.length > 0 && group(showHeads ? '書名・著者・タグ' : null, meta, 0)}
      {fromMemo.length > 0 && group('メモから', fromMemo, meta.length)}
      {(memoStatus === 'loading' || memoStatus === 'error' || onConsult) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)', marginTop: 'calc(-1 * var(--space-3))' }}>
          {/* メモを読んでいる間・読めなかったとき（書名・著者で見つかった本は先に出す）。 */}
          {memoStatus === 'loading' && <p role="status" style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>メモの中を探しています…</p>}
          {memoStatus === 'error' && (
            <p role="status" style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              メモの中は探せませんでした
              <button type="button" onClick={onRetry} style={{ ...btnLink, minHeight: 44 }}>もう一度</button>
            </p>
          )}
          {onConsult && <ConsultSearchLink onClick={onConsult} />}
        </div>
      )}
    </div>
  );
}

// 「相談で探す」（相談を開いて入力欄に問いを入れるだけ・送らない＝トークンは送ったときだけ）。
export function ConsultSearchLink({ onClick, center = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', marginLeft: center ? 0 : 'calc(-1 * var(--space-1))', alignSelf: center ? 'center' : 'flex-start' }}
    >
      <MessageCircle size={18} aria-hidden="true" />
      相談で探す
    </button>
  );
}
