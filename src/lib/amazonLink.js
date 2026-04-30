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

/**
 * Build the best Amazon link we can for a book.
 *
 * Priority:
 *   1. ASIN  → /dp/{asin}        (direct product page)
 *   2. ISBN  → /s?k={isbn}       (search by ISBN — usually 1 hit, opens product)
 *   3. title → /s?k={title author}
 *
 * `book` only needs `{ asin?, isbn?, title, author? }`.
 */
export function getAmazonLink(book) {
  if (!book) return AMAZON_BASE;

  const asin = cleanIdentifier(book.asin);
  if (asin) {
    return withTag(`${AMAZON_BASE}/dp/${encodeURIComponent(asin)}`);
  }

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
