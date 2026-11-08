// api/_mcp.js を偽の DB で動かして、本人の行だけ・読み書きの形・JSON-RPC の決まり・画面の資料を確かめる。
import { describe, it, expect, beforeEach } from 'vitest';
import { handleRpc, handleBatch, resolveToken, touchToken, sha256Hex, looksLikeToken, TOOLS, PROMPTS, RESOURCES, PROTOCOL_VERSION, TOKEN_PREFIX } from './_mcp.js';
import { WIDGET_URI_MCP, WIDGET_URI_OPENAI, widgetHtml } from './_mcpWidget.js';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const B1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const M1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOKEN = `${TOKEN_PREFIX}abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG`;
const NOW = Date.parse('2026-11-07T03:00:00Z'); // 土曜 12:00 JST

let db;
function resetDb() {
  db = {
    books: [
      { id: B1, user_id: ME, title: '考え方', author: '稲盛和夫', status: 'done', rating: 5, cover: 'https://x/c.jpg', start_date: '2026-09-01', done_date: '2026-09-20', invest_purpose: '判断の軸', leverage_memo: 'まとめの文', updated_at: '2026-10-02', book_tags: [{ tag_name: '自己成長' }] },
      { id: B2, user_id: OTHER, title: '他人の本', author: 'X', status: 'reading', updated_at: '2026-10-03', book_tags: [] },
    ],
    book_tags: [{ book_id: B1, user_id: ME, tag_name: '自己成長' }],
    book_memos: [
      { id: M1, user_id: ME, book_id: B1, text: '謙虚にして驕らず', page_number: 12, tags: ['心'], created_at: '2026-09-10T00:00:00Z' },
      { id: 'm2', user_id: OTHER, book_id: B2, text: '謙虚 他人のメモ', page_number: 1, tags: [], created_at: '2026-09-11T00:00:00Z' },
    ],
    actions: [{ id: A1, user_id: ME, book_id: B1, text: '朝に 10 分', deadline: '2026-11-10', done: false, created_at: '2026-10-01' }],
    reading_sessions: [
      { user_id: ME, book_id: B1, started_at: '2026-11-06T12:00:00Z', seconds: 1800 }, // 今週（金）
      { user_id: ME, book_id: B1, started_at: '2026-10-20T12:00:00Z', seconds: 600 }, // 先月
      { user_id: OTHER, book_id: B2, started_at: '2026-11-06T12:00:00Z', seconds: 9999 },
    ],
    mcp_tokens: [{ id: 't1', user_id: ME, token_hash: sha256Hex(TOKEN), revoked_at: null, last_used_at: null }],
    inserted: [],
    updated: [],
  };
}

// supabase-js の形を最低限まねた偽のクエリ
function fake() {
  return {
    rpc(name, args) {
      if (name === 'admin_act_for') {
        if (!db.admins?.includes(args.p_user_id)) return Promise.resolve({ data: null, error: { message: 'not authorized' } });
        db.acts = db.acts || []; db.acts.push([args.p_action, args.p_args]);
        if (args.p_action === 'task_list') return Promise.resolve({ data: [{ id: 'a', due_date: '2026-11-08', title: 'LP を直す', done: false }], error: null });
        if (args.p_action === 'goal_get') return Promise.resolve({ data: { target: 1000, deadline: '2027-12-31' }, error: null });
        return Promise.resolve({ data: { ok: true, id: '11111111-1111-4111-8111-111111111111' }, error: null });
      }
      if (name !== 'admin_snapshot_for') return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
      if (db.admins?.includes(args.p_user_id)) return Promise.resolve({ data: { overview: { users_total: 12, new_users_7d: 2, new_users_30d: 5, mau: 9, wau: 6, dau: 2, books_total: 40, memos_total: 300, actions_total: 20, actions_done: 7, feedback_open: 1 }, profit: { paid: { monthly: 3, annual: 1, founding: 2, trial: 1 } } }, error: null });
      return Promise.resolve({ data: null, error: { message: 'not authorized' } });
    },
    from(table) {
      const f = [];
      let op = 'select';
      let payload = null;
      let lim = Infinity;
      let from = 0;
      const q = {
        select() { return q; },
        eq(c, v) { f.push((r) => String(r[c]) === String(v)); return q; },
        in(c, vs) { f.push((r) => vs.map(String).includes(String(r[c]))); return q; },
        ilike(c, v) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$', 'i'); f.push((r) => re.test(String(r[c] || ''))); return q; },
        gte(c, v) { f.push((r) => String(r[c]) >= String(v)); return q; },
        contains(c, vs) { f.push((r) => Array.isArray(r[c]) && vs.every((x) => r[c].includes(x))); return q; },
        or(expr) { const parts = expr.split(',').map((p) => { const [c, , v] = p.split('.'); return [c, new RegExp(v.replace(/%/g, '.*'), 'i')]; }); f.push((r) => parts.some(([c, re]) => re.test(String(r[c] || '')))); return q; },
        order() { return q; },
        range(a) { from = a; return q; },
        limit(n) { lim = n; return q; },
        insert(rows) { op = 'insert'; payload = rows; return q; },
        update(patch) { op = 'update'; payload = patch; return q; },
        then(res, rej) {
          try {
            if (op === 'insert') { const rows = payload.map((r, i) => ({ ...r, id: r.id || `new-${table}-${db.inserted.length}-${i}` })); db[table].push(...rows); db.inserted.push([table, rows[0]]); return Promise.resolve({ data: rows, error: null }).then(res, rej); }
            if (op === 'update') { const hit = (db[table] || []).filter((r) => f.every((fn) => fn(r))); hit.forEach((r) => Object.assign(r, payload)); db.updated.push([table, payload]); return Promise.resolve({ data: hit, error: null }).then(res, rej); }
            const rows = (db[table] || []).filter((r) => f.every((fn) => fn(r))).slice(from, from + lim);
            return Promise.resolve({ data: rows, error: null }).then(res, rej);
          } catch (e) { return Promise.resolve({ data: null, error: { message: String(e) } }).then(res, rej); }
        },
      };
      return q;
    },
  };
}

const ctx = (extra = {}) => ({ db: fake(), userId: ME, now: NOW, ...extra });
const call = (name, args = {}, extra = {}) => handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, ctx(extra));
const text = (r) => r.result.content[0].text;
const sc = (r) => r.result.structuredContent;

beforeEach(resetDb);

describe('接続キー', () => {
  it('形・ハッシュ・取り消しで本人を決める', async () => {
    expect(looksLikeToken(TOKEN)).toBe(true);
    expect(looksLikeToken('orime_mcp_short')).toBe(false);
    const who = await resolveToken(fake(), TOKEN);
    expect(who).toEqual({ userId: ME, tokenId: 't1', lastUsedAt: null });
    expect(await resolveToken(fake(), `${TOKEN_PREFIX}zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz`)).toBeNull();
    db.mcp_tokens[0].revoked_at = '2026-11-01T00:00:00Z';
    expect(await resolveToken(fake(), TOKEN)).toBeNull();
  });
  it('最後に使った時刻は 10 分に 1 回だけ書く', async () => {
    expect(await touchToken(fake(), { tokenId: 't1', lastUsedAt: null }, NOW)).toBe(true);
    expect(db.updated).toHaveLength(1);
    expect(await touchToken(fake(), { tokenId: 't1', lastUsedAt: new Date(NOW - 60000).toISOString() }, NOW)).toBe(false);
  });
});

describe('JSON-RPC', () => {
  it('initialize / ping / tools/list / 通知 / 知らない method', async () => {
    const init = await handleRpc({ jsonrpc: '2.0', id: 0, method: 'initialize', params: {} }, ctx());
    expect(init.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(Object.keys(init.result.capabilities).sort()).toEqual(['prompts', 'resources', 'tools']);
    expect((await handleRpc({ jsonrpc: '2.0', id: 2, method: 'ping' }, ctx())).result).toEqual({});
    const list = await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, ctx());
    expect(list.result.tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(TOOLS.every((t) => t.inputSchema?.type === 'object' && t.description)).toBe(true);
    expect(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx())).toBeNull();
    expect((await handleRpc({ jsonrpc: '2.0', id: 4, method: 'logging/setLevel' }, ctx())).error.code).toBe(-32601);
    expect((await handleRpc({ foo: 1 }, ctx())).error.code).toBe(-32600);
  });
  it('配列は配列で返し、通知だけなら空', async () => {
    const out = await handleBatch([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }], ctx());
    expect(out).toHaveLength(1);
    expect(await handleBatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx())).toEqual([]);
  });
  it('知らない道具は -32602', async () => {
    expect((await call('delete_everything')).error.code).toBe(-32602);
  });
});

describe('会話の中に描く画面（MCP Apps・ChatGPT）', () => {
  it('読む道具には画面の印・資料に 2 つの HTML・structuredContent を返す', async () => {
    for (const n of ['list_books', 'get_book', 'search_memos', 'recent_memos', 'list_actions', 'reading_stats']) {
      const t = TOOLS.find((x) => x.name === n);
      expect(t._meta.ui.resourceUri).toBe(WIDGET_URI_MCP);
      expect(t._meta['openai/outputTemplate']).toBe(WIDGET_URI_OPENAI);
    }
    expect(TOOLS.find((x) => x.name === 'add_memo')._meta).toBeUndefined();
    const list = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'resources/list' }, ctx());
    expect(list.result.resources.map((r) => r.uri)).toEqual(RESOURCES.map((r) => r.uri));
    const mcp = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: WIDGET_URI_MCP } }, ctx());
    expect(mcp.result.contents[0].mimeType).toBe('text/html;profile=mcp-app');
    const oa = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: WIDGET_URI_OPENAI } }, ctx());
    expect(oa.result.contents[0].mimeType).toBe('text/html+skybridge');
    expect(oa.result.contents[0].text).toBe(widgetHtml());
    expect(widgetHtml()).toContain('ui/initialize');
    expect(widgetHtml()).toContain('openai:set_globals');
    expect(widgetHtml()).not.toMatch(/https?:\/\/(?!x)/); // 外へ取りに行かない
    const r = await call('list_books');
    expect(sc(r).books[0]).toMatchObject({ id: B1, title: '考え方', fields: ['自己成長'], cover: 'https://x/c.jpg' });
  });
  it('資料: 本棚・最近のメモ・行動・1 冊・知らない uri', async () => {
    const t = async (uri) => (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri } }, ctx()));
    expect((await t('orime://books')).result.contents[0].text).toContain('考え方');
    expect((await t('orime://memos/recent')).result.contents[0].text).toContain('謙虚にして驕らず');
    expect((await t('orime://actions')).result.contents[0].text).toContain('朝に 10 分');
    expect((await t(`orime://books/${B1}`)).result.contents[0].text).toContain('得たいこと');
    expect((await t(`orime://books/${B2}`)).error.code).toBe(-32603);
    expect((await t('orime://nope')).error.code).toBe(-32002);
    const tpl = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'resources/templates/list' }, ctx());
    expect(tpl.result.resourceTemplates[0].uriTemplate).toBe('orime://books/{book_id}');
  });
  it('プロンプト: 一覧と中身', async () => {
    const list = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'prompts/list' }, ctx());
    expect(list.result.prompts.map((p) => p.name)).toEqual(PROMPTS.map((p) => p.name));
    const get = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'consult', arguments: { question: '部下が\u0007育たない' } } }, ctx());
    expect(get.result.messages[0].content.text).toContain('相談: 部下が 育たない');
    expect(get.result.messages[0].content.text).toContain('search_memos');
    expect((await handleRpc({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'nope' } }, ctx())).error.code).toBe(-32602);
    const save = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'save_conversation', arguments: { note: '仕事の軸' } } }, ctx());
    expect(save.result.messages[0].content.text).toContain('add_memo');
    expect(save.result.messages[0].content.text).toContain('本人の一言: 仕事の軸');
    for (const p of PROMPTS) expect((await handleRpc({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: p.name, arguments: {} } }, ctx())).result.messages).toHaveLength(1);
  });
});

describe('読む（本人のものだけ）', () => {
  it('list_books は自分の本だけ・状態・分野・言葉で絞れる・続き', async () => {
    const r = await call('list_books');
    expect(text(r)).toContain('考え方');
    expect(text(r)).not.toContain('他人の本');
    expect(text(r)).toContain('★5');
    expect(text(r)).toContain(`book_id: ${B1}`);
    expect(text(await call('list_books', { status: 'reading' }))).toContain('見つかりません');
    expect(text(await call('list_books', { query: '稲盛' }))).toContain('考え方');
    expect(text(await call('list_books', { field: '自己成長' }))).toContain('考え方');
    expect(text(await call('list_books', { field: '経営' }))).toContain('ありません');
    expect(text(await call('list_books', { offset: 1 }))).toContain('見つかりません');
  });
  it('get_book は他人の本を拒む・自分の本はメモと行動と読書の時間つき', async () => {
    const no = await call('get_book', { book_id: B2 });
    expect(no.result.isError).toBe(true);
    expect((await call('get_book', { book_id: 'x' })).result.isError).toBe(true);
    const r = await call('get_book', { book_id: B1 });
    expect(text(r)).toContain('謙虚にして驕らず');
    expect(text(r)).toContain('p.12');
    expect(text(r)).toContain('得たいこと: 判断の軸');
    expect(text(r)).toContain('この本のまとめ');
    expect(text(r)).toContain('[ ] 朝に 10 分');
    expect(text(r)).toContain('読書の時間: 40 分');
    expect(sc(r).book.id).toBe(B1);
    expect(sc(r).memos).toHaveLength(1);
    expect(sc(r).reading_seconds).toBe(2400);
  });
  it('search_memos は自分のメモだけ・言葉は AND・タグでも', async () => {
    const r = await call('search_memos', { query: '謙虚' });
    expect(text(r)).toContain('謙虚にして驕らず');
    expect(text(r)).not.toContain('他人のメモ');
    expect(text(r)).toContain('『考え方』');
    expect(sc(r).memos[0]).toMatchObject({ id: M1, book_title: '考え方', tags: ['心'] });
    expect(text(await call('search_memos', { query: '謙虚 驕らず' }))).toContain('メモ 1 件');
    expect(text(await call('search_memos', { query: '謙虚 ない' }))).toContain('ありませんでした');
    expect(text(await call('search_memos', { tag: '心' }))).toContain('メモ 1 件');
    expect((await call('search_memos', { query: '  ' })).result.isError).toBe(true);
  });
  it('recent_memos / list_actions', async () => {
    expect(text(await call('recent_memos', { limit: 5 }))).toContain('謙虚にして驕らず');
    expect(text(await call('recent_memos', { days: 1 }))).toContain('まだありません');
    const a = await call('list_actions');
    expect(text(a)).toContain('朝に 10 分');
    expect(text(a)).toContain(`action_id: ${A1}`);
    expect(text(await call('list_actions', { done: true }))).toContain('まだありません');
  });
  it('reading_stats は数と読書の時間（今週・今月・これまで・本ごと）', async () => {
    const r = await call('reading_stats');
    expect(text(r)).toContain('本 1 冊（読了 1・読書中 0）・メモ 1 件・行動 まだ 1 / 完了 0');
    expect(text(r)).toContain('今週 30 分・今月 30 分・これまで 40 分');
    expect(sc(r).stats.books[0]).toMatchObject({ title: '考え方', seconds: 2400 });
    db.reading_sessions = [];
    expect(text(await call('reading_stats'))).toContain('記録はまだありません');
  });
});

describe('運営だけの道具', () => {
  it('ops_dashboard は管理者だけ・数字のまとめと structuredContent', async () => {
    const no = await call('ops_dashboard');
    expect(no.result.isError).toBe(true);
    expect(text(no)).toContain('運営者だけ');
    db.admins = [ME];
    const r = await call('ops_dashboard');
    expect(r.result.isError).toBe(false);
    expect(text(r)).toContain('利用者 12 人');
    expect(text(r)).toContain('月額 3・年額 1・創業メンバー 2・無料期間 1');
    expect(sc(r).overview.mau).toBe(9);
    expect(TOOLS.find((t) => t.name === 'ops_dashboard')._meta).toBeUndefined();
    expect(sc(r).launch_gates).toBeTruthy();
  });
  it('指示の道具は管理者だけ・admin_act_for に正しい動作名で渡す', async () => {
    const no = await call('ops_tasks', { action: 'list' });
    expect(no.result.isError).toBe(true);
    db.admins = [ME];
    const list = await call('ops_tasks', { action: 'list' });
    expect(text(list)).toContain('やること 1 件');
    const add = await call('ops_tasks', { action: 'add', title: '  note を書く ', due_date: '2026-11-10', dept: 'マーケ' });
    expect(add.result.isError).toBe(false);
    expect(db.acts.at(-1)).toEqual(['task_add', { title: 'note を書く', due_date: '2026-11-10', dept: 'マーケ' }]);
    const bad = await call('ops_tasks', { action: 'add', title: 'x', due_date: '来週' });
    expect(bad.result.isError).toBe(true);
    const goal = await call('ops_goal', { action: 'get' });
    expect(text(goal)).toContain('1000 人');
    const setGoal = await call('ops_goal', { action: 'set', target: 1200, deadline: '2027-12-31' });
    expect(setGoal.result.isError).toBe(false);
    const fb = await call('ops_feedback', { action: 'update', id: '11111111-1111-4111-8111-111111111111', status: 'resolved', note: '直した' });
    expect(fb.result.isError).toBe(false);
    expect(db.acts.at(-1)[0]).toBe('feedback_update');
    const tk = await call('ops_tickets', { action: 'create', title: '表紙が出ない', kind: 'bug', priority: 1 });
    expect(text(tk)).toContain('表紙が出ない');
    const wk = await call('ops_week', { action: 'sales', new_paid: 2, lp_clicks: 30 });
    expect(wk.result.isError).toBe(false);
    for (const n of ['ops_feedback', 'ops_tickets', 'ops_tasks', 'ops_goal', 'ops_week']) expect(TOOLS.find((t) => t.name === n)._meta).toBeUndefined();
  });
});

describe('書く', () => {
  it('add_memo は自分の本にだけ・本なしは personal・制御文字を除く', async () => {
    const r = await call('add_memo', { book_id: B1, text: 'あたらしい\u0007メモ', page_number: 3, tags: ['a', ''] });
    expect(r.result.isError).toBe(false);
    expect(db.inserted[0][1]).toMatchObject({ user_id: ME, book_id: B1, text: 'あたらしい メモ', page_number: 3, tags: ['a'], source_type: 'book' });
    expect(sc(r).memo_id).toBeTruthy();
    await call('add_memo', { text: '本なしの学び' });
    expect(db.inserted[1][1]).toMatchObject({ book_id: null, source_type: 'personal' });
    expect((await call('add_memo', { book_id: B2, text: 'x' })).result.isError).toBe(true);
    expect((await call('add_memo', { text: '' })).result.isError).toBe(true);
    expect(db.inserted).toHaveLength(2);
  });
  it('update_memo は本人のメモだけ・直すものが無ければ断る', async () => {
    const r = await call('update_memo', { memo_id: M1, text: '直した', tags: ['b'] });
    expect(r.result.isError).toBe(false);
    expect(db.book_memos[0]).toMatchObject({ text: '直した', tags: ['b'], page_number: 12 });
    expect((await call('update_memo', { memo_id: M1 })).result.isError).toBe(true);
    expect((await call('update_memo', { memo_id: 'cccccccc-cccc-4ccc-8ccc-000000000000', text: 'x' })).result.isError).toBe(true);
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
  it('complete_action は完了と時刻とふりかえり', async () => {
    const r = await call('complete_action', { action_id: A1, reflection: '続いた' });
    expect(text(r)).toContain('「朝に 10 分」を完了にしました');
    expect(db.actions[0]).toMatchObject({ done: true, completed_at: new Date(NOW).toISOString(), reflection: '続いた' });
    expect((await call('complete_action', { action_id: 'dddddddd-dddd-4ddd-8ddd-000000000000' })).result.isError).toBe(true);
  });
  it('add_book は書誌で探して足す・同じ本は足さない・見つからなければ書名だけ', async () => {
    const searchBooks = async (q) => ({ results: q.includes('7つの習慣') ? [{ title: '完訳 7つの習慣', author: 'スティーブン・R・コヴィー', isbn: '9784863940246', cover: 'http://img/x.jpg' }] : [] });
    const r = await call('add_book', { title: '7つの習慣', reason: '仕事の軸' }, { searchBooks });
    expect(text(r)).toContain('『完訳 7つの習慣』を積読に足しました');
    expect(db.inserted[0][1]).toMatchObject({ user_id: ME, title: '完訳 7つの習慣', isbn: '9784863940246', cover: 'https://img/x.jpg', status: 'before', added_via: 'search', book_reason: '仕事の軸' });
    const again = await call('add_book', { title: '7つの習慣' }, { searchBooks });
    expect(text(again)).toContain('本棚にあります');
    expect(db.inserted).toHaveLength(1);
    const manual = await call('add_book', { title: '無名の本', author: '誰か', status: 'reading' }, { searchBooks });
    expect(text(manual)).toContain('書名だけ');
    expect(db.inserted[1][1]).toMatchObject({ title: '無名の本', author: '誰か', status: 'reading', added_via: 'manual' });
    expect(db.inserted[1][1].start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(text(await call('add_book', { title: '考え方' }, { searchBooks }))).toContain('本棚にあります');
  });
});
