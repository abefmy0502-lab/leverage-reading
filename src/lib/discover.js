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

// テーマの表示定義（サーバーの THEME_GENRES とキーを一致させること）。
// 本屋のコーナー＝楽天ブックスの実ジャンル（booksGenreId）に対応。テーマの棚
// （ぶらぶら用チップ）に出す。キーワードは楽天の売れ筋で無視されるため、ジャンルで
// 絞ることで「そのコーナーの本当の人気・新刊」を出す。
export const DISCOVER_THEMES = [
  { key: 'ビジネス・経済', label: 'ビジネス', emoji: '💼' },
  { key: '人文・思想', label: '人文・思想', emoji: '🧠' },
  { key: '新書', label: '新書', emoji: '📗' },
  { key: '小説・エッセイ', label: '小説・エッセイ', emoji: '📕' },
  { key: '暮らし・健康', label: '暮らし・健康', emoji: '🌿' },
  { key: '科学・技術', label: '科学・技術', emoji: '🔬' },
  { key: 'IT・パソコン', label: 'IT・PC', emoji: '💻' },
  { key: '資格・検定', label: '資格・検定', emoji: '🎓' },
  { key: '語学・学習', label: '語学・学習', emoji: '🗣' },
  { key: '旅行・アウトドア', label: '旅行', emoji: '🗺' },
  { key: '趣味・スポーツ', label: '趣味・スポーツ', emoji: '⚽' },
  { key: '漫画', label: '漫画', emoji: '📚' },
];

const THEME_LABEL = new Map(DISCOVER_THEMES.map((t) => [t.key, t.label]));
export const themeLabel = (key) => THEME_LABEL.get(key) || key;

// 蔵書タグ/フォルダ → テーマキー のヒント（パーソナル棚・関心推定用）。
// タグは自由文字列なので、正規表現でジャンルに寄せる。最初にマッチしたものを採用。
const TAG_THEME_HINTS = [
  { re: /(投資|お金|金融|株|資産|マネー|経済|ビジネス|経営|営業|マーケ|リーダー|仕事|キャリア|起業|会計|マネジメント|副業)/i, key: 'ビジネス・経済' },
  { re: /(心理|思想|哲学|社会|歴史|宗教|人文|教養|マインド)/i, key: '人文・思想' },
  { re: /(健康|料理|暮らし|美容|子育て|ダイエット|運動|レシピ|生活)/i, key: '暮らし・健康' },
  { re: /(科学|技術|物理|数学|化学|生物|宇宙|工学)/i, key: '科学・技術' },
  { re: /(IT|プログラ|パソコン|エンジニア|AI|データ|開発|Web|アプリ)/i, key: 'IT・パソコン' },
  { re: /(小説|エッセイ|文学|物語|ミステリ)/i, key: '小説・エッセイ' },
  { re: /(旅行|アウトドア|留学|キャンプ|旅)/i, key: '旅行・アウトドア' },
  { re: /(スポーツ|趣味|音楽|美術|アート|写真|ゲーム)/i, key: '趣味・スポーツ' },
  { re: /(資格|英語|語学|検定|勉強|学習|TOEIC|受験)/i, key: '語学・学習' },
  { re: /(漫画|マンガ|コミック)/i, key: '漫画' },
];
export function tagToThemeKey(tag) {
  const t = (tag || '').toString();
  for (const h of TAG_THEME_HINTS) if (h.re.test(t)) return h.key;
  return null;
}

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

// 🧹 書店員POP の localStorage キャッシュ（orime.pop.<date>.<id>）は日付キーで貯まる。
// 今日以外の古いキーを掃除して無制限成長を防ぐ（監査 P6）。呼び出し失敗は無視。
export function cleanupStalePopCache() {
  try {
    const today = `orime.pop.${dateKey()}.`;
    const stale = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('orime.pop.') && !k.startsWith(today)) stale.push(k);
    }
    stale.forEach((k) => { try { localStorage.removeItem(k); } catch { /* noop */ } });
  } catch { /* private mode 等では no-op */ }
}

// トレンド寄りのローテ候補（ビジネスパーソンの時代感度＋ぶらぶらの意外性）。
// ビジネス/人文/新書/科学 を軸に、小説・暮らしも混ぜて出会いを広げる。
const TREND_POOL = [
  'ビジネス・経済', '人文・思想', '新書', '科学・技術',
  '小説・エッセイ', '暮らし・健康', 'IT・パソコン', '旅行・アウトドア',
];

// その日の「今日の平台」テーマ。offset を変えると別の棚を選べる。
// フォールバックは必ず「有効なテーマキー」を返す（'ビジネス' はラベルで API に無効）。
const FALLBACK_THEME = 'ビジネス・経済';
export function pickDailyTheme(offset = 0, pool = TREND_POOL) {
  if (!pool.length) return FALLBACK_THEME;
  const i = (dayOfYear() + offset) % pool.length;
  return pool[(i + pool.length) % pool.length];
}

// 「あえての一冊」用テーマ。ユーザーの関心（excludeKeys）から少し外して、
// 畑違いの出会いを誘う。⚠️ プールは「読み物」ジャンルに限定する —
// 資格・検定/語学・学習は中身がほぼ問題集・教科書（勉強道具）で、
// 「あえての一冊」に TOEIC 問題集が出る事故の温床だった。IT（技術書中心）と
// 漫画（巻数もの中心）も serendipity の一冊としては外し、テーマの棚チップから
// 明示的に選べる形に残す。
const SERENDIPITY_POOL = [
  'ビジネス・経済', '人文・思想', '新書', '小説・エッセイ',
  '暮らし・健康', '科学・技術', '旅行・アウトドア', '趣味・スポーツ',
];
export function pickSerendipityTheme(excludeKeys = []) {
  const all = SERENDIPITY_POOL;
  if (!all.length) return FALLBACK_THEME;
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
const _inflight = new Map(); // `${theme}|${sort}` -> Promise（同時同一リクエストの重複排除）
const CLIENT_TTL_MS = 10 * 60 * 1000;

/**
 * テーマ別の新着 / 人気の本を取得。
 * 同じ theme|sort が同時に複数回呼ばれても、実際の fetch は 1 回に集約する
 * （複数の棚が同じ日替わりテーマに解決した時の二重リクエストを防ぐ・監査 P1）。
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
  // 進行中の同一リクエストがあれば相乗り（signal は個別だが、共有取得の結果を待つ）。
  const pending = _inflight.get(cacheKey);
  if (pending) return pending;

  const run = (async () => {
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
    } finally {
      _inflight.delete(cacheKey);
    }
  })();
  _inflight.set(cacheKey, run);
  return run;
}

export default fetchDiscover;
