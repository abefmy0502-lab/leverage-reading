// 🏷 本の分野を自動で付ける印（lib/bookFieldsAuto.js・2026-10-11）。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFieldStages, markFieldStage, canAutoFill, isMigrated, setMigrated, backupLegacyTags } from './bookFieldsAuto';

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

beforeEach(() => { globalThis.localStorage = memStore(); });

describe('自動で付けてよいか', () => {
  it('まだ何も決めていない本は書名から・紹介文からも付けてよい', () => {
    expect(canAutoFill({}, { id: 'a' })).toBe(true);
    expect(canAutoFill({}, { id: 'a' }, { withInfo: true })).toBe(true);
  });
  it('書名から決めた本は、紹介文が届いたらもう一度だけ', () => {
    markFieldStage('u', 'a', 'title');
    const st = readFieldStages('u');
    expect(canAutoFill(st, { id: 'a' })).toBe(false);
    expect(canAutoFill(st, { id: 'a' }, { withInfo: true })).toBe(true);
    markFieldStage('u', 'a', 'info');
    expect(canAutoFill(readFieldStages('u'), { id: 'a' }, { withInfo: true })).toBe(false);
  });
  it('本人が選んだ本には自動で付けない・弱い印で上書きしない', () => {
    markFieldStage('u', 'b', 'user');
    markFieldStage('u', 'b', 'title');
    const st = readFieldStages('u');
    expect(st.b).toBe('user');
    expect(canAutoFill(st, { id: 'b' }, { withInfo: true })).toBe(false);
  });
  it('アカウントごとに分ける', () => {
    markFieldStage('u1', 'a', 'user');
    expect(readFieldStages('u2')).toEqual({});
  });
});

describe('移し替えの印と控え', () => {
  it('移し終えた印', () => {
    expect(isMigrated('u')).toBe(false);
    setMigrated('u');
    expect(isMigrated('u')).toBe(true);
  });
  it('移す前のタグの控えは最初の 1 回だけ（上書きしない）', () => {
    backupLegacyTags('u', 'a', ['読書術', 'マネジメント']);
    backupLegacyTags('u', 'a', ['人を育てる']);
    expect(JSON.parse(localStorage.getItem('orime.fields.legacy.v1:u'))).toEqual({ a: ['読書術', 'マネジメント'] });
  });
  it('localStorage が使えなくても壊れない', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readFieldStages('u')).toEqual({});
    expect(() => markFieldStage('u', 'a', 'title')).not.toThrow();
    expect(isMigrated('u')).toBe(false);
  });
});
