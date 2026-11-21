// 👤 プロフィール（2026-11-21 オーナー「ニックネームと好きな本とその本のおすすめの 1 行」）。
//   保存先は profiles（supabase_profiles.sql・本人だけ）。表がまだ無い・つながらないときは端末に控える
//   （orime.profile.v1:<利用者>・ほかの端末には出ない・公開のページにも出ない）。
//   公開のページは本人が「公開する」をオンにしたときだけ（SITE_URL/u/<public_id>・api/_profilePage.js）。
//   public_id は本人が選ばない無作為の英小文字と数字 10 字（名前の取り合い・なりすましを防ぐ）。
import { supabase, isSupabaseConfigured } from './supabase';
import { SITE_URL } from './legalLinks';
import { cleanAvatarId } from './avatars';

export const PROFILE_LIMITS = { nickname: 20, title: 120, author: 80, line: 80, bio: 160, hidden: 2000 };
const KEY = (uid) => `orime.profile.v1:${uid || 'anon'}`;
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789'; // 見分けにくい l・o・0・1 を除く

export const EMPTY_PROFILE = Object.freeze({
  publicId: '', nickname: '', favTitle: '', favAuthor: '', favIsbn: '', favCover: '', favLine: '', isPublic: false, hidden: false,
  bio: '', shelfPublic: false, shelfHidden: Object.freeze([]), avatar: '',
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 自己紹介は改行を 2 つまで残す（ほかの欄は 1 行）。
const cleanBio = (v) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ')
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{2,}/g, '\n').trim().slice(0, PROFILE_LIMITS.bio);

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** 画面の値を保存できる形に（長さ・改行・表紙は https だけ・ISBN は数字だけ）。 */
export function normalizeProfile(p = {}) {
  const cover = String(p.favCover || '').trim();
  return {
    publicId: /^[a-z0-9]{10}$/.test(String(p.publicId || '')) ? p.publicId : '',
    nickname: clean(p.nickname, PROFILE_LIMITS.nickname),
    favTitle: clean(p.favTitle, PROFILE_LIMITS.title),
    favAuthor: clean(p.favAuthor, PROFILE_LIMITS.author),
    favIsbn: String(p.favIsbn || '').replace(/[^0-9Xx]/g, '').slice(0, 13),
    favCover: /^https:\/\//.test(cover) && cover.length <= 500 ? cover : '',
    favLine: clean(p.favLine, PROFILE_LIMITS.line),
    isPublic: !!p.isPublic,
    hidden: !!p.hidden,
    bio: cleanBio(p.bio),
    shelfPublic: !!p.shelfPublic,
    avatar: cleanAvatarId(p.avatar),
    shelfHidden: [...new Set((Array.isArray(p.shelfHidden) ? p.shelfHidden : []).map(String).filter((id) => UUID_RE.test(id)))].slice(0, PROFILE_LIMITS.hidden),
  };
}

/** 中身があるか（ニックネームか好きな本）。 */
export function hasProfile(p) {
  return !!(p && (String(p.nickname || '').trim() || String(p.favTitle || '').trim()));
}

export function newPublicId(rand = () => {
  const a = new Uint8Array(10);
  (globalThis.crypto || {}).getRandomValues?.(a);
  return a;
}) {
  const bytes = rand();
  let s = '';
  for (let i = 0; i < 10; i += 1) s += ID_CHARS[(bytes[i] ?? Math.floor(Math.random() * 256)) % ID_CHARS.length];
  return s;
}

export function profileUrl(publicId) {
  return publicId ? `${SITE_URL}/u/${publicId}` : '';
}

const fromRow = (r) => normalizeProfile({
  publicId: r.public_id, nickname: r.nickname, favTitle: r.fav_title, favAuthor: r.fav_author, favIsbn: r.fav_isbn,
  favCover: r.fav_cover, favLine: r.fav_line, isPublic: r.is_public, hidden: r.hidden,
  bio: r.bio, shelfPublic: r.shelf_public, shelfHidden: r.shelf_hidden, avatar: r.avatar,
});
const toRow = (p) => ({
  public_id: p.publicId, nickname: p.nickname, fav_title: p.favTitle, fav_author: p.favAuthor, fav_isbn: p.favIsbn,
  fav_cover: p.favCover, fav_line: p.favLine, is_public: p.isPublic,
  bio: p.bio, shelf_public: p.shelfPublic, shelf_hidden: p.shelfHidden, avatar: p.avatar,
});
// 本棚の公開の列（bio・shelf_*）がまだ無い DB（前の版の SQL だけ流した）では、その 3 つを外して読み書きする。
const BASE_COLS = 'public_id, nickname, fav_title, fav_author, fav_isbn, fav_cover, fav_line, is_public, hidden';
const FULL_COLS = `${BASE_COLS}, bio, shelf_public, shelf_hidden, avatar`;
const isMissingColumn = (e) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /(bio|shelf_public|shelf_hidden|avatar)/.test(String(e.message || '')));
const baseRow = (row) => { const { bio, shelf_public, shelf_hidden, avatar, ...rest } = row; return rest; };

const isMissingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /profiles/.test(String(e.message || '')) && /(does not exist|schema cache)/.test(String(e.message || '')));

function readLocal(uid) {
  try { const v = JSON.parse(globalThis.localStorage?.getItem(KEY(uid)) || 'null'); return v ? normalizeProfile(v) : null; } catch { return null; }
}
function writeLocal(uid, p) {
  try { globalThis.localStorage?.setItem(KEY(uid), JSON.stringify(p)); } catch { /* 控えられないだけ */ }
}
export function clearLocalProfile(uid) {
  try { globalThis.localStorage?.removeItem(KEY(uid)); } catch { /* 無ければよい */ }
}

/** 読む。{ profile, stored: 'server'|'local'|'none' } */
export async function loadProfile(uid, { client = supabase } = {}) {
  if (uid && isSupabaseConfigured && client) {
    try {
      let { data, error } = await client.from('profiles').select(FULL_COLS).eq('user_id', uid).maybeSingle();
      if (error && isMissingColumn(error)) ({ data, error } = await client.from('profiles').select(BASE_COLS).eq('user_id', uid).maybeSingle());
      if (!error && data) return { profile: fromRow(data), stored: 'server' };
      if (!error && !data) {
        const local = readLocal(uid);
        return local ? { profile: local, stored: 'local' } : { profile: { ...EMPTY_PROFILE }, stored: 'none' };
      }
      if (!isMissingTable(error)) throw error;
    } catch (e) {
      if (!isMissingTable(e)) {
        const local = readLocal(uid);
        if (local) return { profile: local, stored: 'local' };
        throw e;
      }
    }
  }
  const local = readLocal(uid);
  return local ? { profile: local, stored: 'local' } : { profile: { ...EMPTY_PROFILE }, stored: 'none' };
}

/**
 * 保存する（無ければ public_id を作る）。表が無ければ端末に控える＝公開はできない。
 * 戻り値 { profile, stored: 'server'|'local' }。つながらないなど、それ以外の失敗は投げる。
 */
export async function saveProfile(uid, input, { client = supabase } = {}) {
  const p = normalizeProfile(input);
  if (!p.publicId) p.publicId = newPublicId();
  if (uid && isSupabaseConfigured && client) {
    const row = { user_id: uid, ...toRow(p) };
    let { data, error } = await client.from('profiles').upsert(row, { onConflict: 'user_id' }).select(FULL_COLS).maybeSingle();
    if (error && isMissingColumn(error)) {
      ({ data, error } = await client.from('profiles').upsert(baseRow(row), { onConflict: 'user_id' }).select(BASE_COLS).maybeSingle());
      if (!error) {
        const saved = { ...(data ? fromRow(data) : p), bio: p.bio, shelfPublic: false, shelfHidden: p.shelfHidden, avatar: p.avatar };
        writeLocal(uid, saved);
        return { profile: saved, stored: 'server', shelfReady: false };
      }
    }
    if (!error) {
      const saved = data ? fromRow(data) : p;
      writeLocal(uid, saved);
      return { profile: saved, stored: 'server', shelfReady: true };
    }
    if (!isMissingTable(error)) throw error;
  }
  const local = { ...p, isPublic: false, shelfPublic: false };
  writeLocal(uid, local);
  return { profile: local, stored: 'local' };
}

/** 退会・初期化で消す。 */
export async function deleteProfile(uid, { client = supabase } = {}) {
  clearLocalProfile(uid);
  if (!uid || !isSupabaseConfigured || !client) return;
  const { error } = await client.from('profiles').delete().eq('user_id', uid);
  if (error && !isMissingTable(error)) throw error;
}

/** 好きな本が変わったか（本棚に入れる・メモに残すのは変わったときだけ）。 */
export function favoriteChanged(before, after) {
  const k = (p) => `${String(p?.favIsbn || '')}|${String(p?.favTitle || '').trim()}|${String(p?.favLine || '').trim()}`;
  return !!String(after?.favTitle || '').trim() && k(before) !== k(after);
}

/** 相談で呼びかけるときの名前（「ふみさん」）。無ければ ''。 */
export function addressName(p) {
  const n = String(p?.nickname || '').trim();
  if (!n) return '';
  return /(さん|様|さま|くん|ちゃん)$/.test(n) ? n : `${n}さん`;
}

/** 公開の本棚に出すか（本人が本棚も公開していて、その本を外していない）。 */
export function shelfShows(profile, bookId) {
  return !!(profile?.isPublic && profile?.shelfPublic) && !(profile.shelfHidden || []).includes(String(bookId));
}

/** その本を公開の本棚から外す／戻す（新しいプロフィールを返す）。 */
export function withShelfHidden(profile, bookId, hide) {
  const id = String(bookId);
  const list = (profile?.shelfHidden || []).filter((x) => x !== id);
  return normalizeProfile({ ...profile, shelfHidden: hide ? [...list, id] : list });
}
