// 🔄 表紙の自動の再取得のテスト（負のキャッシュ・壊れた URL の差し替え・ISBN の保存）。

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  NEGATIVE_TTL_MS,
  canReplaceCover,
  createNegativeCache,
  resolveCoverForBook,
} from './coverAutoRetry';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
}

const BOOK = { id: 'b1', title: 'プレイングマネジャー 「残業ゼロ」の仕事術', author: '小室淑恵', isbn: '', cover: '' };
const RAKUTEN = 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/2923/9784478102923.jpg?_ex=420x420';

// 端末だけの経路は、テストでは何も見つけない（呼ばれたかだけ数える）
function deps(server, extra = {}) {
  const calls = { google: 0, isbn: 0, cand: [] };
  return {
    calls,
    deps: {
      resolveCoverViaServerDetailed: server,
      findCoverFromGoogleBooks: async () => { calls.google += 1; return ''; },
      findIsbnCandidates: async () => { calls.isbn += 1; return []; },
      resolveCoverFromCandidates: async (list) => { calls.cand.push(list); return { isbn: list[0] || null, url: null }; },
      checkImageExists: async () => true,
      ...extra,
    },
  };
}

describe('resolveCoverForBook', () => {
  it('サーバーが見つけた表紙と ISBN を返す（本に ISBN が無いので ISBN も保存してよい）', async () => {
    const d = deps(async () => ({ status: 'found', url: RAKUTEN, isbn: '9784478102923' }));
    const r = await resolveCoverForBook(BOOK, { deps: d.deps });
    expect(r).toEqual({ url: RAKUTEN, coverIsbn: '9784478102923', isbn: '9784478102923', outcome: 'found' });
    expect(d.calls.google).toBe(0); // 端末から Google を叩かない
  });

  it('本に ISBN があれば、それを上書きする ISBN は返さない（違う版の ISBN にしない）', async () => {
    const d = deps(async (q) => {
      expect(q.isbn).toBe('9784478102916'); // 本の ISBN で探している
      return { status: 'found', url: RAKUTEN, isbn: '9784478102923' };
    });
    const r = await resolveCoverForBook({ ...BOOK, isbn: '978-4-478-10291-6' }, { deps: d.deps });
    expect(r.isbn).toBe('');
    expect(r.coverIsbn).toBe('9784478102923');
  });

  it('サーバーに届かなければ端末の経路も試し、見つからなければ transient（覚えない）', async () => {
    const d = deps(async () => ({ status: 'error', url: '', isbn: '' }));
    const r = await resolveCoverForBook(BOOK, { deps: d.deps });
    expect(r.outcome).toBe('transient');
    expect(d.calls.google).toBe(1);
    expect(d.calls.isbn).toBe(1);
  });

  it('サーバーが答えたうえで無い → not_found。本の ISBN が先・サーバーの ISBN が次の順で候補を試す', async () => {
    const d = deps(async () => ({ status: 'isbn_only', url: '', isbn: '9784478102923' }));
    const r = await resolveCoverForBook(BOOK, { deps: d.deps });
    expect(r.outcome).toBe('not_found');
    expect(d.calls.cand[0]).toEqual(['9784478102923']);
    const d2 = deps(async () => ({ status: 'isbn_only', url: '', isbn: '9784478102923' }));
    await resolveCoverForBook({ ...BOOK, isbn: '9784478102916' }, { deps: d2.deps });
    expect(d2.calls.cand[0]).toEqual(['9784478102916', '9784478102923']);
  });

  it('壊れた URL（skipUrl）は採らない', async () => {
    const d = deps(async (q, opts) => {
      expect(opts.skipUrl).toBe(RAKUTEN);
      return { status: 'not_found', url: '', isbn: '' };
    }, { findCoverFromGoogleBooks: async () => RAKUTEN });
    const r = await resolveCoverForBook(BOOK, { skipUrl: RAKUTEN, deps: d.deps });
    expect(r.url).toBe('');
  });
});

describe('負のキャッシュ（「見つからない」は 7 日おく）', () => {
  it('7 日たつと探し直す・手がかりが変わればすぐ探す', () => {
    let t = 1_000_000;
    const storage = memoryStorage();
    const c = createNegativeCache({ storage, now: () => t });
    expect(c.has(BOOK)).toBe(false);
    c.add(BOOK);
    expect(c.has(BOOK)).toBe(true);
    t += NEGATIVE_TTL_MS - 1;
    expect(c.has(BOOK)).toBe(true);
    t += 2;
    expect(c.has(BOOK)).toBe(false);
    c.add(BOOK);
    expect(c.has({ ...BOOK, isbn: '9784478102923' })).toBe(false); // ISBN が付いた → 別の鍵
    expect(c.has({ ...BOOK, title: '別の書名' })).toBe(false);
    c.remove(BOOK);
    expect(c.has(BOOK)).toBe(false);
  });
  it('localStorage が使えなくても落ちない', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const c = createNegativeCache({ storage: broken });
    expect(() => c.add(BOOK)).not.toThrow();
    expect(c.has(BOOK)).toBe(false);
    expect(createNegativeCache({ storage: null }).has(BOOK)).toBe(false);
  });
});

describe('canReplaceCover', () => {
  it('空の表紙・壊れていると言われた URL だけ差し替える。手動・削除の印は触らない', () => {
    expect(canReplaceCover({ cover: '' })).toBe(true);
    expect(canReplaceCover({ cover: 'https://x/a.jpg' })).toBe(false);
    expect(canReplaceCover({ cover: 'https://x/a.jpg' }, 'https://x/a.jpg')).toBe(true);
    expect(canReplaceCover({ cover: 'https://x/b.jpg' }, 'https://x/a.jpg')).toBe(false); // その間に別の表紙が付いた
    expect(canReplaceCover({ cover: '', coverIsbn: 'manual' })).toBe(false);
    expect(canReplaceCover({ cover: 'https://x/a.jpg', coverIsbn: 'removed' }, 'https://x/a.jpg')).toBe(false);
    expect(canReplaceCover(null)).toBe(false);
  });
});

describe('enqueueCoverRetry', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('最近「見つからない」だった本・表紙が壊れていない本はキューに積まない', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    const mod = await import('./coverAutoRetry');
    createNegativeCache({ storage }).add(BOOK);
    const saveBook = vi.fn();
    const fetchSpy = vi.fn(async () => { throw new Error('should not fetch'); });
    vi.stubGlobal('fetch', fetchSpy);
    mod.enqueueCoverRetry({ book: BOOK, saveBook });
    mod.enqueueCoverRetry({ book: { ...BOOK, id: 'b2', cover: 'https://x/a.jpg' }, saveBook });
    mod.enqueueCoverRetry({ book: { ...BOOK, id: 'b3', coverIsbn: 'manual' }, saveBook });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
    mod._resetCoverAutoRetry();
  });

  it('壊れた URL の本は探し直して差し替える（ISBN も一緒に渡す）', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.resetModules();
    const mod = await import('./coverAutoRetry');
    const broken = 'https://cover.openbd.jp/9784478102923.jpg';
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      expect(String(url)).toContain('/api/cover?');
      return { ok: true, status: 200, json: async () => ({ cover: RAKUTEN, isbn: '9784478102923', candidates: [broken] }) };
    }));
    class FakeImage { set src(u) { setTimeout(() => { if (u === RAKUTEN) { this.naturalWidth = 420; this.naturalHeight = 420; this.onload(); } else this.onerror(); }, 0); } }
    vi.stubGlobal('Image', FakeImage);
    const book = { ...BOOK, cover: broken };
    const saved = new Promise((resolve) => {
      mod.enqueueCoverRetry({ book, brokenCover: broken, getBook: () => book, saveBook: async (patch) => resolve(patch) });
    });
    const patch = await saved;
    expect(patch).toEqual({ id: 'b1', cover: RAKUTEN, coverIsbn: '9784478102923', isbn: '9784478102923', brokenCover: broken });
    mod._resetCoverAutoRetry();
  });
});
