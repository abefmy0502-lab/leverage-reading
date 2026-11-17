// 📚 AI 選書の「本の候補」（2026-11-17 オーナー「また世の中にない本が出てきた／推薦する際の本のデータをすでに用意しておくのはアリかも」）。
//
// なぜ: AI に記憶だけで書名を挙げさせると、実在の著者にそれらしい書名を組み合わせた本（例『ザ・マネジャー』ブルース・ロジャーズ）が
//   混じる。あとから書誌で確かめても「確かめられなかった」本が残っていた。
// どうする: 本を選ぶ前に、聞き取りの AI が出した検索の言葉（keywords）で書店の検索（/api/cover?search=・楽天の売上順）を引き、
//   **実在する本の候補**（書名・著者・出版社・年・ISBN・表紙）を集めておく。推薦の AI には候補を C1〜 の印つきで渡し、
//   候補から選んでもらう（JSON に "key"）。候補から選んだ本は、書誌で確かめた本として扱う（表紙も ISBN もそのまま使う）。
//   候補の外の本は今までどおり 1 冊ずつ確かめ、確かめられない本は出さない（BookAdvisor の verifyAndEnrich）。
// 2026-11-17 その 2（オーナー「推薦できる本を徹底的に集めて、概要やおすすめする理由をデータとして整えて」）:
//   先に「推薦用の本のデータ」（advisor_books・毎日少しずつ集めて AI が概要・こんな悩みの人に・おすすめする理由を書いた表・
//   supabase_advisor_books.sql / api/_advisorBooks.js）から引き、足りない分を書店の検索で埋める。表の本は概要と
//   「こんな悩みの人に」つきで AI に渡す（選ぶ根拠が増える）。表が無い・つながらないときは書店の検索だけ。
// ここは画面に依存しない小道具（検索の言葉を整える・候補を集める・AI に渡す文・AI の答えと候補を結ぶ）。
import { searchBooksOnServer } from './bookSearch';
import { supabase, isSupabaseConfigured } from './supabase';
import { flatTitle, strongTitleMatch, authorMatches } from '../../api/_bookVerify.js';

export const KEYWORDS_MAX = 4;
export const CANDIDATES_MAX = 24;
// 推薦用の本のデータから引く数（残りを書店の検索で埋める）
export const CATALOG_MAX = 14;
const PER_QUERY = 8;
// 候補を集める時間の上限（推薦を待たせすぎない。間に合った分だけ使う）。
export const CANDIDATES_BUDGET_MS = 9000;

// 本の推薦に向かない棚（漫画・写真集・資格の問題集・楽譜・ライトノベル など）。この棚だけの本は候補にしない。
const SKIP_GENRES = ['001001', '001013', '001016', '001017', '001018', '001021', '001029'];
// 雑誌・ムック・付録つきの本など（書名の形で見分ける）。
const NOT_A_BOOK = /(?:\d+\s*年\s*\d+\s*月号|月号|増刊|別冊|ムック|mook|カレンダー|手帳\s*20\d\d|20\d\d\s*年版|問題集|過去問|ドリル|塗り絵|ぬりえ|付録|セット|全\s*\d+\s*巻)/i;

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// AI が出した検索の言葉を整える（文字列だけ・2〜20 字・記号を落とす・重なりなし・最大 4 つ）。
export function cleanKeywords(list) {
  const out = [];
  for (const k of Array.isArray(list) ? list : []) {
    const s = str(k).normalize('NFKC').replace(/[「」『』"'“”‘’【】()（）[\]［］<>＜＞#＃*＊]/g, ' ').replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 20) continue;
    if (out.some((o) => o.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length >= KEYWORDS_MAX) break;
  }
  return out;
}

const genreSkipped = (genreIds) => {
  const ids = (Array.isArray(genreIds) ? genreIds : []).map(String).filter(Boolean);
  return ids.length > 0 && ids.every((g) => SKIP_GENRES.some((s) => g.startsWith(s)));
};

// 候補にしてよい本か（書名と、ISBN か著者があり・推薦に向かない棚や雑誌でない）。
export function usableCandidate(b) {
  if (!b || !str(b.title)) return false;
  if (!b.isbn && !str(b.author)) return false;
  if (genreSkipped(b.genreIds)) return false;
  if (NOT_A_BOOK.test(`${b.title} ${b.subtitle || ''}`)) return false;
  return true;
}

// 本棚にある本か（ISBN か、書名がはっきり一致）。
function onShelf(b, shelf) {
  for (const s of Array.isArray(shelf) ? shelf : []) {
    if (!s) continue;
    if (b.isbn && s.isbn && String(s.isbn).replace(/-/g, '') === b.isbn) return true;
    if (s.title && strongTitleMatch(s.title, b.title)) return true;
  }
  return false;
}

/**
 * 検索の言葉ごとに書店の検索を引き、候補を集める（C1〜 の印つき・最大 24 冊）。
 *   言葉ごとの上位を交互に並べる（1 つの言葉の本だけで埋めない）。本棚にある本・同じ本・推薦に向かない本は除く。
 *   検索は 1 つずつ順に（楽天は続けて呼ぶと混む）。時間の上限を過ぎたら、集まった分だけ返す。失敗しても例外にしない。
 */
// 推薦用の本のデータ（advisor_books）から引く。失敗・未適用は空（例外にしない）。
//   level（この人の読書の慣れ 1〜3・0＝見ない）で難しさの離れた本を下げる（supabase_advisor_books_ext.sql）。
//   その SQL の前の本番（引数 3 つの関数）では、level を外してもう一度引く。
export async function searchCatalog(words, { shelf = [], rpc = defaultRpc, limit = CATALOG_MAX, level = 0 } = {}) {
  if (!rpc || !Array.isArray(words) || words.length === 0) return [];
  const exclude = (Array.isArray(shelf) ? shelf : []).map((b) => String(b?.isbn || '').replace(/-/g, '')).filter((x) => /^\d{13}$/.test(x)).slice(0, 500);
  try {
    const args = { p_terms: words, p_exclude: exclude, p_limit: limit };
    let { data, error } = await rpc('search_advisor_books', level >= 1 && level <= 3 ? { ...args, p_level: level } : args);
    if (error && level) ({ data, error } = await rpc('search_advisor_books', args));
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((b) => b && str(b.title) && /^\d{13}$/.test(String(b.isbn || '')))
      .filter((b) => !onShelf({ title: b.title, isbn: b.isbn }, shelf))
      .map((b) => ({
        title: str(b.title),
        subtitle: str(b.subtitle),
        author: str(b.author),
        publisher: str(b.publisher),
        pubYear: str(b.pub_date).slice(0, 4),
        isbn: String(b.isbn),
        cover: /^https:\/\//.test(String(b.cover || '')) ? String(b.cover) : '',
        summary: str(b.summary),
        forWhom: (Array.isArray(b.for_whom) ? b.for_whom : []).map(str).filter(Boolean).slice(0, 3),
        reason: str(b.reason),
        level: str(b.level),
        difficulty: Number(b.difficulty) >= 1 && Number(b.difficulty) <= 3 ? Number(b.difficulty) : 0,
        prereq: str(b.prereq),
        recPoints: Number.isFinite(Number(b.rec_points)) && b.rec_points !== null ? Number(b.rec_points) : null,
        endorsers: (Array.isArray(b.endorsers) ? b.endorsers : []).map(str).filter(Boolean).slice(0, 5),
        extSummary: str(b.ext_summary),
      }));
  } catch { return []; }
}
function defaultRpc(name, args) {
  if (!isSupabaseConfigured || !supabase) return Promise.resolve({ data: null, error: { message: 'no supabase' } });
  return supabase.rpc(name, args);
}

export async function gatherCandidates(keywords, { shelf = [], search = searchBooksOnServer, rpc = defaultRpc, budgetMs = CANDIDATES_BUDGET_MS, signal, now = () => Date.now(), level = 0 } = {}) {
  const words = cleanKeywords(keywords);
  if (words.length === 0) return [];
  const started = now();
  // まず推薦用の本のデータから（概要つき）。足りない分を書店の検索で。
  const catalog = await searchCatalog(words, { shelf, rpc, level });
  const lists = [catalog];
  for (const q of catalog.length >= CANDIDATES_MAX - 4 ? [] : words) {
    if (signal?.aborted) break;
    const left = budgetMs - (now() - started);
    if (left < 1500) break;
    let res;
    try {
      // eslint-disable-next-line no-await-in-loop
      res = await search(q, { signal, timeoutMs: Math.min(left, 8000) });
    } catch { res = null; }
    const books = (res?.ok && Array.isArray(res.results) ? res.results : []).filter(usableCandidate);
    lists.push(books.slice(0, PER_QUERY * 2));
  }
  const seen = new Set();
  const out = [];
  const take = (b) => {
    const key = b.isbn || `${flatTitle(b.title)}|${flatTitle(b.author)}`;
    const fkey = flatTitle(b.title);
    if (seen.has(key) || seen.has(`t:${fkey}`)) return;
    if (onShelf(b, shelf)) return;
    seen.add(key);
    seen.add(`t:${fkey}`);
    out.push(b);
  };
  // 推薦用の本のデータの本は先にすべて（点の高い順）。
  for (const b of lists[0]) take(b);
  lists[0] = [];
  // 言葉ごとに上位から交互に（1 つの言葉の本は最大 PER_QUERY 冊）。
  const taken = lists.map(() => 0);
  const idx = lists.map(() => 0);
  let moved = true;
  while (out.length < CANDIDATES_MAX && moved) {
    moved = false;
    for (let i = 0; i < lists.length && out.length < CANDIDATES_MAX; i += 1) {
      while (idx[i] < lists[i].length && taken[i] < PER_QUERY) {
        const before = out.length;
        take(lists[i][idx[i]]);
        idx[i] += 1;
        moved = true;
        if (out.length > before) { taken[i] += 1; break; }
      }
    }
  }
  return out.slice(0, CANDIDATES_MAX).map((b, i) => ({
    key: `C${i + 1}`,
    title: str(b.title),
    subtitle: str(b.subtitle),
    author: str(b.author),
    publisher: str(b.publisher),
    pubYear: str(b.pubYear),
    isbn: b.isbn || '',
    cover: b.cover || '',
    summary: str(b.summary),
    forWhom: Array.isArray(b.forWhom) ? b.forWhom : [],
    reason: str(b.reason),
    difficulty: b.difficulty || 0,
    prereq: str(b.prereq),
    recPoints: b.recPoints ?? null,
    endorsers: Array.isArray(b.endorsers) ? b.endorsers : [],
    extSummary: str(b.extSummary),
  }));
}

const DIFF_LABEL = { 1: '入門', 2: '中級', 3: '上級' };

// AI に渡す候補の塊（無ければ空文字）。
export function candidatesBlock(cands) {
  const list = Array.isArray(cands) ? cands : [];
  if (list.length === 0) return '';
  const lines = list.map((c) => {
    const sub = c.subtitle ? ` ${c.subtitle.slice(0, 40)}` : '';
    const meta = [c.author, c.publisher, c.pubYear].filter(Boolean).join('・');
    // 推薦用の本のデータの本は、概要とこんな悩みの人に（短く）を添える
    const about = c.summary ? `\n　概要: ${c.summary.slice(0, 90)}` : '';
    const who = c.forWhom && c.forWhom.length ? `\n　こんな人に: ${c.forWhom.slice(0, 2).join('／').slice(0, 70)}` : '';
    // 難しさ・前提知識・書評サイトの推薦（2026-11-17・supabase_advisor_books_ext.sql）
    const diff = c.difficulty ? `\n　難しさ: ${DIFF_LABEL[c.difficulty]}${c.prereq ? `（前提: ${c.prereq.slice(0, 30)}）` : ''}` : '';
    const rec = c.endorsers && c.endorsers.length
      ? `\n　推薦: ${c.endorsers.slice(0, 3).join('・').slice(0, 60)}${c.endorsers.length > 3 ? ' ほか' : ''}${c.recPoints ? `（${c.recPoints}P）` : ''}`
      : '';
    const ext = c.extSummary ? `\n　書評サイトの要約（参考・写さない）: ${c.extSummary.replace(/\s+/g, ' ').slice(0, 160)}` : '';
    return `${c.key}『${c.title}』${sub}${meta ? `（${meta}）` : ''}${about}${who}${diff}${rec}${ext}`;
  });
  return (
    '【本の候補（書店の書誌で確かめた、実在する本）】\n' +
    `${lines.join('\n')}\n` +
    '※ 推薦する本は、できるだけこの候補から選び、JSON の "key" に印（C1 など）を入れる。title と author は候補の書き方のまま。'
  );
}

// AI が挙げた本（rec）に当たる候補を探す（印 → 書名と著者）。無ければ null。
export function matchCandidate(rec, cands) {
  const list = Array.isArray(cands) ? cands : [];
  if (!rec || list.length === 0) return null;
  const key = str(rec.key).toUpperCase();
  if (key) {
    const byKey = list.find((c) => c.key === key);
    // 印が書名と食い違うとき（印の書き間違い）は印を信じない。
    if (byKey && (!rec.title || strongTitleMatch(rec.title, byKey.title) || strongTitleMatch(rec.title, `${byKey.title} ${byKey.subtitle}`))) return byKey;
  }
  if (!rec.title) return null;
  return list.find((c) => (strongTitleMatch(rec.title, c.title) || strongTitleMatch(rec.title, `${c.title} ${c.subtitle}`))
    && (!rec.author || !c.author || authorMatches(rec.author, [c.author]))) || null;
}

// 候補に当たった本を、書誌の書名・著者・ISBN・表紙で整える（確かめた本＝_verify 'ok'）。
export function applyCandidate(rec, cand) {
  if (!cand) return rec;
  const { key: _key, ...rest } = rec || {};
  return {
    ...rest,
    title: cand.title,
    author: cand.author || rest.author || '',
    isbn: cand.isbn || '',
    cover: cand.cover || '',
    _verify: 'ok',
    _cand: true,
  };
}
