// ⏱ 読書の時間の記録（表・未適用の控え・2026-10-09）。
import { describe, it, expect, vi } from 'vitest';
import { createReadingSessionStore, LOCAL_SESSIONS_KEY } from './readingSessions';

function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// supabase-js の使う形だけ（from().select().eq().order().limit() / insert().select().single()）。
function fakeClient({ selectResult, insertResult, upsertResult = { error: null } }) {
  const inserted = [];
  const upserted = [];
  return {
    inserted,
    upserted,
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ limit: async () => (typeof selectResult === 'function' ? selectResult() : selectResult) }) }) }),
      upsert: async (rows, opts) => {
        const res = typeof upsertResult === 'function' ? upsertResult(rows, opts) : upsertResult;
        if (!res.error) upserted.push(...rows);
        return res;
      },
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
    const client = fakeClient({ selectResult: { data: [], error: null }, insertResult: (r) => ({ data: { ...r }, error: null }) });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    await store.load('u1');
    const r = await store.save('u1', row);
    expect(r).toMatchObject({ ok: true, local: false });
    expect(client.inserted[0]).toMatchObject({ user_id: 'u1', book_id: 'b1', seconds: 1800 });
    // id は端末で決めて送る（uuid）。
    expect(client.inserted[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.rows().map((x) => x.id)).toEqual([client.inserted[0].id]);
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
    const client = fakeClient({ selectResult: { data: [{ ...row, id: 'srv-9', seconds: 600 }], error: null }, upsertResult: { error: { message: 'Failed to fetch' } } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    const fn = vi.fn();
    store.subscribe(fn);
    await store.load('u1');
    expect(fn).toHaveBeenCalled();
    const ids = store.rows().map((x) => x.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('srv-9');
    expect(store.isLoaded('u1')).toBe(true);
    store.clearLocal();
    expect(store.rows()).toEqual([]);
    expect(storage.getItem(LOCAL_SESSIONS_KEY)).toBeNull();
    warn.mockRestore();
  });

  it('保存に失敗した行は、表に入れようとした id のまま端末に控える（同じ行が二重に数えられない）', async () => {
    const storage = memStore();
    const client = fakeClient({ selectResult: { data: [], error: null }, insertResult: { data: null, error: { message: 'Failed to fetch' } } });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await store.save('u1', row);
    expect(r.row.id).toBe(client.inserted[0].id);
    expect(JSON.parse(storage.getItem(LOCAL_SESSIONS_KEY))[0].id).toBe(client.inserted[0].id);
    warn.mockRestore();
  });

  it('読み込みに失敗したら、次に頼まれたときにもう一度読む', async () => {
    const storage = memStore();
    let fail = true;
    const client = fakeClient({ selectResult: () => (fail ? { data: null, error: { message: 'Failed to fetch' } } : { data: [{ ...row, id: 'srv-1' }], error: null }) });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await store.load('u1');
    expect(store.rows()).toEqual([]);
    expect(store.isLoaded('u1')).toBe(true); // 画面は待たせない
    fail = false;
    await store.load('u1');
    expect(store.rows().map((x) => x.id)).toEqual(['srv-1']);
    warn.mockRestore();
  });

  it('次に読めたとき、端末の控えを表に送って控えから消す（前の版の id は付け直す）', async () => {
    const storage = memStore();
    storage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([{ ...row, id: 'local-old', local: true }]));
    const client = fakeClient({ selectResult: { data: [], error: null } });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    await store.load('u1');
    expect(client.upserted).toHaveLength(1);
    expect(client.upserted[0]).toMatchObject({ user_id: 'u1', book_id: 'b1', seconds: 1800 });
    expect(client.upserted[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.getItem(LOCAL_SESSIONS_KEY)).toBeNull();
    expect(store.rows()).toHaveLength(1);
  });

  it('消えた本の行は送らずに捨て、ほかの行は送る・表が無ければ送らない', async () => {
    const storage = memStore();
    const ok = '11111111-1111-4111-8111-111111111111';
    const gone = '22222222-2222-4222-8222-222222222222';
    storage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([{ ...row, id: ok }, { ...row, book_id: 'gone', id: gone }]));
    const client = fakeClient({
      selectResult: { data: [], error: null },
      upsertResult: (rows) => (rows.some((r) => r.book_id === 'gone') ? { error: { code: '23503', message: 'fk' } } : { error: null }),
    });
    const store = createReadingSessionStore({ getClient: () => client, storage: () => storage });
    await store.load('u1');
    expect(client.upserted.map((r) => r.id)).toEqual([ok]);
    expect(storage.getItem(LOCAL_SESSIONS_KEY)).toBeNull();

    const s2 = memStore();
    s2.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([{ ...row, id: ok }]));
    const c2 = fakeClient({ selectResult: missing });
    const st2 = createReadingSessionStore({ getClient: () => c2, storage: () => s2 });
    await st2.load('u1');
    expect(c2.upserted).toEqual([]);
    expect(st2.rows()).toHaveLength(1);
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

describe('本の削除の「元に戻す」で読書の時間も戻す', () => {
  // from('reading_sessions').select().eq().eq() と insert() だけ。
  function snapClient({ rows = [], selectError = null, insertError = null } = {}) {
    const inserted = [];
    const eqs = [];
    const q = {
      select: () => q,
      eq: (k, v) => { eqs.push([k, v]); return eqs.length >= 2 ? Promise.resolve({ data: selectError ? null : rows, error: selectError }) : q; },
      insert: async (r) => { inserted.push(...r); return { error: insertError }; },
    };
    return { inserted, eqs, from: () => q };
  }
  const rows = [{ id: 's1', user_id: 'u1', book_id: 'b1', started_at: 'a', ended_at: 'b', seconds: 600, mode: 'timer' }];

  it('消す前にその本の行を控え、戻すときに同じ行を入れ直す', async () => {
    const { captureBookReadingSessions, restoreBookReadingSessions } = await import('./readingSessions');
    const c = snapClient({ rows });
    const got = await captureBookReadingSessions(c, 'u1', 'b1');
    expect(got).toEqual(rows);
    expect(c.eqs).toEqual([['user_id', 'u1'], ['book_id', 'b1']]);
    const r = snapClient();
    expect(await restoreBookReadingSessions(r, got)).toBe(true);
    expect(r.inserted).toEqual(rows);
  });

  it('表が無い DB は控えない・入れ直しも失敗にしない／ほかの失敗は false', async () => {
    const { captureBookReadingSessions, restoreBookReadingSessions } = await import('./readingSessions');
    expect(await captureBookReadingSessions(snapClient({ selectError: missing.error }), 'u1', 'b1')).toEqual([]);
    expect(await restoreBookReadingSessions(snapClient(), [])).toBe(true);
    expect(await restoreBookReadingSessions(snapClient({ insertError: missing.error }), rows)).toBe(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await restoreBookReadingSessions(snapClient({ insertError: { message: 'Failed to fetch' } }), rows)).toBe(false);
    err.mockRestore();
  });
});
