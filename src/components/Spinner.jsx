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
  border: '3px solid #e0d8c8',
  borderTopColor: '#5c5043',
  animation: 'leverage-spin .9s linear infinite',
};

export default function Spinner({ message, hint }) {
  ensureKeyframes();
  return (
    <div style={wrap} role="status" aria-live="polite">
      <span style={ring} />
      {message && <p style={{ fontSize: 13, color: '#5c5548', margin: 0 }}>{message}</p>}
      {hint && <p style={{ fontSize: 11, color: '#a89e8c', margin: 0 }}>{hint}</p>}
    </div>
  );
}
