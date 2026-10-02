// 🏷 タグの提案（2026-10-02・SPEC §2・DESIGN §5「タグの提案」）。
// メモを保存したあと、本の詳細のメモの一覧の上に 1 枚。自分がもう使っているタグから、合いそうなものを 1〜3 個。
// 押すと付く（チップが選んだ形に変わる）・もう一度押すと外す。勝手には付けない。× で閉じる（次に保存するまで出さない）。
// 見た目はつながるメモ（MemoLinks の 'saved'）と同じカード: 面 --surface・線 --separator・角 12・見出し 13/--text-2・右上に × 44。
// チップは書く画面のタグ（QuickMemoSheet）と同じ: 付ける前は「＋ タグ」、付けたら「タグ ×」。
import { Loader2, Plus, Tag, X } from 'lucide-react';
import { Chip } from './formPrimitives';
import { withPhraseBreaks } from './TightBubble';

export const TAG_SUGGEST_TITLE = 'いま書いたメモに合いそうなタグ';

// 見出しの 1 行の高さ（13 × 1.5）。
const HEAD_LINE = 'calc(var(--text-meta) * 1.5)';
const closeBtn = {
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: 'none', border: 'none', borderRadius: 999, padding: 0, cursor: 'pointer', color: 'var(--text-3)',
};

// 保存中のチップの小さな回る印（Spinner.jsx と同じ keyframes・動きを減らす設定では index.css の全体の指定で止まる）。
const SPIN_ID = '__leverage-spinner-keyframes';
function ensureSpin() {
  if (typeof document === 'undefined' || document.getElementById(SPIN_ID)) return;
  const style = document.createElement('style');
  style.id = SPIN_ID;
  style.textContent = '@keyframes leverage-spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(style);
}

// suggestions: [{ tag }] / applied: そのメモにいま付いているタグ（押したらすぐ変わる・楽観的）/ busyTag: 保存中のタグ
export default function TagSuggest({ suggestions, applied = [], busyTag = null, onToggle, onDismiss = null, style = null }) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;
  ensureSpin();
  const titleId = 'tag-suggest-title';
  return (
    <section
      aria-labelledby={titleId}
      className="list-item-enter"
      style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: '0 var(--space-4) var(--space-3)', ...style }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', marginRight: 'calc(-1 * var(--space-3))' }}>
        <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: HEAD_LINE, flexShrink: 0, color: 'var(--text-2)' }}>
          <Tag size={16} />
        </span>
        <h3 id={titleId} style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {withPhraseBreaks(TAG_SUGGEST_TITLE)}
        </h3>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="タグの提案を閉じる" style={{ ...closeBtn, marginTop: `calc((${HEAD_LINE} - 44px) / 2)` }}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
      {/* 見出しの行（× の押せる範囲 44）の下に詰めて並べる。チップ同士は 8（DESIGN §5）。 */}
      <div role="group" aria-labelledby={titleId} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'calc(-1 * var(--space-2))' }}>
        {suggestions.map(({ tag }) => {
          const on = applied.includes(tag);
          const busy = busyTag === tag;
          return (
            <Chip
              key={tag}
              size="select"
              active={on}
              aria-pressed={on}
              aria-busy={busy || undefined}
              aria-label={on ? `「${tag}」を外す` : `「${tag}」を付ける`}
              // 保存中は押しても何もしない（薄くしない・DESIGN §5 押せないボタン）
              onClick={() => { if (!busyTag) onToggle?.(tag); }}
            >
              {!on && !busy && <Plus size={14} aria-hidden="true" />}
              {tag}
              {on && !busy && <X size={14} aria-hidden="true" />}
              {/* 保存中: 付け外しの印の場所に小さな回る印（チップの幅は変えない） */}
              {busy && <Loader2 size={14} aria-hidden="true" style={{ animation: 'leverage-spin 0.9s linear infinite' }} />}
            </Chip>
          );
        })}
      </div>
    </section>
  );
}
