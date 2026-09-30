// One-second splash on cold start. Decoration only — no localStorage,
// no network, no auth dependency. Just a brand moment then fades out.
// Web だけ。iOS アプリは端末の起動画面（LaunchScreen）が同じ役目なので出さない
// （起動画面のあとにもう 1 秒アイコンを見せて待たせない・App.jsx の showSplash・2026-09-30）。
//
// Mounted by <App> at the very top of the tree, above ProvidersChain results,
// so it appears even before Auth state resolves.

import { useEffect, useState } from 'react';

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

export default function SplashScreen({ onDismiss, durationMs = 1000 }) {
  ensureKeyframes();
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), durationMs - 220);
    const dismissTimer = setTimeout(() => onDismiss?.(), durationMs);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss, durationMs]);

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
