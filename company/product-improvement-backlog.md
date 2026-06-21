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
| 3 | 空状態の `EmptyState` 統一（画像altは#13へ分離） | `App.jsx`/各 | ✅ Wave6（KnowledgeManager/AdvisorHistory を EmptyState 化）|
| 4 | エラーメッセージ humanize 強化（生Postgres/内部メッセージ漏れ防止） | `errors.js` | ✅ commit 32a409e |
| 13 | 画像alt具体化＋小型端末レスポンシブ（CoverFixModal 1カラム化） | `BookMemoCard`/`BookMemoEditor`/`CoverFixModal` | ✅ commit af6e8bf |
| 14 | （follow-up）client abort時のサーバー側Anthropicコール打ち切り（コスト） | `api/claude.js`/`streamClaude.js` | ✅ Wave6（req/res close→upstream abort、idempotent）|
| 5 | ローディング skeleton 一貫性（検索/AI/一覧） | `Skeleton.jsx`/各 | ✅ Wave8（BookGridSkeleton/BookListSkeleton + 本棚初回ロード配線、AddBookModal/MyBookBrain は既存skeleton）|
| 6 | 振り返り(Review)体験の磨き（想起カードの質・空状態・操作感） | `Review.jsx` | ✅ Wave4（想起フレーミング/コールドスタート/ハプティクス）|
| 7 | 設定/AccountSettings の情報整理（課金/データ/退会の導線） | `AccountSettings.jsx` | ✅ Wave5（3グループ見出し+退会最下部分離）|
| 8 | hex→デザイントークン 段階移行（主要画面から・ダークモード布石） | 各（大） | ⏸️ **決定: ダークモード再開時にまとめて実施（計画的負債）**。現状はダークモード一時停止中（CLAUDE.md）で、クリーム/ブラウンの統一パレットを今トークン化しても兄弟コンポーネントが hex のままで整合が崩れ、ユーザー価値ゼロ・リスクのみ。dark mode 再開とセットで着手する明示的な保留。新規コードは新トークンを使う運用は継続中 |
| 9 | 検索/本追加フローの磨き（候補表示・手動入力・エラー） | `AddBookModal.jsx` | ✅ Wave5（検索skeleton+0件/エラー手動導線+humanize）|
| 10 | 行動リストの磨き（期限色分け・完了演出・繰り返し） | `ActionList.jsx` | ✅ Wave5（期限色分け+完了haptic+空状態+stale help修正）|
| 11 | コード分割で初期バンドル削減（lazy/Suspense） | `App.jsx` | ✅ commit 0696344（879→722kB） |
| 12 | オンボーディング小型端末の高さ・想起の予感トースト（任意） | `Onboarding.jsx` | ✅ Wave6（dvh高さ収束+CTA常時表示+想起予感コピー）|

## 🚀 フラッグシップ機能
- ✅ **📊 テーマレポート**（第1フラッグシップ）— テーマ横断でメモを統合し1枚のレポート化。AIタブ3つ目のサブタブ。commit 9e7b747（build + コードレビュー済み）。元帥発案 → 実装。図解(Mermaid)はV2保留。

## ✅ バックログ状況: 着手可能な項目はすべて完了。#8 のみダークモード依存で明示保留（上記）。

## 🐛 全方位バグ精査（一巡 + 二次/三次レビュー）— 実バグ計10件修正
- 🔒 セキュリティ3: プッシュ送信APIの認証穴(x-vercel-cron偽装) `456588c` / CSV数式インジェクション `6b602f8` / 認証の生エラー漏洩 `64dbdf3`
- 💰 課金1: 通信エラーで課金済みユーザーをペイウォールに締め出す詰み `64dbdf3`
- 💸 コスト1: クライアント中断→upstream Anthropic打ち切り `07266ec`
- 🔔 プッシュ2: last_sent_at二重送信 `456588c` / endpointローテーション自己修復の未配線 `e4ca7ee`
- 🐛 機能3: OCR空応答の誤エラー `6b602f8` / unmountタイマー `81931c9` / 月境界TZ `d527767`
- ⚡ 三次レビュー(性能/メモリ): 危険リーク無し。本棚カードmemo化/stats useMemo/写真キャッシュ掃除 `bc68df9`。Review再fetchは観測後対応
- ✅ 表紙/検索/重複・メモCRUD・App中核は実バグなし（直近ハードニング確認）

## 完了済み（参考）
- ✅ UI/UXハードニング（44px/iOSズーム/セーフエリア/破壊操作） commit 85d07d2
- ✅ 実バグ修正（マイ読書脳警告/入力長/ConfirmDialog zIndex） 44854f5
- ✅ コールドスタート解消（オンボ行動型+空状態） feb8d29
- ✅ Web版Stripe収益化（ペイウォール+月額/年額）
