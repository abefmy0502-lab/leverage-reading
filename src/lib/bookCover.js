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

// 🛰️ サーバーサイドの表紙リゾルバ（/api/cover）に問い合わせる第一経路。
// サーバーは「タイトル+著者 → 正しい ISBN」の解決が得意（NDL OpenSearch は
// データセンター IP でも 429/CORS にならない）。ただし書影画像そのものの
// fetch はサーバーだと 403 で弾かれることがあるため、サーバーは候補 URL の
// リスト（candidates）も返す。ここでブラウザの <img> ロードで実在検証する
// （ブラウザは Referer/UA を付けるので 403 にならず、CSP も許可済み）。
// 返り値 { url, isbn } または null（失敗・未発見）。
export const resolveCoverViaServer = async ({ title, author, isbn } = {}) => {
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (author) params.set('author', author);
  if (isbn) params.set('isbn', isbn);
  if ([...params.keys()].length === 0) return null;
  // 🧹 キャッシュ毒抜き: リゾルバのロジックを変えたら必ずこの番号を上げる。
  //    壊れていた時期に CDN へ張り付いた空っぽ応答（s-maxage 最長 7 日）を
  //    新しい URL で確実に回避するため。
  params.set('cv', '4');
  try {
    const r = await fetch(`/api/cover?${params.toString()}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (!d) return null;
    const resolvedIsbn = d.isbn || isbn || '';
    // ① サーバーが server-side 検証を通した cover があれば、それを最優先で
    //    ブラウザ側でも一応検証して採用（速い）。
    if (d.cover && (await checkImageExists(d.cover))) {
      return { url: d.cover, isbn: resolvedIsbn };
    }
    // ② サーバーが返した候補 URL を順にブラウザ側で実在検証（403 回避の本命）。
    const candidates = Array.isArray(d.candidates) ? d.candidates : [];
    for (const u of candidates) {
      // eslint-disable-next-line no-await-in-loop
      if (await checkImageExists(u)) return { url: u, isbn: resolvedIsbn };
    }
    return null;
  } catch {
    return null;
  }
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
  // 並び順 = 「鍵不要・レート制限なし・和書カバー率が高い」順。各 URL は
  // checkImageExists が <img> ロードで実在検証する（1×1 / 平たいプレースホルダーは
  // 弾く）ので、存在しない本のダミー画像が cover に保存されることはない。
  //
  // ① NDL（国立国会図書館）書影 — 和書のカバー率が非常に高く、鍵不要・無制限。
  //    登録の無い本は 404 か 1×1 を返すので checkImageExists が安全に弾く。
  if (i13) {
    list.push(`https://ndlsearch.ndl.go.jp/thumbnail/${i13}.jpg`);
  }
  // ② openBD — 和書書影の定番（一時的に CloudFront 404 を返す時期があったが、
  //    生きていれば高品質。死んでいても checkImageExists が弾くだけで無害）。
  if (i13) {
    list.push(`https://cover.openbd.jp/${i13}.jpg`);
  }
  // ③ Open Library — 鍵不要・無制限。?default=false で未登録時は 404（誤検出防止）。
  if (i13) {
    list.push(`https://covers.openlibrary.org/b/isbn/${i13}-L.jpg?default=false`);
  }
  // ④ Google Books コンテンツ URL（無料だが匿名はレート制限 429 になりやすい）。
  if (i13) {
    list.push(`https://books.google.com/books/content?vid=ISBN${i13}&printsec=frontcover&img=1&zoom=1`);
  }
  // ⑤⑥ Amazon の書影 CDN（ISBN-10 ベース。新旧ホスト両方を試す）。
  if (i10) {
    list.push(`https://m.media-amazon.com/images/P/${i10}.09._SCLZZZZZZZ_.jpg`);
    list.push(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`);
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
export const checkImageExists = (url) =>
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
    // モバイル回線で実在する表紙を時間切れで取りこぼさないよう 5 秒に延長。
    setTimeout(() => settle(false), 5000);
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
