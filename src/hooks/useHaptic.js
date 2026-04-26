// Haptic feedback shim. Wraps `navigator.vibrate` so callers don't worry about
// browser support — silent no-op on iOS Safari (vibrate is unsupported there in
// most cases) and Android Chrome / WebView fires the requested pattern.
//
// Patterns are short and snappy on purpose; long buzzes feel cheap.

import { useMemo } from 'react';

function safeVibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* swallow — haptics are non-critical */
  }
}

export function useHaptic() {
  return useMemo(
    () => ({
      light: () => safeVibrate(10),
      medium: () => safeVibrate(25),
      heavy: () => safeVibrate(40),
      success: () => safeVibrate([20, 50, 20]),
      warning: () => safeVibrate([30, 30, 30]),
      error: () => safeVibrate([50, 100, 50]),
    }),
    []
  );
}

export default useHaptic;
