// 🎨 ui.js — インライン style 用の「単一の真実」。
//
// 本田レビュー対応: 同じ暖色 hex（var(--c-ink) / var(--c-brand) / var(--c-card) …）が 600+ 箇所に
// 直書きされ、btnPrimary / btnGhost / btnDanger が各ファイルで重複定義されていた
// 「個人開発感」を解消する。色は tokens.css の var(--c-*) を指す文字列なので、
// ここを single source として import すれば、値の変更が全画面へ波及する。
//
// 使い方:
//   import { C, btnPrimary, btnGhost, btnDanger } from '../styles/ui';
//   <p style={{ color: C.ink }}>...</p>
//   <button style={btnPrimary}>保存</button>
//   <button style={{ ...btnGhost, minHeight: 40 }}>小さめ</button>  // サイズはspreadで上書き

// 色（tokens.css を参照）。DESIGN.md のトークン名（text / accent / surface …）が正。
// 旧名（ink / brand / card …）は既存コード用の別名で、同じトークンを指す。
export const C = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  fill: 'var(--fill)',
  text: 'var(--text)',
  text2: 'var(--text-2)',
  text3: 'var(--text-3)',
  separator: 'var(--separator)',
  border: 'var(--border)',
  accent: 'var(--accent)',
  accentInk: 'var(--accent-ink)',
  accentSoft: 'var(--accent-soft)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  ink: 'var(--c-ink)',
  ink2: 'var(--c-ink-2)',
  ink3: 'var(--c-ink-3)',
  inkSoft: 'var(--c-ink-soft)',
  brand: 'var(--c-brand)',
  brandInk: 'var(--c-brand-ink)',
  card: 'var(--c-card)',
  hairline: 'var(--c-hairline)',
  hairlineStrong: 'var(--c-hairline-strong)',
  soft: 'var(--c-soft)',
  soft2: 'var(--c-soft-2)',
  positive: 'var(--c-positive)',
  positiveSoft: 'var(--c-positive-soft)',
  critical: 'var(--c-critical)',
  criticalSoft: 'var(--c-critical-soft)',
  criticalLine: 'var(--c-critical-line)',
  pageBg: 'var(--color-bg)',
};

// 全画面共通のボタン 3 種。サイズ違い（小さいゴースト等）は spread で上書きする。
// 角丸・余白・押し心地（:active の縮み）は index.css / components.css が拾うよう
// className も付与できるが、ここでは inline-style 利用箇所の統一を最優先する。

const btnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 48,
  padding: '12px 16px',
  borderRadius: 'var(--radius)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-body)', // DESIGN: ボタンは 17・600
  fontWeight: 600,
  letterSpacing: '0.01em',
  cursor: 'pointer',
  border: 'none',
  width: '100%',
};

// 主アクション（アクセント塗り）。DESIGN: 1 画面に 1 つだけ。
export const btnPrimary = {
  ...btnBase,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
};

// 副アクション（枠線ゴースト）。
export const btnGhost = {
  ...btnBase,
  background: 'transparent',
  // DESIGN §3-2: アクセントは主ボタン・リンク・選択中・入力中だけ。副ボタンの文字は本文色。
  color: 'var(--text)',
  border: '1px solid var(--border)', // 操作部品の枠は 3:1 以上
};

// 文字だけのボタン（リンク風）。
export const btnText = {
  ...btnBase,
  width: 'auto',
  background: 'transparent',
  color: 'var(--accent)',
  padding: '12px 4px',
};

// 破壊的アクション（レンガ色ベタ）。
export const btnDanger = {
  ...btnPrimary,
  background: 'var(--error)',
};

// 共通カード面。
// DESIGN: 影なし・枠線で区切る・角丸 12・内側 16。
export const card = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  padding: 16,
};

// 共通入力欄（iOS ズーム回避で font-size 16px）。
export const input = {
  width: '100%',
  minHeight: 48,
  padding: '12px',
  fontSize: 'max(16px, var(--text-body))', // iOS の入力ズーム防止に 16 以上
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
