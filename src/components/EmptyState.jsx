// 🪶 EmptyState — the "nothing here yet" surface.
//
// Same shape across every empty screen so the user learns the rhythm
// (icon → title → description → actions → tip). Visual + copy live in
// styles/components.css's .empty-state* class set; this component is
// just composition.
//
// Props:
//   icon         — emoji or React node, big floating illustration
//   title        — short, warm headline (寄り添い形 — never imperative)
//   description  — 1〜3 行の説明
//   actions      — array of { label, onClick, variant?, icon? }
//                  variant: 'primary' (default) | 'secondary' | 'ghost'
//   tip          — optional ヒント line (rendered with accent-soft bg)
//   titleAs      — 見出しの要素（既定 'h2'。セクションの中に置くときは 'h3' など・2026-10-01）
//   role         — 既定 'status'（出たときに読み上げる）。null で読み上げない（トーストと重なるときなど）
//
// Note: nothing about this is animated by JS — the floating icon is a
// CSS keyframe and respects prefers-reduced-motion via the global rule.

const variantClass = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost',
};

export default function EmptyState({ icon, title, description, actions = [], tip, titleAs: TitleTag = 'h2', role = 'status' }) {
  return (
    <div className="empty-state" role={role || undefined}>
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      {title && <TitleTag className="empty-state-title">{title}</TitleTag>}
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {actions.length > 0 && (
        <div className="empty-state-actions">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={a.onClick}
              className={variantClass[a.variant || 'primary']}
              aria-label={a.ariaLabel || a.label}
            >
              {a.icon ? <span aria-hidden="true">{a.icon}</span> : null}
              {a.label}
            </button>
          ))}
        </div>
      )}
      {tip && <p className="empty-state-tip">{tip}</p>}
    </div>
  );
}
