// 🔗 つながるメモ（本と本がつながる・2026-10-01・SPEC §2・DESIGN §5「つながるメモ」）。
// ほかの本で似たことを書いたメモを 1〜2 件。行はすべての本の検索のメモの行（LibrarySearchHit の inline）と同じ組み立て
// （表紙 44・書名・「p.64 · 5/27」・明朝 15 の一節・共有する言葉に印）。押すとその本のそのメモを開く。
//   variant 'card':    メモのカード・メモの編集の画面の中（上に --separator の線・小さな見出し「つながるメモ」）
//   variant 'saved':   保存したあと、本の詳細のメモの一覧の上に 1 枚（カードの面・「いま書いたメモと似たメモ」・×）
//   variant 'compact': 「保存して次へ」のあと、書く画面のいちばん上に 1 行（書き続けるのを邪魔しない・×）
//   variant 'line':    ホームのメモを書くで保存したあと、題の下 8 に静かな 1 行（面を付けない・13/--text-2・
//                      育つまでの一行・相談相手が育ちましたと同じ場所と組み方・知らせの読み上げはしない・2026-10-10）
import { ChevronRight, Link2, X } from 'lucide-react';
import LibrarySearchHit from './LibrarySearchHit';
import { withPhraseBreaks } from './TightBubble';
import { groupTitle } from '../styles/ui';

export const SAVED_LINKS_TITLE = 'いま書いたメモと似たメモ';
export const CARD_LINKS_TITLE = 'つながるメモ';

// カードの押す・長押し・スワイプに届かせない（中の行を押したら、そのメモを開くだけ）。
const stop = (e) => e.stopPropagation();
const guard = { onClick: stop, onTouchStart: stop, onMouseDown: stop };

// 保存したあとの見出しの 1 行の高さ（13 × 1.5）。
const HEAD_LINE = 'calc(var(--text-meta) * 1.5)';

const closeBtn = {
  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  background: 'none', border: 'none', borderRadius: 999, padding: 0, cursor: 'pointer', color: 'var(--text-3)',
};

export default function MemoLinks({ links, onOpen, onDismiss = null, variant = 'card', style = null }) {
  if (!Array.isArray(links) || links.length === 0) return null;
  const rows = links.map((l, i) => (
    <LibrarySearchHit key={l.key} inline divider={i > 0} showStatus={false} showRating={false} size="small" result={{ book: l.book, hit: l.hit }} onOpen={onOpen} />
  ));

  if (variant === 'line') {
    const first = links[0];
    // 文字の大きさの設定が大きいとき（ルートの文字 22px 以上・ImportSheet と同じ目安）。
    let largeText = false;
    try { largeText = parseFloat(getComputedStyle(document.documentElement).fontSize) >= 22; } catch { /* ignore */ }
    const page = Number.isFinite(first.hit?.page) ? ` p.${first.hit.page} ` : '';
    // 組み方は育つまでの一行（GrowthMeter）と同じ: アイコンは 1 行目の高さの中央・文は 2 行まで。行のどこを押しても開く
    //   （› は置かない）。× は押せる範囲 44 のまま、1 行目の高さの中央にそろえる。書名は途中で割らない（2026-10-10 ui-critic）。
    return (
      <div data-memo-links-line="" style={{ display: 'flex', alignItems: 'flex-start', columnGap: 'var(--space-1)', margin: '0 calc(-1 * var(--space-3)) 0 0', fontSize: 'var(--text-meta)', lineHeight: 1.5, ...style }}>
        <button
          type="button"
          onClick={() => onOpen?.(first.book, first.hit?.memoId)}
          style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--text-2)', fontSize: 'inherit', lineHeight: 'inherit' }}
        >
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0, color: 'var(--text-3)' }}>
            <Link2 size="1.2em" />
          </span>
          {/* 2 行まで（文字を大きくして書名が 1 行を取るときだけ 3 行・文の終わり「でも書いています」を切らない）。
              書名は 1 つの塊（長ければ … で切る）・『 は行の頭でぶら下げる。 */}
          <span style={{ minWidth: 0, display: '-webkit-box', WebkitLineClamp: largeText ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            似たことを<wbr />
            <span style={{ display: 'inline-block', maxWidth: 'calc(100% + 0.5em)', marginLeft: '-0.5em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>『{first.book.title}』</span>
            {withPhraseBreaks(`${page}でも書いています`)}
          </span>
        </button>
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="閉じる" style={{ ...closeBtn, marginTop: 'calc((1.5em - 44px) / 2)' }}>
            <X size="1.2em" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    const first = links[0];
    // ページの前後は半角の空き（「『書名』 p.64 でも」・ページが無ければ「『書名』でも」・2026-10-01 ui-critic）
    const page = Number.isFinite(first.hit?.page) ? ` p.${first.hit.page} ` : '';
    return (
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', background: 'var(--fill)', borderRadius: 'var(--radius)', paddingLeft: 'var(--space-3)', ...style }}>
        <button
          type="button"
          onClick={() => onOpen?.(first.book, first.hit?.memoId)}
          style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'none', border: 'none', padding: 'var(--space-2) 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--text)', fontSize: 'var(--text-sub)', lineHeight: 1.5 }}
        >
          <Link2 size="1.1em" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-2)' }} />
          {/* 書名を切らずに 2 行まで（文節の切れ目で折り返す）。 */}
          <span style={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(`似たことを『${first.book.title}』${page}でも書いています`)}
          </span>
          <ChevronRight size="1.1em" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
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
        {/* 1 行目は見出し（13/--text-2・上に 8）と右端の ×（押せる範囲 44 のまま、負の余白で見出しの行の高さの中心と
            カードの右の余白 16 の角にそろえる）。 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', marginRight: 'calc(-1 * var(--space-3))' }}>
          <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', height: HEAD_LINE, flexShrink: 0, color: 'var(--text-2)' }}>
            <Link2 size="1.2em" />
          </span>
          <h3 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(SAVED_LINKS_TITLE)}</h3>
          {onDismiss && (
            <button type="button" onClick={onDismiss} aria-label="閉じる" style={{ ...closeBtn, marginTop: `calc((${HEAD_LINE} - 44px) / 2)` }}>
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
