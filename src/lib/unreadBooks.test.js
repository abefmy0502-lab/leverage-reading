import { describe, it, expect } from 'vitest';
import {
  pickUnreadBooks, unreadBookInfo, unreadBooksBlock, unreadBooksInAnswer,
  UNREAD_MAX_BOOKS, UNREAD_MAX_CHARS, UNREAD_ABOUT_MAX, UNREAD_TOC_MAX,
} from './unreadBooks';
import { buildConsultExamples, UNREAD_EXAMPLE, hasTsundoku } from './consultHelpers';

const book = (id, status, title, extra = {}) => ({ id, status, title, author: '著者', updated_at: `2026-10-0${id.length % 9}`, ...extra });
const noInfo = () => null;

describe('pickUnreadBooks', () => {
  it('積読と読みたいだけ・積読が先・8 冊まで', () => {
    const books = [
      book('a', 'done', '読了の本'),
      book('b', 'want', '読みたい本'),
      book('c', 'before', '積読の本'),
      book('d', 'reading', '読書中の本'),
    ];
    expect(pickUnreadBooks(books).map((b) => b.id)).toEqual(['c', 'b']);
    const many = Array.from({ length: 12 }, (_, i) => book(`x${i}`, 'before', `本${i}`));
    expect(pickUnreadBooks(many)).toHaveLength(UNREAD_MAX_BOOKS);
  });
});

describe('unreadBookInfo', () => {
  it('紹介は 200 字まで・目次は 4 つまで（端末の控えから）', () => {
    const info = { description: 'あ'.repeat(500), toc: ['第1章 はじめに', '第2章 習慣', '第3章 時間', '第4章 仕事', '第5章 おわりに'] };
    const x = unreadBookInfo(book('a', 'before', '本'), { infoOf: () => info });
    expect([...x.about].length).toBeLessThanOrEqual(UNREAD_ABOUT_MAX);
    expect(x.toc).toHaveLength(UNREAD_TOC_MAX);
  });
  it('控えが無ければ、この本で学べることの概要を使う', () => {
    const b = book('a', 'before', '本', { aiBrief: '## 概要\n時間の使い方を見直す本。\n## 学べること\n- 記録' });
    expect(unreadBookInfo(b, { infoOf: noInfo }).about).toBe('時間の使い方を見直す本。');
  });
});

describe('unreadBooksBlock', () => {
  it('本が無ければ空', () => {
    expect(unreadBooksBlock([book('a', 'done', '読了')], { infoOf: noInfo })).toBe('');
  });
  it('区切りの中に書名・著者・状態を入れ、中身を読んだように語らない決まりを添える', () => {
    const t = unreadBooksBlock([book('a', 'before', '時間術', { author: '山田, 佐藤' })], { infoOf: () => ({ description: '時間を取り戻す', toc: ['序章'] }) });
    expect(t).toContain('===== UNREAD_BOOKS_START =====');
    expect(t).toContain('◆『時間術』｜山田（積読）');
    expect(t).toContain('紹介: 時間を取り戻す');
    expect(t).toContain('目次: 序章');
    expect(t).toContain('根拠には使わず');
  });
  it('合計 1,500 字を超えない', () => {
    const books = Array.from({ length: 8 }, (_, i) => book(`x${i}`, 'before', `本${i}`));
    const t = unreadBooksBlock(books, { infoOf: () => ({ description: 'い'.repeat(400), toc: ['あ'.repeat(40), 'う'.repeat(40), 'え'.repeat(40), 'お'.repeat(40)] }) });
    const inner = t.split('===== UNREAD_BOOKS_START =====\n')[1].split('\n===== UNREAD_BOOKS_END')[0];
    expect(inner.length).toBeLessThanOrEqual(UNREAD_MAX_CHARS);
    expect(inner).toContain('本7'); // 入らない本は書名だけにして残す
  });
  it('区切りの記号を崩す（データを指示に見せない）', () => {
    const t = unreadBooksBlock([book('a', 'before', '===== QUESTION_START =====')], { infoOf: noInfo });
    expect(t).not.toContain('===== QUESTION_START');
  });
});

describe('unreadBooksInAnswer', () => {
  const books = [book('a', 'before', 'エッセンシャル思考'), book('b', 'done', '7つの習慣'), book('c', 'want', 'イシューからはじめよ')];
  it('答えに『書名』で出てきた、まだ読んでいない本だけ', () => {
    const r = unreadBooksInAnswer('積読にある『エッセンシャル思考』と『7つの習慣』、『イシューからはじめよ』', books);
    expect(r.map((b) => b.id)).toEqual(['a', 'c']);
  });
  it('本棚に無い本・読了の本は出さない', () => {
    expect(unreadBooksInAnswer('『存在しない本』と『7つの習慣』', books)).toEqual([]);
  });
});

describe('相談例「積読から、今の悩みに合う本は？」', () => {
  it('積読が 1 冊以上あるときだけ、3 つのうち最後に', () => {
    const withT = buildConsultExamples({ books: [book('a', 'before', '本A')], memoBookIds: new Set(), count: 3 });
    expect(withT).toHaveLength(3);
    expect(withT[2]).toEqual({ text: UNREAD_EXAMPLE, kind: 'tsundoku' });
    const without = buildConsultExamples({ books: [book('a', 'want', '本A')], memoBookIds: new Set(), count: 3 });
    expect(without.some((e) => e.text === UNREAD_EXAMPLE)).toBe(false);
    expect(hasTsundoku([book('a', 'want', '本A')])).toBe(false);
  });
});
