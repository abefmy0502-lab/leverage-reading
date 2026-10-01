// 🤝 AI に送る前の同意（App Store 審査ガイドライン 5.1.2(i)・2026-10-01 オーナー承認）。
//
// はじめて AI を使う操作（相談・AI 選書・読書計画シート・凝縮・まとめ・写真から書き起こし）のときに、
// 何を・どの会社へ送るかのシート（components/AiConsentSheet.jsx）を出し、「同意して使う」まで送らない。
// 「今はやめる」はその操作だけをやめる（何も送らない）。
//
// 関所は 2 段:
//   1. 各機能の入口（押したとき）で ensureAiConsent(purpose) — やめたら画面の状態を変えずに戻る
//   2. 送る直前（lib/ai.js の postClaude・lib/streamClaude.js）でもう一度 — 入口の付け忘れがあっても送らない
//      （src/lib/aiConsentGate.test.js が確かめる）
// サーバーは止めない（この版では。docs/ai-routing.md）。送るときに X-Orime-Ai-Consent: <版> を付ける（記録だけ）。
//
// 保存先: Supabase Auth の user_metadata.ai_consent = { version, at }（端末を変えても付いてくる）＋
// 端末の localStorage（速さのため・読み書きは try/catch）。取り消すと ai_consent: null（＋端末の分を消す）。
// どちらを信じるか（resolveAiConsent）: この起動中に決めたこと ＞ user_metadata（キーがあれば null も含めて）＞ 端末。
// 送り先が変わったら AI_CONSENT_VERSION を上げる（同意した人にも次に AI を使うときにもう一度確かめる）。

import { supabase, isSupabaseConfigured } from './supabase';
import { AI_CONSENT_VERSION, AI_CONSENT_EXEMPT_PURPOSES } from './aiProcessors';

export { AI_CONSENT_VERSION } from './aiProcessors';

export const AI_CONSENT_META_KEY = 'ai_consent';
export const AI_CONSENT_HEADER = 'X-Orime-Ai-Consent';
// シートを開く合図（components/AiConsentSheet.jsx の AiConsentGate が受ける）。
export const AI_CONSENT_REQUEST_EVENT = 'orime:ai-consent-request';
// 同意した・取り消した（設定の行が受けて表示を変える）。
export const AI_CONSENT_CHANGED_EVENT = 'orime:ai-consent-changed';

const LOCAL_PREFIX = 'orime-ai-consent:';

// ── 純粋関数（テストする） ────────────────────────────────────────

// 保存された値を { version, at } に整える。読めない値は null。
export function normalizeAiConsent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const version = Number(raw.version);
  const at = typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? raw.at : null;
  if (!Number.isInteger(version) || version < 1 || !at) return null;
  return { version, at };
}

// いまの版に同意しているか。
export function isAiConsentCurrent(record, version = AI_CONSENT_VERSION) {
  const r = normalizeAiConsent(record);
  return !!r && r.version >= version;
}

// この用途は同意が要るか（運営の参謀だけ要らない）。
export function isConsentExemptPurpose(purpose) {
  return AI_CONSENT_EXEMPT_PURPOSES.includes(purpose);
}

// 同意を確かめる必要があるか。
export function needsAiConsent({ purpose, record, version = AI_CONSENT_VERSION } = {}) {
  if (isConsentExemptPurpose(purpose)) return false;
  return !isAiConsentCurrent(record, version);
}

// どの記録を信じるか。
//   override: この起動中に同意した・取り消した（{ record } ・無ければ undefined）
//   metadata: user_metadata（ai_consent のキーがあれば、null＝取り消し・未同意も含めてこちら）
//   local:    端末に残した記録（user_metadata に書けなかったとき）
export function resolveAiConsent({ override, metadata, local } = {}) {
  if (override !== undefined) return normalizeAiConsent(override);
  if (metadata && typeof metadata === 'object' && Object.prototype.hasOwnProperty.call(metadata, AI_CONSENT_META_KEY)) {
    return normalizeAiConsent(metadata[AI_CONSENT_META_KEY]);
  }
  return normalizeAiConsent(local);
}

export function makeAiConsentRecord(now = new Date(), version = AI_CONSENT_VERSION) {
  return { version, at: now.toISOString() };
}

// ── 端末の記録 ────────────────────────────────────────────────────

function readLocal(userId) {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeLocal(userId, record) {
  if (!userId) return;
  try {
    if (record) window.localStorage.setItem(LOCAL_PREFIX + userId, JSON.stringify(record));
    else window.localStorage.removeItem(LOCAL_PREFIX + userId);
  } catch { /* 端末に残せなくても動く（user_metadata が本体） */ }
}

// この起動中に決めたこと（{ userId, record }）。user_metadata の書き込みが終わる前・失敗したときもこれを信じる。
let override = null;

async function currentUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch { return null; }
}

function notifyChanged(record) {
  try { window.dispatchEvent(new CustomEvent(AI_CONSENT_CHANGED_EVENT, { detail: { record } })); } catch { /* ignore */ }
}

// いまの同意（{ version, at } か null）。ログインしていなければ null。
export async function readAiConsent() {
  const user = await currentUser();
  if (!user) return null;
  return resolveAiConsent({
    override: override && override.userId === user.id ? override.record : undefined,
    metadata: user.user_metadata,
    local: readLocal(user.id),
  });
}

// いまの版に同意しているときだけ版の番号（送るときのヘッダー用）。無ければ null。
export async function currentAiConsentVersion() {
  const r = await readAiConsent();
  return isAiConsentCurrent(r) ? r.version : null;
}

// 同意する。端末とこの起動中にはすぐ効き、user_metadata には後ろで書く（書けなくてもこの端末では同意のまま）。
export async function grantAiConsent(now = new Date()) {
  const user = await currentUser();
  if (!user) return null;
  const record = makeAiConsentRecord(now);
  override = { userId: user.id, record };
  writeLocal(user.id, record);
  notifyChanged(record);
  try {
    const { error } = await supabase.auth.updateUser({ data: { [AI_CONSENT_META_KEY]: record } });
    if (error) console.warn('[ai-consent] could not save to account:', error.message);
  } catch (e) {
    console.warn('[ai-consent] could not save to account:', e?.message);
  }
  return record;
}

// 取り消す（user_metadata と端末の両方）。アカウントに書けなかったら元に戻して false（取り消したつもりで残らないように）。
export async function withdrawAiConsent() {
  const user = await currentUser();
  if (!user) return false;
  const prevOverride = override;
  const prevLocal = readLocal(user.id);
  override = { userId: user.id, record: null };
  writeLocal(user.id, null);
  try {
    const { error } = await supabase.auth.updateUser({ data: { [AI_CONSENT_META_KEY]: null } });
    if (error) throw error;
  } catch (e) {
    console.warn('[ai-consent] could not withdraw:', e?.message);
    override = prevOverride;
    writeLocal(user.id, prevLocal);
    return false;
  }
  notifyChanged(null);
  return true;
}

// ── シートを開いて答えを待つ ─────────────────────────────────────

// 同時に何か所から聞かれても、シートは 1 つ・答えは同じ（2 枚重ねない）。
let pending = null;

// シートを開いて答え（true＝同意して使う／false＝今はやめる）を待つ。
// 受け手（AiConsentGate）がいないとき（ログイン前など）は送らない側（false）。
export function requestAiConsent({ purpose = null, mode = 'ask' } = {}) {
  if (pending) return pending;
  let settle;
  const p = new Promise((resolve) => { settle = resolve; });
  const detail = {
    purpose,
    mode,
    handled: false,
    resolve: (ok) => { if (pending === p) pending = null; settle(!!ok); },
  };
  pending = p;
  try { window.dispatchEvent(new CustomEvent(AI_CONSENT_REQUEST_EVENT, { detail })); } catch { /* ignore */ }
  if (!detail.handled) detail.resolve(false);
  return p;
}

// AI に送ってよいか。同意済み・同意の要らない用途なら true。まだならシートを出して答えを待つ。
export async function ensureAiConsent(purpose) {
  if (isConsentExemptPurpose(purpose)) return true;
  if (isAiConsentCurrent(await readAiConsent())) return true;
  return requestAiConsent({ purpose });
}

// 送る直前の関所で「やめた」ときに投げる（呼び出し側は案内を重ねない）。
export const AI_CONSENT_DECLINED_TEXT = 'AI への送信をやめました。';
export function aiConsentDeclinedError() {
  const err = new Error(AI_CONSENT_DECLINED_TEXT);
  err.consentDeclined = true;
  err.notice = true; // エラーの見た目にしない
  err.notCharged = true;
  return err;
}

// テスト用: この起動中の記録を消す。
export function __resetAiConsentForTest() {
  override = null;
  pending = null;
}

// 送る直前の関所（lib/ai.js の postClaude・lib/streamClaude.js が呼ぶ）。
// { ok: false } ＝送らない。{ ok: true, version } ＝送ってよい（version はヘッダーに付ける版・同意の要らない用途は null のこともある）。
export async function checkAiConsentForSend(purpose) {
  const ok = await ensureAiConsent(purpose);
  if (!ok) return { ok: false, version: null };
  return { ok: true, version: await currentAiConsentVersion() };
}
