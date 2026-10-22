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
//   - `@sentry/react`（tracing 込みで gzip 100KB 超）は動的 import で読み込む。
//     静的 import だと DSN 未設定/dev でも SDK 一式が初期バンドル・初期パースの
//     対象になってしまう（初回表示速度への影響が最も大きいライブラリだった）。
//     動的 import の間だけ、その直後に投げられた例外を取りこぼす可能性はある
//     （初期化完了までの数十ms 程度）。エラー監視の完全性より初回表示速度を
//     優先する判断。

const DSN = import.meta.env.VITE_SENTRY_DSN;
// 送る文字から、メール・URL の識別子（?recall= / ?book= / ?checkout= / ?auth= と REST の eq.<uuid>）を落とす。
export function scrubText(s) {
  return (typeof s === 'string' ? s : '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/([?&](recall|book|checkout|auth)=)[^&\s]+/g, '$1[redacted]')
    .replace(/=eq\.[0-9a-f-]{20,}/gi, '=eq.[id]');
}
// このビルドで Sentry を使うか（プライバシーポリシーの委託先の行を出す・2026-10-11）。
export const SENTRY_ON = Boolean(DSN);

let started = false;
let SentryMod = null;
let initPromise = null;

export function initSentry() {
  if (initPromise) return initPromise;
  if (!DSN) return Promise.resolve(); // DSN なし → 起動しない
  // dev で誤送信しないよう production のみに限定。
  if (import.meta.env.MODE !== 'production') return Promise.resolve();

  initPromise = import('@sentry/react').then((Sentry) => {
    SentryMod = Sentry;
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
      // パンくず（fetch の URL＝Supabase REST の ?book_id=eq.<uuid> など）と、トランザクション名も同じ洗い方で（2026-10-22 監査）。
      beforeBreadcrumb(b) {
        try {
          if (b?.data?.url) b.data.url = scrubText(b.data.url);
          if (b?.message) b.message = scrubText(b.message);
        } catch { /* no-op */ }
        return b;
      },
      beforeSendTransaction(t) {
        try {
          if (t?.transaction) t.transaction = scrubText(t.transaction);
          if (t?.request?.url) t.request.url = scrubText(t.request.url);
        } catch { /* no-op */ }
        return t;
      },
      beforeSend(event) {
        try {
          const scrub = scrubText;
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
    started = true;
  }).catch(() => {
    /* チャンク取得失敗でもアプリ本体は止めない */
  });
  return initPromise;
}

export function captureError(error, info) {
  if (!started || !SentryMod) return;
  try {
    SentryMod.captureException(error, info ? { extra: info } : undefined);
  } catch {
    /* swallow — Sentry 側のエラーで本流を壊したくない */
  }
}
