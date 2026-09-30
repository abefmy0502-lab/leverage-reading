// Splash on cold start. Decoration only — no localStorage,
// no network, no auth dependency. Just a brand moment then fades out.
// 出しておくのは最短 400ms。最初の画面の用意ができたら（lib/appReady の知らせ）すぐ消える。
// 用意が遅くても 1 秒で消す（それより長く飾りで待たせない・2026-09-30）。
// Web だけ。iOS アプリは端末の起動画面（LaunchScreen）が同じ役目なので出さない
// （起動画面のあとにもう 1 秒アイコンを見せて待たせない・App.jsx の showSplash・2026-09-30）。
//
// Mounted by <App> at the very top of the tree, above ProvidersChain results,
// so it appears even before Auth state resolves.

import { useEffect, useRef, useState } from 'react';
import { APP_READY_EVENT, isAppReady } from '../lib/appReady';

const KEYFRAMES_ID = '__leverage-splash-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const s = document.createElement('style');
  s.id = KEYFRAMES_ID;
  s.textContent = `
@keyframes leverage-splash-pop {
  0%   { opacity: 0; transform: scale(0.92); }
  35%  { opacity: 1; transform: scale(1.02); }
  60%  { opacity: 1; transform: scale(1.0); }
  100% { opacity: 1; transform: scale(1.0); }
}
@keyframes leverage-splash-out {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .leverage-splash-content { animation: none !important; }
}
`;
  document.head.appendChild(s);
}

const FADE_MS = 220;

export default function SplashScreen({ onDismiss, minMs = 400, maxMs = 1000 }) {
  ensureKeyframes();
  const [fading, setFading] = useState(false);
  // 親が描き直すたびに onDismiss が新しくなっても、時間を数え直さない（数え直すと消えるのが遅れていた）。
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const start = Date.now();
    const timers = [];
    let leaving = false;
    // 消え始める（薄れて FADE_MS 後に外す）。
    const leave = () => {
      if (leaving) return;
      leaving = true;
      setFading(true);
      timers.push(setTimeout(() => dismissRef.current?.(), FADE_MS));
    };
    // 用意ができた: 最短の時間が過ぎていればすぐ、まだなら過ぎたときに。
    const onReady = () => {
      const wait = Math.max(0, minMs - (Date.now() - start));
      if (wait === 0) leave(); else timers.push(setTimeout(leave, wait));
    };
    if (isAppReady()) onReady();
    else window.addEventListener(APP_READY_EVENT, onReady, { once: true });
    // 用意が遅いときも、ここで消し始める（1 秒で外れる）。
    timers.push(setTimeout(leave, Math.max(minMs, maxMs - FADE_MS)));
    return () => {
      window.removeEventListener(APP_READY_EVENT, onReady);
      timers.forEach(clearTimeout);
    };
  }, [minMs, maxMs]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-splash)',
        // 背景は画面の背景と同じ（明るい画面・暗い画面の両方で継ぎ目なく本体へ）。
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        animation: fading ? 'leverage-splash-out .22s ease forwards' : undefined,
        pointerEvents: fading ? 'none' : 'auto',
      }}
      role="presentation"
      aria-hidden="true"
      // 撮影スクリプト（scripts/ui-shots.mjs）が消えるのを待つための印
      data-splash=""
    >
      {/* アイコンと名前だけ（飾りの名言・旧タグラインは撤去・DESIGN §0）。 */}
      <div
        className="leverage-splash-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
          animation: 'leverage-splash-pop .55s cubic-bezier(0.2,0.9,0.3,1) both',
        }}
      >
        <img
          src="/icons/icon-192.png"
          alt=""
          width={72}
          height={72}
          loading="eager"
          fetchpriority="high"
          // ログイン画面のアイコンと同じ大きさ・形（--app-icon-size / --radius-app-icon・DESIGN §4）
          style={{ width: 'var(--app-icon-size)', height: 'var(--app-icon-size)', borderRadius: 'var(--radius-app-icon)', display: 'block' }}
        />
        <p style={{ fontSize: 'var(--text-title)', fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '0.02em' }}>
          Orime
        </p>
      </div>
    </div>
  );
}
