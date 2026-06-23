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
        zIndex: 9000,
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
          src="/icons/icon-512.png"
          alt="Orime"
          width={104}
          height={104}
          style={{
            width: 104,
            height: 104,
            borderRadius: 24,
            boxShadow: '0 8px 24px rgba(60,40,20,0.14)',
          }}
        />
        <h1
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: '#3d362c',
            margin: '14px 0 4px',
            letterSpacing: 2,
            fontFamily: "'Noto Serif JP', Georgia, serif",
          }}
        >
          Orime
        </h1>
        <p style={{ fontSize: 13, color: '#8a7e6b', margin: 0, letterSpacing: 1 }}>
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
          color: '#8a7e6b',
          opacity: 0.85,
          animation: 'leverage-splash-pop .55s cubic-bezier(0.2,0.9,0.3,1) both',
          animationDelay: '.15s',
          fontFamily: "'Noto Serif JP', Georgia, serif",
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
