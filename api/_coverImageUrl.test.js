// 🖼 表紙画像の中継（api/cover-image.js）の許可リストのテスト。
// どこへでも取りに行ける中継（SSRF の踏み台）にならないことを確かめる。

import { describe, it, expect } from 'vitest';
import { checkCoverImageUrl, isAllowedImageType } from './_coverImageUrl.js';

const SUPA = 'https://abcd1234.supabase.co';

describe('checkCoverImageUrl', () => {
  it('表紙の配信元だけを通す（http は https に読み替える）', () => {
    for (const u of [
      'https://books.google.com/books/content?id=abc&printsec=frontcover&img=1',
      'https://books.googleusercontent.com/books/content?id=abc',
      'https://lh3.googleusercontent.com/abc',
      'https://cover.openbd.jp/9784862760852.jpg',
      'https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg',
      'https://m.media-amazon.com/images/P/4862760856.09.LZZZZZZZ.jpg',
      'https://images-na.ssl-images-amazon.com/images/P/4862760856.09.LZZZZZZZ.jpg',
      'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/0852/9784862760852.jpg',
      'https://covers.openlibrary.org/b/isbn/9784862760852-L.jpg',
    ]) {
      expect(checkCoverImageUrl(u).ok).toBe(true);
    }
    expect(checkCoverImageUrl('http://cover.openbd.jp/x.jpg')).toEqual({ ok: true, url: 'https://cover.openbd.jp/x.jpg' });
  });

  it('許可していないホスト・内部の宛先は通さない', () => {
    for (const u of [
      'https://example.com/a.jpg',
      'https://evil.com/?u=https://books.google.com',
      'https://books.google.com.evil.com/a.jpg',
      'https://googleusercontent.com.evil.com/a.jpg',
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:3000/a.png',
      'https://127.0.0.1/a.png',
      'https://ia800.us.archive.org/a.jpg', // 転送先としてだけ許可
    ]) {
      expect(checkCoverImageUrl(u).ok).toBe(false);
    }
  });

  it('ポート・ユーザー名・ほかの方式・長すぎる URL は通さない', () => {
    expect(checkCoverImageUrl('https://books.google.com:8443/a.jpg').reason).toBe('port');
    expect(checkCoverImageUrl('https://user:pw@books.google.com/a.jpg').reason).toBe('credentials');
    expect(checkCoverImageUrl('ftp://books.google.com/a.jpg').reason).toBe('protocol');
    expect(checkCoverImageUrl('file:///etc/passwd').reason).toBe('protocol');
    expect(checkCoverImageUrl(`https://books.google.com/${'a'.repeat(3000)}`).reason).toBe('too_long');
    expect(checkCoverImageUrl('').ok).toBe(false);
    expect(checkCoverImageUrl(undefined).ok).toBe(false);
    expect(checkCoverImageUrl('not a url').ok).toBe(false);
  });

  it('Supabase は自分のプロジェクトの book-covers の公開 URL だけ', () => {
    expect(checkCoverImageUrl(`${SUPA}/storage/v1/object/public/book-covers/u1/a.jpg`, { supabaseUrl: SUPA }).ok).toBe(true);
    // 非公開のメモの写真・ほかのバケット・ほかのプロジェクトは通さない
    expect(checkCoverImageUrl(`${SUPA}/storage/v1/object/sign/book-memo-photos/u1/a.jpg`, { supabaseUrl: SUPA }).ok).toBe(false);
    expect(checkCoverImageUrl(`${SUPA}/storage/v1/object/public/other/a.jpg`, { supabaseUrl: SUPA }).ok).toBe(false);
    expect(checkCoverImageUrl(`${SUPA}/rest/v1/books`, { supabaseUrl: SUPA }).ok).toBe(false);
    expect(checkCoverImageUrl('https://other.supabase.co/storage/v1/object/public/book-covers/a.jpg', { supabaseUrl: SUPA }).ok).toBe(false);
    expect(checkCoverImageUrl(`${SUPA}/storage/v1/object/public/book-covers/a.jpg`).ok).toBe(false); // 設定が無ければ通さない
    expect(checkCoverImageUrl(`${SUPA}/storage/v1/object/public/book-covers/%2e%2e/secret`, { supabaseUrl: SUPA }).ok).toBe(false);
  });

  it('転送先（リダイレクト）としてだけ archive.org を許す', () => {
    expect(checkCoverImageUrl('https://ia800.us.archive.org/a.jpg', { redirect: true }).ok).toBe(true);
    expect(checkCoverImageUrl('https://example.com/a.jpg', { redirect: true }).ok).toBe(false);
  });
});

describe('isAllowedImageType', () => {
  it('画像だけ（SVG・HTML は通さない）', () => {
    expect(isAllowedImageType('image/jpeg')).toBe('image/jpeg');
    expect(isAllowedImageType('image/png; charset=binary')).toBe('image/png');
    expect(isAllowedImageType('image/webp')).toBe('image/webp');
    expect(isAllowedImageType('image/svg+xml')).toBe('');
    expect(isAllowedImageType('text/html')).toBe('');
    expect(isAllowedImageType('')).toBe('');
  });
});
