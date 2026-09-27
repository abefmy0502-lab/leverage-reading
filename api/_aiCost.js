// 💴 AI の原価を円で見積もる・数えるための小道具（api/claude.js から使う）。
//
// 目的: 有料会員 1 人から毎月 ¥900 が手元に残るように（2026-09-27 に ¥1,000 → ¥900 へ）、1 人・1 か月の AI の原価に
// 上限を設ける（supabase_ai_cost.sql）。上限の既定は次の式で出す（env で上書き可）:
//
//   月額（税込）÷ 1.1（消費税）×（1 − App Store の手数料）− 残したい額
//   = 1,480 ÷ 1.1 × 0.85 − 900 ≈ ¥243
//
// App Store の手数料は、日本の小規模事業者プログラム（10%）＋App 内課金の決済（5%）＝15%
// （2025-12-18 からの日本の新しい条件）。年額プランは 1 か月あたりの手取りが ¥900 に
// 届かないが、オーナーの判断で例外として同じ上限を使う（2026-09-27）。
//
// 単位は「1/1000 円」（mjpy）の整数。DB（ai_usage.cost_mjpy）と同じ。

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

// Anthropic の価格（USD / 100 万トークン）。2026-09-27 に公式の価格表で確認。
// in=入力, cw=キャッシュ書き込み（5 分）, cr=キャッシュ読み出し, out=出力
export const PRICES = {
  'claude-sonnet-5': { in: 2, cw: 2.5, cr: 0.2, out: 10 },
  'claude-sonnet-4-6': { in: 3, cw: 3.75, cr: 0.3, out: 15 },
  'claude-haiku-4-5': { in: 1, cw: 1.25, cr: 0.1, out: 5 },
};
// 表に無いモデルは、表の中でいちばん高い値で数える（安全側）。
const FALLBACK_PRICE = { in: 3, cw: 3.75, cr: 0.3, out: 15 };

// 円換算（保守的に円安寄り）と、Anthropic の請求にかかる消費税。
export const USD_JPY = num(process.env.AI_USD_JPY, 160);
export const API_TAX_RATE = num(process.env.AI_API_TAX_RATE, 0.10);

export function monthlyBudgetJpy(env = process.env) {
  const direct = Number(env.AI_MONTHLY_BUDGET_JPY);
  if (Number.isFinite(direct) && direct >= 0) return Math.floor(direct);
  const price = num(env.AI_PLAN_PRICE_JPY, 1480);
  const fee = num(env.AI_STORE_FEE_RATE, 0.15);
  const target = num(env.AI_TARGET_NET_JPY, 900);
  return Math.max(0, Math.floor((price / 1.1) * (1 - fee) - target));
}

// 無料期間（App Store の 7 日間無料）中の上限。売上が無いので小さめ。
export function trialBudgetJpy(env = process.env) {
  return Math.max(0, Math.floor(num(env.AI_TRIAL_BUDGET_JPY, 50)));
}

const toMjpy = (usd) => Math.ceil(usd * USD_JPY * (1 + API_TAX_RATE) * 1000);

// 実際に使ったトークン数（Anthropic の usage）から原価を出す。
export function costFromUsage(model, usage = {}) {
  const p = PRICES[model] || FALLBACK_PRICE;
  const usd = (
    (num(usage.input_tokens, 0) * p.in)
    + (num(usage.cache_creation_input_tokens, 0) * p.cw)
    + (num(usage.cache_read_input_tokens, 0) * p.cr)
    + (num(usage.output_tokens, 0) * p.out)
  ) / 1e6;
  return toMjpy(usd);
}

// 呼ぶ前の見積もり（上振れ側）。入力は文字数 × 1.2 トークン（日本語）＋画像 1 枚 1,600
// トークン＋前置き 600 トークンを、キャッシュ書き込みの単価で。出力は max_tokens を全部使う前提。
export function estimateCost(model, { textChars = 0, images = 0, maxTokens = 0 } = {}) {
  const p = PRICES[model] || FALLBACK_PRICE;
  const inTok = Math.ceil(textChars * 1.2) + (images * 1600) + 600;
  const usd = ((inTok * p.cw) + (maxTokens * p.out)) / 1e6;
  return { total: toMjpy(usd), output: toMjpy((maxTokens * p.out) / 1e6) };
}

// SSE（ストリーム）を流しながら usage を拾う。chunk は Buffer / Uint8Array / 文字列。
export function createUsageSniffer() {
  let buf = '';
  const decoder = new TextDecoder();
  const usage = { seenStart: false, seenDelta: false };
  const onLine = (line) => {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw[0] !== '{') return;
    let ev;
    try { ev = JSON.parse(raw); } catch { return; }
    if (ev?.type === 'message_start' && ev.message?.usage) {
      Object.assign(usage, ev.message.usage);
      usage.seenStart = true;
    } else if (ev?.type === 'message_delta' && ev.usage) {
      // message_delta の usage は累計（output_tokens）
      if (Number.isFinite(ev.usage.output_tokens)) usage.output_tokens = ev.usage.output_tokens;
      usage.seenDelta = true;
    }
  };
  return {
    push(chunk) {
      // stream: true で、chunk の境目で割れた日本語の文字も正しくつなぐ
      buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        onLine(buf.slice(0, i).replace(/\r$/, ''));
        buf = buf.slice(i + 1);
      }
      if (buf.length > 1_000_000) buf = ''; // 異常に長い 1 行は捨てる
    },
    usage,
  };
}
