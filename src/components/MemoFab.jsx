// ✏️ 本の詳細の右下の「メモを書く」（主ボタン・1 画面 1 つ・DESIGN §0）。
//
// 「この本のまとめ」を開いている間・本の詳細の入力欄に書いている間は隠す（2026-09-29）。
// 浮いたボタンが、まとめの「保存」やキーボードの上の入力欄に重なって押せなくなるのを防ぐ。
// 入力欄から離れたときは少し待ってから戻す（「保存」を押した指の下にボタンが現れて、押し間違えないように）。
// 下まで送って「読了にする」など（data-fab-avoid の印）がボタンの高さに来ている間も隠す（重なって押せない・2026-09-30）。
// 見た目は DESIGN.md のトークンのみ（主ボタンの塗り・--shadow-raised）。
import { useEffect, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';

const fabStyle = {
  // ＋記号だけだと何が起きるか分からないので「メモを書く」と文字で言う（SPEC §2）。
  position: 'fixed',
  right: 'var(--space-4)',
  bottom: 'calc(var(--tabbar-h) + var(--space-3) + env(safe-area-inset-bottom, 0px))',
  minHeight: 48,
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
// avoidKey: 避けるボタン（data-fab-avoid）が入れ替わる印（本の状態）。変わったら見張り直す。
export default function MemoFab({ scrollRef, onClick, avoidKey }) {
  const [hidden, setHidden] = useState(false);
  const [overlap, setOverlap] = useState(false);
  const btnRef = useRef(null);
  // 隠れている間は測れないので、最後に測ったボタンの上下を覚えておく。
  const bandRef = useRef(null);

  // 「読了にする」などがボタンの高さ（上下 8 の余裕）に入っている間は隠す。
  useEffect(() => {
    const root = scrollRef?.current;
    setOverlap(false);
    if (!root || typeof IntersectionObserver === 'undefined' || typeof window === 'undefined') return undefined;
    const targets = Array.from(root.querySelectorAll('[data-fab-avoid]'));
    if (targets.length === 0) return undefined;
    let io = null;
    const inside = new Set();
    const build = () => {
      if (io) io.disconnect();
      inside.clear();
      const r = btnRef.current?.getBoundingClientRect();
      if (r && r.height > 0) bandRef.current = { top: r.top, bottom: r.bottom };
      const band = bandRef.current;
      if (!band) return;
      const vh = window.innerHeight;
      const gap = 8;
      const top = Math.max(0, Math.round(band.top - gap));
      const bottom = Math.max(0, Math.round(vh - band.bottom - gap));
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) inside.add(e.target); else inside.delete(e.target); });
        setOverlap(inside.size > 0);
      }, { root: null, rootMargin: `-${top}px 0px -${bottom}px 0px`, threshold: 0 });
      targets.forEach((t) => io.observe(t));
    };
    build();
    window.addEventListener('resize', build);
    return () => {
      window.removeEventListener('resize', build);
      if (io) io.disconnect();
    };
  }, [scrollRef, avoidKey]);

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
  if (hidden) return null;
  return (
    // data-fab: 下の知らせ（Toast）が、このボタンの上に浮かぶための目印（隠れている間は付けない）。
    // 重なりで隠す間も場所は残して測れるようにする（visibility: hidden＝押せない・読み上げない）。
    <button
      ref={btnRef}
      type="button"
      data-fab={overlap ? undefined : ''}
      aria-hidden={overlap || undefined}
      tabIndex={overlap ? -1 : undefined}
      onClick={onClick}
      style={overlap ? { ...fabStyle, visibility: 'hidden' } : fabStyle}
    >
      <PencilLine size={18} aria-hidden="true" />メモを書く
    </button>
  );
}
