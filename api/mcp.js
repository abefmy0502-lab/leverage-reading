// 🔌 AI と連携（MCP）の入口（2026-11-07）。Streamable HTTP（JSON の応答だけ・SSE の流しは持たない）。
//
//   POST https://orime.vercel.app/api/mcp          Authorization: Bearer orime_mcp_…
//   POST https://orime.vercel.app/mcp/orime_mcp_…  （URL にキー・Claude.ai や ChatGPT の「カスタムコネクタ」用＝vercel.json の rewrite）
//   GET  → 405（押し出しの流しは無い）・DELETE → 204（会話は持たないので消すものが無い）
//
// 決まり:
//   - 認証の前に IP ごとの回数制限（api/_ipRate.js）・本人ごと 1 分 120 回。
//   - キーが無い／違う → 401 ＋ WWW-Authenticate（MCP のクライアントが「キーが要る」と分かる）。
//   - 本体は api/_mcp.js（テストはそちら）。service_role で読み書きし、いつも本人の user_id で絞る。
//   - 利用者ごとの応答なので Cache-Control: no-store。
import { createClient } from '@supabase/supabase-js';
import { ipGate } from './_ipRate.js';
import { handleBatch, resolveToken, touchToken, looksLikeToken, PROTOCOL_VERSION } from './_mcp.js';
import { searchBooksServer } from './_bookSearch.js';

const USER_WINDOW_MS = 60 * 1000;
const USER_MAX = 120;
const userRate = new Map();
function allowUser(userId) {
  const now = Date.now();
  const arr = (userRate.get(userId) || []).filter((t) => now - t < USER_WINDOW_MS);
  if (arr.length >= USER_MAX) return false;
  arr.push(now);
  userRate.set(userId, arr);
  if (userRate.size > 5000) for (const [k, v] of userRate) if (!v.some((t) => now - t < USER_WINDOW_MS)) userRate.delete(k);
  return true;
}

let serviceClient = null;
function getService() {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return serviceClient;
}

export function tokenOf(req) {
  const raw = req.headers?.authorization || '';
  if (typeof raw === 'string' && raw.startsWith('Bearer ')) return raw.slice(7).trim();
  const q = req.query?.key;
  if (typeof q === 'string' && q) return q;
  return null;
}

function unauthorized(res) {
  res.setHeader('WWW-Authenticate', 'Bearer realm="orime", error="invalid_token"');
  return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: '接続キーが無いか、取り消されています。Orime の設定 →「AI と連携」でキーを作り直してください。' } });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('MCP-Protocol-Version', PROTOCOL_VERSION);
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  if (req.method === 'DELETE') return res.status(204).end();
  if (req.method === 'GET') { res.setHeader('Allow', 'POST, DELETE, OPTIONS'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, DELETE, OPTIONS'); return res.status(405).json({ error: 'Method not allowed' }); }

  if (ipGate(req, res, { max: 240, bucket: 'mcp' })) return;
  const token = tokenOf(req);
  if (!looksLikeToken(token)) return unauthorized(res);
  const db = getService();
  if (!db) return res.status(503).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'いま使えません。' } });
  const who = await resolveToken(db, token);
  if (!who) return unauthorized(res);
  if (!allowUser(who.userId)) { res.setHeader('Retry-After', '30'); return res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: '短い時間にたくさん送られました。少し待ってください。' } }); }
  touchToken(db, who).catch(() => {});

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });

  // add_book の書誌の検索は、本の検索と同じサーバーの道（楽天 → Google → NDL・6 秒まで）。
  const searchBooks = (q) => searchBooksServer(q, { budgetMs: 6000 });
  const out = await handleBatch(body, { db, userId: who.userId, searchBooks });
  if (!out.length) return res.status(202).end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(Array.isArray(body) ? out : out[0]);
}
