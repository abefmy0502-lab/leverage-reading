// 💴 AI の原価を円で見積もる・数えるための小道具（api/claude.js から使う）。
//
// 目的: 有料会員 1 人から毎月 ¥900 が手元に残るように（2026-09-27 に ¥1,000 → ¥900 へ）、1 人・1 か月の AI の原価に
// 上限を設ける（supabase_ai_cost.sql）。上限の天井は次の式（monthlyBudgetJpy）:
//
//   月額（税込）÷ 1.1（消費税）×（1 − App Store の手数料）− 残したい額
//   = 1,480 ÷ 1.1 × 0.85 − 900 ≈ ¥243
//
// 2026-09-27 から、使える量は「トークン」で決めて見せる（api/_aiAccess.js）。有料は 800 トークン
// × ¥0.3 ＝ ¥240 で、この天井の内側（テストで確かめる）。AI_MONTHLY_BUDGET_JPY を入れたときは
// そちらが有料の上限になる（円 ÷ AI_TOKEN_JPY トークン）。
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

// 答えの文を覚えておく上限（字）。相談の「関係するメモが無い」判定（api/_aiAccess.js の
// isNoInfoConsultAnswer）に使うだけなので、答えの長さの上限（900 字）＋ REFS が入れば足りる。
export const ANSWER_CAPTURE_CHARS = 6000;

// SSE（ストリーム）を流しながら usage を拾う。chunk は Buffer / Uint8Array / 文字列。
// あわせて答えの文（先頭 ANSWER_CAPTURE_CHARS 字）・全体の長さ・停止理由・message_stop の有無も拾う（answer）。
export function createUsageSniffer() {
  let buf = '';
  const decoder = new TextDecoder();
  const usage = { seenStart: false, seenDelta: false };
  const answer = { text: '', length: 0, truncated: false, stopReason: null, stopped: false };
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
    if (ev?.type === 'message_delta' && ev.delta?.stop_reason) {
      answer.stopReason = ev.delta.stop_reason;
    } else if (ev?.type === 'message_stop') {
      answer.stopped = true;
    } else if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
      answer.length += ev.delta.text.length;
      if (answer.text.length < ANSWER_CAPTURE_CHARS) {
        answer.text += ev.delta.text.slice(0, ANSWER_CAPTURE_CHARS - answer.text.length);
      }
      if (answer.length > ANSWER_CAPTURE_CHARS) answer.truncated = true;
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
    answer,
  };
}
