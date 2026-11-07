// 🔌 AI と連携（MCP）の接続キー（2026-11-07・設定 →「AI と連携」）。
//
// キーは端末で作り、ハッシュ（SHA-256）だけを mcp_tokens に入れる（本人・RLS）。キーそのものはその場で 1 回だけ見せる。
// サーバー（api/mcp.js）はハッシュで本人を決める。取り消し＝行を消す（サーバーはすぐ受け付けなくなる）。
// AI は使わない・トークンを使わない。送るのは AI 側（本人がつないだ Claude・ChatGPT など）が読みに来るだけ。
import { SITE_URL } from './legalLinks';
import { isSchemaError } from './errors';

export const TOKEN_PREFIX = 'orime_mcp_';
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;
export const KEY_NAME_MAX = 60;
export const MAX_KEYS = 5;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// 32 バイトの乱数（base64url・43 字）。
export function generateToken(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return `${TOKEN_PREFIX}${b64url(random(32))}`;
}

export async function hashToken(token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Claude.ai・ChatGPT の「カスタムコネクタ」に貼る URL（キーが URL に入る）。
export const connectUrl = (token) => `${SITE_URL}/mcp/${token}`;

// Claude Code（ターミナル）で足すコマンド。
export const claudeCodeCommand = (token) => `claude mcp add --transport http orime ${MCP_ENDPOINT} --header "Authorization: Bearer ${token}"`;

// 設定ファイル（Claude Desktop など mcp-remote 経由）の 1 行の例。
export const jsonConfigSnippet = (token) => JSON.stringify({ mcpServers: { orime: { type: 'http', url: MCP_ENDPOINT, headers: { Authorization: `Bearer ${token}` } } } }, null, 2);

export function cleanKeyName(s) {
  return String(s || '').replace(/[\x00-\x1F\x7F]/g, ' ').trim().slice(0, KEY_NAME_MAX);
}

// 一覧（新しい順）。{ rows } か { error, missing }（missing＝SQL 未適用）。
export async function listKeys(client) {
  if (!client) return { rows: [] };
  const { data, error } = await client.from('mcp_tokens').select('id, name, created_at, last_used_at, revoked_at').order('created_at', { ascending: false });
  if (error) return { error, missing: isSchemaError(error), rows: [] };
  return { rows: (data || []).filter((r) => !r.revoked_at) };
}

// 作る。戻り値 { token, row } か { error, missing }。
export async function createKey(client, { userId, name = '' } = {}) {
  const token = generateToken();
  const token_hash = await hashToken(token);
  const row = { token_hash, name: cleanKeyName(name) };
  if (userId) row.user_id = userId;
  const { data, error } = await client.from('mcp_tokens').insert([row]).select('id, name, created_at, last_used_at').single();
  if (error) return { error, missing: isSchemaError(error) };
  return { token, row: data };
}

export async function deleteKey(client, id) {
  const { error } = await client.from('mcp_tokens').delete().eq('id', id);
  return { error };
}

export function lastUsedLabel(iso, now = Date.now()) {
  if (!iso) return 'まだ使っていません';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'まだ使っていません';
  const d = Math.floor((now - t) / 86400000);
  if (d <= 0) return '今日使いました';
  if (d === 1) return '昨日使いました';
  if (d < 30) return `${d} 日前に使いました`;
  return `${new Date(t).getMonth() + 1}/${new Date(t).getDate()} に使いました`;
}
