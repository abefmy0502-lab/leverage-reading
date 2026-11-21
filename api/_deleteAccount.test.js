import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { handleDeleteAccount, appleClientSecret, appleConfig, revokeAppleWithCode, SERVICE_TABLES } from './_deleteAccount.js';

function fakeAdmin() {
  const calls = [];
  return {
    calls,
    from: (t) => ({ delete: () => ({ eq: async (k, v) => { calls.push(['delete', t, v]); return { error: null }; } }) }),
    auth: { admin: { deleteUser: async (id) => { calls.push(['deleteUser', id]); return { error: null }; } } },
  };
}

describe('退会をその場で終える（2026-11-21）', () => {
  it('本人の行を消してから、ログインの情報を消す', async () => {
    const admin = fakeAdmin();
    const out = await handleDeleteAccount({ admin, user: { id: 'u1', identities: [{ provider: 'email' }] } });
    expect(out).toEqual({ status: 200, body: { ok: true, appleRevoked: null } });
    expect(admin.calls.filter((c) => c[0] === 'delete').map((c) => c[1])).toEqual(SERVICE_TABLES);
    expect(admin.calls.at(-1)).toEqual(['deleteUser', 'u1']);
  });
  it('Apple の人は取り消してから消す（取り消せなくても消す）', async () => {
    const seen = [];
    const out = await handleDeleteAccount({ admin: fakeAdmin(), user: { id: 'u2', identities: [{ provider: 'apple' }] }, body: { appleCode: 'c1' }, revoke: async (c) => { seen.push(c); return false; } });
    expect(seen).toEqual(['c1']);
    expect(out.body).toEqual({ ok: true, appleRevoked: false });
  });
  it('ログインの情報を消せなければ 500', async () => {
    const admin = fakeAdmin();
    admin.auth.admin.deleteUser = async () => ({ error: { message: 'x' } });
    expect((await handleDeleteAccount({ admin, user: { id: 'u3' } })).status).toBe(500);
  });
  it('Apple の client_secret は ES256 で署名され、鍵の設定が無ければ取り消さない', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const cfg = appleConfig({ APPLE_SIGNIN_KEY_ID: 'K1', APPLE_TEAM_ID: 'T1', APPLE_SIGNIN_CLIENT_ID: 'app.orime', APPLE_SIGNIN_PRIVATE_KEY: pem });
    const jwt = appleClientSecret(cfg, 1000);
    const [h, p, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toMatchObject({ iss: 'T1', sub: 'app.orime', aud: 'https://appleid.apple.com', exp: 1300 });
    const v = createVerify('sha256'); v.update(`${h}.${p}`);
    expect(v.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(appleConfig({})).toBe(null);
    expect(await revokeAppleWithCode('c', { cfg: null })).toBe(false);
  });
  it('コードを鍵に換えて取り消す', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const cfg = { keyId: 'K', teamId: 'T', clientId: 'C', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
    const urls = [];
    const fetchImpl = async (url, init) => { urls.push([url, new URLSearchParams(init.body).get('token') || new URLSearchParams(init.body).get('code')]); return { ok: true, json: async () => ({ refresh_token: 'r1' }) }; };
    expect(await revokeAppleWithCode('code1', { cfg, fetchImpl })).toBe(true);
    expect(urls).toEqual([['https://appleid.apple.com/auth/token', 'code1'], ['https://appleid.apple.com/auth/revoke', 'r1']]);
  });
});
