import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: false, isDemo: false }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../lib/ai', () => ({ invalidateKnowledgeCache: () => {} }));

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const { readBooksCache, writeBooksCache, BOOKS_CACHE_PREFIX } = await import('./useBooks');

describe('本の一覧の端末の控え（起動を速くする・2026-11-20）', () => {
  beforeEach(() => store.clear());
  it('書いた一覧をその人の分だけ読める', () => {
    writeBooksCache('u1', [{ id: 'b1', title: '考え方' }], 1000);
    expect(readBooksCache('u1', 2000)).toEqual([{ id: 'b1', title: '考え方' }]);
    expect(readBooksCache('u2', 2000)).toBeNull();
  });
  it('空の一覧は控えない（前の控えも消す）', () => {
    writeBooksCache('u1', [{ id: 'b1' }], 1000);
    writeBooksCache('u1', [], 1000);
    expect(store.has(BOOKS_CACHE_PREFIX + 'u1')).toBe(false);
  });
  it('30 日より古い控え・壊れた控えは使わない', () => {
    writeBooksCache('u1', [{ id: 'b1' }], 0 + 1);
    expect(readBooksCache('u1', 31 * 24 * 60 * 60 * 1000)).toBeNull();
    store.set(BOOKS_CACHE_PREFIX + 'u1', '{壊れた');
    expect(readBooksCache('u1')).toBeNull();
  });
  it('大きすぎる一覧は控えない', () => {
    writeBooksCache('u1', [{ id: 'b1', memo: 'あ'.repeat(2_100_000) }], 1000);
    expect(store.has(BOOKS_CACHE_PREFIX + 'u1')).toBe(false);
  });
  it('id の無い行は捨てる', () => {
    writeBooksCache('u1', [{ id: 'b1' }, { title: 'x' }], 1000);
    expect(readBooksCache('u1', 2000)).toEqual([{ id: 'b1' }]);
  });
});

describe('分野・フォルダが変わったか（本の保存を軽く・2026-11-20）', async () => {
  const { sameTaxList } = await import('./useBooks');
  it('順番・重なり・空きは見ない', () => {
    expect(sameTaxList(['経営戦略', '思考法'], [' 思考法', '経営戦略', '経営戦略'])).toBe(true);
    expect(sameTaxList([], undefined)).toBe(true);
  });
  it('1 つでも違えば書き直す', () => {
    expect(sameTaxList(['経営戦略'], ['経営戦略', '思考法'])).toBe(false);
    expect(sameTaxList(['A'], ['a'])).toBe(false);
  });
});
