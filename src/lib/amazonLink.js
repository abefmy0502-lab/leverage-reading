// Amazon Associate (アソシエイト) link helpers.
//
// The whole codebase routes through these two functions so the tracking
// tag, URL shape, and disclosure copy live in exactly one place. Keep
// AMAZON_TAG in sync with the merchant account on Amazon Associates JP.

// VITE_AMAZON_TAG で差し替え可（アソシエイト・セントラルの「トラッキング ID の管理」で
// Orime 名の ID を追加して設定する。URL に出るので旧名を見せないため）。
export const AMAZON_TAG = import.meta.env.VITE_AMAZON_TAG || 'leveragereading-22';

const AMAZON_BASE = 'https://www.amazon.co.jp';

function withTag(url) {
  // Amazon needs the tag as a query param; keep the path/search untouched.
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}tag=${AMAZON_TAG}`;
}

function cleanIdentifier(s) {
  return (s || '').replace(/[-\s]/g, '').trim();
}

// 書籍の Amazon ASIN は基本 ISBN-10 と一致する。ISBN-13（978 始まり）は
// アルゴリズムで ISBN-10 に変換できるので、検索ページではなく商品ページ
// (/dp/{isbn10}) に直接着地させられる（他の商品が混ざらない）。
function isbn13to10(isbn13) {
  const s = cleanIdentifier(isbn13);
  if (s.length !== 13 || !s.startsWith('978') || !/^\d{13}$/.test(s)) return '';
  const core = s.slice(3, 12); // 978 の後ろ 9 桁
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += parseInt(core[i], 10) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

// 与えられた識別子から「商品ページに使える ISBN-10 / ASIN」を返す（無ければ空）。
function toProductAsin(raw) {
  const id = cleanIdentifier(raw).toUpperCase();
  if (!id) return '';
  if (/^\d{9}[\dX]$/.test(id)) return id;           // 既に ISBN-10（= ASIN）
  if (id.length === 13) return isbn13to10(id);      // ISBN-13 → ISBN-10（978 のみ）
  return '';
}

/**
 * Build the best Amazon link we can for a book.
 *
 * Priority:
 *   1. ASIN / ISBN-10 / ISBN-13(978) → /dp/{asin}  (商品ページに直接着地)
 *   2. ISBN(変換不可: 979 等)        → /s?k={isbn}  (ISBN 検索フォールバック)
 *   3. title                          → /s?k={title author}
 *
 * `book` only needs `{ asin?, isbn?, title, author? }`.
 */
export function getAmazonLink(book) {
  if (!book) return AMAZON_BASE;

  // ASIN（明示）→ ISBN-10/13 から導出、の順で「商品ページ直リンク」を狙う。
  const asin = toProductAsin(book.asin) || toProductAsin(book.isbn);
  if (asin) {
    return withTag(`${AMAZON_BASE}/dp/${asin}`);
  }

  // 商品ページにできない ISBN（979 始まり等）だけ ISBN 検索にフォールバック。
  const isbn = cleanIdentifier(book.isbn);
  if (isbn) {
    return withTag(`${AMAZON_BASE}/s?k=${encodeURIComponent(isbn)}`);
  }

  return getAmazonSearchLink(book.title || '', book.author || '');
}

/**
 * Search-only fallback for AI-suggested books that don't have an ISBN
 * yet (related-books section, advisor recommendations, etc.).
 */
export function getAmazonSearchLink(title, author = '') {
  const q = `${title || ''}${author ? ` ${author}` : ''}`.trim();
  if (!q) return AMAZON_BASE;
  return withTag(`${AMAZON_BASE}/s?k=${encodeURIComponent(q)}`);
}

// ── Amazon アプリ ディープリンク（一撃でログイン状態の商品ページへ）───────────
//
// 問題: ホーム追加した PWA / ネイティブアプリ内から target="_blank" で開くと、
//   Safari 本体や Amazon アプリとセッション（Cookie）を共有しない“その場限りの
//   アプリ内ブラウザ”が立ち上がり、Amazon が「ログアウト状態」で表示される。
// 解決: その文脈に限り、Amazon iOS アプリのカスタム URL スキームに投げると、
//   ログイン済みの Amazon アプリが商品ページを直接開く。未インストール時のみ
//   Web にフォールバック。
// ⚠️ 通常のブラウザタブ（素の Safari / PC / Android）では発動させない。
//   そこでは <a target="_blank"> がそのまま「本物のブラウザ＝ログイン済み
//   セッション」なので、スキーム試行は OS のエラーアラートや現在タブの置換
//   という害しかない。
const AMAZON_APP_SCHEME = 'com.amazon.mobile.shopping.web://';

// https://www.amazon.co.jp/... → com.amazon.mobile.shopping.web://www.amazon.co.jp/...
//   パス・検索・tag はそのまま温存（getAmazonLink が組んだ URL を流用するだけ）。
function toAppLink(httpsUrl) {
  if (typeof httpsUrl !== 'string') return '';
  return httpsUrl.replace(/^https:\/\//i, AMAZON_APP_SCHEME);
}

function isIOSLike() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPhone/iPad/iPod、および iPadOS（Mac を名乗るがタッチ可）を iOS 扱い。
  return /iPad|iPhone|iPod/.test(ua)
    || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
}

// 「ブラウザタブではない」文脈＝ホーム追加 PWA / Capacitor ネイティブ。
// in-app ブラウザのセッション分断が実在するのはここだけ。
function isAppContext() {
  try {
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true; // iOS A2HS
    if (typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (typeof window !== 'undefined' && window.Capacitor
      && typeof window.Capacitor.isNativePlatform === 'function'
      && window.Capacitor.isNativePlatform()) return true;
  } catch { /* 判定に失敗したら通常ブラウザ扱い（安全側） */ }
  return false;
}

/**
 * Amazon リンクの onClick ハンドラ。<a href={httpsUrl} target="_blank"> に添えて使う。
 *
 * - 通常のブラウザタブ / PC / Android / 修飾キー付きクリック → 何もしない
 *   （preventDefault しない＝ブラウザ標準の新規タブ挙動。Safari 本体は
 *   ログイン済みセッションを共有しているのでそれが最善）。
 * - iOS のホーム追加 PWA / ネイティブのみ → 既定挙動を止めて Amazon アプリの
 *   ディープリンクを試し、未インストールなら Web にフォールバック。
 */
export function handleAmazonClick(e, httpsUrl) {
  if (!httpsUrl || typeof window === 'undefined') return;
  // 修飾キー / 中クリックは「別タブ/別窓で開きたい」意思。乗っ取らない。
  if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1)) return;
  if (!isIOSLike() || !isAppContext()) return; // 既定の <a target="_blank"> に任せる

  const appUrl = toAppLink(httpsUrl);
  if (!appUrl) return;
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  // Amazon アプリが開けばこのページは背面化する（visibility hidden / pagehide /
  // blur — 「"Amazon"で開きますか?」の確認ダイアログでも blur が出る）。
  // その合図でフォールバックをキャンセル。前面のままなら未インストールとみなす。
  let settled = false;
  const cleanup = () => {
    document.removeEventListener('visibilitychange', onAway);
    window.removeEventListener('pagehide', onAway);
    window.removeEventListener('blur', onAway);
  };
  const onAway = () => {
    settled = true;
    clearTimeout(timer);
    cleanup();
  };
  const timer = setTimeout(() => {
    cleanup();
    if (!settled && document.visibilityState === 'visible') {
      // 未インストール → Web へ。まず新規コンテキスト（PWA では in-app
      // ブラウザ overlay）を試し、ブロックされたら同面遷移で救済。
      const w = window.open(httpsUrl, '_blank', 'noopener,noreferrer');
      if (!w) window.location.href = httpsUrl;
    }
  }, 1500);

  document.addEventListener('visibilitychange', onAway, { once: true });
  window.addEventListener('pagehide', onAway, { once: true });
  window.addEventListener('blur', onAway, { once: true });
  window.location.href = appUrl;
}

/**
 * The disclosure copy required by Amazon Associates JP — every page that
 * surfaces an affiliate link must show this near the link.
 */
export const AMAZON_DISCLOSURE_TEXT =
  '※当アプリは Amazon アソシエイト・プログラムの参加者です。リンク経由の購入により紹介料が発生する場合があります（追加費用はかかりません）。';

export const AMAZON_LINK_REL = 'noopener noreferrer sponsored';
