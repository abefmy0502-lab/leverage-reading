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
  // ⚠️ TODO(2026-05-11): __APP_BUILD__ ラベルは PWA cache 診断用。
  // 1 週間後 (2026-05-11) に App.jsx の <BuildLabel> と一緒に削除する。
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  build: {
    sourcemap: true,
  },
});
