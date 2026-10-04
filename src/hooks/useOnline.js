// 📶 端末がつながっているか（navigator.onLine と online / offline の知らせ）。
//
// お試しモード（開発専用）は &offline=1 でつながっていない状態から始まる（撮影・確認用）。
// そのあと window に 'online' の知らせを出すと、つながった状態になる（「つながりました」の確認）。

import { useEffect, useState } from 'react';
import { isDemo } from '../lib/supabase';

function demoOffline() {
  if (!isDemo || typeof window === 'undefined') return false;
  try { return new URLSearchParams(window.location.search).get('offline') === '1'; } catch { return false; }
}

// 1 回目の判定（お試しの &offline=1 は、'online' の知らせが来るまで有効）。
let demoForcedOffline = demoOffline();
// お試しでは navigator.onLine も合わせる（lib/errors.js の「オフラインです。…」を本物の端末と同じに出す）。
if (demoForcedOffline && typeof navigator !== 'undefined') {
  try { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !demoForcedOffline }); } catch { /* ignore */ }
}

export function isOnlineNow() {
  if (demoForcedOffline) return false;
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}

export function useOnline() {
  const [online, setOnline] = useState(isOnlineNow);
  useEffect(() => {
    const on = () => { demoForcedOffline = false; setOnline(isOnlineNow()); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // 描くまでの間に変わっていたら合わせる
    setOnline(isOnlineNow());
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
