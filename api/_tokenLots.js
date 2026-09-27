// 🪙➕ 追加トークン（買い足し・2026-09-27 オーナー裁定）。api/claude.js と api/revenuecat-webhook.js から使う純粋関数。
//
// - 買えるのはプランの人（有料・7 日間無料）だけ。App Store の消耗型（consumable）の App 内課金を
//   RevenueCat で売る（iOS だけ）。商品と量はここ（サーバー）と src/lib/tokens.js（画面）の 2 か所。
// - 使う順: その月（無料期間はその期間）のトークン → 追加分。追加分は期限の近いものから（FIFO）。
// - 期限: 購入から 180 日（資金決済法: 有効期限 6 か月以内の前払いは前払式支払手段の義務の対象外）。
// - データ: supabase_ai_token_credits.sql（ai_token_lots・credit_token_lot・consume_token_lots・
//   settle_token_overflow・ai_usage.lot_tokens）。未適用なら、追加分は無いものとして今までどおり動く。
// - 追加分はプランをやめても期限までは相談に使える（無料プランは相談だけ）。

export const TOKEN_LOT_DAYS = 180; // 法令の上限（6 か月）を超えない。SQL 側でも同じ日数

// 商品（product id → トークン）。env AI_TOKEN_PACKS='orime_tokens_300:300,orime_tokens_1000:1000' で上書き。
export const DEFAULT_TOKEN_PACKS = [
  { id: 'orime_tokens_300', tokens: 300 },
  { id: 'orime_tokens_1000', tokens: 1000 },
];
export function tokenPacks(env = process.env) {
  const raw = typeof env?.AI_TOKEN_PACKS === 'string' ? env.AI_TOKEN_PACKS.trim() : '';
  if (!raw) return DEFAULT_TOKEN_PACKS;
  const packs = raw.split(',').map((p) => {
    const [id, n] = p.split(':').map((x) => (x || '').trim());
    const tokens = Math.floor(Number(n));
    return id && Number.isFinite(tokens) && tokens > 0 ? { id, tokens } : null;
  }).filter(Boolean);
  return packs.length ? packs : DEFAULT_TOKEN_PACKS;
}
export function packForProduct(productId, env = process.env) {
  return tokenPacks(env).find((p) => p.id === productId) || null;
}

const ts = (v) => {
  const t = typeof v === 'number' ? v : Date.parse(v || '');
  return Number.isFinite(t) ? t : NaN;
};

// 使える（残りがあって期限内の）ロットを、期限の近い順に。
export function activeLots(lots, now = Date.now()) {
  return (Array.isArray(lots) ? lots : [])
    .filter((l) => l && Number(l.tokens_left) > 0 && ts(l.expires_at) > now)
    .sort((a, b) => (ts(a.expires_at) - ts(b.expires_at))
      || (ts(a.purchased_at) - ts(b.purchased_at))
      || String(a.id).localeCompare(String(b.id)));
}

// 追加分の残り（期限内の合計）と、いちばん近い期限。
export function lotBalance(lots, now = Date.now()) {
  const act = activeLots(lots, now);
  return {
    balance: act.reduce((n, l) => n + Math.floor(Number(l.tokens_left) || 0), 0),
    nextExpiry: act.length ? act[0].expires_at : null,
  };
}

// FIFO（期限の近い順）で tokens を差し引く計画（consume_token_lots と同じ順）。負にしない。
export function planLotConsumption(lots, tokens, now = Date.now()) {
  let need = Math.max(0, Math.floor(Number(tokens) || 0));
  const takes = [];
  for (const l of activeLots(lots, now)) {
    if (need <= 0) break;
    const take = Math.min(Math.floor(Number(l.tokens_left)), need);
    if (take > 0) { takes.push({ id: l.id, take }); need -= take; }
  }
  return { takes, consumed: takes.reduce((n, t) => n + t.take, 0), short: need };
}

// その期間に使えるトークンの合計＝その月の分＋この期間にもう追加分から払った分＋追加分の残り。
export function effectiveAllowance(monthlyAllowance, { charged = 0, balance = 0 } = {}) {
  return Math.max(0, monthlyAllowance) + Math.max(0, charged) + Math.max(0, balance);
}

// 精算のあと、追加分から新たに払う量（settle_token_overflow と同じ式）。
//   usedTokens: その期間に使ったトークン（切り上げ）/ charged: この期間にもう追加分から払った量
export function overflowToCharge({ usedTokens, allowance, charged = 0 }) {
  return Math.max(0, Math.max(0, usedTokens - allowance) - Math.max(0, charged));
}

// RevenueCat の webhook イベント → 追加の記録。
//   戻り値 { credit: { userId, transactionId, productId, tokens, purchasedAt, environment } } | { skip: 理由 }
//   二重に足さない鍵は transaction_id（ai_token_lots.transaction_id UNIQUE）。
//   SANDBOX（TestFlight・App 審査）も足す: 審査官が買ったトークンが届かないと却下になるため。
//   RC_SANDBOX_TOKENS=false で止められる。サンドボックスの分は environment='sandbox' で見分けられる。
export function tokenCreditFromEvent(event, { env = process.env, isUserId = () => true } = {}) {
  if (!event || typeof event !== 'object') return { skip: 'no_event' };
  if (event.type !== 'NON_RENEWING_PURCHASE') return { skip: 'not_consumable' };
  const pack = packForProduct(event.product_id, env);
  if (!pack) return { skip: 'not_token_pack' };
  const sandbox = event.environment === 'SANDBOX';
  if (sandbox && env?.RC_SANDBOX_TOKENS === 'false') return { skip: 'sandbox' };
  const userId = event.app_user_id;
  if (!userId || !isUserId(userId)) return { skip: 'unresolvable_app_user_id' };
  const transactionId = String(event.transaction_id || event.original_transaction_id || event.id || '');
  if (!transactionId) return { skip: 'no_transaction_id' };
  const purchasedMs = Number(event.purchased_at_ms);
  return {
    credit: {
      userId,
      transactionId,
      productId: pack.id,
      tokens: pack.tokens,
      purchasedAt: Number.isFinite(purchasedMs) && purchasedMs > 0 ? new Date(purchasedMs).toISOString() : new Date().toISOString(),
      environment: sandbox ? 'sandbox' : 'production',
    },
  };
}

export function isTokenPackEvent(event, env = process.env) {
  return !!event && event.type === 'NON_RENEWING_PURCHASE' && !!packForProduct(event.product_id, env);
}
