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

import { useState, useId, isValidElement, cloneElement } from 'react';
import { LIMITS } from '../lib/limits';
import { Plus, X } from 'lucide-react';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost, groupTitle as uiGroupTitle } from '../styles/ui';

// ── 共通スタイル定数（iOS ズーム対策で input は 16px 維持） ──────────────
export const inp = { width: "100%", minWidth: 0, minHeight: 48, padding: "var(--space-3)", fontSize: "max(16px, var(--text-body))", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)", outline: "none", color: "var(--text)", fontFamily: "inherit", WebkitAppearance: "none", appearance: "none" };
// 入力欄の角のつまみ（resize）は出さない（iOS の入力欄と同じ・角丸 12 を崩さない）。
// display:block で、インラインの下の余り（約 8）が入力欄の下に付かないようにする。
export const ta = { ...inp, display: "block", resize: "none", lineHeight: "var(--leading-relaxed)" };
export const btnS = { ...uiBtnPrimary, width: "auto", padding: "var(--space-3) 0" };
export const btnO = { ...uiBtnGhost, width: "auto", padding: "var(--space-3) 0" };
export const aiB = { width: "100%", minHeight: 48, padding: "var(--space-3) 0", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--accent-soft)", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: "var(--text-sub)", fontWeight: 600 };
export const phaseDesc = { fontSize: "var(--text-meta)", color: "var(--text-3)", marginBottom: "var(--space-4)", lineHeight: "var(--leading-base)" };

// ── 星評価 ──────────────────────────────────────────────────────────
const STAR = "★";
const EMPTY_STAR = "☆";

export function Stars({ r, onChange, size = 18 }) {
  // 編集可能な場合は button 化してキーボード / スクリーンリーダーからも操作可能に。
  // 表示専用（onChange なし）は従来どおり装飾 span。
  if (!onChange) {
    return (
      <span aria-label={`評価 ${r || 0} / 5`} style={{ userSelect: "none", display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} aria-hidden="true" style={{ fontSize: size, color: n <= r ? "var(--text-2)" : "var(--text-3)" }}>
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
            fontSize: size, color: n <= r ? "var(--text-2)" : "var(--text-3)",
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
    <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-1)", padding: "var(--space-3) 0" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)", animation: `pulse 1s infinite ${i * 0.2}s` }} />
      ))}
    </div>
  );
}

// ── ラベル付きフィールド ────────────────────────────────────────────
export function Field({ label, sub, children }) {
  // a11y: 単一の子（input / textarea）には id を付けて <label htmlFor> と結ぶ。
  // ラベルにアイコンが入っていても（文字列でなくても）読み上げの名前が付く（2026-09-27）。
  // 文字列ラベルは従来どおり aria-label も入れる（既にある aria-label / id は尊重）。
  const autoId = useId();
  const single = isValidElement(children) && typeof children.type === 'string';
  const childId = single ? (children.props.id || autoId) : undefined;
  let labelled = children;
  if (single) {
    const extra = {};
    if (!children.props.id) extra.id = childId;
    if (typeof label === 'string' && !children.props['aria-label'] && !children.props['aria-labelledby']) extra['aria-label'] = label;
    labelled = Object.keys(extra).length ? cloneElement(children, extra) : children;
  }
  return (
    <div style={{ marginBottom: "var(--space-6)" }}>
      {/* ラベルは DESIGN §5「小さな見出し」（ui.js groupTitle・12/600/--text-2）。 */}
      <label htmlFor={childId} style={{ ...uiGroupTitle, display: "block", marginBottom: sub ? "var(--space-1)" : "var(--space-2)" }}>{label}</label>
      {sub && <p style={{ fontSize: "var(--text-caption)", color: "var(--text-3)", marginBottom: "var(--space-2)", lineHeight: "var(--leading-base)" }}>{sub}</p>}
      {labelled}
    </div>
  );
}

// ── チップ（DESIGN §5: 見た目 32・押せる範囲 44） ─────────────────────
// App.jsx の ShelfChip と同じ形。選択中は --accent-soft 面＋--accent 文字、
// それ以外は --fill 面＋--text 文字（アクセントは選択中だけ）。
// stretch: 横一列を等分する選択肢（本の状態など）で使う。
const CHIP_HEIGHT = 32;
export function Chip({ active = false, stretch = false, onClick, children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      style={{
        display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44, padding: 0,
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
        flex: stretch ? "1 1 0" : "0 0 auto",
      }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)",
          height: CHIP_HEIGHT, padding: "0 var(--space-3)", width: stretch ? "100%" : "auto",
          borderRadius: "var(--radius)", fontSize: "var(--text-meta)", fontWeight: active ? 600 : 400, whiteSpace: "nowrap",
          background: active ? "var(--accent-soft)" : "var(--fill)",
          color: active ? "var(--accent)" : "var(--text)",
        }}
      >
        {children}
      </span>
    </button>
  );
}

// チップの並び。行間は 44 の押せる範囲が作るので、横の間隔だけ付ける。
const chipRow = { display: "flex", flexWrap: "wrap", columnGap: "var(--space-2)", marginBottom: "var(--space-1)" };

// ── タグ入力（過去タグのサジェスト付き） ────────────────────────────
// 付けたもの＝選択中のチップ（タップで外す）、候補＝＋付きのチップ（タップで付ける）。
// placeholder はフォルダ欄でも使うので呼び出し側から変えられる。
export function TagInput({ tags, onChange, allTags, placeholder = "タグを追加", "aria-label": ariaLabel }) {
  const [input, setInput] = useState("");
  const add = (t) => { const tag = (t || input).trim(); if (tag && !tags.includes(tag)) onChange([...tags, tag]); setInput(""); };
  const suggestions = (allTags || []).filter((t) => !tags.includes(t));
  return (
    <div>
      {tags.length > 0 && (
        <div style={chipRow}>
          {tags.map((t, i) => (
            <Chip key={t} active onClick={() => onChange(tags.filter((_, j) => j !== i))} aria-label={`「${t}」を削除`}>
              {t}
              <X size={14} aria-hidden="true" />
            </Chip>
          ))}
        </div>
      )}
      {suggestions.length > 0 && (
        <div style={chipRow}>
          {suggestions.map((t) => (
            <Chip key={t} onClick={() => add(t)} aria-label={`「${t}」を追加`}>
              <Plus size={14} aria-hidden="true" />
              {t}
            </Chip>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} aria-label={ariaLabel || placeholder} style={{ ...inp, flex: 1 }} maxLength={LIMITS.tag} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        <button type="button" onClick={() => add()} style={{ ...uiBtnGhost, width: "auto", flexShrink: 0, padding: "0 var(--space-4)" }}>追加</button>
      </div>
    </div>
  );
}

// ── セクション見出し ────────────────────────────────────────────────
export function SectionHeader({ icon, title }) {
  return (
    <h3 style={{ fontSize: "var(--text-body)", fontWeight: 600, color: "var(--text)", marginBottom: "var(--space-3)", marginTop: "var(--space-6)" }}>
      {icon} {title}
    </h3>
  );
}
