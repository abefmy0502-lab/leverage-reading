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
