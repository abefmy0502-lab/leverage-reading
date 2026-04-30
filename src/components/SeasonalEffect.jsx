// 🌸 SeasonalEffect — gentle ambient particles floating across the screen.
//
// Spring → 桜 / Autumn → 紅葉 / Winter → 雪. Summer is quiet by design.
// Renders at most 14 emoji particles, each on its own `lvg-petal-fall`
// keyframe with randomised delay / duration so the field looks organic.
//
// Pointer-events: none. z-index sits behind nav but above content so it
// reads as ambient. Honours `prefers-reduced-motion` (handled globally
// in index.css → animations effectively pause), and the user can also
// disable via the season.js helper.

import { useMemo } from 'react';
import { getSeasonalEffect, isSeasonalEffectsDisabled } from '../lib/season';

const GLYPHS = {
  sakura: ['🌸', '🌸', '🌸', '🌷'],
  leaves: ['🍁', '🍂', '🍃'],
  snow:   ['❄️', '❄', '✦'],
};

const COUNT = 14;

function makeParticle(i, glyphs) {
  // Stable per-mount randomness — reseeded each component instance, but
  // not on every render thanks to useMemo.
  const left = Math.round(Math.random() * 95);
  const duration = 14 + Math.random() * 12; // 14–26s
  const delay = -Math.random() * duration;  // start mid-fall
  const size = 14 + Math.round(Math.random() * 14); // 14–28px
  const drift = (Math.random() * 80 - 40);  // -40px〜+40px
  const glyph = glyphs[i % glyphs.length];
  return { left, duration, delay, size, drift, glyph, key: i };
}

export default function SeasonalEffect({ kind: kindOverride }) {
  const kind = useMemo(() => {
    if (isSeasonalEffectsDisabled()) return null;
    return kindOverride || getSeasonalEffect();
  }, [kindOverride]);

  const particles = useMemo(() => {
    if (!kind) return [];
    const glyphs = GLYPHS[kind] || GLYPHS.sakura;
    return Array.from({ length: COUNT }, (_, i) => makeParticle(i, glyphs));
  }, [kind]);

  if (!kind) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 1, // above page bg, below content (content is z 10+)
      }}
    >
      {particles.map((p) => (
        <span
          key={p.key}
          style={{
            position: 'absolute',
            top: '-30px',
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            opacity: 0.7,
            // CSS variables consumed by the keyframe in index.css
            '--petal-duration': `${p.duration}s`,
            '--petal-delay': `${p.delay}s`,
            '--petal-drift': `${p.drift}px`,
            animation: 'lvg-petal-fall var(--petal-duration) linear var(--petal-delay) infinite',
            willChange: 'transform, opacity',
            filter: kind === 'snow' ? 'drop-shadow(0 0 2px rgba(180,200,255,0.4))' : 'none',
          }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}
