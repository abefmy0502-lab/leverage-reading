import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, parseBooklogCsv, parseKindleClippings, parseKindleNotebookHtml, parseImportText, decodeImportBytes, mapStatus, summarizeImport, mergeImportResults, asinToIsbn13, bookmeterStatusHint, parseBookmeterCsv, parseBookmeterJson, parseBookmeterHtml, looksLikeBookmeterCsv, bookmeterPageTotal, importShortfall } from './importers';

const fixture = (name) => readFileSync(new URL(`../../scripts/fixtures/${name}`, import.meta.url), 'utf-8');

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

describe('読書メーター', () => {
  it('ASIN（ISBN-10）→ ISBN-13・Kindle 版の ASIN は変換しない', () => {
    expect(asinToIsbn13('4862760856')).toBe('9784862760852');
    expect(asinToIsbn13('B07K6VY5T8')).toBe('');
    expect(asinToIsbn13('4862760857')).toBe(''); // チェックディジット違い
    expect(asinToIsbn13('9784862760852')).toBe('9784862760852');
  });
  it('棚の名前 → 状態', () => {
    expect(bookmeterStatusHint('https://bookmeter.com/users/1/books/read')).toBe('done');
    expect(bookmeterStatusHint('reading-books.csv')).toBe('reading');
    expect(bookmeterStatusHint('reading-list-books.csv')).toBe('before');
    expect(bookmeterStatusHint('123-wish-2026-09-29.json')).toBe('want');
    expect(bookmeterStatusHint('Xさんの読んだ本 - 読書メーター')).toBe('done');
    expect(bookmeterStatusHint('bookmeter_260929.csv')).toBe('');
  });

  it('bookmeter-exporter の CSV（fixture）: 感想・読了日・本棚・ASIN', () => {
    const r = parseImportText('bookmeter.csv', fixture('bookmeter.csv'));
    expect(r.source).toBe('bookmeter');
    expect(r.books).toHaveLength(4);
    expect(r.books[0]).toMatchObject({
      title: 'イシューからはじめよ 知的生産の「シンプルな本質」', author: '安宅 和人', isbn: '9784862760852', asin: '4862760856',
      status: 'done', doneDate: '2025-03-10', tags: ['ビジネス', '思考'], pages: 242, reviewAt: '2025-03-10T12:00:00+09:00',
    });
    expect(r.books[0].review).toContain('解く価値のある問い');
    expect(r.books[2].review).toBe(''); // 下書き（感想なし）
    expect(r.books[3]).toMatchObject({ isbn: '', asin: 'B07K6VY5T8', title: '完訳 7つの習慣 人格主義の回復' });
    expect(summarizeImport(r)).toEqual({ books: 4, memos: 3 });
  });
  it('ファイル名で棚を決める（読みたい本の CSV）', () => {
    const csv = 'bookAuthor,bookPage,bookId,bookAsin,bookTitle,bookImageUrl\nA,100,1,4862760856,本A,x';
    expect(parseImportText('wish-list-books.csv', csv).books[0].status).toBe('want');
  });
  it('日本語の見出しの表（タイトル・著者・読んだ日・感想）', () => {
    const csv = '﻿タイトル,著者,読んだ日,感想,ページ数\n数値化の鬼,安藤広大,2025/1/5,行動量を数える。,248\n';
    const r = parseImportText('読書記録.csv', decodeImportBytes(new TextEncoder().encode(csv)));
    expect(r.source).toBe('bookmeter');
    expect(r.books[0]).toMatchObject({ title: '数値化の鬼', author: '安藤広大', doneDate: '2025-01-05', review: '行動量を数える。', status: 'done', pages: 248 });
  });
  it('Shift_JIS で保存した表も読める', () => {
    // 「タイトル,感想\n本,よかった\n」の Shift_JIS
    const sjis = new Uint8Array([0x83, 0x5e, 0x83, 0x43, 0x83, 0x67, 0x83, 0x8b, 0x2c, 0x8a, 0xb4, 0x91, 0x7a, 0x0a, 0x96, 0x7b, 0x2c, 0x82, 0xe6, 0x82, 0xa9, 0x82, 0xc1, 0x82, 0xbd, 0x0a]);
    const r = parseImportText('x.csv', decodeImportBytes(sjis));
    expect(r.source).toBe('bookmeter');
    expect(r.books[0]).toMatchObject({ title: '本', review: 'よかった' });
  });
  it('見出しなし（ASIN, 読了日, 感想）', () => {
    const csv = '4862760856,2025/03/10,問いを見極める\nB07K6VY5T8,2025/08/15,終わりを思い描く\n';
    expect(looksLikeBookmeterCsv('books.csv', csv)).toBe(true);
    const { books } = parseBookmeterCsv(csv);
    expect(books[0]).toMatchObject({ title: 'ISBN 9784862760852', isbn: '9784862760852', doneDate: '2025-03-10', review: '問いを見極める' });
    expect(books[1]).toMatchObject({ title: 'ASIN B07K6VY5T8', asin: 'B07K6VY5T8' });
  });
  it('export_bookmeter の CSV（title, author(s), cover）', () => {
    const r = parseImportText('bookmeter_260929.csv', 'title,author(s),cover\n本A,"著者1,著者2",https://x/y.jpg\n');
    expect(r.source).toBe('bookmeter');
    expect(r.books[0]).toMatchObject({ title: '本A', author: '著者1,著者2', status: 'done' });
  });
  it('ブクログの CSV は今までどおりブクログとして読む', () => {
    expect(parseImportText('booklog.csv', fixture('booklog.csv')).source).toBe('booklog');
    expect(looksLikeBookmeterCsv('export.csv', 'タイトル,著者,ISBN,状態\nX,Y,1,読了')).toBe(false);
  });

  it('bookmeterjson の JSON（review.text・review.read_at・bookcases）', () => {
    const json = JSON.stringify([
      { book_id: 1, asin: '4862760856', title: 'イシューからはじめよ', author: '安宅 和人', pages: 242, date: '2025/03/10', review: { text: '問いを見極める', read_at: '2025-03-10', is_draft: false }, bookcases: ['ビジネス'] },
      { book_id: 2, asin: null, title: '手で登録した本', author: '', pages: 0 },
    ]);
    const r = parseImportText('123456-stacked-2026-09-29.json', json);
    expect(r.source).toBe('bookmeter');
    expect(r.books[0]).toMatchObject({ title: 'イシューからはじめよ', isbn: '9784862760852', review: '問いを見極める', doneDate: '2025-03-10', tags: ['ビジネス'], status: 'before' });
    expect(r.books[1]).toMatchObject({ title: '手で登録した本', isbn: '', asin: '' });
  });
  it('export_bookmeter の JSON（{ books: [{ title, authors: [] }] }）と壊れた JSON', () => {
    const r = parseBookmeterJson(JSON.stringify({ class: 'BookList', books: [{ title: '本A', authors: ['著者1', '著者2'], asin: '' }] }));
    expect(r.books[0]).toMatchObject({ title: '本A', author: '著者1、著者2' });
    expect(parseBookmeterJson('{broken').books).toEqual([]);
  });

  it('保存した「読んだ本」のページ（fixture）: data-modal と一覧の文字から読む', () => {
    const r = parseImportText('読書メーター.html', fixture('bookmeter-read.html'));
    expect(r.source).toBe('bookmeter');
    expect(r.books).toHaveLength(3);
    // 一覧の書名は途中で切れているので、JSON の書名を使う
    expect(r.books[0]).toMatchObject({
      title: 'イシューからはじめよ 知的生産の「シンプルな本質」', author: '安宅 和人', isbn: '9784862760852', status: 'done',
      doneDate: '2025-03-10', tags: ['ビジネス', '思考'], pages: 242,
    });
    expect(r.books[0].review).toBe('答えを出す前に、問いを見極める。\n解く価値のある問いは、思っているより少ない & 大事。');
    // 「日付不明」・下書き（感想なし）・著者が 2 人
    expect(r.books[1]).toMatchObject({ doneDate: '', review: '', author: 'ジェームズ・クリアー、牛原 眞弓', status: 'done' });
    // data-modal が無い本: 表紙の alt と Amazon のリンクから
    expect(r.books[2]).toMatchObject({ title: '完訳 7つの習慣 人格主義の回復', asin: 'B07K6VY5T8', isbn: '', doneDate: '2025-08-15' });
    expect(summarizeImport(r)).toEqual({ books: 3, memos: 1 });
  });
  it('棚の全冊数（.content__count）を読み、保存したページより多ければ残りがあると分かる', () => {
    expect(bookmeterPageTotal('<div class="content__count">1,234</div>')).toBe(1234);
    expect(bookmeterPageTotal('<div class="content__count"><span>56</span>冊</div>')).toBe(56);
    expect(bookmeterPageTotal('<div class="x">3</div>')).toBe(0);
    const fx = parseImportText('読書メーター.html', fixture('bookmeter-read.html'));
    expect(fx).toMatchObject({ total: 3, shelf: 'done' });
    expect(importShortfall(fx)).toBeNull(); // 全部のページがそろっている
    const page = (n) => `<!-- saved from url=(0050)https://bookmeter.com/users/1/books/read -->
      <div class="content__count">${n}</div>
      <li class="group__book"><img alt="本A" class="cover__image" src="x"><ul class="detail__authors"><li><a>著者</a></li></ul></li>`;
    const one = parseBookmeterHtml(page(45));
    expect(importShortfall(one)).toEqual({ total: 45, found: 1, shelf: 'done' });
    // 同じ棚のページを 2 つ選んだら、全冊数は足さない
    const two = parseBookmeterHtml(page(45).replace('本A', '本B'));
    expect(importShortfall(mergeImportResults([one, two]))).toEqual({ total: 45, found: 2, shelf: 'done' });
    // 全冊数が読めないファイル（ブクログなど）は null
    expect(importShortfall({ source: 'booklog', books: [] })).toBeNull();
  });
  it('棚はページの保存元 URL で決める（ほかの棚へのリンクには引っぱられない）', () => {
    const page = (url) => `<!-- saved from url=(0050)${url} --><a href="/users/1/books/read">読んだ本</a>`
      + '<li class="group__book"><img alt="本A" class="cover__image" src="x"><ul class="detail__authors"><li><a>著者</a></li></ul></li>';
    expect(parseBookmeterHtml(page('https://bookmeter.com/users/1/books/wish')).books[0].status).toBe('want');
    expect(parseBookmeterHtml(page('https://bookmeter.com/users/1/books/reading')).books[0].status).toBe('reading');
    expect(parseBookmeterHtml(page('https://bookmeter.com/users/1/books/stacked')).books[0].status).toBe('before');
  });
  it('Kindle のノートブック HTML は Kindle のまま', () => {
    expect(parseImportText('notebook.html', '<div class="bookTitle">A</div><div class="noteHeading">x</div><div class="noteText">y</div>').source).toBe('kindle');
  });
  it('ページ 2 枚（一覧は表紙のみ・リストは感想つき）をまとめると 1 冊に・感想は残る', () => {
    const grid = parseBookmeterHtml('<li class="group__book"><img alt="本A" class="cover__image" src="x"><ul class="detail__authors"><li><a>著者</a></li></ul></li>');
    const list = parseBookmeterHtml('<li class="group__book"><img alt="本A" class="cover__image" src="x"><ul class="detail__authors"><li><a>著者</a></li></ul><div class="detail__date">2025/01/02</div><div class="detail__edit"><div data-modal=\'{"review":{"text":"よかった","read_at":"2025-01-02"}}\'></div></div></li>');
    const m = mergeImportResults([grid, list]);
    expect(m.books).toHaveLength(1);
    expect(m.books[0]).toMatchObject({ review: 'よかった', doneDate: '2025-01-02' });
  });
  it('HTML と CSV を一緒に選ぶと、著者の書き方が違っても ISBN が同じ本は 1 冊に', () => {
    const m = mergeImportResults([parseImportText('read.html', fixture('bookmeter-read.html')), parseImportText('bookmeter.csv', fixture('bookmeter.csv'))]);
    expect(m.source).toBe('bookmeter');
    expect(m.books).toHaveLength(4);
  });
  it('mapStatus: 読書メーターの棚の名前', () => {
    expect(mapStatus('読んだ本')).toBe('done');
    expect(mapStatus('読んでる本')).toBe('reading');
    expect(mapStatus('積読本')).toBe('before');
    expect(mapStatus('読みたい本')).toBe('want');
  });
});
