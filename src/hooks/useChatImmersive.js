import { useCallback, useEffect, useRef } from 'react';

// 💬 会話の画面を広く使う（2026-11-15 オーナー「相談と AI 選書のチャットの画面が小さい・限りなく大きな画面でストレスなく」）。
//   会話の間（active・body.chat-active）、下へ読み進めている間は上の行（ロゴ・写真で共有・？・⚙️）と下のタブを畳む
//   （body.chat-scroll-down・キーボードのときと同じ畳み方）。上へ少し戻すと両方すぐ戻る（Safari と同じ）。
//   隠している間の下のタブは inert（読み上げ・キーボードのフォーカスが見えない所へ行かない・2026-11-15 ui-critic）。
//   会話の外（タブを替えた・会話を終えた・はじめの画面）では何もしない＝いつもの画面のまま。
// 使い方: const onImmersiveScroll = useChatImmersive(active); 会話のスクロールの箱の onScroll から onImmersiveScroll(scrollTop)。
export const CHAT_ACTIVE_CLASS = 'chat-active';
export const CHAT_SCROLL_DOWN_CLASS = 'chat-scroll-down';
// 指の小さな揺れでは切り替えない（8 未満は無視）・先頭近く（48 以内）では必ず出す。
//   いちばん下（残り 2 以内）で隠しているときは、上に動いても出さない＝畳んで箱が伸びた分だけ位置が押し戻されたのを
//   「上へ戻した」と読み違えて、出す → 縮む → 隠す…を繰り返し、画面がブルブル震えていた（2026-11-17 オーナー）。
export function nextScrollDown(prevTop, top, wasDown, { atBottom = false } = {}) {
  if (top <= 48) return false;
  if (wasDown && atBottom) return true;
  const d = top - prevTop;
  if (Math.abs(d) < 8) return wasDown;
  return d > 0;
}
// 畳んだ・出した直後は箱の高さが変わって位置が勝手に動くので、少しのあいだ切り替えない（そのあと今の位置から数え直す）。
export const SETTLE_MS = 400;

// 👆 畳む・出すのは、本人が会話を動かしたときだけ（2026-11-27 オーナー「チャットを続けると画面がガクガクする」）。
//   アプリが自分で送ったとき（相談の吹き出しを上端へ・答えの問いを見せる）にも畳んでいたので、送る動きの途中で
//   上の行と下のタブが消え、会話の欄の高さが変わって 2 つの動きが重なっていた。
//   指が触れている間と、離してから慣性で流れる間（USER_FLING_MS）・ホイールのすぐ後（USER_WHEEL_MS）だけ数える。
export const USER_FLING_MS = 1200;
export const USER_WHEEL_MS = 300;
export function isUserScroll({ touching = false, now = 0, until = 0 } = {}) {
  return !!touching || now <= until;
}
// 画面のどこでも、指・マウス・ホイールの操作を見張る（会話の欄の外から始めた操作も数える・会話の間だけ）。
const userState = { touching: false, until: 0 };
// いま本人が会話を動かしている途中か（指が触れている・慣性で流れている）。会話の欄の位置を合わせ直すかの判断に使う。
export function userScrollingNow() {
  return isUserScroll({ touching: userState.touching, now: Date.now(), until: userState.until });
}
function installUserWatch() {
  if (typeof document === 'undefined') return () => {};
  // 会話の欄の中で始めた操作だけ（送信・チップを押した指を「会話を動かした」と数えない＝押したあとの自動の送りで畳まない）。
  const inChat = (e) => { try { return !!e?.target?.closest?.('.chat-scroll'); } catch { return false; } };
  // 押しただけ（キーボードを閉じるために会話を押した）は数えない。指が動いてから「動かしている」とみなす。
  let start = null;
  const pointOf = (e) => (e?.touches?.[0] ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e?.clientX || 0, y: e?.clientY || 0 });
  const onDown = (e) => { start = inChat(e) ? pointOf(e) : null; };
  const onMove = (e) => {
    if (!start || userState.touching) return;
    const p = pointOf(e);
    if (Math.abs(p.y - start.y) > 6 || Math.abs(p.x - start.x) > 6) userState.touching = true;
  };
  const onUp = () => {
    start = null;
    if (userState.touching) { userState.touching = false; userState.until = Date.now() + USER_FLING_MS; }
  };
  const onWheel = (e) => { if (inChat(e)) userState.until = Date.now() + USER_WHEEL_MS; };
  const onPDown = (e) => { if (e.pointerType === 'mouse') onDown(e); };
  const onPMove = (e) => { if (e.pointerType === 'mouse') onMove(e); };
  const SCROLL_KEYS = new Set(['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' ']);
  const onKey = (e) => {
    const tag = String(e?.target?.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || !SCROLL_KEYS.has(e.key)) return;
    userState.until = Date.now() + USER_WHEEL_MS;
  };
  const onPUp = (e) => { if (e.pointerType === 'mouse') onUp(); };
  const opt = { passive: true, capture: true };
  document.addEventListener('touchstart', onDown, opt);
  document.addEventListener('touchmove', onMove, opt);
  document.addEventListener('pointermove', onPMove, opt);
  document.addEventListener('touchend', onUp, opt);
  document.addEventListener('touchcancel', onUp, opt);
  document.addEventListener('pointerdown', onPDown, opt);
  document.addEventListener('pointerup', onPUp, opt);
  document.addEventListener('wheel', onWheel, opt);
  document.addEventListener('keydown', onKey, true);
  return () => {
    document.removeEventListener('touchstart', onDown, opt);
    document.removeEventListener('touchmove', onMove, opt);
    document.removeEventListener('pointermove', onPMove, opt);
    document.removeEventListener('touchend', onUp, opt);
    document.removeEventListener('touchcancel', onUp, opt);
    document.removeEventListener('pointerdown', onPDown, opt);
    document.removeEventListener('pointerup', onPUp, opt);
    document.removeEventListener('wheel', onWheel, opt);
    document.removeEventListener('keydown', onKey, true);
    userState.touching = false;
    userState.until = 0;
  };
}

function setNavInert(on) {
  const nav = typeof document !== 'undefined' ? document.querySelector('.bottom-nav') : null;
  if (!nav) return;
  if (on) nav.setAttribute('inert', ''); else nav.removeAttribute('inert');
}

export function useChatImmersive(active) {
  const lastTop = useRef(0);
  const down = useRef(false);
  useEffect(() => {
    if (typeof document === 'undefined' || !active) return undefined;
    const body = document.body;
    body.classList.add(CHAT_ACTIVE_CLASS);
    const unwatch = installUserWatch();
    return () => {
      unwatch();
      body.classList.remove(CHAT_ACTIVE_CLASS);
      body.classList.remove(CHAT_SCROLL_DOWN_CLASS);
      setNavInert(false);
      down.current = false;
    };
  }, [active]);
  const settleUntil = useRef(0);
  const recheckRef = useRef(null);
  useEffect(() => () => clearTimeout(recheckRef.current), []);
  // 会話のスクロールの箱の onScroll から、箱そのもの（e.currentTarget）か scrollTop の数を渡す。
  return useCallback((target) => {
    if (!active || typeof document === 'undefined') return;
    const el = target && typeof target === 'object' ? target : null;
    const top = el ? el.scrollTop : Number(target) || 0;
    const now = Date.now();
    if (now < settleUntil.current) { lastTop.current = top; return; }
    if (!isUserScroll({ touching: userState.touching, now, until: userState.until })) { lastTop.current = top; return; }
    const atBottom = !!el && el.scrollHeight - el.clientHeight - top <= 2;
    const next = nextScrollDown(lastTop.current, top, down.current, { atBottom });
    lastTop.current = top;
    if (next !== down.current) {
      down.current = next;
      settleUntil.current = now + SETTLE_MS;
      document.body.classList.toggle(CHAT_SCROLL_DOWN_CLASS, next);
      setNavInert(next);
      // 畳んだあと、箱が伸びて先頭へ戻った・もう送れる長さが無い、なら畳んだままにしない
      //   （そのあとスクロールが起きず、下のタブが消えたまま戻れなかった・2026-11-25 点検）。
      if (next && el) {
        clearTimeout(recheckRef.current);
        recheckRef.current = setTimeout(() => {
          if (!down.current) return;
          const stuck = el.scrollTop <= 48 || el.scrollHeight <= el.clientHeight + 48;
          if (!stuck) return;
          down.current = false;
          lastTop.current = el.scrollTop;
          document.body.classList.remove(CHAT_SCROLL_DOWN_CLASS);
          setNavInert(false);
        }, SETTLE_MS + 50);
      }
    }
  }, [active]);
}
