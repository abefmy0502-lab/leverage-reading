// 🏷️ ビルド識別子（コミットSHA・ビルド日）。
// vite.config.js の `define` でビルド時に文字列リテラルへ差し替えられる。
// define が効かない文脈（単体テスト等）でも参照で落ちないよう typeof ガードで
// フォールバックする。用途: 配信中のビルドが新版か旧版かを画面上で即判定する。
export const BUILD_COMMIT =
  typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev';

export const BUILD_DATE =
  typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';

// 表示用の短い文字列（例: "rev 8bee2fd · 2026-06-22"）。
export const BUILD_LABEL = BUILD_DATE
  ? `rev ${BUILD_COMMIT} · ${BUILD_DATE}`
  : `rev ${BUILD_COMMIT}`;
