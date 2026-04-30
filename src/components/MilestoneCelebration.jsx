// 🎉 MilestoneCelebration — modal that congratulates the user on
// hitting a reading- or streak-milestone. Same shell for both flavours;
// copy comes from lib/milestones.js. The 100-tier (both reading and
// streak) gets the "legendary" gradient + glow treatment.
//
// The caller wires this in by:
//   1. detecting `pendingMilestone` via useStreak / useBookMilestones
//   2. showing this modal once
//   3. on dismiss, calling markStreak/ReadingMilestoneCelebrated so it
//      doesn't fire again on next launch.

import { useEffect } from 'react';
import { fireConfetti } from '../lib/confetti';
import {
  READING_MILESTONE_COPY,
  STREAK_MILESTONE_COPY,
} from '../lib/milestones';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 950,
  background: 'rgba(30, 25, 20, 0.55)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4)',
  fontFamily: "'Noto Serif JP', Georgia, serif",
};

const cardStyle = {
  background: 'var(--color-bg-secondary)',
  borderRadius: 'var(--radius-xl)',
  width: 'min(420px, 100%)',
  maxHeight: 'min(85vh, 85dvh)',
  overflowY: 'auto',
  boxShadow: 'var(--shadow-5)',
};

const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-3) var(--space-6)',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-accent-strong)',
  color: 'var(--color-text-inverse)',
  fontFamily: 'inherit',
  fontSize: 'var(--type-callout)',
  fontWeight: 'var(--weight-semibold)',
  cursor: 'pointer',
  minHeight: 44,
};

export default function MilestoneCelebration({ kind, milestone, onClose }) {
  const copyBank = kind === 'streak' ? STREAK_MILESTONE_COPY : READING_MILESTONE_COPY;
  const copy = copyBank[milestone];
  const legendary = milestone >= 100;

  // Confetti once when the modal mounts. Legendary gets a second salvo
  // so it lingers a beat longer.
  useEffect(() => {
    try { fireConfetti(); } catch { /* non-critical */ }
    if (legendary) {
      const t = setTimeout(() => { try { fireConfetti(); } catch { /* ignore */ } }, 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [legendary]);

  if (!copy) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className={`celebration-modal ${legendary ? 'celebration-modal-legendary' : ''}`}>
          <div className="celebration-icon" aria-hidden="true">
            {legendary ? '👑' : kind === 'streak' ? '🔥' : '🎉'}
          </div>
          <h2 className="celebration-title">{copy.title}</h2>
          <p className="celebration-body">{copy.body}</p>
          <button type="button" onClick={onClose} style={btnPrimary} autoFocus>
            ありがとうございます
          </button>
        </div>
      </div>
    </div>
  );
}
