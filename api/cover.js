// 📚 サーバーサイド表紙リゾルバ。
//
// なぜサーバーで解決するか:
//   - クライアント（端末）からは Google Books の 429 と NDL の CORS で和書の
//     表紙が取りこぼされる。
//   - ただしサーバー（Vercel）からの Google Books "キーなし" リクエストは
//     データセンター IP として強く制限される（403/429）。
//   → そこで「キー不要・和書カバー率が最強・CORS 無関係（サーバーなので）」の
//     NDL（国立国会図書館サーチ）を主経路にする。NDL OpenSearch で ISBN を引き、
//     NDL 書影 → openBD → Amazon の順に server-side で実在検証して採用する。
//     Google Books は鍵があれば補助に使う（GOOGLE_BOOKS_API_KEY、任意）。
//
// 入力（GET）: title, author, isbn（最低 title か isbn）、verify=1（AI 選書の実在の判定・任意）
//   search=…（本の検索・2026-10-02・_bookSearch.js）/ health=1（取得元の診断）
// 出力: { cover, isbn, candidates }（cover が '' なら未発見）。認証なし・公開書誌の読み取り専用。
//   verify=1 のときは加えて { verified: true|false|null, match }（判定は _bookVerify.js・2026-09-30）。

import { applyCors } from './_cors.js';
import { findStrongMatch, strongTitleMatch, authorMatches } from './_bookVerify.js';
import { rakutenGet, rakutenUpscale } from './_rakuten.js';
import { searchBooksServer, cachedSearch, rememberSearch, normalizeSearchQuery } from './_bookSearch.js';
import { getBookInfoCached, bookInfoResponse } from './_bookInfo.js';

// 🔎 実在の判定（?verify=1）のための「検索元が返した本」の記録。表紙探しの流れの途中で
//    楽天・NDL・Google が返した本（書名・著者・ISBN）を控え、最後に _bookVerify.js で
//    「書名がはっきり一致し、著者も一致する本」があるかを見る。answered は、正常に答えた検索元
//    （0 件でも答えたら入る）。どれも答えなかったら「確かめられなかった」（verified: null）。
function newEvidence() {
  return { items: [], answered: new Set(), ran: {} };
}
function ndlCreators(chunk) {
  return (chunk.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/gi) || [])
    .map((c) => c.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
}
import {
  BROWSER_HEADERS,
  HEALTH_ISBN,
  coverCandidatesFor,
  createCooldown,
  extractIsbnsFromXml,
  firstRealImage,
  openbdCover,
  probeImage,
  toIsbn13,
} from './_coverSources.js';

function clean(s) {
  return (s || '').toString().trim().slice(0, 300);
}
// ISBN-10（末尾 X 可）/ ISBN-13 の形式のみ許可。形式外は空文字を返す
// （不正な長さ・文字種の値が候補 URL 構築・外部フェッチ・レスポンスへ
// そのまま流れ込むのを防ぐ）。
function cleanIsbn(s) {
  const v = (s || '').toString().replace(/[-\s]/g, '').trim().slice(0, 20);
  return /^(?:[0-9]{9}[0-9Xx]|[0-9]{13})$/.test(v) ? v.toUpperCase() : '';
}
function toHttps(u) {
  return u ? String(u).replace(/^http:/i, 'https:') : '';
}
// 副題を落とした「核タイトル」。NDL/Google の title 検索は副題込みだと
// 0 件になりやすいので、最初の区切り（空白・コロン・縦棒等）までを使う。
// ⚠️ カタカナ長音符「ー」は区切りに含めない（「シュガーマン」「チャレンジャー」
//    のようにカタカナ語の中に普通に出るため、含めると "シュガ" 等に誤切断され
//    検索が壊れる）。区切りは空白・コロン・縦棒・波ダッシュ・各種ダッシュのみ。
function coreTitle(t) {
  const s = clean(t);
  // 英語などの書名は語と語の間が空白なので、空白では切らない（"The Lean Startup" を "The" にしない）。
  if (/^[\x20-\x7E]+$/.test(s)) return s.split(/\s*[:|~—–]\s*|\s+-\s+/)[0].trim() || s;
  return s.split(/[\s　:：|｜〜~－—–]/)[0] || s;
}
function isbn13to10(isbn13) {
  const s = cleanIsbn(isbn13);
  if (s.length !== 13 || !s.startsWith('978') || !/^\d{13}$/.test(s)) return '';
  const core = s.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += parseInt(core[i], 10) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : String(check));
}

// 著者名の照合用に記号・空白・敬称（著/編/訳）を落として正規化する。
// NFKC で全角英数字/半角カナを統一（「ＡＩ」と「AI」、｢ﾊﾞｶﾞﾎﾞﾝﾄﾞ｣と「バガボンド」
// のような表記揺れで照合が落ちるのを防ぐ）。
function normPerson(s) {
  return (s || '')
    .toString()
    .normalize('NFKC')
    // 区切り記号は「/」も落とす（楽天ブックスは連名を「楠木建/杉浦泰」形式で返す）。
    .replace(/[\s　,，、・･.。/／|｜]/g, '')
    .replace(/(著|編|訳|監修|共著|編著)$/g, '')
    .toLowerCase();
}

// 共著（「楠木建・杉浦泰」「A、B」「A/B」「A and B」等）を書籍 API の著者絞り込み
// （creator= / inauthor:）に丸ごと渡すと「その名前の 1 人の著者」を探して 0 件に
// なる。クエリには先頭著者だけを使う（照合は全著者文字列で includes 判定するので
// 2 人目以降も拾える）。
//   ※「・」の扱いに注意: 外国人名の中黒（ロバート・キヨサキ ＝ 1 人）は割らず、
//     日本語の連名（漢字・漢字 ＝ 2 人）だけ割る。全パートが漢字を含む時のみ分割。
function firstAuthor(author) {
  const a = clean(author);
  if (!a) return '';
  // 明確な連名区切り（読点/スラッシュ/カンマ/&/and）は常に分割。
  let first = a.split(/[/／、,，;；&＆]|\s+and\s+/i)[0].trim();
  if (first.includes('・') || first.includes('･')) {
    const parts = first.split(/[・･]/).map((p) => p.trim()).filter(Boolean);
    const hasKanji = (s) => /[一-龯]/.test(s);
    // 全パートが漢字を含む＝日本語の連名 → 先頭を採用。1 つでもカタカナ断片が
    // あれば外国人名の中黒とみなし割らない（ロバート・キヨサキ / スティーブン・R・コヴィー）。
    if (parts.length >= 2 && parts.every(hasKanji)) first = parts[0];
  }
  return first || a;
}

// XML から ISBN を上位順に抽出して 13 桁にそろえる（NDL の古い本は ISBN-10 だけ・_coverSources.js）。
function extractIsbns(xml, limit = 5) {
  return extractIsbnsFromXml(xml, limit);
}

// 外部 1 回あたりの待ち時間の上限。1 つの取得元が固まっても、表紙の解決全体が
// 関数の実行時間（課金）を食いつぶさないようにする。
const FETCH_TIMEOUT_MS = 4000;

async function ndlFetch(params) {
  const r = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?${params.join('&')}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!r.ok) { ndlFetch._lastStatus = r.status; return ''; }
  ndlFetch._lastStatus = r.status;
  return r.text();
}

// <item> チャンクからその書名を取り出す（RSS の <title> 優先・無ければ <dc:title>）。
// これで「この ISBN はどの本のものか」を ISBN 単位で照合できる。
function itemTitle(chunk) {
  const m = chunk.match(/<title[^>]*>([^<]*)<\/title>/i)
    || chunk.match(/<dc:title[^>]*>([^<]*)<\/dc:title>/i);
  return m ? m[1] : '';
}
// アイテムの書名が、要求された（核）タイトルと一致するか。正規化して包含判定
// （副題込みのアイテム名でも核タイトルを含めば一致）。兄弟本の除外に使う。
function ndlTitleMatches(rawItemTitle, wantCoreNorm) {
  if (!wantCoreNorm) return false;
  const t = normTitle(rawItemTitle);
  if (!t) return false;
  return t.includes(wantCoreNorm) || wantCoreNorm.includes(t);
}

// 書名の一致の強さ: 2 = 副題まで含めた書名が一致 / 1 = 核タイトル（最初の空白まで）だけ一致 / 0 = 不一致。
//   例: 『プレイングマネジャー 「残業ゼロ」の仕事術』は核が「プレイングマネジャー」とありふれていて、
//   同じ核の別の本（兄弟本）も 1 で一致する。副題まで一致する項目（2）を先に採る（「」・空白は normTitle が落とす）。
//   書名が核だけのとき（副題なし）は 1 と 2 が同じになり、従来どおり著者一致が先。
function titleTier(rawItemTitle, coreNorm, fullNorm) {
  const t = normTitle(rawItemTitle);
  if (!t || !coreNorm) return 0;
  if (!(t.includes(coreNorm) || coreNorm.includes(t))) return 0;
  if (fullNorm && (t.includes(fullNorm) || (fullNorm.includes(t) && t.length > coreNorm.length))) return 2;
  return 1;
}

// この ISBN が本当にそのタイトルの本かを NDL で検証する（誤 ISBN ガード）。
//   背景: 「ISBN が分かっている本はその ISBN で表紙を直接取る」ファストパスは、
//   ISBN が別の本のもの（例: AI 選書の架空タイトルに無関係な実在本の ISBN が
//   紐づく）でも「ISBN 通り」の誤表紙を貼ってしまう。タイトルが渡っている時だけ、
//   ISBN の実書名がタイトルと一致するかを引いてから信用する。
//   ⚠️ fail-open: NDL に無い / 取得不可 / 障害のときは true（＝従来通り信用）を返し、
//      ISBN が NDL 未収録の正当な本を誤って弾かない（退行防止）。明確に別書名の
//      item しか返らなかった時だけ false。
async function isbnTitleMatches(isbn, title, ev) {
  const cleaned = cleanIsbn(isbn);
  if (!cleaned) return true;
  const want = normTitle(coreTitle(title));
  if (!want) return true; // タイトル未指定は検証しない（従来挙動）
  try {
    const xml = await ndlFetch([`isbn=${encodeURIComponent(cleaned)}`, 'cnt=5']);
    if (ev && ndlFetch._lastStatus === 200) ev.answered.add('ndl');
    if (!xml || !/<item[\s>]/i.test(xml)) return true; // 判定不能 → 信用（fail-open）
    const items = xml.split(/<item[\s>]/i).slice(1);
    if (ev) {
      for (const chunk of items) ev.items.push({ title: itemTitle(chunk), authors: ndlCreators(chunk), isbn: cleaned, src: 'ndl' });
    }
    if (items.length === 0) return true;
    // どれか一つでも書名が一致すれば OK。全て明確に別書名なら誤 ISBN とみなす。
    return items.some((chunk) => ndlTitleMatches(itemTitle(chunk), want));
  } catch {
    return true; // 障害 → fail-open
  }
}

// NDL OpenSearch（XML）で ISBN-13 候補を引く。
//   ⚠️ 誤マッチ根治: 以前は title+creator 検索の応答から ISBN を document 順で
//   拾っていたため、同じ著者の「別の本（兄弟本）」の ISBN を掴み、まったく違う
//   表紙が付く事故があった（例: 楠木建・杉浦泰『感情と勘定の経営』に『逆・タイム
//   マシン経営論』の表紙）。NDL の title 検索は緩く兄弟本も返すため、ISBN を
//   採る前に **その <item> の書名が要求タイトルと一致するか** を必ず検証する。
//   採用順位: ①タイトル一致＋著者一致 → ②タイトルのみ一致（著者照合は表記揺れで
//   落ちることがあるため保険）。タイトル不一致の ISBN は絶対に採らない
//   （＝「誤った表紙」より「表紙なし（手動アップロードへ）」を選ぶ）。
async function ndlIsbns(title, author, sink, ev) {
  const t = coreTitle(title);
  if (!t) return [];
  if (ev) ev.ran.ndlTitle = true;
  const wantCoreNorm = normTitle(t);
  const wantFullNorm = normTitle(title);
  const wantAuthor = normPerson(author);
  try {
    // title(+creator) で広めに引く。creator 併用は表記揺れで空振りしやすいので、
    // item が取れなければ title のみで引き直す（照合は item 単位で厳密に行う）。
    const p1 = [`title=${encodeURIComponent(t)}`];
    // 共著は先頭著者で絞る（連結文字列だと NDL が 0 件になる）。
    const qAuthor = firstAuthor(author);
    if (qAuthor) p1.push(`creator=${encodeURIComponent(qAuthor)}`);
    p1.push('cnt=20');
    let xml = await ndlFetch(p1);
    if (sink) sink.http = ndlFetch._lastStatus ?? null;
    if (ev && ndlFetch._lastStatus === 200) ev.answered.add('ndl');
    if (!xml || !/<item[\s>]/i.test(xml)) {
      xml = await ndlFetch([`title=${encodeURIComponent(t)}`, 'cnt=20']);
      if (sink) sink.http2 = ndlFetch._lastStatus ?? null;
      if (ev && ndlFetch._lastStatus === 200) ev.answered.add('ndl');
    }
    if (!xml) return [];

    const items = xml.split(/<item[\s>]/i).slice(1);
    if (ev) {
      for (const chunk of items) {
        ev.items.push({ title: itemTitle(chunk), authors: ndlCreators(chunk), isbn: extractIsbns(chunk, 1)[0] || '', src: 'ndl' });
      }
    }
    if (sink) { sink.raw = items.length; sink.tmatch = 0; }
    // 並び: 副題まで一致＋著者一致 → 副題まで一致 → 核だけ一致＋著者一致 → 核だけ一致。
    const buckets = { both2: [], title2: [], both1: [], title1: [] };
    const seen = new Set();
    for (const chunk of items) {
      // タイトル一致は必須。ここで兄弟本（別書名・同著者）を弾く。
      if (!ndlTitleMatches(itemTitle(chunk), wantCoreNorm)) continue;
      if (sink) sink.tmatch += 1;
      const tier = titleTier(itemTitle(chunk), wantCoreNorm, wantFullNorm) >= 2 ? 2 : 1;
      const creators = (chunk.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/gi) || [])
        .map((c) => normPerson(c.replace(/<[^>]+>/g, '')));
      const authorOk = !wantAuthor
        || creators.some((c) => c && (c.includes(wantAuthor) || wantAuthor.includes(c)));
      for (const isbn of extractIsbns(chunk, 3)) {
        if (seen.has(isbn)) continue;
        seen.add(isbn);
        buckets[`${authorOk ? 'both' : 'title'}${tier}`].push(isbn);
      }
    }
    return [...buckets.both2, ...buckets.title2, ...buckets.both1, ...buckets.title1].slice(0, 5);
  } catch (e) {
    if (sink) sink.err = String((e && e.message) || e).slice(0, 60);
    return [];
  }
}

// Google Books（鍵があれば使う・補助）。鍵なしはサーバー IP で弾かれやすい。
//
// ⚠️ 著者で正解を選び直す: 「ナイン」のようなありふれたタイトルは数百件ヒット
//    して先頭が無関係な本になる（=誤マッチで表紙ゼロ）。著者が分かっている時は
//    volumeInfo.authors を正規化照合し、本人の本だけを採用する。誤った表紙を
//    掴むより「表紙なし」を選ぶ（クライアントの実在検証では別人の本は弾けない）。
function gVolFields(v) {
  const links = v.imageLinks || {};
  const cover = toHttps(links.thumbnail || links.smallThumbnail || '');
  const ids = v.industryIdentifiers || [];
  const gi =
    (ids.find((x) => x.type === 'ISBN_13') || {}).identifier ||
    (ids.find((x) => x.type === 'ISBN_10') || {}).identifier ||
    '';
  return { cover, isbn: cleanIsbn(gi) };
}
function gAuthorMatch(v, wantAuthor) {
  if (!wantAuthor) return false;
  return (v.authors || []).some((a) => {
    const n = normPerson(a);
    return n && (n.includes(wantAuthor) || wantAuthor.includes(n));
  });
}
// 429/403 のあとはしばらく Google を叩かない（鍵なし 5 分・鍵あり 1 分）。1 回の解決で最大 3 回
// 叩いて 3 回とも待つのをやめ、共有 IP の枠をさらに削らない。
const googleCooldown = createCooldown();
async function googleFetchVolumes(q, max = 10) {
  const hasKey = !!process.env.GOOGLE_BOOKS_API_KEY;
  const key = hasKey ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
  if (googleCooldown.blocked()) { googleFetchVolumes._lastStatus = 0; googleFetchVolumes._cooldown = true; return []; }
  googleFetchVolumes._cooldown = false;
  try {
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${max}&country=JP${key}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    googleFetchVolumes._lastStatus = r.status;
    googleCooldown.hit(r.status, { hasKey });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items || []).map((it) => it.volumeInfo || {});
  } catch (e) {
    googleFetchVolumes._lastErr = String((e && e.message) || e).slice(0, 60);
    return [];
  }
}

// タイトル照合用の正規化（記号・空白を落とす）。NFKC で全角英数字・半角カナ・
// ㈱等の互換文字を統一（「営業１年目」vs「営業1年目」の揺れで照合が落ちない）。
function normTitle(s) {
  return clean(s).normalize('NFKC').replace(/[\s　・･,，、.。:：!！?？「」『』\-―ー（）()]/g, '').toLowerCase();
}
function gTitleMatch(v, coreNorm) {
  if (!coreNorm) return false;
  const t = normTitle(v.title || '');
  if (!t) return false;
  return t.includes(coreNorm) || coreNorm.includes(t);
}

async function googleCover(title, author, isbn, sink, ev) {
  const want = normPerson(author);
  const core = coreTitle(title);
  const coreNorm = normTitle(core);
  // 実在の判定用に、Google が返した本（書名＋副題・著者・ISBN・表紙）を控える。
  const fetchVolumes = async (q, max) => {
    const vols = await googleFetchVolumes(q, max);
    if (ev) {
      if (googleFetchVolumes._lastStatus === 200) ev.answered.add('google');
      for (const v of vols) {
        const f = gVolFields(v);
        ev.items.push({ title: [v.title, v.subtitle].filter(Boolean).join(' '), authors: v.authors || [], isbn: f.isbn, cover: f.cover, src: 'google' });
      }
    }
    return vols;
  };
  if (ev && !isbn) ev.ran.googleTitle = true;

  if (isbn) {
    const items = await fetchVolumes(`isbn:${cleanIsbn(isbn)}`);
    if (sink) { sink.http = googleFetchVolumes._lastStatus ?? null; sink.raw = items.length; }
    for (const v of items) { const f = gVolFields(v); if (f.cover) return f; }
    return { cover: '', isbn: '' };
  }
  if (!author) {
    const items = await fetchVolumes(core);
    if (sink) { sink.http = googleFetchVolumes._lastStatus ?? null; sink.raw = items.length; }
    for (const v of items) { const f = gVolFields(v); if (f.cover) return f; }
    return { cover: '', isbn: '' };
  }

  // 著者あり: 精度順にクエリを試す。日本語の短いタイトルは intitle が空振り
  // しやすいので、最終的に「著者で広く引いてタイトルで絞る」を効かせる。
  //   { q, max, needTitle } — needTitle=true は、その query 結果で
  //   著者一致だけでなくタイトル照合も要求する（別の著作を誤採用しないため）。
  // needTitle は全プランで true。intitle でも別著作が混じることがあるため、
  // 著者一致だけでなくタイトル照合も必須にして兄弟本の誤採用を防ぐ
  // （gTitleMatch は正規化した包含判定なので副題・表記揺れには寛容）。
  // 共著は先頭著者で絞る（inauthor: に連結文字列を渡すと 0 件になる）。
  const qAuthor = firstAuthor(author);
  const plans = [
    { q: `intitle:${core} inauthor:${qAuthor}`, max: 10, needTitle: true },
    { q: `${core} ${qAuthor}`, max: 20, needTitle: true },
    { q: `inauthor:${qAuthor}`, max: 40, needTitle: true },
  ];

  let isbnOnly = '';
  if (sink) { sink.raw = 0; sink.http = null; }
  for (const plan of plans) {
    if (googleCooldown.blocked()) break; // 429/403 のあとは残りのクエリも投げない
    // eslint-disable-next-line no-await-in-loop
    const items = await fetchVolumes(plan.q, plan.max);
    if (sink) { sink.http = googleFetchVolumes._lastStatus ?? sink.http; sink.raw += items.length; }
    const ok = (v) => gAuthorMatch(v, want) && (!plan.needTitle || gTitleMatch(v, coreNorm));
    // ① 一致＋表紙あり
    for (const v of items) {
      if (ok(v)) { const f = gVolFields(v); if (f.cover) return f; }
    }
    // ② 一致だけ（表紙無し・ISBN は正しい → 候補構築に回す）
    for (const v of items) {
      if (ok(v)) { const f = gVolFields(v); if (f.isbn && !isbnOnly) isbnOnly = f.isbn; }
    }
  }
  return { cover: '', isbn: isbnOnly };
}

// ─────────────────────────────────────────────────────────────────────────
// 🅁 楽天ブックス書籍検索 API（和書の表紙カバー率が最も高い一次ソース）。
// 認証は applicationId + accessKey + Referer 必須（2026 の楽天 API 刷新）。
// env 未設定なら静かにスキップ（fail-safe・従来ソースのみで動く）。
// 画像 URL は thumbnail.image.rakuten.co.jp（vercel.json の CSP img-src 許可済み）。
// ─────────────────────────────────────────────────────────────────────────
// 楽天の呼び出し（鍵・Referer・Node の https）は _rakuten.js（本の検索 _bookSearch.js と共有）。

// タイトル(+著者) または ISBN から楽天ブックスで表紙を引く。
// NDL と同じ照合規律: ISBN 直引き以外は「タイトル一致必須」＋「著者一致を優先」。
// 兄弟本（同著者・別書名）のカバーは絶対に採らない。
// 返り値 { cover, isbn }（見つからなければ両方 ''）。
async function rakutenCover(title, author, isbn, ev) {
  const appId = (process.env.RAKUTEN_APPLICATION_ID || '').trim();
  const accessKey = (process.env.RAKUTEN_ACCESS_KEY || '').trim();
  if (!appId || !accessKey) return { cover: '', isbn: '' };
  if (ev && !cleanIsbn(isbn)) ev.ran.rakutenTitle = true;
  const referer = (process.env.RAKUTEN_APP_URL || '').trim();
  const d = { ref: !!referer, tmatch: 0, tries: [] };

  // 楽天は表紙の無い本に「noimage」の画像を返す → 表紙なしとして扱う。
  const realImage = (u) => (u && !/noimage/i.test(String(u)) ? u : '');
  const fields = (it) => ({
    cover: rakutenUpscale(realImage(it.largeImageUrl) || realImage(it.mediumImageUrl) || ''),
    isbn: cleanIsbn(it.isbn),
    title: (it.title || '').toString(),
    author: (it.author || '').toString(),
  });

  // 1 回分の検索を実行し items を返す。診断も控える。
  const run = async (apiPath, extra, label) => {
    const params = new URLSearchParams({
      format: 'json', applicationId: appId, accessKey, hits: '20',
      outOfStockFlag: '1', elements: 'title,author,isbn,largeImageUrl,mediumImageUrl',
      ...extra,
    });
    const t = { q: label, http: null, raw: 0 };
    try {
      const resp = await rakutenGet(
        `https://openapi.rakuten.co.jp/services/api/${apiPath}/20170404?${params.toString()}`,
        referer,
      );
      t.http = resp.status;
      if (resp.status < 200 || resp.status >= 300) { d.tries.push(t); return []; }
      const data = JSON.parse(resp.body);
      const items = (Array.isArray(data?.Items) ? data.Items : [])
        .map((raw) => (raw && raw.Item ? raw.Item : raw))
        .filter((it) => it && typeof it === 'object');
      t.raw = items.length;
      if (ev) {
        ev.answered.add('rakuten');
        for (const it of items) {
          const f = fields(it);
          ev.items.push({ title: f.title, authors: f.author ? [f.author] : [], isbn: f.isbn, cover: f.cover, src: 'rakuten' });
        }
      }
      t.sample = items.slice(0, 3).map((it) => ({ t: (it.title || '').toString().slice(0, 20), c: !!(it.largeImageUrl || it.mediumImageUrl) }));
      d.tries.push(t);
      return items;
    } catch (e) {
      t.err = String((e && e.message) || e).slice(0, 50);
      d.tries.push(t);
      return [];
    }
  };

  // ── ISBN 直引き（BooksBook/Search・書籍限定で正確）─────────────────
  const iq = toIsbn13(isbn) || cleanIsbn(isbn); // 楽天の isbn= は 13 桁で引く
  if (iq) {
    const items = await run('BooksBook/Search', { isbn: iq }, 'isbn');
    for (const it of items) { const f = fields(it); if (f.cover) return { cover: f.cover, isbn: f.isbn || iq, _d: d }; }
    return { cover: '', isbn: '', _d: d };
  }

  // ── タイトル検索（BooksTotal/Search・keyword が効く総合検索）─────────
  //   keyword=「タイトル＋先頭著者」の 1 回だけ引く（楽天は連続呼び出しで 429 に
  //   なりやすいので多段検索はしない）。照合はローカルで厳密に行い、兄弟本・
  //   非書籍・別の本を弾く（tmatch でタイトル一致数を可視化）。
  const t = coreTitle(title);
  if (!t) return { cover: '', isbn: '', _d: d };
  const wantCoreNorm = normTitle(t);
  const wantFullNorm = normTitle(title);
  const wantAuthor = normPerson(author);
  const kw = [t, firstAuthor(author)].filter(Boolean).join(' ');
  const items = await run('BooksTotal/Search', { keyword: kw }, 'kw');

  // いちばん強い一致を採る: 副題まで一致＋著者 > 副題まで一致 > 核だけ一致＋著者 > 核だけ一致（titleTier）。
  //   表紙の無い項目も数える: 目当ての本（副題まで一致）に表紙が無いとき、核だけ一致する兄弟本の
  //   表紙で代用しない（ISBN だけ返し、ほかの取得元がその ISBN で表紙を探す）。
  let best = null;
  let bestScore = 0;
  for (const it of items) {
    const f = fields(it);
    const tier = titleTier(f.title, wantCoreNorm, wantFullNorm);
    if (!tier) continue;
    d.tmatch += 1;
    const an = normPerson(f.author);
    const authorOk = !wantAuthor || (an && (an.includes(wantAuthor) || wantAuthor.includes(an)));
    const score = tier * 2 + (authorOk ? 1 : 0) + (f.cover ? 0.5 : 0); // 同じ強さなら表紙のある方
    if (score > bestScore) { best = { cover: f.cover, isbn: f.isbn }; bestScore = score; }
  }
  return { ...(best || { cover: '', isbn: '' }), _d: d };
}

// 画像の実在＋「表紙らしさ」を server-side で確かめる（_coverSources.js の probeImage）。
//   縦横を読んで 1×1・43 バイトの GIF（Amazon の「無い」）・Google の「No cover」・横長ロゴを弾く。
//   以前は「4KB 未満は偽物」の 1 本だけで、小さな本物のサムネを弾き、Google の No cover は通していた。
// ※ best-effort。NDL・Amazon はデータセンターの IP を 403 で弾くことがあるので、確かめられなくても
//   呼び出し側は ISBN から作った候補 URL を返し、端末の <img> が最後に確かめる。
async function imageIsReal(url) {
  return (await probeImage(url)).ok;
}

// ISBN から各ソースの表紙を server-side で確かめて採用する（best-effort）。
//   候補は **同時に** 確かめ、並び順でいちばん前の本物を採る（以前は 1 枚 4 秒を順番に待ち、
//   6 URL × ISBN 5 件で関数の時間切れ＝何も返せないことがあった）。
//   openBD の API（summary.cover）も同時に引き、あれば候補の先頭に置く（sink[ISBN13] に残す）。
async function coverFromIsbn(isbn, sink) {
  const i13 = toIsbn13(isbn);
  if (!i13) return '';
  const base = coverCandidatesFor(i13);
  const [ob, first] = await Promise.all([openbdCover(i13), firstRealImage(base)]);
  if (sink && ob.cover) sink[i13] = ob.cover;
  if (ob.cover && !base.includes(ob.cover) && (await imageIsReal(ob.cover))) return ob.cover;
  return first.url || '';
}

// 未認証・公開エンドポイントのため userId が無い。呼び出し元 IP をキーにした
// 簡易レート制限（api/stripe-checkout.js の checkRateLimit と同一流儀）。
// 1 リクエストが NDL/openBD/Google への複数回の外部フェッチにつながるため、
// 無制限だと外部 API クォータ枯渇・コスト増幅の踏み台にされうる。
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitStore = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const arr = (rateLimitStore.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - arr[0])) / 1000));
    return { ok: false, retryAfter };
  }
  arr.push(now);
  rateLimitStore.set(key, arr);
  // メモリリーク防止: warm インスタンスで IP キーが無限増殖しないよう、
  // ときどき全キーを掃き、ウィンドウ外だけになった（空になる）キーを削除する。
  if (rateLimitStore.size > 2000) {
    for (const [k, v] of rateLimitStore) {
      const alive = v.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
      if (alive.length === 0) rateLimitStore.delete(k);
      else rateLimitStore.set(k, alive);
    }
  }
  return { ok: true };
}
function clientKey(req) {
  // Vercel は x-real-ip を実クライアント IP に上書きする（プロキシ管理・偽装不可）。
  // x-forwarded-for の「先頭」はクライアントが自由に足せるため単独では信頼しない。
  const h = req.headers || {};
  const realIp = typeof h['x-real-ip'] === 'string' ? h['x-real-ip'].trim() : '';
  const fwd = typeof h['x-forwarded-for'] === 'string' ? h['x-forwarded-for'].split(',')[0].trim() : '';
  const ip = realIp || fwd || req.socket?.remoteAddress || 'unknown';
  return ip.trim();
}

// 1 回の解決の持ち時間（これを過ぎたら次の取得元へ進まない）。vercel.json の maxDuration より十分短く。
const COVER_BUDGET_MS = 9000;

// 🩺 /api/cover?health=1 の中身。設定は真偽だけ・各取得元は HTTP の番号と「見つかったか」だけ。
//    決まった本（HEALTH_ISBN・公開の書誌）で確かめる。外部へ 10 回ほど出るので 5 分覚えておく。
const HEALTH_TTL_MS = 5 * 60 * 1000;
// 本の検索の確かめに使う語と本（稲盛和夫『考え方』大和書房 2017・公開の書誌）。
const HEALTH_SEARCH_QUERY = '考え方';
const HEALTH_SEARCH_ISBN = '9784479795735';
let healthCache = null;
async function coverHealth() {
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.data;
  const started = Date.now();
  const i13 = HEALTH_ISBN;
  const i10 = isbn13to10(i13);
  const rakutenConfigured = !!((process.env.RAKUTEN_APPLICATION_ID || '').trim() && (process.env.RAKUTEN_ACCESS_KEY || '').trim());
  const img = async (url) => {
    const r = await probeImage(url);
    return { status: r.status, found: r.ok };
  };
  // NDL: ISBN で引けるか → その書名だけで引き直して同じ ISBN が出るか（書名 → ISBN の経路）。
  const ndl = async () => {
    const out = { ndlSearch: { status: 0, found: false }, ndlTitleToIsbn: { status: 0, found: false } };
    let xml = '';
    try { xml = await ndlFetch([`isbn=${i13}`, 'cnt=5']); out.ndlSearch.status = ndlFetch._lastStatus ?? 0; } catch { /* 0 のまま */ }
    out.ndlSearch.found = extractIsbns(xml, 10).includes(i13);
    const first = xml.split(/<item[\s>]/i)[1];
    const t = first ? coreTitle(itemTitle(first)) : '';
    if (t) {
      try {
        const xml2 = await ndlFetch([`title=${encodeURIComponent(t)}`, 'cnt=20']);
        out.ndlTitleToIsbn.status = ndlFetch._lastStatus ?? 0;
        out.ndlTitleToIsbn.found = extractIsbns(xml2, 50).includes(i13);
      } catch { /* 0 のまま */ }
    }
    return out;
  };
  const google = async () => {
    const items = await googleFetchVolumes(`isbn:${i13}`, 1);
    return {
      status: googleFetchVolumes._lastStatus ?? 0,
      found: items.some((v) => !!(v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail))),
      cooldown: !!googleFetchVolumes._cooldown,
    };
  };
  const rakuten = async () => {
    if (!rakutenConfigured) return { skipped: true, status: 0, found: false };
    const rk = await rakutenCover('', '', i13);
    const tries = (rk._d && rk._d.tries) || [];
    return { skipped: false, status: Number((tries[0] && tries[0].http) || 0), found: !!rk.cover };
  };
  const openbd = async () => {
    const r = await openbdCover(i13);
    return { status: r.status, found: !!r.cover };
  };
  const [ndlR, rakutenR, googleR, openbdR, ndlThumb, openbdImage, amazon, amazonMedia, googleContent, openLibrary] = await Promise.all([
    ndl(),
    rakuten().catch(() => ({ skipped: false, status: 0, found: false })),
    google().catch(() => ({ status: 0, found: false, cooldown: false })),
    openbd(),
    img(`https://ndlsearch.ndl.go.jp/thumbnail/${i13}.jpg`),
    img(`https://cover.openbd.jp/${i13}.jpg`),
    img(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`),
    img(`https://m.media-amazon.com/images/P/${i10}.09._SCLZZZZZZZ_.jpg`),
    img(`https://books.google.com/books/content?vid=ISBN${i13}&printsec=frontcover&img=1&zoom=1`),
    img(`https://covers.openlibrary.org/b/isbn/${i13}-L.jpg?default=false`),
  ]);
  // 🔎 本の検索（?search=）: 決まった語「考え方」で楽天の売上順の検索が答えるか・稲盛和夫『考え方』が
  //    上位 3 冊に入るか（真偽と HTTP の番号だけ）。楽天は続けて呼ぶと 429 になりやすいので、上の確認のあとに。
  let search = { skipped: true, status: 0, found: false, top3: false };
  try {
    const sr = await searchBooksServer(HEALTH_SEARCH_QUERY, { budgetMs: 6000 });
    const top3 = sr.results.slice(0, 3).some((b) => b.isbn === HEALTH_SEARCH_ISBN);
    search = {
      skipped: sr.sources.rakuten === 'off',
      status: Number(sr.statuses?.rakuten || 0),
      found: sr.results.length > 0,
      top3,
      sources: sr.sources,
    };
  } catch { /* 既定のまま */ }
  const data = {
    v: 'cover-health-2026-10-02',
    rakutenConfigured,
    rakutenRefererSet: !!(process.env.RAKUTEN_APP_URL || '').trim(),
    googleKeySet: !!(process.env.GOOGLE_BOOKS_API_KEY || '').trim(),
    isbn: i13,
    sources: {
      rakuten: rakutenR,
      ndlSearch: ndlR.ndlSearch,
      ndlTitleToIsbn: ndlR.ndlTitleToIsbn,
      openbd: openbdR,
      google: googleR,
      ndlThumb,
      openbdImage,
      amazon,
      amazonMedia,
      googleContent,
      openLibrary,
    },
    search,
    elapsedMs: Date.now() - started,
  };
  healthCache = { at: Date.now(), data };
  return data;
}

export default async function handler(req, res) {
  // iOS アプリ（capacitor://localhost）からの呼び出しを許可。
  if (applyCors(req, res, 'GET, OPTIONS')) return undefined;
  // 📕 中身は公開の書誌だけ（Cookie・認証なし）なので、CORS は全員に「*」を返す。
  //   オリジンごとに変えると、Web で CDN にキャッシュされた「CORS なし」の応答が iOS アプリ
  //   （capacitor://localhost）にも返り、アプリでは表紙の解決が失敗する（api/cover-image.js と同じ理由）。
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (typeof res.removeHeader === 'function') res.removeHeader('Vary');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = checkRateLimit(clientKey(req));
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too Many Requests', retry_after: rl.retryAfter });
  }

  // 🩺 本番の診断: /api/cover?health=1 → 設定の有無（真偽だけ）と、決まった本 1 冊で各取得元が
  //    返した HTTP の番号・見つかったか。鍵・利用者の情報・内部の URL は出さない。5 分キャッシュ。
  if (req.query?.health) {
    const data = await coverHealth();
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.status(200).json(data);
  }

  // 🔎 本の検索: /api/cover?search=考え方 → { results: [{ title, subtitle, author, publisher, pubdate, pubYear,
  //    isbn, cover, sales, review, source }] }（よく読まれている・書名がよく合う順・最大 30 冊）。
  //    楽天（売上順）→ Google（鍵があれば）→ NDL（少ないときだけ）。流れは docs/book-search.md。
  //    すべての取得元が失敗したら 502（端末は自分の検索に切り替える）。新しい関数を増やさないためここに置く。
  if (req.query?.search !== undefined) {
    const q = normalizeSearchQuery(Array.isArray(req.query.search) ? req.query.search[0] : req.query.search);
    if (!q) return res.status(400).json({ error: 'search required' });
    let data = cachedSearch(q);
    if (!data) {
      try {
        data = await searchBooksServer(q);
      } catch (e) {
        console.warn('[api/cover] search failed:', e && e.message);
        data = { ok: false, results: [] };
      }
      rememberSearch(q, data);
    }
    if (!data.ok) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'unavailable', results: [] });
    }
    res.setHeader('Cache-Control', data.results.length
      ? 'public, max-age=300, s-maxage=3600'
      : 'public, max-age=0, s-maxage=300');
    return res.status(200).json({ results: data.results });
  }

  const title = clean(req.query?.title);
  const author = clean(req.query?.author);
  const isbnIn = cleanIsbn(req.query?.isbn);
  if (!title && !isbnIn) return res.status(400).json({ error: 'title or isbn required' });

  // 📖 この本について（?info=1）: 出版社・書店が公開している紹介文と目次（AI なし・api/_bookInfo.js・2026-10-02）。
  //    { description, toc, source, tocSource, pages, pubdate, isbn }。見つからなければ空。どこも答えなければ覚えない。
  if (req.query?.info) {
    let data = null;
    try { data = await getBookInfoCached({ isbn: isbnIn, title, author }, { rakutenGet }); } catch (e) { console.warn('[api/cover] info failed:', e && e.message); }
    const found = !!(data && (data.description || data.toc.length));
    res.setHeader('Cache-Control', !data?.answered ? 'no-store' : found ? 'public, max-age=86400, s-maxage=604800' : 'public, max-age=0, s-maxage=600');
    return res.status(200).json(bookInfoResponse(data || {}));
  }

  // 🔎 デバッグ: ?debug=1 で各段階の生の結果を返す（原因切り分け用）。
  // ⚠️ 未認証で誰でも叩け、内部 URL / エラー文言 / API キーの有無（hasKey）が
  // 露出し、1 リクエストで外部へ 7+ 回のフェッチが連鎖する増幅経路になる。
  // 以前は `!IS_PRODUCTION` で無効化していたが、Vercel の **プレビュー配信**
  // （URL さえ知れば公開・本番 env を持つ）では有効のままだった。明示的な
  // オプトイン env `ALLOW_COVER_DEBUG='true'` を要求し、本番・プレビュー共に
  // 既定で無効にする。
  if (req.query?.debug && process.env.ALLOW_COVER_DEBUG === 'true') {
    const dbg = { coreTitle: coreTitle(title), author, steps: {} };
    try {
      const params = [`title=${encodeURIComponent(coreTitle(title))}`];
      if (author) params.push(`creator=${encodeURIComponent(author)}`);
      params.push('cnt=5');
      const ndlUrl = `https://ndlsearch.ndl.go.jp/api/opensearch?${params.join('&')}`;
      const r = await fetch(ndlUrl);
      const xml = await r.text();
      const isbns = [];
      const re = /97[89][\d-]{10,17}/g;
      let m;
      while ((m = re.exec(xml)) !== null) { const v = cleanIsbn(m[0]); if (v.length === 13) isbns.push(v); if (isbns.length >= 5) break; }
      dbg.steps.ndl = { url: ndlUrl, status: r.status, ok: r.ok, xmlLength: xml.length, xmlHead: xml.slice(0, 400), isbns };
      if (isbns[0]) {
        const u13 = `https://ndlsearch.ndl.go.jp/thumbnail/${isbns[0]}.jpg`;
        const ir = await fetch(u13, { headers: BROWSER_HEADERS });
        const buf = ir.ok ? await ir.arrayBuffer() : null;
        dbg.steps.ndlThumb = { url: u13, status: ir.status, contentType: ir.headers.get('content-type'), bytes: buf ? buf.byteLength : 0 };
        const ob = `https://cover.openbd.jp/${isbns[0]}.jpg`;
        const obr = await fetch(ob, { headers: BROWSER_HEADERS });
        const obuf = obr.ok ? await obr.arrayBuffer() : null;
        dbg.steps.openbd = { url: ob, status: obr.status, contentType: obr.headers.get('content-type'), bytes: obuf ? obuf.byteLength : 0 };
      }
    } catch (e) { dbg.steps.ndlError = String(e && e.message); }
    // 著者照合フォールバック込みの最終 ISBN 候補（実コードと同じ経路）。
    try { dbg.steps.ndlFinal = await ndlIsbns(title, author); } catch (e) { dbg.steps.ndlFinalError = String(e && e.message); }
    // 実 production と同じ著者照合つき googleCover() の結果。
    try { dbg.steps.googleCover = await googleCover(title, author, ''); } catch (e) { dbg.steps.googleCoverError = String(e && e.message); }
    // 著者で広く引いた時の上位（ナインが重松清の本として Google に在るか確認）。
    try {
      const gq = author ? `inauthor:${author}` : coreTitle(title);
      const gr = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(gq)}&maxResults=20&country=JP${process.env.GOOGLE_BOOKS_API_KEY ? '&key=' + process.env.GOOGLE_BOOKS_API_KEY : ''}`);
      const gj = gr.ok ? await gr.json() : null;
      dbg.steps.google = {
        q: gq, status: gr.status, ok: gr.ok, hasKey: !!process.env.GOOGLE_BOOKS_API_KEY,
        totalItems: gj ? (gj.totalItems || 0) : null,
        top: (gj && gj.items ? gj.items.slice(0, 20) : []).map((it) => ({
          title: it.volumeInfo?.title || null,
          authors: it.volumeInfo?.authors || [],
          hasThumb: !!(it.volumeInfo?.imageLinks),
        })),
      };
    } catch (e) { dbg.steps.googleError = String(e && e.message); }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(dbg);
  }

  let cover = '';
  let isbn = isbnIn;
  // ⏱ 全体の持ち時間。過ぎたら次の取得元へは進まず、分かった ISBN と候補だけ返す
  //    （端末の <img> が候補を確かめる）。関数の時間切れ（504）で何も返せないのを防ぐ。
  const deadline = Date.now() + COVER_BUDGET_MS;
  const hasTime = () => Date.now() < deadline;
  const openbdSink = {};
  // 🔎 ?verify=1（AI 選書の実在の判定）: 検索元が返した本を控え、最後に「書名がはっきり一致し、
  //    著者も一致する本」があるかを返す（verified: true / false / null）。表紙探しの流れは同じだが、
  //    書影の server-side 検証（1 冊で最大 6 回の画像取得）は省く（クライアントが candidates を <img> で確かめる・速さ優先）。
  const verifyMode = req.query?.verify === '1' && !!title;
  const ev = verifyMode ? newEvidence() : null;
  const coverFor = verifyMode ? async () => '' : (i) => coverFromIsbn(i, openbdSink);
  // verify のときは、はっきり一致する本が見つかった時点で次の検索元を引かない（速さ優先）。
  const settled = () => verifyMode && !!findStrongMatch(ev.items, title, author);

  // 🔎 軽量診断（常時オン・安全）: どのソースが何を返したかを記録する。追加の
  //    外部フェッチは行わず（通常フローの結果を控えるだけ）、内部 URL・API キー・
  //    生エラー文言は一切出さない。原因切り分け（コード版・楽天設定・各ソースの
  //    ISBN 有無）に必要な最小限だけ。落ち着いたら削除してよい。
  const diag = {
    v: 'cov-2026-07-12f',           // デプロイ判定用の版マーカー
    rk: !!(process.env.RAKUTEN_APPLICATION_ID && process.env.RAKUTEN_ACCESS_KEY),
    ttl: coreTitle(title) || null,   // API へ渡す核タイトル（エンコード起因の切り分け用）
    fa: firstAuthor(author) || null, // 実際にクエリへ渡した先頭著者
    src: {},                         // 各ソースの結果（rakuten/ndl/google）
  };

  try {
    // ① ISBN が分かっていれば各ソースを server-side 検証（通れば fast path）。
    //    ただし title も渡っている時は、その ISBN が本当にそのタイトルの本かを
    //    NDL で検証してから信用する（誤った ISBN で別の本の表紙を貼らない）。
    //    不一致なら誤 ISBN とみなして破棄し、②③ のタイトル検索で引き直す
    //    （＝「誤った表紙」より、正しい表紙 or 表紙なし。アプリの既存方針）。
    if (isbn) {
      const trust = await isbnTitleMatches(isbn, title, ev);
      if (trust) {
        cover = await coverFor(isbn);
      } else {
        isbn = ''; // 誤 ISBN を破棄 → 以降のタイトル検索で正しい ISBN を引き直す
      }
    }

    // ② 楽天ブックス（和書カバー率が最も高い・タイトル一致必須で兄弟本を除外）。
    //    ISBN 直引き→無ければタイトル検索。表紙 URL は CSP 許可済みの
    //    thumbnail.image.rakuten.co.jp を直接返せる（クライアントが最終検証）。
    //    env（RAKUTEN_APPLICATION_ID / ACCESS_KEY）未設定なら静かにスキップ。
    if (!cover && !settled() && hasTime()) {
      const rk = await rakutenCover(title, author, isbn, ev);
      diag.src.rakuten = { cover: !!rk.cover, isbn: rk.isbn || null, ...(rk._d || {}) };
      if (rk.cover) {
        cover = rk.cover;
        if (rk.isbn) isbn = rk.isbn;
      } else if (rk.isbn && !isbn) {
        // 楽天が本を同定できたが書影なし → 正しい ISBN として他ソースを試す。
        isbn = rk.isbn;
        cover = await coverFor(rk.isbn);
      }
    }

    // ③ NDL OpenSearch（キー不要・和書に強い）で ISBN を引く。
    //    ※ サーバーからの書影 fetch は 403 で弾かれることがあるので、表紙が
    //      検証できなくても「正しい ISBN」は必ず確保する（後段でクライアントに渡す）。
    if (!cover && !settled() && hasTime()) {
      const ndlSink = {};
      const isbns = await ndlIsbns(title, author, ndlSink, ev);
      diag.src.ndl = { isbnCount: isbns.length, first: isbns[0] || null, ...ndlSink };
      for (const cand of isbns.slice(0, 3)) {
        if (!isbn) isbn = cand; // 最初に見つかった ISBN を確保
        if (!hasTime()) break;
        // eslint-disable-next-line no-await-in-loop
        const u = await coverFor(cand);
        if (u) { cover = u; isbn = cand; break; }
      }
    }

    // ④ それでもダメなら Google Books（鍵があれば有効・補助）。
    if (!cover && !settled() && hasTime()) {
      const gSink = {};
      const g = await googleCover(title, author, isbn, gSink, ev);
      diag.src.google = { cover: !!g.cover, isbn: g.isbn || null, ...gSink };
      if (g.cover) { cover = g.cover; if (!isbn) isbn = g.isbn; }
      else if (g.isbn && !isbn) {
        isbn = g.isbn;
        if (hasTime()) cover = await coverFor(g.isbn);
      }
    }
  } catch (e) {
    diag.err = String((e && e.message) || e).slice(0, 120);
    console.warn('[api/cover] failed:', e && e.message);
  }

  // 🔎 実在の判定（?verify=1）。表紙探しの流れが早く終わって（楽天がゆるい照合で表紙を返した等）
  //    書名の検索をしていない検索元があれば、NDL → 楽天 → Google の順に書名で引き直してから判定する。
  //    「ISBN が 1 つでも取れたら実在」はやめた（架空の書名でも、頭が似た別の本の ISBN が取れてしまうため）。
  let verified;
  let match = null;
  if (verifyMode) {
    try {
      match = findStrongMatch(ev.items, title, author);
      if (!match && !ev.ran.ndlTitle) { await ndlIsbns(title, author, null, ev); match = findStrongMatch(ev.items, title, author); }
      if (!match && !ev.ran.rakutenTitle) { await rakutenCover(title, author, '', ev); match = findStrongMatch(ev.items, title, author); }
      if (!match && !ev.ran.googleTitle) { await googleCover(title, author, '', null, ev); match = findStrongMatch(ev.items, title, author); }
    } catch (e) {
      console.warn('[api/cover] verify failed:', e && e.message);
    }
    if (match) {
      verified = true;
      // 返す ISBN・表紙は「一致した本」のものにする（ゆるい照合で掴んだ別の本の表紙を出さない）。
      const strongIsbns = new Set(ev.items
        .filter((it) => it.isbn && strongTitleMatch(title, it.title) && (!author || authorMatches(author, it.authors)))
        .map((it) => it.isbn));
      if (!isbn || !strongIsbns.has(isbn)) {
        isbn = match.isbn || '';
        cover = match.cover || '';
      }
    } else {
      // 検索元のどれかが答えたのに一致する本が無い＝実在しない疑い。どれも答えなかった＝確かめられなかった。
      verified = ev.answered.size > 0 ? false : null;
      isbn = '';
      cover = '';
    }
  }

  // 🔑 重要: server-side で書影 fetch が 403 されても、解決済み ISBN から
  //    候補 URL を構築してクライアントに返す。ブラウザは Referer/UA を付けて
  //    読みに行くので 403 にならず、CSP も許可済み。client が <img> で最終検証する。
  // 返す ISBN は 13 桁にそろえる（NDL の古い本の ISBN-10 も）。
  isbn = toIsbn13(isbn) || isbn;
  const candidates = isbn ? coverCandidatesFor(isbn, { openbd: openbdSink[isbn] || '' }) : [];

  // ⚠️ 失敗（ISBN すら引けなかった空っぽ応答）を長期キャッシュすると、一度
  //    こけた本が CDN に 7 日間張り付いてしまう。成功（ISBN が取れた）時だけ
  //    長期キャッシュし、空っぽは短く（次回すぐ再試行できるように）する。
  if (verifyMode && verified !== true) {
    // 実在しない疑いは少しだけ（10 分）、確かめられなかった（検索元の不調）は覚えない＝次にすぐ確かめ直せる。
    res.setHeader('Cache-Control', verified === false ? 'public, max-age=0, s-maxage=600' : 'no-store');
  } else if (isbn) {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  }
  // 🛡 診断情報は既存の debug ゲートと同じ条件でのみ返す（未認証エンドポイントで
  //    構成情報＝楽天キー設定有無・版マーカー・外部 API のエラー断片を常時公開しない）。
  const out = { cover: cover || '', isbn: isbn || '', candidates };
  if (verifyMode) {
    out.verified = verified;
    out.match = match ? { title: String(match.title || '').slice(0, 200), src: match.src } : null;
  }
  if (process.env.ALLOW_COVER_DEBUG === 'true') out._diag = diag;
  return res.status(200).json(out);
}

export { coreTitle };
