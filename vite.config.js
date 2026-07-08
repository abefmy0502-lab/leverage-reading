import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

// 🔄 毎デプロイで dist/sw.js の SW_VERSION にビルド commit を焼き込むプラグイン。
// public/sw.js は静的コピーで define を通らないため、ビルド後に書き換える。
// これで「コード変更のみ（sw.js を手で bump しない）デプロイ」でも sw.js の
// バイト列が必ず変わり、ブラウザが新 SW を検出 → swUpdate.js の自動更新が走る。
function stampServiceWorkerVersion() {
  return {
    name: 'stamp-sw-version',
    apply: 'build',
    closeBundle() {
      try {
        const swPath = path.resolve('dist/sw.js');
        if (!fs.existsSync(swPath)) return;
        const src = fs.readFileSync(swPath, 'utf8');
        const stamped = src.replace(
          /const SW_VERSION = '([^']*)';/,
          (_m, base) => `const SW_VERSION = '${base}-${BUILD_COMMIT}';`,
        );
        if (stamped !== src) fs.writeFileSync(swPath, stamped);
      } catch {
        /* fail-open: スタンプ失敗でビルドは止めない */
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorkerVersion()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  build: {
    sourcemap: true,
    // 800KB 超の単一バンドルを「滅多に変わらない vendor」と「アプリ本体」に分割。
    // vendor はデプロイ間でハッシュが変わらず長期キャッシュが効くので、更新時の
    // 再ダウンロード量が激減し、初回も並列ロードで体感が速くなる。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // ZXing(バーコード)・Sentry・RevenueCat(IAP・native ガード内の遅延 import
          // のみ)・browser-image-compression(写真アップロード時のみ) は vendor に
          // 巻き込むと全員が初回に DL してしまうので、専用の動的チャンクに残す
          // （undefined を返す＝ Rollup の動的 import 境界どおりに分割させる）。
          if (id.includes('@zxing')) return undefined;
          if (id.includes('@sentry')) return undefined;
          if (id.includes('@revenuecat')) return undefined;
          if (id.includes('iceberg-js')) return undefined;
          if (id.includes('ts-custom-error')) return undefined;
          if (id.includes('browser-image-compression')) return undefined;
          if (/[\\/]react(-dom)?[\\/]|[\\/]scheduler[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
