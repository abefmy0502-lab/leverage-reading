import { describe, it, expect } from 'vitest';
import { expandPlan, usableItem, rowFromRakuten, parseSummary, summaryUserText, collectStep, summarizeStep, runAdvisorBooks, PLAN_VERSION, REFRESH_DAYS, parseAddList, queueStep, QUEUE_ADD_MAX, SUMMARY_SYSTEM, cCodeLabel, parseOpenbdMeta, PROMPT_VERSION as PV, parseExtList, parseMarkList, MARK_ADD_MAX, refreshSignals, jstDay } from './_advisorBooks.js';

// supabase の最小の偽物（使う形だけ）。
function fakeDb({ state = null, books = [], noTable = false, noRanks = false } = {}) {
  const t = { advisor_books: new Map(books.map((b) => [b.isbn, { status: 'pending', attempts: 0, summary: '', ...b }])), state, other: {} };
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
          if (table !== 'advisor_books') {
            if (noRanks && table === 'advisor_book_ranks') return Promise.resolve({ error: { code: 'PGRST205', message: "Could not find the table 'public.advisor_book_ranks'" } });
            t.other[table] = [...(t.other[table] || []), ...rows];
            return Promise.resolve({ error: null });
          }
          for (const r of rows) t.advisor_books.set(r.isbn, { status: 'pending', attempts: 0, summary: '', ...(t.advisor_books.get(r.isbn) || {}), ...r });
          return Promise.resolve({ error: null });
        },
      };
      return api;
    },
  };
  return db;
}

const env = { RAKUTEN_APPLICATION_ID: 'id', RAKUTEN_ACCESS_KEY: 'pk', RAKUTEN_APP_URL: 'https://x', GEMINI_API_KEY: 'g', ADVISOR_BOOKS_OPENBD: 'off' };
const item = (n, extra = {}) => ({ title: `本${n}`, subTitle: '', author: '稲盛和夫/見本花子', publisherName: '見本社', isbn: `97840000000${String(n).padStart(2, '0')}`, salesDate: '2024年05月10日', largeImageUrl: 'http://img/x.jpg?_ex=200x200', itemCaption: `【内容情報】${'この本は習慣の作り方を書いた本です。'.repeat(4)}【目次】第1章 はじめに`, reviewCount: 12, reviewAverage: '4.2', booksGenreId: '001006009', ...extra });
const page = (items) => ({ status: 200, body: JSON.stringify({ Items: items.map((Item) => ({ Item })) }) });

describe('集める決まり', () => {
  it('分野 55 ページ＋言葉 160 ページ＋出版社 16 ページ', () => {
    const steps = expandPlan();
    expect(steps.length).toBe(55 + 160 + 16);
    expect(steps[0].params).toMatchObject({ booksGenreId: '001006', page: '1' });
    expect(steps.filter((s) => s.api === 'BooksTotal/Search')).toHaveLength(160);
    expect(steps.at(-1)).toMatchObject({ api: 'BooksBook/Search', params: { publisherName: '日本経済新聞出版', booksGenreId: '001006', page: '2' } });
  });
  it('足した言葉と出版社は末尾（今の 1 回りの順番を崩さない）', () => {
    const steps = expandPlan();
    expect(steps[175].params).toMatchObject({ keyword: '起業', page: '1' });
    expect(new Set(steps.map((s) => s.source)).size).toBe(8 + 80 + 8);
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
  const ok = { summary: '習慣を作る本。', points: ['小さく始める', '環境を整える', '記録する'], for_whom: ['続かない人に', '三日坊主のとき', '朝が弱い人に'], reason: '仕組みで続ける方法が具体的', keywords: ['習慣', '継続', '三日坊主', '行動'], fields: ['習慣・自己管理', '架空の分野'], level: '実践' };
  it('読める・分野は一覧にあるものだけ・段階は決まった 4 つ', () => {
    const p = parseSummary(`前置き ${JSON.stringify(ok)} おわり`);
    expect(p.fields).toEqual(['習慣・自己管理']);
    expect(parseSummary(JSON.stringify({ ...ok, fields: ['「経営・組織」', '経営'] })).fields).toEqual(['経営・組織']);
    // 指示文の分野の一覧は 1 つずつ「」で囲む（名前の中の「・」と区切りを混ぜない）
    expect(SUMMARY_SYSTEM).toContain('「経営・組織」');
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

describe('運営が選んで足す本（ops_books の add）', () => {
  it('ISBN（10・13 桁・ハイフン）・「書名 / 著者」・{ isbn, title, author } を読み、同じ本は 1 つに', () => {
    const r = parseAddList(['978-4-479-79573-5', '4479795731', '『イシューからはじめよ』 / 安宅和人', { title: '考え方', author: '稲盛和夫' }, '', 12, { isbn: '9784479795735' }], '創業メンバーのすすめ');
    expect(r.rows).toEqual([
      { isbn: '9784479795735', title: '', author: '', note: '創業メンバーのすすめ' },
      { isbn: null, title: 'イシューからはじめよ', author: '安宅和人', note: '創業メンバーのすすめ' },
      { isbn: null, title: '考え方', author: '稲盛和夫', note: '創業メンバーのすすめ' },
    ]);
    expect(r.invalid).toBe(2);
    expect(parseAddList(Array.from({ length: QUEUE_ADD_MAX + 50 }, (_, i) => `本${i}`)).rows).toHaveLength(QUEUE_ADD_MAX);
  });

  // 待ち行列と本の表だけの小さな偽物
  function queueDb(queue, books = []) {
    const t = { q: queue.map((x, i) => ({ id: i + 1, status: 'queued', attempts: 0, note: '', ...x })), books: new Map(books.map((b) => [b.isbn, { ...b }])), calls: 0 };
    return {
      t,
      from(table) {
        const st = { filters: [], patch: null };
        const rowsOf = () => (table === 'advisor_books' ? [...t.books.values()] : t.q);
        const api = {
          select() { return api; },
          in(k, vs) { return Promise.resolve({ data: rowsOf().filter((r) => vs.includes(r[k])), error: null }); },
          eq(k, v) {
            st.filters.push([k, v]);
            if (st.patch) { for (const r of rowsOf()) if (r[k] === v) Object.assign(r, st.patch); return Promise.resolve({ error: null }); }
            return api;
          },
          order() { return api; },
          limit(n) { return Promise.resolve({ data: t.q.filter((r) => st.filters.every(([k, v]) => r[k] === v)).slice(0, n), error: null }); },
          update(patch) { st.patch = patch; return api; },
          upsert(rows) { for (const r of rows) t.books.set(r.isbn, { ...(t.books.get(r.isbn) || {}), ...r }); return Promise.resolve({ error: null }); },
        };
        if (table !== 'advisor_books_queue' && table !== 'advisor_books') throw new Error(table);
        return api;
      },
    };
  }

  it('楽天の書誌で確かめてから足す（ISBN は一致・書名は書名と著者がはっきり一致）・見つからない本は notfound', async () => {
    const db = queueDb([{ isbn: '9784000000001' }, { title: '本7', author: '稲盛和夫' }, { title: '世の中に無い本', author: '架空太郎' }]);
    const get = async (url) => {
      const u = new URL(url);
      if (u.searchParams.get('isbn')) return page([item(1)]);
      if (u.searchParams.get('title') === '本7') return page([item(8), item(7)]);
      return page([item(9, { title: '似ているけど違う本' })]);
    };
    const r = await queueStep({ db, env, now: () => 0, deadline: 1e9, rakutenGetImpl: get, pause: 0 });
    expect(r).toEqual({ done: 3, added: 2, notfound: 1, marked: 0 });
    expect(db.t.books.get('9784000000001')).toMatchObject({ curated: true, title: '本1' });
    expect(db.t.books.get('9784000000007')).toMatchObject({ curated: true, source: 'add' });
    expect(db.t.books.get('9784000000001')).not.toHaveProperty('sales_rank');
    expect(db.t.q.map((x) => x.status)).toEqual(['done', 'done', 'notfound']);
  });
  it('混んでいたら止めて次の Cron へ（3 回で failed）', async () => {
    const db = queueDb([{ isbn: '9784000000001', attempts: 2 }, { isbn: '9784000000002' }]);
    const r = await queueStep({ db, env, now: () => 0, deadline: 1e9, rakutenGetImpl: async () => ({ status: 429, body: '' }), pause: 0 });
    expect(r.done).toBe(0);
    expect(db.t.q[0].status).toBe('failed');
    expect(db.t.q[1].status).toBe('queued');
  });
  it('もうデータにある本は楽天に聞かずに印だけ・60 冊を超えても時間の許す限り続ける', async () => {
    const queue = Array.from({ length: 130 }, (_, i) => ({ isbn: `97840000${String(i).padStart(5, '0')}` }));
    const db = queueDb(queue, [{ isbn: queue[0].isbn, curated: false, title: 'もうある本' }]);
    let calls = 0;
    const get = async (url) => { calls += 1; const isbn = new URL(url).searchParams.get('isbn'); return page([item(1, { isbn })]); };
    const r = await queueStep({ db, env, now: () => 0, deadline: 1e9, rakutenGetImpl: get, pause: 0 });
    expect(r).toMatchObject({ done: 130, added: 129, marked: 1 });
    expect(calls).toBe(129);
    expect(db.t.books.get(queue[0].isbn)).toMatchObject({ curated: true, title: 'もうある本' });
    expect(db.t.q.every((x) => x.status === 'done')).toBe(true);
  });
});

describe('難しさと書評のデータ（2026-11-17）', () => {
  it('出版社の分類コードを言葉に・openBD から分類とページ数', () => {
    expect(cCodeLabel('3034')).toBe('専門・単行本（C3034）');
    expect(cCodeLabel('C0230')).toBe('一般・新書（C0230）');
    expect(cCodeLabel('abc')).toBe('');
    const rec = { onix: { DescriptiveDetail: { Subject: [{ SubjectSchemeIdentifier: '79', SubjectCode: 'x' }, { SubjectSchemeIdentifier: '78', SubjectCode: '0034' }], Extent: [{ ExtentType: '11', ExtentValue: '288' }] } } };
    expect(parseOpenbdMeta(rec)).toEqual({ c_code: '0034', pages: 288 });
  });
  it('難しさ（1〜3）と前提知識を読む・範囲の外は 0', () => {
    const ok = { summary: 's', points: ['p'], for_whom: ['f'], reason: 'r', keywords: ['k1', 'k2', 'k3'], fields: [], level: '実践' };
    expect(parseSummary(JSON.stringify({ ...ok, difficulty: 3, prereq: '会計の基礎' }))).toMatchObject({ difficulty: 3, prereq: '会計の基礎' });
    expect(parseSummary(JSON.stringify({ ...ok, difficulty: 7, prereq: 'なし' }))).toMatchObject({ difficulty: 0, prereq: '' });
    expect(PV).toBeGreaterThanOrEqual(2);
  });
  it('材料に書評サイトの要約・分類・ページ数・推薦者の数（写さない注意つき）', () => {
    const text = summaryUserText({ title: '本', description: '', ext_summary: '書評の要約です', ext_endorsers: 4, c_code: '3034', pages: 512 });
    expect(text).toContain('書評サイトの要約（参考・写さない）');
    expect(text).toContain('専門・単行本');
    expect(text).toContain('ページ数: 512');
    expect(text).toContain('4 件');
    expect(SUMMARY_SYSTEM).toContain('difficulty');
  });
  it('出版社の紹介文が短くても、書評の要約が十分あれば整える・分類とページ数も残す', async () => {
    const db = fakeDb({ books: [{ isbn: '9784000000011', title: '古い名著', description: '短い', sales_rank: 1 }] });
    const base = db.from.bind(db);
    db.from = (table) => (table === 'advisor_book_ext'
      ? { select: () => ({ in: async () => ({ data: [{ isbn: '9784000000011', summary: 'あ'.repeat(300), rec_points: 12, endorsers: [{ name: '甲' }] }] }) }) }
      : base(table));
    let seen = null;
    const ai = async (b) => { seen = b; return { parsed: { summary: 's', points: ['p'], for_whom: ['f'], reason: 'r', keywords: ['k1', 'k2', 'k3'], fields: [], level: '', difficulty: 3, prereq: '' }, model: 'm', mjpy: 1 }; };
    const r = await summarizeStep({ db, env: { ...env, ADVISOR_BOOKS_OPENBD: '' }, now: () => 0, deadline: 1e9, aiImpl: ai, metaImpl: async () => new Map([['9784000000011', { c_code: '3034', pages: 600 }]]) });
    expect(r.ready).toBe(1);
    expect(seen).toMatchObject({ ext_endorsers: 1, c_code: '3034', pages: 600 });
    expect(db.t.advisor_books.get('9784000000011')).toMatchObject({ status: 'ready', difficulty: 3, c_code: '3034', pages: 600, prompt_version: PV });
  });
});

describe('書評サイトのデータ（ops_books の ext）', () => {
  it('ISBN を 13 けたに・注記を外す・数の範囲・同じ本は 1 つ', () => {
    const r = parseExtList([
      { isbn: '4478017298', url: 'https://bookvinegar.jp/1/', points: 10, endorsers: [{ name: '中原淳 教授', note: '※肩書きは推薦当時のものです。' }, { name: '' }], tags: ['経営'], summary: ' 要約\r\n\n\n\n続き ' },
      { isbn: 'abc' },
      { isbn: '9784478017296', points: -3 },
    ]);
    expect(r.invalid).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ isbn: '9784478017296', rec_points: null, url: '', endorsers: [] });
    const one = parseExtList([{ isbn: '4478017298', url: 'https://bookvinegar.jp/1/', points: 10, endorsers: [{ name: '中原淳 教授', note: '※肩書きは推薦当時のものです。' }], summary: ' 要約\r\n\n\n\n続き ' }]).rows[0];
    expect(one).toMatchObject({ rec_points: 10, endorsers: [{ name: '中原淳 教授', note: '' }], summary: '要約\n\n続き' });
  });
});

describe('難しさの列がまだ無い本番でも止まらない', () => {
  it('列が無いと言われたら、今までの列だけで保存し直す（整える前に残らない）', async () => {
    const db = fakeDb({ books: [{ isbn: '9784000000021', title: '本', description: 'この本は習慣の作り方を書いた本です。'.repeat(4), sales_rank: 1 }] });
    const base = db.from.bind(db);
    let first = true;
    db.from = (table) => {
      const api = base(table);
      if (table !== 'advisor_books') return api;
      const upd = api.update.bind(api);
      api.update = (patch) => {
        if (first && 'difficulty' in patch) { first = false; return { eq: async () => ({ error: { code: '42703', message: 'column "difficulty" does not exist' } }) }; }
        return upd(patch);
      };
      return api;
    };
    const ai = async () => ({ parsed: { summary: 's', points: ['p'], for_whom: ['f'], reason: 'r', keywords: ['k1', 'k2', 'k3'], fields: [], level: '', difficulty: 2, prereq: '' }, model: 'm', mjpy: 1 });
    await summarizeStep({ db, env, now: () => 0, deadline: 1e9, aiImpl: ai });
    const row = db.t.advisor_books.get('9784000000021');
    expect(row.status).toBe('ready');
    expect(row).not.toHaveProperty('difficulty');
    expect(row.prompt_version).toBe(PV - 1); // SQL のあとで書き直される
  });
});


describe('売上順の記録（advisor_book_ranks・2026-11-18）', () => {
  const clock = () => { let t = Date.parse('2026-11-17T18:00:00Z'); return () => { t += 10; return t; }; };
  it('日本時間の日付', () => {
    expect(jstDay(Date.parse('2026-11-17T15:30:00Z'))).toBe('2026-11-18');
    expect(jstDay(Date.parse('2026-11-17T14:59:00Z'))).toBe('2026-11-17');
  });
  it('集めた本の、その一覧での順位を日付つきで残す', async () => {
    const db = fakeDb();
    const now = clock();
    const get = async () => page([item(1), item(2)]);
    const r = await collectStep({ db, env, now, deadline: now() + 3000 + 200, rakutenGetImpl: get, pause: 0 });
    const ranks = db.t.other.advisor_book_ranks || [];
    expect(r.ranked).toBe(ranks.length);
    expect(ranks[0]).toEqual({ isbn: '9784000000001', list: expandPlan()[0].source, observed_on: '2026-11-18', rank: 1 });
    expect(ranks[1]).toMatchObject({ isbn: '9784000000002', rank: 2 });
  });
  it('記録の表が無くても本は集める（記録しないだけ）', async () => {
    const db = fakeDb({ noRanks: true });
    const now = clock();
    const r = await collectStep({ db, env, now, deadline: now() + 3000 + 200, rakutenGetImpl: async () => page([item(3)]), pause: 0 });
    expect(r.ranked).toBe(0);
    expect(db.t.advisor_books.has('9784000000003')).toBe(true);
  });
  it('売れ方と印の紐づけは、関数が無い・失敗しても止めない', async () => {
    expect(await refreshSignals({ rpc: async (fn) => ({ data: fn === 'link_advisor_book_marks' ? 2 : 5, error: null }) })).toEqual({ linked: 2, trends: 5 });
    expect(await refreshSignals({ rpc: async () => ({ data: null, error: { code: '42883' } }) })).toEqual({ linked: null, trends: null });
    expect(await refreshSignals({})).toEqual({ linked: null, trends: null });
  });
});

describe('賞・年間ベストの印（ops_books の mark・2026-11-18）', () => {
  it('ISBN か書名と著者・出典と年が要る・待ち行列と同じ整え方', () => {
    const { marks, queue, invalid } = parseMarkList([
      { title: '『億までの人 億からの人』', author: '田中 渓', source: '読者が選ぶビジネス書グランプリ', year: 2026, label: '総合グランプリ', url: 'https://example.com/a' },
      { title: '億までの人 億からの人', author: '田中 渓', source: '読者が選ぶビジネス書グランプリ', year: 2026, label: '経済・マネー部門' },
      { isbn: '978-4-00-000000-2', source: 'TOPPOINT 大賞', year: '2026', label: '上半期 大賞', kind: 'selection', url: 'http://not-https' },
      { title: '年が無い', source: 'どこか' },
      { source: '本が無い', year: 2026 },
      'ただの文字',
    ]);
    expect(invalid).toBe(3);
    expect(marks).toHaveLength(3);
    expect(marks[0]).toMatchObject({ given_isbn: null, isbn: null, title: '億までの人 億からの人', author: '田中 渓', kind: 'award', year: 2026, label: '総合グランプリ', url: 'https://example.com/a' });
    expect(marks[2]).toMatchObject({ given_isbn: '9784000000002', isbn: '9784000000002', kind: 'selection', url: '' });
    // 同じ本の待ち行列は 1 つ・書名と著者は parseAddList と同じ形（印の book_key と待ち行列の dedupe_key がそろう）
    expect(queue).toHaveLength(2);
    const added = parseAddList([{ title: '億までの人 億からの人', author: '田中 渓' }]).rows[0];
    expect({ isbn: queue[0].isbn, title: queue[0].title, author: queue[0].author }).toEqual({ isbn: added.isbn, title: added.title, author: added.author });
    expect(queue[0].note).toBe('mark:読者が選ぶビジネス書グランプリ');
  });
  it('同じ印は 1 つ・上限の件数まで', () => {
    const one = { isbn: '9784000000003', source: '賞', year: 2025, label: '大賞' };
    expect(parseMarkList([one, one]).marks).toHaveLength(1);
    const many = Array.from({ length: MARK_ADD_MAX + 5 }, (_, i) => ({ isbn: `97840000${String(i).padStart(5, '0')}`, source: '賞', year: 2025 }));
    expect(parseMarkList(many).marks.length).toBeLessThanOrEqual(MARK_ADD_MAX);
  });
});
