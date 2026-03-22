# 📚 レバレッジ読書ログ

レバレッジ・リーディングの哲学に基づいた読書管理PWAアプリ。

## 🚀 Vercelデプロイ手順

### 1. 準備

- GitHubアカウント（無料）
- Vercelアカウント（無料）→ https://vercel.com
- Anthropic APIキー（AI機能を使う場合）→ https://console.anthropic.com

### 2. GitHubにリポジトリを作成

1. https://github.com/new にアクセス
2. リポジトリ名: `leverage-reading`
3. 「Create repository」をクリック
4. このフォルダの中身を全てアップロード（「Upload files」ボタン）

### 3. Vercelにデプロイ

1. https://vercel.com にログイン（GitHubアカウントで）
2. 「Add New Project」をクリック
3. GitHubの `leverage-reading` リポジトリを選択
4. 「Framework Preset」→ `Vite` を選択
5. 「Environment Variables」に以下を追加:
   - Key: `ANTHROPIC_API_KEY`
   - Value: あなたのAPIキー（sk-ant-...）
6. 「Deploy」をクリック

→ 数分でデプロイ完了。URLが発行されます（例: `leverage-reading.vercel.app`）

### 4. スマホのホーム画面に追加

**iPhone:**
1. Safariでデプロイ先URLを開く
2. 共有ボタン（□↑）をタップ
3. 「ホーム画面に追加」をタップ

**Android:**
1. Chromeでデプロイ先URLを開く
2. メニュー（⋮）→「ホーム画面に追加」

→ アプリアイコンからワンタップで起動できるようになります！

### 5. アイコンの設定（任意）

`public/` フォルダに以下を追加:
- `icon-192.png`（192x192px）
- `icon-512.png`（512x512px）

好きな画像で作成するか、https://www.pwa-asset-generator.dev/ で生成できます。

## 📁 ファイル構成

```
leverage-reading/
├── package.json          # 依存関係
├── vite.config.js        # Vite設定
├── vercel.json           # Vercel設定
├── index.html            # エントリHTML（PWA対応）
├── api/
│   └── claude.js         # Claude APIプロキシ（サーバレス関数）
├── public/
│   ├── manifest.json     # PWAマニフェスト
│   └── sw.js             # サービスワーカー
└── src/
    ├── main.jsx          # Reactエントリ
    └── App.jsx           # メインアプリ
```

## 💡 機能一覧

- 📷 バーコード/検索で本を登録
- 🔖📖✅ ステータス管理（読みたい→読書中→読了）
- 📐 AI投資設計（本の解析 + 読書戦略の自動生成）
- 💰 レバレッジメモ & 行動チェックリスト
- 💡 今日の学び（ランダム復習カード）
- 🔍 メモ横断検索 & タグフィルター
- 📂 テーマ別コレクション
- ✅ 行動実行率の可視化

## ⚠️ 注意

- AI機能（本の解析/読書戦略）を使うにはAnthropic APIキーが必要です
- APIキーなしでも、本の登録・メモ・行動管理は全て使えます
- データはブラウザのlocalStorageに保存されます（ブラウザのデータを消すとリセットされます）
