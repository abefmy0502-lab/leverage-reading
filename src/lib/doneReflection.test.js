import { describe, it, expect } from 'vitest';
import {
  DONE_QUESTIONS, DONE_QUESTIONS_DAYS, visibleDoneQuestions, readDoneQuestionState, markDoneQuestionAnswered,
  dismissDoneQuestions, beforeReadingItems, foundAnswerDraft, pickAfterMemos,
} from './doneReflection';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h).getTime();

describe('読了の 3 つの問い', () => {
  const book = { id: 'b1', status: 'done', doneDate: '2026-10-01' };
  it('問いは 3 つ（いちばん効いた主張・明日から何を変える・あえて反論するなら）', () => {
    expect(DONE_QUESTIONS.map((q) => q.text)).toEqual(['いちばん効いた主張は？', '明日から何を変える？', 'あえて反論するなら？']);
  });
  it('読了から 14 日まで出す・過ぎたら出さない・読了日が無い本・読了でない本は出さない', () => {
    expect(visibleDoneQuestions(book, null, at(2026, 10, 1))).toHaveLength(3);
    expect(visibleDoneQuestions(book, null, at(2026, 10, 1 + DONE_QUESTIONS_DAYS))).toHaveLength(3);
    expect(visibleDoneQuestions(book, null, at(2026, 10, 2 + DONE_QUESTIONS_DAYS))).toHaveLength(0);
    expect(visibleDoneQuestions({ ...book, doneDate: null }, null, at(2026, 10, 1))).toHaveLength(0);
    expect(visibleDoneQuestions({ ...book, status: 'reading' }, null, at(2026, 10, 1))).toHaveLength(0);
  });
  it('メモにした問いは消え、閉じたら全部消える（端末に覚える）', () => {
    const s = mem();
    markDoneQuestionAnswered('b1', 'change', s);
    const st = readDoneQuestionState('b1', s);
    expect(visibleDoneQuestions(book, st, at(2026, 10, 2)).map((q) => q.key)).toEqual(['claim', 'counter']);
    dismissDoneQuestions('b1', s);
    expect(visibleDoneQuestions(book, readDoneQuestionState('b1', s), at(2026, 10, 2))).toEqual([]);
    expect(readDoneQuestionState('b2', s)).toEqual({ answered: [], dismissed: false });
  });
  it('壊れた値・知らない問いは無視する', () => {
    const s = mem();
    s.setItem('orime.doneQuestions.v1:b1', '{broken');
    expect(readDoneQuestionState('b1', s)).toEqual({ answered: [], dismissed: false });
    s.setItem('orime.doneQuestions.v1:b1', JSON.stringify({ answered: ['nope', 'claim'] }));
    expect(readDoneQuestionState('b1', s).answered).toEqual(['claim']);
  });
});

describe('読む前と読んだ後', () => {
  const book = { id: 'b1', status: 'done', investPurpose: 'チームの成果をきちんと測って伸ばしたい', currentChallenge: '', hypothesis: '数字で目標を決めれば速くなる' };
  it('積読のときに書いたこと（空のものは出さない）', () => {
    expect(beforeReadingItems(book).map((x) => x.label)).toEqual(['この本から得たいこと', '仮説']);
    expect(beforeReadingItems({})).toEqual([]);
  });
  it('「答えは見つかった？」の下書き（最初に書いたこと・40 字まで）', () => {
    expect(foundAnswerDraft(book)).toBe('読む前に『チームの成果をきちんと測って伸ばしたい』と書いていました。答えは見つかった？');
    const long = foundAnswerDraft({ investPurpose: 'あ'.repeat(80) });
    expect(long).toContain('…』と書いていました');
    expect(foundAnswerDraft({ hypothesis: '『本』で変わる' })).toBe('読む前に『「本」で変わる』と書いていました。答えは見つかった？');
    expect(foundAnswerDraft({})).toBe('');
  });
  it('並べるメモは言葉の重なりが多い順・無ければ新しい順', () => {
    const memos = [
      { id: 'm1', text: '朝の会議は短くする', createdAt: '2026-10-03' },
      { id: 'm2', text: '成果を数字で測ると、チームが動く', createdAt: '2026-10-01' },
      { id: 'm3', text: '', createdAt: '2026-10-05' },
    ];
    expect(pickAfterMemos(beforeReadingItems(book), memos, 1).map((m) => m.id)).toEqual(['m2']);
    expect(pickAfterMemos([{ text: 'xyz' }], memos, 2).map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(pickAfterMemos(beforeReadingItems(book), [], 2)).toEqual([]);
  });
});
