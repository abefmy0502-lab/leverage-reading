// 🎯 AnimatedNumber — counts up from the previous value to the new one.
//
// Used wherever a stat changes visibly (completion %, total read, streak,
// etc.). The animation is purely visual; the prop value is the source of
// truth, so screen readers / serialised state see the final number.
//
// Respects prefers-reduced-motion: no animation, just snap to the new
// value. Cancels any in-flight rAF when the value changes again.

import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export default function AnimatedNumber({
  value,
  duration = 1000,
  prefix = '',
  suffix = '',
  format,
  className,
  style,
}) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const [display, setDisplay] = useState(safeValue);
  const startValueRef = useRef(safeValue);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    // Reduced motion → snap.
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || duration <= 0) {
      setDisplay(safeValue);
      return undefined;
    }

    startValueRef.current = display;
    startTimeRef.current = performance.now();

    const tick = (now) => {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = startValueRef.current + (safeValue - startValueRef.current) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // We intentionally don't depend on `display` — start from the current
    // displayed value but only re-run when the target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeValue, duration]);

  const rounded = Math.round(display);
  const text = format ? format(rounded) : rounded;
  return (
    <span className={className} style={style}>
      {prefix}{text}{suffix}
    </span>
  );
}
