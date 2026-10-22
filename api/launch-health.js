// 🚀 公開の準備（売上までの関門）— 管理者だけに「設定されているか」を真偽で返す（2026-10-22）。
//
// GET /api/launch-health  Authorization: Bearer <利用者の JWT>
//   → { env: { [key]: boolean }, sql: { [key]: boolean }, admin: boolean, checkedAt }
//
// 決まり:
//   - 鍵の中身・URL・利用者の情報は返さない（真偽だけ）。それでも設定の形が分かるので、app_admins にいる人だけ。
//   - SQL は「表が読める・列がある・関数がある」を service_role で確かめる。行は書かない（関数は失敗する引数で呼ぶ）。
//   - 一覧は api/_launchHealthKeys.js（src/lib/launchGates.js と一致＝テスト）。
//   - 1 人 1 分 6 回まで。service_role が無ければ sql は全部 false・admin は false（画面は「確かめられませんでした」）。
import { createClient } from '@supabase/supabase-js';
import { applyCors } from './_cors.js';
import { HEALTH_ENV, HEALTH_ENV_FLAGS, HEALTH_SQL } from './_launchHealthKeys.js';

const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 6;
const rate = new Map();
function allow(userId) {
  const now = Date.now();
  const arr = (rate.get(userId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) return false;
  arr.push(now);
  rate.set(userId, arr);
  return true;
}

function bearer(req) {
  const raw = req.headers?.authorization || '';
  return typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7).trim() || null : null;
}

let anonClient = null;
let serviceClient = null;
function getAnon() {
  if (anonClient) return anonClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  anonClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return anonClient;
}
function getService() {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return serviceClient;
}

export function envHealth(env = process.env) {
  const out = {};
  for (const [k, vars] of Object.entries(HEALTH_ENV)) out[k] = vars.every((v) => Boolean(String(env[v] || '').trim()));
  for (const [k, fn] of Object.entries(HEALTH_ENV_FLAGS)) out[k] = Boolean(fn());
  return out;
}

const MISSING_RELATION = new Set(['42P01', 'PGRST205', 'PGRST204']);
const MISSING_COLUMN = new Set(['42703']);
const MISSING_FUNCTION = new Set(['42883', 'PGRST202']);
function isMissing(error, sets) {
  if (!error) return false;
  if (sets.has(error.code)) return true;
  return /could not find|does not exist/i.test(error.message || '');
}

// 1 つの SQL の有無を確かめる。失敗は false（無いか、確かめられない）。
export async function probeSql(client, spec) {
  try {
    if (spec.rpc) {
      const { error } = await client.rpc(spec.rpc, spec.args || {});
      if (!error) return true;
      return !isMissing(error, MISSING_FUNCTION);
    }
    const col = spec.column || 'id';
    const { error } = await client.from(spec.table).select(col).limit(0);
    if (!error) return true;
    if (isMissing(error, MISSING_RELATION)) return false;
    if (spec.column && isMissing(error, MISSING_COLUMN)) return false;
    // 表はあるが id 列が無い表（PK が別の名前）でも「ある」とみなす。
    return !spec.column;
  } catch {
    return false;
  }
}

export async function sqlHealth(client) {
  const out = {};
  await Promise.all(Object.entries(HEALTH_SQL).map(async ([k, spec]) => { out[k] = client ? await probeSql(client, spec) : false; }));
  return out;
}

export default async function handler(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const anon = getAnon();
  if (!anon) return res.status(500).json({ error: 'Supabase not configured' });
  const { data: userData, error: userError } = await anon.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!allow(userId)) return res.status(429).json({ error: 'Too many requests' });

  const service = getService();
  let admin = false;
  if (service) {
    const { data } = await service.from('app_admins').select('user_id').eq('user_id', userId).limit(1);
    admin = Array.isArray(data) && data.length > 0;
  }
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const env = envHealth();
  const sql = await sqlHealth(service);
  return res.status(200).json({ env, sql, admin, checkedAt: new Date().toISOString() });
}
