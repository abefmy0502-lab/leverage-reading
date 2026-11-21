// 🗑 退会をその場で終える（2026-11-21・App 審査 5.1.1(v)「アカウントの削除はアプリの中で完了させる」）。
//   呼び方: POST /api/claude に { op: 'delete_account', appleCode? }（Bearer は本人）。新しい Vercel 関数を増やさないため api/claude.js から呼ぶ。
//   アプリは先に本人の権限で本・メモ・写真などを消し、削除の依頼（account_deletion_requests）を残してからここを呼ぶ。
//   ここでは service_role で、本人では消せない行（利用状況・AI の量・購入の記録など）を消し、ログインの情報（auth.users）を消す。
//   Apple でサインインした人は、アプリが退会の直前に Apple の画面で受け取った authorizationCode（appleCode）を
//   Apple の鍵に換えて取り消す（Sign in with Apple の決まり・appleid.apple.com/auth/revoke）。鍵の設定が無いときは
//   取り消さずに進み、運営の手作業（company/app-store-submission.md §11）に回す（appleRevoked: false をログに）。
//   失敗しても利用者のデータはアプリ側で消えている・依頼の行も残っているので、運営が 7 日以内に終える（今までの約束のまま）。
import { createSign } from 'node:crypto';

// 本人の権限では消せない（ポリシーが無い）か、消し忘れがあっても困る表。行が無い・表が無いは気にしない。
export const SERVICE_TABLES = [
  'analytics_events', 'ai_usage', 'ai_token_lots', 'ai_rate_limits', 'subscription_events', 'subscriptions',
  'feedback', 'profiles', 'mcp_tokens', 'push_subscriptions', 'reading_sessions', 'goal_roadmaps',
  'chat_messages', 'book_memos', 'book_tags', 'book_collections', 'actions', 'advisor_sessions', 'theme_reports', 'books',
];

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function appleConfig(env = process.env) {
  const keyId = env.APPLE_SIGNIN_KEY_ID || '';
  const teamId = env.APPLE_TEAM_ID || env.APNS_TEAM_ID || '';
  const clientId = env.APPLE_SIGNIN_CLIENT_ID || env.APNS_BUNDLE_ID || '';
  const privateKey = String(env.APPLE_SIGNIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!keyId || !teamId || !clientId || !privateKey.includes('PRIVATE KEY')) return null;
  return { keyId, teamId, clientId, privateKey };
}

// Apple の client_secret（ES256 の JWT・5 分だけ使う）。
export function appleClientSecret(cfg, nowSec = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: nowSec, exp: nowSec + 300, aud: 'https://appleid.apple.com', sub: cfg.clientId }));
  const input = `${header}.${payload}`;
  const signer = createSign('sha256');
  signer.update(input);
  const sig = signer.sign({ key: cfg.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(sig)}`;
}

/** authorizationCode → refresh_token → 取り消し。成功で true。 */
export async function revokeAppleWithCode(code, { cfg = appleConfig(), fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  if (!cfg || !code || typeof code !== 'string' || code.length > 2000) return false;
  const post = async (path, params) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await fetchImpl(`https://appleid.apple.com${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
        signal: ac.signal,
      });
    } finally { clearTimeout(t); }
  };
  try {
    const secret = appleClientSecret(cfg);
    const r = await post('/auth/token', { client_id: cfg.clientId, client_secret: secret, code, grant_type: 'authorization_code' });
    if (!r.ok) { console.warn('[delete-account] apple token exchange failed:', r.status); return false; }
    const j = await r.json();
    const token = j.refresh_token || j.access_token;
    if (!token) return false;
    const v = await post('/auth/revoke', { client_id: cfg.clientId, client_secret: secret, token, token_type_hint: j.refresh_token ? 'refresh_token' : 'access_token' });
    if (!v.ok) { console.warn('[delete-account] apple revoke failed:', v.status); return false; }
    return true;
  } catch (e) {
    console.warn('[delete-account] apple revoke error:', e?.message || e);
    return false;
  }
}

const isAppleUser = (user) => (user?.identities || []).some((i) => i?.provider === 'apple') || user?.app_metadata?.provider === 'apple';

/** 退会を終える。戻り値 { status, body }。 */
export async function handleDeleteAccount({ admin, user, body = {}, revoke = revokeAppleWithCode }) {
  if (!admin || !user?.id) return { status: 500, body: { ok: false, error: 'not_configured' } };
  const uid = user.id;
  let appleRevoked = null;
  if (isAppleUser(user)) {
    appleRevoked = await revoke(String(body.appleCode || ''));
    if (!appleRevoked) console.warn('[delete-account] apple not revoked for', uid, '— 運営の手作業（§11）');
  }
  for (const t of SERVICE_TABLES) {
    try {
      const { error } = await admin.from(t).delete().eq('user_id', uid);
      if (error && !/42P01|PGRST205|does not exist|Could not find the table|42703/.test(`${error.code || ''} ${error.message || ''}`)) {
        console.warn('[delete-account] delete failed:', t, error.code || error.message);
      }
    } catch (e) { console.warn('[delete-account] delete error:', t, e?.message || e); }
  }
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) {
    console.error('[delete-account] auth delete failed:', error.message);
    return { status: 500, body: { ok: false, error: 'auth_delete_failed' } };
  }
  // 削除の依頼の行（account_deletion_requests）は auth.users の削除で一緒に消える（ON DELETE CASCADE）＝運営の手作業は要らない。
  return { status: 200, body: { ok: true, appleRevoked } };
}
