// 📊 LP（紹介ページ）の閲覧状況を 1 件受け取って lp_events に書く（未ログインの訪問者から呼ばれる）。
//
// 送り手: src/lib/lpTrack.js（navigator.sendBeacon）。受け取ったものは信用せず、
// イベント名は許可リスト、値は型と長さで絞ってから service_role で insert する。
// IP・入力文は保存しない。同じ IP からの連打は 1 分 60 件までに抑える（インスタンス内の簡易制限）。
// 失敗しても訪問者には関係ないので、常に 204 を返す（内部情報を返さない）。
// テーブル: supabase_lp_events.sql（未適用なら insert が失敗するだけ）。

import { createClient } from '@supabase/supabase-js';

const EVENTS = new Set(['lp_view', 'cta_click', 'demo_pick', 'demo_ask', 'demo_add', 'scroll_depth', 'faq_open', 'hero_3d']);
const LIMIT_PER_MIN = 60;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > 60_000) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  rec.n += 1;
  return rec.n > LIMIT_PER_MIN;
}

const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);

function cleanProps(p) {
  const out = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
  Object.entries(p).slice(0, 8).forEach(([k, v]) => {
    if (!/^[a-z_]{1,24}$/.test(k)) return;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && v.length <= 40) out[k] = v;
  });
  return out;
}

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string' && b.length <= 2048) {
    try { return JSON.parse(b); } catch { return null; }
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'unknown');
  if (rateLimited(ip)) return res.status(204).end();

  const body = parseBody(req);
  if (!body || !EVENTS.has(body.event)) return res.status(204).end();
  const session = str(body.session_id, 40);
  if (!session || !/^[a-z0-9-]{8,40}$/i.test(session)) return res.status(204).end();

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(204).end();

  const row = {
    session_id: session,
    event: body.event,
    variant: body.variant === '3d' || body.variant === 'photo' ? body.variant : null,
    props: cleanProps(body.props),
    device: body.device === 'mobile' || body.device === 'desktop' ? body.device : null,
    ref_host: str(body.ref_host, 100),
    utm_source: str(body.utm_source, 64),
    utm_medium: str(body.utm_medium, 64),
    utm_campaign: str(body.utm_campaign, 64),
  };

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    await supabase.from('lp_events').insert(row);
  } catch { /* 記録できなくても訪問者には影響させない */ }
  return res.status(204).end();
}
