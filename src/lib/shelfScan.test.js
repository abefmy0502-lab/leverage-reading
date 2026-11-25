import { describe, it, expect } from 'vitest';
import { parseShelfScan, matchShelfGuess, verifyShelfGuesses, defaultChecked, shelfImportBooks, SHELF_SCAN_MAX_BOOKS } from './shelfScan';

describe('本棚の写真の読み取り（2026-11-22）', () => {
  it('「書名 ／ 著者」を 1 冊ずつ・番号や記号を外す・同じ本は 1 回・「なし」は 0 冊', () => {
    const out = parseShelfScan('1. イシューからはじめよ ／ 安宅和人\n・『考え方』/ 稲盛和夫\n- 嫌われる勇気 ／\nイシューからはじめよ ／ 安宅和人\nx\n');
    expect(out).toEqual([
      { title: 'イシューからはじめよ', author: '安宅和人' },
      { title: '考え方', author: '稲盛和夫' },
      { title: '嫌われる勇気', author: '' },
    ]);
    expect(parseShelfScan('なし')).toEqual([]);
    expect(parseShelfScan(Array.from({ length: 60 }, (_, i) => `本の書名${i} ／ 著者`).join('\n'))).toHaveLength(SHELF_SCAN_MAX_BOOKS);
  });
  it('書名がはっきり一致すれば found（表紙・ISBN）・一部だけなら maybe・無ければ missing', () => {
    const results = [{ title: 'イシューからはじめよ 改訂版', author: '安宅和人', isbn: '9784862763290', cover: 'https://thumbnail.image.rakuten.co.jp/a.jpg' }];
    const f = matchShelfGuess({ title: 'イシューからはじめよ', author: '安宅和人' }, results);
    expect(f.status).toBe('found');
    expect(f.book.isbn).toBe('9784862763290');
    expect(matchShelfGuess({ title: 'イシューからはじめよ', author: '別の人' }, results).status).toBe('maybe');
    const m = matchShelfGuess({ title: '存在しない本の名前', author: '' }, results);
    expect(m.status).toBe('missing');
    expect(m.book.title).toBe('存在しない本の名前');
  });
  it('確かめる: 本棚にある本は owned・選んでおくのは見つかった新しい本だけ', async () => {
    const search = async (q) => ({ ok: true, results: q.startsWith('考え方') ? [{ title: '考え方', author: '稲盛和夫', isbn: '9784837927525' }] : [] });
    const items = await verifyShelfGuesses([{ title: '考え方', author: '稲盛和夫' }, { title: '謎の本', author: '' }], {
      search, isOwned: (b) => b.title === '考え方',
    });
    expect(items.map((x) => [x.status, x.owned])).toEqual([['found', true], ['missing', false]]);
    expect(items.map(defaultChecked)).toEqual([false, false]);
    const books = shelfImportBooks(items, new Set(['s0', 's1']), 'before');
    expect(books).toEqual([{ title: '謎の本', author: '', isbn: '', cover: '', pages: 0, status: 'before', memos: [] }]);
  });
});

describe('数字で始まる書名', () => {
  it('「7つの習慣」の 7 を番号として外さない', () => {
    expect(parseShelfScan('7つの習慣 ／ スティーブン・R・コヴィー\n2. 考え方 ／ 稲盛和夫')).toEqual([
      { title: '7つの習慣', author: 'スティーブン・R・コヴィー' },
      { title: '考え方', author: '稲盛和夫' },
    ]);
  });
});

describe('AI の断り・説明の行は本として並べない（2026-11-25）', () => {
  it('お詫び・注意書き・長い説明の行を捨てる', () => {
    const text = [
      '決算を読む習慣 ／ 小宮一慶',
      '※ 申し訳ありません。ここで書き出しを止めます。写真の文字は小さく、正確に全冊を書き出すことができません。',
      'グロービスMBAクリティカル・シンキング ／ グロービス経営大学院',
      '読めた範囲でも、著者名を推測で補った箇所がありました。確実に読み取れた書名だけ、以下に並べます。',
    ].join('\n');
    expect(parseShelfScan(text).map((b) => b.title)).toEqual(['決算を読む習慣', 'グロービスMBAクリティカル・シンキング']);
  });
  it('ふつうの書名は捨てない', () => {
    expect(parseShelfScan('注文をまちがえる料理店 ／ 小国士朗\nできないことはやらない ／').map((b) => b.title)).toEqual(['注文をまちがえる料理店', 'できないことはやらない']);
  });
});

describe('読み違えた書名の候補（2026-11-25）', () => {
  it('1 字違いでも、著者が合えば「たぶん」に', () => {
    const m = matchShelfGuess({ title: 'サピエンス全吏', author: 'ユヴァル・ノア・ハラリ' }, [
      { title: 'サピエンス全史 上', author: 'ユヴァル・ノア・ハラリ', isbn: '9784309226712' },
    ]);
    expect(m.status).toBe('maybe');
    expect(m.book.isbn).toBe('9784309226712');
  });
  it('著者が違う本は、書名が近くても候補にしない', () => {
    const m = matchShelfGuess({ title: 'サピエンス全吏', author: '山田太郎' }, [
      { title: 'サピエンス全史 上', author: 'ユヴァル・ノア・ハラリ' },
    ]);
    expect(m.status).toBe('missing');
  });
  it('書名で見つからなければ、著者の名前で探し直す', async () => {
    const calls = [];
    const search = async (q) => {
      calls.push(q);
      if (q === '稲盛和夫') return { ok: true, results: [{ title: '生き方', author: '稲盛和夫' }, { title: '考え方', author: '稲盛和夫', isbn: '9784478028346' }] };
      return { ok: true, results: [] };
    };
    const [it1] = await verifyShelfGuesses([{ title: '考え万', author: '稲盛和夫' }], { search });
    expect(calls).toEqual(['考え万 稲盛和夫', '考え万', '稲盛和夫']);
    expect(it1.status).toBe('maybe');
    expect(it1.book.title).toBe('考え方');
  });
});
