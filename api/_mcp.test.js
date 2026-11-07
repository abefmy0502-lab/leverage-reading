// api/_mcp.js を偽の DB で動かして、本人の行だけ・読み書きの形・JSON-RPC の決まりを確かめる。
import { describe, it, expect, beforeEach } from 'vitest';
import { handleRpc, handleBatch, resolveToken, touchToken, sha256Hex, looksLikeToken, TOOLS, PROTOCOL_VERSION, TOKEN_PREFIX } from './_mcp.js';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const B1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TOKEN = `${TOKEN_PREFIX}abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG`;

let db;
function resetDb() {
  db = {
    books: [
      { id: B1, user_id: ME, title: '考え方', author: '稲盛和夫', status: 'done', rating: 5, start_date: '2026-09-01', done_date: '2026-09-20', invest_purpose: '判断の軸', leverage_memo: 'まとめの文', updated_at: '2026-10-02', book_tags: [{ tag_name: '自己成長' }] },
      { id: B2, user_id: OTHER, title: '他人の本', author: 'X', status: 'reading', updated_at: '2026-10-03', book_tags: [] },
    ],
    book_memos: [
      { id: 'm1', user_id: ME, book_id: B1, text: '謙虚にして驕らず', page_number: 12, tags: ['心'], created_at: '2026-09-10T00:00:00Z' },
      { id: 'm2', user_id: OTHER, book_id: B2, text: '謙虚 他人のメモ', page_number: 1, tags: [], created_at: '2026-09-11T00:00:00Z' },
    ],
    actions: [{ id: 'a1', user_id: ME, book_id: B1, text: '朝に 10 分', deadline: '2026-11-10', done: false, created_at: '2026-10-01' }],
    mcp_tokens: [{ id: 't1', user_id: ME, token_hash: sha256Hex(TOKEN), revoked_at: null, last_used_at: null }],
    inserted: [],
    updated: [],
  };
}

// supabase-js の形を最低限まねた偽のクエリ（eq / in / ilike / or / gte / order / limit / insert / select / update）
function fake() {
  return {
    from(table) {
      const f = [];
      let op = 'select';
      let payload = null;
      let lim = Infinity;
      const q = {
        select() { return q; },
        eq(c, v) { f.push((r) => String(r[c]) === String(v)); return q; },
        in(c, vs) { f.push((r) => vs.map(String).includes(String(r[c]))); return q; },
        ilike(c, v) { const re = new RegExp(v.replace(/%/g, '.*'), 'i'); f.push((r) => re.test(String(r[c] || ''))); return q; },
        gte(c, v) { f.push((r) => String(r[c]) >= String(v)); return q; },
        or(expr) { const parts = expr.split(',').map((p) => { const [c, , v] = p.split('.'); return [c, new RegExp(v.replace(/%/g, '.*'), 'i')]; }); f.push((r) => parts.some(([c, re]) => re.test(String(r[c] || '')))); return q; },
        order() { return q; },
        limit(n) { lim = n; return q; },
        insert(rows) { op = 'insert'; payload = rows; return q; },
        update(patch) { op = 'update'; payload = patch; return q; },
        then(res, rej) {
          try {
            if (op === 'insert') { const rows = payload.map((r, i) => ({ ...r, id: `new-${table}-${i}` })); db[table].push(...rows); db.inserted.push([table, rows[0]]); return Promise.resolve({ data: rows, error: null }).then(res, rej); }
            if (op === 'update') { const hit = (db[table] || []).filter((r) => f.every((fn) => fn(r))); hit.forEach((r) => Object.assign(r, payload)); db.updated.push([table, payload]); return Promise.resolve({ data: hit, error: null }).then(res, rej); }
            const rows = (db[table] || []).filter((r) => f.every((fn) => fn(r))).slice(0, lim);
            return Promise.resolve({ data: rows, error: null }).then(res, rej);
          } catch (e) { return Promise.resolve({ data: null, error: { message: String(e) } }).then(res, rej); }
        },
      };
      return q;
    },
  };
}

const call = (name, args = {}) => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { db: fake(), userId: ME });
const text = (r) => r.result.content[0].text;

beforeEach(resetDb);

describe('接続キー', () => {
  it('形・ハッシュ・取り消しで本人を決める', async () => {
    expect(looksLikeToken(TOKEN)).toBe(true);
    expect(looksLikeToken('orime_mcp_short')).toBe(false);
    expect(looksLikeToken('Bearer x')).toBe(false);
    const who = await resolveToken(fake(), TOKEN);
    expect(who).toEqual({ userId: ME, tokenId: 't1', lastUsedAt: null });
    expect(await resolveToken(fake(), `${TOKEN_PREFIX}zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz`)).toBeNull();
    db.mcp_tokens[0].revoked_at = '2026-11-01T00:00:00Z';
    expect(await resolveToken(fake(), TOKEN)).toBeNull();
  });
  it('最後に使った時刻は 10 分に 1 回だけ書く', async () => {
    const now = Date.parse('2026-11-07T00:00:00Z');
    expect(await touchToken(fake(), { tokenId: 't1', lastUsedAt: null }, now)).toBe(true);
    expect(db.updated).toHaveLength(1);
    expect(await touchToken(fake(), { tokenId: 't1', lastUsedAt: new Date(now - 60000).toISOString() }, now)).toBe(false);
  });
});

describe('JSON-RPC', () => {
  it('initialize / ping / tools/list / 通知 / 知らない method', async () => {
    const init = await handleRpc({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} }, { db: fake(), userId: ME });
    expect(init.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(init.result.capabilities.tools).toBeTruthy();
    expect((await handleRpc({ jsonrpc: '2.0', id: 2, method: 'ping' }, {})).result).toEqual({});
    const list = await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, {});
    expect(list.result.tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(TOOLS.every((t) => t.inputSchema?.type === 'object' && t.description)).toBe(true);
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, {})).toBeNull();
    expect((await handleRpc({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, {})).error.code).toBe(-32601);
    expect((await handleRpc({ foo: 1 }, {})).error.code).toBe(-32600);
  });
  it('配列は配列で返し、通知だけなら空', async () => {
    const out = await handleBatch([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }], {});
    expect(out).toHaveLength(1);
    expect(await handleBatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, {})).toEqual([]);
  });
  it('知らない道具は -32602', async () => {
    const r = await call('delete_everything');
    expect(r.error.code).toBe(-32602);
  });
});

describe('読む（本人のものだけ）', () => {
  it('list_books は自分の本だけ・状態で絞れる', async () => {
    const r = await call('list_books');
    expect(text(r)).toContain('考え方');
    expect(text(r)).not.toContain('他人の本');
    expect(text(r)).toContain('★5');
    expect(text(r)).toContain(B1);
    expect(text(await call('list_books', { status: 'reading' }))).toContain('見つかりません');
    expect(text(await call('list_books', { query: '稲盛' }))).toContain('考え方');
  });
  it('get_book は他人の本を拒む・自分の本はメモと行動つき', async () => {
    const no = await call('get_book', { book_id: B2 });
    expect(no.result.isError).toBe(true);
    expect(text(no)).toContain('本棚にありません');
    const bad = await call('get_book', { book_id: 'x' });
    expect(bad.result.isError).toBe(true);
    const r = await call('get_book', { book_id: B1 });
    expect(text(r)).toContain('謙虚にして驕らず');
    expect(text(r)).toContain('p.12');
    expect(text(r)).toContain('得たいこと: 判断の軸');
    expect(text(r)).toContain('この本のまとめ');
    expect(text(r)).toContain('[ ] 朝に 10 分');
  });
  it('search_memos は自分のメモだけ・言葉は AND', async () => {
    const r = await call('search_memos', { query: '謙虚' });
    expect(text(r)).toContain('謙虚にして驕らず');
    expect(text(r)).not.toContain('他人のメモ');
    expect(text(r)).toContain('『考え方』');
    expect(text(await call('search_memos', { query: '謙虚 驕らず' }))).toContain('メモ 1 件');
    expect(text(await call('search_memos', { query: '謙虚 ない' }))).toContain('ありませんでした');
    expect((await call('search_memos', { query: '  ' })).result.isError).toBe(true);
  });
  it('recent_memos / list_actions', async () => {
    expect(text(await call('recent_memos', { limit: 5 }))).toContain('謙虚にして驕らず');
    expect(text(await call('recent_memos', { days: 1 }))).toContain('まだありません');
    expect(text(await call('list_actions'))).toContain('朝に 10 分');
    expect(text(await call('list_actions', { done: true }))).toContain('まだありません');
  });
});

describe('書く', () => {
  it('add_memo は自分の本にだけ・本なしは personal・制御文字を除く', async () => {
    const r = await call('add_memo', { book_id: B1, text: 'あたらしい\u0007メモ', page_number: 3, tags: ['a', ''] });
    expect(r.result.isError).toBe(false);
    const [table, row] = db.inserted[0];
    expect(table).toBe('book_memos');
    expect(row).toMatchObject({ user_id: ME, book_id: B1, text: 'あたらしい メモ', page_number: 3, tags: ['a'], source_type: 'book' });
    const p = await call('add_memo', { text: '本なしの学び' });
    expect(db.inserted[1][1]).toMatchObject({ book_id: null, source_type: 'personal' });
    expect(text(p)).toContain('本なし');
    expect((await call('add_memo', { book_id: B2, text: 'x' })).result.isError).toBe(true);
    expect((await call('add_memo', { text: '' })).result.isError).toBe(true);
    expect(db.inserted).toHaveLength(2);
  });
  it('add_action は自分の本にだけ・期限は YYYY-MM-DD だけ', async () => {
    const r = await call('add_action', { book_id: B1, text: '朝に読む', deadline: '2026-11-20' });
    expect(r.result.isError).toBe(false);
    expect(db.inserted[0][1]).toMatchObject({ user_id: ME, book_id: B1, text: '朝に読む', deadline: '2026-11-20', done: false });
    await call('add_action', { book_id: B1, text: 'x', deadline: '来週' });
    expect(db.inserted[1][1].deadline).toBeNull();
    expect((await call('add_action', { book_id: B2, text: 'x' })).result.isError).toBe(true);
    expect((await call('add_action', { text: 'x' })).result.isError).toBe(true);
  });
});
