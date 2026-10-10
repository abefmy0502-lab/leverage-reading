// 🏷 本の分野を自動で付ける印（lib/bookFieldsAuto.js・2026-10-11）。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  readFieldStages, markFieldStage, canAutoFill, isMigrated, setMigrated, backupLegacyTags, isAutoChosen, canRefine, readRefined, markRefined,
  planTaxonomyChange, accountMarksWith, applyAccountMarks, shortBookId, ACCOUNT_MARKS_MAX,
} from './bookFieldsAuto';

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
  it('前の一覧（v1）の印は「本人が選んだ」だけ引き継ぐ（新しい一覧でもう一度確かめる）', () => {
    localStorage.setItem('orime.fields.stage.v1:u', JSON.stringify({ a: 'title', b: 'info', c: 'user' }));
    expect(readFieldStages('u')).toEqual({ c: 'user' });
    markFieldStage('u', 'a', 'title');
    expect(readFieldStages('u')).toEqual({ c: 'user', a: 'title' });
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
    backupLegacyTags('u', 'a', ['リーダー・チーム']);
    expect(JSON.parse(localStorage.getItem('orime.fields.legacy.v1:u'))).toEqual({ a: ['読書術', 'マネジメント'] });
  });
  it('localStorage が使えなくても壊れない', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readFieldStages('u')).toEqual({});
    expect(() => markFieldStage('u', 'a', 'title')).not.toThrow();
    expect(isMigrated('u')).toBe(false);
  });
});

describe('紹介文・ジャンルで決め直してよい本（2026-10-11 の 2 回目）', () => {
  it('本人が選んだ本・前の版のタグから移した分野（印の無い分野）は変えない', () => {
    markFieldStage('u', 'auto', 'title');
    markFieldStage('u', 'mine', 'user');
    const st = readFieldStages('u');
    expect(canRefine('u', st, {}, { id: 'auto' }, true)).toBe(true);
    expect(canRefine('u', st, {}, { id: 'mine' }, true)).toBe(false);
    expect(canRefine('u', st, {}, { id: 'legacy' }, true)).toBe(false);
    expect(canRefine('u', st, {}, { id: 'empty' }, false)).toBe(true);
  });
  it('前の一覧の印（v1）で自動だった本も自動とみなす・1 冊 1 回', () => {
    localStorage.setItem('orime.fields.stage.v1:u', JSON.stringify({ old: 'info', me: 'user' }));
    const st = readFieldStages('u');
    expect(isAutoChosen('u', st, 'old')).toBe(true);
    expect(isAutoChosen('u', st, 'me')).toBe(false);
    markRefined('u', 'old');
    expect(canRefine('u', st, readRefined('u'), { id: 'old' }, true)).toBe(false);
  });
});

describe('分野の裏の保存（2026-10-10 監査）', () => {
  it('消す・足すは DB の行と base の差で決める（その間に本人が足した・外したタグを戻さない）', () => {
    // 呼び出し側は [小説・物語, 会社の本] を見て、分野を 歴史 に替えたい。その間に本人が「積読候補」を足し、「会社の本」を外していた
    const p = planTaxonomyChange({ have: ['小説・物語', '積読候補'], next: ['歴史', '会社の本'], base: ['小説・物語', '会社の本'] });
    expect(p.toAdd).toEqual(['歴史']);
    expect(p.toRemove).toEqual(['小説・物語']);
    expect(p.final).toEqual(['積読候補', '歴史']);
    // base が無いときは今までどおり next に合わせる
    expect(planTaxonomyChange({ have: ['a', 'b'], next: ['b', 'c'] })).toEqual({ toAdd: ['c'], toRemove: ['a'], final: ['b', 'c'] });
  });
  it('本人が選んだ印をアカウントに（短い id・重ねない・上限）・どの端末でも端末の印へ写す', () => {
    const id = '0123abcd-4567-4890-8abc-def012345678';
    expect(shortBookId(id)).toBe('0123abcd4567');
    const l1 = accountMarksWith([], id);
    expect(l1).toEqual(['0123abcd4567']);
    expect(accountMarksWith(l1, id)).toBe(null);
    const many = Array.from({ length: ACCOUNT_MARKS_MAX }, (_, i) => i.toString(16).padStart(12, '0'));
    const l2 = accountMarksWith(many, id);
    expect(l2).toHaveLength(ACCOUNT_MARKS_MAX);
    expect(l2[l2.length - 1]).toBe('0123abcd4567');
    markFieldStage('u1', id, 'info');
    expect(applyAccountMarks('u1', l1, [{ id }, { id: 'ffffffff-0000-4000-8000-000000000000' }])).toBe(1);
    expect(readFieldStages('u1')[id]).toBe('user');
    expect(canRefine('u1', readFieldStages('u1'), {}, { id }, true)).toBe(false);
  });
  it('App: 分野の裏の保存は本の保存と同じ順番待ちに乗り、編集中の本には書かない', () => {
    const src = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf('const saveTaxonomy = useCallback'), src.indexOf('const fieldsAccountMarks'));
    expect(block).toContain('enqueueBookMutation(bookId');
    expect(block).toContain('editingBookIdRef.current === bookId');
    expect(src).toContain('bookFieldsAuto.markUserChosen(saved.id)');
  });
});
