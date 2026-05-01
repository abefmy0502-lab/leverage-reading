// 📚 Book cover resolution.
//
// 5 回目の修正での全面書き直し。これまでの実装は NDL の thumbnail URL を
// 「あれば cover に入れる」方針で動いていたが、NDL は登録のない本にも
// HTTP 200 で 1×1 透過の placeholder 画像を返すことがあり、ブラウザの
// onError は発火しないまま空の画像が表示されていた → これがユーザーに
// 「?」アイコンに見えていた根本原因。
//
// 設計方針:
//   - openBD (`https://cover.openbd.jp/{ISBN-13}.jpg`) を最優先。日本書籍
//     の網羅性は群を抜いて高い
//   - 次点で Amazon の `images-na.ssl-images-amazon.com/images/P/{ISBN-10}.09.LZZZZZZZ.jpg`
//     パターン (洋書 / openBD に無い和書のフォールバック)
//   - 表示側でも `naturalWidth > 1` の判定で 1×1 dummy を弾く (ここの lib と
//     img タグの onLoad の二段構え)
//
// このモジュールは pure。React に依存しない。

export const normalizeIsbn = (isbn) => {
  if (!isbn) return '';
  return String(isbn).replace(/[-\s]/g, '');
};

// ISBN-13 → ISBN-10 変換。9784〜 のような 978 prefix 付き ISBN-13 のみ
// 対応 (979 prefix の新ISBN は ISBN-10 が存在しない仕様)。
export const isbn13to10 = (isbn13) => {
  const i = normalizeIsbn(isbn13);
  if (i.length !== 13 || !i.startsWith('978')) return null;
  const core = i.slice(3, 12);
  let sum = 0;
  for (let j = 0; j < 9; j += 1) sum += (10 - j) * parseInt(core[j], 10);
  const check = (11 - (sum % 11)) % 11;
  const checkChar = check === 10 ? 'X' : String(check);
  return core + checkChar;
};

/**
 * 表紙 URL の候補を優先順で返す。
 * - 1: openBD (日本書籍カバー率最強)
 * - 2: Amazon ISBN-10 パターン (フォールバック)
 *
 * 候補リストは「保存に直接使える URL」と「resolveCoverUrl で実在検証を
 * 通すための URL」を兼ねる。
 */
export const getCoverCandidates = (isbn) => {
  const i13 = normalizeIsbn(isbn);
  const i10 = isbn13to10(i13);
  const list = [];
  if (i13) list.push(`https://cover.openbd.jp/${i13}.jpg`);
  if (i10) list.push(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`);
  return list;
};

// 画像が「実体として存在するか」をブラウザでロードして確認する。
// HTTP 200 でも 1×1 placeholder を返す API があるため、`naturalWidth > 1`
// の値で本物かどうかを判定する。3 秒で打ち切り。
const checkImageExists = (url) =>
  new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    const img = new Image();
    img.onload = () => settle(img.naturalWidth > 1);
    img.onerror = () => settle(false);
    img.src = url;
    setTimeout(() => settle(false), 3000);
  });

/**
 * 1 つの ISBN について openBD と Amazon を順に試す。最初に通った URL を返す。
 * resolveCoverUrl の単 ISBN 版エイリアス兼、複数候補ループの構成要素。
 */
export const tryCoverForIsbn = async (isbn) => {
  const candidates = getCoverCandidates(isbn);
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await checkImageExists(url)) return url;
  }
  return null;
};

const MAX_ISBNS_TO_TRY = 5;

/**
 * 複数の ISBN 候補（ハードカバー / 文庫 / 新装版 …）を順に試し、最初に
 * 画像が見つかった `{ isbn, url }` を返す。すべて失敗したら
 * `{ isbn: <先頭>, url: null }`。
 *
 * 同一書籍でもエディションごとに ISBN が違うため、書誌情報の主 ISBN
 * (= primaryIsbn) で表紙が落ちなくても、別エディションで取れる確率が
 * 高い。MAX_ISBNS_TO_TRY で試行回数の上限をかけて API 負荷を抑制。
 */
export const resolveCoverFromCandidates = async (isbnList) => {
  const unique = [...new Set((isbnList || []).map((s) => s && String(s).replace(/[-\s]/g, '')).filter(Boolean))]
    .slice(0, MAX_ISBNS_TO_TRY);
  for (const isbn of unique) {
    // eslint-disable-next-line no-await-in-loop
    const url = await tryCoverForIsbn(isbn);
    if (url) return { isbn, url };
  }
  return { isbn: unique[0] || null, url: null };
};

/**
 * ISBN から実際にロードできる cover URL を 1 つ返す。なければ null。
 * 候補を順に当たり、最初に通ったものを採用する (no-store / no-cors の
 * 影響を避けるため fetch ではなく `<img>` ロードで判定)。
 */
export const resolveCoverUrl = async (isbn) => {
  const candidates = getCoverCandidates(isbn);
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkImageExists(url);
    if (ok) return url;
  }
  return null;
};
