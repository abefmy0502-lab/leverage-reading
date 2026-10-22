---
name: feature
description: 新しい機能・画面・決まりごとを作るときの型（一番の価値に照らす → 既存の部品を探す → 作る → お試しモードの入口 → 文書 → /ship）。「/feature」「〜を作って」「〜を足して」と言われた最初に使う。
---

# /feature — 作るときの型（2026-10-22・開発のレバレッジ）

Orime の 1 つの機能は「作る」だけでは終わらない。下の 7 段を順に。**段を飛ばすと、あとで ui-critic・テスト・オーナーの差し戻しで倍の時間がかかる**。

## 0. 一番の価値に照らす（1 分）
- 「読むほど、自分だけの相談相手が育つ」（CLAUDE.md）に効くか。主役＝相談・柱＝行動・手段＝思い出しカード。
- ゲーミフィケーション（%・バッジ・連続日数・順位・目標）は作らない。運営の画面だけ % 可。
- 言葉は GLOSSARY（相談・行動・積読・分野・フォルダ・トークン・7 日間無料 …）。

## 1. 既存を探す（新しく作る前に）
- 部品: `src/styles/ui.js`（`btnPrimary` `btnGhost` `btnLink` `btnLinkQuiet` `input` `card`）・`EmptyState` / `ErrorMessage` / `SectionHeader` / `StatCard` / `Skeleton` / `BottomSheet` / `ContextMenu`・`TightBubble` の `withPhraseBreaks`。
- 似た画面: `grep -rn "<似た言葉>" src/components SPEC.md DESIGN.md` で先例を読む。
- データ: 新しい列・表は `supabase_<名前>.sql`（冪等・RLS・schema-error fallback で未適用でも壊れない）。

## 2. 作る
- 色・文字・余白・角丸は `var(--…)` だけ（直書き禁止・余白 4/8/12/16/24/32・文字 12 以上・太さ 400/600/700）。
- 入力欄は `maxLength`・Enter は `isComposing`・AI は `purpose` と `ensureAiConsent`・`sanitizeForPrompt`。
- 純粋な計算は `src/lib/<名前>.js` に分けて `*.test.js` を書く（画面は薄く）。

## 3. お試しモードの入口
- `src/demo/` にサンプルと URL の印（`?demo=…`・`&<名前>=…`）を足し、`scripts/ui-shots.mjs` に画面名を足す（読み込み中・失敗・空も）。
- `CLAUDE.md`「お試しモード」の段落に 1 行。

## 4. 文書（同じコミットで）
- `SPEC.md`（画面の役割）・`DESIGN.md` §5（新しい部品・決まり）・`src/lib/helpContent.js`（ルール 1）・`src/lib/releaseNotes.js`（ルール 5）。

## 5. 撮って採点
- `npm run ui:shots -- after <画面名>` → `ui-critic` で 16/20 以上。

## 6. 出す
- `/ship`。

## 7. マーケへ渡す
- `releaseNotes.js` に `quiet` なしで書いた項目は、土曜の `/mkt-week` が自動で拾って投稿の下書きになる。**利用者がワクワクする言い方**で `what` / `after` を書くと、そのまま投稿の芯になる。
