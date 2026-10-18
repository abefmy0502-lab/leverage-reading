// 🎯 Orime を入れた理由（2026-10-18 オーナー「読書にも目的が要る。その世界観を最初に出したい・離れる率を下げたい」）。
//
// はじめての画面（初回ガイドの 2 枚目・必ず書く）で聞き、設定の「Orime を入れた理由」で見返し・書き直せる。
// 解約（プランを管理）と退会の前に「目的は達成できましたか？」で一度だけ見せる（止めない・どちらを押しても先へ進む）。
// 相談の材料には使わない（2026-10-18 オーナー裁定）。
//
// 保存先: Supabase Auth の user_metadata.app_purpose = { text, at }（端末を変えても付いてくる・SQL なし）＋
// 端末の localStorage（利用者ごと・アカウントに書けなかったとき・読み書きは try/catch）。
// 信じる順: この起動中に書いたこと ＞ user_metadata（キーがあれば）＞ 端末。

import { supabase, isSupabaseConfigured } from './supabase';

export const APP_PURPOSE_META_KEY = 'app_purpose';
export const APP_PURPOSE_MAX = 80;
export const APP_PURPOSE_CHANGED_EVENT = 'orime:app-purpose-changed';
const LOCAL_KEY = 'orime.appPurpose.v1';

// 押すと欄に入る、よくある理由（本人の口から出そうな言い切り・押したあと自分の言葉に直せる）。
export const APP_PURPOSE_CHOICES = [
  // 並びは幅で決めた（スマホの幅で 2・2・1 の 3 行に収まる）。計測の c1〜c5 はこの順。
  '本を仕事に生かしたい',
  '考えを深めたい',
  '読んだことを忘れない',
  '読書を習慣にしたい',
  '悩みを本で解決したい',
];

export function cleanPurposeText(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, APP_PURPOSE_MAX);
}

export function normalizeAppPurpose(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = cleanPurposeText(raw.text);
  const at = typeof raw.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? raw.at : null;
  if (!text || !at) return null;
  return { text, at };
}

export function resolveAppPurpose({ override, metadata, local } = {}) {
  if (override !== undefined) return normalizeAppPurpose(override);
  if (metadata && typeof metadata === 'object' && Object.prototype.hasOwnProperty.call(metadata, APP_PURPOSE_META_KEY)) {
    return normalizeAppPurpose(metadata[APP_PURPOSE_META_KEY]);
  }
  return normalizeAppPurpose(local);
}

function readLocal(userId) {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(`${LOCAL_KEY}:${userId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeLocal(userId, record) {
  if (!userId) return;
  try {
    if (record) window.localStorage.setItem(`${LOCAL_KEY}:${userId}`, JSON.stringify(record));
    else window.localStorage.removeItem(`${LOCAL_KEY}:${userId}`);
  } catch { /* 端末に残せなくても動く */ }
}

// この起動中に書いたこと（{ userId, record }）。
let override = null;

async function currentUser() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user || null;
  } catch { return null; }
}

// いまの理由（{ text, at } か null）。
export async function readAppPurpose() {
  const user = await currentUser();
  if (!user) return null;
  return resolveAppPurpose({
    override: override && override.userId === user.id ? override.record : undefined,
    metadata: user.user_metadata,
    local: readLocal(user.id),
  });
}

// 書く（空なら null を返して何もしない）。端末とこの起動中にはすぐ効き、アカウントにも書く。
// 返すのは { record, synced }（synced=false＝アカウントに書けなかった＝この端末にだけ残った）。
export async function saveAppPurpose(text, now = new Date()) {
  const clean = cleanPurposeText(text);
  if (!clean) return null;
  const user = await currentUser();
  if (!user) return null;
  const record = { text: clean, at: now.toISOString() };
  override = { userId: user.id, record };
  writeLocal(user.id, record);
  try { window.dispatchEvent(new CustomEvent(APP_PURPOSE_CHANGED_EVENT, { detail: { record } })); } catch { /* ignore */ }
  let synced = true;
  try {
    const { error } = await supabase.auth.updateUser({ data: { [APP_PURPOSE_META_KEY]: record } });
    if (error) { synced = false; console.warn('[app-purpose] could not save to account:', error.message); }
  } catch (e) {
    synced = false;
    console.warn('[app-purpose] could not save to account:', e?.message);
  }
  return { record, synced };
}

// テスト用
export function __resetAppPurposeForTest() { override = null; }
