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
    'orime（読んだ本と会話する読書メモ）を使っています。',
    `コード ${code} を、アプリの設定の「コードを使う」に入れると、特典を受け取れます（内容はコードを入れる画面に表示されます）。`,
    site,
  ].join('\n');
}

// 🌱 orime を友だちに教える（2026-11-26・コードが無くても全員）。点検で、コードの無いビルドでは
//   「人にすすめる」入口がアプリのどこにも無かった。文は事実だけ（何ができるか・無料プランで始められる）・
//   URL は App Store（キャンペーン share_invite）か、まだ無ければ紹介のページ。紹介した人への特典は作らない。
export function inviteMessage(url) {
  return [
    'orime という読書メモのアプリを使っています。',
    '読んだ本の一文を残しておくと、困ったときにそのメモから答えてくれる相談相手になります。無料プランで始められます。',
    url,
  ].filter(Boolean).join('\n');
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
