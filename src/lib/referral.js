// 🤝 友だちに紹介する（2026-10-22・goal-1000-elements 9-3・master plan §10-3 の 3）。
//
// App Store のオファーコード（オーナーが App Store Connect で作る）を、設定の「友だちに紹介する」から共有の文に入れて渡す。
// コードは VITE_REFERRAL_CODE（ビルド時に焼き込む）。無ければ行ごと出さない（まだ始めない）。
// 紹介した人への特典は作らない（App Store の決まりと、計測が整うまで）。共有の文は事実だけ・「無料」の言い過ぎをしない。
// 共有は端末の共有シート（navigator.share）。無ければ文をコピーする。
import { SITE_URL } from './legalLinks';

export const REFERRAL_CODE = String(import.meta.env?.VITE_REFERRAL_CODE || '').trim();
export const REFERRAL_ON = REFERRAL_CODE.length > 0;

// 共有の文（コードの使い方は iPhone の設定 →「コードを使う」）。
export function referralMessage(code = REFERRAL_CODE, site = SITE_URL) {
  if (!code) return '';
  return [
    'Orime（読んだ本と会話する読書メモ）を使っています。',
    `コード ${code} を、アプリの設定の「コードを使う」に入れると、プランの特典が受け取れます。`,
    site,
  ].join('\n');
}

// 端末の共有シートで渡す。渡せなければ false（呼び手がコピーに切り替える）。
export async function shareReferral(message) {
  if (!message) return false;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text: message });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return true; // やめたのは失敗ではない
  }
  return false;
}
