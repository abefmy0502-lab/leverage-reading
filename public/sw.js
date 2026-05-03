// 🚨 重要: SW の挙動を変えたら必ずこの値を bump する。
// ブラウザは sw.js を byte-by-byte で diff するため、SW_VERSION を
// 変えるだけでも install → skipWaiting → activate → 旧 cache 削除の
// 流れが走り、ユーザーは「アプリを削除→再追加」しなくても新版を取得できる。
const SW_VERSION = 'v30';
const STATIC_CACHE = `leverage-static-${SW_VERSION}`;
const RUNTIME_CACHE = `leverage-runtime-${SW_VERSION}`;
const ALLOWED_CACHES = [STATIC_CACHE, RUNTIME_CACHE];

self.addEventListener('install', () => {
  self.skipWaiting();
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
