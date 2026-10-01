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

// 価格（USD / 100 万トークン）。in=入力, cw=キャッシュ書き込み（5 分）, cw1h=キャッシュ書き込み（1 時間）,
// cr=キャッシュ読み出し, out=出力。
// 出典は docs/ai-routing.md（2026-10-01 に各社の公式で確認）。
//   Anthropic: Sonnet 5 / 5.5 は $2 / $10（5.5 は 5 と同じ価格）、Haiku 4.5 は $1 / $5。
//   OpenAI: gpt-5-mini は $0.25 / $2（キャッシュ $0.025）。2026-12-11 に提供終了（後継 gpt-5.4-mini は $0.75 / $4.50）。
//     OpenAI と Google にはキャッシュ書き込みの割増が無いので cw = in。推論（reasoning）のトークンは出力として数える。
//   Google: gemini-3.1-flash-lite は $0.25 / $1.50（画像の入力も同じ単価・キャッシュ $0.025）。考える分のトークンも出力。
//   Anthropic のキャッシュ: 書き込みは 5 分＝入力の 1.25 倍・1 時間＝2 倍、読み出しは 0.1 倍（2026-10-01 に確認）。
export const PRICES = {
  'claude-sonnet-5-5': { in: 2, cw: 2.5, cw1h: 4, cr: 0.2, out: 10 },
  'claude-sonnet-5': { in: 2, cw: 2.5, cw1h: 4, cr: 0.2, out: 10 },
  'claude-sonnet-4-6': { in: 3, cw: 3.75, cw1h: 6, cr: 0.3, out: 15 },
  'claude-haiku-4-5': { in: 1, cw: 1.25, cw1h: 2, cr: 0.1, out: 5 },
  'gpt-5-mini': { in: 0.25, cw: 0.25, cw1h: 0.25, cr: 0.025, out: 2 },
  'gpt-5.4-mini': { in: 0.75, cw: 0.75, cw1h: 0.75, cr: 0.075, out: 4.5 },
  'gemini-3.1-flash-lite': { in: 0.25, cw: 0.25, cw1h: 0.25, cr: 0.025, out: 1.5 },
};
// 表に無いモデルは、表の中でいちばん高い値で数える（安全側）。
const FALLBACK_PRICE = Object.values(PRICES).reduce((m, p) => ({
  in: Math.max(m.in, p.in), cw: Math.max(m.cw, p.cw), cw1h: Math.max(m.cw1h, p.cw1h), cr: Math.max(m.cr, p.cr), out: Math.max(m.out, p.out),
}), { in: 0, cw: 0, cw1h: 0, cr: 0, out: 0 });

// モデル名 → 単価。日付つきの版（'claude-haiku-4-5-20251001' / 'gpt-5-mini-2025-08-07' など、応答に入ってくる名前）は
// いちばん長く一致する表の名前で数える。分からない名前は表でいちばん高い単価（安全側）。
export function hasPrice(model) {
  return typeof model === 'string' && !!matchPriceKey(model);
}
function matchPriceKey(model) {
  if (typeof model !== 'string' || !model) return null;
  if (PRICES[model]) return model;
  let best = null;
  for (const key of Object.keys(PRICES)) {
    if (model.startsWith(`${key}-`) && (!best || key.length > best.length)) best = key;
  }
  return best;
}
export function priceFor(model) {
  const key = matchPriceKey(model);
  return key ? PRICES[key] : FALLBACK_PRICE;
}

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

// キャッシュ書き込みのうち 1 時間の分（Anthropic の usage.cache_creation.ephemeral_1h_input_tokens）。
// 内訳が無いとき（古い応答・ほかの会社）は全部 5 分の単価で数える。
function cacheWriteSplit(usage) {
  const total = num(usage.cache_creation_input_tokens, 0);
  const cc = usage.cache_creation && typeof usage.cache_creation === 'object' ? usage.cache_creation : null;
  const w1h = cc ? Math.max(0, num(cc.ephemeral_1h_input_tokens, 0)) : 0;
  const w5m = cc && Number.isFinite(Number(cc.ephemeral_5m_input_tokens))
    ? Math.max(0, num(cc.ephemeral_5m_input_tokens, 0))
    : Math.max(0, total - w1h);
  return { w5m, w1h };
}

// 実際に使ったトークン数（Anthropic の形の usage。OpenAI / Google の usage は api/_providers.js がこの形に直す）から原価を出す。
// キャッシュの読み出しは 0.1 倍・書き込みは 5 分 1.25 倍／1 時間 2 倍（Anthropic）。
export function costFromUsage(model, usage = {}) {
  const p = priceFor(model);
  const { w5m, w1h } = cacheWriteSplit(usage);
  const usd = (
    (num(usage.input_tokens, 0) * p.in)
    + (w5m * p.cw)
    + (w1h * p.cw1h)
    + (num(usage.cache_read_input_tokens, 0) * p.cr)
    + (num(usage.output_tokens, 0) * p.out)
  ) / 1e6;
  return toMjpy(usd);
}

// 呼ぶ前の見積もり（上振れ側）。入力は文字数 × 1.2 トークン（日本語）＋画像 1 枚 1,600
// トークン＋前置き 600 トークン。出力は max_tokens を全部使う前提。
// segments（cacheSegments の返り値）があれば、キャッシュの印より前の文字は書き込みの単価（読み出しになるかは
// 分からないので高いほう）、印の後ろの文字はふつうの入力の単価で数える（2026-10-01・予約を盛りすぎない）。
// 無ければ今までどおり全部を 5 分の書き込みの単価で（上振れ側）。
export function estimateCost(model, { textChars = 0, images = 0, maxTokens = 0, segments = null } = {}) {
  const p = priceFor(model);
  let inUsd;
  if (segments && typeof segments === 'object') {
    const tok = (c) => Math.ceil(Math.max(0, num(c, 0)) * 1.2);
    const w1h = tok(segments.w1h);
    const w5m = tok(segments.w5m);
    const plain = Math.max(0, Math.ceil(textChars * 1.2) - w1h - w5m) + (images * 1600) + 600;
    inUsd = (w1h * p.cw1h) + (w5m * p.cw) + (plain * p.in);
  } else {
    inUsd = (Math.ceil(textChars * 1.2) + (images * 1600) + 600) * p.cw;
  }
  const usd = (inUsd + (maxTokens * p.out)) / 1e6;
  return { total: toMjpy(usd), output: toMjpy((maxTokens * p.out) / 1e6) };
}

// 送る中身（Anthropic の形の body）を、キャッシュの印（cache_control）ごとに文字数で分ける（見積もり用）。
//   並びは system → messages（Anthropic が読む順）。印のついたブロックまでの文字はキャッシュに書かれうる。
//   systemTtl: system の印の長さ（'1h' / '5m'。中継が相談の指示文を 1 時間にする＝consultSystemTtl）。
//   messages の印は 5 分（中継が ttl を外して送る）。
// 返り値 { w1h, w5m }: 1 時間の印までの文字数／そこから最後の 5 分の印までの文字数。
export function cacheSegments(body, { systemTtl = '5m' } = {}) {
  let pos = 0;
  let last1h = 0;
  let lastAny = 0;
  const visit = (b, ttl) => {
    if (typeof b === 'string') { pos += b.length; return; }
    if (!b || typeof b !== 'object') return;
    if (typeof b.text === 'string') pos += b.text.length;
    if (b.cache_control && b.cache_control.type === 'ephemeral') {
      if (ttl === '1h') last1h = pos;
      lastAny = pos;
    }
  };
  const sys = body?.system;
  if (typeof sys === 'string') pos += sys.length;
  else if (Array.isArray(sys)) for (const b of sys) visit(b, systemTtl === '1h' ? '1h' : '5m');
  for (const m of Array.isArray(body?.messages) ? body.messages : []) {
    const c = m?.content;
    if (typeof c === 'string') pos += c.length;
    else if (Array.isArray(c)) for (const b of c) visit(b, '5m');
  }
  return { w1h: last1h, w5m: Math.max(0, lastAny - last1h) };
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
  // 応答に入っているモデル名（message_start の message.model）。原価はこの名前で数える（別名が別の版に変わっても単価がずれない）。
  const meta = { model: null };
  const answer = { text: '', length: 0, truncated: false, stopReason: null, stopped: false };
  const onLine = (line) => {
    if (!line.startsWith('data:')) return;
    const raw = line.slice(5).trim();
    if (!raw || raw[0] !== '{') return;
    let ev;
    try { ev = JSON.parse(raw); } catch { return; }
    if (ev?.type === 'message_start' && typeof ev.message?.model === 'string') meta.model = ev.message.model;
    if (ev?.type === 'message_start' && ev.message?.usage) {
      Object.assign(usage, ev.message.usage);
      usage.seenStart = true;
    } else if (ev?.type === 'message_delta' && ev.usage) {
      // message_delta の usage は累計（output_tokens）。入力の数が入っていれば、それも最終の値として使う
      // （OpenAI / Google の答えは最後にしか入力の数が分からないので、api/_providers.js がここに入れる）。
      if (Number.isFinite(ev.usage.output_tokens)) usage.output_tokens = ev.usage.output_tokens;
      for (const k of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
        if (Number.isFinite(ev.usage[k])) usage[k] = ev.usage[k];
      }
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
    meta,
  };
}
