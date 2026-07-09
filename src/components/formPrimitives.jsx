// 🧩 本フォーム共通プリミティブ（App.jsx から抽出）。
//
// なぜ切り出すか（#9 App.jsx 分割の第一歩）:
//   App.jsx は約 6,800 行の巨大ファイルで、フォーム系の小さな共通部品
//   （入力スタイル / ボタン / Field / タグ入力 / 星評価 / セクション見出し）が
//   本文中に散在していた。これらは 4 つの Phase エディタ（BookPhases.jsx）と
//   App.jsx 本体の詳細画面の両方から使われる「共有の土台」なので、単一の
//   モジュールに集約して両者から import する（挙動は不変・識別子名も不変）。
//
// ⚠️ ここは表示専用のプリミティブのみ。ドメインロジック / 状態 / I/O は持たない。

import { useState, isValidElement, cloneElement } from 'react';
import { LIMITS } from '../lib/limits';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from '../styles/ui';

// ── 共通スタイル定数（iOS ズーム対策で input は 16px 維持） ──────────────
export const inp = { width: "100%", minWidth: 0, padding: "12px 14px", fontSize: 16, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", background: "var(--color-surface)", outline: "none", color: "var(--color-label)", fontFamily: "inherit", WebkitAppearance: "none", appearance: "none" };
export const ta = { ...inp, resize: "vertical", lineHeight: "var(--leading-relaxed)" };
export const btnS = { ...uiBtnPrimary, width: "auto", padding: "12px 0" };
export const btnO = { ...uiBtnGhost, width: "auto", padding: "12px 0", fontSize: 15 };
export const aiB = { width: "100%", padding: "10px 0", borderRadius: "var(--radius-sm)", border: "1px dashed #c4b8a6", background: "var(--color-accent-soft)", color: "#6b5d4f", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: "var(--weight-medium)" };
export const phaseDesc = { fontSize: 12, color: "var(--color-tertiary)", marginBottom: "var(--space-4)", lineHeight: "var(--leading-base)" };

// ── 星評価 ──────────────────────────────────────────────────────────
const STAR = "★";
const EMPTY_STAR = "☆";

export function Stars({ r, onChange, size = 18 }) {
  // 編集可能な場合は button 化してキーボード / スクリーンリーダーからも操作可能に。
  // 表示専用（onChange なし）は従来どおり装飾 span。
  if (!onChange) {
    return (
      <span aria-label={`評価 ${r || 0} / 5`} style={{ userSelect: "none" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} aria-hidden="true" style={{ fontSize: size, color: n <= r ? "#d4a040" : "#d0c8b8", marginRight: 2 }}>
            {n <= r ? STAR : EMPTY_STAR}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span role="radiogroup" aria-label="評価（星 1〜5）" style={{ userSelect: "none", display: "inline-flex" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={r === n}
          aria-label={`星 ${n}${r === n ? '（タップで解除）' : ''}`}
          onClick={() => onChange(r === n ? 0 : n)}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontSize: size, color: n <= r ? "#d4a040" : "#d0c8b8", marginRight: 2,
            // タップ領域は iOS HIG の 44px を下限に（グリフは fontSize のまま）。
            minWidth: Math.max(44, size + 8), minHeight: Math.max(44, size + 8),
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "inherit",
          }}
        >
          {n <= r ? STAR : EMPTY_STAR}
        </button>
      ))}
    </span>
  );
}

// ── ローディングドット ──────────────────────────────────────────────
export function Dots() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 4, padding: "12px 0" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#d4a040", animation: `pulse 1s infinite ${i * 0.2}s` }} />
      ))}
    </div>
  );
}

// ── ラベル付きフィールド ────────────────────────────────────────────
export function Field({ label, sub, children }) {
  // a11y: <label> は見た目のみで children(input/textarea) と関連付いていなかった。
  // 全呼び出し箇所に htmlFor/id を配るのは大がかりなので、単一子要素なら
  // aria-label をラベル文字列から注入してアクセシブルネームを与える
  // （既に aria-label / aria-labelledby がある子は尊重して上書きしない）。
  const labelled =
    isValidElement(children) && typeof label === 'string'
      && !children.props['aria-label'] && !children.props['aria-labelledby']
      ? cloneElement(children, { 'aria-label': label })
      : children;
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: "var(--c-ink-soft)", fontWeight: 500, display: "block", marginBottom: sub ? 2 : 5 }}>{label}</label>
      {sub && <p style={{ fontSize: 11, color: "var(--c-ink-2)", marginBottom: 5, lineHeight: 1.5 }}>{sub}</p>}
      {labelled}
    </div>
  );
}

// ── タグ入力（過去タグのサジェスト付き） ────────────────────────────
export function TagInput({ tags, onChange, allTags }) {
  const [input, setInput] = useState("");
  const add = (t) => { const tag = (t || input).trim(); if (tag && !tags.includes(tag)) onChange([...tags, tag]); setInput(""); };
  const suggestions = (allTags || []).filter((t) => !tags.includes(t));
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: tags.length ? 6 : 0 }}>
        {tags.map((t, i) => (
          <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--c-soft-2)", color: "var(--c-ink-2)", display: "flex", alignItems: "center", gap: 4 }}>
            {t}
            <button
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              aria-label={`「${t}」を削除`}
              style={{ background: "none", border: "none", fontSize: 12, color: "var(--c-ink-2)", cursor: "pointer", lineHeight: 1, minWidth: 28, minHeight: 28, margin: "-6px -8px -6px -2px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >×</button>
          </span>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: "var(--c-ink-3)", lineHeight: "22px" }}>過去のタグ:</span>
          {suggestions.map((t) => (
            <button key={t} onClick={() => add(t)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, border: "1px dashed var(--c-hairline-strong)", background: "transparent", color: "var(--c-ink-2)", cursor: "pointer", fontFamily: "inherit" }}>+ {t}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="タグを追加" style={{ ...inp, flex: 1 }} maxLength={LIMITS.tag} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        <button onClick={() => add()} style={{ ...btnO, padding: "6px 12px", fontSize: 12 }}>追加</button>
      </div>
    </div>
  );
}

// ── セクション見出し ────────────────────────────────────────────────
export function SectionHeader({ icon, title }) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 500, color: "var(--c-ink)", marginBottom: 12, marginTop: 24 }}>
      {icon} {title}
    </h3>
  );
}
