// 🏷 本の分野を、本ごとに 1 回だけサーバーで決めて全員で使う（/api/cover?fields=1・2026-10-11 オーナー
// 「この本以外の精度が上がるように仕組みを根本的に修正してね」）。
//
// 流れ（1 冊）:
//   1. 本の鍵（ISBN13・無ければ書名＋著者を整えたもの）で book_field_cache を見る。決め方の版（BOOK_FIELDS_VERSION）が
//      同じなら、それを返す（言葉の仕分け＝keywords は 1 日だけ覚え、あとで AI でもう一度）。
//   2. 公開の書誌を集める（api/_bookInfo.js＝openBD・楽天の紹介文と目次・楽天ブックスのジャンル）。
//   3. 楽天ブックスのジャンルが 1 つの分野にしか結びつかない（漫画・ライトノベル・楽譜など）なら、それで決める（genre）。
//   4. それ以外で紹介文か目次があれば、AI（いちばん安い Gemini Flash-Lite・失敗したら Claude Haiku）に、決まった 20 の
//      一覧から 1〜2 個を JSON で選ばせる（api/_bookFieldsPrompt.js）。答えは一覧と照らし、合わなければ捨てる（ai）。
//   5. AI が使えない（鍵が無い・1 日の上限・失敗・紹介文が無い）ときは、端末と同じ言葉の仕分け（keywords）。
//   6. book_field_cache に残す（service_role・表が無ければ覚えないだけ）。
// AI に送るのは本の公開の書誌だけ（利用者のメモ・個人の情報・利用者の id は送らない）。原価はログに数えるだけ
// （利用者のトークンは使わない）。1 日に AI で決める本の数は env BOOK_FIELDS_DAILY_LIMIT（既定 2000・RPC で数える）、
// 1 つの IP から AI で決めるのは 1 時間に BOOK_FIELDS_IP_PER_HOUR（既定 60）冊まで。
//
// 利用者が自動の分野を選び直したら、声（本と分野と +1/-1 だけ・だれかは残さない）を book_field_votes に残し、
// 覚えている分野に -1 が 3 つたまったら、その本を決め直す（version を 0 に）。

import { GENRE_RULES, genreCandidates, classifyBookDetailed, isBookField } from './_bookFieldsCore.js';
import { BOOK_FIELDS_SYSTEM, BOOK_FIELDS_MAX_TOKENS, bookFieldsUserText } from './_bookFieldsPrompt.js';
import { parseRouteSpec } from './_aiRouting.js';
import { openRoute, ProviderError } from './_providers.js';
import { costFromUsage } from './_aiCost.js';
import { toIsbn13 } from './_coverSources.js';

// 決め方の版。一覧・指示文・ジャンルの結びつけを変えたら上げる（覚えている分野を決め直す）。
//   2（2026-10-11 の 4 回目）: 分野「仕事の進め方」→「段取り・効率」・大分類の名前・指示文の例を変えた。
export const BOOK_FIELDS_VERSION = 2;
const KEYWORDS_TTL_MS = 24 * 60 * 60 * 1000;
const STALE_VOTES = 3;
const GENRE_NAME = new Map(GENRE_RULES.map((g) => [g.id, g.name]));
const FORMAT_GENRES = { '001019': '文庫', '001020': '新書' };

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

/** 本の鍵（ISBN13・無ければ書名＋著者を整えたもの）。本が分からなければ ''。 */
export function bookFieldKey({ isbn = '', title = '', author = '' } = {}) {
  const i13 = toIsbn13(isbn);
  if (i13) return `i:${i13}`;
  const flat = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s　・·:：\-―‐「」『』()（）［］[\]!！?？、。,.]/g, '');
  const t = flat(title).slice(0, 80);
  if (t.length < 2) return '';
  return `t:${t}|${flat(String(author || '').split(/[/／、,，]/)[0]).slice(0, 30)}`;
}

/** ジャンル ID → 画面の名前（AI に渡す手がかり）。 */
export function genreNamesOf(genreIds = []) {
  const out = [];
  for (const id of genreIds) {
    const top = String(id || '').slice(0, 6);
    const name = GENRE_NAME.get(top) || FORMAT_GENRES[top];
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** AI の答えを読む（JSON の fields・一覧の名前だけ・1〜2 個）。読めなければ []。 */
export function parseFieldsAnswer(text) {
  const s = String(text || '');
  const m = s.match(/\{[\s\S]*\}/);
  let arr = [];
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      if (Array.isArray(j?.fields)) arr = j.fields;
    } catch { /* 下で [] */ }
  }
  const out = [];
  for (const f of arr) {
    const name = String(f || '').trim();
    if (isBookField(name) && !out.includes(name)) out.push(name);
  }
  return out.slice(0, 2);
}

/** AI の行き先（env AI_ROUTE_BOOK_FIELDS で差し替え・既定は Gemini Flash-Lite → 失敗したら Claude Haiku）。 */
export function bookFieldsRoutes(env = process.env) {
  const routes = [];
  const off = String(env.AI_ROUTING || '').toLowerCase() === 'off';
  const spec = !off && parseRouteSpec(env.AI_ROUTE_BOOK_FIELDS || '');
  const first = spec || (!off ? { provider: 'gemini', model: 'gemini-3.1-flash-lite' } : null);
  const hasKey = (p) => (p === 'gemini' ? !!env.GEMINI_API_KEY : p === 'openai' ? !!env.OPENAI_API_KEY : !!env.ANTHROPIC_API_KEY);
  if (first && hasKey(first.provider)) routes.push(first);
  if (env.ANTHROPIC_API_KEY && !routes.some((r) => r.provider === 'anthropic')) routes.push({ provider: 'anthropic', model: 'claude-haiku-4-5' });
  return routes;
}

// 1 つの IP から AI で決める冊数（1 時間・インスタンスの中）。
const ipLog = new Map();
export function takeIpAiSlot(ip, env = process.env, now = Date.now()) {
  const max = num(env.BOOK_FIELDS_IP_PER_HOUR, 60);
  const arr = (ipLog.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (arr.length >= max) return false;
  arr.push(now);
  ipLog.set(ip, arr);
  if (ipLog.size > 5000) ipLog.clear();
  return true;
}
export function _resetBookFieldsMemory() { ipLog.clear(); }

/** AI に分野を選ばせる。{ fields, model, mjpy } か null（使えない・失敗・合わない答え）。 */
export async function askAiForFields(book, { env = process.env, fetchImpl = fetch } = {}) {
  const base = {
    max_tokens: BOOK_FIELDS_MAX_TOKENS,
    system: BOOK_FIELDS_SYSTEM,
    messages: [{ role: 'user', content: bookFieldsUserText(book) }],
  };
  for (const r of bookFieldsRoutes(env)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { response, model } = await openRoute({ provider: r.provider, model: r.model, base, env, fetchImpl });
      if (!response || !response.ok) continue;
      // eslint-disable-next-line no-await-in-loop
      const data = await response.json();
      const text = Array.isArray(data?.content) ? data.content.map((c) => c?.text || '').join('') : '';
      const fields = parseFieldsAnswer(text);
      const mjpy = costFromUsage(model, data?.usage || {});
      console.info('[book-fields] ai', JSON.stringify({ provider: r.provider, model, in: data?.usage?.input_tokens || 0, out: data?.usage?.output_tokens || 0, mjpy, ok: fields.length > 0 }));
      if (fields.length) return { fields, model, mjpy };
    } catch (e) {
      console.warn('[book-fields] ai failed', r.provider, e instanceof ProviderError ? e.reason : (e && e.message));
    }
  }
  return null;
}

async function readCache(supabase, key) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('book_field_cache').select('fields, source, genre_ids, version, updated_at').eq('book_key', key).maybeSingle();
    if (error) return null;
    return data || null;
  } catch { return null; }
}

async function writeCache(supabase, row) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('book_field_cache').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'book_key' });
    if (error) console.warn('[book-fields] cache write', error.code || error.message);
  } catch { /* 覚えないだけ */ }
}

async function reserveDaily(supabase, env, now) {
  if (!supabase) return false; // 数えられないときは AI を呼ばない（原価の上限を守る）
  const limit = Math.floor(num(env.BOOK_FIELDS_DAILY_LIMIT, 2000));
  if (limit <= 0) return false;
  const day = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10); // 日本時間の日付
  try {
    const { data, error } = await supabase.rpc('reserve_book_field_ai', { p_day: day, p_limit: limit });
    if (error) return false;
    return Number(data) > 0;
  } catch { return false; }
}

/** 覚えている分野をそのまま使えるか（版が同じ・言葉の仕分けは 1 日だけ）。 */
export function cacheUsable(row, now = Date.now()) {
  if (!row || row.version !== BOOK_FIELDS_VERSION || !Array.isArray(row.fields) || !row.fields.length) return false;
  if (!row.fields.every((f) => isBookField(f))) return false;
  if (row.source === 'keywords') return now - Date.parse(row.updated_at || 0) < KEYWORDS_TTL_MS;
  return true;
}

/**
 * 本 1 冊の分野を決める。戻り値 { fields, source: 'genre'|'ai'|'keywords'|'none', genreIds, version, cached }。
 *   deps: { supabase（service_role・無くてもよい）, getInfo（公開の書誌を集める）, env, fetchImpl, ip, now }
 */
export async function classifyBookServer({ isbn = '', title = '', author = '' } = {}, deps = {}) {
  const { supabase = null, getInfo, env = process.env, fetchImpl = fetch, ip = 'unknown', now = Date.now() } = deps;
  const key = bookFieldKey({ isbn, title, author });
  if (!key) return { fields: [], source: 'none', genreIds: [], version: BOOK_FIELDS_VERSION, cached: false };

  const hit = await readCache(supabase, key);
  if (cacheUsable(hit, now)) {
    return { fields: hit.fields.slice(0, 2), source: hit.source, genreIds: hit.genre_ids || [], version: BOOK_FIELDS_VERSION, cached: true };
  }

  let info = {};
  try { info = (await getInfo({ isbn, title, author })) || {}; } catch { info = {}; }
  const genreIds = Array.isArray(info.genreIds) ? info.genreIds : [];
  const features = { title, description: info.description || '', toc: Array.isArray(info.toc) ? info.toc : [], genreIds };
  const row = { book_key: key, isbn: toIsbn13(isbn || info.isbn) || null, genre_ids: genreIds, version: BOOK_FIELDS_VERSION };

  // 3. ジャンルが 1 つの分野にしか結びつかない
  const g = genreCandidates(genreIds);
  if (g && g.fields.length === 1) {
    const fields = [g.fields[0]];
    await writeCache(supabase, { ...row, fields, source: 'genre', model: null });
    return { fields, source: 'genre', genreIds, version: BOOK_FIELDS_VERSION, cached: false };
  }

  // 4. AI（紹介文か目次があるときだけ・1 日の上限・IP ごとの上限）
  const hasText = !!(features.description || features.toc.length);
  if (hasText && bookFieldsRoutes(env).length && takeIpAiSlot(ip, env, now) && await reserveDaily(supabase, env, now)) {
    const ai = await askAiForFields({ title, author, description: features.description, toc: features.toc, genreNames: genreNamesOf(genreIds) }, { env, fetchImpl });
    if (ai) {
      await writeCache(supabase, { ...row, fields: ai.fields, source: 'ai', model: ai.model });
      return { fields: ai.fields, source: 'ai', genreIds, version: BOOK_FIELDS_VERSION, cached: false };
    }
  }

  // 5. 言葉の仕分け（端末と同じ）
  const kw = classifyBookDetailed(features);
  if (kw.fields.length) {
    await writeCache(supabase, { ...row, fields: kw.fields.slice(0, 2), source: 'keywords', model: null });
    return { fields: kw.fields.slice(0, 2), source: 'keywords', genreIds, version: BOOK_FIELDS_VERSION, cached: false };
  }
  return { fields: [], source: 'none', genreIds, version: BOOK_FIELDS_VERSION, cached: false };
}

/**
 * 利用者が自動の分野を選び直した声を残す（だれかは残さない）。覚えている分野に -1 が STALE_VOTES たまったら決め直す。
 *   votes: [{ field, delta: 1|-1 }]
 */
export async function recordFieldVotes({ isbn = '', title = '', author = '', votes = [] } = {}, { supabase = null } = {}) {
  const key = bookFieldKey({ isbn, title, author });
  const rows = (Array.isArray(votes) ? votes : [])
    .filter((v) => isBookField(v?.field) && (v.delta === 1 || v.delta === -1))
    .slice(0, 6)
    .map((v) => ({ book_key: key, field: v.field, delta: v.delta }));
  if (!key || !rows.length || !supabase) return { ok: false };
  try {
    const { error } = await supabase.from('book_field_votes').insert(rows);
    if (error) return { ok: false };
    const cached = await readCache(supabase, key);
    if (!cached || !Array.isArray(cached.fields)) return { ok: true, stale: false };
    const since = new Date(Date.now() - 180 * 86400 * 1000).toISOString();
    const { data } = await supabase.from('book_field_votes').select('field, delta').eq('book_key', key).gte('created_at', since).limit(200);
    const minus = (data || []).filter((v) => v.delta === -1 && cached.fields.includes(v.field)).length;
    if (minus >= STALE_VOTES && cached.version !== 0) {
      await supabase.from('book_field_cache').update({ version: 0, updated_at: new Date().toISOString() }).eq('book_key', key);
      return { ok: true, stale: true };
    }
    return { ok: true, stale: false };
  } catch { return { ok: false }; }
}
