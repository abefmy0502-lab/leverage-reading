// Reusable spinner + message blocks. Pure CSS animation via existing keyframes
// in index.html / inline (`pulse` is already defined for Dots, but a circular
// spinner is also handy for longer operations).

const spinnerKeyframesId = '__leverage-spinner-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(spinnerKeyframesId)) return;
  const style = document.createElement('style');
  style.id = spinnerKeyframesId;
  style.textContent = `
@keyframes leverage-spin { to { transform: rotate(360deg); } }
`;
  document.head.appendChild(style);
}

const wrap = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: 18,
};

const ring = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  // Tone matched to the skeleton shimmer: track = secondary bg, head = accent.
  border: '3px solid var(--color-separator)',
  borderTopColor: 'var(--color-accent)',
  animation: 'leverage-spin .9s linear infinite',
};

export default function Spinner({ message, hint }) {
  ensureKeyframes();
  return (
    <div style={wrap} role="status" aria-live="polite">
      <span style={ring} />
      {message && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: 0 }}>{message}</p>}
      {hint && <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: 0 }}>{hint}</p>}
    </div>
  );
}
