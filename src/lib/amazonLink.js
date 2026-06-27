// Amazon Associate (アソシエイト) link helpers.
//
// The whole codebase routes through these two functions so the tracking
// tag, URL shape, and disclosure copy live in exactly one place. Keep
// AMAZON_TAG in sync with the merchant account on Amazon Associates JP.

export const AMAZON_TAG = 'leveragereading-22';

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

/**
 * The disclosure copy required by Amazon Associates JP — every page that
 * surfaces an affiliate link must show this near the link.
 */
export const AMAZON_DISCLOSURE_TEXT =
  '※当アプリは Amazon アソシエイト・プログラムの参加者です。リンク経由の購入により紹介料が発生する場合があります（追加費用はかかりません）。';

export const AMAZON_LINK_REL = 'noopener noreferrer sponsored';
