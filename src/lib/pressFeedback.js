// 👆 押した手応えをすぐ出す（2026-09-29）。
//
// CSS の :active だけに任せると、指で押したときの沈み（index.css の scale 0.97）が出ないか遅れる:
//   - iOS の Safari / WKWebView は、touchstart を聞いている要素が無いと :active を付けない
//   - Chrome はスクロールと見分けるため、指を置いてから少し待って :active を付ける
// そのうえ押したあとの処理が重い画面（すべての本・検索からメモを開く・行動の完了など）では、
// 遅い端末だと押した形が 1 コマも描かれないまま次の画面に替わっていた。
//
// そこで指（とペン）で押したら、押せるもの（button・role="button"・a・summary）に data-pressed を付け、
// CSS は :active と同じ見た目をこの印にも当てる（index.css）。
//   - スクロールと見分けるため、付けるのは指を置いて 3 コマ（約 50ms）動かさなかったとき（先に指を離したら、そのとき付ける）。
//     数えるのはタイマーではなくコマ（requestAnimationFrame）: 指を置いた直後の約 100ms は、ブラウザがスクロールに
//     備えてタイマーを後回しにするので、setTimeout(40) が 100ms 過ぎまで呼ばれなかった
//   - 外すのは指を離してから次のコマ（最短でも付けてから 90ms は見せる＝素早いタップでも 1 コマ以上は描かれる）
//   - 指が 8px 以上動いた・スクロールが始まった（pointercancel）・スクロールした ときはすぐ外す
// マウスは :active がすぐ効くので対象外。

const PRESSABLE = 'button:not(:disabled), [role="button"], a[href], summary';
const PRESS_DELAY_FRAMES = 3;
const MIN_SHOWN_MS = 90;
const SLOP_PX = 8;

let installed = false;

export function installPressFeedback() {
  if (installed || typeof document === 'undefined' || typeof window === 'undefined') return;
  installed = true;

  let target = null; // いま押している要素
  let pressedAt = 0; // data-pressed を付けた時刻（0 = まだ付けていない）
  let startX = 0;
  let startY = 0;
  let pressRaf = 0;
  let releaseTimer = null;

  const clearTimers = () => {
    if (pressRaf) { cancelAnimationFrame(pressRaf); pressRaf = 0; }
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = null; }
  };
  const mark = () => {
    if (!target || pressedAt) return;
    target.setAttribute('data-pressed', '');
    pressedAt = performance.now();
  };
  const unmarkNow = () => {
    clearTimers();
    if (target) target.removeAttribute('data-pressed');
    target = null;
    pressedAt = 0;
  };

  const onDown = (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    unmarkNow();
    const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
    if (!el || el.getAttribute('aria-disabled') === 'true') return;
    target = el;
    startX = e.clientX;
    startY = e.clientY;
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (frames >= PRESS_DELAY_FRAMES) { pressRaf = 0; mark(); return; }
      pressRaf = requestAnimationFrame(tick);
    };
    pressRaf = requestAnimationFrame(tick);
  };
  const onMove = (e) => {
    if (!target || e.pointerType === 'mouse') return;
    if (Math.abs(e.clientX - startX) > SLOP_PX || Math.abs(e.clientY - startY) > SLOP_PX) unmarkNow();
  };
  const onUp = (e) => {
    if (!target || e.pointerType === 'mouse') return;
    if (pressRaf) { cancelAnimationFrame(pressRaf); pressRaf = 0; }
    mark();
    const el = target;
    const wait = Math.max(0, MIN_SHOWN_MS - (performance.now() - pressedAt));
    // 次のコマを描いてから外す（重い処理が続いても、押した形を先に見せる）。
    releaseTimer = setTimeout(() => {
      releaseTimer = null;
      requestAnimationFrame(() => {
        el.removeAttribute('data-pressed');
        if (target === el) { target = null; pressedAt = 0; }
      });
    }, wait);
  };

  const opts = { passive: true, capture: true };
  document.addEventListener('pointerdown', onDown, opts);
  document.addEventListener('pointermove', onMove, opts);
  document.addEventListener('pointerup', onUp, opts);
  document.addEventListener('pointercancel', unmarkNow, opts);
  document.addEventListener('scroll', unmarkNow, opts);
  // iOS の Safari / WKWebView で :active を効かせるための、何もしない touchstart（キーボードで押したときなどのため）。
  document.addEventListener('touchstart', () => {}, { passive: true });
}
