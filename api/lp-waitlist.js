// ✉️ 公開のお知らせの登録（LP・App Store の URL が無い間だけ出る入口・2026-10-05）。
//
// 送り手: src/pages/LpWaitlist.jsx（未ログインの訪問者がメールを 1 つ入れて「送る」を押したとき）。
// 受け取ったものは信用しない: メールの形と長さを確かめ、表示の型（variant）と utm は許可した形だけを残し、
// service_role で lp_waitlist に入れる。同じメールは 1 行だけ（UNIQUE・2 回目は何もしないで「受け付けた」と返す＝
// 登録済みかどうかを外に漏らさない）。IP は保存しない。同じ IP からの連打は 1 分 5 回まで（インスタンス内の簡易制限・
// api/lp-event.js と同じ形）。メールは公開のお知らせを送るためだけに使う（プライバシーポリシー）。
// Do Not Track の端末からも送れる（本人がボタンを押して送るもので、閲覧の記録ではないため）。
//
// 返す形（画面はこれで出し分ける）:
//   200 { ok: true }                         … 受け付けた（同じメールの 2 回目も）
//   400 { ok: false, error: 'invalid_email' } … メールの形が違う
//   429 { ok: false, error: 'rate_limited' }  … 短い間に送りすぎ
//   503 { ok: false, error: 'unavailable' }   … いま保存できない（設定が無い・表が無い・つながらない）
// テーブル: supabase_lp_waitlist.sql

import { createClient } from '@supabase/supabase-js';

const LIMIT_PER_MIN = 5;
const hits = new Map();

export function rateLimited(ip, now = Date.now()) {
  const rec = hits.get(ip);
  if (!rec || now - rec.start > 60_000) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  rec.n += 1;
  return rec.n > LIMIT_PER_MIN;
}
export function resetRateLimit() { hits.clear(); }

// メールの形（ゆるく・ただし空白や @ が 2 つは弾く）。全体 254 字・@ の前 64 字まで（RFC 5321）。
// 小文字にそろえて 1 人 1 行にする。
export function normalizeEmail(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s.length < 6 || s.length > 254) return null;
  const m = s.match(/^([^\s@"'<>(),;:\\[\]]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/);
  if (!m) return null;
  if (m[1].length > 64) return null;
  if (/^\.|\.\.|\.$/.test(m[1])) return null;
  if (m[2].split('.').some((p) => !p || p.startsWith('-') || p.endsWith('-'))) return null;
  if (!/^[a-z]{2,}$/.test(m[2].split('.').pop())) return null;
  return s;
}

const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string' && b.length <= 2048) {
    try { return JSON.parse(b); } catch { return null; }
  }
  return null;
}

const reply = (res, status, body) => {
  res.setHeader?.('Cache-Control', 'no-store');
  return res.status(status).json(body);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const ip = String((req.headers?.['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
  if (rateLimited(ip)) return reply(res, 429, { ok: false, error: 'rate_limited' });

  const body = parseBody(req);
  if (!body) return reply(res, 400, { ok: false, error: 'invalid_email' });
  // 人には見えない欄（website）に何か入っていたら機械の送信。保存せずに「受け付けた」と返す。
  if (typeof body.website === 'string' && body.website.trim()) return reply(res, 200, { ok: true });
  const email = normalizeEmail(body.email);
  if (!email) return reply(res, 400, { ok: false, error: 'invalid_email' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply(res, 503, { ok: false, error: 'unavailable' });

  const row = {
    email,
    variant: body.variant === '3d' || body.variant === 'photo' ? body.variant : null,
    utm_source: str(body.utm_source, 64),
    utm_medium: str(body.utm_medium, 64),
    utm_campaign: str(body.utm_campaign, 64),
  };
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    // 同じメールは 1 行（2 回目は何もしない＝最初に登録した日時と流入元を残す）。
    const { error } = await supabase.from('lp_waitlist').upsert(row, { onConflict: 'email', ignoreDuplicates: true });
    if (error) {
      console.warn('[lp-waitlist] insert failed', error.code || '', String(error.message || '').slice(0, 120));
      return reply(res, 503, { ok: false, error: 'unavailable' });
    }
  } catch (e) {
    console.warn('[lp-waitlist] unavailable', String(e?.message || '').slice(0, 120));
    return reply(res, 503, { ok: false, error: 'unavailable' });
  }
  return reply(res, 200, { ok: true });
}
