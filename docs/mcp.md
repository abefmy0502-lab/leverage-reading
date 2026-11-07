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

## 2. 道具（tools）
| 名前 | できること | 書く？ |
|---|---|---|
| `list_books` | 本の一覧（状態 want/before/reading/done・書名／著者の言葉・20 件） | 読む |
| `get_book` | 1 冊の詳細（読書準備・この本のまとめ・メモ 200 件・行動） | 読む |
| `search_memos` | 自分のメモを言葉で探す（空白区切りは AND・本で絞れる） | 読む |
| `recent_memos` | 最近のメモ（新しい順・日数で絞れる） | 読む |
| `list_actions` | 行動（まだ／完了） | 読む |
| `add_memo` | メモを足す（本の id が無ければ本なしの学び＝`source_type='personal'`） | 書く |
| `add_action` | 行動を足す（期限 YYYY-MM-DD） | 書く |

消す・直す・本の状態を変える道具は作らない（アプリで）。返すのは AI が読みやすい文字（Markdown 風・本とメモの id 入り・利用者 id は返さない）。
`initialize` の `instructions` で「根拠にした本とメモを添える・メモは言い換えず引用」と伝える。

## 3. 仕組み
- **入口** `api/mcp.js`（Streamable HTTP・JSON の応答だけ・GET は 405・DELETE は 204・通知だけなら 202）。Vercel の rewrite で `/mcp/:key` → `/api/mcp?key=…`（`vercel.json`・SPA の rewrite は `mcp/` を除く）。
- **本体** `api/_mcp.js`（JSON-RPC 2.0・`initialize` / `ping` / `tools/list` / `tools/call`・配列も）。テストは `api/_mcp.test.js`・`api/mcp.handler.test.js`。
- **認証**: 接続キー `orime_mcp_` ＋ 32 バイトの base64url。端末で作り（`src/lib/mcpTokens.js`）、**SHA-256 のハッシュだけ**を `mcp_tokens` に入れる（本人・RLS・`supabase_mcp_tokens.sql`）。サーバーは service_role でハッシュを引いて本人を決め、すべての問い合わせに `user_id` を付ける。`last_used_at` は 10 分に 1 回だけ書く。
- **守り**: 認証の前に IP ごと 1 分 240 回（`api/_ipRate.js`）・本人ごと 1 分 120 回・`Cache-Control: no-store`・キー無し／違い／取り消しは 401 ＋ `WWW-Authenticate`。文字は制御文字を除き、メモ 5,000 字・行動 500 字・探す言葉 200 字・1 回 50 件まで。`ilike` の `%`・`_` は空白に。
- **退会**: `mcp_tokens` を本人が消す（`AccountSettings.jsx`・auth.users の削除でも CASCADE）。データの初期化ではキーを残す。
- **未適用**（SQL を流していない）: シートに「まだ使えません」。サーバーは 401。
- **計測**: `mcp_connect`（`action`: `open` / `create` / `revoke`・`docs/analytics-events.md`）。

## 4. オーナーの作業
1. `supabase_mcp_tokens.sql` を流す（`supabase_all_in_order.sql` にも入っている）。
2. Vercel に出す（`api/mcp.js`・`vercel.json`）。iOS のアプリはシートが入った版を出し直す（サーバーだけでは設定に行が出ない）。
3. 自分で試す: 設定でキーを作り、Claude のカスタムコネクタに URL を貼って「最近のメモを見せて」。

## 5. 決めたこと・決めていないこと
- OAuth（Claude.ai が自動でログイン画面を出す形）は作っていない。URL にキーを入れる形は Claude.ai・ChatGPT・Claude Code・Cursor のどれでも通る。キーを知られたら読めるので、画面で「人に送らない」と書き、取り消しを 1 回で。
- 相談（Orime の AI）を MCP から呼ぶ道具は作らない（トークンの原価が本人の会話の外で動くので）。必要になったら `consult` を有料の人だけに。
- 読める量の上限（1 回 50 件・メモ 200 件）は AI の文脈に収まる範囲。足りなければ `search_memos` で絞る。

## 6. 開発の道具としての MCP（`.mcp.json`）
リポジトリの `.mcp.json` に、Orime 自身（`ORIME_MCP_TOKEN` を環境変数に入れた Claude Code からこの MCP を呼ぶ＝自分のメモで動作を確かめる）と iOS シミュレータ（`ios-simulator-mcp`・Mac だけ）を置いた。鍵はファイルに書かない（`${ORIME_MCP_TOKEN}`）。
