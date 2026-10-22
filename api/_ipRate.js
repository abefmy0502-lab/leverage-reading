// 🚦 認証の前の IP ごとの回数制限（2026-10-22 セキュリティ監査・中 1）。
//   Bearer を確かめる前（auth.getUser の前）に置き、でたらめなトークンの連打で Supabase Auth の枠を
//   食いつぶされて正規の利用者が巻き添えになるのを防ぐ。インスタンス内の固定窓（1 分）・IP は数えるだけで保存しない。
//   肥大したら期限切れのキーだけ掃く（全員ぶんを消さない）。
import { clientIp } from './_clientIp.js';

const WINDOW_MS = 60_000;
const SWEEP_AT = 5000;
const store = new Map();

function sweep(now) {
  for (const [k, rec] of store) if (now - rec.start > WINDOW_MS) store.delete(k);
}

// 戻り値 { ok, retryAfter }。max 回/分 を超えると ok=false。
export function takeIpSlot(req, { max = 60, bucket = '' } = {}) {
  const now = Date.now();
  const key = `${bucket}|${clientIp(req)}`;
  const rec = store.get(key);
  if (!rec || now - rec.start > WINDOW_MS) {
    store.set(key, { start: now, n: 1 });
    if (store.size > SWEEP_AT) sweep(now);
    return { ok: true, retryAfter: 0 };
  }
  rec.n += 1;
  if (rec.n > max) return { ok: false, retryAfter: Math.max(1, Math.ceil((WINDOW_MS - (now - rec.start)) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

// 429 を返す定型（JSON）。呼び出し側は `if (ipGate(req, res, opts)) return;`。
export function ipGate(req, res, opts) {
  const r = takeIpSlot(req, opts);
  if (r.ok) return false;
  res.setHeader('Retry-After', String(r.retryAfter));
  res.setHeader('Cache-Control', 'no-store');
  res.status(429).json({ error: { message: '短い時間にたくさん送られました。少し待ってから、もう一度お試しください。' }, error_code: 'rate_limited', retry_after: r.retryAfter });
  return true;
}

export function _resetIpRateForTests() { store.clear(); }
