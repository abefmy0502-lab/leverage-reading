// Lightweight CSS-only confetti for "Done!" moments.
// No external library — drops ~30 absolutely-positioned emoji spans down the
// viewport on a falling animation, then removes the container.
//
// Respects prefers-reduced-motion: skips entirely so users with that setting
// don't get a surprise vestibular hit.

const KEYFRAME_ID = '__leverage-confetti-keyframes';
const EMOJIS = ['✨', '🎊', '🎉', '⭐', '💫', '🌟'];

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAME_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAME_ID;
  style.textContent = `
@keyframes leverage-confetti-fall {
  0%   { transform: translateY(-60px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
}
`;
  document.head.appendChild(style);
}

export function fireConfetti({ count = 30 } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  // Reduced-motion guard
  try {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) return;
  } catch {
    /* ignore */
  }

  ensureKeyframes();
  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:9500;overflow:hidden';
  document.body.appendChild(container);

  let maxLifeMs = 0;
  for (let i = 0; i < count; i += 1) {
    const span = document.createElement('span');
    span.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    const dur = 1.4 + Math.random() * 1.0; // 1.4–2.4s
    const delay = Math.random() * 0.4;     // 0–0.4s
    const left = Math.random() * 100;       // 0–100vw
    const size = 18 + Math.random() * 16;   // 18–34px
    span.style.cssText =
      `position:absolute;top:0;left:${left}vw;font-size:${size}px;` +
      `animation:leverage-confetti-fall ${dur}s linear ${delay}s forwards;` +
      `will-change:transform,opacity`;
    container.appendChild(span);
    maxLifeMs = Math.max(maxLifeMs, (dur + delay) * 1000);
  }

  setTimeout(() => {
    container.parentNode?.removeChild(container);
  }, maxLifeMs + 200);
}
