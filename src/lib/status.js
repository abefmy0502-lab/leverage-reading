// 📚 本のステータス（4 段階）の唯一の設定源。
// want(読みたい) → before(積読) → reading(読書中) → done(読了)。
// ラベル / 色 / アイコンをここに集約し、App.jsx・StatusBadge・フィルタタブが共有する。
// 純粋なデータ + 参照ルックアップのみ（JSX を持たない）ため lib に置く。

import { Bookmark, PenSquare, BookOpen, CheckCircle } from 'lucide-react';

export const STATUSES = [
  { key: "want", label: "読みたい", emoji: "🔖", Icon: Bookmark, bg: "#f0e8d8", color: "var(--status-want)" },
  { key: "before", label: "積読", emoji: "📐", Icon: PenSquare, bg: "#f0e0f0", color: "var(--status-before)" },
  { key: "reading", label: "読書中", emoji: "📖", Icon: BookOpen, bg: "#dde8f0", color: "var(--status-reading)" },
  { key: "done", label: "読了", emoji: "✅", Icon: CheckCircle, bg: "#e2ecd8", color: "var(--status-done)" },
];

// key からステータス設定を引く。未知の key は先頭（want）にフォールバック。
export const getSt = (k) => STATUSES.find((s) => s.key === k) || STATUSES[0];
