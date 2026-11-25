import { describe, it, expect } from 'vitest';
import { talkBooks, talkAuthors, scopeKind, scopeHeading, scopeQuestions, rediscoverCard, agoLabel, shortBookTitle } from './dialogueWorld';

const books = [
  { id: 'a', title: '考え方 人生・仕事の結果が変わる', author: '稲盛和夫', status: 'done', rating: 5, doneDate: '2026-03-01' },
  { id: 'b', title: '生き方', author: '稲盛和夫', status: 'done', rating: 4, doneDate: '2026-05-01' },
  { id: 'c', title: '1兆ドルコーチ', author: 'エリック・シュミット', status: 'reading', rating: 0 },
  { id: 'd', title: '人を動かす', author: 'D・カーネギー', status: 'done', rating: 3, doneDate: '2025-10-01' },
  { id: 'e', title: '積読の本', author: '山田太郎', status: 'before' },
];
const memoIds = new Set(['a', 'b', 'c', 'd', 'e']);

describe('対話の世界（2026-11-25）', () => {
  it('話せる本は、メモのある読書中・読了（読書中 → 評価 → 新しい順）', () => {
    expect(talkBooks(books, memoIds).map((b) => b.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(talkBooks(books, new Set(['d'])).map((b) => b.id)).toEqual(['d']);
  });
  it('話せる著者は、本の多い順（お気に入りが先）', () => {
    expect(talkAuthors(books, memoIds).map((a) => a.name)).toEqual(['稲盛和夫', 'エリック・シュミット', 'D・カーネギー']);
    expect(talkAuthors(books, memoIds, [{ key: 'd・カーネギー'.replace(/・/g, '') }])[0].name).toBe('D・カーネギー');
    expect(talkAuthors(books, memoIds)[0].bookIds).toEqual(['a', 'b']);
  });
  it('話し相手の種類と見出し', () => {
    expect(scopeKind([], books).kind).toBe('all');
    expect(scopeHeading(scopeKind(['a'], books))).toBe('『考え方』と話す');
    expect(scopeHeading(scopeKind(['a', 'b'], books))).toBe('稲盛和夫さんの本と話す');
    expect(scopeHeading(scopeKind(['a', 'c'], books))).toBe('選んだ 2 冊と話す');
    expect(scopeQuestions(scopeKind(['a', 'c'], books))[0].mode).toBe('perbook');
    expect(scopeQuestions(scopeKind(['a', 'b'], books)).some((q) => /反論/.test(q.text))).toBe(true);
  });
  it('書名は副題を落として短く', () => {
    expect(shortBookTitle('考え方 人生・仕事の結果が変わる')).toBe('考え方');
    expect(shortBookTitle('エッセンシャル思考（文庫）')).toBe('エッセンシャル思考');
  });
  it('何か月前の書き方', () => {
    expect(agoLabel(95)).toBe('3 か月前');
    expect(agoLabel(180)).toBe('半年前');
    expect(agoLabel(400)).toBe('1 年前');
  });
  it('読んできた本から話しかけてくる 1 枚（メモが少なければ出さない）', () => {
    const now = Date.parse('2026-11-25T00:00:00Z');
    const day = (n) => new Date(now - n * 86400000).toISOString();
    const rows = [
      { id: 'm1', book_id: 'a', text: '仕事の結果は考え方と熱意と能力の掛け算で決まる。', created_at: day(200) },
      { id: 'm2', book_id: 'c', text: 'よいマネージャーは答えを与えず、質問で考えさせる。', created_at: day(5) },
      { id: 'm3', book_id: 'd', text: '人を動かすには、命令ではなく質問で考えさせる。', created_at: day(150) },
    ];
    const card = rediscoverCard({ rows, books, now });
    expect(card).toBeTruthy();
    expect(['reunion', 'past', 'link']).toContain(card.kind);
    expect(rediscoverCard({ rows: rows.slice(0, 2), books, now })).toBeNull();
  });
});
