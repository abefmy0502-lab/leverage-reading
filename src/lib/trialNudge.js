// 🌱 7 日間無料をすすめる「ちょうどいいとき」（2026-09-28 オーナー裁定）。
//
// Orime には「無料」が 2 つある:
//   - 無料プラン（ずっと無料）… 契約なし。メモ・記録・シェアと、相談だけ毎月 30 トークン
//   - 7 日間無料 … プランの最初の 7 日間（App Store の無料期間＝1 つの Apple ID に 1 回だけ）。
//                   すべての AI を 150 トークン。終わるとそのままプランへ自動更新
// 無料期間は一度しか使えないので、まずは無料プランで始めてもらい、相談が役に立つだけの
// メモがたまってから（＝相談相手が育ってから）すすめる。すすめるのは次のときだけ:
//   ① 無料のトークンを使い切った（有料プランの画面・reason 'free_used'）
//   ② プランの機能を押した（AI 選書・テーマまとめ・読書計画シート・写真から書き起こす など・'feature'）
//   ③ 自分のメモが 10 件たまった（相談の画面のいちばん上に 1 回だけ・'grown'）← このファイル
// 初回ガイド・ログイン・ホームでは無料期間をすすめない（無料の最初の一歩だけ）。
// 相談の上部に「無料期間 あと N 日」は出さない（オーナー判断）。

// 何件たまったらすすめるか（本のメモ＋学び。読書計画・まとめは数えない）。
export const TRIAL_NUDGE_MEMOS = 10;

// 一度閉じた・押したら二度と出さない（端末に覚える。消えても害は「もう一度出る」だけ）。
export const TRIAL_NUDGE_KEY = 'orime-trial-nudge-done';

// 出すかどうか（純粋関数・テストあり）。
//   plan: 'free' | 'trial' | 'paid' | 'admin' | null（PaywallContext）
//   memoCount: 自分のメモ（カード式＋学び）の件数。数え終わる前は null
//   done: 前に閉じた・押した
//   freeUsedUp: 今月の無料のトークンを使い切った（その案内が別に出るので重ねない）
//   empty: まだ話していない（答えの途中・答えの間には出さない）
export function shouldShowTrialNudge({ plan, memoCount, done, freeUsedUp = false, empty = true }) {
  if (plan !== 'free') return false; // 無料プランの人だけ（無料期間中・有料・管理者には出さない）
  if (done) return false;
  if (freeUsedUp) return false;
  if (!empty) return false;
  return Number.isFinite(memoCount) && memoCount >= TRIAL_NUDGE_MEMOS;
}

// 文言。offer はストアから分かった無料期間の名前（「7 日間無料」）。使えないと分かった・
// 分からないときは空＝無料期間を約束しない文にする。
export function trialNudgeCopy({ memoCount, offer = '' }) {
  const n = Number.isFinite(memoCount) ? memoCount : TRIAL_NUDGE_MEMOS;
  const title = '相談相手が育ってきました';
  if (offer) {
    return {
      title,
      body: `メモが ${n} 件たまりました。${offer}で、AI 選書・テーマまとめなど、すべての AI を試せます。`,
      cta: `${offer}で試す`,
      kind: 'trial',
    };
  }
  return {
    title,
    body: `メモが ${n} 件たまりました。AI 選書・テーマまとめなど、すべての AI を使えるプランがあります。`,
    cta: 'プランを見る',
    kind: 'plan',
  };
}

export function isTrialNudgeDone() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(TRIAL_NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTrialNudgeDone() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TRIAL_NUDGE_KEY, '1');
  } catch { /* 覚えられなくても画面は壊さない */ }
}

// ── 無料期間の書き方（「7日間無料」→「7 日間無料」・「最初の 7 日間は無料」）──
// ストア（iap.js）・LP の env（VITE_TRIAL_NOTE）・お試しモードの &trial= から来る文字をそろえる。
export function normalizeTrialLabel(label) {
  return String(label || '')
    .trim()
    .replace(/(\d+)\s*(日間|週間|ヶ月|か月|カ月|年間)/, '$1 $2');
}

// 「7 日間無料」→「7 日間」（期間だけ）。「無料」で終わらない書き方は '' を返す（呼び出し側はそのまま使う）。
export function trialPeriodOf(label) {
  const s = normalizeTrialLabel(label);
  const m = s.match(/^(.+?)\s*無料$/);
  return m ? m[1].trim() : '';
}

// 「最初の 7 日間は無料」。期間が取り出せないときは元の文（例「お試しあり」）をそのまま返す。
export function trialFirstPhrase(label) {
  const period = trialPeriodOf(label);
  return period ? `最初の ${period}は無料` : normalizeTrialLabel(label);
}

// ── いまのプランの呼び名（設定の「プラン」の行・GLOSSARY）──
// 出すのは 無料プラン / 7 日間無料（◯月◯日まで）/ 月額プラン / 年額プラン のどれか 1 つ。
//   plan: PaywallContext の plan（'free' | 'trial' | 'paid' | 'admin'）
//   priceId: subscriptions.price_id（RevenueCat は product_id・例 orime_annual / orime_monthly）
//   trialEnd: 無料期間が終わる日の表示（「10月3日」）。分からなければ ''
// 無料期間の長さは正典（App Store の Introductory Offer＝月額・年額とも 7 日間）。
// 月額か年額か分からない契約（Stripe の価格 ID など）は「利用中」とだけ出す。
export const TRIAL_LABEL = '7 日間無料';
export function planNameFor({ plan, priceId = '', trialEnd = '' }) {
  if (plan === 'free') return '無料プラン';
  if (plan === 'trial') return trialEnd ? `${TRIAL_LABEL}（${trialEnd}まで）` : TRIAL_LABEL;
  const id = String(priceId || '').toLowerCase();
  if (/(annual|year|p1y)/.test(id)) return '年額プラン';
  if (/(month|p1m)/.test(id)) return '月額プラン';
  return '利用中';
}
