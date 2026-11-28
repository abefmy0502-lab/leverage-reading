// 楽天ブックスのリンクヘルパー（Amazon と並べて「両方の購入先」を出すため）。
//
// 方針:
//   1. 本が既に楽天の直リンク（話題の本タブの実データ＝affiliateUrl/itemUrl）を
//      持っていればそれを最優先（アフィリエイト設定時はそのまま紹介料が付く）。
//   2. ISBN があれば ISBN で楽天ブックス検索に着地。
//   3. どちらも無ければ タイトル＋著者 で検索。
//
// クライアント側でアフィリエイトIDは扱わない（サーバー専用の RAKUTEN_AFFILIATE_ID
// のみ）。検索リンクは素のままで、話題の本の直リンクだけがアフィリエイト対応。

const RAKUTEN_BOOKS_BASE = 'https://books.rakuten.co.jp';

function clean(s) {
  return (s || '').toString().replace(/[-\s]/g, '').trim();
}

// 直リンクを href に流す前に「https の楽天ドメインである」ことを厳密検証する。
// 部分一致（`?x=rakuten.co.jp` や `javascript:` 混入）を弾く防御（監査 S5）。
function isSafeRakutenUrl(u) {
  try {
    const p = new URL(u);
    if (p.protocol !== 'https:') return false;
    const host = p.hostname.toLowerCase();
    return host === 'rakuten.co.jp' || host.endsWith('.rakuten.co.jp');
  } catch {
    return false;
  }
}

/**
 * 本に対する最善の楽天ブックスリンクを作る。
 * `book` は `{ rakutenUrl?, url?, isbn?, title?, author? }` を見る。
 */
export function getRakutenLink(book) {
  if (!book) return RAKUTEN_BOOKS_BASE;
  // 楽天の商品/アフィリエイトURL（話題の本タブの実データ）が最優先。ホスト厳密検証つき。
  const direct = (book.rakutenUrl || book.url || '').toString();
  if (isSafeRakutenUrl(direct)) return direct;

  const isbn = clean(book.isbn);
  if (isbn) return `${RAKUTEN_BOOKS_BASE}/search?sitem=${encodeURIComponent(isbn)}`;

  const q = `${book.title || ''}${book.author ? ` ${book.author}` : ''}`.trim();
  if (q) return `${RAKUTEN_BOOKS_BASE}/search?sitem=${encodeURIComponent(q)}`;
  return RAKUTEN_BOOKS_BASE;
}

export const RAKUTEN_LINK_REL = 'noopener noreferrer';

// Amazon / 楽天 の両方を出す画面で使う開示文。
//   2026-11-26 オーナー「これは記載しないといけない？」→ Amazon アソシエイトの運営規約が求める決まった文だけに短くした。
//   楽天のリンクはアフィリエイトの ID を付けていない（ふつうの検索のリンク）ので、楽天アフィリエイトの文は外した
//   （参加していないのに書くと事実と違う）。楽天のアフィリエイトを始めたら、ここに足す。
export { AMAZON_DISCLOSURE_TEXT as STORE_DISCLOSURE_TEXT } from './amazonLink.js';
