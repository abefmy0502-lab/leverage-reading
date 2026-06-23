// 🚨 重要: SW の挙動を変えたら必ずこの値を bump する。
// ブラウザは sw.js を byte-by-byte で diff するため、SW_VERSION を
// 変えるだけでも install → (waiting 状態で待機) → ユーザー操作で
// SKIP_WAITING → activate → 旧 cache 削除の流れになる。
const SW_VERSION = 'v54';
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

// ───────────────────────────────────────────────────────────────────
// 🔔 想起プッシュ通知（Web Push）ハンドラ
//
// ⚠️ 上の install / activate / fetch / message ロジックは一切変更していない。
//    ここはピュアに追記のみ。push 機能を使わない端末（鍵未設定・iOS タブ等）
//    でも、これらのリスナは「呼ばれないだけ」で既存の cache/offline 動作に
//    一切影響しない（push イベントは購読が無ければ発火しない）。
//
// 想定ペイロード（api/push-cron.js が web-push で送る JSON）:
//   { title, body, url, tag }
//   title 例: "💭 3ヶ月前のあなたのメモ"
//   body  例: メモ本文の冒頭 1〜2 行
//   url   例: "/?recall=<memoId>"（タップで該当メモへディープリンク）
// ───────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  // userVisibleOnly:true で購読しているため、push を受けたら必ず通知を出す。
  // 出さないとブラウザが「サイレント push」とみなし購読を失効させる。
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // JSON でなければテキストとして body に流用（堅牢性優先）。
    try { payload = { body: event.data ? event.data.text() : '' }; }
    catch { payload = {}; }
  }

  const title = (payload && payload.title) || 'Orime';
  const body = (payload && payload.body) || '過去のあなたのメモが戻ってきました。';
  const url = (payload && payload.url) || '/';
  const tag = (payload && payload.tag) || 'orime-recall';

  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag, // 同 tag は上書き = 通知の積み上げを防ぐ（静か・控えめ）
    data: { url },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => {
      // 失敗してもクラッシュさせない（古い端末でアイコン解決に失敗する等）。
    }),
  );
});

// 通知ペイロードの url を「同一オリジンの相対パス」に限定する多層防御。
// 配信には VAPID 秘密鍵が要る（外部注入不可）ため現状 exploit 不可だが、万一
// ペイロード経路が増えても open redirect / 外部ナビゲーションに化けないよう固める。
// 正の許可リスト: "/" 始まり・"//"（プロトコル相対）でない・URL 安全文字のみ。
function safeRecallPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  if (!/^\/[A-Za-z0-9/_?=&%.,~+-]*$/.test(raw)) return '/';
  return raw;
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = safeRecallPath(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      try {
        const allClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        // 既に開いている同一オリジンのウィンドウがあればフォーカス + 遷移。
        for (const client of allClients) {
          if ('focus' in client) {
            try {
              client.postMessage({ type: 'recall-navigate', url: target });
            } catch { /* postMessage 失敗は無視 */ }
            // ディープリンクのため URL も合わせて navigate を試みる。
            if ('navigate' in client) {
              try { await client.navigate(target); } catch { /* ignore */ }
            }
            return client.focus();
          }
        }
        // 開いているウィンドウが無ければ新規に開く。
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
      } catch {
        // 何があってもクラッシュさせない。
      }
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // プッシュサービスが endpoint をローテーションした時に発火。
  // 再 subscribe を試み、新 endpoint を待機中のクライアントへ通知する。
  // （クライアント側 src/lib/push.js が message を受けて Supabase を upsert する。
  //  ウィンドウが無い場合はサーバーへ直接登録できないので、次回起動時の
  //  ensurePushSubscription() で自己修復する設計。ここでは black hole を防ぐ。）
  event.waitUntil(
    (async () => {
      try {
        const applicationServerKey =
          event.oldSubscription && event.oldSubscription.options
            ? event.oldSubscription.options.applicationServerKey
            : null;
        if (!applicationServerKey || !self.registration.pushManager) return;
        const newSub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        const clientsArr = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clientsArr) {
          try {
            client.postMessage({
              type: 'pushsubscriptionchange',
              subscription: newSub ? newSub.toJSON() : null,
            });
          } catch { /* ignore */ }
        }
      } catch {
        // 再購読に失敗しても静かに諦める（次回起動で再登録される）。
      }
    })(),
  );
});
