// 🚨 重要: SW の挙動を変えたら必ずこの値を bump する。
// ブラウザは sw.js を byte-by-byte で diff するため、SW_VERSION を
// 変えるだけでも install → (waiting 状態で待機) → ユーザー操作で
// SKIP_WAITING → activate → 旧 cache 削除の流れになる。
const SW_VERSION = 'v36';
const STATIC_CACHE = `leverage-static-${SW_VERSION}`;
const RUNTIME_CACHE = `leverage-runtime-${SW_VERSION}`;
const ALLOWED_CACHES = [STATIC_CACHE, RUNTIME_CACHE];

// install 時に skipWaiting() を呼ばない。
// 旧版: install で即 skipWaiting → 即 activate して page reload 時に
// 新 SW が即座に効く → ユーザーがメモ書き / AI 会話の最中に reload を
// 強制されると入力が消える事故が発生していた。
// 新版: install 後は waiting 状態で待機し、UpdateBanner 経由で
// ユーザーが「今すぐ更新」を承諾した時のみ SKIP_WAITING メッセージを
// 受け取って activate する。
self.addEventListener('install', () => {
  // intentionally no skipWaiting()
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !ALLOWED_CACHES.includes(k)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf)$/i;

function isAsset(url) {
  return ASSET_RE.test(url.pathname);
}

function isDocOrCode(request) {
  const dest = request.destination;
  return dest === 'document' || dest === 'script' || dest === 'style' || dest === '';
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await networkPromise) || cached;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  } else if (isDocOrCode(request)) {
    event.respondWith(networkFirst(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  // 強制更新ボタンから飛んでくるリクエスト: 全 cache を削除してリロード
  // 待機中の SW があれば skipWaiting も併せて発火する。
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      })(),
    );
  }
});
