// ✉️ 公開のお知らせの登録（LP・App Store の URL が無い間だけ出る入口・2026-10-05）。
//
// 送り手: src/pages/LpWaitlist.jsx（未ログインの訪問者がメールを 1 つ入れて「送る」を押したとき）。
// 受け取ったものは信用しない: メールの形と長さを確かめ、表示の型（variant）と utm は許可した形だけを残し、
// service_role で lp_waitlist に入れる。同じメールは 1 行だけ（UNIQUE・2 回目は何もしないで「受け付けた」と返す＝
// 登録済みかどうかを外に漏らさない）。IP は保存しない。同じ IP からの連打は 1 分 5 回まで（インスタンス内の簡易制限・
// api/lp-event.js と同じ形）＋1 日（日本時間）5 回まで（DB で数える・IP の代わりに日付つきのハッシュだけを入れる＝
// supabase_lp_waitlist.sql の take_lp_waitlist_slot・2026-10-11。表が無い・つながらないときは数えずに通す）。メールは公開のお知らせを送るためだけに使う（プライバシーポリシー）。
// Do Not Track の端末からも送れる（本人がボタンを押して送るもので、閲覧の記録ではないため）。
//
// 返す形（画面はこれで出し分ける）:
//   200 { ok: true }                         … 受け付けた（同じメールの 2 回目も）
//   400 { ok: false, error: 'invalid_email' } … メールの形が違う
//   429 { ok: false, error: 'rate_limited' }  … 短い間に送りすぎ
//   503 { ok: false, error: 'unavailable' }   … いま保存できない（設定が無い・表が無い・つながらない）
// テーブル: supabase_lp_waitlist.sql

import { createClient } from '@supabase/supabase-js';
import { clientIp, ipHash } from './_clientIp.js';

// ヒーローの表示方式（src/lib/lpTrack.js の lpVariant・supabase_lp_events.sql / supabase_lp_waitlist.sql の variant の CHECK と同じ）。
// 2026-10-11: 'illust'（いろいろな本と対話するイラスト）を足した。'3d' は ?hero=3d のときだけ。
export const LP_VARIANTS = ['3d', 'photo', 'illust'];

const LIMIT_PER_MIN = 5;
export const LIMIT_PER_DAY = 5;

// 日本時間の日付（'YYYY-MM-DD'）。
export function jstDay(now = Date.now()) {
  return new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
}
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
  const ip = clientIp(req);
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
    variant: LP_VARIANTS.includes(body.variant) ? body.variant : null,
    utm_source: str(body.utm_source, 64),
    utm_medium: str(body.utm_medium, 64),
    utm_campaign: str(body.utm_campaign, 64),
  };
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    // 1 日の回数（DB・どのインスタンスでも同じ数）。IP はハッシュにしてから渡す（保存しない）。
    const day = jstDay();
    const hash = ipHash(ip, day, process.env.LP_IP_SALT || key);
    if (hash) {
      const { data: allowed, error: rateErr } = await supabase.rpc('take_lp_waitlist_slot', { p_ip_hash: hash, p_day: day, p_limit: LIMIT_PER_DAY });
      if (rateErr) console.warn('[lp-waitlist] rate check skipped', rateErr.code || '');
      else if (allowed === false) return reply(res, 429, { ok: false, error: 'rate_limited' });
    }
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
