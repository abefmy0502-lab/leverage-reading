// 本のステータスを色付き pill で表示する小さなバッジ。
// App.jsx から切り出し。設定は src/lib/status.js の getSt を単一の真実として参照。

import { getSt } from '../lib/status';

export default function StatusBadge({ status }) {
  const s = getSt(status);
  const Icon = s.Icon;
  return (
    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.color, fontWeight: 600, letterSpacing: 0.3, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {Icon && <Icon size={12} strokeWidth={1.75} aria-hidden="true" />}
      {s.label}
    </span>
  );
}
