// 🛰 Sentry — error monitoring + light tracing.
//
// 設計方針:
//   - DSN が未設定のローカル開発では完全 no-op。Sentry を勝手に有効化しない。
//   - production ビルドでだけ送信する。dev / preview の `import.meta.env.MODE`
//     による分岐 + DSN の有無の二重ガード。
//   - Replay は今回入れない。バンドルサイズが大きくなる + プライバシー扱いが
//     繊細。エラー基本機能だけでまず運用を回す。
//   - SDK が初期化されていない時に `Sentry.captureException()` を呼んでも
//     no-op なので、呼び出し側で初期化チェックを書かなくて良い。

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN;

let started = false;

export function initSentry() {
  if (started) return;
  if (!DSN) return; // DSN なし → 起動しない
  // dev で誤送信しないよう production のみに限定。
  if (import.meta.env.MODE !== 'production') return;
  started = true;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // 軽めに 10% サンプリング。負荷が問題になったらさらに下げる。
    tracesSampleRate: 0.1,
    // PII を Sentry に送らない（プライバシー最優先）。IP/Cookie 等の自動付与を無効化。
    sendDefaultPii: false,
    // 送信直前のスクラブ。将来 captureException(任意エラー) が増えても、メッセージ・
    // breadcrumb・リクエストURL に紛れ込んだメールや ?recall=<id> 等の識別子を落とす。
    beforeSend(event) {
      try {
        const scrub = (s) =>
          (typeof s === 'string' ? s : '')
            .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
            .replace(/([?&](recall|book|checkout|auth)=)[^&\s]+/g, '$1[redacted]');
        if (event.message) event.message = scrub(event.message);
        if (event.request?.url) event.request.url = scrub(event.request.url);
        if (Array.isArray(event.exception?.values)) {
          event.exception.values.forEach((v) => { if (v?.value) v.value = scrub(v.value); });
        }
        // 自由記述の extra は構造的に PII が入りうるので丸ごと落とす。
        if (event.extra) delete event.extra;
      } catch { /* スクラブ失敗で送信を止めない */ }
      return event;
    },
    // ビルドハッシュは Vite が _app__ のような露出をしないので、コミット
    // SHA を環境変数経由で渡す運用にしたい時はここで release: ... を埋める。
    // 例: release: import.meta.env.VITE_SENTRY_RELEASE
  });
}

export function captureError(error, info) {
  if (!started) return;
  try {
    Sentry.captureException(error, info ? { extra: info } : undefined);
  } catch {
    /* swallow — Sentry 側のエラーで本流を壊したくない */
  }
}
