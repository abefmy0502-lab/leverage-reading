import { describe, it, expect } from 'vitest';
import { oauth1Header, configured, postX, postThreads, postInstagram, makeImage } from './_social.js';

const env = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'ts', THREADS_USER_ID: 'u1', THREADS_ACCESS_TOKEN: 'tt', IG_USER_ID: 'ig1', IG_ACCESS_TOKEN: 'it', OPENAI_API_KEY: 'ok' };
const json = (obj, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(obj), arrayBuffer: async () => new ArrayBuffer(8) });

describe('SNS の投稿', () => {
  it('鍵のそろい', () => {
    expect(configured({})).toEqual({ x: false, threads: false, instagram: false, image: false });
    expect(configured(env).x).toBe(true);
  });
  it('OAuth 1.0a の署名（決まった nonce と時刻で同じ結果）', () => {
    const h1 = oauth1Header('POST', 'https://api.x.com/2/tweets', {}, { apiKey: 'k', apiSecret: 's', accessToken: 't', accessSecret: 'ts' }, { nonce: 'n', timestamp: '1' });
    const h2 = oauth1Header('POST', 'https://api.x.com/2/tweets', {}, { apiKey: 'k', apiSecret: 's', accessToken: 't', accessSecret: 'ts' }, { nonce: 'n', timestamp: '1' });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^OAuth oauth_consumer_key="k", oauth_nonce="n", oauth_signature="[^"]+", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1", oauth_token="t", oauth_version="1.0"$/);
  });
  it('X: 文だけ → v2 tweets', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push([url, init]); return json({ data: { id: '123' } }, 201); };
    const r = await postX({ text: 'hi' }, { env, fetchImpl });
    expect(r).toEqual({ id: '123', url: 'https://x.com/i/web/status/123' });
    expect(calls[0][0]).toBe('https://api.x.com/2/tweets');
    expect(calls[0][1].headers.Authorization).toMatch(/^OAuth /);
  });
  it('X: 鍵が無ければ止める・失敗は retryable の印', async () => {
    await expect(postX({ text: 'hi' }, { env: {}, fetchImpl: async () => json({}) })).rejects.toThrow(/X の鍵/);
    await expect(postX({ text: 'hi' }, { env, fetchImpl: async () => json({ detail: 'rate' }, 429) })).rejects.toMatchObject({ retryable: true });
  });
  it('Threads: 作る → 出す → permalink', async () => {
    const urls = [];
    const fetchImpl = async (url) => { urls.push(String(url)); if (url.includes('/threads?')) return json({ id: 'c1' }); if (url.includes('threads_publish')) return json({ id: 'm1' }); return json({ permalink: 'https://www.threads.net/@o/post/1' }); };
    const r = await postThreads({ text: 'こんにちは' }, { env, fetchImpl, waitMs: 0 });
    expect(r).toEqual({ id: 'm1', url: 'https://www.threads.net/@o/post/1' });
    expect(urls[0]).toContain('media_type=TEXT');
  });
  it('Instagram: 画像が無ければ止める・あれば作る → 出す', async () => {
    await expect(postInstagram({ text: 'x' }, { env, fetchImpl: async () => json({}) })).rejects.toThrow(/画像が要ります/);
    const fetchImpl = async (url) => (url.includes('/media?') ? json({ id: 'c' }) : url.includes('media_publish') ? json({ id: 'p' }) : json({ permalink: 'https://www.instagram.com/p/x/' }));
    const r = await postInstagram({ text: 'x', imageUrl: 'https://img/a.png' }, { env, fetchImpl, waitMs: 0 });
    expect(r.id).toBe('p');
  });
  it('画像: OpenAI → 公開の置き場 → URL', async () => {
    const fetchImpl = async () => json({ data: [{ b64_json: Buffer.from('png').toString('base64'), revised_prompt: 'r' }] });
    const uploaded = [];
    const storage = { from: () => ({ upload: async (path, buf) => { uploaded.push([path, buf.length]); return { error: null }; }, getPublicUrl: (path) => ({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/ops-media/' + path } }) }) };
    const r = await makeImage({ prompt: '秋', userId: 'u' }, { env, fetchImpl, storage });
    expect(r.url).toContain('/ops-media/u/');
    expect(uploaded[0][1]).toBe(3);
    await expect(makeImage({ prompt: '秋' }, { env: {}, fetchImpl, storage })).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
