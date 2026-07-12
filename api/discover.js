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
const RATE_LIMIT_MAX_KEYS = 5000; // ハードキャップ（詐称IPフラッド時のメモリ暴走防止）
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
    // 期限切れ掃除後もキャップ超過（＝短時間に大量のユニークキー＝IP詐称フラッド）
    // なら、挿入順が古い方から強制退避してメモリ暴走を止める（Map は挿入順を保持）。
    if (rateLimitStore.size > RATE_LIMIT_MAX_KEYS) {
      const excess = rateLimitStore.size - RATE_LIMIT_MAX_KEYS;
      let i = 0;
      for (const k of rateLimitStore.keys()) {
        if (i >= excess) break;
        rateLimitStore.delete(k);
        i += 1;
      }
    }
  }
  return { ok: true };
}
function clientKey(req) {
  const h = req.headers || {};
  // Vercel はプラットフォーム側で x-real-ip を実クライアント IP に上書きするため最優先。
  // x-forwarded-for の左端はクライアントが付与可能（詐称可）なのでフォールバック扱い。
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

// 楽天が各ジャンルに紛れ込ませる「本ではないグッズ／付録本／ムック・雑誌」を除外する。
// ビジネス棚に飲食店ムック（例: Royal Host ぴあ）やサンリオのシールブック等が混ざる
// のを防ぐ。明確に非書籍/非読書のものだけを弾く（誤って実本を消さないよう保守的に）。
// 強語（どのジャンルでも非読書対象）と弱語（美術・漫画では正規商品）を分ける:
//   - 強語: グッズ/ムック/増刊号 等 — 全ジャンルで除外
//   - 弱語: 写真集/画集/総集編/完全保存版 — 「趣味・スポーツ（美術含む）」「漫画」
//     では正規の本なので適用しない（それ以外の棚では雑誌的ノイズとして除外）
const NON_BOOK_RE = /(シール\s?ブック|シールセット|ぬりえ|ステッカー|カレンダー|手帳|家計簿|ファン\s?ブック|FAN\s?BOOK|グッズ|フィギュア|ぬいぐるみ|トートバッグ|ポスター|マグカップ|キーホルダー|下敷き|クリアファイル|【バーゲン本】|ムック|MOOK|増刊号)/i;
const NON_BOOK_WEAK_RE = /(総集編|完全保存版|写真集|画集)/i;
// 弱語フィルタを適用しない（=写真集/画集が正規商品である）テーマ。
const WEAK_FILTER_EXEMPT = new Set(['趣味・スポーツ', '漫画']);

// 楽天の `size`（書籍サイズ）メタデータが「ムック/雑誌」なら読書対象外として弾く。
// これはタイトル正規表現より確実（＝出版形態そのもの）で、飲食店ムック等の
// 「タイトルに手掛かりが無い雑誌的商品」を的確に除外できる。size が空/未知の時は
// fail-open（消さない）＝ メタデータ欠落で棚が空になる事故を防ぐ。
const NON_BOOK_SIZE_RE = /(ムック|雑誌|カレンダー|MOOK)/i;

// 📵 「読み物」棚の質を守る学習教材フィルタ。
// 楽天のジャンル売れ筋（特にビジネス・経済 001006）は、資格試験の教科書・問題集・
// 年度版実務書が上位を占拠する（宅建/簿記/FP/保険調剤 等）。これらは「読む本」では
// なく勉強道具なので、読み物の棚（ビジネス/人文/新書/小説…）からは除外する。
// ⚠️ ただし「資格・検定」「語学・学習」の棚そのものでは主役なので適用しない
//    （STUDY_EXEMPT_THEMES）。誤爆リスクの高い一般語（例:「教科書」「入門」）は
//    含めない — ビジネス書の題名装置（『〜の教科書』）を殺さないため。
const STUDY_BOOK_RE = new RegExp(
  [
    // 出版形態（試験対策物の定番シグナル）
    '問題集', '過去問', '予想模試', '模試', '一問一答', '直前対策', '直前予想',
    '出る順', '頻出', '試験に出る', '赤シート', '書き込み式', '完全攻略', '合格テキスト',
    '公式テキスト', '試験対策', 'テキスト＆問題', 'テキスト&問題',
    // 資格・試験の固有名
    '宅建', '行政書士', '司法書士', '社労士', '中小企業診断士', '衛生管理者',
    '危険物取扱', '電験', '簿記', 'FP\\d1?級', 'ファイナンシャル・?プランニング技能',
    'TOEIC', 'TOEFL', 'IELTS', '英検', '漢検', '基本情報技術者', '応用情報技術者',
    'ITパスポート', '介護福祉士', '保育士試験', '看護師国家試験', 'ケアマネ', '登録販売者',
    '調剤報酬', '診療報酬', '点数表',
    // 年度版（実務書・試験書のシグナル。読み物はほぼ年度版を名乗らない）
    // '年度版' 単体トークンで括弧割り込み表記も捕捉（旧パターンは
    // 『賃貸不動産管理の知識と実務 令和8（2026）年度版』の括弧で不一致＝実漏れ）。
    '年度版', '令和\\d+年度?版?', '20\\d{2}年度版', '20\\d{2}年版', '\\d+年度用',
    // 級もの（漢検2級・簿記3級 等）
    '\\d+級',
  ].join('|'),
);
const STUDY_EXEMPT_THEMES = new Set(['資格・検定', '語学・学習']);

// 💸 ビジネス棚専用のノイズフィルタ。楽天「ビジネス・経済・就職 001006」の売れ筋は
// ①一攫千金・投機ハウツー（爆勝ち/1億貯めた/ほったらかし等）②原著のマンガ・
// コミック版 ③業界研究ムック（動向とカラクリ/よ〜くわかる本）が上位を占拠し、
// 「自己投資の読書」を求めるユーザーの棚の信頼を壊す（実機スクリーンショットで
// AI株投資爆勝ち/ママ投資家1億/マンガわが投資術2/物流業界カラクリを確認）。
// 名著（敗者のゲーム/サイコロジー・オブ・マネー/金持ち父さん等）は一切マッチしない
// ことを実タイトルで検証済み。ビジネス・経済の棚にのみ適用（他棚は対象外）。
const BUSINESS_NOISE_RE = new RegExp(
  [
    // マンガ・コミック版（派生版は原著に譲る）
    '^(マンガ|まんが|コミック)', 'マンガでわかる', 'まんがでわかる', 'マンガで学ぶ', 'コミック版',
    // 一攫千金・投機ハウツー
    '億り人', '億超え', '\\d億(円)?貯', '爆勝ち', '爆益', '秒速で', 'ほったらかし',
    '不労所得', 'デイトレ', 'スキャルピング', 'バイナリーオプション', '必勝法',
    '勝率\\d', '\\d+万円を?稼', '働かずに', '寝てる?間に',
    // 業界研究ムック・図解シリーズ（読み物ではなく就活/実務資料）
    '業界研究', '動向とカラクリ', 'よ〜くわかる本', '図解入門ビジネス',
  ].join('|'),
);
const BUSINESS_NOISE_THEMES = new Set(['ビジネス・経済']);

export function normalizeItem(raw, theme = '') {
  const it = raw && raw.Item ? raw.Item : raw;
  if (!it || typeof it !== 'object') return null;
  const title = (it.title || '').toString().trim();
  if (!title) return null;
  if (NON_BOOK_RE.test(title)) return null; // 非書籍グッズ/ムック（タイトル由来）は弾く
  if (!WEAK_FILTER_EXEMPT.has(theme) && NON_BOOK_WEAK_RE.test(title)) return null; // 弱語（棚により正規）
  // 学習教材（資格・問題集・年度版）は読み物の棚から除外。資格/語学の棚では主役なので残す。
  if (!STUDY_EXEMPT_THEMES.has(theme) && STUDY_BOOK_RE.test(title)) return null;
  // ビジネス棚の投機ハウツー・マンガ版・業界ムックを除外（棚の信頼の生命線）。
  if (BUSINESS_NOISE_THEMES.has(theme) && BUSINESS_NOISE_RE.test(title)) return null;
  const size = (it.size || '').toString().trim();
  if (size && NON_BOOK_SIZE_RE.test(size)) return null; // ムック/雑誌（メタデータ由来）を弾く
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
    // size = 書籍サイズ（ムック/雑誌の判定に使う）。booksGenreId = 各書籍の実ジャンル
    // パス（将来のサブジャンル精緻化・診断用に取得）。
    elements: 'title,author,publisherName,isbn,salesDate,itemPrice,largeImageUrl,mediumImageUrl,itemUrl,affiliateUrl,size,booksGenreId',
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
      // 楽天側エラー（レート/一時障害/ID不正/Referer 不足など）。生詳細は返さず graceful。
      return res.status(200).json({ ok: false, reason: 'upstream_error', items: [] });
    }
    let data = null;
    try { data = JSON.parse(resp.body); } catch { /* 壊れた JSON は空扱い */ }
    let items = Array.isArray(data?.Items)
      ? data.Items.map((raw) => normalizeItem(raw, themeRaw)).filter(Boolean)
      : [];
    // 📕 表紙必須。カバー主役の平台 UI で表紙なし（近刊の未登録・noimage）が並ぶと
    //    棚全体が壊れて見える（実機で確認）。表紙ありだけで 8 冊以上組めるなら
    //    絞り、足りない時だけ fail-open（棚が空になる事故を防ぐ）。
    const covered = items.filter((i) => i.cover);
    if (covered.length >= 8) items = covered;
    // ⚠️ 空結果はキャッシュしない。楽天の一時的な空/全件フィルタ除外を 1h キャッシュ
    //    すると、テーマ棚が全ユーザーに 1 時間空になり回復しない事故になる（監査 S1）。
    if (items.length) cache.set(cacheKey, { at: Date.now(), items });
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
          if (data.length > 1_000_000) {
            // destroy() を引数なしで呼ぶと 'error' が発火せず Promise が永遠に
            // settle しない場合がある（'end' も来ない）。打ち切り時点のデータで
            // 即 resolve してからソケットを閉じる。
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
