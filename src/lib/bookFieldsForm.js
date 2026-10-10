// 🏷 本の追加のフォームの分野（App.jsx の本を追加するフォーム・2026-10-11）。
//
// 端末の言葉の仕分け → サーバーの見立て（検索で選んだ本）の順に、自動の分野を入れる。
// 本人が分野を選んだら（fieldsTouched）、あとで届いた答えでは上書きしない。サーバーを待つのは FIELDS_WAIT_MS まで
// （過ぎたら「自動では選べませんでした。」に切り替え、あとから答えが届いて、まだ本人が触っていなければ入れる）。
import { fieldsOf, withFields } from './bookFields';

export const FIELDS_WAIT_MS = 8000;

/** 自動の分野を入れる（本人が選んだ・本人か前の画面で選んだ分野があるときはそのまま）。 */
export function applyAutoFields(f, formId, auto, stage) {
  if (!f || f.id !== formId || f.fieldsTouched) return f;
  if (fieldsOf(f).length && !f.fieldsAuto) return f;
  if (!auto.length && !fieldsOf(f).length) return f;
  return { ...f, tags: withFields(f.tags, auto), fieldsAuto: auto.length > 0, fieldsAutoStage: stage };
}

/** サーバーを待っている・待ち終えた印（本人が選んだあとは触らない）。 */
export function markFieldsWaiting(f, formId, waiting) {
  if (!f || f.id !== formId || f.fieldsTouched) return f;
  if (waiting) return { ...f, fieldsPending: true, fieldsFailed: false };
  return { ...f, fieldsPending: false, fieldsFailed: !fieldsOf(f).length };
}

/** サーバーの答えを入れる（届いた答え・本人が選んでいれば何もしない）。 */
export function settleServerFields(f, formId, serverFields) {
  if (!f || f.id !== formId || f.fieldsTouched) return f;
  const withAnswer = serverFields?.length ? applyAutoFields(f, formId, serverFields, 'info') : f;
  return { ...withAnswer, fieldsPending: false, fieldsFailed: !fieldsOf(withAnswer).length };
}
