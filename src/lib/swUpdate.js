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
// 初回訪問の再読込を防ぐ。
//   sw.js の activate は clients.claim() するので、初めて開いた（まだ SW が
//   ページを制御していない）ときも controllerchange が一度だけ飛ぶ。これで
//   reload すると、開いた直後の画面が一瞬消えて最初から描き直される。
//   → 登録前に「すでに制御されていたか」を覚え、制御されていなかった初回は
//     ユーザー（または自動更新）が更新を頼んだときだけ reload する。
let hadController = false;
let updateRequested = false;
// 🔄 自動更新。true なら新版検出時にユーザーのタップ無しで適用する。
//   - 起動時に待機版があれば即適用（アプリを開いた直後なので reload は安全）。
//   - 利用中に検出した場合は「次にアプリを離れた（バックグラウンド）時」に
//     静かに適用＝メモ入力 / AI 会話の最中に視界を奪わない。
let autoApplyEnabled = false;
let autoHiddenArmed = false;

// 書きかけ（フォーカス中のテキスト入力に中身がある）かどうか。
// バックグラウンド中の自動 reload は in-memory の下書きを消すため、
// 書きかけがある間は適用を見送る（次に hidden になった時に再判定）。
function hasUnsavedTyping() {
  try {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') {
      return typeof el.value === 'string' && el.value.trim().length > 0;
    }
    if (el.isContentEditable) return (el.textContent || '').trim().length > 0;
    return false;
  } catch {
    return false;
  }
}

// 利用中に出た更新を「バックグラウンドに入った時」に静かに適用する仕掛け。
function armAutoApplyOnHidden() {
  if (!autoApplyEnabled || autoHiddenArmed) return;
  autoHiddenArmed = true;
  const applyWhenHidden = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // メモ等の書きかけがあるなら今回は見送る（reload で下書きが消えるため）。
      // リスナは残るので、書きかけが無い次回の hidden で静かに適用される。
      if (hasUnsavedTyping()) return;
      // 不可視のうちに skipWaiting → controllerchange → reload（戻ると新版）。
      applyUpdate();
    }
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', applyWhenHidden);
    // 検出時点で既に隠れているなら即適用。
    if (document.visibilityState === 'hidden') applyWhenHidden();
  }
}

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
  updateRequested = true;
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
  updateRequested = true;
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

export function initServiceWorker({ onUpdateAvailable, autoApply = false } = {}) {
  if (initialized) return;
  initialized = true;
  autoApplyEnabled = !!autoApply;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // 登録する前に「もう SW に制御されていたか」を覚えておく。
  hadController = !!navigator.serviceWorker.controller;

  // 新 SW が controlling になった瞬間にリロード。
  // 1 タブで 1 回だけ走るよう refreshing フラグでガード。
  // 初回訪問（制御されていなかった）で更新も頼んでいないなら、clients.claim()
  // による controllerchange なので reload しない（開いた直後の画面を消さない）。
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController && !updateRequested) {
      hadController = true;
      return;
    }
    reloadOnce();
  });

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      registrationRef = reg;

      // 起動時点で既に waiting がいれば「直ちに更新可能」状態。
      // 自動更新 ON なら、アプリを開いた直後＝失うものが無いので即適用する
      // （一瞬の再読込で新版へ）。OFF ならバナーで通知して手動適用。
      if (reg.waiting && navigator.serviceWorker.controller) {
        if (autoApplyEnabled) applyUpdate();
        else onUpdateAvailable?.();
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
            // 自動更新 ON: 利用中なので即リロードはせず、次にバックグラウンドへ
            // 入った時に静かに適用する。あわせてバナーも出し「今すぐ」も選べる。
            if (autoApplyEnabled) armAutoApplyOnHidden();
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
