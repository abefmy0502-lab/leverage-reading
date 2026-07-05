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
function normPerson(s) {
  return (s || '')
    .toString()
    .replace(/[\s　,，、・･.。]/g, '')
    .replace(/(著|編|訳|監修|共著|編著)$/g, '')
    .toLowerCase();
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
  if (!r.ok) return '';
  return r.text();
}

// NDL OpenSearch（XML）で ISBN-13 候補を引く。
//   ① まず title + creator の AND 検索（精度重視）。
//   ② 0 件なら title のみで再検索し、各 <item> の dc:creator を見て「本人の本」
//      だけを採用（NDL は creator の表記揺れで AND 検索が空振りしやすいため。
//      著者照合で誤マッチを防ぐ）。
async function ndlIsbns(title, author) {
  const t = coreTitle(title);
  if (!t) return [];
  try {
    // ① title + creator
    const p1 = [`title=${encodeURIComponent(t)}`];
    if (author) p1.push(`creator=${encodeURIComponent(clean(author))}`);
    p1.push('cnt=10');
    const xml1 = await ndlFetch(p1);
    const found1 = extractIsbns(xml1);
    if (found1.length > 0) return found1;

    // ② title のみ → item 単位で著者照合
    if (!author) return [];
    const xml2 = await ndlFetch([`title=${encodeURIComponent(t)}`, 'cnt=20']);
    if (!xml2) return [];
    const wantAuthor = normPerson(author);
    if (!wantAuthor) return [];
    const items = xml2.split(/<item[\s>]/i).slice(1);
    const matched = [];
    const seen = new Set();
    for (const chunk of items) {
      const creators = (chunk.match(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/gi) || [])
        .map((c) => normPerson(c.replace(/<[^>]+>/g, '')));
      const hit = creators.some(
        (c) => c && (c.includes(wantAuthor) || wantAuthor.includes(c)),
      );
      if (!hit) continue;
      for (const isbn of extractIsbns(chunk, 3)) {
        if (!seen.has(isbn)) { seen.add(isbn); matched.push(isbn); }
      }
      if (matched.length >= 5) break;
    }
    return matched;
  } catch {
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
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items || []).map((it) => it.volumeInfo || {});
  } catch {
    return [];
  }
}

// タイトル照合用の正規化（記号・空白を落とす）。
function normTitle(s) {
  return clean(s).replace(/[\s　・･,，、.。:：「」『』\-―ー（）()]/g, '').toLowerCase();
}
function gTitleMatch(v, coreNorm) {
  if (!coreNorm) return false;
  const t = normTitle(v.title || '');
  if (!t) return false;
  return t.includes(coreNorm) || coreNorm.includes(t);
}

async function googleCover(title, author, isbn) {
  const want = normPerson(author);
  const core = coreTitle(title);
  const coreNorm = normTitle(core);

  if (isbn) {
    const items = await googleFetchVolumes(`isbn:${cleanIsbn(isbn)}`);
    for (const v of items) { const f = gVolFields(v); if (f.cover) return f; }
    return { cover: '', isbn: '' };
  }
  if (!author) {
    const items = await googleFetchVolumes(core);
    for (const v of items) { const f = gVolFields(v); if (f.cover) return f; }
    return { cover: '', isbn: '' };
  }

  // 著者あり: 精度順にクエリを試す。日本語の短いタイトルは intitle が空振り
  // しやすいので、最終的に「著者で広く引いてタイトルで絞る」を効かせる。
  //   { q, max, needTitle } — needTitle=true は、その query 結果で
  //   著者一致だけでなくタイトル照合も要求する（別の著作を誤採用しないため）。
  const plans = [
    { q: `intitle:${core} inauthor:${clean(author)}`, max: 10, needTitle: false },
    { q: `${core} ${clean(author)}`, max: 20, needTitle: true },
    { q: `inauthor:${clean(author)}`, max: 40, needTitle: true },
  ];

  let isbnOnly = '';
  for (const plan of plans) {
    // eslint-disable-next-line no-await-in-loop
    const items = await googleFetchVolumes(plan.q, plan.max);
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

  try {
    // ① ISBN が分かっていれば各ソースを server-side 検証（通れば fast path）。
    if (isbn) cover = await coverFromIsbn(isbn);

    // ② NDL OpenSearch（キー不要・和書最強）で ISBN を引く。
    //    ※ サーバーからの書影 fetch は 403 で弾かれることがあるので、表紙が
    //      検証できなくても「正しい ISBN」は必ず確保する（後段でクライアントに渡す）。
    if (!cover) {
      const isbns = await ndlIsbns(title, author);
      for (const cand of isbns) {
        if (!isbn) isbn = cand; // 最初に見つかった ISBN を確保
        // eslint-disable-next-line no-await-in-loop
        const u = await coverFromIsbn(cand);
        if (u) { cover = u; isbn = cand; break; }
      }
    }

    // ③ それでもダメなら Google Books（鍵があれば有効・補助）。
    if (!cover) {
      const g = await googleCover(title, author, isbn);
      if (g.cover) { cover = g.cover; if (!isbn) isbn = g.isbn; }
      else if (g.isbn && !isbn) {
        isbn = g.isbn;
        cover = await coverFromIsbn(g.isbn);
      }
    }
  } catch (e) {
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
  return res.status(200).json({ cover: cover || '', isbn: isbn || '', candidates });
}
