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
  it('外した本を除き、状態の順に並べ、分野は決まった名前だけ数える', () => {
    const s = buildShelf(books, ['00000000-0000-4000-8000-000000000002']);
    expect(s.total).toBe(3);
    expect(s.byStatus.map((g) => g.id)).toEqual(['reading', 'done', 'want']);
    expect(s.byStatus[1].books[0].rating).toBe(4);
    expect(s.byStatus[0].books[0].cover).toBe(''); // 許可していない表紙は出さない
    expect(s.fields.flatMap((g) => g.items.map((i) => i.name))).toEqual(['経営・組織', '思考法・問題解決']);
  });
  it('本棚・自己紹介を描き、メモは描かない・文字はエスケープする', () => {
    const shelf = buildShelf(books, []);
    const { html } = renderProfile({ nickname: 'ふみ', bio: '企画の仕事\n2 行目', shelf_public: true }, { publicId: 'abcdefgh23', shelf });
    expect(html).toContain('<h2>本棚</h2>');
    expect(html).toContain('読書中 1 冊・読了 2 冊・読みたい 1 冊');
    expect(html).toContain('aria-label="評価 4"');
    expect(html).toContain('企画の仕事');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
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
      select: () => ({ eq: () => ({ eq: async () => ({ count: AUTO_HIDE_REPORTS }) }) }),
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
