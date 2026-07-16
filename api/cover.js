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
// 入力（GET）: title, author, isbn（最低 title か isbn）
// 出力: { cover, isbn }（cover が '' なら未発見）。認証なし・公開書誌の読み取り専用。

import https from 'node:https';

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
  return clean(t).split(/[\s　:：|｜〜~－—–]/)[0] || clean(t);
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

// XML から ISBN-13 を上位順に抽出（DOMParser 不要・regex）。
function extractIsbns(xml, limit = 5) {
  const found = [];
  const seen = new Set();
  const re = /97[89][\d-]{10,17}/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const isbn = cleanIsbn(m[0]);
    if (isbn.length === 13 && !seen.has(isbn)) { seen.add(isbn); found.push(isbn); }
    if (found.length >= limit) break;
  }
  return found;
}

async function ndlFetch(params) {
  const r = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?${params.join('&')}`);
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

// この ISBN が本当にそのタイトルの本かを NDL で検証する（誤 ISBN ガード）。
//   背景: 「ISBN が分かっている本はその ISBN で表紙を直接取る」ファストパスは、
//   ISBN が別の本のもの（例: AI 選書の架空タイトルに無関係な実在本の ISBN が
//   紐づく）でも「ISBN 通り」の誤表紙を貼ってしまう。タイトルが渡っている時だけ、
//   ISBN の実書名がタイトルと一致するかを引いてから信用する。
//   ⚠️ fail-open: NDL に無い / 取得不可 / 障害のときは true（＝従来通り信用）を返し、
//      ISBN が NDL 未収録の正当な本を誤って弾かない（退行防止）。明確に別書名の
//      item しか返らなかった時だけ false。
async function isbnTitleMatches(isbn, title) {
  const cleaned = cleanIsbn(isbn);
  if (!cleaned) return true;
  const want = normTitle(coreTitle(title));
  if (!want) return true; // タイトル未指定は検証しない（従来挙動）
  try {
    const xml = await ndlFetch([`isbn=${encodeURIComponent(cleaned)}`, 'cnt=5']);
    if (!xml || !/<item[\s>]/i.test(xml)) return true; // 判定不能 → 信用（fail-open）
    const items = xml.split(/<item[\s>]/i).slice(1);
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
async function ndlIsbns(title, author, sink) {
  const t = coreTitle(title);
  if (!t) return [];
  const wantCoreNorm = normTitle(t);
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
    if (!xml || !/<item[\s>]/i.test(xml)) {
      xml = await ndlFetch([`title=${encodeURIComponent(t)}`, 'cnt=20']);
      if (sink) sink.http2 = ndlFetch._lastStatus ?? null;
    }
    if (!xml) return [];

    const items = xml.split(/<item[\s>]/i).slice(1);
    if (sink) { sink.raw = items.length; sink.tmatch = 0; }
    const both = [];       // タイトル一致＋著者一致（最優先）
    const titleOnly = [];  // タイトルのみ一致（著者照合が落ちた時の保険）
    const seen = new Set();
    for (const chunk of items) {
      // タイトル一致は必須。ここで兄弟本（別書名・同著者）を弾く。
      if (!ndlTitleMatches(itemTitle(chunk), wantCoreNorm)) continue;
      if (sink) sink.tmatch += 1;
      const creators = (chunk.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/gi) || [])
        .map((c) => normPerson(c.replace(/<[^>]+>/g, '')));
      const authorOk = !wantAuthor
        || creators.some((c) => c && (c.includes(wantAuthor) || wantAuthor.includes(c)));
      for (const isbn of extractIsbns(chunk, 3)) {
        if (seen.has(isbn)) continue;
        seen.add(isbn);
        (authorOk ? both : titleOnly).push(isbn);
      }
    }
    return [...both, ...titleOnly].slice(0, 5);
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
async function googleFetchVolumes(q, max = 10) {
  const key = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
  try {
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${max}&country=JP${key}`,
    );
    googleFetchVolumes._lastStatus = r.status;
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

async function googleCover(title, author, isbn, sink) {
  const want = normPerson(author);
  const core = coreTitle(title);
  const coreNorm = normTitle(core);

  if (isbn) {
    const items = await googleFetchVolumes(`isbn:${cleanIsbn(isbn)}`);
    if (sink) { sink.http = googleFetchVolumes._lastStatus ?? null; sink.raw = items.length; }
    for (const v of items) { const f = gVolFields(v); if (f.cover) return f; }
    return { cover: '', isbn: '' };
  }
  if (!author) {
    const items = await googleFetchVolumes(core);
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
    // eslint-disable-next-line no-await-in-loop
    const items = await googleFetchVolumes(plan.q, plan.max);
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
function rakutenGet(urlStr, referer) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const headers = { Accept: 'application/json' };
    // Vercel の fetch(undici) は Referer を禁止ヘッダーとして剥がすため、
    // Node https で直接送る（楽天の新 API は Referer 無しだと 403）。
    if (referer) { headers.Referer = referer; headers.Origin = referer; }
    const req = https.request(
      { hostname: u.hostname, path: `${u.pathname}${u.search}`, method: 'GET', headers },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
          if (data.length > 1_000_000) {
            data = data.slice(0, 1_000_000);
            resolve({ status: res.statusCode || 200, body: data });
            req.destroy();
          }
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      },
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

// 楽天のサムネ URL の _ex サイズ指定を拡大（既定は 120x120 程度で粗い）。
function rakutenUpscale(url) {
  if (!url) return '';
  return toHttps(String(url)).replace(/_ex=\d+x\d+/, '_ex=420x420');
}

// タイトル(+著者) または ISBN から楽天ブックスで表紙を引く。
// NDL と同じ照合規律: ISBN 直引き以外は「タイトル一致必須」＋「著者一致を優先」。
// 兄弟本（同著者・別書名）のカバーは絶対に採らない。
// 返り値 { cover, isbn }（見つからなければ両方 ''）。
async function rakutenCover(title, author, isbn) {
  const appId = (process.env.RAKUTEN_APPLICATION_ID || '').trim();
  const accessKey = (process.env.RAKUTEN_ACCESS_KEY || '').trim();
  if (!appId || !accessKey) return { cover: '', isbn: '' };
  const referer = (process.env.RAKUTEN_APP_URL || '').trim();
  const d = { ref: !!referer, tmatch: 0, tries: [] };

  const fields = (it) => ({
    cover: rakutenUpscale(it.largeImageUrl || it.mediumImageUrl || ''),
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
  const iq = cleanIsbn(isbn);
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
  const wantAuthor = normPerson(author);
  const kw = [t, firstAuthor(author)].filter(Boolean).join(' ');
  const items = await run('BooksTotal/Search', { keyword: kw }, 'kw');

  let titleOnly = null;
  for (const it of items) {
    const f = fields(it);
    if (!f.cover) continue;
    const tn = normTitle(f.title);
    if (!tn || !(tn.includes(wantCoreNorm) || wantCoreNorm.includes(tn))) continue;
    d.tmatch += 1;
    const an = normPerson(f.author);
    const authorOk = !wantAuthor || (an && (an.includes(wantAuthor) || wantAuthor.includes(an)));
    if (authorOk) return { cover: f.cover, isbn: f.isbn, _d: d };
    if (!titleOnly) titleOnly = { cover: f.cover, isbn: f.isbn };
  }
  return { ...(titleOnly || { cover: '', isbn: '' }), _d: d };
}

// 一部の書影 CDN（NDL / Amazon）はデータセンター IP からの素の fetch を
// 403 で弾く（ブラウザの UA / Referer が無いため）。ブラウザ相当のヘッダを
// 付けると通ることが多い。
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.8',
  Referer: 'https://ndlsearch.ndl.go.jp/',
};

// 画像の実在＋「表紙らしさ」を server-side で検証（1×1 / No-image を弾く）。
// ※ これは best-effort。403 等で検証できなくても、呼び出し側は ISBN から
//   構築した URL をクライアントに返し、ブラウザ側で最終検証する。
async function imageIsReal(url) {
  if (!url) return false;
  try {
    const r = await fetch(url, { method: 'GET', headers: BROWSER_HEADERS });
    if (!r.ok) return false;
    const ct = r.headers.get('content-type') || '';
    if (!/^image\//i.test(ct)) return false;
    // content-length は欠落することがあるので実バイト数で判定する。
    // NDL の 1×1 / "No image" placeholder は数百バイト → 4KB 未満を弾く。
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 4096) return false;
    return true;
  } catch {
    return false;
  }
}

// ISBN から表紙 URL の候補を優先順で構築（クライアントが <img> で実在検証する）。
// 鍵不要・和書カバー率の高い順。
function coverCandidatesFor(isbn) {
  const i13 = cleanIsbn(isbn);
  const i10 = isbn13to10(i13);
  return [
    i13 && `https://ndlsearch.ndl.go.jp/thumbnail/${i13}.jpg`,
    i13 && `https://cover.openbd.jp/${i13}.jpg`,
    i13 && `https://covers.openlibrary.org/b/isbn/${i13}-L.jpg?default=false`,
    // Google Books の ISBN 直リンク（未登録本はプレースホルダーを返すため、
    // クライアント側 checkImageExists の縦横比ゲートで検証してから採用される）。
    i13 && `https://books.google.com/books/content?vid=ISBN${i13}&printsec=frontcover&img=1&zoom=1`,
    i10 && `https://m.media-amazon.com/images/P/${i10}.09._SCLZZZZZZZ_.jpg`,
    i10 && `https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`,
  ].filter(Boolean);
}

// ISBN から各ソースの表紙を順に server-side 検証採用（best-effort）。
async function coverFromIsbn(isbn) {
  for (const u of coverCandidatesFor(isbn)) {
    // eslint-disable-next-line no-await-in-loop
    if (await imageIsReal(u)) return u;
  }
  return '';
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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = checkRateLimit(clientKey(req));
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too Many Requests', retry_after: rl.retryAfter });
  }

  const title = clean(req.query?.title);
  const author = clean(req.query?.author);
  const isbnIn = cleanIsbn(req.query?.isbn);
  if (!title && !isbnIn) return res.status(400).json({ error: 'title or isbn required' });

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
      const trust = await isbnTitleMatches(isbn, title);
      if (trust) {
        cover = await coverFromIsbn(isbn);
      } else {
        isbn = ''; // 誤 ISBN を破棄 → 以降のタイトル検索で正しい ISBN を引き直す
      }
    }

    // ② 楽天ブックス（和書カバー率が最も高い・タイトル一致必須で兄弟本を除外）。
    //    ISBN 直引き→無ければタイトル検索。表紙 URL は CSP 許可済みの
    //    thumbnail.image.rakuten.co.jp を直接返せる（クライアントが最終検証）。
    //    env（RAKUTEN_APPLICATION_ID / ACCESS_KEY）未設定なら静かにスキップ。
    if (!cover) {
      const rk = await rakutenCover(title, author, isbn);
      diag.src.rakuten = { cover: !!rk.cover, isbn: rk.isbn || null, ...(rk._d || {}) };
      if (rk.cover) {
        cover = rk.cover;
        if (rk.isbn) isbn = rk.isbn;
      } else if (rk.isbn && !isbn) {
        // 楽天が本を同定できたが書影なし → 正しい ISBN として他ソースを試す。
        isbn = rk.isbn;
        cover = await coverFromIsbn(rk.isbn);
      }
    }

    // ③ NDL OpenSearch（キー不要・和書に強い）で ISBN を引く。
    //    ※ サーバーからの書影 fetch は 403 で弾かれることがあるので、表紙が
    //      検証できなくても「正しい ISBN」は必ず確保する（後段でクライアントに渡す）。
    if (!cover) {
      const ndlSink = {};
      const isbns = await ndlIsbns(title, author, ndlSink);
      diag.src.ndl = { isbnCount: isbns.length, first: isbns[0] || null, ...ndlSink };
      for (const cand of isbns) {
        if (!isbn) isbn = cand; // 最初に見つかった ISBN を確保
        // eslint-disable-next-line no-await-in-loop
        const u = await coverFromIsbn(cand);
        if (u) { cover = u; isbn = cand; break; }
      }
    }

    // ④ それでもダメなら Google Books（鍵があれば有効・補助）。
    if (!cover) {
      const gSink = {};
      const g = await googleCover(title, author, isbn, gSink);
      diag.src.google = { cover: !!g.cover, isbn: g.isbn || null, ...gSink };
      if (g.cover) { cover = g.cover; if (!isbn) isbn = g.isbn; }
      else if (g.isbn && !isbn) {
        isbn = g.isbn;
        cover = await coverFromIsbn(g.isbn);
      }
    }
  } catch (e) {
    diag.err = String((e && e.message) || e).slice(0, 120);
    console.warn('[api/cover] failed:', e && e.message);
  }

  // 🔑 重要: server-side で書影 fetch が 403 されても、解決済み ISBN から
  //    候補 URL を構築してクライアントに返す。ブラウザは Referer/UA を付けて
  //    読みに行くので 403 にならず、CSP も許可済み。client が <img> で最終検証する。
  const candidates = isbn ? coverCandidatesFor(isbn) : [];

  // ⚠️ 失敗（ISBN すら引けなかった空っぽ応答）を長期キャッシュすると、一度
  //    こけた本が CDN に 7 日間張り付いてしまう。成功（ISBN が取れた）時だけ
  //    長期キャッシュし、空っぽは短く（次回すぐ再試行できるように）する。
  if (isbn) {
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  }
  return res.status(200).json({ cover: cover || '', isbn: isbn || '', candidates, _diag: diag });
}
