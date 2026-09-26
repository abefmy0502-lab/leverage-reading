// 本のステータスを表示する小さなバッジ。DESIGN.md §3-2 によりステータスごとの色分けは
// やめ、ニュートラルな面＋アイコン＋文字で示す（色だけに頼らない・アクセント 1 色の原則）。
// App.jsx から切り出し。設定は src/lib/status.js の getSt を単一の真実として参照。

import { getSt } from '../lib/status';

export default function StatusBadge({ status }) {
  const s = getSt(status);
  const Icon = s.Icon;
  return (
    <span style={{ fontSize: "var(--text-caption)", padding: "4px 8px", borderRadius: "var(--radius)", background: "var(--fill)", color: "var(--text-2)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {Icon && <Icon size={12} strokeWidth={1.75} aria-hidden="true" />}
      {s.label}
    </span>
  );
}
