import { PLAN_LABELS } from './billing';

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
// 件数は文に入れない（相談の上部の「メモ・学びなど N 件」と数え方が違い、並ぶと食い違って見えるため）。
// （呼び出し側が memoCount を渡しても使わない。）
export function trialNudgeCopy({ offer = '' } = {}) {
  const title = '相談相手が育ってきました';
  if (offer) {
    return {
      title,
      body: `メモがたまってきました。${offer}で、AI 選書・テーマまとめなど、すべての AI を試せます。`,
      cta: `${offer}で試す`,
      kind: 'trial',
    };
  }
  return {
    title,
    body: `メモがたまってきました。AI 選書・テーマまとめなど、すべての AI を使えるプランがあります。`,
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
// 契約の期間（'annual' | 'monthly' | ''）。価格 ID / product_id から読む。分からなければ ''。
export function planPeriodOf(priceId = '') {
  const id = String(priceId || '').toLowerCase();
  if (/(annual|year|p1y)/.test(id)) return 'annual';
  if (/(month|p1m)/.test(id)) return 'monthly';
  return '';
}
export function planNameFor({ plan, priceId = '', trialEnd = '' }) {
  if (plan === 'free') return '無料プラン';
  if (plan === 'trial') return trialEnd ? `${TRIAL_LABEL}（${trialEnd}まで）` : TRIAL_LABEL;
  const period = planPeriodOf(priceId);
  if (period === 'annual') return '年額プラン';
  if (period === 'monthly') return '月額プラン';
  return '利用中';
}

// 無料期間の人に、終わったあとどうなるか（設定の「プラン」の行の下・2026-09-28 → 2026-09-29 に金額を入れた）。
//   「10月4日から 年額 ¥12,800（税込）で自動更新」（金額は billing.js の表示ラベル・「月あたり…」は外す）。
//   月額か年額か分からなければ「10月4日から プラン（自動更新）」（金額を当て推量で出さない）。
//   終わる日が分からなければ「無料期間のあと 年額 ¥12,800（税込）で自動更新」。
//   labels: テスト用の差し替え（既定は PLAN_LABELS）。
export function shortPriceLabel(label = '') {
  // 「年額 ¥12,800（税込・月あたり約¥1,066）」→「年額 ¥12,800（税込）」。括弧が無ければそのまま。
  const s = String(label || '').trim();
  const i = s.indexOf('（税込');
  if (i < 0) return s;
  const j = s.indexOf('）', i);
  return j < 0 ? s : `${s.slice(0, i)}（税込）${s.slice(j + 1)}`.trim();
}
export function trialRenewalLine({ priceId = '', trialEnd = '', labels = PLAN_LABELS } = {}) {
  const period = planPeriodOf(priceId);
  const when = trialEnd ? `${trialEnd}から` : '無料期間のあと';
  const price = period ? shortPriceLabel(labels?.[period]?.price) : '';
  if (!price) return `${when} プラン（自動更新）`;
  return `${when} ${price}で自動更新`;
}

// 無料期間のうちに解約すれば料金はかからない、を日付つきで（設定の「プラン・お支払い」・無料期間のときだけ）。
//   App Store は「終わる 24 時間前まで」に解約しないと更新される。cancelBy は終わる 24 時間前の日付（「10月3日」）。
export const TRIAL_CANCEL_HOURS = 24;
export function trialCancelNote(cancelBy = '') {
  return cancelBy
    ? `${cancelBy}（終わる ${TRIAL_CANCEL_HOURS} 時間前）までに解約すれば、料金はかかりません`
    : `無料期間が終わる ${TRIAL_CANCEL_HOURS} 時間前までに解約すれば、料金はかかりません`;
}
// 解約の期限（終わる 24 時間前）の時刻。終わる日時が分からなければ null。
export function trialCancelByTime(periodEnd) {
  const t = typeof periodEnd === 'number' ? periodEnd : Date.parse(periodEnd || '');
  return Number.isFinite(t) ? t - TRIAL_CANCEL_HOURS * 3600 * 1000 : null;
}
