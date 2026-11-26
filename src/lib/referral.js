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

// 📚 AI 選書で見つけた本を人に教える文（2026-11-26 継続の点検・体験した人の声「人に話したくなる成果が無い・AI 選書の結果を共有できない」）。
//   入れるのは本（書名・著者）と、AI が書いたこの本の核心の 1 文だけ。本人の悩み・聞き取りの答え・メモは入れない（その人の事情）。
//   最後に orime の入手先。誇らない・特典なし。
export function advisorShareMessage(book, url) {
  const title = String(book?.title || '').trim();
  if (!title) return '';
  const author = String(book?.author || '').trim();
  const core = String(book?.core || '').replace(/\s+/g, ' ').trim();
  const coreLine = core ? (core.length > 80 ? `${core.slice(0, 79)}…` : core) : '';
  return [
    `『${title}』${author ? `（${author}）` : ''}`,
    coreLine,
    'orime の AI 選書で、いまの悩みに合う 1 冊として見つけました。',
    url,
  ].filter(Boolean).join('\n');
}

// 💬 相談の答えを人に渡す文（2026-11-26 体験した人の声「1on1 で効いた答えをチームに見せる手段が無い」）。
//   入れるのは答えの【結論】と、決めた一歩だけ。相談した文そのもの・聞き返し・根拠のメモの一覧は入れない
//   （結論の中で AI が状況を言い直すことはあるので、共有シートで送る前に本人が見て直せる形で渡す）。最後に orime の入手先。
//   AI の答えであることはいつも書く。本の語り口の答え（voice）は、著者本人の言葉ではないことも添える（GLOSSARY の「必ず添える」）。
export function consultShareMessage({ conclusion = '', action = '', voice = false } = {}, url = '') {
  const clean = (t, max) => {
    const v = String(t || '').replace(/\*\*/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return v.length > max ? `${v.slice(0, max - 1)}…` : v;
  };
  const c = clean(conclusion, 400);
  if (!c) return '';
  const a = clean(action, 160);
  return [
    c,
    a ? `\n明日からの一歩：${a}` : '',
    '\norime の AI が、自分の読書メモをもとに答えたものです。',
    voice ? '本の語り口をまねた AI の答えで、著者本人の言葉ではありません。' : '',
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
