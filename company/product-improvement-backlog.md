# 🔁 Orime プロダクト改善バックログ（継続改善ループ）

> CEO運用 2026-06-21〜。元帥指示「UI/UX/機能をより良く、継続的に」。env非依存・追加的・低リスクのみ着手。実ビルド検証はpush/CI解放後（B2/B3）。会社の真実は `company/board.md`。

## ✅ ビルド検証可能（2026-06-21判明）
この環境に vite あり → **`npm run build` が通る**ことを確認（54コミット全部・エラーゼロ・6.57s）。**今後は各波の後にビルド検証する**＝未検証蓄積リスク解消。残課題＝chunk 879kB（コード分割は #11 で）。

## 運用ルール
- 1波＝**ファイル非重複の2〜3タスク**を並列。CEOがレビュー→コミット→次波。
- 各タスク：追加的・低リスク・トークン準拠・思想（Apple Notes級）・誇大なし・helpContent同期・git/npm触らない。
- **shared file（helpContent.js / App.jsx）は1波で1エージェントのみ**が触る（競合回避）。
- 完了したら ✅、進行中は 🔄。

## バックログ（優先度・KGI/品質順）
| # | 改善 | 主ファイル | 状態 |
|---|---|---|---|
| 1 | ペイウォール価値プレビュー強化（想起/マイ読書脳の具体見本＝install→課金UP） | `Paywall.jsx` | ✅ commit 1a48f48 |
| 2 | マイ読書脳 ストリーミング中断（AbortController+中止ボタン）＋チャットa11y（role/aria-live） | `MyBookBrain.jsx`/`ai.js`/`streamClaude.js` | ✅ commit f1c86d7 |
| 3 | 空状態の `EmptyState` 統一（画像altは#13へ分離） | `App.jsx`/各 | 📋 |
| 4 | エラーメッセージ humanize 強化（生Postgres/内部メッセージ漏れ防止） | `errors.js` | ✅ commit 32a409e |
| 13 | 画像alt具体化＋小型端末レスポンシブ（CoverFixModal 1カラム化） | `BookMemoCard`/`BookMemoEditor`/`CoverFixModal` | ✅ commit af6e8bf |
| 14 | （follow-up）client abort時のサーバー側Anthropicコール打ち切り（コスト） | `api/claude.js`/`streamClaude.js` | 📋 |
| 5 | ローディング skeleton 一貫性（検索/AI/一覧） | `Skeleton.jsx`/各 | 📋 |
| 6 | 振り返り(Review)体験の磨き（想起カードの質・空状態・操作感） | `Review.jsx` | 📋 |
| 7 | 設定/AccountSettings の情報整理（課金/データ/退会の導線） | `AccountSettings.jsx` | 📋 |
| 8 | hex→デザイントークン 段階移行（主要画面から・ダークモード布石） | 各（大） | 📋（慎重） |
| 9 | 検索/本追加フローの磨き（候補表示・手動入力・エラー） | `AddBookModal.jsx` | 📋 |
| 10 | 行動リストの磨き（期限色分け・完了演出・繰り返し） | `ActionList.jsx` | 📋 |
| 11 | パフォーマンス点検（App.jsx 再レンダー・メモ化） | `App.jsx` | 📋（後・要検証環境） |
| 12 | オンボーディング小型端末の高さ・想起の予感トースト（任意） | `Onboarding.jsx` | 📋 |

## 完了済み（参考）
- ✅ UI/UXハードニング（44px/iOSズーム/セーフエリア/破壊操作） commit 85d07d2
- ✅ 実バグ修正（マイ読書脳警告/入力長/ConfirmDialog zIndex） 44854f5
- ✅ コールドスタート解消（オンボ行動型+空状態） feb8d29
- ✅ Web版Stripe収益化（ペイウォール+月額/年額）
