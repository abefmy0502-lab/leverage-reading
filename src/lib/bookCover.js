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
// 単純な 1×1 placeholder だけでなく、「No image」ロゴ画像 (NDL 等が
// 返す数十 px の正方形・横長画像) も弾くため、以下 3 段階で判定する:
//   1. 画像が読めない                  → 偽
//   2. naturalWidth < 50              → 偽 (placeholder 規模)
//   3. height/width < 0.8 (横長)      → 偽 (本の表紙はほぼ縦長 ~1.4)
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
      if (h / w < 0.8) { settle(false); return; }            // 横長 = 「No image」ロゴが多い
      settle(true);
    };
    img.onerror = () => settle(false);
    img.src = url;
    setTimeout(() => settle(false), 3000);
  });

/**
 * 1 つの ISBN について openBD と Amazon を順に試す。最初に通った URL を返す。
 * resolveCoverUrl の単 ISBN 版エイリアス兼、複数候補ループの構成要素。
 * 各候補の試行結果を console.log に残す (table 形式で見やすく)。
 */
export const tryCoverForIsbn = async (isbn) => {
  const candidates = getCoverCandidates(isbn);
  for (const url of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await checkImageExists(url);
    if (typeof console !== 'undefined') {
      console.log(`[cover]   try ${isbn} → ${url} → ${ok ? 'OK' : '×'}`);
    }
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
 *
 * 詳細ログ: 試行する ISBN 群 + 各 ISBN/URL の OK/× を console に出して、
 * 「なぜ取れなかったか」をユーザーが開発者ツールで追跡できるようにする。
 */
export const resolveCoverFromCandidates = async (isbnList) => {
  const unique = [...new Set((isbnList || []).map((s) => s && String(s).replace(/[-\s]/g, '')).filter(Boolean))]
    .slice(0, MAX_ISBNS_TO_TRY);
  if (typeof console !== 'undefined') {
    console.log('[cover] resolving from candidates:', unique);
  }
  for (const isbn of unique) {
    // eslint-disable-next-line no-await-in-loop
    const url = await tryCoverForIsbn(isbn);
    if (url) {
      if (typeof console !== 'undefined') {
        console.log('[cover] ✅ resolved:', { isbn, url });
      }
      return { isbn, url };
    }
  }
  if (typeof console !== 'undefined') {
    console.log('[cover] ❌ all candidates failed. Manual upload recommended.');
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

  try {
    if ((title || author) && typeof findIsbnCandidates === 'function') {
      const altIsbns = await findIsbnCandidates(title, author);
      const ordered = [primary, ...altIsbns].filter(Boolean);
      if (ordered.length > 0) {
        const r = await resolveCoverFromCandidates(ordered);
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

  if (!url && primary) {
    try {
      const v = await resolveCoverUrl(primary);
      if (v) {
        url = v;
        resolvedIsbn = primary;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[fullyResolveCover] primary phase failed:', e?.message || e);
    }
  }

  return { url, isbn: resolvedIsbn };
};
