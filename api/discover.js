// 📚🔥 テーマ別「新着・人気」本の発見 — 楽天ブックス API のサーバープロキシ。
//
// なぜサーバー経由か:
//   - 楽天 Web Service は CORS ヘッダを返さないためブラウザ直 fetch は失敗する。
//   - applicationId をクライアントに露出させない（server env のみ）。
//   - 結果を正規化 + キャッシュ + レート制限して、楽天側の 1req/sec 制限と
//     コスト/速度を守る。
//
// データ源: 楽天ブックス書籍検索 API（BooksBook Search）。
//   - sort='sales'        → 売れ筋（人気）
//   - sort='-releaseDate' → 発売日新しい順（新着 / 近刊）
//   - keyword=テーマ語, 書籍のみ（BooksBook）
//
// ★★★ 元帥の環境作業（このコードだけでは動かない）★★★
//   1. 楽天ウェブサービスでアプリ ID を無料発行（https://webservice.rakuten.co.jp/）
//   2. Vercel env: RAKUTEN_APPLICATION_ID（サーバー専用）
//      （任意）RAKUTEN_AFFILIATE_ID … 設定すると itemUrl にアフィリエイトが付く
//   3. vercel.json の CSP img-src に thumbnail.image.rakuten.co.jp を追加済み
//   ※ RAKUTEN_APPLICATION_ID 未設定なら { ok:false, reason:'not_configured' } を
//      200 で返す（UI は「準備中」表示に倒す＝fail-safe）。

// テーマ（固定キー）→ 楽天検索キーワード。クライアントは固定キーだけ送れる
// （任意キーワードを楽天へ流さない＝サーバー権威のホワイトリスト）。
const THEME_KEYWORDS = {
  '読書': '読書術',
  '営業': '営業',
  'リーダーシップ': 'リーダーシップ',
  '習慣化': '習慣',
  'マーケティング': 'マーケティング',
  '思考法・意思決定': '思考法',
  'お金・投資': '投資',
  '心理学': '心理学',
  '伝え方・文章': '文章術',
  'チームづくり': 'チームビルディング',
  '健康・運動': '健康',
  // ビジネスパーソンの「時代感度」に応える汎用トレンド系（ぶらぶら発見の平台用）。
  'ビジネス': 'ビジネス書',
  '自己啓発': '自己啓発',
  '教養': '教養',
  '時間術': '時間術',
  'キャリア': 'キャリア',
};

// ── 簡易 IP レート制限（未認証・公開エンドポイント。cover.js と同流儀）──
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 40;
const rateLimitStore = new Map();
function checkRateLimit(key) {
  const now = Date.now();
  const arr = (rateLimitStore.get(key) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) return { ok: false, retryAfter: Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - arr[0])) / 1000)) };
  arr.push(now);
  rateLimitStore.set(key, arr);
  if (rateLimitStore.size > 2000) {
    for (const [k, v] of rateLimitStore) {
      const alive = v.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
      if (alive.length === 0) rateLimitStore.delete(k); else rateLimitStore.set(k, alive);
    }
  }
  return { ok: true };
}
function clientKey(req) {
  const h = req.headers || {};
  const realIp = typeof h['x-real-ip'] === 'string' ? h['x-real-ip'].trim() : '';
  const fwd = typeof h['x-forwarded-for'] === 'string' ? h['x-forwarded-for'].split(',')[0].trim() : '';
  return (realIp || fwd || req.socket?.remoteAddress || 'unknown').trim();
}

// ── 結果キャッシュ（テーマ×sort ごと・TTL 1h）。楽天への叩きすぎ防止 + 高速化 ──
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map(); // key -> { at, items }

// 楽天のサムネ URL を少し大きめ（_ex=300x300）に。無ければそのまま。
function upscaleCover(url) {
  if (typeof url !== 'string' || !url) return '';
  return url.replace(/_ex=\d+x\d+/, '_ex=300x300');
}

function normalizeItem(raw) {
  const it = raw && raw.Item ? raw.Item : raw;
  if (!it || typeof it !== 'object') return null;
  const title = (it.title || '').toString().trim();
  if (!title) return null;
  return {
    title,
    author: (it.author || '').toString().trim(),
    publisher: (it.publisherName || '').toString().trim(),
    isbn: (it.isbn || '').toString().replace(/[^0-9Xx]/g, ''),
    cover: upscaleCover(it.largeImageUrl || it.mediumImageUrl || ''),
    salesDate: (it.salesDate || '').toString().trim(),
    price: Number.isFinite(Number(it.itemPrice)) ? Number(it.itemPrice) : null,
    // アフィリエイト設定時は affiliateUrl が入る。無ければ通常 itemUrl。
    url: (it.affiliateUrl || it.itemUrl || '').toString(),
  };
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

  const appId = process.env.RAKUTEN_APPLICATION_ID;
  if (!appId) {
    // 未設定 = 機能準備中。UI は「準備中」に倒す（fail-safe）。
    return res.status(200).json({ ok: false, reason: 'not_configured', items: [] });
  }

  const themeRaw = (req.query?.theme || '').toString();
  const sortRaw = (req.query?.sort || 'new').toString();
  const keyword = THEME_KEYWORDS[themeRaw];
  if (!keyword) {
    return res.status(400).json({ ok: false, reason: 'unknown_theme', items: [] });
  }
  // new=発売日新しい順 / popular=売れ筋。それ以外は new に倒す。
  const sort = sortRaw === 'popular' ? 'sales' : '-releaseDate';

  const cacheKey = `${themeRaw}|${sort}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return res.status(200).json({ ok: true, cached: true, items: cached.items });
  }

  const params = new URLSearchParams({
    format: 'json',
    applicationId: appId,
    keyword,
    sort,
    hits: '20',
    outOfStockFlag: '1', // 品切れ/近刊も含める（新着で近刊を出したい）
    elements: 'title,author,publisherName,isbn,salesDate,itemPrice,largeImageUrl,mediumImageUrl,itemUrl,affiliateUrl',
  });
  if (process.env.RAKUTEN_AFFILIATE_ID) params.set('affiliateId', process.env.RAKUTEN_AFFILIATE_ID);
  const url = `https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404?${params.toString()}`;

  // 楽天ウェブサービスの「許可されたWebサイト」制限対策。うちはサーバー(Vercel)から
  // 叩くので通常 Referer が付かない。登録したドメイン(RAKUTEN_APP_URL)を Referer と
  // して送り、ドメイン照合を通す。未設定なら送らない（従来挙動＝無害）。
  const reqHeaders = { Accept: 'application/json' };
  if (process.env.RAKUTEN_APP_URL) reqHeaders.Referer = process.env.RAKUTEN_APP_URL;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    let r;
    try {
      r = await fetch(url, { signal: controller.signal, headers: reqHeaders });
    } finally {
      clearTimeout(t);
    }
    if (!r.ok) {
      // 楽天側エラー（レート/一時障害/ID不正など）。通常は生詳細を返さず graceful。
      // ?debug=1 のときだけ、切り分け用に楽天の HTTP ステータス＋エラー本文を返す
      // （applicationId 等の秘密は含めない。楽天の error/error_description のみ）。
      const body = { ok: false, reason: 'upstream_error', items: [] };
      if (req.query?.debug === '1') {
        let upstream = '';
        try { upstream = (await r.text()).slice(0, 300); } catch { /* ignore */ }
        body._debug = { status: r.status, keyword, sort, hasReferer: !!process.env.RAKUTEN_APP_URL, upstream };
      }
      return res.status(200).json(body);
    }
    const data = await r.json();
    const items = Array.isArray(data?.Items)
      ? data.Items.map(normalizeItem).filter(Boolean)
      : [];
    cache.set(cacheKey, { at: Date.now(), items });
    return res.status(200).json({ ok: true, items });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'fetch_failed', items: [] });
  }
}
