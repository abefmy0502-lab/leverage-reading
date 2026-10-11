// ♿ useInertBackground — 全画面に重ねたダイアログの後ろを inert にする（2026-10-11）。
//
//   active の間、ref の要素の「後ろ」にあるものを inert にして、Tab・読み上げ・指が後ろへ抜けないようにする。
//   後ろ＝ ① 重ねた要素と同じ親の中で、それより前にある兄弟（アプリ本体）
//          ② body 直下の要素のうち、重ねた要素を含まないもの（開いていたシート・メニューの portal）
//   除くもの: 知らせ・読み上げの入れ物（aria-live / role=status / role=alert を含む要素）＝inert にすると読み上げられない、
//            重ねたあとに足された要素（ダイアログの上で開いた確かめのダイアログなど）＝開いた時点のものだけを対象にする。
//   閉じたら、自分が付けた inert だけ外す（もともと inert だった要素はそのまま）。
//   使い方: const ref = useRef(null); useInertBackground(open, ref); <div ref={ref} role="dialog" aria-modal="true">
import { useEffect } from 'react';

const LIVE_SELECTOR = '[aria-live], [role="status"], [role="alert"]';

export function backgroundElementsOf(el) {
  if (!el || typeof document === 'undefined') return [];
  const out = [];
  const parent = el.parentElement;
  if (parent) {
    for (const sib of Array.from(parent.children)) {
      if (sib === el) break;
      out.push(sib);
    }
  }
  const body = document.body;
  if (body && parent !== body) {
    for (const child of Array.from(body.children)) {
      if (child.contains(el)) continue;
      if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(child.tagName)) continue;
      out.push(child);
    }
  }
  // 読み上げの入れ物を含む要素は丸ごと inert にせず、その子に分けて入れ物だけ残す（アプリ本体の中の
  // 「オフラインです」の role=status があっても、本体の残りは inert にする）。
  const split = (node, depth = 0) => {
    if (node.matches?.(LIVE_SELECTOR)) return [];
    if (!node.querySelector?.(LIVE_SELECTOR)) return [node];
    if (depth > 12) return [];
    return Array.from(node.children).flatMap((c) => split(c, depth + 1));
  };
  return out.flatMap((node) => split(node));
}

export function useInertBackground(active, ref) {
  useEffect(() => {
    if (!active) return undefined;
    const el = ref?.current;
    if (!el) return undefined;
    const marked = [];
    for (const node of backgroundElementsOf(el)) {
      if (node.hasAttribute('inert')) continue;
      node.setAttribute('inert', '');
      marked.push(node);
    }
    return () => { marked.forEach((node) => node.removeAttribute('inert')); };
  }, [active, ref]);
}

export default useInertBackground;
