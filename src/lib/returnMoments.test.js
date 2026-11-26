import { describe, it, expect } from 'vitest';
import { anniversaryOf, pickReturnMoment, jstDay, dayDiff, momentQuote } from './returnMoments';

const DAY = 86400000;
const NOW = Date.parse('2026-11-26T03:00:00Z'); // 日本時間 12 時
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const memo = (id, days, extra = {}) => ({ id, bookId: 'b1', text: `メモ ${id} の本文`, createdAt: ago(days), ...extra });

describe('jstDay / dayDiff', () => {
  it('日本時間の日付で数える', () => {
    expect(jstDay(Date.parse('2026-11-25T16:00:00Z'))).toBe('2026-11-26');
    expect(dayDiff('2026-11-20', '2026-11-26')).toBe(6);
    expect(dayDiff(null, '2026-11-26')).toBe(null);
  });
});

describe('anniversaryOf', () => {
  it('1 か月・3 か月・半年・1 年・2 年の 14 日のうちだけ', () => {
    expect(anniversaryOf(ago(28), NOW)).toBe(null); // 29 日目
    expect(anniversaryOf(ago(29), NOW)?.label).toBe('1 か月'); // 30 日目
    expect(anniversaryOf(ago(42), NOW)?.label).toBe('1 か月');
    expect(anniversaryOf(ago(43), NOW)).toBe(null);
    expect(anniversaryOf(ago(364), NOW)?.label).toBe('1 年'); // 365 日目
    expect(anniversaryOf(ago(95), NOW)?.label).toBe('3 か月');
    expect(anniversaryOf(ago(180), NOW)?.key).toBe('anniv:180');
    expect(anniversaryOf(ago(370), NOW)?.label).toBe('1 年');
    expect(anniversaryOf(ago(731), NOW)?.label).toBe('2 年');
    expect(anniversaryOf(null, NOW)).toBe(null);
  });
});

describe('pickReturnMoment', () => {
  const memos = [memo('a', 40), memo('b', 20), memo('c', 1)];
  it('メモが無ければ出さない', () => {
    expect(pickReturnMoment({ now: NOW, createdAt: ago(30), prevDay: '2026-11-01', memos: [] })).toBe(null);
  });
  it('はじめて N は最初のメモ（1 回だけ）', () => {
    const m = pickReturnMoment({ now: NOW, createdAt: ago(31), prevDay: '2026-11-25', memos });
    expect(m.kind).toBe('anniv');
    expect(m.memo.id).toBe('a');
    expect(m.lead).toBe('orime をはじめて 1 か月。最初に書いたメモ');
    expect(pickReturnMoment({ now: NOW, createdAt: ago(31), prevDay: '2026-11-25', memos, done: new Set(['anniv:30']) })).toBe(null);
  });
  it('2 日以上あけたら前のメモ・7 日以上なら「おかえりなさい」・毎日なら出さない', () => {
    expect(pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-25', memos })).toBe(null);
    const two = pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-24', memos });
    expect(two.kind).toBe('back');
    expect(two.lead.startsWith('おかえりなさい')).toBe(false);
    const m = pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-19', memos });
    expect(m.key).toBe('back:2026-11-26');
    expect(m.lead.startsWith('おかえりなさい。')).toBe(true);
    expect(m.lead).not.toMatch(/ぶり/);
    expect(m.action).toBe('read');
    expect(pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-19', memos, done: new Set(['back:2026-11-26']) })).toBe(null);
  });
  it('3 か月からは最初のメモと「いまの考えと比べる」（相談の下書き）', () => {
    const m = pickReturnMoment({ now: NOW, createdAt: ago(92), prevDay: '2026-11-25', memos });
    expect(m.action).toBe('compare');
    expect(m.question).toContain('3 か月前に「メモ a の本文」');
    expect(m.actionLabel).toBe('いまの考えと比べる');
  });
  it('メモがまだ無い人は、積読を先に本棚で待っている本＋15 分だけ読む（一覧に出ていない本を先に）', () => {
    const bk = (id, status, d) => ({ id, title: `本${id}`, status, updated_at: `2026-11-${String(d).padStart(2, '0')}T00:00:00Z` });
    const shelf = [bk('b1', 'before', 20), bk('b2', 'before', 21), bk('b3', 'before', 22), bk('b4', 'before', 2), bk('w1', 'want', 5)];
    const m = pickReturnMoment({ now: NOW, createdAt: ago(31), memos: [], books: shelf });
    expect(m.action).toBe('focus');
    expect(m.actionLabel).toBe('15 分だけ読む');
    expect(m.lead).toBe('orime をはじめて 1 か月。本棚で待っている本');
    expect(m.book.id).toBe('b4');
    // 積読が 1 冊でもあれば、読みたいより先
    expect(pickReturnMoment({ now: NOW, createdAt: ago(31), memos: [], books: [bk('w1', 'want', 1), bk('b1', 'before', 20)] }).book.id).toBe('b1');
    // 2 日以上あけた日も（はじめて N でない日）
    const back = pickReturnMoment({ now: NOW, createdAt: ago(5), prevDay: '2026-11-23', memos: [], books: [bk('b1', 'before', 5)] });
    expect(back.kind).toBe('back');
    expect(back.lead).toBe('本棚で待っている本');
    // 本が無い・読了だけなら出さない（読了の人はホームのはじめの一歩が一文のメモを誘う）
    expect(pickReturnMoment({ now: NOW, createdAt: ago(31), memos: [], books: [] })).toBe(null);
    expect(pickReturnMoment({ now: NOW, createdAt: ago(31), memos: [], books: [bk('d', 'done', 1)] })).toBe(null);
  });
  it('読みたいの本は手元に無いかもしれない＝「本を見る」で本の詳細へ（すぐ読ませない）', () => {
    const m = pickReturnMoment({ now: NOW, createdAt: ago(31), memos: [], books: [{ id: 'w1', title: 'W', status: 'want' }] });
    expect(m.action).toBe('open');
    expect(m.actionLabel).toBe('本を見る');
    expect(m.lead).toBe('orime をはじめて 1 か月。読みたい本');
  });
  it('読み始めてメモがまだ無い人には、読みかけの本の「続きを 15 分」（戻ってきても何も出ていなかった）', () => {
    const books = [{ id: 'w', title: 'W', status: 'want' }, { id: 'r', title: 'R', status: 'reading' }];
    const m = pickReturnMoment({ now: NOW, createdAt: ago(5), prevDay: '2026-11-21', memos: [], books });
    expect(m.book.id).toBe('r');
    expect(m.action).toBe('focus');
    expect(m.actionLabel).toBe('続きを 15 分');
    expect(m.lead).toBe('読みかけの本');
    // 読んだ時間があれば、節目に「これまで … 読みました」
    const a = pickReturnMoment({ now: NOW, createdAt: ago(91), memos: [], books, readSeconds: 45 * 60 });
    expect(a.lead).toBe('orime をはじめて 3 か月。これまで 45 分 読みました。読みかけの本');
    // 前の節目でも同じ読みかけの本なら、ほかの本に替えてもよいと伝えて 1 冊探す
    const again = pickReturnMoment({ now: NOW, createdAt: ago(91), memos: [], books, readSeconds: 45 * 60, done: new Set(['r:r']) });
    expect(again.action).toBe('advisor');
    expect(again.lead).toBe('orime をはじめて 3 か月。これまで 45 分 読みました。合う本に替えてもかまいません');
    expect(a.quote).toBe('『R』');
  });
  it('待っている本を全部すすめたあとの節目は、同じ本をすすめず「1 冊探す」（AI 選書）', () => {
    const books = [{ id: 'b1', title: 'B', status: 'before' }];
    const m = pickReturnMoment({ now: NOW, createdAt: ago(91), memos: [], books, done: new Set(['b:b1']) });
    expect(m.action).toBe('advisor');
    expect(m.actionLabel).toBe('1 冊探す');
    expect(m.lead).toBe('orime をはじめて 3 か月。いまの悩みに合う本');
    // 数日あけた日は、全部見せていてもいちばん上の本（読み始めるきっかけ）
    const back = pickReturnMoment({ now: NOW, createdAt: ago(5), prevDay: '2026-11-21', memos: [], books, done: new Set(['b:b1']) });
    expect(back.book.id).toBe('b1');
  });
  it('はじめて開いた日（前の日が無い）は出さない', () => {
    expect(pickReturnMoment({ now: NOW, createdAt: ago(5), prevDay: null, memos })).toBe(null);
  });
  it('始めたばかりで若いメモしか無くても、1 日以上前のメモから', () => {
    const m = pickReturnMoment({ now: NOW, createdAt: ago(5), prevDay: '2026-11-21', memos: [memo('x', 5), memo('y', 0)] });
    expect(m.memo.id).toBe('x');
  });
  it('AI のまとめ・本の無いメモ・本棚に無い本のメモは出さない', () => {
    const only = [memo('ai', 30, { sourceType: 'ai_summary' }), memo('p', 30, { bookId: null }), memo('gone', 30, { bookId: 'zz' })];
    expect(pickReturnMoment({ now: NOW, createdAt: ago(200), prevDay: '2026-11-01', memos: only, bookIds: new Set(['b1']) })).toBe(null);
  });
});

describe('momentQuote', () => {
  it('「」で包んで長ければ切る', () => {
    expect(momentQuote({ text: '短い' })).toBe('「短い」');
    expect(momentQuote({ text: 'あ'.repeat(60) }, 10)).toBe(`「${'あ'.repeat(9)}…」`);
    expect(momentQuote({ text: '条件は「本質的」であること' })).toBe('「条件は『本質的』であること」');
    expect(momentQuote(null)).toBe('');
  });
});

describe('期限が来た行動（2026-11-26）', () => {
  const day = (n) => new Date(NOW + n * DAY).toISOString().slice(0, 10);
  it('期限が今日〜3 日前のまだの行動を 1 行に（1 日 1 回・それより古いものは出さない）', () => {
    const books = [{ id: 'b', title: 'A', actions: [{ text: '1on1 で質問から入る', done: false, deadline: day(0) }] }];
    const m = pickReturnMoment({ now: NOW, createdAt: ago(10), prevDay: '2026-11-25', memos: [], books });
    expect(m.kind).toBe('action');
    expect(m.lead).toBe('今日が期限の行動');
    expect(m.quote).toBe('「1on1 で質問から入る」');
    expect(pickReturnMoment({ now: NOW, createdAt: ago(10), prevDay: '2026-11-25', memos: [], books, done: new Set([m.key]) })).toBe(null);
    const old = [{ id: 'b', title: 'A', actions: [{ text: 'x', done: false, deadline: day(-5) }] }];
    expect(pickReturnMoment({ now: NOW, createdAt: ago(10), prevDay: '2026-11-25', memos: [], books: old })).toBe(null);
    const doneA = [{ id: 'b', title: 'A', actions: [{ text: 'x', done: true, deadline: day(0) }] }];
    expect(pickReturnMoment({ now: NOW, createdAt: ago(10), prevDay: '2026-11-25', memos: [], books: doneA })).toBe(null);
  });
});

describe('期限が来た行動は節目より先（2026-11-26 3 回目）', () => {
  it('はじめて 3 か月の日でも期限の行動を先に・節目は次に開いた日', () => {
    const day0 = new Date(NOW).toISOString().slice(0, 10);
    const books = [{ id: 'b', title: 'A', actions: [{ text: '朝 15 分', done: false, deadline: day0 }] }];
    const memos = [memo('a', 40)];
    const m = pickReturnMoment({ now: NOW, createdAt: ago(91), prevDay: '2026-11-25', memos, books });
    expect(m.kind).toBe('action');
    const next = pickReturnMoment({ now: NOW, createdAt: ago(91), prevDay: '2026-11-25', memos, books, done: new Set([m.key]) });
    expect(next.kind).toBe('anniv');
  });
});

