// 🔄 Service Worker update manager.
//
// なぜ必要か:
//   - public/sw.js は skipWaiting + clients.claim まで仕込んであるので
//     新版が install されれば即座に有効化される。
//   - 一方、ユーザーがアプリを開きっぱなしにしている時は、ブラウザが
//     SW の更新チェックを頻繁にはしない。明示的に registration.update()
//     を叩いて「新版あるよ」を引き出す必要がある。
//   - 新版検出時、暗黙でリロードすると入力中のテキストが消えるため、
//     必ずトーストで合意を取ってから applyUpdate() で reload する。
//
// パブリック API:
//   initServiceWorker({ onUpdateAvailable })
//     → アプリ起動時に 1 回だけ呼ぶ。新版検出時に onUpdateAvailable を発火。
//   applyUpdate()
//     → 待機中 SW に SKIP_WAITING メッセージ → controllerchange でリロード。
//   forceUpdate()
//     → 設定の「アプリを最新版に更新」用。register.update() + cache 全消し。
//   getSwManager()
//     → 他コンポーネントから applyUpdate / forceUpdate を呼ぶためのアクセサ。

let registrationRef = null;
let refreshing = false;
let initialized = false;

function reloadOnce() {
  if (refreshing) return;
  refreshing = true;
  // controllerchange 直後に reload すると、新 SW が configure 中で
  // index.html を返せないことがあるため少し待つ。
  setTimeout(() => {
    try { window.location.reload(); }
    catch { /* ignore */ }
  }, 50);
}

export function getSwManager() {
  return {
    applyUpdate,
    forceUpdate,
  };
}

// 🔔 想起プッシュ通知用: 登録済み ServiceWorkerRegistration を返す。
// initServiceWorker() がまだ走っていない / SW 非対応なら、その場で
// 既存登録を取りに行ってフォールバックする。push.js から購読時に使う。
export async function getServiceWorkerRegistration() {
  if (registrationRef) return registrationRef;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration('/sw.js')) ||
      (await navigator.serviceWorker.ready);
    if (reg) registrationRef = reg;
    return reg || null;
  } catch {
    return null;
  }
}

export function applyUpdate() {
  const reg = registrationRef;
  if (!reg) {
    // SW が登録されてない場合（dev モード等）は素直にリロードのみ。
    reloadOnce();
    return;
  }
  if (reg.waiting) {
    // 待機中 SW に skipWaiting を投げる → activate → controllerchange で reload。
    reg.waiting.postMessage('SKIP_WAITING');
    return;
  }
  // waiting が無いなら新版を取りに行ってからもう 1 回試す。
  reg.update().then(() => {
    if (reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
    } else {
      reloadOnce();
    }
  }).catch(() => reloadOnce());
}

export async function forceUpdate() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    reloadOnce();
    return;
  }
  try {
    const reg = registrationRef || (await navigator.serviceWorker.getRegistration('/sw.js'));
    if (reg) {
      await reg.update().catch(() => {});
      // 全 cache を消去してから reload。SW が controlling でなくても効く。
      try {
        if (reg.active) reg.active.postMessage('CLEAR_CACHES');
      } catch { /* ignore */ }
      if (reg.waiting) {
        reg.waiting.postMessage('SKIP_WAITING');
        return; // controllerchange ハンドラで reload
      }
    }
    // それでも何も起きなかったら、ページキャッシュを bypass して reload。
    reloadOnce();
  } catch {
    reloadOnce();
  }
}

export function initServiceWorker({ onUpdateAvailable } = {}) {
  if (initialized) return;
  initialized = true;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // 新 SW が controlling になった瞬間にリロード。
  // 1 タブで 1 回だけ走るよう refreshing フラグでガード。
  navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      registrationRef = reg;

      // 起動時点で既に waiting がいれば「直ちに更新可能」状態。
      // 通知して、ユーザーが許可したら applyUpdate() を呼ぶ。
      if (reg.waiting && navigator.serviceWorker.controller) {
        onUpdateAvailable?.();
      }

      // 起動時に明示的に update() を叩く。register() 自体も新版の有無
      // を確認するが、ブラウザによっては 24h cache を尊重して fetch を
      // skip することがある。明示呼び出しで確実に問い合わせる。
      reg.update().catch(() => {});

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // installed + 既に controller がある = 「更新版がスタンバイした」。
          // controller が無い場合は初回インストールなのでサイレントに通す。
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            onUpdateAvailable?.();
          }
        });
      });

      // タブ復帰時に明示的に update() を叩く。ブラウザは SW を頻繁に
      // 再フェッチしないので、ここで定期チェックの代わりにする。
      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
    })
    .catch(() => {});
}
