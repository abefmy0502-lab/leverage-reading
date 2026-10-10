import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  normActionText, findAddedAction, wasAnswerActionAdded, rememberAnswerActionAdded, answerActionStatus,
} from './consultActionAdded';

describe('consultActionAdded', () => {
  const hadStorage = 'localStorage' in globalThis;
  const original = globalThis.localStorage;
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
  });
  afterAll(() => {
    if (hadStorage) globalThis.localStorage = original; else delete globalThis.localStorage;
  });

  it('空白・句点・全角の揺れを同じとみなす', () => {
    expect(normActionText('上司に 1 行で報告する。')).toBe(normActionText('上司に１行で報告する'));
  });

  it('同じ文の行動があれば追加済み', () => {
    const actions = [{ text: '別の行動', bookId: 'b1' }, { text: '朝に 5 分、メモを読み返す', bookId: 'b2' }];
    const found = findAddedAction(actions, '朝に5分、メモを読み返す。');
    expect(found?.bookId).toBe('b2');
    expect(findAddedAction(actions, '夜にメモを読み返す')).toBeNull();
  });

  it('切られて保存された長い一歩も同じとみなす', () => {
    const long = 'あ'.repeat(60);
    expect(findAddedAction([{ text: long.slice(0, 50) }], long)).toBeTruthy();
    // 短い文は頭が同じだけでは同じにしない
    expect(findAddedAction([{ text: '報告' }], '報告する')).toBeNull();
  });

  it('空の文・行動が無いときは追加済みにしない', () => {
    expect(findAddedAction([{ text: '' }], '')).toBeNull();
    expect(findAddedAction(null, '何か')).toBeNull();
  });

  it('この端末で足した答えの id を覚える', () => {
    expect(wasAnswerActionAdded('a1')).toBe(false);
    rememberAnswerActionAdded('a1');
    expect(wasAnswerActionAdded('a1')).toBe(true);
    expect(wasAnswerActionAdded('a2')).toBe(false);
  });

  it('文が直されていても、覚えた id（と足した文）なら追加済み', () => {
    rememberAnswerActionAdded('a9', '直した文');
    expect(answerActionStatus({ answerId: 'a9', actionText: '元の文', actions: [{ text: '直した文' }] }).added).toBe(true);
    const st = answerActionStatus({ answerId: 'zz', actionText: '直した文', actions: [{ text: '直した文', bookId: 'b' }] });
    expect(st.added).toBe(true);
    expect(st.action.bookId).toBe('b');
    expect(answerActionStatus({ answerId: 'zz', actionText: 'ほか', actions: [] }).added).toBe(false);
  });

  it('覚えた答えでも、その行動を消していたら追加済みにしない', () => {
    rememberAnswerActionAdded('d1', '朝に読み返す');
    expect(answerActionStatus({ answerId: 'd1', actionText: '朝に読み返す。', actions: [{ text: 'ほか' }] }).added).toBe(false);
    // もう一度足したら、また追加済み
    rememberAnswerActionAdded('d1', '朝に読み返す');
    expect(answerActionStatus({ answerId: 'd1', actionText: 'x', actions: [{ text: '朝に読み返す' }] }).added).toBe(true);
  });

  it('行動の一覧を読めないときだけ、覚えた印で判定する（前の版の印も）', () => {
    localStorage.setItem('orime.consult.actionAdded.v1', JSON.stringify(['old1']));
    expect(answerActionStatus({ answerId: 'old1', actionText: 'x', actions: null }).added).toBe(true);
    expect(answerActionStatus({ answerId: 'old1', actionText: 'x', actions: [] }).added).toBe(false);
  });
});
