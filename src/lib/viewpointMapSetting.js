// 🗺 視点の地図を使うかどうか（2026-10-08・lib/viewpointMap.js）。
//
// 保存先: Supabase Auth の user_metadata.viewpoint_map = { on, at }（端末を変えても付いてくる・新しい SQL は要らない）
// ＋端末の localStorage（速さのため・読み書きは try/catch）。アカウントに書けなくても、この端末では選んだとおりに動く。
// どれを信じるか: この起動中に選んだこと ＞ user_metadata と端末の新しいほう（at）＞ 端末。既定は使わない。
// やめてもメモに付けたタグは消さない（タグは自分のもの）。

import { supabase, isSupabaseConfigured } from './supabase';

export const VIEWPOINT_META_KEY = 'viewpoint_map';
const LOCAL_PREFIX = 'orime.viewmap:';

export function normalizeViewpointSetting(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.on !== 'boolean') return null;
  return { on: raw.on, at: typeof raw.at === 'string' ? raw.at : null };
}

// 使っているか（true / false）。
// アカウントと端末の両方にあるときは、選んだ時刻（at）の新しいほう（アカウントに書けずに端末だけ変えた選び方を、
// 次に開いたときに古いアカウントの値で戻さない・2026-10-10）。時刻が比べられなければアカウント。
export function resolveViewpointOn({ override, metadata, local } = {}) {
  if (override !== undefined) return !!normalizeViewpointSetting(override)?.on;
  const loc = normalizeViewpointSetting(local);
  if (metadata && typeof metadata === 'object' && Object.prototype.hasOwnProperty.call(metadata, VIEWPOINT_META_KEY)) {
    const acc = normalizeViewpointSetting(metadata[VIEWPOINT_META_KEY]);
    const accAt = Date.parse(acc?.at || '');
    const locAt = Date.parse(loc?.at || '');
    if (loc && acc && Number.isFinite(locAt) && Number.isFinite(accAt) && locAt > accAt) return !!loc.on;
    return !!acc?.on;
  }
  return !!loc?.on;
}

function readLocal(userId) {
  if (!userId) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeLocal(userId, record) {
  if (!userId) return;
  try { window.localStorage.setItem(LOCAL_PREFIX + userId, JSON.stringify(record)); } catch { /* 端末に残せなくても動く */ }
}

let override = null; // { userId, record }
const listeners = new Set();

export function subscribeViewpointSetting(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function readViewpointOn(user) {
  if (!user?.id) return false;
  return resolveViewpointOn({
    override: override && override.userId === user.id ? override.record : undefined,
    metadata: user.user_metadata,
    local: readLocal(user.id),
  });
}

// 使う／やめる。この起動中と端末にはすぐ効き、アカウントにも書く。
// 戻り値: 'saved'（アカウントにも保存）／'local'（アカウントに書けず、この端末だけ）／false（ログインしていない）。
export async function setViewpointOn(user, on, now = new Date()) {
  if (!user?.id) return false;
  const record = { on: !!on, at: now.toISOString() };
  override = { userId: user.id, record };
  writeLocal(user.id, record);
  listeners.forEach((cb) => { try { cb(record); } catch { /* ignore */ } });
  if (!isSupabaseConfigured) return 'local';
  try {
    const { error } = await supabase.auth.updateUser({ data: { [VIEWPOINT_META_KEY]: record } });
    if (error) { console.warn('[viewpoint-map] could not save to account:', error.message); return 'local'; }
  } catch (e) {
    console.warn('[viewpoint-map] could not save to account:', e?.message);
    return 'local';
  }
  return 'saved';
}

// テスト用
export function __resetViewpointSetting() { override = null; listeners.clear(); }
