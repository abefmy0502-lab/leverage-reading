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
function cleanIsbn(s) {
  return (s || '').toString().replace(/[-\s]/g, '').trim();
}
function toHttps(u) {
  return u ? String(u).replace(/^http:/i, 'https:') : '';
}
// 副題を落とした「核タイトル」。NDL/Google の title 検索は副題込みだと
// 0 件になりやすいので、最初の区切り（空白・コロン・縦棒等）までを使う。
function coreTitle(t) {
  return clean(t).split(/[\s　:：|｜〜~ー－—–]/)[0] || clean(t);
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

// NDL OpenSearch（XML）から ISBN-13 を上位順に抽出する（DOMParser 不要・regex）。
async function ndlIsbns(title, author) {
  const t = coreTitle(title);
  if (!t) return [];
  const params = [`title=${encodeURIComponent(t)}`];
  if (author) params.push(`creator=${encodeURIComponent(clean(author))}`);
  params.push('cnt=10');
  try {
    const r = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?${params.join('&')}`);
    if (!r.ok) return [];
    const xml = await r.text();
    const found = [];
    const seen = new Set();
    // 978/979 始まりの ISBN-13（ハイフン有無どちらも）を順に拾う。
    const re = /97[89][\d-]{10,17}/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const isbn = cleanIsbn(m[0]);
      if (isbn.length === 13 && !seen.has(isbn)) { seen.add(isbn); found.push(isbn); }
      if (found.length >= 5) break;
    }
    return found;
  } catch {
    return [];
  }
}

// Google Books（鍵があれば使う・補助）。鍵なしはサーバー IP で弾かれやすい。
async function googleCover(title, author, isbn) {
  const key = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
  const q = isbn ? `isbn:${cleanIsbn(isbn)}` : `${coreTitle(title)}${author ? ` ${clean(author)}` : ''}`;
  try {
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&country=JP${key}`,
    );
    if (!r.ok) return { cover: '', isbn: '' };
    const d = await r.json();
    for (const it of d.items || []) {
      const v = it.volumeInfo || {};
      const links = v.imageLinks || {};
      const cover = toHttps(links.thumbnail || links.smallThumbnail || '');
      const ids = v.industryIdentifiers || [];
      const gi =
        (ids.find((x) => x.type === 'ISBN_13') || {}).identifier ||
        (ids.find((x) => x.type === 'ISBN_10') || {}).identifier ||
        '';
      if (cover) return { cover, isbn: cleanIsbn(gi) };
    }
  } catch { /* ignore */ }
  return { cover: '', isbn: '' };
}

// 画像の実在＋「表紙らしさ」を server-side で検証（1×1 / No-image を弾く）。
async function imageIsReal(url) {
  if (!url) return false;
  try {
    const r = await fetch(url, { method: 'GET' });
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

// ISBN から各ソースの表紙を順に検証採用。
async function coverFromIsbn(isbn) {
  const i13 = cleanIsbn(isbn);
  const i10 = isbn13to10(i13);
  const sources = [
    i13 && `https://ndlsearch.ndl.go.jp/thumbnail/${i13}.jpg`,
    i13 && `https://cover.openbd.jp/${i13}.jpg`,
    i10 && `https://m.media-amazon.com/images/P/${i10}.09._SCLZZZZZZZ_.jpg`,
    i10 && `https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`,
  ].filter(Boolean);
  for (const u of sources) {
    // eslint-disable-next-line no-await-in-loop
    if (await imageIsReal(u)) return u;
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const title = clean(req.query?.title);
  const author = clean(req.query?.author);
  const isbnIn = cleanIsbn(req.query?.isbn);
  if (!title && !isbnIn) return res.status(400).json({ error: 'title or isbn required' });

  // 🔎 デバッグ: ?debug=1 で各段階の生の結果を返す（原因切り分け用）。
  if (req.query?.debug) {
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
        const ir = await fetch(u13);
        const buf = ir.ok ? await ir.arrayBuffer() : null;
        dbg.steps.ndlThumb = { url: u13, status: ir.status, contentType: ir.headers.get('content-type'), bytes: buf ? buf.byteLength : 0 };
      }
    } catch (e) { dbg.steps.ndlError = String(e && e.message); }
    try {
      const gr = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(coreTitle(title))}&maxResults=2&country=JP${process.env.GOOGLE_BOOKS_API_KEY ? '&key=' + process.env.GOOGLE_BOOKS_API_KEY : ''}`);
      const gj = gr.ok ? await gr.json() : null;
      dbg.steps.google = { status: gr.status, ok: gr.ok, hasKey: !!process.env.GOOGLE_BOOKS_API_KEY, totalItems: gj ? (gj.totalItems || 0) : null, firstTitle: gj && gj.items ? (gj.items[0]?.volumeInfo?.title || null) : null };
    } catch (e) { dbg.steps.googleError = String(e && e.message); }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(dbg);
  }

  let cover = '';
  let isbn = isbnIn;

  try {
    // ① ISBN が分かっていれば各ソースを直接検証。
    if (isbn) cover = await coverFromIsbn(isbn);

    // ② NDL OpenSearch（キー不要・和書最強）で ISBN を引いて表紙を検証採用。
    if (!cover) {
      const isbns = await ndlIsbns(title, author);
      for (const cand of isbns) {
        // eslint-disable-next-line no-await-in-loop
        const u = await coverFromIsbn(cand);
        if (u) { cover = u; isbn = cand; break; }
        if (!isbn) isbn = cand;
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

  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  return res.status(200).json({ cover: cover || '', isbn: isbn || '' });
}
