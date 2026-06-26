// One-second splash on cold start. Decoration only — no localStorage,
// no network, no auth dependency. Just a brand moment then fades out.
//
// Mounted by <App> at the very top of the tree, above ProvidersChain results,
// so it appears even before Auth state resolves.

import { useEffect, useState } from 'react';
import { getRandomQuote } from '../lib/quotes';

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
  // Lazy initializer — runs exactly once on first render, never on module load.
  const [quote] = useState(() =>
    getRandomQuote(['reading', 'selfInvestment', 'wisdom', 'encouragement'])
  );

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
        background: '#EDE0CA',
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
    >
      <div
        className="leverage-splash-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          animation: 'leverage-splash-pop .55s cubic-bezier(0.2,0.9,0.3,1) both',
        }}
      >
        <img
          src="/logo-lockup.png"
          alt="Orime"
          width={208}
          height={193}
          loading="eager"
          fetchpriority="high"
          style={{ width: 208, height: 'auto', aspectRatio: '430 / 400', display: 'block' }}
        />
        <p style={{ fontSize: 13, color: 'var(--c-ink-2)', margin: '4px 0 0', letterSpacing: 1 }}>
          読みっぱなしを、やめる。
        </p>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(40px + env(safe-area-inset-bottom, 0px))',
          left: 20,
          right: 20,
          textAlign: 'center',
          color: 'var(--c-ink-2)',
          opacity: 0.85,
          animation: 'leverage-splash-pop .55s cubic-bezier(0.2,0.9,0.3,1) both',
          animationDelay: '.15s',
          fontFamily: "var(--font-app)",
        }}
      >
        <p style={{ fontSize: 13, lineHeight: 1.7, fontStyle: 'italic', margin: 0 }}>
          “{quote.text}”
        </p>
        <p style={{ fontSize: 11, opacity: 0.75, margin: '4px 0 0' }}>— {quote.author}</p>
      </div>
    </div>
  );
}
