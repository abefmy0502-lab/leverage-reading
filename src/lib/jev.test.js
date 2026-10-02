// 🧭 アプリから Jev に決めてもらう（lib/jev.js）: スイッチ・同意（聞かない）・失敗は null。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { on: true, version: 2 };
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
vi.mock('./aiProcessors', () => ({ get AI_JEV_ON() { return state.on; } }));
vi.mock('./aiConsent', () => ({
  AI_CONSENT_HEADER: 'X-Orime-Ai-Consent',
  currentAiConsentVersion: vi.fn(async () => state.version),
  ensureAiConsent: vi.fn(),
  requestAiConsent: vi.fn(),
}));

import { askJev } from './jev';
import { ensureAiConsent, requestAiConsent } from './aiConsent';

let fetchMock;
beforeEach(() => {
  state.on = true;
  state.version = 2;
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ jev: { result: { scores: { m0: 0.9 } }, ms: 120 } }) }));
  globalThis.fetch = fetchMock;
});

describe('askJev', () => {
  it('材料だけを送り（purpose と jev）、同意の版をヘッダーに付けて、結果を返す', async () => {
    const r = await askJev('memo_relevance', { question: 'q', memos: [{ id: 'm0', text: 't' }] });
    expect(r).toEqual({ scores: { m0: 0.9 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/claude');
    expect(JSON.parse(init.body)).toEqual({ purpose: 'memo_relevance', jev: { question: 'q', memos: [{ id: 'm0', text: 't' }] } });
    expect(init.headers['X-Orime-Ai-Consent']).toBe('2');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('アプリのスイッチが切れていれば送らない', async () => {
    state.on = false;
    expect(await askJev('memo_relevance', { question: 'q' })).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('版 2 の同意が無ければ送らない・同意のシートも出さない', async () => {
    state.version = 1;
    expect(await askJev('memo_relevance', { question: 'q', memos: [] })).toBe(null);
    state.version = null;
    expect(await askJev('memo_relevance', { question: 'q', memos: [] })).toBe(null);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ensureAiConsent).not.toHaveBeenCalled();
    expect(requestAiConsent).not.toHaveBeenCalled();
  });

  it('サーバーが使えないと答えた・失敗した・時間切れ → null（投げない）', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ jev: null, reason: 'off' }) });
    expect(await askJev('memo_relevance', { question: 'q' })).toBe(null);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await askJev('memo_relevance', { question: 'q' })).toBe(null);
    fetchMock.mockRejectedValueOnce(new Error('net'));
    expect(await askJev('memo_relevance', { question: 'q' })).toBe(null);
    fetchMock.mockImplementationOnce((_u, init) => new Promise((_r, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' })));
    }));
    expect(await askJev('memo_relevance', { question: 'q' }, { timeoutMs: 20 })).toBe(null);
  });
});
