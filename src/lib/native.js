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

  // SplashScreen は、最初の画面を描いてから隠す（hideSplashWhenReady）。
}

// ⚡ 起動画面（端末の SplashScreen）を隠す時を決める（2026-11-20 オーナー「起動してから画面表示されるまでが遅い」）。
//   前は React が何も描かないうちに隠していたので、起動画面のあとに何も無い地（暗い設定では明るい地）が一瞬見えた。
//   最初の画面の用意ができた知らせ（lib/appReady）を待ち、描いた次のコマで隠す。来なくても 1 秒で隠す
//   （起動画面の間は押せないので長く待たせない・capacitor.config の launchShowDuration 1500 が最後の保険）。
export const SPLASH_MAX_WAIT_MS = 1000;
export function hideSplashWhenReady({ isReady, readyEvent, maxWaitMs = SPLASH_MAX_WAIT_MS } = {}) {
  if (!Capacitor.isNativePlatform() || typeof window === 'undefined') return;
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    window.removeEventListener(readyEvent, onReady);
    clearTimeout(timer);
    const raf = window.requestAnimationFrame || ((f) => setTimeout(f, 16));
    // 描いたものが画面に出てから（2 コマ待つ）
    raf(() => raf(async () => {
      try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide({ fadeOutDuration: 150 });
      } catch {
        /* SplashScreen 未対応プラットフォームでは無視 */
      }
    }));
  };
  const onReady = () => hide();
  const timer = setTimeout(hide, maxWaitMs);
  if (readyEvent) window.addEventListener(readyEvent, onReady, { once: true });
  if (isReady && isReady()) hide();
}

// iOS のキーボードの上の入力補助バー（∧ ∨ 完了）を出す／隠す（ネイティブのときだけ・Web では何もしない）。
// 1 行の入力欄で打っている間だけ隠して、画面を広く使う（写真で共有の言葉・2026-10-08）。失敗しても何もしない。
export async function setKeyboardAccessoryBar(visible) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.setAccessoryBarVisible({ isVisible: !!visible });
  } catch {
    /* 未対応の端末・プラグインが無いビルドでは無視 */
  }
}

export default initNative;
