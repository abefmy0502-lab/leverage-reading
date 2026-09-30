// 🔗 つながるメモ（本と本がつながる・2026-10-01・SPEC §2・DESIGN §5「つながるメモ」）。
// ほかの本で似たことを書いたメモを 1〜2 件。行はすべての本の検索のメモの行（LibrarySearchHit の inline）と同じ組み立て
// （表紙 44・書名・「p.64 · 5/27」・明朝 15 の一節・共有する言葉に印）。押すとその本のそのメモを開く。
//   variant 'card':    メモのカード・メモの編集の画面の中（上に --separator の線・小さな見出し「つながるメモ」）
//   variant 'saved':   保存したあと、本の詳細のメモの一覧の上に 1 枚（カードの面・「いま書いたメモと似たことを、ほかの本でも」・×）
//   variant 'compact': 「保存して次へ」のあと、書く画面のいちばん上に 1 行（書き続けるのを邪魔しない・×）
import { ChevronRight, Link2, X } from 'lucide-react';
import LibrarySearchHit from './LibrarySearchHit';
import { withPhraseBreaks } from './TightBubble';
import { groupTitle } from '../styles/ui';

export const SAVED_LINKS_TITLE = 'いま書いたメモと似たことを、ほかの本でも';
export const CARD_LINKS_TITLE = 'つながるメモ';

// カードの押す・長押し・スワイプに届かせない（中の行を押したら、そのメモを開くだけ）。
const stop = (e) => e.stopPropagation();
const guard = { onClick: stop, onTouchStart: stop, onMouseDown: stop };

const closeBtn = {
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: 'none', border: 'none', borderRadius: 999, padding: 0, cursor: 'pointer', color: 'var(--text-3)',
};

export default function MemoLinks({ links, onOpen, onDismiss = null, variant = 'card', style = null }) {
  if (!Array.isArray(links) || links.length === 0) return null;
  const rows = links.map((l, i) => (
    <LibrarySearchHit key={l.key} inline divider={i > 0} showStatus={false} showRating={false} size="small" result={{ book: l.book, hit: l.hit }} onOpen={onOpen} />
  ));

  if (variant === 'compact') {
    const first = links[0];
    const page = Number.isFinite(first.hit?.page) ? ` p.${first.hit.page}` : '';
    return (
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', background: 'var(--fill)', borderRadius: 'var(--radius)', paddingLeft: 'var(--space-3)', ...style }}>
        <button
          type="button"
          onClick={() => onOpen?.(first.book, first.hit?.memoId)}
          style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'none', border: 'none', padding: 'var(--space-2) 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--text)', fontSize: 'var(--text-sub)', lineHeight: 1.5 }}
        >
          <Link2 size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-2)' }} />
          {/* 書名を切らずに 2 行まで（文節の切れ目で折り返す）。 */}
          <span style={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(`似たことを『${first.book.title}』${page}でも書いています`)}
          </span>
          <ChevronRight size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
        </button>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="閉じる" style={closeBtn}>
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'saved') {
    return (
      <section
        aria-label={SAVED_LINKS_TITLE}
        className="list-item-enter"
        style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: '0 var(--space-4)', ...style }}
      >
        {/* 1 行目は見出し（13/--text-2）と右端の ×（押せる範囲 44・見た目をカードの余白 16 の角にそろえる）。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44, marginRight: 'calc(-1 * var(--space-3))' }}>
          <Link2 size={16} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-2)' }} />
          <h3 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.5 }}>{SAVED_LINKS_TITLE}</h3>
          {onDismiss && (
            <button type="button" onClick={onDismiss} aria-label="閉じる" style={closeBtn}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div style={{ marginTop: 'calc(-1 * var(--space-2))' }}>{rows}</div>
      </section>
    );
  }

  return (
    <section aria-label={CARD_LINKS_TITLE} {...guard} style={{ borderTop: '1px solid var(--separator)', paddingTop: 'var(--space-3)', cursor: 'default', ...style }}>
      <h3 style={{ ...groupTitle, margin: 0 }}>{CARD_LINKS_TITLE}</h3>
      <div style={{ marginTop: 'calc(-1 * var(--space-1))' }}>{rows}</div>
    </section>
  );
}
