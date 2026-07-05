// 📚🔥 テーマ別「新着・人気」本の発見 — クライアント側 fetch ラッパ。
//
// サーバー（api/discover.js）が楽天ブックス API を叩いて正規化・キャッシュ・
// レート制限する。クライアントはテーマ固定キー + sort('new'|'popular') を送るだけ。
//
// 返り値は必ず { ok, items, reason? } の形。ネットワーク/サーバー障害でも
// throw せず { ok:false, items:[] } に倒す（呼び出し側 UI を止めない）。

// テーマの表示定義（サーバーの THEME_KEYWORDS とキーを一致させること）。
// label = チップ表示名、emoji = 視覚アクセント。
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
];

// 簡易メモリキャッシュ（同一セッション内のタブ往復を高速化）。
// サーバーも 1h キャッシュするが、クライアントでも即応にする。
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
      // 429（レート）やサーバーエラー。graceful に空で返す。
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
