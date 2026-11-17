// 🏷 本の追加のフォームの分野（lib/bookFieldsForm.js・2026-10-11）。
import { describe, it, expect } from 'vitest';
import { applyAutoFields, markFieldsWaiting, settleServerFields, FIELDS_WAIT_MS } from './bookFieldsForm';

const form = { id: 'f1', tags: [] };

describe('本の追加のフォームの分野', () => {
  it('サーバーを待つのは 8 秒まで', () => {
    expect(FIELDS_WAIT_MS).toBe(8000);
  });
  it('待っている間 → 答えが届いたら入れる', () => {
    const waiting = markFieldsWaiting(form, 'f1', true);
    expect(waiting).toMatchObject({ fieldsPending: true, fieldsFailed: false });
    const done = settleServerFields(waiting, 'f1', ['教養・その他', '生産性・伝える力']);
    expect(done).toMatchObject({ fieldsPending: false, fieldsFailed: false, fieldsAuto: true, fieldsAutoStage: 'info' });
    expect(done.tags).toEqual(['生産性・伝える力', '教養・その他']);
  });
  it('答えが無い・8 秒たった → 「自動では選べませんでした。」の印', () => {
    expect(settleServerFields(markFieldsWaiting(form, 'f1', true), 'f1', [])).toMatchObject({ fieldsPending: false, fieldsFailed: true });
    expect(markFieldsWaiting(markFieldsWaiting(form, 'f1', true), 'f1', false)).toMatchObject({ fieldsPending: false, fieldsFailed: true });
  });
  it('本人が選んだら、あとで届いたサーバーの答えで上書きしない', () => {
    const waiting = markFieldsWaiting(form, 'f1', true);
    const chosen = { ...waiting, tags: ['教養・その他'], fieldsTouched: true, fieldsAuto: false };
    expect(settleServerFields(chosen, 'f1', ['教養・その他'])).toBe(chosen);
    expect(applyAutoFields(chosen, 'f1', ['心理学・行動経済学'], 'info')).toBe(chosen);
    expect(markFieldsWaiting(chosen, 'f1', false)).toBe(chosen);
  });
  it('ほかの本のフォームには入れない・自動で選んだ分野は答えで置きかえる', () => {
    expect(settleServerFields(form, 'other', ['教養・その他'])).toBe(form);
    const auto = applyAutoFields(form, 'f1', ['数字・データ分析'], 'title');
    expect(settleServerFields(auto, 'f1', ['教養・その他']).tags).toEqual(['教養・その他']);
  });
});
