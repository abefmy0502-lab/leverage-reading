import { describe, it, expect } from 'vitest';
import { encodeThreadRef, decodeThreadRef, isThreadRef, threadRootOf, groupConsults, threadScopeOf, threadTitleOf, lastConsultThread } from './consultThreads.js';

const U = (id, at, content = '相談') => ({ id, role: 'user', content, createdAt: at, refs: [] });
const A = (id, at, refs = [], content = '【結論】\n答え') => ({ id, role: 'assistant', content, createdAt: at, refs });

describe('encodeThreadRef / decodeThreadRef（答えに残す同じ会話の目印）', () => {
  it('はじめの相談の id と相談相手を残して読み戻せる', () => {
    const r = encodeThreadRef('u1', ['b1', 'b2']);
    expect(r).toBe('🧵 u1|b1,b2');
    expect(isThreadRef(r)).toBe(true);
    expect(decodeThreadRef(['📚 『A』', r])).toEqual({ rootId: 'u1', scopeIds: ['b1', 'b2'] });
  });
  it('すべての本（相談相手なし）', () => {
    expect(encodeThreadRef('u1')).toBe('🧵 u1');
    expect(decodeThreadRef(['🧵 u1'])).toEqual({ rootId: 'u1', scopeIds: [] });
  });
  it('id が無い・おかしいときは残さない／読まない', () => {
    expect(encodeThreadRef('')).toBe('');
    expect(encodeThreadRef('a|b')).toBe('');
    expect(decodeThreadRef(['📚 『A』'])).toBeNull();
    expect(decodeThreadRef(null)).toBeNull();
  });
});

describe('threadRootOf（次の答えの目印に使う、会話のはじめ）', () => {
  it('会話がまだ無ければ、いま送った相談', () => {
    expect(threadRootOf([], 'u9')).toBe('u9');
  });
  it('会話の最初の相談', () => {
    expect(threadRootOf([U('u1', '1'), A('a1', '2'), U('u2', '3'), A('a2', '4')], 'u3')).toBe('u1');
  });
  it('続きを相談した会話は、元の会話のはじめ', () => {
    expect(threadRootOf([U('u5', '5'), A('a5', '6', ['🧵 u1'])], 'u7')).toBe('u1');
  });
  it('画面の上だけの行（メモが答える相談・書いている途中）は、はじめにしない', () => {
    expect(threadRootOf([{ id: 'memo-q-1', role: 'user', content: 'x', local: true }, U('u2', '3')], null)).toBe('u2');
  });
});

describe('groupConsults（過去の相談の一覧）', () => {
  it('目印の無い前の答えは、相談と答えの 1 組ずつ（新しい順）', () => {
    const g = groupConsults([U('u1', '1'), A('a1', '2'), U('u2', '3'), A('a2', '4')]);
    expect(g.map((x) => x.map((m) => m.id))).toEqual([['u2', 'a2'], ['u1', 'a1']]);
  });
  it('続きを相談しても、同じ会話は 1 つの相談にまとめる（二重にしない）', () => {
    const msgs = [
      U('u1', '01'), A('a1', '02', ['🧵 u1']),
      U('x1', '03'), A('x2', '04'),
      U('u2', '05'), A('a2', '06', ['🧵 u1']),
    ];
    const g = groupConsults(msgs);
    expect(g).toHaveLength(2);
    // 続きを相談した会話がいちばん上（いちばん新しいやりとり）
    expect(g[0].map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(g[1].map((m) => m.id)).toEqual(['x1', 'x2']);
  });
  it('画面の上だけのやりとりは入れない', () => {
    const g = groupConsults([U('u1', '1'), A('a1', '2'), { id: 'memo-q', role: 'user', local: true }], { skip: (m) => !!m.local });
    expect(g).toHaveLength(1);
  });
});

describe('threadScopeOf / threadTitleOf', () => {
  it('相談相手は、いちばん新しい答えの目印から', () => {
    expect(threadScopeOf([U('u1', '1'), A('a1', '2', ['🧵 u1|b1']), U('u2', '3'), A('a2', '4', ['🧵 u1|b1,b2'])])).toEqual(['b1', 'b2']);
    expect(threadScopeOf([U('u1', '1'), A('a1', '2')])).toEqual([]);
  });
  it('題は、はじめの相談を 18 字まで', () => {
    expect(threadTitleOf([U('u1', '1', '部下が報告をくれなくて困っています'), A('a1', '2')])).toBe('部下が報告をくれなくて困っています');
    expect(threadTitleOf([U('u1', '1', 'あいうえおかきくけこさしすせそたちつてと')])).toBe('あいうえおかきくけこさしすせそたちつ…');
  });
});

describe('lastConsultThread（相談例の「前に相談した「…」」の元）', () => {
  const conv = [
    U('u1', '01', '部下が報告をくれなくて困っています'), A('a1', '02', ['🧵 u1']),
    U('u2', '03', '会議の前'), A('a2', '04', ['🧵 u1']),
  ];
  it('最後の返事（「会議の前」）ではなく、会話のはじめの相談から', () => {
    const c = lastConsultThread(conv);
    expect(c.question).toBe('部下が報告をくれなくて困っています');
    expect(c.rootId).toBe('u1');
    expect(c.title).toBe('部下が報告をくれなくて困っています');
    // 押したときに開くのは会話の全体
    expect(c.group.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(c.answer).toContain('答え');
  });
  it('続きを相談した会話でも、元の会話のはじめ（いちばん新しく話した会話）', () => {
    const msgs = [U('x1', '00', '前の別の相談'), A('x2', '00b'), ...conv, U('u3', '05', '相手の反応'), A('a3', '06', ['🧵 u1'])];
    expect(lastConsultThread(msgs).question).toBe('部下が報告をくれなくて困っています');
  });
  it('書き終えた答えが無い会話は飛ばす・画面の上だけのやりとりは入れない', () => {
    const msgs = [U('x1', '00', '前の別の相談'), A('x2', '00b'), U('u9', '07', '書いている途中'), { id: 'a9', role: 'assistant', content: '', createdAt: '08', streaming: true, refs: [] }];
    expect(lastConsultThread(msgs, { isDone: (a) => !a.streaming }).question).toBe('前の別の相談');
    expect(lastConsultThread([{ id: 'memo-q', role: 'user', content: 'x', local: true }], { skip: (m) => !!m.local })).toBeNull();
  });
});
