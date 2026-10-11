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

// 🔔 数回の振動（集中モードのタイマーが終わったとき・2026-10-11 オーナー裁定「数回震わせる」）。
//   音は出さない。iOS は本物の振動（Haptics.vibrate＝強さ最大の連続振動）を間をあけて count 回、
//   Web は vibrate のパターン（鳴る・止まるの組）。動きを減らす設定でも振動はする（画面の動きではないため）。
//   2026-10-11 オーナー「タイマーが終わっても振動しない」: 通知の触覚（Success）は軽く 2 回叩くだけで、
//   机の上やポケットでは気づかない → 0.4 秒の振動 × 3 に。振動が使えない端末だけ通知の触覚に戻す。
export const ALARM_VIBRATE_PATTERN = [400, 300, 400, 300, 400];
export const ALARM_BUZZ_MS = 400;
export const ALARM_GAP_MS = 900;
function alarm(count = 3) {
  if (isNative) {
    for (let i = 0; i < count; i += 1) {
      setTimeout(() => {
        Haptics.vibrate({ duration: ALARM_BUZZ_MS })
          .catch(() => Haptics.notification({ type: NotificationType.Warning }).catch(() => {}));
      }, i * ALARM_GAP_MS);
    }
  } else {
    webVibrate(ALARM_VIBRATE_PATTERN);
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
      alarm: (count) => alarm(count),
    }),
    []
  );
}

export default useHaptic;
