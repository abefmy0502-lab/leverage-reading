import { describe, it, expect } from 'vitest';
import { expandPlan, usableItem, rowFromRakuten, parseSummary, summaryUserText, collectStep, summarizeStep, runAdvisorBooks, PLAN_VERSION, REFRESH_DAYS } from './_advisorBooks.js';

// supabase の最小の偽物（使う形だけ）。
function fakeDb({ state = null, books = [], noTable = false } = {}) {
  const t = { advisor_books: new Map(books.map((b) => [b.isbn, { status: 'pending', attempts: 0, summary: '', ...b }])), state };
  const err = noTable ? { code: '42P01', message: 'relation "advisor_books_state" does not exist' } : null;
  const db = {
    t,
    from(table) {
      const q = { table, filters: [], orderBy: null, lim: null, patch: null };
      const run = () => {
        if (table === 'advisor_books_state') return { data: t.state, error: err };
        let rows = [...t.advisor_books.values()];
        for (const [k, v] of q.filters) rows = rows.filter((r) => r[k] === v);
        if (q.orderBy) rows.sort((a, b) => (a[q.orderBy] ?? 1e9) - (b[q.orderBy] ?? 1e9));
        if (q.lim) rows = rows.slice(0, q.lim);
        return { data: rows, error: null };
      };
      const api = {
        select() { return api; },
        eq(k, v) { q.filters.push([k, v]); if (q.patch) { for (const r of t.advisor_books.values()) if (r[k] === v) Object.assign(r, q.patch); return Promise.resolve({ error: null }); } return api; },
        order(k) { q.orderBy = k; return api; },
        limit(n) { q.lim = n; return Promise.resolve(run()); },
        maybeSingle() { return Promise.resolve(table === 'advisor_books_state' ? { data: t.state, error: err } : run()); },
        update(patch) { q.patch = patch; return api; },
        upsert(rows) {
          if (err) return Promise.resolve({ error: err });
          if (table === 'advisor_books_state') { t.state = { ...(t.state || {}), ...rows }; return Promise.resolve({ error: null }); }
          for (const r of rows) t.advisor_books.set(r.isbn, { status: 'pending', attempts: 0, summary: '', ...(t.advisor_books.get(r.isbn) || {}), ...r });
          return Promise.resolve({ error: null });
        },
      };
      return api;
    },
  };
  return db;
}

const env = { RAKUTEN_APPLICATION_ID: 'id', RAKUTEN_ACCESS_KEY: 'pk', RAKUTEN_APP_URL: 'https://x', GEMINI_API_KEY: 'g' };
const item = (n, extra = {}) => ({ title: `本${n}`, subTitle: '', author: '稲盛和夫/見本花子', publisherName: '見本社', isbn: `97840000000${String(n).padStart(2, '0')}`, salesDate: '2024年05月10日', largeImageUrl: 'http://img/x.jpg?_ex=200x200', itemCaption: `【内容情報】${'この本は習慣の作り方を書いた本です。'.repeat(4)}【目次】第1章 はじめに`, reviewCount: 12, reviewAverage: '4.2', booksGenreId: '001006009', ...extra });
const page = (items) => ({ status: 200, body: JSON.stringify({ Items: items.map((Item) => ({ Item })) }) });

describe('集める決まり', () => {
  it('分野 55 ページ＋言葉 120 ページ', () => {
    const steps = expandPlan();
    expect(steps.length).toBe(55 + 120);
    expect(steps[0].params).toMatchObject({ booksGenreId: '001006', page: '1' });
    expect(steps.at(-1).api).toBe('BooksTotal/Search');
  });
  it('漫画・問題集・雑誌は集めない', () => {
    const r = (o) => rowFromRakuten(item(1, o), 1, 'x');
    expect(usableItem(r({}))).toBe(true);
    expect(usableItem(r({ booksGenreId: '001001001' }))).toBe(false);
    expect(usableItem(r({ title: 'SPI 対策問題集' }))).toBe(false);
    expect(usableItem(r({ title: '日経ビジネス 11月号' }))).toBe(false);
  });
  it('楽天の 1 件を 1 行に（ISBN・著者・表紙・紹介文と目次）', () => {
    const row = rowFromRakuten(item(3), 7, 'genre:001006');
    expect(row.author).toContain('稲盛和夫');
    expect(row).toMatchObject({ isbn: '9784000000003', publisher: '見本社', pub_date: '2024-05-10', sales_rank: 7, review_count: 12, review_avg: 4.2, source: 'genre:001006' });
    expect(row.cover).toMatch(/^https:/);
    expect(row.cover).toContain('_ex=420x420');
    expect(row.description).toContain('習慣の作り方');
  });
});

describe('AI の答え', () => {
  const ok = { summary: '習慣を作る本。', points: ['小さく始める', '環境を整える', '記録する'], for_whom: ['続かない人に', '三日坊主のとき', '朝が弱い人に'], reason: '仕組みで続ける方法が具体的', keywords: ['習慣', '継続', '三日坊主', '行動'], fields: ['習慣・自己成長', '架空の分野'], level: '実践' };
  it('読める・分野は一覧にあるものだけ・段階は決まった 4 つ', () => {
    const p = parseSummary(`前置き ${JSON.stringify(ok)} おわり`);
    expect(p.fields).toEqual(['習慣・自己成長']);
    expect(p.level).toBe('実践');
    expect(parseSummary(JSON.stringify({ ...ok, level: 'すごい' })).level).toBe('');
  });
  it('skip・中身が足りない・壊れた答え', () => {
    expect(parseSummary('{"skip": true}')).toEqual({ skip: true });
    expect(parseSummary(JSON.stringify({ ...ok, keywords: ['a'] }))).toBe(null);
    expect(parseSummary('だめ')).toBe(null);
  });
  it('AI に渡すのは書誌と紹介文だけ', () => {
    const t = summaryUserText({ title: '本', subtitle: '副', author: 'A', publisher: 'P', pub_date: '2024-05', description: '紹介' });
    expect(t).toContain('書名: 本 副');
    expect(t).toContain('紹介文:\n紹介');
  });
});

describe('collectStep', () => {
  const clock = () => { let t = Date.parse('2026-11-17T18:00:00Z'); return () => { t += 10; return t; }; };
  it('はじめは最初から・集めた本を入れ・続きの位置を残す', async () => {
    const db = fakeDb();
    const now = clock();
    let calls = 0;
    const get = async () => { calls += 1; return page([item(calls), item(50, { title: 'マンガでわかる', booksGenreId: '001001' })]); };
    const r = await collectStep({ db, env, now, deadline: now() + 3000 + 50, rakutenGetImpl: get, pause: 0 });
    expect(r.pages).toBeGreaterThan(0);
    expect(db.t.advisor_books.has('9784000000001')).toBe(true);
    expect([...db.t.advisor_books.values()].some((b) => b.title === 'マンガでわかる')).toBe(false);
    expect(db.t.state).toMatchObject({ plan_version: PLAN_VERSION, cursor: r.pages });
  });
  it('1 回り終えたら 7 日待つ・7 日たったら最初から', async () => {
    const steps = expandPlan().length;
    const started = Date.parse('2026-11-10T18:00:00Z');
    const db = fakeDb({ state: { id: 1, plan_version: PLAN_VERSION, cursor: steps, pass_started_at: new Date(started).toISOString() } });
    const soon = await collectStep({ db, env, now: () => started + (REFRESH_DAYS - 1) * 864e5, deadline: Infinity, rakutenGetImpl: async () => page([]), pause: 0 });
    expect(soon.skipped).toBe('waiting_next_pass');
    let n = 0;
    const later = await collectStep({ db, env, now: () => { n += 1; return started + REFRESH_DAYS * 864e5 + n; }, deadline: started + REFRESH_DAYS * 864e5 + 3010, rakutenGetImpl: async () => page([item(9)]), pause: 0 });
    expect(later.pages).toBeGreaterThan(0);
    expect(db.t.state.cursor).toBe(later.pages);
  });
  it('楽天の鍵が無ければ何もしない・混んでいたら止めて次の Cron へ', async () => {
    expect((await collectStep({ db: fakeDb(), env: {}, deadline: Infinity })).skipped).toBe('no_rakuten_key');
    const db = fakeDb();
    const r = await collectStep({ db, env, deadline: Infinity, rakutenGetImpl: async () => ({ status: 429, body: '' }), pause: 0 });
    expect(r.pages).toBe(0);
  });
});

describe('summarizeStep', () => {
  it('紹介文の短い本は thin・整えた本は ready・3 回失敗で failed', async () => {
    const db = fakeDb({ books: [
      { isbn: '9784000000001', title: 'A', description: 'x'.repeat(100), sales_rank: 1 },
      { isbn: '9784000000002', title: 'B', description: '短い', sales_rank: 2 },
      { isbn: '9784000000003', title: 'C', description: 'y'.repeat(100), sales_rank: 3, attempts: 2 },
    ] });
    const ai = async (b) => (b.title === 'A' ? { parsed: { summary: 's', points: ['p'], for_whom: ['f'], reason: 'r', keywords: ['k1', 'k2', 'k3'], fields: [], level: '' }, model: 'm', mjpy: 100 } : { parsed: null, mjpy: 0 });
    const r = await summarizeStep({ db, env, now: () => 0, deadline: 1e9, aiImpl: ai });
    expect(r).toMatchObject({ ready: 1, thin: 1, failed: 1 });
    expect(db.t.advisor_books.get('9784000000001')).toMatchObject({ status: 'ready', summary: 's' });
    expect(db.t.advisor_books.get('9784000000002').status).toBe('thin');
    expect(db.t.advisor_books.get('9784000000003').status).toBe('failed');
  });
  it('AI の鍵が無ければ何もしない', async () => {
    expect((await summarizeStep({ db: fakeDb(), env: {}, deadline: 1e9 })).skipped).toBe('no_ai_key');
  });
});

describe('runAdvisorBooks', () => {
  it('ADVISOR_BOOKS=off で止める・表が無ければ静かに', async () => {
    expect(await runAdvisorBooks({ db: fakeDb(), env: { ...env, ADVISOR_BOOKS: 'off' } })).toEqual({ skipped: 'off' });
    expect(await runAdvisorBooks({ db: fakeDb({ noTable: true }), env, budgetMs: 40000 })).toEqual({ skipped: 'no_table' });
  });
});
