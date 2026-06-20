import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Sentry を有効にする際、ブラウザに送られるエラーのスタックトレースを
// 解読できるよう production sourcemap を出力する。Sentry の Releases /
// Source Maps 機能で sourcemap を upload する場合は、別途
// `@sentry/vite-plugin` を導入し SENTRY_AUTH_TOKEN / SENTRY_ORG /
// SENTRY_PROJECT を環境変数で渡すとより快適。最小構成として今回はファイル
// の出力のみ行う。
export default defineConfig({
  plugins: [react()],
  build: {
    // ⚠️ 本番 sourcemap は公開ホスティング (Vercel) に .map が乗ると全ソースが
    // 誰でも取得できてしまうため false。Sentry でスタックを解読したい場合は
    // `@sentry/vite-plugin` を導入し `sourcemap: 'hidden'` + アップロード運用に
    // 切り替える (公開はせず Sentry にだけ map を渡す)。
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
