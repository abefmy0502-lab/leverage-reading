// 🎨 ui.js — インライン style 用の「単一の真実」。
//
// 本田レビュー対応: 同じ暖色 hex（#3d362c / #5c5043 / #fffdf8 …）が 600+ 箇所に
// 直書きされ、btnPrimary / btnGhost / btnDanger が各ファイルで重複定義されていた
// 「個人開発感」を解消する。色は tokens.css の var(--c-*) を指す文字列なので、
// ここを single source として import すれば、値の変更が全画面へ波及する。
//
// 使い方:
//   import { C, btnPrimary, btnGhost, btnDanger } from '../styles/ui';
//   <p style={{ color: C.ink }}>...</p>
//   <button style={btnPrimary}>保存</button>
//   <button style={{ ...btnGhost, minHeight: 40 }}>小さめ</button>  // サイズはspreadで上書き

// 暖色ブランドパレット（tokens.css の var(--c-*) を参照）。
export const C = {
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
  gap: 6,
  minHeight: 48,
  padding: '13px 18px',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.01em',
  cursor: 'pointer',
  border: 'none',
  width: '100%',
};

// 主アクション（茶ベタ）。
export const btnPrimary = {
  ...btnBase,
  background: C.brand,
  color: C.brandInk,
  boxShadow: 'var(--shadow-1)',
};

// 副アクション（枠線ゴースト）。
export const btnGhost = {
  ...btnBase,
  background: 'transparent',
  color: C.brand,
  border: `1px solid ${C.hairlineStrong}`,
};

// 破壊的アクション（レンガ色ベタ）。
export const btnDanger = {
  ...btnPrimary,
  background: C.critical,
};

// 共通カード面。
export const card = {
  background: C.card,
  border: `1px solid ${C.hairline}`,
  borderRadius: 'var(--radius-md)',
  padding: '14px 16px',
};

// 共通入力欄（iOS ズーム回避で font-size 16px）。
export const input = {
  width: '100%',
  padding: '11px 12px',
  fontSize: 16,
  border: `1px solid ${C.hairlineStrong}`,
  borderRadius: 'var(--radius-sm)',
  background: '#fff',
  color: C.ink,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
