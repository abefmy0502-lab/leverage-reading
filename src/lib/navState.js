// 🔁 画面復元（ナビゲーション状態の退避）
//
// iOS のホーム画面アプリ（PWA / WKWebView）は、少しアプリを離れただけで OS が
// プロセスを破棄し、戻った時に白紙からリロードされることがある。リロード自体は
// アプリ側で防げないため、「直前に見ていた画面」を軽量に保存しておき、
// 一定時間内の再起動なら同じ画面に静かに復元する（ネイティブアプリの
// 「一定時間はそのままの画面に戻る」挙動の再現）。
//
// 保存するのはナビゲーション座標だけ（tab / サブタブ / 開いていた本の id）。
// フォームの下書き等は対象外 — 復元が複雑になるうえ、中途半端な復元は
// データ事故のもと。編集画面（view='edit'）は安全側に倒して詳細画面として復元する。
//
// 期限切れ（既定 60 分）後の起動は通常のコールドスタート（本棚 or 前回タブ）。
// 「朝開いたら昨夜の画面のまま」は逆に混乱するため、無期限にはしない。

const KEY = 'orime-nav-resume-v1';
const MAX_AGE_MS = 60 * 60 * 1000; // 60 分

export function saveNavState(state) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch { /* 保存できない環境では復元しないだけ */ }
}

export function loadNavState(maxAgeMs = MAX_AGE_MS) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return null;
    if (!Number.isFinite(s.savedAt) || Date.now() - s.savedAt > maxAgeMs) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearNavState() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
