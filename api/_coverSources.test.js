// 📕 表紙の取得元（鍵なし）と画像の確かめ方のテスト。外部には出ない（fetch は差し替え）。

import { describe, it, expect } from 'vitest';
import {
  cleanIsbn,
  coverCandidatesFor,
  createCooldown,
  extractIsbnsFromXml,
  firstRealImage,
  imageDimensions,
  isbn10to13,
  isbn13to10,
  looksLikeCover,
  openbdCover,
  probeImage,
  toIsbn13,
} from './_coverSources.js';

// ─── 画像のバイト列を作る ─────────────────────────────────────────
function png(w, h, pad = 0) {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  b[16] = (w >>> 24) & 255; b[17] = (w >>> 16) & 255; b[18] = (w >>> 8) & 255; b[19] = w & 255;
  b[20] = (h >>> 24) & 255; b[21] = (h >>> 16) & 255; b[22] = (h >>> 8) & 255; b[23] = h & 255;
  return b;
}
function jpeg(w, h, pad = 0) {
  // SOI, APP0(長さ 16), SOF0
  const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x03];
  const b = new Uint8Array(head.length + pad);
  b.set(head);
  return b;
}
// Amazon の「無い」: 1×1 の GIF（43 バイト）
function gif1x1() {
  const b = new Uint8Array(43);
  b.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);
  return b;
}

function imgResponse(bytes, { status = 200, type = 'image/jpeg' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    json: async () => JSON.parse(new TextDecoder().decode(bytes)),
  };
}
function jsonResponse(obj, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => obj,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe('ISBN', () => {
  it('10 桁と 13 桁を行き来できる（X も）', () => {
    expect(isbn13to10('9784862760852')).toBe('4862760856');
    expect(isbn10to13('4862760856')).toBe('9784862760852');
    expect(isbn10to13('4-492-04269-5')).toBe('9784492042694');
    expect(toIsbn13('4-7741-4223-X')).toBe(isbn10to13('477414223X'));
    expect(toIsbn13('978-4-86276-085-2')).toBe('9784862760852');
    expect(toIsbn13('abc')).toBe('');
    expect(cleanIsbn('12345')).toBe('');
  });
});

describe('extractIsbnsFromXml（NDL の書名 → ISBN）', () => {
  it('ISBN-10 だけの古い本も 13 桁にして拾う・SetISBN は拾わない', () => {
    const xml = `<rss><channel><item><title>レバレッジ・リーディング</title>
      <dc:identifier xsi:type="dcndl:ISBN">4-492-04269-5</dc:identifier>
      <dc:identifier xsi:type="dcndl:JPNO">21134567</dc:identifier>
      </item><item><title>別の本</title>
      <dc:identifier xsi:type="dcndl:SetISBN">978-4-00-000000-2</dc:identifier>
      <dc:identifier xsi:type="dcndl:ISBN">978-4-86276-085-2</dc:identifier></item></channel></rss>`;
    expect(extractIsbnsFromXml(xml)).toEqual(['9784492042694', '9784862760852']);
  });
  it('identifier の外にある 978 の番号も拾う（重複しない）', () => {
    const xml = '<item><link>x</link><description>ISBN 978-4-86276-085-2</description><dc:identifier xsi:type="dcndl:ISBN">9784862760852</dc:identifier></item>';
    expect(extractIsbnsFromXml(xml)).toEqual(['9784862760852']);
  });
});

describe('imageDimensions / looksLikeCover', () => {
  it('JPEG・PNG・GIF の縦横を読む', () => {
    expect(imageDimensions(jpeg(300, 450))).toEqual({ type: 'jpeg', w: 300, h: 450 });
    expect(imageDimensions(png(128, 170))).toEqual({ type: 'png', w: 128, h: 170 });
    expect(imageDimensions(gif1x1())).toEqual({ type: 'gif', w: 1, h: 1 });
    expect(imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('1×1・43 バイトの GIF（Amazon の「無い」）は弾く', () => {
    expect(looksLikeCover({ url: 'https://images-na.ssl-images-amazon.com/images/P/x.jpg', bytes: 43, w: 1, h: 1 })).toBe(false);
  });
  it('Google の ISBN 直リンクの「No cover」(128×170) は弾き、ほかの配信元の同じ比率は通す', () => {
    const gb = 'https://books.google.com/books/content?vid=ISBN9784862760852&printsec=frontcover&img=1&zoom=1';
    expect(looksLikeCover({ url: gb, bytes: 9000, w: 128, h: 170 })).toBe(false);
    expect(looksLikeCover({ url: gb, bytes: 9000, w: 128, h: 196 })).toBe(true);
    expect(looksLikeCover({ url: 'https://ndlsearch.ndl.go.jp/thumbnail/x.jpg', bytes: 3000, w: 128, h: 170 })).toBe(true);
  });
  it('小さくても縦横が本らしければ通す（以前の「4KB 未満は偽物」で弾いていた）', () => {
    expect(looksLikeCover({ url: 'https://ndlsearch.ndl.go.jp/thumbnail/x.jpg', bytes: 2500, w: 90, h: 128 })).toBe(true);
  });
  it('横長のロゴは弾く', () => {
    expect(looksLikeCover({ url: 'https://ndlsearch.ndl.go.jp/thumbnail/x.jpg', bytes: 5000, w: 300, h: 100 })).toBe(false);
  });
  it('楽天・openBD・自分でアップロードした表紙は正方形でも通す（無い本は 404・noimage で返すため）', () => {
    expect(looksLikeCover({ url: 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/x.jpg?_ex=420x420', bytes: 20000, w: 420, h: 420 })).toBe(true);
    expect(looksLikeCover({ url: 'https://abcd.supabase.co/storage/v1/object/public/book-covers/u/x.jpg', bytes: 20000, w: 800, h: 600 })).toBe(true);
    expect(looksLikeCover({ url: 'https://cover.openbd.jp/x.jpg', bytes: 8000, w: 300, h: 300 })).toBe(true);
  });
});

describe('probeImage', () => {
  it('本物の表紙は ok（HEAD ではなく GET・縦横を見る）', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => { calls.push(init.method); return imgResponse(jpeg(200, 300, 3000)); };
    const r = await probeImage('https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg', { fetchImpl });
    expect(r).toMatchObject({ ok: true, status: 200, w: 200, h: 300 });
    expect(calls).toEqual(['GET']);
  });
  it('Amazon の 1×1 GIF・404・画像でない応答は ok にしない', async () => {
    const amazon = 'https://images-na.ssl-images-amazon.com/images/P/4862760856.09.LZZZZZZZ.jpg';
    expect((await probeImage(amazon, { fetchImpl: async () => imgResponse(gif1x1(), { type: 'image/gif' }) })).ok).toBe(false);
    expect((await probeImage(amazon, { fetchImpl: async () => imgResponse(jpeg(10, 10), { status: 404 }) })).status).toBe(404);
    const html = new TextEncoder().encode('<html>no</html>'.padEnd(3000, ' '));
    expect((await probeImage(amazon, { fetchImpl: async () => imgResponse(html, { type: 'text/html' }) })).ok).toBe(false);
  });
  it('content-type が無くても先頭のバイトが画像なら確かめる', async () => {
    const r = await probeImage('https://cover.openbd.jp/x.jpg', { fetchImpl: async () => imgResponse(jpeg(200, 290, 3000), { type: '' }) });
    expect(r.ok).toBe(true);
  });
  it('通信の失敗・時間切れは status 0', async () => {
    const r = await probeImage('https://cover.openbd.jp/x.jpg', { fetchImpl: async () => { throw new Error('timeout'); } });
    expect(r).toMatchObject({ ok: false, status: 0 });
  });
});

describe('firstRealImage', () => {
  it('同時に確かめ、並び順でいちばん前の本物を返す', async () => {
    const started = [];
    const probe = async (u) => {
      started.push(u);
      if (u === 'a') { await new Promise((r) => setTimeout(r, 30)); return { ok: false, status: 404 }; }
      return { ok: u !== 'd', status: 200 };
    };
    const r = await firstRealImage(['a', 'b', 'c', 'd'], { probe });
    expect(r.url).toBe('b');
    expect(started).toEqual(['a', 'b', 'c', 'd']); // 全部を先に始めている
  });
  it('どれも駄目なら空', async () => {
    const r = await firstRealImage(['a', 'b'], { probe: async () => ({ ok: false, status: 403 }) });
    expect(r.url).toBe('');
    expect(r.results.map((x) => x.status)).toEqual([403, 403]);
  });
});

describe('openbdCover', () => {
  it('summary.cover があれば https の URL を返す', async () => {
    const fetchImpl = async (url) => {
      expect(url).toBe('https://api.openbd.jp/v1/get?isbn=9784862760852');
      return jsonResponse([{ summary: { cover: 'http://cover.openbd.jp/9784862760852.jpg' } }]);
    };
    expect(await openbdCover('4862760856', { fetchImpl })).toEqual({ status: 200, found: true, cover: 'https://cover.openbd.jp/9784862760852.jpg' });
  });
  it('未収録（[null]）・表紙なし・エラー', async () => {
    expect(await openbdCover('9784862760852', { fetchImpl: async () => jsonResponse([null]) })).toEqual({ status: 200, found: false, cover: '' });
    expect(await openbdCover('9784862760852', { fetchImpl: async () => jsonResponse([{ summary: { cover: '' } }]) })).toEqual({ status: 200, found: true, cover: '' });
    expect(await openbdCover('9784862760852', { fetchImpl: async () => jsonResponse({}, 503) })).toMatchObject({ status: 503, cover: '' });
    expect(await openbdCover('9784862760852', { fetchImpl: async () => { throw new Error('x'); } })).toMatchObject({ status: 0, cover: '' });
  });
});

describe('coverCandidatesFor', () => {
  it('鍵の要らない URL を当たりやすい順に・書式どおり', () => {
    const c = coverCandidatesFor('9784862760852');
    expect(c).toEqual([
      'https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg',
      'https://cover.openbd.jp/9784862760852.jpg',
      'https://images-na.ssl-images-amazon.com/images/P/4862760856.09.LZZZZZZZ.jpg',
      'https://m.media-amazon.com/images/P/4862760856.09._SCLZZZZZZZ_.jpg',
      'https://books.google.com/books/content?vid=ISBN9784862760852&printsec=frontcover&img=1&zoom=1',
      'https://covers.openlibrary.org/b/isbn/9784862760852-L.jpg?default=false',
    ]);
  });
  it('ISBN-10 を渡しても 13 桁の URL になる・openBD の API の表紙を先頭に（重複なし）', () => {
    const c = coverCandidatesFor('4862760856', { openbd: 'https://cover.openbd.jp/9784862760852.jpg' });
    expect(c[0]).toBe('https://cover.openbd.jp/9784862760852.jpg');
    expect(c.filter((u) => u.includes('cover.openbd.jp'))).toHaveLength(1);
    expect(c[1]).toBe('https://ndlsearch.ndl.go.jp/thumbnail/9784862760852.jpg');
  });
  it('979 の ISBN は Amazon（ISBN-10）を作らない', () => {
    expect(coverCandidatesFor('9791234567896').some((u) => u.includes('amazon'))).toBe(false);
  });
});

describe('createCooldown（Google の休み）', () => {
  it('429/403 のあと鍵なしは 5 分・鍵ありは 1 分休む', () => {
    let t = 0;
    const c = createCooldown({ now: () => t });
    c.hit(200);
    expect(c.blocked()).toBe(false);
    c.hit(429);
    expect(c.blocked()).toBe(true);
    t = 299_000; expect(c.blocked()).toBe(true);
    t = 300_001; expect(c.blocked()).toBe(false);
    c.hit(403, { hasKey: true });
    t += 59_000; expect(c.blocked()).toBe(true);
    t += 2_000; expect(c.blocked()).toBe(false);
  });
});
