import { describe, it, expect } from 'vitest';
import { KINDLE_BOOKMARKLET, KINDLE_BOOKMARKLET_SOURCE } from './kindleBookmarklet';
import { parseImportText } from './importers';

describe('Kindle のノートブックを全部の本まとめて（2026-11-26）', () => {
  it('1 行の javascript: で、文法が正しい・1 冊ずつ間をあける', () => {
    expect(KINDLE_BOOKMARKLET.startsWith('javascript:')).toBe(true);
    expect(KINDLE_BOOKMARKLET).not.toMatch(/\n/);
    // eslint-disable-next-line no-new-func
    expect(() => new Function(decodeURIComponent(KINDLE_BOOKMARKLET.slice('javascript:'.length)))).not.toThrow();
    expect(KINDLE_BOOKMARKLET_SOURCE).toMatch(/setTimeout\(s,800\)/);
    expect(KINDLE_BOOKMARKLET_SOURCE).toMatch(/credentials:'include'/);
  });
  it('保存する形（何冊も並んだ HTML）を、今の読み取りが本ごとに読む（ページ・メモつき・文字参照も戻す）', () => {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Kindle のハイライト</title></head><body>'
      + '<div class="bookTitle">イシューからはじめよ</div><div class="authors">安宅和人</div>'
      + '<div class="noteHeading">ハイライト - ページ 45</div><div class="noteText">よいイシューの条件</div>'
      + '<div class="noteHeading">ハイライト - 位置 120</div><div class="noteText">A &amp; B<br><br>メモ：仕事で使う</div>'
      + '<div class="bookTitle">考え方</div><div class="authors">稲盛和夫</div>'
      + '<div class="noteHeading">ハイライト - ページ 10</div><div class="noteText">人生の結果</div>'
      + '</body></html>';
    const r = parseImportText('kindle-notebook.html', html);
    expect(r.source).toBe('kindle');
    expect(r.books.map((b) => b.title)).toEqual(['イシューからはじめよ', '考え方']);
    expect(r.books[0].memos.length).toBe(2);
    expect(r.books[0].memos[0].page).toBe(45);
    expect(r.books[0].memos[1].text).toBe('A & B\n\nメモ：仕事で使う');
    expect(r.books[1].memos[0].page).toBe(10);
  });
  it('1 冊だけのエクスポートは今までどおり', () => {
    const one = '<div class="bookTitle">A</div><div class="authors">B</div><div class="noteHeading">ハイライト - ページ 3</div><div class="noteText">x</div>';
    expect(parseImportText('a.html', one).books.length).toBe(1);
  });
});

describe('最後にハイライトした日（2026-11-27）', () => {
  it('data-date をメモの日付と読了の日の目安に・30 日以内なら読書中・無ければ今までどおり', () => {
    const html = '<div class="bookTitle" data-date="2024-03-10">A</div><div class="authors">X</div><div class="noteHeading">ハイライト - ページ 1</div><div class="noteText">a</div>'
      + '<div class="bookTitle">B</div><div class="authors">Y</div><div class="noteHeading">ハイライト - ページ 2</div><div class="noteText">b</div>';
    const r = parseImportText('kindle-notebook.html', html);
    expect(r.books[0].memos[0].createdAt).toBe('2024-03-10T12:00:00+09:00');
    expect(r.books[0].doneDate).toBe('2024-03-10');
    expect(r.books[0].status).toBe('done');
    expect(r.books[1].memos[0].createdAt).toBe(null);
    expect(r.books[1].doneDate).toBe('');
    const d = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const recent = parseImportText('k.html', `<div class="bookTitle" data-date="${d}">C</div><div class="authors">Z</div><div class="noteHeading">ハイライト - ページ 1</div><div class="noteText">c</div><div class="bookTitle">D</div>`);
    expect(recent.books[0].status).toBe('reading');
  });
  it('ブックマークレットは一覧の日付を読む', () => {
    expect(KINDLE_BOOKMARKLET_SOURCE).toMatch(/kp-notebook-annotated-date/);
    // eslint-disable-next-line no-new-func
    expect(() => new Function(decodeURIComponent(KINDLE_BOOKMARKLET.slice('javascript:'.length)))).not.toThrow();
  });
});
