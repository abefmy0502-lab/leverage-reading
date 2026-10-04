// ✏️ 本の詳細の右下の「メモを書く」（主ボタン・1 画面 1 つ・DESIGN §0）。
//
// 「この本のまとめ」を開いている間・本の詳細の入力欄に書いている間は隠す（2026-09-29）。
// 浮いたボタンが、まとめの「保存」やキーボードの上の入力欄に重なって押せなくなるのを防ぐ。
// 入力欄から離れたときは少し待ってから戻す（「保存」を押した指の下にボタンが現れて、押し間違えないように）。
// 画面の中のボタン（「読了にする」など）と重ならないように隠すことはしない（2026-09-30）。
// 本の詳細の下の余白（FAB_CLEARANCE）で、いちばん下のボタンもこのボタンの上まで送れるようにしてある。
// 見た目は DESIGN.md のトークンのみ（主ボタンの塗り・--shadow-raised・高さ --fab-h）。
import { useEffect, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';

// 出た・消えたを下の知らせ（Toast）に伝える（知らせがこのボタンの上へすぐ動く・2026-09-30）。
export const FAB_EVENT = 'orime:fab';
function announce() {
  if (typeof window === 'undefined') return;
  // DOM が入れ替わってから知らせる（外れた直後のボタンを測らない）。
  const fire = () => { try { window.dispatchEvent(new Event(FAB_EVENT)); } catch { /* ignore */ } };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fire);
  else fire();
}

// 本の詳細のスクロールする枠の下の余白: ボタンの高さ＋タブとの間（12）＋ゆとり（16）＋セーフエリア。
// いちばん下のボタンを、いつでもこのボタンの上まで送れる（2026-09-30）。
export const FAB_CLEARANCE = 'calc(var(--fab-h) + var(--space-3) + var(--space-4) + env(safe-area-inset-bottom, 0px))';

const fabStyle = {
  // ＋記号だけだと何が起きるか分からないので「メモを書く」と文字で言う（SPEC §2）。
  position: 'fixed',
  right: 'var(--space-4)',
  bottom: 'calc(var(--tabbar-h) + var(--space-3) + env(safe-area-inset-bottom, 0px))',
  minHeight: 'var(--fab-h)',
  padding: '0 var(--space-4)',
  borderRadius: 'var(--radius)',
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  cursor: 'pointer',
  boxShadow: 'var(--shadow-raised)',
  // メモ編集(300)・写真拡大(400)等のオーバーレイより下に置く（600 だと全画面エディタの上に浮いてしまう）。
  zIndex: 100,
  fontFamily: 'inherit',
};

// scrollRef: 本の詳細のスクロールする枠（この中の畳む見出し・入力欄を見る）。
export default function MemoFab({ scrollRef, onClick }) {
  const [hidden, setHidden] = useState(false);
  const shownRef = useRef(null);

  useEffect(() => {
    const root = scrollRef?.current;
    if (!root) return undefined;
    let timer = null;
    const check = () => {
      // 中に書く欄のある畳む見出し（この本のまとめ）が開いている。
      const foldOpen = Array.from(root.querySelectorAll('details[open]')).some((d) => d.querySelector('textarea'));
      // 本の詳細の中の入力欄に書いている。
      const a = typeof document !== 'undefined' ? document.activeElement : null;
      const typing = !!(a && root.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(a.type))));
      setHidden(foldOpen || typing);
    };
    const now = () => { if (timer) { clearTimeout(timer); timer = null; } check(); };
    const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; check(); }, 300); };
    // toggle は泡立たないので、捕まえる段階（capture）で受ける。
    const onToggle = (e) => { if (e.target?.open) now(); else later(); };
    root.addEventListener('toggle', onToggle, true);
    root.addEventListener('focusin', now);
    root.addEventListener('focusout', later);
    check();
    return () => {
      if (timer) clearTimeout(timer);
      root.removeEventListener('toggle', onToggle, true);
      root.removeEventListener('focusin', now);
      root.removeEventListener('focusout', later);
    };
  }, [scrollRef]);

  // 見える・隠れるが変わったら、下の知らせに伝える（外れるときも）。
  const visible = !hidden;
  useEffect(() => {
    if (shownRef.current !== visible) { shownRef.current = visible; announce(); }
  }, [visible]);
  useEffect(() => () => announce(), []);

  if (hidden) return null;
  return (
    // data-fab: 下の知らせ（Toast）が、このボタンの上に浮かぶための目印。
    // 左端スワイプで戻るとき、画面と一緒に動かす目印にもなる（useEdgeSwipeBack）。
    <button
      type="button"
      data-fab=""
      onClick={onClick}
      style={fabStyle}
    >
      <PencilLine size="1.1em" aria-hidden="true" style={{ flexShrink: 0 }} />メモを書く
    </button>
  );
}
