// 🧪 はじめての相談の答えのあとに、1 回だけ 7 日間無料を見せる実験（2026-10-08・マーケ戦略 §6-1・§9-2 オーナー承認）。
//
// なぜ: サブスクのアプリでは、無料期間を始める人の約 9 割がインストールした当日に始める。今の決まり（当日はすすめない）では
//   その窓を使っていない。価値を感じた直後＝「自分のメモから答えが返ってきた」直後なら押し売りにならない。
//
// 決まり（CLAUDE.md の GLOSSARY「無料プラン／7 日間無料」の ④）:
//   - 出すのは、はじめての相談の答えが出きったあと、その答えの下に、閉じられる 1 行のカード「この相談相手を、7 日間無料で育てる」
//   - 関係するメモが無かった答え（トークンを返した）・根拠を確かめられなかった答え・中止した答えには出さない
//   - 対象は無料プランで、7 日間無料を使える人（ストアが「使える」と答えた人）だけ。前に契約していた人には出さない
//   - 半分の人だけ（ユーザー ID から決まる安定した振り分け＝firstAnswerTrialGroup）。もう半分は今までどおり（比べるため）
//   - 押すと有料プランの画面（reason 'first_answer'）。閉じたら二度と出さない（端末＋アカウントのメタデータ）
//   - 初回ガイド・ホームではすすめない（今の決まりのまま）
//   - ③「相談相手が育ってきました」（lib/trialNudge.js）と重ねない:
//       見せる組の人は、はじめての相談を送るまで ③ を出さない（当日の案内はこのカードだけにする）
//       このカードを出した画面では ③ を出さない／③ を閉じた・この画面で見た人にはこのカードを出さない
//
// 計測（docs/analytics-events.md）: first_answer_trial {action: eligible | shown | tap | dismiss, group: show | hold}
//   eligible は両方の組で送る（出せる条件がそろった＝比べる母数）。shown 以降は見せる組だけ。
//   有料プランの画面は paywall_viewed {reason: 'first_answer'}。

import { supabase } from './supabase';

// 実験の名前（振り分けの種。名前を変えると振り分けが変わる＝別の実験になる）。
export const FIRST_ANSWER_TRIAL_EXPERIMENT = 'first_answer_trial_2026_11';
// 端末の印（'shown' ＝ 出した／'tap' | 'dismiss' ＝ 押した・閉じた）。消えても害は「もう一度出る」だけ（アカウントにも残す）。
export const FIRST_ANSWER_TRIAL_KEY = 'orime-first-answer-trial';
// アカウントのメタデータ（user_metadata）の名前。端末を変えても二度と出さないため。
export const FIRST_ANSWER_TRIAL_META = 'first_answer_trial';

// 32 ビットの FNV-1a（同じ文字列はどの端末でも同じ数になる）。
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 振り分け（'show' ＝ 見せる組・'hold' ＝ 見せない組・null ＝ ユーザー ID が無い）。
// ユーザー ID と実験の名前だけで決まる（端末・時間・回数に左右されない）。
export function firstAnswerTrialGroup(userId) {
  const id = String(userId || '').trim();
  if (!id) return null;
  return fnv1a(`${FIRST_ANSWER_TRIAL_EXPERIMENT}:${id}`) % 2 === 0 ? 'show' : 'hold';
}

// この答えが「出せる答え」か（組に関係なく・純粋関数）。
//   isFirst: はじめての相談の答え（前の相談が履歴に無い）
//   aborted: 中止した / refunded: 関係するメモが無かった（トークンを返した）/ grounded: 根拠をメモで確かめられた
//   memoCount: 答えに使ったメモの数
export function isFirstAnswerTrialMoment({ isFirst, aborted = false, refunded = false, grounded = true, memoCount = 0 } = {}) {
  if (!isFirst || aborted || refunded || grounded === false) return false;
  return Number(memoCount) > 0;
}

// 出せる人か（組に関係なく・純粋関数）。
//   plan: 'free' | 'trial' | 'paid' | 'admin' / hadPlan: 前に契約していた
//   offer: ストアから分かった無料期間の名前（「7 日間無料」）。'' ＝使えない・分からない
//   done: 前に出した・閉じた・押した / otherNudge: ③ を閉じた・この画面で見た
export function canOfferFirstAnswerTrial({ plan, hadPlan = false, offer = '', done = false, otherNudge = false } = {}) {
  if (plan !== 'free' || hadPlan) return false;
  if (!offer) return false;
  return !done && !otherNudge;
}

// ③「相談相手が育ってきました」を今は止めるか（見せる組の人が、まだ一度も相談していない間）。
export function holdGrownNudge({ group, consulted }) {
  return group === 'show' && !consulted;
}

// カードの文（1 行）。offer は「7 日間無料」。
export function firstAnswerTrialText(offer = '7 日間無料') {
  return `この相談相手を、${offer || '7 日間無料'}で育てる`;
}

// ── 端末・アカウントの印 ─────────────────────────────────────────────
const store = () => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};

export function isFirstAnswerTrialDone(user) {
  try {
    if (store()?.getItem(FIRST_ANSWER_TRIAL_KEY)) return true;
  } catch { /* 読めなければアカウントの印を見る */ }
  return !!user?.user_metadata?.[FIRST_ANSWER_TRIAL_META];
}

// action: 'shown' | 'tap' | 'dismiss'。端末には必ず、アカウントには押した・閉じたときだけ書く（出しただけでは書かない＝書き込みを減らす）。
export function markFirstAnswerTrialDone(action = 'shown') {
  try { store()?.setItem(FIRST_ANSWER_TRIAL_KEY, action); } catch { /* 覚えられなくても画面は壊さない */ }
  if (action === 'shown') return;
  try {
    const p = supabase?.auth?.updateUser?.({ data: { [FIRST_ANSWER_TRIAL_META]: { action, at: new Date().toISOString() } } });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* 書けなくても端末の印で止まる */ }
}
