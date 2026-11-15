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
export function nextScrollDown(prevTop, top, wasDown) {
  if (top <= 48) return false;
  const d = top - prevTop;
  if (Math.abs(d) < 8) return wasDown;
  return d > 0;
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
    return () => {
      body.classList.remove(CHAT_ACTIVE_CLASS);
      body.classList.remove(CHAT_SCROLL_DOWN_CLASS);
      setNavInert(false);
      down.current = false;
    };
  }, [active]);
  return useCallback((top) => {
    if (!active || typeof document === 'undefined') return;
    const next = nextScrollDown(lastTop.current, top, down.current);
    lastTop.current = top;
    if (next !== down.current) {
      down.current = next;
      document.body.classList.toggle(CHAT_SCROLL_DOWN_CLASS, next);
      setNavInert(next);
    }
  }, [active]);
}
