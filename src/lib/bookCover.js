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
 * - 1: Google Books (日本書籍 + 洋書のカバー率が一番高い。安定稼働)
 * - 2: Amazon ISBN-10 パターン (978 prefix のみ。openBD が落ちている間の保険)
 * - 3: openBD (2026-05 から `cover.openbd.jp` が CloudFront 404 を返すように
 *      なったため一時的に最下位へ。復旧したら自動で再活用される)
 *
 * 候補リストは「保存に直接使える URL」と「resolveCoverUrl で実在検証を
 * 通すための URL」を兼ねる。
 */
export const getCoverCandidates = (isbn) => {
  const i13 = normalizeIsbn(isbn);
  const i10 = isbn13to10(i13);
  const list = [];
  // Google Books のサムネは zoom=1 で 128×180-210 の JPEG を返す。本が無い時は
  // 128×170 の小さい PNG プレースホルダー (`No cover available`) になる —
  // checkImageExists の h/w 閾値 (>= 1.35) で弾く。
  if (i13) {
    list.push(`https://books.google.com/books/content?vid=ISBN${i13}&printsec=frontcover&img=1&zoom=1`);
  }
  if (i10) {
    list.push(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`);
  }
  if (i13) {
    list.push(`https://cover.openbd.jp/${i13}.jpg`);
  }
  return list;
};

// 画像が「実体として存在するか」をブラウザでロードして確認する。
// 単純な 1×1 placeholder だけでなく、「No image」ロゴ画像 (NDL / Google Books が
// 返す数十〜180 px の正方形・横長画像) も弾くため、以下 3 段階で判定する:
//   1. 画像が読めない                  → 偽
//   2. naturalWidth < 50              → 偽 (placeholder 規模)
//   3. height/width < 1.35            → 偽 (Google Books の 128×170 PNG プレース
//                                        ホルダー = h/w 1.328 は除外。本の表紙は
//                                        ほぼ 1.4-1.6)
// 3 秒で打ち切り。crossOrigin は付けない (CORS 未対応の openBD/Amazon
// が読めなくなる。naturalWidth/Height はクロスオリジン画像でも取得可)。
const checkImageExists = (url) =>
  new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 50 || h < 50) { settle(false); return; }      // 1×1 / 小さい placeholder
      if (h / w < 1.35) { settle(false); return; }           // 平たい = Google Books の「No cover」(128×170) や横長ロゴ
      settle(true);
    };
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
    const ok = await checkImageExists(url);
    if (ok) return url;
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
    if (url) {
      return { isbn, url };
    }
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

/**
 * 完全な表紙解決パイプライン。「本の追加時」「再取得ボタン」「backfill」
 * すべてが同じロジックを通るための単一エントリポイント。
 *
 *   1. findIsbnCandidates でタイトル+著者から ISBN 候補を集める (NDL + Google
 *      Books の厳格マッチ後の配列)
 *   2. resolveCoverFromCandidates でプライマリ ISBN + 候補を順に試行
 *   3. それでもダメなら primary ISBN だけで resolveCoverUrl で再試行
 *
 * 戻り値: { url, isbn }。url が null/'' なら全部失敗 → 手動アップロード案内。
 *
 * 注: 循環依存を避けるため findIsbnCandidates は引数 inject。
 * App.jsx 側で `import { findIsbnCandidates } from './bookSearch'` した上で
 * `fullyResolveCover(book, findIsbnCandidates)` の形で呼ぶ。
 */
export const fullyResolveCover = async (book, findIsbnCandidates) => {
  const title = (book?.title || '').trim();
  const author = (book?.author || '').trim();
  const primary = book?.isbn || '';

  let url = '';
  let resolvedIsbn = '';

  // ★ ステップ 1: プライマリ ISBN を最優先 (絶対に正しい本の表紙)。
  // タイトル + 著者検索ベースの候補は誤マッチリスクがあるので、
  // primary ISBN で取れるなら他の候補は試さない。
  if (primary) {
    try {
      const v = await tryCoverForIsbn(primary);
      if (v) {
        return { url: v, isbn: primary };
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[fullyResolveCover] primary phase failed:', e?.message || e);
    }
  }

  // ステップ 2: primary で取れなかった時のみ、厳格マッチ後の候補 ISBN を試す
  try {
    if ((title || author) && typeof findIsbnCandidates === 'function') {
      const altIsbns = await findIsbnCandidates(title, author);
      if (altIsbns.length > 0) {
        const r = await resolveCoverFromCandidates(altIsbns);
        if (r.url) {
          url = r.url;
          resolvedIsbn = r.isbn || '';
        }
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[fullyResolveCover] candidate phase failed:', e?.message || e);
  }

  return { url, isbn: resolvedIsbn };
};
