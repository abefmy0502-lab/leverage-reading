// 🔄 起動時の表紙の探し直し（backfill v5）のテスト。
//   オーナーの本『プレイングマネジャー 「残業ゼロ」の仕事術』（isbn なし・cover なし）が、
//   起動時に /api/cover で探し直され、楽天の表紙と ISBN が保存されることを確かめる。

import { describe, it, expect, vi, afterEach } from 'vitest';
import { backfillCovers } from './backfillCovers';
import { createNegativeCache } from './coverAutoRetry';

const RAKUTEN = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/2923/9784478102923.jpg?_ex=420x420';
const ROW = { id: 'b1', title: 'プレイングマネジャー 「残業ゼロ」の仕事術', author: '小室淑恵', isbn: null, cover: null, cover_isbn: null };

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

// supabase の books だけを真似る。updateError(payload) で更新の失敗を作れる。
function fakeSupabase(rows, { updateError = () => null } = {}) {
  const updates = [];
  const selects = [];
  return {
    updates,
    selects,
    from(table) {
      expect(table).toBe('books');
      return {
        select(cols) {
          const q = { cols, filters: [] };
          selects.push(q);
          const chain = {
            eq(k, v) { q.filters.push(['eq', k, v]); return chain; },
            or(expr) { q.filters.push(['or', expr]); return chain; },
            limit() { return Promise.resolve({ data: rows, error: null }); },
          };
          return chain;
        },
        update(payload) {
          return {
            eq(k, v) {
              const error = updateError(payload);
              updates.push({ id: v, payload, error });
              return Promise.resolve({ error });
            },
          };
        },
      };
    },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('backfillCovers v5', () => {
  it('ISBN も表紙も無い本を /api/cover で探し、楽天の表紙（正方形）と ISBN を保存する', async () => {
    const fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({ cover: RAKUTEN, isbn: '9784478102923', candidates: ['https://ndlsearch.ndl.go.jp/thumbnail/9784478102923.jpg'] }),
      };
    }));
    class FakeImage { set src(u) { setTimeout(() => { if (u === RAKUTEN) { this.naturalWidth = 420; this.naturalHeight = 420; this.onload(); } else this.onerror(); }, 0); } }
    vi.stubGlobal('Image', FakeImage);

    const sb = fakeSupabase([ROW]);
    const storage = memoryStorage();
    const changed = await backfillCovers(sb, 'user-1', { storage, paceMs: 0 });

    expect(changed).toBe(true);
    // 表紙が空の本だけを選んでいる
    expect(sb.selects[0].filters).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(sb.selects[0].filters).toContainEqual(['or', 'cover.is.null,cover.eq.']);
    // サーバーに書名と著者で聞いた
    const q = new URL(fetchCalls[0], 'https://orime.vercel.app').searchParams;
    expect(q.get('title')).toBe(ROW.title);
    expect(q.get('author')).toBe('小室淑恵');
    expect(sb.updates).toEqual([{ id: 'b1', payload: { cover: RAKUTEN, cover_isbn: '9784478102923', isbn: '9784478102923' }, error: null }]);
  });

  it('同じ ISBN の本が既にあれば、ISBN は付けずに表紙だけ保存する', async () => {
    const resolve = async () => ({ url: RAKUTEN, coverIsbn: '9784478102923', isbn: '9784478102923', outcome: 'found' });
    const sb = fakeSupabase([ROW], { updateError: (p) => (p.isbn ? { code: '23505', message: 'duplicate key value violates unique constraint' } : null) });
    expect(await backfillCovers(sb, 'u', { resolve, storage: memoryStorage(), paceMs: 0 })).toBe(true);
    expect(sb.updates.map((u) => u.payload)).toEqual([
      { cover: RAKUTEN, cover_isbn: '9784478102923', isbn: '9784478102923' },
      { cover: RAKUTEN, cover_isbn: '9784478102923' },
    ]);
  });

  it('cover_isbn 列が無い DB でも表紙を保存する', async () => {
    const resolve = async () => ({ url: RAKUTEN, coverIsbn: '9784478102923', isbn: '', outcome: 'found' });
    const sb = fakeSupabase([{ ...ROW, isbn: '9784478102923' }], { updateError: (p) => ('cover_isbn' in p ? { message: 'column "cover_isbn" does not exist' } : null) });
    expect(await backfillCovers(sb, 'u', { resolve, storage: memoryStorage(), paceMs: 0 })).toBe(true);
    expect(sb.updates.at(-1).payload).toEqual({ cover: RAKUTEN });
  });

  it('手動アップロード・意図的に消した本・今ある表紙には触らない', async () => {
    const resolve = vi.fn();
    const sb = fakeSupabase([
      { ...ROW, id: 'm', cover_isbn: 'manual' },
      { ...ROW, id: 'r', cover_isbn: 'removed' },
      { ...ROW, id: 'c', cover: 'https://ndlsearch.ndl.go.jp/thumbnail/9784478102923.jpg' },
    ]);
    expect(await backfillCovers(sb, 'u', { resolve, storage: memoryStorage(), paceMs: 0 })).toBe(false);
    expect(resolve).not.toHaveBeenCalled();
    expect(sb.updates).toEqual([]);
  });

  it('「見つからない」は 7 日おく・1 日 1 回まで・通信の失敗があった回は次の起動でまた走る', async () => {
    let t = 10_000_000;
    const now = () => t;
    const storage = memoryStorage();
    const negativeCache = createNegativeCache({ storage, now });
    const resolve = vi.fn(async () => ({ url: '', outcome: 'not_found' }));
    const sb = fakeSupabase([ROW]);
    await backfillCovers(sb, 'u', { resolve, storage, negativeCache, now, paceMs: 0 });
    expect(resolve).toHaveBeenCalledTimes(1);
    // 同じ日は走らない
    await backfillCovers(sb, 'u', { resolve, storage, negativeCache, now, paceMs: 0 });
    expect(resolve).toHaveBeenCalledTimes(1);
    // 翌日: 走るが、「見つからない」本は 7 日おく
    t += 25 * 60 * 60 * 1000;
    await backfillCovers(sb, 'u', { resolve, storage, negativeCache, now, paceMs: 0 });
    expect(resolve).toHaveBeenCalledTimes(1);
    // 8 日後: 探し直す
    t += 8 * 24 * 60 * 60 * 1000;
    await backfillCovers(sb, 'u', { resolve, storage, negativeCache, now, paceMs: 0 });
    expect(resolve).toHaveBeenCalledTimes(2);

    // 通信の失敗 → 覚えない・「今日は済んだ」にもしない
    const storage2 = memoryStorage();
    const flaky = vi.fn(async () => ({ url: '', outcome: 'transient' }));
    await backfillCovers(sb, 'u', { resolve: flaky, storage: storage2, now, paceMs: 0 });
    await backfillCovers(sb, 'u', { resolve: flaky, storage: storage2, now, paceMs: 0 });
    expect(flaky).toHaveBeenCalledTimes(2);
  });
});
