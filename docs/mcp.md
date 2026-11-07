# 🔌 AI と連携（MCP）— Orime を Claude・ChatGPT から呼ぶ（2026-11-07）

オーナー「アプリと AI が繋がるようにしたい」。Orime を MCP（Model Context Protocol）のサーバーにして、利用者が
**いつもの AI（Claude・ChatGPT・Claude Code・Cursor など）から自分の本・メモ・行動を読み書きできる**ようにした。
Orime の中の相談（Haiku）とは別の道で、**Orime のトークンは使わない**（AI 側の会話の中で、AI が Orime を材料として読む）。

## 1. 利用者から見た流れ
1. 設定 →「AI と連携」→「Claude・ChatGPT とつなぐ」→ 名前（例：Claude）を入れて **「接続キーを作る」**
2. その場だけ出る **接続 URL**（`https://orime.vercel.app/mcp/orime_mcp_…`）を「URL をコピー」
3. つなぎ方の切り替え（Claude／ChatGPT／Claude Code）に沿って AI に登録
   - Claude: 設定の「コネクタ」→「カスタムコネクタを追加」→ 名前 Orime・URL を貼る（OAuth の欄は空）
   - ChatGPT: 設定の「コネクタ」（開発者モード）→「作成」→ MCP サーバーの URL に貼る・認証「なし」
   - Claude Code: `claude mcp add --transport http orime https://orime.vercel.app/api/mcp --header "Authorization: Bearer orime_mcp_…"`（JSON の例も同じ画面）
4. 「つないでいる AI」に名前・作った日・最後に使った日が並ぶ。**「取り消す」**で行を消すと、その AI はすぐ読めなくなる。キーは 5 つまで。

## 2. 道具（tools）・プロンプト・資料
| 名前 | できること | 書く？ | カード |
|---|---|---|---|
| `list_books` | 本の一覧（状態 want/before/reading/done・分野 `field`・書名／著者の言葉・`offset` で続き） | 読む | ○ |
| `get_book` | 1 冊の詳細（読書準備・この本のまとめ・メモ 200 件・行動・読書の時間） | 読む | ○ |
| `search_memos` | 自分のメモを言葉（空白区切りは AND）やタグ `tag` で探す（本で絞れる） | 読む | ○ |
| `recent_memos` | 最近のメモ（新しい順・日数で絞れる） | 読む | ○ |
| `list_actions` | 行動（まだ／完了） | 読む | ○ |
| `reading_stats` | 本・メモ・行動の数と、集中モードの読書の時間（今週・今月・これまで・本ごと） | 読む | ○ |
| `add_memo` | メモを足す（本の id が無ければ本なしの学び＝`source_type='personal'`） | 書く | |
| `update_memo` | 自分のメモの本文・ページ・タグを直す | 書く | |
| `add_action` | 行動を足す（期限 YYYY-MM-DD） | 書く | |
| `complete_action` | 行動を完了にする（ふりかえりを添えられる） | 書く | |
| `add_book` | 書名（＋著者）からサーバーの本の検索（楽天 → Google → NDL）で書誌を取り、本棚に足す（既定は積読・同じ本は足さない・見つからなければ書名だけ） | 書く | |

消す・本の状態を変える道具は作らない（アプリで）。返すのは AI が読みやすい文字（Markdown 風・book_id / memo_id / action_id 入り・利用者 id は返さない）＋ `structuredContent`（下のカードが読む）。
`initialize` の `instructions` で「根拠にした本とメモを添える・メモは言い換えず引用・順位やバッジの言い方をしない・書く道具は頼まれたときだけ」と伝える。

**プロンプト**（`prompts/list` / `prompts/get`・Claude の「＋」や ChatGPT の入力欄から選べる決まった型）: `consult`（自分のメモに相談する・引数 question）・`book_review`（1 冊を振り返る・book_title）・`weekly_actions`（今週の行動を決める）・`reading_report`（読書の記録をまとめる）。

**資料**（`resources/list` / `resources/read`・AI が会話に添える）: `orime://books`・`orime://memos/recent`・`orime://actions`・`orime://books/{book_id}`（Markdown）と、下のカードの HTML。

## 2-1. 会話の中のカード（Claude の MCP Apps・ChatGPT の Apps SDK）
オーナー「アーティファクトとの連携もできる？ ChatGPT の同様のものがあれば」。Claude のアーティファクトから MCP を直接呼ぶ道は無いが、**MCP 側が会話の中に描く画面**を持てる（Claude＝MCP Apps・ChatGPT＝Apps SDK。どちらも MCP の拡張）。
- 読む道具 6 つは `_meta` に画面の印（Claude: `ui.resourceUri`＝`ui://orime/cards.html`・mimeType `text/html;profile=mcp-app`／ChatGPT: `openai/outputTemplate`＝`ui://orime/cards-openai.html`・mimeType `text/html+skybridge`）を持ち、同じ 1 枚の HTML（`api/_mcpWidget.js` の `widgetHtml`）を `resources/read` で返す。
- HTML の中の JS は、ChatGPT では `window.openai.toolOutput`（＋`openai:set_globals`）を、Claude では postMessage の JSON-RPC（`ui/initialize` → `ui/notifications/tool-result` の `structuredContent`）を読んで、本（表紙・書名・著者・状態・★・分野）・メモ（明朝の本文・『書名』p.N・日付・タグ）・行動・読書の記録を描く。明暗は `prefers-color-scheme`。外へは何も取りに行かない（表紙は https の URL をそのまま img に）。
- 画面を描けない AI（Claude Code・Cursor など）でも文字の答えがいつも一緒に返るので困らない。
- 仕様は動いている（MCP Apps は 2026-01 の拡張・Apps SDK は 2025-10〜）ので、受け取り方の名前が変わったら JS の 2 か所だけ直す。確かめ方は §4 の 3。

## 3. 仕組み
- **入口** `api/mcp.js`（Streamable HTTP・JSON の応答だけ・GET は 405・DELETE は 204・通知だけなら 202）。Vercel の rewrite で `/mcp/:key` → `/api/mcp?key=…`（`vercel.json`・SPA の rewrite は `mcp/` を除く）。
- **本体** `api/_mcp.js`（JSON-RPC 2.0・`initialize` / `ping` / `tools/list` / `tools/call` / `prompts/*` / `resources/*`・配列も）。カードは `api/_mcpWidget.js`。テストは `api/_mcp.test.js`・`api/mcp.handler.test.js`。
- **認証**: 接続キー `orime_mcp_` ＋ 32 バイトの base64url。端末で作り（`src/lib/mcpTokens.js`）、**SHA-256 のハッシュだけ**を `mcp_tokens` に入れる（本人・RLS・`supabase_mcp_tokens.sql`）。サーバーは service_role でハッシュを引いて本人を決め、すべての問い合わせに `user_id` を付ける。`last_used_at` は 10 分に 1 回だけ書く。
- **守り**: 認証の前に IP ごと 1 分 240 回（`api/_ipRate.js`）・本人ごと 1 分 120 回・`Cache-Control: no-store`・キー無し／違い／取り消しは 401 ＋ `WWW-Authenticate`。文字は制御文字を除き、メモ 5,000 字・行動 500 字・探す言葉 200 字・1 回 50 件まで。`ilike` の `%`・`_` は空白に。
- **退会**: `mcp_tokens` を本人が消す（`AccountSettings.jsx`・auth.users の削除でも CASCADE）。データの初期化ではキーを残す。
- **未適用**（SQL を流していない）: シートに「まだ使えません」。サーバーは 401。
- **計測**: `mcp_connect`（`action`: `open` / `create` / `revoke`・`docs/analytics-events.md`）。

## 4. オーナーの作業
1. `supabase_mcp_tokens.sql` を流す（`supabase_all_in_order.sql` にも入っている）。
2. Vercel に出す（`api/mcp.js`・`vercel.json`）。iOS のアプリはシートが入った版を出し直す（サーバーだけでは設定に行が出ない）。
3. 自分で試す: 設定でキーを作り、Claude のカスタムコネクタに URL を貼って「最近のメモを見せて」（メモがカードで出れば MCP Apps が効いている・文字だけなら受け取り方の名前を §2-1 で確かめる）。ChatGPT は 設定 → コネクタ → 開発者モードで同じ URL・認証なし。

## 5. 決めたこと・決めていないこと
- OAuth（Claude.ai が自動でログイン画面を出す形）は作っていない。URL にキーを入れる形は Claude.ai・ChatGPT・Claude Code・Cursor のどれでも通る。キーを知られたら読めるので、画面で「人に送らない」と書き、取り消しを 1 回で。
- 相談（Orime の AI）を MCP から呼ぶ道具は作らない（トークンの原価が本人の会話の外で動くので）。代わりにプロンプト `consult` が、つないだ AI に「メモを探してから、根拠つきで答える」型を渡す。
- 読める量の上限（1 回 50 件・メモ 200 件）は AI の文脈に収まる範囲。足りなければ `search_memos` で絞る。

## 6. 開発の道具としての MCP（`.mcp.json`）
リポジトリの `.mcp.json` に、Orime 自身（`ORIME_MCP_TOKEN` を環境変数に入れた Claude Code からこの MCP を呼ぶ＝自分のメモで動作を確かめる）と iOS シミュレータ（`ios-simulator-mcp`・Mac だけ）を置いた。鍵はファイルに書かない（`${ORIME_MCP_TOKEN}`）。
