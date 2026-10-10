// 🏷 本の分野をサーバーに聞く（/api/cover?fields=1・api/_bookFields.js・2026-10-11）。
//
// 分野は本ごとに 1 回だけサーバーが決め（書店のジャンル → AI → 言葉の仕分け）、全員で使う。端末の言葉の仕分け
// （lib/bookFields.js の classifyBook）はすぐに出す最初の見立てと、つながらないときの代わり。
// 送るのは本の書誌（ISBN・書名・著者）だけ。利用者のメモ・個人の情報は送らない（サーバーも AI に公開の書誌だけを送る）。
// 控え: AI・ジャンルで決まった答えは端末に 30 日（言葉の仕分けは控えない＝あとでサーバーがもう一度 AI で決める）。

import { apiUrl } from './apiUrl';
import { supabase, isSupabaseConfigured } from './supabase';
import { isBookField } from './bookFields';
import { bookInfoKey } from './bookInfo';

// v2（2026-10-11）: 分野の名前を変えた（仕事の進め方 → 段取り・効率）ので、前の控えは使わない。
const LS_PREFIX = 'orime.bookFields.server.v2:';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 12000;
const mem = new Map();

// 🛡 サーバーは、ログインした人の呼び出しだけで分野の覚え書きを書き・声を残す（2026-10-10 監査・api/cover.js）。
//   ログインの鍵（Supabase の JWT）を Authorization に付ける。読めなければ付けない（サーバーは読むだけ）。
async function defaultGetToken() {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch { return null; }
}
async function authInit(getToken, signal) {
  let token = null;
  try { token = await getToken(); } catch { token = null; }
  const init = {};
  if (token) init.headers = { Authorization: `Bearer ${token}` };
  if (signal) init.signal = signal;
  return Object.keys(init).length ? init : undefined;
}

function readStore(key) {
  try {
    const raw = globalThis.localStorage?.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || Date.now() > v.until || !Array.isArray(v.fields)) return null;
    return v;
  } catch { return null; }
}
function writeStore(key, value) {
  try { globalThis.localStorage?.setItem(LS_PREFIX + key, JSON.stringify({ ...value, until: Date.now() + TTL_MS })); } catch { /* 毎回聞くだけ */ }
}

/** サーバーの答えをそろえる（一覧の名前だけ・2 つまで）。 */
export function normalizeServerFields(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const fields = [...new Set((Array.isArray(r.fields) ? r.fields : []).map((f) => String(f || '').trim()).filter(isBookField))].slice(0, 2);
  const source = ['genre', 'ai', 'keywords'].includes(r.source) ? r.source : 'none';
  return { fields, source: fields.length ? source : 'none' };
}

/**
 * 本の分野をサーバーに聞く。{ fields, source } か null（つながらない・決められない）。
 * source が 'ai' / 'genre' の答えだけ端末に控える。
 */
export async function fetchServerFields(book, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, getToken = defaultGetToken } = {}) {
  const key = bookInfoKey(book);
  if (!key) return null;
  if (mem.has(key)) return mem.get(key);
  const stored = readStore(key);
  if (stored) { mem.set(key, { fields: stored.fields, source: stored.source }); return mem.get(key); }
  const params = new URLSearchParams({ fields: '1' });
  const isbn = String(book?.isbn || '').replace(/[^0-9Xx]/g, '');
  if (isbn) params.set('isbn', isbn);
  if (book?.title) params.set('title', String(book.title).slice(0, 200));
  if (book?.author) params.set('author', String(book.author).slice(0, 200));
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
    const r = await fetchImpl(apiUrl(`/api/cover?${params.toString()}`), await authInit(getToken, signal));
    if (!r || !r.ok) return null;
    const v = normalizeServerFields(await r.json());
    if (!v.fields.length) return null;
    if (v.source === 'ai' || v.source === 'genre') {
      mem.set(key, v);
      writeStore(key, v);
    }
    return v;
  } catch {
    return null;
  }
}

/**
 * 自動で付いた分野を本人が選び直したら、その声をサーバーに残す（本の書誌と分野だけ・ログインの鍵はサーバーが
 * 1 人 1 冊 1 回に絞るためだけに使い、利用者 id は残さない）。
 * 同じ本で -1 が 3 つたまると、サーバーがその本の分野を決め直す。失敗しても何もしない。
 */
export function sendFieldVotes(book, before = [], after = [], { fetchImpl = globalThis.fetch, getToken = defaultGetToken } = {}) {
  const add = after.filter((f) => isBookField(f) && !before.includes(f));
  const remove = before.filter((f) => isBookField(f) && !after.includes(f));
  if (!add.length && !remove.length) return false;
  const params = new URLSearchParams({ fieldvote: '1' });
  const isbn = String(book?.isbn || '').replace(/[^0-9Xx]/g, '');
  if (isbn) params.set('isbn', isbn);
  if (book?.title) params.set('title', String(book.title).slice(0, 200));
  if (book?.author) params.set('author', String(book.author).slice(0, 200));
  if (add.length) params.set('add', add.join(','));
  if (remove.length) params.set('remove', remove.join(','));
  // ログインしていなければサーバーは残さない（401）。送れなくても動く。
  const url = apiUrl(`/api/cover?${params.toString()}`);
  const sent = (async () => {
    const init = await authInit(getToken);
    if (!init?.headers) return;
    await fetchImpl(url, init);
  })().catch(() => {});
  void sent;
  mem.delete(bookInfoKey(book));
  try { globalThis.localStorage?.removeItem(LS_PREFIX + bookInfoKey(book)); } catch { /* 無視 */ }
  return true;
}

export function _resetServerFieldsMemory() { mem.clear(); }
