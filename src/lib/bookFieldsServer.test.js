// 🏷 本の分野をサーバーに聞く（lib/bookFieldsServer.js・2026-10-11）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchServerFields, normalizeServerFields, sendFieldVotes, _resetServerFieldsMemory } from './bookFieldsServer';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const ok = (body) => ({ ok: true, json: async () => body });

beforeEach(() => { globalThis.localStorage = memStore(); _resetServerFieldsMemory(); });

describe('サーバーの分野', () => {
  it('一覧の名前だけ・2 つまで', () => {
    expect(normalizeServerFields({ fields: ['歴史', 'x', '心理学', '哲学・思想'], source: 'ai' })).toEqual({ fields: ['歴史', '心理学'], source: 'ai' });
    expect(normalizeServerFields({ fields: [], source: 'ai' })).toEqual({ fields: [], source: 'none' });
  });
  it('送るのは本の書誌だけ・AI とジャンルの答えは控える（言葉の仕分けは控えない）', async () => {
    const fetchImpl = vi.fn(async () => ok({ fields: ['キャリア・働き方'], source: 'ai' }));
    const book = { id: 'b1', isbn: '9784062938396', title: '半径5メートルの野望 完全版', author: 'はあちゅう', leverageMemo: '秘密のメモ' };
    expect(await fetchServerFields(book, { fetchImpl })).toEqual({ fields: ['キャリア・働き方'], source: 'ai' });
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain('/api/cover?fields=1');
    expect(url).not.toContain(encodeURIComponent('秘密'));
    expect(url).not.toContain('b1');
    await fetchServerFields(book, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const kw = vi.fn(async () => ok({ fields: ['伝える力'], source: 'keywords' }));
    await fetchServerFields({ title: '伝え方が9割' }, { fetchImpl: kw });
    await fetchServerFields({ title: '伝え方が9割' }, { fetchImpl: kw });
    expect(kw).toHaveBeenCalledTimes(2);
  });
  it('つながらない・決められないときは null', async () => {
    expect(await fetchServerFields({ title: '本' }, { fetchImpl: async () => ({ ok: false }) })).toBe(null);
    expect(await fetchServerFields({ title: '本' }, { fetchImpl: async () => { throw new Error('x'); } })).toBe(null);
    expect(await fetchServerFields({ title: '' }, { fetchImpl: vi.fn() })).toBe(null);
  });
  it('選び直した声: 足した分野と外した分野だけ・変わらなければ送らない', async () => {
    const fetchImpl = vi.fn(async () => ok({ ok: true }));
    expect(sendFieldVotes({ title: '本の名前' }, ['小説・物語'], ['キャリア・働き方'], { fetchImpl, getToken: async () => 'jwt' })).toBe(true);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt');
    const url = decodeURIComponent(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('fieldvote=1');
    expect(url).toContain('add=キャリア・働き方');
    expect(url).toContain('remove=小説・物語');
    expect(sendFieldVotes({ title: '本の名前' }, ['歴史'], ['歴史'], { fetchImpl })).toBe(false);
  });
  it('ログインの鍵を Authorization に付ける・無ければ付けない（声はログインしていなければ送らない）', async () => {
    const fetchImpl = vi.fn(async () => ok({ fields: ['歴史'], source: 'ai' }));
    await fetchServerFields({ title: '日本の歴史' }, { fetchImpl, getToken: async () => 'tok' });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
    const anon = vi.fn(async () => ok({ fields: ['歴史'], source: 'keywords' }));
    await fetchServerFields({ title: '日本の歴史 2' }, { fetchImpl: anon, getToken: async () => null });
    expect(anon.mock.calls[0][1]?.headers).toBeUndefined();
    const vote = vi.fn(async () => ok({ ok: true }));
    sendFieldVotes({ title: '本の名前' }, ['歴史'], ['哲学・思想'], { fetchImpl: vote, getToken: async () => null });
    await new Promise((r) => setTimeout(r, 0));
    expect(vote).not.toHaveBeenCalled();
  });
});
