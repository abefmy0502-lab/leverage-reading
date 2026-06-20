// 📱 ネイティブ (Capacitor / iOS) 専用の初期化。
//
// Web (ブラウザ / PWA) では `Capacitor.isNativePlatform()` が false を返すため
// 何もせず即 return する。よって main.jsx から無条件に呼んでも Web 体験には
// 一切影響しない。プラグインは dynamic import で読み込むので、Web ビルドでは
// これらのコードはチャンク分割され「実際にネイティブで動いた時だけ」ロードされる
// (= Web バンドルが膨らまない)。
//
// 役割:
//   - StatusBar: 明るい背景 (#EDE0CA) に合わせて文字色を「濃いめ」に固定
//   - SplashScreen: React がマウントし切った後に手動で隠す (白フラッシュ回避)
//   - Keyboard: ネイティブのリサイズモードに統一 (BottomNav と入力欄の重なり対策)

import { Capacitor } from '@capacitor/core';

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  // StatusBar — 明るい背景なので Style.Light (= 濃い文字) を使う。
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });
  } catch {
    /* StatusBar 未対応プラットフォームでは無視 */
  }

  // Keyboard — ネイティブのリサイズに統一。
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    /* Keyboard 未対応プラットフォームでは無視 */
  }

  // SplashScreen — UI が出揃ってから隠す。
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {
    /* SplashScreen 未対応プラットフォームでは無視 */
  }
}

export default initNative;
