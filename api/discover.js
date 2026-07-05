import https from 'node:https';

// 📚🔥 テーマ別「新着・人気」本の発見 — 楽天ブックス API のサーバープロキシ。
//
// なぜサーバー経由か:
//   - 楽天 Web Service は CORS ヘッダを返さないためブラウザ直 fetch は失敗する。
//   - applicationId をクライアントに露出させない（server env のみ）。
//   - 結果を正規化 + キャッシュ + レート制限して、楽天側の 1req/sec 制限と
//     コスト/速度を守る。
//
// データ源: 楽天ブックス書籍検索 API（BooksBook Search / openapi.rakuten.co.jp）。
//   - sort='sales'        → 売れ筋（人気）
//   - sort='-releaseDate' → 発売日新しい順（新着 / 近刊）
//   - booksGenreId=ジャンル（本 001 直下）で絞る（keyword は売れ筋で無視されるため不可）
//
// ⚠️ 2026 年の楽天 API 刷新に対応済み:
//   - ドメイン app.rakuten.co.jp → openapi.rakuten.co.jp（旧は 2026-05-14 廃止）
//   - 認証は applicationId(UUID) と accessKey(pk_...) の【両方】が必須
//   - Referer/Origin ヘッダー必須（RAKUTEN_APP_URL を Referer として送る）
//
// ★★★ 元帥の環境作業（このコードだけでは動かない）★★★
//   1. 楽天ウェブサービスでアプリを作成（https://webservice.rakuten.co.jp/）
//      → アプリケーションID(UUID) と アクセスキー(pk_...) を取得
//   2. Vercel env（サーバー専用）:
//        RAKUTEN_APPLICATION_ID … アプリケーションID（UUID）
//        RAKUTEN_ACCESS_KEY     … アクセスキー（pk_...）
//        RAKUTEN_APP_URL        … 登録した本番ドメイン URL（Referer 用・必須）
//      （任意）RAKUTEN_AFFILIATE_ID … 設定すると itemUrl にアフィリエイトが付く
//   3. vercel.json の CSP img-src に thumbnail.image.rakuten.co.jp を追加済み
//   ※ APPLICATION_ID か ACCESS_KEY が未設定なら { ok:false, reason:'not_configured' }
//      を 200 で返す（UI は「準備中」表示に倒す＝fail-safe）。

// テーマ（固定キー）→ 楽天ブックスの booksGenreId（本 001 直下の実ジャンル）。
// クライアントは固定キーだけ送れる（サーバー権威のホワイトリスト）。
//
// ⚠️ キーワード検索（keyword=）は sort=sales(売れ筋) 時に無視され全体の売上
//    ランキング（マンガ中心）が返るため使えない。楽天カタログの根幹である
//    booksGenreId で絞れば「そのジャンルの売れ筋／新刊」が確実に出る。
//    ID は本番接続から `?genres=001` で取得した実値（2026-07 時点）。
const THEME_GENRES = {
  'ビジネス・経済': '001006',   // ビジネス・経済・就職
  '人文・思想': '001008',       // 人文・思想・社会（心理・哲学・歴史ほか）
  '新書': '001020',             // 新書（トレンドの教養・時事に強い）
  '小説・エッセイ': '001004',
  '暮らし・健康': '001010',     // 美容・暮らし・健康・料理
  '科学・技術': '001012',
  'IT・パソコン': '001005',     // パソコン・システム開発
  '資格・検定': '001016',
  '旅行・アウトドア': '001007', // 旅行・留学・アウトドア
  '趣味・スポーツ': '001009',   // ホビー・スポーツ・美術
  '語学・学習': '001002',       // 語学・学習参考書
  '漫画': '001001',             // 漫画（コミック）
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
// 表紙未確定の「Now Printing / noimage」プレースホルダは空にして、クライアント側の
// 📕 フォールバックに倒す（ロボットの仮画像が並ぶ見栄えを防ぐ）。
function upscaleCover(url) {
  if (typeof url !== 'string' || !url) return '';
  if (/noimage|now_printing|nowprinting/i.test(url)) return '';
  return url.replace(/_ex=\d+x\d+/, '_ex=300x300');
}

// 楽天が各ジャンルに紛れ込ませる「本ではないグッズ／付録本」を除外する。
// ビジネス棚にサンリオのシールブック等が混ざるのを防ぐ（明確に非書籍のものだけ）。
const NON_BOOK_RE = /(シール\s?ブック|シールセット|ぬりえ|ステッカー|カレンダー|手帳|家計簿|ファン\s?ブック|FAN\s?BOOK|グッズ|フィギュア|ぬいぐるみ|トートバッグ|ポスター|マグカップ|キーホルダー|下敷き|クリアファイル|【バーゲン本】)/i;

function normalizeItem(raw) {
  const it = raw && raw.Item ? raw.Item : raw;
  if (!it || typeof it !== 'object') return null;
  const title = (it.title || '').toString().trim();
  if (!title) return null;
  if (NON_BOOK_RE.test(title)) return null; // 非書籍グッズは弾く
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

  // 🔑 2026 年の楽天 API 刷新後の認証: applicationId(UUID) と accessKey(pk_...) の
  //    両方が必須（片方だけだと 400）。旧来は applicationId のみだった。
  //    env 貼付けの空白/改行事故を避けるため必ず trim。
  const appId = (process.env.RAKUTEN_APPLICATION_ID || '').trim();
  const accessKey = (process.env.RAKUTEN_ACCESS_KEY || '').trim();
  if (!appId || !accessKey) {
    // どちらか未設定 = 機能準備中。UI は「準備中」に倒す（fail-safe）。
    return res.status(200).json({ ok: false, reason: 'not_configured', items: [] });
  }
  const referer = (process.env.RAKUTEN_APP_URL || '').trim();

  const themeRaw = (req.query?.theme || '').toString();
  const sortRaw = (req.query?.sort || 'new').toString();
  const genreId = THEME_GENRES[themeRaw];
  if (!genreId) {
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
    accessKey, // 2026 刷新で必須になったアクセスキー（pk_...）
    booksGenreId: genreId, // ← キーワードではなくジャンルで絞る（売れ筋でも効く）
    sort,
    hits: '30',
    outOfStockFlag: '1', // 品切れ/近刊も含める（新着で近刊を出したい）
    elements: 'title,author,publisherName,isbn,salesDate,itemPrice,largeImageUrl,mediumImageUrl,itemUrl,affiliateUrl',
  });
  if (process.env.RAKUTEN_AFFILIATE_ID) params.set('affiliateId', (process.env.RAKUTEN_AFFILIATE_ID || '').trim());
  // 2026 年のインフラ刷新でドメインが app.rakuten.co.jp → openapi.rakuten.co.jp に
  // 変更（旧ドメインは 2026-05-14 に廃止）。パス/バージョンは書籍検索のまま。
  const url = `https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404?${params.toString()}`;

  // 楽天の新 API は Referer/Origin ヘッダーが無いと 403（REFERRER_MISSING）になる。
  // ⚠️ Vercel の fetch(undici) は `Referer` を「禁止ヘッダー」として仕様準拠で
  //    自動的に剥がすため、fetch では Referer が届かない。そこで Node の https
  //    モジュールで直接リクエストし、Referer/Origin を確実に送る（referer は上で定義済み）。
  try {
    const resp = await rakutenGet(url, referer);
    if (resp.status < 200 || resp.status >= 300) {
      // 楽天側エラー（レート/一時障害/ID不正/Referer 不足など）。通常は生詳細を
      // 返さず graceful。?debug=1 のときだけ切り分け用に詳細を返す（秘密は含めない）。
      const body = { ok: false, reason: 'upstream_error', items: [] };
      if (req.query?.debug === '1') {
        body._debug = { status: resp.status, genreId, sort, hasReferer: !!referer, hasAccessKey: !!accessKey, upstream: (resp.body || '').slice(0, 300) };
      }
      return res.status(200).json(body);
    }
    let data = null;
    try { data = JSON.parse(resp.body); } catch { /* 壊れた JSON は空扱い */ }
    const items = Array.isArray(data?.Items)
      ? data.Items.map(normalizeItem).filter(Boolean)
      : [];
    cache.set(cacheKey, { at: Date.now(), items });
    return res.status(200).json({ ok: true, items });
  } catch (e) {
    return res.status(200).json({ ok: false, reason: 'fetch_failed', items: [] });
  }
}

// Node の https で GET し { status, body } を返す。fetch と違い Referer/Origin を
// 剥がさないので、楽天の新 API（Referer 必須）を確実に通せる。8s タイムアウト・
// レスポンスは 1MB で打ち切り（防御）。
function rakutenGet(urlStr, referer) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { reject(e); return; }
    const headers = { Accept: 'application/json' };
    if (referer) { headers.Referer = referer; headers.Origin = referer; }
    const req = https.request(
      { hostname: u.hostname, path: `${u.pathname}${u.search}`, method: 'GET', headers },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          data += c;
          if (data.length > 1_000_000) { data = data.slice(0, 1_000_000); req.destroy(); }
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      },
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}
