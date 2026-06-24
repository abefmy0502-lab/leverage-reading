// 📚 重複本検出ヘルパー
//
// useBooks がメモリに保持している books 配列に対して、追加候補が既に存在するか
// 同期的に判定する (DB 往復ゼロ)。useBooks は CRUD 後に必ず refetch するので
// state は概ね最新。
//
// マッチ規則:
//   1. ISBN 同士の正規化比較 — ISBN-10 / ISBN-13 のどちらの表記でも同じ書誌は
//      同じ ISBN-13 にキャノニカライズしてから比較する (例: 4492557717 ↔
//      9784492557716 は同一書籍扱い)。
//   2. ISBN が片方/両方無ければ、title (lower / 全角半角統一) と author (lower)
//      の組み合わせ。
//
// 戻り値: マッチした book オブジェクト (= books[i]) もしくは null。

// ISBN-10 → ISBN-13 (978 prefix) コンバータ。末尾チェックディジットは
// EAN-13 のアルゴリズムで再計算する。X (ISBN-10 の '10' を表す) を含む
// 入力にも対応。失敗時は入力をそのまま返す。
function isbn10to13(isbn10) {
  if (!isbn10 || isbn10.length !== 10) return isbn10 || '';
  const core = `978${isbn10.slice(0, 9)}`;
  if (!/^\d{12}$/.test(core)) return isbn10;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

const normalizeIsbn = (raw) => {
  if (!raw) return '';
  // ハイフン / 空白 / アンダースコアを剥がし、ISBN-10 の X 末尾は大文字に統一。
  const cleaned = String(raw).replace(/[-\s_]/g, '').trim().toUpperCase();
  // 13 桁数字 (978/979 prefix の ISBN-13) → そのままキャノニカル形。
  if (/^\d{13}$/.test(cleaned)) return cleaned;
  // 10 桁 (末尾 0-9 or X) → ISBN-13 (978 prefix) に変換して比較。
  if (/^\d{9}[\dX]$/.test(cleaned)) {
    return isbn10to13(cleaned);
  }
  // 不明な形式は best-effort でそのまま (短縮 ISBN や非標準入力)。
  return cleaned;
};

const normalizeText = (raw) => {
  if (!raw) return '';
  return String(raw)
    // NFKC で全角/半角 + ローマ字を統一
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * @param {Array} books        useBooks が返す配列
 * @param {Object} candidate   { isbn?, title?, author? } 追加候補
 * @returns {Object|null}      重複している既存 book、または null
 */
export function findDuplicateBook(books, candidate) {
  if (!Array.isArray(books) || books.length === 0) return null;
  if (!candidate) return null;

  const candIsbn = normalizeIsbn(candidate.isbn);
  const candTitle = normalizeText(candidate.title);
  const candAuthor = normalizeText(candidate.author);

  // 1) ISBN 厳密一致を最優先
  if (candIsbn) {
    const byIsbn = books.find((b) => normalizeIsbn(b.isbn) === candIsbn);
    if (byIsbn) return byIsbn;
  }

  // 2) title + author マッチ。タイトルが空なら判定不能なので null。
  if (!candTitle) return null;

  return (
    books.find((b) => {
      const bTitle = normalizeText(b.title);
      if (bTitle !== candTitle) return false;
      const bAuthor = normalizeText(b.author);
      // 著者は片方が空なら通す (空＝指定無し)。両方ある時だけ一致を要求。
      if (candAuthor && bAuthor && candAuthor !== bAuthor) return false;
      return true;
    }) || null
  );
}

// ステータスラベル (重複ダイアログ表示用)。本棚側でも同じ表記が他箇所にある
// が、ここから import する循環参照を避けるために再掲する。
export const STATUS_LABEL = {
  want: '読みたい',
  before: '積読',
  reading: '読書中',
  done: '読了',
};

// Postgres UNIQUE 制約違反を判定するヘルパー (catch ブロックで使う)
export function isUniqueViolation(error) {
  if (!error) return false;
  const code = error.code || '';
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '23505'
    || msg.includes('duplicate key')
    || msg.includes('books_user_isbn_unique')
    || msg.includes('books_user_title_author_unique')
  );
}
