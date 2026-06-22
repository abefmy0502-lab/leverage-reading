// Haptic feedback shim.
//
// Web (ブラウザ / PWA): `navigator.vibrate` をラップする。iOS Safari では
// vibrate がほぼ未対応なので実質 no-op、Android Chrome / WebView では発火する。
//
// ネイティブ (Capacitor / iOS): `@capacitor/haptics` 経由で本物の Taptic
// Engine を叩く。これにより、Web PWA では効かなかった iPhone のハプティクスが
// ネイティブアプリ版では正しく振動する。
//
// パターンは短くキビキビと。長いブーッは安っぽいので避ける。

import { useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const isNative = Capacitor.isNativePlatform();

function webVibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* swallow — haptics are non-critical */
  }
}

// ネイティブなら Taptic Engine、Web なら vibrate フォールバック。
function impact(style, fallback) {
  if (isNative) {
    Haptics.impact({ style }).catch(() => {});
  } else {
    webVibrate(fallback);
  }
}

function notify(type, fallback) {
  if (isNative) {
    Haptics.notification({ type }).catch(() => {});
  } else {
    webVibrate(fallback);
  }
}

export function useHaptic() {
  return useMemo(
    () => ({
      light: () => impact(ImpactStyle.Light, 10),
      medium: () => impact(ImpactStyle.Medium, 25),
      heavy: () => impact(ImpactStyle.Heavy, 40),
      success: () => notify(NotificationType.Success, [20, 50, 20]),
      warning: () => notify(NotificationType.Warning, [30, 30, 30]),
      error: () => notify(NotificationType.Error, [50, 100, 50]),
    }),
    []
  );
}

export default useHaptic;
