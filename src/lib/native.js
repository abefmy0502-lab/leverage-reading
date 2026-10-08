// 📱 ネイティブ (Capacitor / iOS) 専用の初期化。
//
// Web (ブラウザ / PWA) では `Capacitor.isNativePlatform()` が false を返すため
// 何もせず即 return する。よって main.jsx から無条件に呼んでも Web 体験には
// 一切影響しない。プラグインは dynamic import で読み込むので、Web ビルドでは
// これらのコードはチャンク分割され「実際にネイティブで動いた時だけ」ロードされる
// (= Web バンドルが膨らまない)。
//
// 役割:
//   - StatusBar: 端末のライト／ダークに合わせて文字色を自動で切り替える
//   - SplashScreen: React がマウントし切った後に手動で隠す (白フラッシュ回避)
//   - Keyboard: ネイティブのリサイズモードに統一 (BottomNav と入力欄の重なり対策)・入力補助のバーを消す・開閉を Web へ知らせる

import { Capacitor } from '@capacitor/core';

// ネイティブのキーボードが開いた／閉じたの知らせ（detail: { open, height }）。
export const NATIVE_KEYBOARD_EVENT = 'orime:native-keyboard';

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  // StatusBar — 端末のライト／ダークに自動で合わせる（Style.Default）。
  // 2026-09-26 に暗い画面を有効化。旧: 明るい背景に固定の Style.Light（濃い文字）。
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Default });
  } catch {
    /* StatusBar 未対応プラットフォームでは無視 */
  }

  // Keyboard — ネイティブのリサイズに統一。
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
    // iOS の入力補助のバー（∧ ∨ ✓）を消す（2026-10-08・オーナーの iPhone で入力欄とキーボードの間を占めていた）。
    // 閉じるのは、会話の何もないところを押す（相談）・シートの「キャンセル」「保存」で。
    try { await Keyboard.setAccessoryBarVisible({ isVisible: false }); } catch { /* Android などでは無い */ }
    // キーボードが本当に開いた／閉じたを Web 側へ知らせる（hooks/useKeyboardOpen.js が受ける）。
    // ネイティブのリサイズでは visualViewport と window の高さが一緒に縮むので、Web だけでは開いたと分からない。
    const tell = (open, height = 0) => {
      try { window.dispatchEvent(new CustomEvent(NATIVE_KEYBOARD_EVENT, { detail: { open, height } })); } catch { /* ignore */ }
    };
    await Keyboard.addListener('keyboardWillShow', (info) => tell(true, info?.keyboardHeight || 0));
    await Keyboard.addListener('keyboardWillHide', () => tell(false));
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
