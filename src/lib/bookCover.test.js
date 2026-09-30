// 📕 端末の表紙の確かめ方のテスト（外部には出ない・Image と fetch を差し替え）。

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  coverMinRatio,
  firstLoadableImage,
  getCoverCandidates,
  isCoverLikeSize,
  isbn10to13,
  resolveCoverViaServer,
  resolveCoverViaServerDetailed,
} from './bookCover';
import { coverCandidatesFor, coverMinRatio as serverMinRatio } from '../../api/_coverSources.js';

const RAKUTEN = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/2923/9784478102923.jpg?_ex=420x420';

// URL ごとの縦横（無い URL は読み込み失敗）で <img> を真似る。
function stubImages(sizes) {
  class FakeImage {
    set src(u) {
      this._src = u;
      setTimeout(() => {
        const s = sizes[u];
        if (!s) { this.onerror?.(); return; }
        this.naturalWidth = s[0];
        this.naturalHeight = s[1];
        this.onload?.();
      }, 0);
    }
    get src() { return this._src; }
  }
  vi.stubGlobal('Image', FakeImage);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('isCoverLikeSize（確認と本棚の表示で同じ基準）', () => {
  it('楽天の _ex=420x420（正方形）・自分で撮った横長の写真も通す', () => {
    expect(isCoverLikeSize(RAKUTEN, 420, 420)).toBe(true);
    expect(isCoverLikeSize(RAKUTEN, 296, 420)).toBe(true);
    expect(isCoverLikeSize('https://abcd.supabase.co/storage/v1/object/public/book-covers/u/x.jpg', 800, 600)).toBe(true);
    expect(isCoverLikeSize('https://cover.openbd.jp/9784862760852.jpg', 300, 300)).toBe(true);
  });
  it('1×1・小さすぎる画像は弾く（Amazon の「無い」）', () => {
    expect(isCoverLikeSize('https://images-na.ssl-images-amazon.com/images/P/4862760856.09.LZZZZZZZ.jpg', 1, 1)).toBe(false);
    expect(isCoverLikeSize(RAKUTEN, 40, 60)).toBe(false);
  });
  it('Google の ISBN 直リンクの「No cover」(128×170) は弾く・本物の縦長は通す', () => {
    const gb = 'https://books.google.com/books/content?vid=ISBN9784862760852&printsec=frontcover&img=1&zoom=1';
    expect(isCoverLikeSize(gb, 128, 170)).toBe(false);
    expect(isCoverLikeSize(gb, 128, 190)).toBe(true);
  });
  it('NDL など: 横長のロゴは弾き、ふつうの表紙は通す', () => {
    expect(isCoverLikeSize('https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg', 300, 100)).toBe(false);
    expect(isCoverLikeSize('https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg', 200, 290)).toBe(true);
  });
  it('サーバー（api/_coverSources.js）と同じ基準', () => {
    for (const u of [
      RAKUTEN,
      'https://books.google.com/books/content?id=abc&printsec=frontcover&img=1',
      'https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg',
      'https://cover.openbd.jp/9784862760852.jpg',
      'https://images-na.ssl-images-amazon.com/images/P/4862760856.09.LZZZZZZZ.jpg',
      'https://m.media-amazon.com/images/P/4862760856.09._SCLZZZZZZZ_.jpg',
      'https://covers.openlibrary.org/b/isbn/9784862760852-L.jpg?default=false',
      'https://ia800100.us.archive.org/view/x.jpg',
      'https://abcd.supabase.co/storage/v1/object/public/book-covers/u/x.jpg',
      'https://lh3.googleusercontent.com/abc',
      'not a url',
    ]) {
      expect(coverMinRatio(u)).toBe(serverMinRatio(u));
    }
  });
});

describe('getCoverCandidates', () => {
  it('サーバーの coverCandidatesFor と同じ並び・ISBN-10 も 13 桁に', () => {
    expect(getCoverCandidates('9784862760852')).toEqual(coverCandidatesFor('9784862760852'));
    expect(getCoverCandidates('4862760856')).toEqual(coverCandidatesFor('9784862760852'));
    expect(getCoverCandidates('')).toEqual([]);
    expect(isbn10to13('4-492-04269-5')).toBe('9784492042694');
  });
});

describe('firstLoadableImage', () => {
  it('同時に読み、並び順でいちばん前の本物を返す', async () => {
    const started = [];
    const check = async (u) => { started.push(u); await new Promise((r) => setTimeout(r, u === 'a' ? 20 : 0)); return u !== 'a'; };
    expect(await firstLoadableImage(['a', 'b', 'c'], { check })).toBe('b');
    expect(started).toEqual(['a', 'b', 'c']);
    expect(await firstLoadableImage(['a'], { check })).toBe('');
  });
});

describe('resolveCoverViaServerDetailed', () => {
  function stubFetch(body, status = 200) {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      if (body instanceof Error) throw body;
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    }));
    return calls;
  }

  it('サーバーの楽天の表紙（正方形 420×420）を採る', async () => {
    const calls = stubFetch({ cover: RAKUTEN, isbn: '9784478102923', candidates: getCoverCandidates('9784478102923') });
    stubImages({ [RAKUTEN]: [420, 420] });
    const r = await resolveCoverViaServerDetailed({ title: 'プレイングマネジャー 「残業ゼロ」の仕事術', author: '小室淑恵' });
    expect(r).toEqual({ status: 'found', url: RAKUTEN, isbn: '9784478102923' });
    expect(calls[0]).toContain('/api/cover?');
    expect(calls[0]).toContain('cv=7');
    expect(await resolveCoverViaServer({ title: 'x' })).toEqual({ url: RAKUTEN, isbn: '9784478102923' });
  });

  it('サーバーの cover が読めなければ候補から（壊れた URL は飛ばす）', async () => {
    const cands = getCoverCandidates('9784478102923');
    stubFetch({ cover: RAKUTEN, isbn: '9784478102923', candidates: cands });
    stubImages({ [RAKUTEN]: [420, 420], [cands[1]]: [300, 430] });
    const r = await resolveCoverViaServerDetailed({ title: 't' }, { skipUrl: RAKUTEN });
    expect(r.url).toBe(cands[1]);
  });

  it('本は分かったが読める表紙が無い → isbn_only / 何も無い → not_found / 通信の失敗 → error', async () => {
    stubImages({});
    stubFetch({ cover: '', isbn: '9784478102923', candidates: getCoverCandidates('9784478102923') });
    expect(await resolveCoverViaServerDetailed({ title: 't' })).toEqual({ status: 'isbn_only', url: '', isbn: '9784478102923' });
    stubFetch({ cover: '', isbn: '', candidates: [] });
    expect((await resolveCoverViaServerDetailed({ title: 't' })).status).toBe('not_found');
    stubFetch({}, 504);
    expect((await resolveCoverViaServerDetailed({ title: 't' })).status).toBe('error');
    stubFetch(new Error('offline'));
    expect((await resolveCoverViaServerDetailed({ title: 't' })).status).toBe('error');
    expect(await resolveCoverViaServer({ title: 't' })).toBeNull();
  });
});
