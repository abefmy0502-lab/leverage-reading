// 🌧 ErrorMessage — uniform error / warning surface.
//
// Goal: every error in the app speaks in the same warm voice — what
// happened, then what the user can do. Don't show stack traces, status
// codes, or internal IDs (lib/errors.js's toMessage already humanises
// most cases — this component is the visual envelope).
//
// Props:
//   icon         — 既定は出さない（null）。DESIGN §5: ErrorMessage は --error-soft の面＋題＋説明だけで、
//                  アイコンは付けない（2026-09-29）。どうしても要るときだけ線のアイコン（lucide）を渡す
//   title        — 「何が起きたか」short
//   description  — 1〜2 文の説明（「どうすればいいか」を含める）
//   hint         — optional 補足（小さく・寄り添い形）
//   actions      — [{ label, onClick, variant?, icon? }]
//   className    — 追加のクラス（例: error-message--fill＝置いた場所の高さいっぱいに広げ、中身を上下の真ん中に）
//                  variant: 'primary' | 'secondary'（どちらも枠の主ボタン）| 'ghost'（文字ボタン）(default secondary)

import { withPhraseBreaks } from './TightBubble';

// ボタンは 2 つの形だけ（2026-10-10 ui-critic「もう一度が画面ごとに塗り／枠で揺れていた」）:
//   主の操作（'primary' / 'secondary'）＝枠の 48/17（ui.js の btnGhost と同じ）。--error-soft の面の上に塗りの栗色を置かず、
//   どの画面のエラーでも「もう一度」などは同じ形に見せる。文字ボタン（'ghost'）＝控えめな 44/15。
const variantClass = {
  primary: 'btn btn-secondary',
  secondary: 'btn btn-secondary',
  ghost: 'btn btn-ghost btn-sm',
};

export default function ErrorMessage({
  icon = null,
  title,
  description,
  hint,
  actions = [],
  className = '',
}) {
  return (
    <div className={`error-message ${className}`.trim()} role="alert">
      {icon && <div className="error-message-icon" aria-hidden="true">{icon}</div>}
      {title && <p className="error-message-title">{typeof title === 'string' ? withPhraseBreaks(title) : title}</p>}
      {description && (
        <p className="error-message-description">
          {/* 文節の切れ目（BudouX の <wbr>）でだけ折り返す＋CSS の keep-all（2026-10-04 ui-critic）。
              以前の「句読点ごとの inline-block の塊」は、塊が 1 行に入らないと塊の中で変に割れていた（「もう」「一度探してください。」）。
              数字と助数詞などの U+00A0 はつないだまま（withPhraseBreaks が前後に切れ目を入れない）。 */}
          {typeof description === 'string' ? withPhraseBreaks(description) : description}
        </p>
      )}
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
