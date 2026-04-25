# レバレッジ読書ログ - プロジェクトガイド

## プロジェクト概要

読書を「投資」として捉え、AI 連携で ROI 最大化を目指す読書管理 PWA。

- **フロント**: React 18 + Vite 6
- **バックエンド**: Supabase (PostgreSQL + Auth + Storage)
- **AI**: Anthropic Claude API（`api/claude.js` 経由のサーバーサイド中継）
- **ホスティング**: Vercel
- **主要機能**: 本管理、4 ステータス遷移、AI 選書アドバイザー、カード/まとめ 2 モードメモ、写真添付、PWA インストール

## ディレクトリ構造

```
.
├── api/claude.js                       # Vercel Serverless Function (Claude 中継 + RLS Auth)
├── public/                             # 静的アセット (manifest.json, icons/, sw.js)
├── scripts/generate-icons.js           # PWA アイコン生成 (`npm run icons`)
├── src/
│   ├── App.jsx                         # メインルーティング、状態管理、画面切替
│   ├── main.jsx                        # ProvidersChain (ErrorBoundary > Cache > Toast > Confirm > App)
│   ├── components/
│   │   ├── auth/                       # AuthScreen, AuthCallback
│   │   ├── BookMemoList.jsx            # メモ一覧 + カード/まとめタブ
│   │   ├── BookMemoCard.jsx            # 単一メモカード
│   │   ├── BookMemoEditor.jsx          # 全画面メモ編集
│   │   ├── QuickMemoSheet.jsx          # ボトムシート式クイックメモ
│   │   ├── Onboarding.jsx              # 初回ガイド
│   │   ├── Toast.jsx / ConfirmDialog.jsx / Spinner.jsx / Skeleton.jsx
│   │   ├── ErrorBoundary.jsx
│   │   └── HelpModal.jsx               # コンテキスト別ヘルプ表示
│   ├── hooks/
│   │   ├── useAuth.js                  # Supabase Auth セッション管理
│   │   ├── useBooks.js                 # books CRUD + snapshot/restore
│   │   └── useBookMemos.js             # book_memos CRUD + 写真アップロード
│   ├── lib/
│   │   ├── supabase.js                 # Supabase クライアント生成
│   │   ├── ai.js                       # callClaude (認証ヘッダー付与)
│   │   ├── errors.js                   # toMessage 共通エラー humanizer
│   │   └── helpContent.js              # ヘルプ文言マスター ★ コード変更時は同期必須
│   └── state/
│       └── AppDataCache.jsx            # メモ + 写真 URL の in-memory キャッシュ
└── CLAUDE.md                           # このファイル
```

## ステータスフロー

本のステータスは以下 4 段階で遷移する:

```
want(読みたい) → before(読書前) → reading(読書中) → done(読了)
```

- 各フェーズに対応する編集 UI: `WantPhase` / `BeforePhase` / `ReadingPhase` / `DonePhase`
- 詳細画面（`view === "detail"`）の表示は `current.status` で分岐
- メモセクションは `reading` / `done` のみ表示（`want` / `before` は理由を示すヒントのみ）

## メモシステム

| モード | 保存先 | 特性 |
|---|---|---|
| 📇 カード式 | `book_memos` テーブル | 1 メモ = 1 レコード。`page_number` / `photo_path` / `tags` 添付可 |
| 📝 まとめ式 | `books.leverage_memo` カラム | 1 冊 = 1 テキスト。本全体の総括用 |

両モードはタブで切替（`localStorage.leverageMemoMode` に永続化）。データは独立しており、片方の編集は他方に影響しない。

## ⚠️ コードを変更する時の必須ルール

### ルール 1: ヘルプコンテンツの同期

ユーザーから見える機能を追加・変更・削除した場合、**必ず `src/lib/helpContent.js` の該当箇所も更新する**こと。

更新が必要な変更の例:

- 新しい画面 / タブ / モードを追加した
- ボタンや UI 要素を追加・変更・削除した
- ステータス遷移のルールを変えた
- 入力欄の使い方を変えた
- ショートカットや便利機能を追加した

更新時の方針:

- 該当の `HELP_CONTENT[キー]` にある `sections` を追加・編集・削除
- 説明文はユーザー目線で書く（技術用語を避ける、結論ファースト）
- 絵文字を適度に使って視覚的にする
- `lastUpdated` を当日の日付に更新
- 変更内容をファイル先頭の更新履歴コメントにも追記

### ルール 2: changelog の記録

`src/lib/helpContent.js` のファイル先頭に、以下の形式で更新履歴コメントを追記:

```js
/**
 * Help Content for Leverage Reading App
 *
 * 更新履歴:
 * - 2026-04-26: 初版作成
 * - YYYY-MM-DD: ◯◯機能の追加に伴いセクション◯◯を更新
 */
```

最新の変更を**先頭に追記する**（時系列が直感的に追えるよう、新しいものが上）。

### ルール 3: 検証

コード変更後、以下を確認すること:

1. 変更した機能の説明が `helpContent.js` に正しく反映されているか
2. 該当するヘルプキーの内容が古くなっていないか
3. 新規画面を追加した場合、`helpContent.js` に新しいキーを追加したか
4. `npm run build` がエラーなく通るか

### ルール 4: コミットメッセージ

コミットメッセージにも変更内容を反映:

- 機能追加: `feat: ◯◯機能を追加 (helpContent も更新)`
- バグ修正: `fix: ◯◯を修正`
- ドキュメント: `docs: ヘルプコンテンツ更新`

## 既存の主要なヘルプキー

| キー | 対応画面 |
|---|---|
| `bookList` | 本棚画面 |
| `bookDetailWant` | 「読みたい」状態の本詳細 |
| `bookDetailBefore` | 「読書前」状態の本詳細 |
| `bookDetailReading` | 「読書中」状態の本詳細 |
| `bookDetailDone` | 「読了」状態の本詳細 |
| `aiAdvisor` | AI 選書アドバイザー |
| `memoEditor` | メモ入力画面（カード式 + クイックメモ + まとめ） |

新しい画面を追加した場合、上の表にも追記し、`HELP_CONTENT` にもキーを追加すること。

## 環境変数 (本番)

| 変数 | 用途 |
|---|---|
| `VITE_SUPABASE_URL` | クライアント用 Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | クライアント用 Supabase anon key |
| `SUPABASE_URL` | サーバー用 (`api/claude.js` の RLS auth) |
| `SUPABASE_ANON_KEY` | サーバー用 |
| `ANTHROPIC_API_KEY` | Claude API キー |

## デプロイフロー

1. ローカルで変更
2. `npm run build` でエラーチェック
3. `git add -A && git commit -m "..." && git push origin main`
4. Vercel が `main` ブランチを自動でデプロイ

## 開発時の注意

- **IME 変換中の Enter** は `e.nativeEvent.isComposing` で必ず保護する（誤送信防止）
- **iOS Safari ズーム対策**で `input` / `textarea` / `select` は `font-size: 16px 以上` を維持（共通スタイル `inp` / `ta` を使えば自動）
- **削除操作は楽観的 UI + Undo パターン**: 即 DB DELETE → スナップショットから 5 秒以内なら restore-on-undo（タイマーベースの遅延削除は禁止 — タブ閉じで取り戻せなくなる）
- **楽観的 UI の rollback** を必ず実装する（ステータス変更・更新系は失敗時に previous 値で setState）
- **セーフエリア対応**: ヘッダー / フローティング要素は `env(safe-area-inset-*)` で iPhone のノッチ・ホームインジケータに被らないよう配慮
- **キャッシュ整合性**: `useBookMemos` の mutation は `AppDataCache` の `subscribeMemos` 経由で全インスタンスへ自動反映。新規データソースを追加するときは同様の subscribe パターンを検討
- **写真は `book-memo-photos` private バケット**: 表示時は `useAppDataCache().fetchPhotoUrl(path)` で署名 URL（50 分キャッシュ）を取得。直接 `getPublicUrl` は使わない
