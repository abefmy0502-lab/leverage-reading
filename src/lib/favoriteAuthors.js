// ✍️ お気に入りの著者（2026-11-25 オーナー「著者をお気に入り登録できるようにして・新作が出たらおすすめする」）。
//   本の詳細の著者の名前を押す → 著者のシート（AuthorSheet）で「お気に入りに入れる」→ その著者の本を新しい順に見られる。
//   お気に入りに入れた日より後に出る本（これから出る予約の本も）があれば、ホームに 1 行「〈著者〉さんの新しい本」。
//   AI は使わない。著者の本は書店（楽天）の著者検索＝/api/cover?author_books=（api/_authorBooks.js）。
//   保存は favorite_authors（supabase_favorite_authors.sql・未適用なら端末だけ）。著者の本は端末に 1 日覚える。
import { supabase, isSupabaseConfigured } from './supabase';
import { apiUrl } from './apiUrl';
import { appNow } from './appNow';

export const FAV_AUTHORS_MAX = 50;
export const FAV_AUTHORS_CHANGED_EVENT = 'orime:fav-authors-changed';
const DISMISSED_MAX = 200;
const BOOKS_TTL_MS = 24 * 60 * 60 * 1000;
// 1 回に確かめる著者の数（開くたびに少しずつ・楽天の回数を使いすぎない）。
export const CHECKS_PER_RUN = 5;
// 発売から何日までを「新しい本」として知らせるか（お気に入りに入れた日より後でも、古い知らせは出さない）。
export const NEW_BOOK_DAYS = 120;

const clip = (s, n) => String(s ?? '').normalize('NFKC').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** 名前を比べるための形（空白・中黒を除く・小文字）。 */
export function authorKey(name) {
  return clip(name, 80).toLowerCase().replace(/[\s・･.．=＝]/g, '');
}

/**
 * 本の著者の欄（「稲盛和夫」「楠木建、杉浦泰」「A ほか」「山田太郎 著 / 鈴木花子 訳」）→ 人の名前の配列（5 人まで）。
 * 「著」「訳」「編」「監修」などの役割と（）の中は外す。
 */
export function splitAuthorNames(raw) {
  const s = clip(raw, 300);
  if (!s) return [];
  const out = [];
  const seen = new Set();
  for (let part of s.split(/\s*[、,，/／;；&＆]\s*|\s+と\s+/)) {
    part = part
      .replace(/[（(][^）)]*[）)]/g, '')
      // 1 字の役割（著・訳・作 …）は空白のあとだけ外す（「鈴木健作」の「作」は名前・2026-11-26 点検）。
      .replace(/\s*(?:ほか|監修|監訳|編著|共著|原作|写真|著者)\s*$/u, '')
      .replace(/\s+(?:他|等|著|訳|編|作|文|絵|画)\s*$/u, '')
      .replace(/\s*(?:ほか|他)\s*\d*\s*名?$/u, '')
      .trim();
    const k = authorKey(part);
    if (!part || k.length < 2 || seen.has(k)) continue;
    seen.add(k);
    out.push(part);
    if (out.length >= 5) break;
  }
  return out;
}

// ---- 保存（favorite_authors・未適用なら端末だけ） ----------------------------------------
//   { key, name, createdAt, dismissed: [isbn…] }
const LS_KEY = 'orime.favAuthors.v1';
const lsKey = (uid) => `${LS_KEY}:${uid || 'anon'}`;
function readLocal(uid) {
  try {
    const v = JSON.parse(window.localStorage.getItem(lsKey(uid)) || '[]');
    return Array.isArray(v) ? v.filter((a) => a && a.key && a.name) : [];
  } catch { return []; }
}
function writeLocal(uid, list) {
  try { window.localStorage.setItem(lsKey(uid), JSON.stringify(list.slice(0, FAV_AUTHORS_MAX))); } catch { /* 端末に残せなくても動く */ }
}
const isMissingTable = (err) => {
  const m = String(err?.message || err?.code || '').toLowerCase();
  return m.includes('favorite_authors') || m.includes('does not exist') || m.includes('pgrst205') || m.includes('42p01') || m.includes('schema cache');
};
function notify() {
  try { window.dispatchEvent(new CustomEvent(FAV_AUTHORS_CHANGED_EVENT)); } catch { /* ignore */ }
}
const fromRow = (r) => ({ key: r.name_key, name: r.name, createdAt: r.created_at, dismissed: Array.isArray(r.dismissed_isbns) ? r.dismissed_isbns : [] });

/** 端末に控えたお気に入り（同期で読む・最初の描画用）。 */
export function localFavoriteAuthors(userId) {
  return userId ? readLocal(userId) : [];
}

export async function loadFavoriteAuthors(userId) {
  const local = readLocal(userId);
  if (!userId || !isSupabaseConfigured) return local;
  try {
    const { data, error } = await supabase.from('favorite_authors').select('name_key, name, dismissed_isbns, created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    const list = (data || []).map(fromRow);
    writeLocal(userId, list);
    return list;
  } catch (e) {
    if (!isMissingTable(e)) console.warn('[fav-authors] load failed:', e?.message);
    return local;
  }
}

/** お気に入りに入れる。戻り値 { list, synced }。 */
export async function addFavoriteAuthor(userId, name) {
  const n = clip(name, 80);
  const key = authorKey(n);
  if (!key || key.length < 2) return { list: readLocal(userId), synced: false };
  const before = readLocal(userId);
  const cur = before.filter((a) => a.key !== key);
  const rec = { key, name: n, createdAt: appNow().toISOString(), dismissed: [] };
  const list = [rec, ...cur].slice(0, FAV_AUTHORS_MAX);
  writeLocal(userId, list);
  notify();
  if (!userId || !isSupabaseConfigured) return { list, synced: false };
  try {
    const { error } = await supabase.from('favorite_authors').upsert({ user_id: userId, name_key: key, name: n, dismissed_isbns: [] }, { onConflict: 'user_id,name_key', ignoreDuplicates: true });
    if (error) throw error;
    return { list, synced: true };
  } catch (e) {
    if (!isMissingTable(e)) {
      // 保存できなかったら端末の控えも元に戻す（星が「お気に入り」のまま残らない・2026-11-26 点検）。
      console.warn('[fav-authors] add failed:', e?.message);
      writeLocal(userId, before);
      notify();
      throw e;
    }
    return { list, synced: false };
  }
}

export async function removeFavoriteAuthor(userId, key) {
  const before = readLocal(userId);
  const list = before.filter((a) => a.key !== key);
  writeLocal(userId, list);
  notify();
  if (!userId || !isSupabaseConfigured) return { list, synced: false };
  try {
    const { error } = await supabase.from('favorite_authors').delete().eq('user_id', userId).eq('name_key', key);
    if (error) throw error;
    return { list, synced: true };
  } catch (e) {
    if (!isMissingTable(e)) {
      console.warn('[fav-authors] remove failed:', e?.message);
      writeLocal(userId, before);
      notify();
      throw e;
    }
    return { list, synced: false };
  }
}

/** 新しい本の知らせを閉じた・読みたいに入れた本（もう知らせない）。 */
export async function dismissAuthorBooks(userId, key, isbns) {
  const add = (isbns || []).filter((i) => /^\d{13}$/.test(String(i)));
  if (!add.length) return;
  let next = null;
  const list = readLocal(userId).map((a) => {
    if (a.key !== key) return a;
    next = [...new Set([...(a.dismissed || []), ...add])].slice(-DISMISSED_MAX);
    return { ...a, dismissed: next };
  });
  if (!next) return;
  writeLocal(userId, list);
  notify();
  if (!userId || !isSupabaseConfigured) return;
  try {
    const { error } = await supabase.from('favorite_authors').update({ dismissed_isbns: next }).eq('user_id', userId).eq('name_key', key);
    if (error) throw error;
  } catch (e) {
    if (!isMissingTable(e)) console.warn('[fav-authors] dismiss failed:', e?.message);
  }
}

// ---- 著者の本（/api/cover?author_books=・端末に 1 日覚える） ------------------------------
const BOOKS_KEY = 'orime.authorBooks.v1';
function readBooksCache() {
  try { const v = JSON.parse(window.localStorage.getItem(BOOKS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function writeBooksCache(map) {
  // 古い順に捨てて 60 人まで。
  const entries = Object.entries(map).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 60);
  try { window.localStorage.setItem(BOOKS_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* ignore */ }
}

/** 端末に覚えた著者の本（{ at, books } か null）。 */
export function cachedAuthorBooks(name) {
  const e = readBooksCache()[authorKey(name)];
  return e && Array.isArray(e.books) ? e : null;
}

const str = (v, n = 200) => String(v ?? '').slice(0, n);
function cleanBook(b) {
  return {
    title: str(b.title),
    subtitle: str(b.subtitle),
    author: str(b.author),
    publisher: str(b.publisher, 100),
    pubdate: str(b.pubdate, 40),
    release: /^\d{4}-\d{2}-\d{2}$/.test(String(b.release || '')) ? String(b.release) : '',
    isbn: /^\d{13}$/.test(String(b.isbn || '')) ? String(b.isbn) : '',
    cover: /^https:\/\//.test(String(b.cover || '')) || (import.meta.env?.DEV && /^data:image\//.test(String(b.cover || ''))) ? String(b.cover) : '',
    reissue: !!b.reissue,
  };
}

/** 著者の本を書店から読む（新しい順）。戻り値 { ok, books }。成功したら端末に覚える。 */
export async function fetchAuthorBooks(name, { signal, timeoutMs = 8000 } = {}) {
  const a = clip(name, 60);
  if (!a) return { ok: true, books: [] };
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(apiUrl(`/api/cover?author_books=${encodeURIComponent(a)}`), { signal: ctrl.signal });
    if (!r.ok) return { ok: false, books: [] };
    const d = await r.json();
    const books = (Array.isArray(d?.books) ? d.books : []).filter((b) => b && b.title).map(cleanBook).filter((b) => b.isbn).slice(0, 20);
    const map = readBooksCache();
    map[authorKey(a)] = { at: Date.now(), books };
    writeBooksCache(map);
    return { ok: true, books };
  } catch (e) {
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return { ok: false, books: [] };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/** いま書店に聞き直す著者（覚えてから 1 日たった・まだ聞いていない順に 5 人まで）。 */
export function authorsToCheck(favs, now = Date.now()) {
  const cache = readBooksCache();
  return (favs || [])
    .map((f) => ({ f, at: cache[f.key]?.at || 0 }))
    .filter((x) => now - x.at > BOOKS_TTL_MS)
    .sort((a, b) => a.at - b.at)
    .slice(0, CHECKS_PER_RUN)
    .map((x) => x.f);
}

// ---- 新しい本 ------------------------------------------------------------------------------
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 発売前か（発売日がきょうより後）。 */
export function isUpcoming(book, now = appNow()) {
  return !!book?.release && book.release > ymd(now);
}

/**
 * お気に入りの著者の、知らせる新しい本。
 *   お気に入りに入れた日より後に出る（出た）本・前の版がある作品（文庫化・新装版）は除く・発売から 120 日まで・
 *   閉じた本と本棚にある本は除く。新しい順。
 */
export function newBooksFor(fav, books, { isOwned = () => false, now = appNow() } = {}) {
  if (!fav || !Array.isArray(books)) return [];
  const since = fav.createdAt ? ymd(new Date(fav.createdAt)) : ymd(now);
  const oldest = ymd(new Date(now.getTime() - NEW_BOOK_DAYS * 86400000));
  const dismissed = new Set(fav.dismissed || []);
  return books
    .filter((b) => b && b.isbn && b.release && !b.reissue)
    .filter((b) => b.release > since && b.release >= oldest)
    .filter((b) => !dismissed.has(b.isbn) && !isOwned(b))
    .sort((a, b) => b.release.localeCompare(a.release));
}

/** 著者のシートで「新しい本」の印を付けるか（発売前か、発売から 120 日まで・前の版がある作品は除く）。 */
export function isRecentBook(book, now = appNow()) {
  if (!book?.release || book.reissue) return false;
  return book.release >= ymd(new Date(now.getTime() - NEW_BOOK_DAYS * 86400000));
}

/** 書店の発売日の書き方から、頭の 0 と「頃」を外す（「2026年03月05日頃」→「2026年3月5日」）。 */
export function shortPubdate(pubdate) {
  return String(pubdate || '').replace(/頃$/, '').replace(/(年|月)0(\d)/g, '$1$2').trim();
}

/** 発売日の書き方（「2026年12月中旬 発売予定」「2026年11月18日 発売」）。 */
export function releaseLabel(book, now = appNow()) {
  const raw = shortPubdate(book?.pubdate);
  if (!raw) return '';
  return isUpcoming(book, now) ? `${raw} 発売予定` : `${raw} 発売`;
}

/**
 * ホームに出す 1 行の中身（新しい本のある著者の、いちばん新しい本）。無ければ null。
 *   { fav, book, more }（more＝ほかの新しい本の数）
 */
export function homeNewBook(favs, { isOwned, now = appNow() } = {}) {
  const cache = readBooksCache();
  let best = null;
  let total = 0;
  for (const f of favs || []) {
    const list = newBooksFor(f, cache[f.key]?.books || [], { isOwned, now });
    total += list.length;
    if (list[0] && (!best || list[0].release > best.book.release)) best = { fav: f, book: list[0] };
  }
  return best ? { ...best, more: total - 1 } : null;
}
