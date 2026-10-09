// ⏱ 読書の時間の記録（表・未適用の控え・2026-10-09）。
import { describe, it, expect, vi } from 'vitest';
import { createReadingSessionStore, LOCAL_SESSIONS_KEY } from './readingSessions';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// supabase-js の使う形だけ（from().select().eq().order().limit() / insert().select().single()）。
function fakeClient({ selectResult, insertResult }) {
  const inserted = [];
  return {
    inserted,
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => selectResult }) }) }),
      insert: (rows) => {
        inserted.push(...rows);
        return { select: () => ({ single: async () => (typeof insertResult === 'function' ? insertResult(rows[0]) : insertResult) }) };
      },
    }),
  };
}

const row = { book_id: 'b1', started_at: '2026-10-09T11:00:00.000Z', ended_at: '2026-10-09T11:30:00.000Z', seconds: 1800, mode: 'timer' };
const missing = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.reading_sessions' in the schema cache" } };

describe('reading_sessions', () => {
  it('表に入れば表の行として持つ（端末には控えない）', async () => {
    const storage = memStore();
    const client = fakeClient({ selectResult: { data: [], error: null }, insertResult: (r) => ({ data: { ...r, id: 'srv-1' }, error: null }) });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    await store.load('u1');
    const r = await store.save('u1', row);
    expect(r).toMatchObject({ ok: true, local: false });
    expect(client.inserted[0]).toMatchObject({ user_id: 'u1', book_id: 'b1', seconds: 1800 });
    expect(store.rows().map((x) => x.id)).toEqual(['srv-1']);
    expect(storage.getItem(LOCAL_SESSIONS_KEY)).toBeNull();
  });

  it('表がまだ無い DB（未適用）: 端末に控え、読み込みも壊れない', async () => {
    const storage = memStore();
    const client = fakeClient({ selectResult: missing, insertResult: missing });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await store.load('u1')).toEqual([]);
    const r = await store.save('u1', row);
    expect(r).toMatchObject({ ok: true, local: true });
    expect(warn).not.toHaveBeenCalled(); // 未適用は想定どおり＝警告しない
    // 次に開いたとき（新しい入れ物）も、端末の控えから数える。
    const again = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    const rows = await again.load('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ book_id: 'b1', seconds: 1800, local: true });
    warn.mockRestore();
  });

  it('つながらないときも時間を失わない（端末に控える）', async () => {
    const storage = memStore();
    const client = fakeClient({ selectResult: { data: [], error: null }, insertResult: { data: null, error: { message: 'Failed to fetch' } } });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await store.save('u1', row);
    expect(r.local).toBe(true);
    expect(store.rows()).toHaveLength(1);
    warn.mockRestore();
  });

  it('表の行と端末の控えを合わせて数え、知らせる・初期化で控えも消す', async () => {
    const storage = memStore();
    storage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([{ ...row, id: 'local-1' }]));
    const client = fakeClient({ selectResult: { data: [{ ...row, id: 'srv-9', seconds: 600 }], error: null } });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    const fn = vi.fn();
    store.subscribe(fn);
    await store.load('u1');
    expect(fn).toHaveBeenCalled();
    expect(store.rows().map((x) => x.id).sort()).toEqual(['local-1', 'srv-9']);
    expect(store.isLoaded('u1')).toBe(true);
    store.clearLocal();
    expect(store.rows()).toEqual([]);
  });

  it('ログインしていない・設定の無い環境は端末だけ', async () => {
    const storage = memStore();
    const store = createReadingSessionStore({ getClient: () => null, storage: () => storage });
    await store.load(null);
    const r = await store.save(null, row);
    expect(r.local).toBe(true);
    expect(store.rows()).toHaveLength(1);
  });
});
