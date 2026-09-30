// 最初の画面が描ける状態になった（ホームの本を読み込んだ・ログインの画面を出した）ことを知らせる。
// Web の飾りのスプラッシュ（SplashScreen）は、これを受けたらすぐ消える（決まった 1 秒は待たせない・2026-09-30）。
export const APP_READY_EVENT = 'orime:app-ready';

let ready = false;

export function isAppReady() {
  return ready;
}

export function markAppReady() {
  if (ready) return;
  ready = true;
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new Event(APP_READY_EVENT)); } catch { /* ignore */ }
}
