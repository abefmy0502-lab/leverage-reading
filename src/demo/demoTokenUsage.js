// 🧪 お試しモード（開発専用）: トークンの使い方のシート（TokenUsageSheet.jsx・2026-10-11）を撮るためのデータ。
//
//   - 使った量のある ai_usage の行に、使い道の内訳（purpose_mjpy）のサンプルを入れる（無料プランは相談とこの本で学べることだけ）
//   - ?demo=low      : プラン・今月の 800 トークンのうち 660 を使った（残り 140＝枠の 20% 以下＝相談の上の行が --warning）
//   - ?demo=freelow  : 無料プラン・今月の 30 トークンのうち 24 を使った（残り 6）
//   - ?demo=tokens   : 追加分をもう 1 つ（期限の近い順の確かめ用）
//   - &usage=nopurpose : 内訳の列が無い DB（supabase_ai_usage_purpose.sql 未適用）＝内訳の段を出さない
//   - &usage=before    : 内訳を数えはじめる前に使った分がある（「内訳を数える前の分」の行）

const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

// 用途ごとの割合（足して 1）。
const PAID_MIX = [['consult', 0.52], ['book_advisor', 0.12], ['advisor_interview', 0.06], ['setup_sheet', 0.11], ['setup_sheet_edit', 0.03], ['book_brief', 0.05], ['ocr', 0.07], ['condense', 0.02], ['cards_to_summary', 0.02]];
const FREE_MIX = [['consult', 0.86], ['book_brief', 0.14]];

function mixOf(cost, mix) {
  const out = {};
  let left = cost;
  mix.forEach(([k, r], i) => {
    const v = i === mix.length - 1 ? left : Math.round(cost * r);
    out[k] = v;
    left -= v;
  });
  return out;
}

export function applyTokenUsageDemo(db, scenario, params, userId) {
  const jstMonth = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  if (scenario === 'low') {
    db.ai_usage = [{ user_id: userId, period_month: jstMonth, calls: 66, cost_mjpy: 198000 }];
  }
  if (scenario === 'freelow') {
    db.subscriptions = [];
    db.ai_usage = [
      { user_id: userId, period_month: `free-${jstMonth}`, calls: 3, cost_mjpy: 7200 },
      { user_id: userId, period_month: `freeocr-${jstMonth}`, calls: 2, cost_mjpy: 0 },
    ];
  }
  if (scenario === 'tokens' && Array.isArray(db.ai_token_lots)) {
    db.ai_token_lots.push({
      id: '00000000-0000-4000-8000-0000000d0002', user_id: userId, tokens_total: 1000, tokens_left: 1000,
      source: 'iap', transaction_id: 'demo-seed-2', product_id: 'orime_tokens_1000', environment: 'sandbox',
      purchased_at: iso(4), expires_at: iso(-176),
    });
  }
  const mode = params.get('usage');
  if (mode === 'nopurpose') return;
  const free = !(db.subscriptions || []).some((s) => s.status === 'active');
  for (const row of db.ai_usage || []) {
    if (!row || /^(freeocr|refund)-/.test(row.period_month) || !(row.cost_mjpy > 0)) continue;
    // &usage=before: 4 割は内訳を数えはじめる前に使った（内訳に入れない）。
    const counted = mode === 'before' ? Math.round(row.cost_mjpy * 0.6) : row.cost_mjpy;
    row.purpose_mjpy = mixOf(counted, free ? FREE_MIX : PAID_MIX);
  }
}

// AI を使ったとき（demoFetch.js）: その 1 回の原価を用途に足す（api/claude.js の add_ai_purpose_cost と同じ）。
export function addDemoPurposeCost(row, purpose, mjpy) {
  if (!row || !(mjpy > 0)) return;
  const known = ['consult', 'book_advisor', 'advisor_interview', 'setup_sheet', 'setup_sheet_edit', 'book_brief', 'ops_advise', 'condense', 'cards_to_summary', 'ocr'];
  const key = known.includes(purpose) ? purpose : 'other';
  row.purpose_mjpy = { ...(row.purpose_mjpy || {}) };
  row.purpose_mjpy[key] = (row.purpose_mjpy[key] || 0) + mjpy;
}
