import { describe, it, expect } from 'vitest';
import { parseCsv, parseBooklogCsv, parseKindleClippings, parseKindleNotebookHtml, parseImportText, decodeImportBytes, mapStatus, summarizeImport, mergeImportResults } from './importers';

describe('parseCsv', () => {
  it('引用符・カンマ・改行入りのセル', () => {
    expect(parseCsv('a,"b,c","d\n""e"""\n1,2,3')).toEqual([['a', 'b,c', 'd\n"e"'], ['1', '2', '3']]);
  });
});

describe('parseBooklogCsv', () => {
  it('ブクログのエクスポート（見出しなし・列順）', () => {
    const csv = '"1","4862760856","9784862760852","本","5","読み終わった","仕事の進め方が変わった","ビジネス,思考","答えを出す前に問いを確かめる","2025-03-01 10:20:30","2025-03-10","イシューからはじめよ","安宅和人","英治出版","2010","","242"\n'
      + '"1","4478025819","9784478025819","本","0","積読","","","","2025-05-01 09:00:00","","エッセンシャル思考","グレッグ・マキューン","かんき出版","2014","",""';
    const { books } = parseBooklogCsv(csv);
    expect(books).toHaveLength(2);
    expect(books[0]).toMatchObject({ title: 'イシューからはじめよ', author: '安宅和人', isbn: '9784862760852', status: 'done', rating: 5, doneDate: '2025-03-10', review: '仕事の進め方が変わった', tags: ['ビジネス', '思考'] });
    expect(books[0].memos[0]).toMatchObject({ text: '答えを出す前に問いを確かめる', createdAt: '2025-03-01T10:20:30+09:00' });
    expect(books[1]).toMatchObject({ status: 'before', rating: 0, memos: [] });
  });
  it('見出し行のある CSV（列名で読む）', () => {
    const { books } = parseBooklogCsv('タイトル,著者,ISBN,状態\n数値化の鬼,安藤広大,9784478114711,いま読んでる');
    expect(books[0]).toMatchObject({ title: '数値化の鬼', author: '安藤広大', isbn: '9784478114711', status: 'reading' });
  });
});

describe('mapStatus', () => {
  it('ブクログの読書状況', () => {
    expect(mapStatus('読みたい')).toBe('want');
    expect(mapStatus('いま読んでる')).toBe('reading');
    expect(mapStatus('読み終わった')).toBe('done');
    expect(mapStatus('積読')).toBe('before');
  });
});

describe('parseKindleClippings', () => {
  it('日本語の端末: ハイライトとメモを本ごとにまとめ、しおりと重複は除く', () => {
    const txt = '﻿イシューからはじめよ (安宅和人)\n- 25ページ|位置No. 372-373のハイライト |作成日: 2025年4月2日水曜日 21:05:10\n\n答えを出す前に問いを見極める\n==========\n'
      + 'イシューからはじめよ (安宅和人)\n- 30ページ|位置No. 400のブックマーク |作成日: 2025年4月2日水曜日 21:06:00\n\n\n==========\n'
      + 'イシューからはじめよ (安宅和人)\n- 25ページ|位置No. 372-373のハイライト |作成日: 2025年4月2日水曜日 21:05:10\n\n答えを出す前に問いを見極める\n==========\n'
      + 'Deep Work (Cal Newport)\n- Your Highlight on page 12 | Location 172-173 | Added on Wednesday, January 1, 2025 12:34:56 PM\n\nFocus is the new IQ.\n==========\n';
    const { books } = parseKindleClippings(txt);
    expect(books).toHaveLength(2);
    expect(books[0]).toMatchObject({ title: 'イシューからはじめよ', author: '安宅和人', status: 'done' });
    expect(books[0].memos).toHaveLength(1);
    expect(books[0].memos[0]).toMatchObject({ page: 25, createdAt: '2025-04-02T21:05:10+09:00' });
    expect(books[1].memos[0]).toMatchObject({ text: 'Focus is the new IQ.', page: 12 });
  });
});

describe('parseKindleNotebookHtml', () => {
  it('Kindle アプリのノートブック', () => {
    const html = '<div class="bookTitle">1兆ドルコーチ</div><div class="authors">エリック・シュミット</div>'
      + '<div class="noteHeading">ハイライト(<span class="highlight_yellow">黄</span>) - ページ 61 · 位置No. 900</div><div class="noteText">1on1 は近況から &amp; 始める</div>';
    const { books } = parseKindleNotebookHtml(html);
    expect(books[0]).toMatchObject({ title: '1兆ドルコーチ', author: 'エリック・シュミット' });
    expect(books[0].memos[0]).toMatchObject({ text: '1on1 は近況から & 始める', page: 61 });
  });
});

describe('parseImportText / decode', () => {
  it('形式を当てる', () => {
    expect(parseImportText('My Clippings.txt', 'A (B)\n- 1ページのハイライト\n\nx\n==========').source).toBe('kindle');
    expect(parseImportText('booklog.csv', 'タイトル\nX').source).toBe('booklog');
  });
  it('UTF-8 の BOM を落とす', () => {
    expect(decodeImportBytes(new TextEncoder().encode('﻿abc'))).toBe('abc');
  });
  it('件数のまとめ（レビューもメモとして数える）', () => {
    expect(summarizeImport({ books: [{ memos: [{}, {}], review: 'x' }, { memos: [], review: '' }] })).toEqual({ books: 2, memos: 3 });
  });
});

describe('mergeImportResults', () => {
  it('いくつかのファイル: 同じ本は 1 冊に・同じ文のメモは 1 つに・取り込み元が混ざれば mixed', () => {
    const a = { source: 'kindle', books: [{ title: 'A', author: 'x', memos: [{ text: '一', page: 1 }, { text: '二', page: 2 }] }] };
    const b = { source: 'kindle', books: [{ title: 'A', author: 'x', memos: [{ text: '二', page: 2 }, { text: '三', page: 3 }] }, { title: 'B', author: 'y', memos: [] }] };
    const m = mergeImportResults([a, b]);
    expect(m.source).toBe('kindle');
    expect(m.books).toHaveLength(2);
    expect(m.books[0].memos.map((x) => x.text)).toEqual(['一', '二', '三']);
    expect(mergeImportResults([a, { source: 'booklog', books: [] }]).source).toBe('mixed');
    expect(mergeImportResults([a])).toBe(a);
  });
});
