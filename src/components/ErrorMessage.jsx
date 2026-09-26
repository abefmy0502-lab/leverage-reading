// 🌧 ErrorMessage — uniform error / warning surface.
//
// Goal: every error in the app speaks in the same warm voice — what
// happened, then what the user can do. Don't show stack traces, status
// codes, or internal IDs (lib/errors.js's toMessage already humanises
// most cases — this component is the visual envelope).
//
// Props:
//   icon         — 線のアイコン（lucide）。既定は AlertCircle。null で出さない
//   title        — 「何が起きたか」short
//   description  — 1〜2 文の説明（「どうすればいいか」を含める）
//   hint         — optional 補足（小さく・寄り添い形）
//   actions      — [{ label, onClick, variant?, icon? }]
//                  variant: 'primary' | 'secondary' | 'ghost' (default secondary)

import { AlertCircle } from 'lucide-react';

const variantClass = {
  primary: 'btn btn-primary btn-sm',
  secondary: 'btn btn-secondary btn-sm',
  ghost: 'btn btn-ghost btn-sm',
};

export default function ErrorMessage({
  icon = <AlertCircle size={24} aria-hidden="true" />,
  title,
  description,
  hint,
  actions = [],
}) {
  return (
    <div className="error-message" role="alert">
      {icon && <div className="error-message-icon" aria-hidden="true">{icon}</div>}
      {title && <p className="error-message-title">{title}</p>}
      {description && <p className="error-message-description">{description}</p>}
      {actions.length > 0 && (
        <div className="error-message-actions">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              className={variantClass[a.variant || 'secondary']}
              aria-label={a.ariaLabel || a.label}
            >
              {a.icon ? <span aria-hidden="true">{a.icon}</span> : null}
              {a.label}
            </button>
          ))}
        </div>
      )}
      {hint && <p className="error-message-hint">{hint}</p>}
    </div>
  );
}
