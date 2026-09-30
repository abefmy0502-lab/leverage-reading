// 💬 メモが答える相談（2026-10-01・SPEC §3「メモが答える相談」・DESIGN §5）。
// 無料プランで今月のトークンを使い切ったあとの相談に、AI を使わずに自分のメモの一節で答える（lib/memoAnswer.js）。
// AI のふりをしない: 相手は「あなたのメモ」（--fill の丸にノート）・著者の名前や語り口は使わない・AI の注記も付けない。
// 行はすべての本の検索のメモの行（LibrarySearchHit の inline）と同じ組み立て。押すとその本のそのメモを開く。
import { Lightbulb, ChevronRight } from 'lucide-react';
import LibrarySearchHit, { hitLabel, SnippetText } from './LibrarySearchHit';
import { PartnerRow } from './PartnerAvatar';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { btnLink } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

export const MEMO_PARTNER = { kind: 'self', icon: 'memo', label: 'あなたのメモ', books: [] };
export const MEMO_ANSWER_HEAD = 'あなたのメモから、関係しそうな一節です';
export const MEMO_ANSWER_EMPTY = 'まだ、この悩みに近いメモがありません';

const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const meta = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 };
// 書名の列（表紙 44＋間 12）にそろえる。
const COL = 'calc(44px + var(--space-3))';
const rowBtn = {
  display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', color: 'var(--text)',
  background: 'none', border: 'none', borderTop: '1px solid var(--separator)', borderRadius: 0, padding: 'var(--space-3) 0',
};
const snippet = {
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere',
};

// 同じ本の 2 件目（本の行は繰り返さず、ページと一節だけを書名の列にそろえて）。
function MoreHit({ hit, onClick }) {
  const label = hitLabel(hit);
  return (
    <button type="button" onClick={onClick} style={{ ...rowBtn, paddingLeft: COL }}>
      {label && <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>{label}</span>}
      <span style={snippet}><SnippetText segments={hit.segments} /></span>
    </button>
  );
}

// 自分の学び（本に結びつかないメモ）の行。表紙の場所に --fill の角丸に電球（相談相手のアイコンの「自分の学び」と同じ印）。
function LearningHit({ hit, onClick, first }) {
  const label = hitLabel(hit);
  return (
    <button type="button" onClick={onClick} style={rowBtn} aria-label={`自分の学び ${label}`}>
      {first && (
        <span style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text-2)' }}>
            <Lightbulb size={22} strokeWidth={1.75} />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', fontWeight: 600 }}>自分の学び</span>
          <ChevronRight size={18} strokeWidth={1.75} color="var(--text-3)" aria-hidden="true" />
        </span>
      )}
      <span style={{ display: 'block', marginTop: first ? 'var(--space-2)' : 0, paddingLeft: COL }}>
        {label && <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>{label}</span>}
        <span style={snippet}><SnippetText segments={hit.segments} /></span>
      </span>
    </button>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-label="メモの中を探しています" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <SkeletonBlock width="72%" height={14} />
      {[0, 1].map((i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--separator)' }}>
          <SkeletonBlock width={44} height={62} radius={4} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <SkeletonBlock width="55%" height={14} />
            <SkeletonBlock width="92%" height={12} />
            <SkeletonBlock width="70%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

// message.memoAnswer: { status: 'loading' | 'ready' | 'error', groups, searched }
// onOpen(book, memoId) / onOpenLearning() / onRetry() / onPlan()（有料プランの画面）/ showPlan: プランの一行を出すか（会話で 1 回だけ）
// 見つからないとき（AI の「関係するメモが無かった答え」と同じ並び・2026-10-01 ui-critic）:
//   onAddMemo: メモが 0 件の人だけ「これまで読んだ本からメモを足す」（初日クイックスタート）／ほかの人は onAddBook「本を追加」
//   onWriteLearning: 「学びを書く」
export default function MemoAnswer({ message, onOpen, onOpenLearning, onRetry, onPlan, showPlan = false, onAddMemo = null, onAddBook = null, onWriteLearning = null, column = 0 }) {
  const a = message.memoAnswer || { status: 'loading' };
  if (a.status === 'error') {
    return (
      <div style={{ marginLeft: column }}>
        <ErrorMessage
          title="メモを読み込めませんでした"
          description="通信の状態を確かめてください。"
          actions={onRetry ? [{ label: 'もう一度', onClick: onRetry }] : []}
        />
      </div>
    );
  }
  const groups = a.groups || [];
  const found = a.status === 'ready' && groups.length > 0;
  return (
    <div role="article" aria-label="メモからの答え" aria-busy={a.status === 'loading' || undefined}>
      <PartnerRow partner={MEMO_PARTNER}>
        <div style={card}>
          {a.status === 'loading' ? <Skeleton /> : found ? (
            <>
              <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(MEMO_ANSWER_HEAD)}</p>
              <div role="list" aria-label="関係しそうなメモ" style={{ marginTop: 'var(--space-3)' }}>
                {groups.map((g) => (
                  <div role="listitem" key={g.bookId ?? 'self'}>
                    {g.book
                      ? g.hits.map((h, i) => (i === 0
                        ? <LibrarySearchHit key={`${h.kind}-${h.memoId ?? h.label}`} inline showStatus={false} showRating={false} result={{ book: g.book, hit: h }} onOpen={onOpen} />
                        : <MoreHit key={`${h.kind}-${h.memoId ?? h.label}`} hit={h} onClick={() => onOpen?.(g.book, h.kind === 'memo' ? h.memoId : undefined)} />))
                      : g.hits.map((h, i) => <LearningHit key={h.memoId ?? i} hit={h} first={i === 0} onClick={onOpenLearning} />)}
                  </div>
                ))}
              </div>
              {/* 積み重ねが効いていることを事実で（メモが増えるほど見つかる）。 */}
              <p style={{ ...meta, marginTop: 'var(--space-3)' }}>メモ {a.searched} 件から探しました</p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(MEMO_ANSWER_EMPTY)}</p>
              <p style={{ ...meta, marginTop: 'var(--space-1)' }}>メモ {a.searched || 0} 件から探しました</p>
              {(onAddMemo || onAddBook || onWriteLearning) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-4)', marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }}>
                  {onAddMemo
                    ? <button type="button" onClick={onAddMemo} style={btnLink}>これまで読んだ本からメモを足す</button>
                    : onAddBook && <button type="button" onClick={onAddBook} style={btnLink}>本を追加</button>}
                  {onWriteLearning && <button type="button" onClick={onWriteLearning} style={btnLink}>学びを書く</button>}
                </div>
              )}
            </>
          )}
        </div>
      </PartnerRow>
      {/* プランの案内は文字ボタン 1 つだけを静かに 1 回（説明の文は置かない＝DESIGN 原則 6・2026-10-01 ui-critic）。
          押すと有料プランの画面（無料のトークンを使い切ったとき＝GLOSSARY の ①）。 */}
      {showPlan && found && (
        <div style={{ marginLeft: column, marginTop: 'var(--space-1)' }}>
          <button type="button" onClick={onPlan} style={{ ...btnLink, marginLeft: 'calc(-1 * var(--space-1))' }}>AI に答えてもらう（プラン）</button>
        </div>
      )}
    </div>
  );
}
