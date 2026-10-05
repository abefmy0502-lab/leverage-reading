// 🎁 無料期間の書き方だけ（何も import しない・2026-10-05）。
// 紹介ページ（LP）がこれだけを読むために trialNudge.js から分けた（trialNudge → billing → supabase の
// 依存で、LP に Supabase のクライアントが入り込んでいた）。trialNudge.js は同じ関数をここから再 export する。
// ストア（iap.js）・LP の env（VITE_TRIAL_NOTE）・お試しモードの &trial= から来る文字をそろえる。

// 「7日間無料」→「7 日間無料」
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
