// 📖 「この本について」の端末側（lib/bookInfo.js）: 返事の形をそろえる・控え・AI に渡す長さ。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeBookInfo, hasBookInfo, bookInfoKey, loadBookInfo, peekBookInfo, bookInfoMetaLine, bookInfoForPrompt,
  PLAN_ABOUT_MAX, PLAN_TOC_MAX_LINES, _resetBookInfoMemory, tidyJaSpacing,
} from './bookInfo';

const okResp = (body, cc = 'public, max-age=86400') => ({
  ok: true, status: 200, json: async () => body, headers: { get: (k) => (k.toLowerCase() === 'cache-control' ? cc : null) },
});

beforeEach(() => _resetBookInfoMemory());

describe('normalizeBookInfo', () => {
  it('知らない取得元の紹介文は出さない・目次は文字列だけ・長さを切る', () => {
    const n = normalizeBookInfo({ description: 'x', source: 'evil', toc: ['a', 3, '', 'b'.repeat(200)], pages: '12', pubdate: 'bad' });
    expect(n.description).toBe('');
    expect(n.toc).toEqual(['a', '3', 'b'.repeat(80)]);
    expect(n.pages).toBe(0);
    expect(n.pubdate).toBe('');
    expect(normalizeBookInfo(null)).toEqual({ description: '', toc: [], source: '', tocSource: '', pages: 0, pubdate: '', genreIds: [] });
  });
  it('hasBookInfo は紹介文か目次のどちらかがあるとき', () => {
    expect(hasBookInfo(null)).toBe(false);
    expect(hasBookInfo({ description: '', toc: [] })).toBe(false);
    expect(hasBookInfo({ description: '', toc: ['第1章'] })).toBe(true);
  });
});

describe('tidyJaSpacing（数と日本語の間の空きを詰める）', () => {
  it('「の 3 つ」「100 年」は詰め、英字の語の間は残す', () => {
    expect(tidyJaSpacing('多くの人が 100 年生きる。の 3 つのステージ')).toBe('多くの人が100年生きる。の3つのステージ');
    expect(tidyJaSpacing('LIFE SHIFT 2 の本')).toBe('LIFE SHIFT 2の本');
    expect(normalizeBookInfo({ description: '1 対 1 の対話', source: 'openbd', toc: ['第 1 章 はじめに'] })).toMatchObject({ description: '1対1の対話' });
  });
  it('見出しの区切りの空き（「序章 100年ライフ」）は残す・目次の行は元の空きのまま', () => {
    expect(tidyJaSpacing('序章 100年ライフ')).toBe('序章 100年ライフ');
    expect(tidyJaSpacing('第1部 2つのステージ')).toBe('第1部 2つのステージ');
    const n = normalizeBookInfo({ description: '序章 100年ライフから始まる。', source: 'openbd', toc: ['序章 100年ライフ', '第 1 章 はじめに'] });
    expect(n.description).toBe('序章 100年ライフから始まる。');
    expect(n.toc).toEqual(['序章 100年ライフ', '第 1 章 はじめに']);
    expect(bookInfoForPrompt({ ...n }).toc).toEqual(['序章 100年ライフ', '第 1 章 はじめに']);
  });
});

describe('bookInfoKey', () => {
  it('ISBN があれば ISBN（ハイフンは落とす）・無ければ書名＋著者', () => {
    expect(bookInfoKey({ isbn: '978-4-492-53387-1', title: 'X' })).toBe('i:9784492533871');
    expect(bookInfoKey({ title: 'LIFE SHIFT', author: 'リンダ・グラットン' })).toBe('t:lifeshift|リンダ・グラットン');
    expect(bookInfoKey({})).toBe('');
  });
});

describe('loadBookInfo', () => {
  it('ISBN・書名・著者で /api/cover?info=1 を引き、2 回目は控えから', async () => {
    const calls = [];
    const fetchImpl = async (url) => { calls.push(url); return okResp({ description: '紹介', toc: ['第1章'], source: 'openbd', tocSource: 'openbd' }); };
    const book = { isbn: '9784492533871', title: 'LIFE SHIFT', author: 'リンダ・グラットン' };
    const a = await loadBookInfo(book, { fetchImpl });
    expect(a.description).toBe('紹介');
    expect(calls[0]).toContain('/api/cover?info=1');
    expect(calls[0]).toContain('isbn=9784492533871');
    expect(calls[0]).toContain('title=LIFE+SHIFT');
    await loadBookInfo(book, { fetchImpl });
    expect(calls).toHaveLength(1);
    expect(peekBookInfo(book)).toEqual(a);
  });

  it('見つからない本は null を覚える・確かめられなかった（no-store）は覚えない', async () => {
    let n = 0;
    const empty = async () => { n += 1; return okResp({ description: '', toc: [] }); };
    expect(await loadBookInfo({ isbn: '9784000000001' }, { fetchImpl: empty })).toBe(null);
    expect(peekBookInfo({ isbn: '9784000000001' })).toBe(null);
    await loadBookInfo({ isbn: '9784000000001' }, { fetchImpl: empty });
    expect(n).toBe(1);

    const down = async () => okResp({ description: '', toc: [] }, 'no-store');
    expect(await loadBookInfo({ isbn: '9784000000002' }, { fetchImpl: down })).toBe(null);
    expect(peekBookInfo({ isbn: '9784000000002' })).toBe(undefined);
  });

  it('通信の失敗は null（覚えない）', async () => {
    const fail = async () => { throw new Error('offline'); };
    expect(await loadBookInfo({ isbn: '9784000000003' }, { fetchImpl: fail })).toBe(null);
    expect(peekBookInfo({ isbn: '9784000000003' })).toBe(undefined);
  });
});

describe('表示と AI に渡す形', () => {
  it('添え書き: 取得元・ページ数・発売の年月', () => {
    expect(bookInfoMetaLine({ source: 'openbd', pages: 400, pubdate: '2016-10-21' })).toBe('出版社の内容紹介より · 400 ページ · 2016年10月');
    expect(bookInfoMetaLine({ source: 'rakuten', pubdate: '2000' })).toBe('楽天ブックスの商品説明より · 2000年');
    expect(bookInfoMetaLine({ source: '', tocSource: 'openbd' })).toBe('出版社の内容紹介より');
  });
  it('読書計画シートに渡す紹介文と目次は長さを切る', () => {
    const info = { description: 'あ'.repeat(900), toc: Array.from({ length: 50 }, (_, i) => `第${i + 1}章 ${'い'.repeat(100)}`), source: 'openbd' };
    const p = bookInfoForPrompt(info);
    expect([...p.about].length).toBe(PLAN_ABOUT_MAX);
    expect(p.aboutSource).toBe('出版社の内容紹介');
    expect(p.toc).toHaveLength(PLAN_TOC_MAX_LINES);
    expect(p.toc.every((l) => [...l].length <= 60)).toBe(true);
    expect(bookInfoForPrompt(null)).toEqual({ about: '', aboutSource: '', toc: [] });
  });
});

describe('ジャンル（分野の手がかり・2026-10-11）', () => {
  it('形の合うジャンル ID だけ・ジャンルだけの本も覚えるが「この本について」には出さない', async () => {
    const { normGenreIds, rememberGenres, genresFor } = await import('./bookInfo');
    expect(normGenreIds(['001004008', 'x', '001004008', 5])).toEqual(['001004008']);
    const n = normalizeBookInfo({ genreIds: ['001006'] });
    expect(hasBookInfo(n)).toBe(false);
    expect(n.genreIds).toEqual(['001006']);
    rememberGenres({ isbn: '9784000000001', title: 't' }, ['001012']);
    expect(genresFor({ isbn: '9784000000001', title: 't' }, null)).toEqual(['001012']);
    expect(genresFor({ isbn: '9784000000001' }, { genreIds: ['001004'] })).toEqual(['001004']);
  });
});
