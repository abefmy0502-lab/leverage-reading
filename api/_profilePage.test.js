import { describe, it, expect } from 'vitest';
import { handleProfileRequest, renderProfile, isShowable, esc } from './_profilePage.js';

function fakeRes() {
  const r = { headers: {}, statusCode: 0, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
const row = { public_id: 'abcde12345', nickname: 'ふみ', fav_title: '確率思考の戦略論', fav_author: '森岡毅', fav_cover: 'https://thumbnail.image.rakuten.co.jp/x.jpg', fav_line: '売上は確率で決まる', is_public: true, hidden: false };
function fakeDb(data, inserts = []) {
  return () => ({ from: (t) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error: null }) }) }),
    insert: async (v) => { inserts.push([t, v]); return { error: null }; },
  }) });
}
let ip = 0;
const req = (q, extra = {}) => ({ method: 'GET', query: q, headers: { 'x-forwarded-for': `10.0.0.${++ip}` }, socket: {}, ...extra });

describe('プロフィールの公開のページ', () => {
  it('公開・隠していない・中身がある行だけ見せる', () => {
    expect(isShowable(row)).toBe(true);
    expect(isShowable({ ...row, is_public: false })).toBe(false);
    expect(isShowable({ ...row, hidden: true })).toBe(false);
    expect(isShowable({ ...row, nickname: '', fav_title: '' })).toBe(false);
  });
  it('ページにニックネーム・好きな本・1 行・通報のフォーム・SNS の絵と文', () => {
    const { html, status } = renderProfile(row, { publicId: 'abcde12345' });
    expect(status).toBe(200);
    expect(html).toContain('ふみさん');
    expect(html).toContain('『確率思考の戦略論』');
    expect(html).toContain('「売上は確率で決まる」');
    expect(html).toContain('og:image" content="https://thumbnail.image.rakuten.co.jp/x.jpg');
    expect(html).toContain('action="/api/profile-report"');
    expect(html).not.toContain('<script');
  });
  it('文字は逃がす・許可していない画像は使わない', () => {
    const { html } = renderProfile({ ...row, nickname: '<b>x</b>', fav_cover: 'https://evil.example/x.jpg' }, { publicId: 'abcde12345' });
    expect(html).toContain(esc('<b>x</b>'));
    expect(html).not.toContain('evil.example');
  });
  it('GET: 見せられる行は 200・公開していない・形の違う id は 404', async () => {
    let res = fakeRes();
    expect(await handleProfileRequest(req({ profile: 'abcde12345' }), res, { dbImpl: fakeDb(row) })).toBe(true);
    expect(res.statusCode).toBe(200);
    res = fakeRes();
    await handleProfileRequest(req({ profile: 'abcde12345' }), res, { dbImpl: fakeDb({ ...row, is_public: false }) });
    expect(res.statusCode).toBe(404);
    res = fakeRes();
    await handleProfileRequest(req({ profile: '../etc' }), res, { dbImpl: fakeDb(row) });
    expect(res.statusCode).toBe(404);
  });
  it('通報: 理由の文だけ残す（500 字まで）', async () => {
    const inserts = [];
    const res = fakeRes();
    await handleProfileRequest(req({ op: 'profile_report' }, { method: 'POST', body: { id: 'abcde12345', reason: 'x'.repeat(600) } }), res, { dbImpl: fakeDb(null, inserts) });
    expect(res.statusCode).toBe(200);
    expect(inserts[0][0]).toBe('profile_reports');
    expect(inserts[0][1]).toEqual({ public_id: 'abcde12345', reason: 'x'.repeat(500) });
  });
  it('ほかの用途の呼び出しは扱わない', async () => {
    expect(await handleProfileRequest(req({ search: 'x' }), fakeRes())).toBe(false);
  });
});

describe('公開の本棚（2026-11-21）', async () => {
  const { buildShelf, renderProfile } = await import('./_profilePage.js');
  const books = [
    { id: '00000000-0000-4000-8000-000000000001', title: '考え方', author: '稲盛和夫', cover: 'https://thumbnail.image.rakuten.co.jp/a.jpg', status: 'done', rating: 4, fields: ['経営・組織', 'メモのタグではない'] },
    { id: '00000000-0000-4000-8000-000000000002', title: '隠した本', status: 'done', fields: [] },
    { id: '00000000-0000-4000-8000-000000000003', title: 'イシューからはじめよ', status: 'reading', cover: 'https://evil.example/x.jpg', fields: ['思考法・問題解決'] },
    { id: '00000000-0000-4000-8000-000000000004', title: '<script>', status: 'want', fields: [] },
  ];
  it('外した本を除き、状態の順に並べる（分野のまとまりは出さない）', () => {
    const s = buildShelf(books, ['00000000-0000-4000-8000-000000000002']);
    expect(s.total).toBe(3);
    expect(s.byStatus.map((g) => g.id)).toEqual(['reading', 'done', 'want']);
    expect(s.byStatus[1].books[0].rating).toBe(4);
    expect(s.byStatus[0].books[0].cover).toBe(''); // 許可していない表紙は出さない
    expect(s.fields).toBeUndefined();
    expect(s.byStatus[1].books[0].id).toBe('00000000-0000-4000-8000-000000000001');
  });
  it('本棚・自己紹介を描き、メモは描かない・文字はエスケープする', () => {
    const shelf = buildShelf(books, []);
    const { html } = renderProfile({ nickname: 'ふみ', bio: '企画の仕事\n2 行目', shelf_public: true }, { publicId: 'abcdefgh23', shelf });
    expect(html).toContain('<h2>本棚</h2>');
    // 状態ごとの棚（読書中 → 読了 → 読みたい）と、絞り込みのチップ
    expect(html.indexOf('<h3>読書中')).toBeLessThan(html.indexOf('<h3>読了'));
    expect(html).toContain('<h3>読了<span class="n">2 冊</span></h3>');
    expect(html).toContain('aria-label="本棚を絞る"');
    expect(html).toMatch(/href="\/u\/abcdefgh23#shelf" aria-current="page">すべて<span class="n">4<\/span>/);
    expect(html).toContain('考え方・稲盛和夫・読了・評価 4');
    expect(html).toContain('企画の仕事');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('分野の名前は出さない・VITE_SOCIAL が無ければ本へのリンクもフォローも無い', () => {
    const shelf = buildShelf(books, []);
    const { html } = renderProfile({ nickname: 'ふみ', shelf_public: true }, { publicId: 'abcdefgh23', shelf, social: false });
    expect(html).not.toContain('経営・組織');
    expect(html).not.toContain('/b/');
    expect(html).not.toContain('follow=');
  });
  it('VITE_SOCIAL のときは本を押すと本のページ・フォローを申し込む', () => {
    const shelf = buildShelf(books, []);
    const { html } = renderProfile({ nickname: 'ふみ', shelf_public: true }, { publicId: 'abcdefgh23', shelf, social: true });
    expect(html).toContain('href="/u/abcdefgh23/b/00000000-0000-4000-8000-000000000001"');
    expect(html).toContain('/?follow=abcdefgh23');
    // フォローを決めるのはこのページ: 名前のすぐ下（本棚より前）と、本棚のあとにもう一度
    expect(html.indexOf('/?follow=abcdefgh23')).toBeLessThan(html.indexOf('<h2>本棚</h2>'));
    expect(html.lastIndexOf('/?follow=abcdefgh23')).toBeGreaterThan(html.indexOf('<h2>本棚</h2>'));
  });
  it('まとめも公開していれば「〈名前〉さんのまとめ」に出だしを並べる（公開に向かない言葉は出さない）', () => {
    const withMemo = [
      { id: '00000000-0000-4000-8000-0000000000a1', title: '考え方', author: '稲盛和夫', status: 'done', leverage_memo: '心を高める。\n熱意が大事。' },
      { id: '00000000-0000-4000-8000-0000000000a2', title: '別の本', author: '', status: 'done', leverage_memo: '連絡は test@example.com' },
    ];
    const shelf = buildShelf(withMemo, [], { summaries: true });
    expect(shelf.withSummary.map((b) => b.excerpt)).toEqual(['心を高める。熱意が大事。']);
    const { html } = renderProfile({ nickname: 'ふみ', shelf_public: true }, { publicId: 'abcdefgh23', shelf, social: true });
    expect(html).toContain('ふみさんのまとめ');
    expect(html).not.toContain('test@example.com');
    const off = buildShelf(withMemo, []);
    expect(off.withSummary).toEqual([]);
  });
  it('絞り込み: 状態だけ・まとめありだけ・知らない値は「すべて」', () => {
    const withMemo = [
      ...books,
      { id: '00000000-0000-4000-8000-0000000000a1', title: 'まとめの本', status: 'done', leverage_memo: '心を高める。' },
    ];
    const shelf = buildShelf(withMemo, ['00000000-0000-4000-8000-000000000002'], { summaries: true });
    let { html } = renderProfile({ nickname: 'ふみ', shelf_public: true }, { publicId: 'abcdefgh23', shelf, social: true, filter: 'reading' });
    expect(html).toContain('aria-current="page">読書中');
    expect(html).toContain('イシューからはじめよ');
    expect(html).not.toContain('aria-label="考え方');
    ({ html } = renderProfile({ nickname: 'ふみ', shelf_public: true }, { publicId: 'abcdefgh23', shelf, social: true, filter: 'summary' }));
    expect(html).toContain('aria-current="page">まとめあり<span class="n">1</span>');
    expect(html).toContain('まとめの本・読了・まとめあり');
    expect(html).toContain('class="rib"');
    expect(html).not.toContain('aria-label="考え方');
    ({ html } = renderProfile({ nickname: 'ふみ', shelf_public: true }, { publicId: 'abcdefgh23', shelf, social: true, filter: 'zzz' }));
    expect(html).toContain('aria-current="page">すべて');
  });
  it('GET の ?shelf= は決まった値だけ', async () => {
    const { SHELF_FILTERS } = await import('./_profilePage.js');
    expect(SHELF_FILTERS).toEqual(['reading', 'done', 'before', 'want', 'summary']);
  });
  it('本棚を出さないときは本棚の節が無い', () => {
    const { html } = renderProfile({ nickname: 'ふみ' }, { publicId: 'abcdefgh23', shelf: null });
    expect(html).not.toContain('<h2>本棚</h2>');
  });
});

describe('公開のページの安全（App 審査 1.2・2026-11-21）', async () => {
  const { cleanPublicRow, AUTO_HIDE_REPORTS } = await import('./_profilePage.js');
  it('公開に向かない言葉・連絡先の欄は空にする', () => {
    const r = cleanPublicRow({ ...row, nickname: 'ふみ', bio: 'LINE ID: fumi_123 で連絡ください', fav_line: '死ねと思った' });
    expect(r.nickname).toBe('ふみ');
    expect(r.bio).toBe('');
    expect(r.fav_line).toBe('');
  });
  it('通報がたまったら隠す・保存できなければ 503', async () => {
    const updates = [];
    const db = () => ({ from: (t) => ({
      insert: async () => ({ error: null }),
      // 数えるのはアプリから登録した人が送った通報だけ（.eq('counted', true)）
      select: () => ({ eq: () => ({ eq: () => ({ eq: async (col, v) => ({ count: col === 'counted' && v === true ? AUTO_HIDE_REPORTS : 99 }) }) }) }),
      update: (v) => ({ eq: async () => { updates.push([t, v]); return { error: null }; } }),
    }) });
    const res = fakeRes();
    await handleProfileRequest(req({ op: 'profile_report' }, { method: 'POST', body: { id: 'abcde12345', reason: '' } }), res, { dbImpl: db });
    expect(res.statusCode).toBe(200);
    expect(updates).toEqual([['profiles', { hidden: true }]]);
    const bad = () => ({ from: () => ({ insert: async () => ({ error: { code: '42P01' } }) }) });
    const res2 = fakeRes();
    await handleProfileRequest(req({ op: 'profile_report' }, { method: 'POST', body: { id: 'abcde12345' } }), res2, { dbImpl: bad });
    expect(res2.statusCode).toBe(503);
  });
  it('ページに利用規約と連絡先', () => {
    const { html } = renderProfile(row, { publicId: 'abcde12345' });
    expect(html).toContain('/legal/terms');
    expect(html).toContain('mailto:');
  });
});

describe('自分のアイコン（公開のページ）', async () => {
  const { renderAvatar, renderProfile: rp } = await import('./_profilePage.js');
  it('選んだアイコンは色の丸に白い線の絵', () => {
    const h = renderAvatar('book', 'テスト');
    expect(h).toContain('class="av"');
    expect(h).toContain('<svg');
    expect(h).toContain('#4a6e8a');
  });
  it('選んでいなければニックネームの 1 字・決まっていない id は使わない', () => {
    expect(renderAvatar('', 'あべ')).toContain('>あ<');
    expect(renderAvatar('<script>', 'あべ')).not.toContain('script');
    expect(renderAvatar('', '')).toBe('');
  });
  it('プロフィールのページの名前の上に出る', () => {
    const r = rp({ nickname: 'テスト', avatar: 'cat', is_public: true }, { publicId: 'abcdefghij' });
    const html = r.html;
    expect(html.indexOf('class="av"')).toBeGreaterThan(-1);
    expect(html.indexOf('class="av"')).toBeLessThan(html.indexOf('class="name"'));
  });
});

describe('本のページ（まとめ・読みたいに追加・2026-11-21）', async () => {
  const { renderBook, publicSummary, wantUrl, socialOn } = await import('./_profilePage.js');
  const book = { id: '00000000-0000-4000-8000-000000000001', title: '考え方', author: '稲盛和夫', status: 'done', rating: 5, isbn: '978-4-12', summary: '心を高める\n2 行目' };
  it('まとめは本人が公開しているときだけ・エスケープする', () => {
    const on = renderBook({ nickname: 'ふみ' }, book, { publicId: 'abcdefgh23', showSummary: true }).html;
    expect(on).toContain('ふみさんの、この本のまとめ');
    expect(on).toContain('心を高める');
    const off = renderBook({ nickname: 'ふみ' }, book, { publicId: 'abcdefgh23', showSummary: false }).html;
    expect(off).not.toContain('心を高める');
    expect(off).toContain('読みたいに追加');
  });
  it('Amazon と楽天のリンク（アソシエイトの印と開示の文）', () => {
    const html = renderBook({ nickname: 'ふみ' }, { ...book, isbn: '9784837926163' }, { publicId: 'abcdefgh23', showSummary: true }).html;
    expect(html).toMatch(/href="https:\/\/www\.amazon\.co\.jp\/dp\/4837926169\?tag=[^"]+"/);
    expect(html).toContain('rel="noopener noreferrer sponsored"');
    expect(html).toContain('books.rakuten.co.jp');
    expect(html).toContain('Amazon アソシエイト');
  });
  it('公開に向かない言葉・連絡先のあるまとめは出さない', () => {
    expect(publicSummary('連絡は test@example.com')).toBe('');
    expect(publicSummary('ふつうのまとめ')).toBe('ふつうのまとめ');
  });
  it('読みたいに追加の行き先に書名・著者・ISBN の数字だけ', () => {
    const u = new URL(wantUrl(book, 'https://orime.vercel.app'));
    expect(u.searchParams.get('want')).toBe('1');
    expect(u.searchParams.get('title')).toBe('考え方');
    expect(u.searchParams.get('isbn')).toBe('978412');
  });
  it('VITE_SOCIAL は on のときだけ', () => {
    expect(socialOn({ VITE_SOCIAL: 'on' })).toBe(true);
    expect(socialOn({})).toBe(true);
    expect(socialOn({ VITE_SOCIAL: 'off' })).toBe(false);
  });
});
