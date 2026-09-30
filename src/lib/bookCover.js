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

import { apiUrl } from './apiUrl';

export const normalizeIsbn = (isbn) => {
  if (!isbn) return '';
  return String(isbn).replace(/[-\s]/g, '');
};

// 🛰️ サーバーサイドの表紙リゾルバ（/api/cover）に問い合わせる第一経路。
// サーバーは「タイトル+著者 → 正しい ISBN」の解決が得意（楽天・NDL OpenSearch は
// データセンター IP でも 429/CORS にならない）。ただし書影画像そのものの
// fetch はサーバーだと 403 で弾かれることがあるため、サーバーは候補 URL の
// リスト（candidates）も返す。ここでブラウザの <img> ロードで実在検証する
// （ブラウザは Referer/UA を付けるので 403 にならず、CSP も許可済み）。
//
// 戻り値 { status, url, isbn }:
//   status 'found'     … 表紙が見つかった（url）
//          'isbn_only' … 本（isbn）は分かったが、端末で読める表紙が無かった
//          'not_found' … サーバーは答えたが、本も表紙も見つからなかった
//          'error'     … 通信の失敗・時間切れ・5xx・429（「見つからない」とは扱わない）
//   skipUrl: 読めなかった（壊れた）表紙の URL。同じものを返さない。
const SERVER_TIMEOUT_MS = 15000;
export const resolveCoverViaServerDetailed = async ({ title, author, isbn } = {}, { skipUrl = '' } = {}) => {
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (author) params.set('author', author);
  if (isbn) params.set('isbn', isbn);
  if ([...params.keys()].length === 0) return { status: 'not_found', url: '', isbn: '' };
  // 🧹 キャッシュ毒抜き: リゾルバのロジックを変えたら必ずこの番号を上げる。
  //    壊れていた時期に CDN へ張り付いた空っぽ応答（s-maxage 最長 7 日）を
  //    新しい URL で確実に回避するため。
  //    v5: 兄弟本誤マッチ根治（NDL タイトル照合必須）＋楽天ブックスソース追加。
  //    v6: 共著の著者クエリを先頭著者に修正（連結文字列だと NDL/Google が 0 件で
  //        表紙が取れなかった。例: 楠木建・杉浦泰）。旧応答（空）を CDN から無効化。
  //    v7: 候補の並び・ISBN-10 の古い本・副題まで一致を先に・CORS を「*」に（2026-09-30）。
  params.set('cv', '7');
  let d;
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(SERVER_TIMEOUT_MS) : undefined;
    const r = await fetch(apiUrl(`/api/cover?${params.toString()}`), signal ? { signal } : undefined);
    if (!r.ok) return { status: 'error', url: '', isbn: '' };
    d = await r.json();
  } catch {
    return { status: 'error', url: '', isbn: '' };
  }
  if (!d || typeof d !== 'object') return { status: 'error', url: '', isbn: '' };
  const resolvedIsbn = normalizeIsbn(d.isbn || '');
  // ① サーバーの cover（楽天など・サーバーで確かめ済み）→ ② ISBN から作った候補。
  //   どちらも端末の <img> で確かめる。候補は同時に読み、並び順でいちばん前の本物を採る。
  const skip = skipUrl ? String(skipUrl) : '';
  const list = [d.cover, ...(Array.isArray(d.candidates) ? d.candidates : [])]
    .filter((u) => typeof u === 'string' && u && u !== skip);
  const url = await firstLoadableImage(list);
  if (url) return { status: 'found', url, isbn: resolvedIsbn || normalizeIsbn(isbn) };
  if (resolvedIsbn) return { status: 'isbn_only', url: '', isbn: resolvedIsbn };
  return { status: 'not_found', url: '', isbn: '' };
};

// 旧来の呼び方（{ url, isbn } または null）。
export const resolveCoverViaServer = async (book = {}) => {
  const r = await resolveCoverViaServerDetailed(book);
  return r.status === 'found' ? { url: r.url, isbn: r.isbn } : null;
};

// 📖 実在検証: サーバーの表紙リゾルバ（/api/cover?verify=1）に、この (title, author) の本が
//   楽天・NDL・Google のどれかに「書名がはっきり一致し、著者も一致する本」として在るかを聞く。
//   AI 選書のハルシネーション（実在する著者＋存在しない書名・本物に似た頭の架空の書名）を検出する用途。
//   返り値:
//     { exists: true,  isbn, cover, candidates }  実在（一致した本の ISBN・表紙の候補）
//     { exists: false }                            検索元は答えたが、一致する本が無い（実在しない疑い）
//     { exists: null }                             確かめられなかった（通信失敗・レート制限・検索元がどれも使えない）
//   ⚠️ exists:null（確かめられなかった）は「実在しない」とは扱わないが、「実在する」とも扱わない
//     （AI 選書では「確認できませんでした」と出し、本文の書名の許可にも使わない・2026-09-30）。
//   ⚠️ 2026-09-30 まで: 「ISBN が 1 つでも取れたら実在」だった。表紙探しの照合はゆるく、AI が付けた ISBN も
//     信用していたので、架空の書名が実在扱いになっていた（例『BtoB営業を成功させるSPIN営業術』）。
//     判定はサーバー（api/_bookVerify.js）で、書名の強い一致＋著者の一致を見るようにした。
export const verifyBookExists = async ({ title, author, isbn } = {}) => {
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (author) params.set('author', author);
  if (isbn) params.set('isbn', isbn);
  if ([...params.keys()].length === 0) return { exists: false };
  params.set('verify', '1');
  params.set('cv', '7');
  try {
    const r = await fetch(apiUrl(`/api/cover?${params.toString()}`));
    if (!r.ok) return { exists: null };
    const d = await r.json();
    if (!d) return { exists: null };
    // 判定を返さない古いサーバー: ISBN があっても実在とはみなさない（確かめられなかった扱い）。
    const exists = Object.prototype.hasOwnProperty.call(d, 'verified')
      ? (d.verified === true ? true : d.verified === false ? false : null)
      : (d.isbn ? null : false);
    if (exists !== true) return { exists };
    return {
      exists: true,
      isbn: d.isbn || '',
      cover: d.cover || '',
      candidates: Array.isArray(d.candidates) ? d.candidates : [],
    };
  } catch {
    return { exists: null };
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
 * 表紙 URL の候補を「当たりやすい順」に返す（鍵不要）。
 * api/_coverSources.js の coverCandidatesFor と同じ並び（変えたら両方）。
 *   ① NDL 書影 — 和書に強い・無い本は 404
 *   ② openBD — 無い本は 404
 *   ③④ Amazon（ISBN-10・978 のみ）— 無い本は 1×1 の GIF（isCoverLikeSize が弾く）
 *   ⑤ Google の ISBN 直リンク — 無い本は「No cover」(128×170 前後・縦横比 1.35 で弾く)
 *   ⑥ Open Library — 無い本は 404。archive.org へ転送される（CSP img-src に *.archive.org）
 * checkImageExists が <img> ロードで実在検証するので、存在しない本のダミー画像が
 * cover に保存されることはない。
 */
export const getCoverCandidates = (isbn) => {
  let i13 = normalizeIsbn(isbn).toUpperCase();
  if (i13.length === 10) i13 = isbn10to13(i13) || '';
  if (!/^\d{13}$/.test(i13)) return [];
  const i10 = isbn13to10(i13);
  const list = [
    `https://ndlsearch.ndl.go.jp/thumbnail/${i13}.jpg`,
    `https://cover.openbd.jp/${i13}.jpg`,
  ];
  if (i10) {
    list.push(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`);
    list.push(`https://m.media-amazon.com/images/P/${i10}.09._SCLZZZZZZZ_.jpg`);
  }
  list.push(`https://books.google.com/books/content?vid=ISBN${i13}&printsec=frontcover&img=1&zoom=1`);
  list.push(`https://covers.openlibrary.org/b/isbn/${i13}-L.jpg?default=false`);
  return list;
};

// ISBN-10 → ISBN-13（検査数字つき）。形が違えば null。
export const isbn10to13 = (isbn10) => {
  const s = normalizeIsbn(isbn10).toUpperCase();
  if (!/^\d{9}[\dX]$/.test(s)) return null;
  const core = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  return core + String((10 - (sum % 10)) % 10);
};

// 「本の表紙らしい大きさ・形か」（読み込めた画像の縦横で判定）。確認（checkImageExists）と
// 表示（BookCards の onLoad）と サーバー（api/_coverSources.js の looksLikeCover）で同じ基準にする。
//   - 50px 未満（1×1 の透明画像・Amazon の 43 バイトの GIF）→ 偽
//   - Google の ISBN 直リンク（books.google.*/books/content）は、無い本に 128×170 前後（縦/横 1.33）の
//     「No cover」を返すので 1.35 未満は偽
//   - 無い本を 404 / 1×1 / 「noimage」の URL で返す配信元（楽天・openBD・Amazon・Open Library・
//     自分でアップロードした表紙）は形を問わない（正方形寄りのムック・絵本・写真も通す）
//   - それ以外（NDL など）は横長のロゴだけ弾く（1.05 未満は偽）
//   以前は本棚のグリッドだけ全配信元に 1.35 を課していて、確認を通って保存された表紙
//   （正方形寄りの本・自分で撮った写真）が本棚ではずっとグラデーションのままだった。
const GB_CONTENT_RE = /books\.google\.[a-z.]+\/books\/content/i;
const SHAPE_FREE_HOSTS_RE = /(^|\.)(thumbnail\.image\.rakuten\.co\.jp|cover\.openbd\.jp|ssl-images-amazon\.com|media-amazon\.com|covers\.openlibrary\.org|archive\.org|supabase\.co|supabase\.in)$/i;
const hostOf = (url) => {
  try { return new URL(url).hostname; } catch { return ''; }
};
export const coverMinRatio = (url) => {
  const u = String(url || '');
  if (GB_CONTENT_RE.test(u)) return 1.35;
  if (SHAPE_FREE_HOSTS_RE.test(hostOf(u))) return 0;
  return 1.05;
};
export const isCoverLikeSize = (url, w, h) => {
  if (!(w >= 50) || !(h >= 50)) return false;
  return h / w >= coverMinRatio(url);
};

// 画像が「実体として存在するか」をブラウザでロードして確認する（isCoverLikeSize で形も見る）。
// crossOrigin は付けない (CORS 未対応の openBD/Amazon が読めなくなる。
// naturalWidth/Height はクロスオリジン画像でも取得可)。
export const checkImageExists = (url, { timeoutMs = 6000 } = {}) =>
  new Promise((resolve) => {
    if (!url || typeof Image === 'undefined') { resolve(false); return; }
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
    const img = new Image();
    img.onload = () => settle(isCoverLikeSize(url, img.naturalWidth, img.naturalHeight));
    img.onerror = () => settle(false);
    img.src = url;
    // モバイル回線で実在する表紙を時間切れで取りこぼさないよう長めに。
    setTimeout(() => settle(false), timeoutMs);
  });

// 候補を同時に読み、並び順でいちばん前の「本物」を返す（無ければ ''）。
// 以前は 1 枚 5 秒を順番に待ち、候補 6 枚で最大 30 秒かかっていた。
export const firstLoadableImage = async (urls, { check = checkImageExists } = {}) => {
  const list = [...new Set((urls || []).filter(Boolean))];
  const pending = list.map((u) => Promise.resolve().then(() => check(u)).catch(() => false));
  for (let i = 0; i < list.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await pending[i]) return list[i];
  }
  return '';
};

/**
 * 1 つの ISBN について openBD と Amazon を順に試す。最初に通った URL を返す。
 * resolveCoverUrl の単 ISBN 版エイリアス兼、複数候補ループの構成要素。
 */
export const tryCoverForIsbn = async (isbn) => (await firstLoadableImage(getCoverCandidates(isbn))) || null;

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
export const resolveCoverUrl = async (isbn) => (await firstLoadableImage(getCoverCandidates(isbn))) || null;

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
