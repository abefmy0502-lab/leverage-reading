import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RELEASES } from './src/lib/releaseNotes.js';

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

// 🌐 index.html の共有用 URL（og:url / og:image）を本番のドメインに差し替える。
// 既定は https://orime.vercel.app。VITE_SITE_URL（例 https://orime.jp）を設定すると、それに差し替わる。
function siteUrlInHtml() {
  const site = (process.env.VITE_SITE_URL || '').replace(/\/+$/, '');
  return {
    name: 'site-url-in-html',
    transformIndexHtml(html) {
      return site ? html.replaceAll('https://orime.vercel.app', site) : html;
    },
  };
}

// 📱 iPhone の Safari で LP を開いた人に、画面上部の「App Store で入手」バナー（Smart App Banner）を出す。
// VITE_APP_STORE_URL（…/id1234567890）が入っているときだけ、その ID で <meta name="apple-itunes-app"> を足す。
function smartAppBanner() {
  const m = /id(\d{6,})/.exec(process.env.VITE_APP_STORE_URL || '');
  return {
    name: 'smart-app-banner',
    transformIndexHtml(html) {
      if (!m) return html;
      return html.replace('</head>', `  <meta name="apple-itunes-app" content="app-id=${m[1]}" />\n</head>`);
    },
  };
}

// 🆕 「新しくなったこと」（src/lib/releaseNotes.js）を /release-notes.json として書き出す（2026-10-05）。
// Web の「アプリの新しい版があります」は古いコードのまま動いているので、新しい版の中身はこの JSON を
// network-first で読んで見せる（lib/whatsNew.js の fetchUpcomingReleases）。開発中は同じ URL で今のファイルを返す。
function releaseNotesJson() {
  const payload = (releases) => JSON.stringify({ version: 1, releases });
  return {
    name: 'release-notes-json',
    configureServer(server) {
      server.middlewares.use('/release-notes.json', async (_req, res) => {
        try {
          const mod = await server.ssrLoadModule('/src/lib/releaseNotes.js');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(payload(mod.RELEASES));
        } catch {
          res.statusCode = 500;
          res.end('{}');
        }
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'release-notes.json', source: payload(RELEASES) });
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorkerVersion(), siteUrlInHtml(), smartAppBanner(), releaseNotesJson()],
  resolve: {
    alias: [
      // ⚡ Realtime は使っていないので、supabase-js が起動時に作る RealtimeClient を空の部品に替える
      // （realtime-js + phoenix ≈ 14KB gzip を全員の起動時から外す）。Realtime を使い始めるときはこの行を消す。
      { find: /^@supabase\/realtime-js$/, replacement: path.resolve('src/lib/realtimeStub.js') },
    ],
  },
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
          // three.js は LP ヒーローの 3D（Hero3D.jsx）専用。アプリ利用者に読ませない。
          if (/[\\/]three[\\/]/.test(id)) return undefined;
          if (/[\\/]react(-dom)?[\\/]|[\\/]scheduler[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          // Capacitor の土台（LP とアプリの両方が使う小さな共通部分）だけを vendor にまとめる。
          if (/[\\/]@capacitor[\\/](core|synapse)[\\/]/.test(id)) return 'vendor';
          // それ以外（lucide のアイコン・QR コード＝LP 専用・budoux＝アプリ専用・Capacitor の
          // 各プラグイン＝使うときに動的 import・@vercel/analytics＝LP 専用など）は、以前は
          // vendor / vendor-icons にまとめていたため、あとから読む画面の分まで LP でもアプリでも
          // 起動時に全部読まれていた（2026-09-29）。Rollup の import 境界どおりに、使う側の
          // チャンクへ置かせる（アイコンは 1 つずつ別モジュールなので、使う画面と一緒に届く）。
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
