// 📚🏬 話題の本を探す（本屋をぶらぶら）— クライアント側 fetch ラッパ + 棚の設計。
//
// サーバー（api/discover.js）が楽天ブックス API を叩いて正規化・キャッシュ・
// レート制限する。クライアントはテーマ固定キー + sort('new'|'popular') を送るだけ。
//
// 思想:
//   - 「思いがけない出会い」を主役に。本屋の平台をぶらぶら歩く感覚（カバー主役・
//     横スクロールの棚を縦に並べる）。日替わりでローテーションして鮮度を出す。
//   - ビジネスパーソンの時代感度に応える（いま読まれてるビジネス書 / 話題の新刊）。
//   - パーソナルは"1棚"だけに留める＝フィルターバブルで出会いを殺さない。
//
// 返り値は必ず { ok, items, reason? } の形。障害でも throw せず空に倒す。

// テーマの表示定義（サーバーの THEME_KEYWORDS とキーを一致させること）。
// テーマの棚（ぶらぶら用チップ）に出す。
export const DISCOVER_THEMES = [
  { key: '読書', label: '読書術', emoji: '📖' },
  { key: '思考法・意思決定', label: '思考法', emoji: '🧠' },
  { key: 'お金・投資', label: 'お金・投資', emoji: '💰' },
  { key: 'マーケティング', label: 'マーケ', emoji: '📣' },
  { key: '営業', label: '営業', emoji: '🤝' },
  { key: 'リーダーシップ', label: 'リーダー', emoji: '🧭' },
  { key: 'チームづくり', label: 'チーム', emoji: '👥' },
  { key: '伝え方・文章', label: '文章・伝え方', emoji: '✍️' },
  { key: '習慣化', label: '習慣化', emoji: '🔁' },
  { key: '心理学', label: '心理学', emoji: '🫧' },
  { key: '健康・運動', label: '健康', emoji: '🏃' },
  { key: '自己啓発', label: '自己啓発', emoji: '🌱' },
  { key: '教養', label: '教養', emoji: '🏛' },
  { key: '時間術', label: '時間術', emoji: '⏳' },
  { key: 'キャリア', label: 'キャリア', emoji: '🚀' },
];

const THEME_LABEL = new Map(DISCOVER_THEMES.map((t) => [t.key, t.label]));
export const themeLabel = (key) => THEME_LABEL.get(key) || key;

// 日替わりローテ用の「その日のインデックス」。同じ日は同じ棚、日が変わると
// 平台が入れ替わる＝「今日ぶらついたら別の本があった」を作る。
// （Math.random は使わない＝サーバー/端末で決定的・SSR安全）。
export function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// トレンド寄りのローテ候補（ビジネスパーソンの時代感度＋ぶらぶらの意外性）。
const TREND_POOL = [
  'ビジネス', 'マーケティング', '思考法・意思決定', 'お金・投資',
  'リーダーシップ', '伝え方・文章', '習慣化', '自己啓発', '教養', 'キャリア',
];

// その日の「今日の平台」テーマ。offset を変えると別の棚を選べる。
export function pickDailyTheme(offset = 0, pool = TREND_POOL) {
  if (!pool.length) return 'ビジネス';
  const i = (dayOfYear() + offset) % pool.length;
  return pool[(i + pool.length) % pool.length];
}

// 「あえての一冊」用テーマ。ユーザーの関心（excludeKeys）から少し外して、
// 畑違いの出会いを誘う。全テーマから日替わりで選び、関心と被れば隣へずらす。
export function pickSerendipityTheme(excludeKeys = []) {
  const all = DISCOVER_THEMES.map((t) => t.key);
  if (!all.length) return 'ビジネス';
  const ex = new Set(excludeKeys);
  const base = (dayOfYear() + 7) % all.length;
  for (let step = 0; step < all.length; step += 1) {
    const cand = all[(base + step) % all.length];
    if (!ex.has(cand)) return cand;
  }
  return all[base];
}

// 決定的シャッフル（日付シード）。同じ日は同じ並び、日が変わると入れ替わる。
// Fisher–Yates を線形合同法の擬似乱数で回す（Math.random 非依存）。
export function seededShuffle(arr, seed = dayOfYear()) {
  const a = [...arr];
  let s = (seed * 2654435761) >>> 0 || 1;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 簡易メモリキャッシュ（同一セッション内のタブ往復を高速化）。
const _cache = new Map(); // `${theme}|${sort}` -> { at, items }
const CLIENT_TTL_MS = 10 * 60 * 1000;

/**
 * テーマ別の新着 / 人気の本を取得。
 * @param {{ theme: string, sort?: 'new'|'popular', signal?: AbortSignal }} args
 * @returns {Promise<{ ok: boolean, items: Array, reason?: string }>}
 */
export async function fetchDiscover({ theme, sort = 'new', signal } = {}) {
  if (!theme) return { ok: false, items: [], reason: 'no_theme' };
  const normSort = sort === 'popular' ? 'popular' : 'new';
  const cacheKey = `${theme}|${normSort}`;
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CLIENT_TTL_MS) {
    return { ok: true, items: hit.items, cached: true };
  }
  try {
    const params = new URLSearchParams({ theme, sort: normSort });
    const res = await fetch(`/api/discover?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) {
      return { ok: false, items: [], reason: `http_${res.status}` };
    }
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (data?.ok && items.length) {
      _cache.set(cacheKey, { at: Date.now(), items });
    }
    return { ok: !!data?.ok, items, reason: data?.reason };
  } catch (e) {
    if (e?.name === 'AbortError') return { ok: false, items: [], reason: 'aborted' };
    return { ok: false, items: [], reason: 'fetch_failed' };
  }
}

export default fetchDiscover;
