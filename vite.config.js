import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Sentry を有効にする際、ブラウザに送られるエラーのスタックトレースを
// 解読できるよう production sourcemap を出力する。Sentry の Releases /
// Source Maps 機能で sourcemap を upload する場合は、別途
// `@sentry/vite-plugin` を導入し SENTRY_AUTH_TOKEN / SENTRY_ORG /
// SENTRY_PROJECT を環境変数で渡すとより快適。最小構成として今回はファイル
// の出力のみ行う。

// 🏷️ ビルドした版を後から確実に特定するためのスタンプ。
// Vercel は VERCEL_GIT_COMMIT_SHA を自動で渡すのでそれを最優先し、
// ローカル等では git から取得、どちらも取れなければ 'dev' にフォールバック。
// これにより「配信されているのが新版か旧版か」を画面上で一目で判別できる
// （= デプロイ事故の早期発見）。失敗してもビルドは止めない（fail-open）。
function resolveBuildCommit() {
  const fromCI = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromCI) return fromCI.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const BUILD_COMMIT = resolveBuildCommit();
// 日付のみ（時刻まで出すとノイズなので YYYY-MM-DD に丸める）。
const BUILD_DATE = new Date().toISOString().slice(0, 10);

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  build: {
    sourcemap: true,
  },
});
