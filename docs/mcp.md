# 🔌 AI と連携（MCP）— Orime を Claude・ChatGPT から呼ぶ（2026-11-07）

オーナー「アプリと AI が繋がるようにしたい」。Orime を MCP（Model Context Protocol）のサーバーにして、利用者が
**いつもの AI（Claude・ChatGPT・Claude Code・Cursor など）から自分の本・メモ・行動を読み書きできる**ようにした。
Orime の中の相談（Haiku）とは別の道で、**Orime のトークンは使わない**（AI 側の会話の中で、AI が Orime を材料として読む）。

## 1. 利用者から見た流れ
1. 設定 →「AI と連携」→「Claude・ChatGPT とつなぐ」→ **どこにつなぐかを選ぶ**（Claude／ChatGPT／Claude Code・名前は自動）→ **「〈先〉用の接続キーを作る」**
2. その場だけ出る **接続 URL**（`https://orime.vercel.app/mcp/orime_mcp_…`・Claude Code はコマンド）を「コピー」
3. 選んだ先の手順に沿って登録
   - Claude: 設定 →「コネクタ」→「カスタムコネクタを追加」→ 名前 Orime・URL を貼る → **認証は「サインインなし」**（OAuth のままだと「サインインサービスに登録できませんでした」になる・2026-11-08 に実際に起きた）→「追加」→「連携させる」。URL にキーを入れたくない人は URL を `…/api/mcp` にして「リクエストヘッダー」に `Authorization: Bearer orime_mcp_…` でも通る
   - ChatGPT: 設定 →「アプリとコネクタ」→「詳細設定」→ 開発者モード → コネクタの「作成」→ MCP サーバーの URL に貼る・認証「認証なし」
   - Claude Code: `claude mcp add --transport http orime https://orime.vercel.app/api/mcp --header "Authorization: Bearer orime_mcp_…"` を**ターミナル（Claude Code の外）**に 1 行で貼る（画面の箱で折れた所から貼ると「Invalid header format」になる＝必ず「コマンドをコピー」）。`.well-known/*` は SPA の rewrite から外した（OAuth の探り当てに HTML を返さない・`vercel.json`）
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
| `ops_dashboard` | （運営者だけ）運営の数字を 1 回でまとめて読む（利用者・会員・売上と粗利の材料・ローンチの 4 つの数字・目標・週ごと・更新の見込み）。中身は `supabase_admin_mcp.sql` の `admin_snapshot_for`（その人として既存の集計関数を呼ぶ）。Claude の会話の中の運営ダッシュボード（アーティファクト）が「Orime」コネクタでこれを呼んで描く。管理者でなければ「運営者だけ」・SQL が無ければその旨 | 読む（管理者） | |
| `ops_feedback` | （運営者だけ）フィードバックを読む（`list`・status で絞る）・状態と運営のメモを変える（`update`） | 読む・書く（管理者） | |
| `ops_tickets` | （運営者だけ）運営の作業チケットを読む・作る・進める（`list` / `create` / `update`・不具合・要望・作業・優先度 1〜3） | 読む・書く（管理者） | |
| `ops_tasks` | （運営者だけ）運営者の期日つきのやることを読む・足す・進める・消す（`list` / `add` / `update` / `claim` / `done` / `delete`）。担当 `assignee=claude` のやることは自動のセッションが `claim` で 1 つ取って進め、`update` で 状態（doing / done / blocked）と結果を書く | 読む・書く（管理者） | |
| `ops_goal` | （運営者だけ）有料ユーザーの目標（人数・期限・道しるべ・公開日）を読む・決め直す（`get` / `set`） | 読む・書く（管理者） | |
| `ops_week` | （運営者だけ）週の記録＝毎週の見直し（`review`）と手入力の週の数字（`sales`・ストア表示・インストール・note PV・X など）。同じ週は上書き | 書く（管理者） | |
| `ops_image` | （運営者だけ）投稿の画像を作る（OpenAI gpt-image-1＝ChatGPT と同じ画像の仕組み・`api/_social.js` の `makeImage`）→ 公開バケット `ops-media` に置いて URL を返す。1 枚 約 ¥6〜25 | 書く（管理者） | |
| `ops_post` | （運営者だけ）SNS の投稿の予定を読む・入れる・直す・取り消す・いますぐ出す・時刻の来たものを出す（`list` / `add` / `update` / `cancel` / `now` / `flush` / `status`）。送り先は X（OAuth 1.0a・v2 tweets＋v1.1 media）・Threads（Threads API）・Instagram（Graph API・画像が必須）。鍵は Vercel の env（`X_API_KEY` ほか・`THREADS_*`・`IG_*`）。記録は `ops_posts` | 書く（管理者） | |

運営ダッシュボードのアーティファクト（Claude の会話の中・オーナーだけ・2026-11-08 にアプリの中の運営ダッシュボードはやめて、ここに一本化）: https://claude.ai/artifact/RmXcpzbgaNftAjZrJi6FDX ＝「Orime」コネクタの `ops_dashboard` を 1 回呼び、5 つの区分（概況＝タイル・目標までの棒・ローンチの 4 つの数字・12 週の登録と有料／集客と定着＝LP から有料までの段・残っている率・日ごとに使った人・週ごとの表・登録した週ごとの表／売上と粗利＝12 か月の推移・更新の見込み・今月の内訳・AI の使い道・有料 N 人の見込み／やること・声＝横のチャットで頼める例・やること・開いているフィードバックとチケット・毎週の見直し・手で入れた週の数字／公開の準備＝環境変数と SQL のそろい）に描く。計算は旧 `src/lib/adminProfit.js` と同じ決まり（月額 ¥1,480・年額 ÷12・創業 ¥9,800 ÷12・÷1.1・手数料 15%・AI の実額＋分野 1 冊 ¥0.13・固定費 Apple ¥1,082）。開く人の自分の接続キーで読むので、管理者（`app_admins`）でない人には数字が出ない。**指示は横のチャットから**＝運営の道具 5 つ（上の表）を Claude が呼ぶ（「来週までに〜を足して」「3 件目を対応済みに」「目標を 1,200 人に」「今週の見直し：…」）。

消す・本の状態を変える道具は作らない（アプリで）。返すのは AI が読みやすい文字（Markdown 風・book_id / memo_id / action_id 入り・利用者 id は返さない）＋ `structuredContent`（下のカードが読む）。
`initialize` の `instructions` で「根拠にした本とメモを添える・メモは言い換えず引用・順位やバッジの言い方をしない・書く道具は頼まれたときだけ」と伝える。

**プロンプト**（`prompts/list` / `prompts/get`・Claude の「＋」や ChatGPT の入力欄から選べる決まった型）: `consult`（自分のメモに相談する・引数 question）・`book_review`（1 冊を振り返る・book_title）・`weekly_actions`（今週の行動を決める）・`reading_report`（読書の記録をまとめる）・`save_conversation`（この会話を Orime に残す＝結論・根拠の本・次の一歩を確かめてから add_memo／add_action・2026-11-08 オーナー「Claude の情報をアプリが拾うことはできる？」）。

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

## 6. アプリを作るための MCP（開発者側・`.mcp.json`・2026-11-07 オーナー「アプリ構築のための MCP も」）
リポジトリの `.mcp.json` に、Claude Code（オーナーの Mac とクラウド）から使う MCP を置いた。鍵はファイルに書かず環境変数で渡す（`${…}`・無ければそのサーバーだけ起動しない）。はじめて使うとき Claude Code が「このプロジェクトの MCP を使うか」を聞くので許可する。

| 名前 | 何のため | 入れ方・鍵 |
|---|---|---|
| `orime` | 本番の Orime の MCP（自分のメモで動作を確かめる・利用者と同じ道具） | 設定の「AI と連携」で作った接続キーを `ORIME_MCP_TOKEN` に（`~/.zshrc` などで `export`・チャットに貼らない）。クラウドの作業環境は本番ドメインを許していないので 403＝Mac で使う |
| `supabase` | 表・列・RLS・ログを Claude Code から直接読む（SQL の有無の確認・データの点検）。**読むだけ**（`--read-only`） | Supabase → Account → Access Tokens で個人のトークンを作り `SUPABASE_ACCESS_TOKEN` に。本番のデータなので書く形には変えない |
| `vercel` | 公開の状態・ログ・環境変数の名前（値は読まない）・ドメイン | OAuth（はじめて使うときブラウザでログイン）。鍵の設定なし |
| `sentry` | 本番のエラーをその場で読む・直す | OAuth。鍵の設定なし |
| `playwright` | 画面を動かして確かめる（`/webapp-testing` の道具版・390×844） | 鍵なし。クラウドの作業環境は Chromium が `/opt/pw-browsers/chromium` にあるので、動かないときは `--executable-path /opt/pw-browsers/chromium` を args に足す |
| `context7` | ライブラリの最新の使い方（Capacitor・Supabase・Vite・RevenueCat）を本家の文書から引く | 鍵なし |
| `ios-simulator` | iOS シミュレータの撮影・操作（CLAUDE.md「iOS シミュレータでの確認」） | Mac だけ。`brew install idb-companion`・`pip3 install fb-idb` |

GitHub は Claude Code のクラウドが最初から持っている（PR・Actions・ログ）。RevenueCat・App Store Connect は MCP が無い（手順は `docs/iap-setup-runbook.md`・`company/app-store-submission.md`）。
鍵の置き場: Mac は `~/.zshrc` の `export`、クラウドは環境の「Network secrets」か環境変数（チャットには貼らない）。


## 7. 自動で動く Claude Code と SNS の投稿（2026-11-08）

オーナー「ダッシュボードにやることを載せておいたら、自動的に Claude Code が常に動く」「SNS の投稿の文章と画像も自動で作って、計画どおりに投稿」。

- **仕組み**: claude.ai の「スケジュールされたタスク」が、専用の作業環境 `leverage-reading`（リポジトリを clone して `npm ci`）で新しいセッションを起こす。セッションは `node scripts/ops-mcp.mjs <道具> '<JSON>'` で Orime の MCP（運営の道具）を呼ぶ。鍵はリポジトリに置かず、その環境の**ネットワークのシークレット**（ホスト `orime.vercel.app`・`Authorization: Bearer <接続キー>`）が差し替える（claude.ai → 環境 → leverage-reading → ネットワークのシークレット。接続キーは設定の「AI と連携」で「Claude Code 用」を作る）。
- **やることを進める**（2 時間ごと・名前「Claude のやること」）: ①`ops_post flush`（時刻の来た投稿を出す）②`ops_tasks claim`（担当 claude・todo の中で期日の早い 1 つを doing に）③無ければ静かに終わる。あれば CLAUDE.md・SPEC・DESIGN の決まりで実装 → `npx vitest run`・`npm run build`・UI なら明暗のスクショと ui-critic → 文書の同期 → コミット → `main` へ push（Vercel が公開） → `ops_tasks update status=done result=…`。分からない・危ない（課金・鍵・SQL の破壊・利用者のデータ・ops_post 以外の外への送信）は `blocked` に理由と質問を書いて止まる。1 回 1 つ・90 分まで。
- **土曜の投稿キット**（毎週土曜 5:47・名前「土曜の投稿キット」）: `/mkt-week` の手順で `company/weekly/<土曜>.md` を書き（ブランチ `claude/weekly-posts`・main には入れない）、鍵のある送り先だけ `ops_post add` で**月曜から**の予約に入れる（画像は `ops_image`）。オーナーは土曜・日曜にダッシュボードの「やること・声」の「SNS の投稿」で読み、横のチャットで直す・取り消す。
- **ダッシュボードで見える**: やること（担当・状態・結果）・SNS の投稿（予定・出した・出せなかった・鍵のそろい）。
- **止める・変える**: claude.ai の「スケジュールされたタスク」で止める。頻度は同じ場所で変えられる。
- **オーナーの準備**（クロード in Chrome に貼る指示文は `docs/claude-in-chrome-setup.md`）: ① `supabase_admin_mcp.sql` を流す（`ops_tasks` の列・`ops_posts`・`ops-media` バケット）② Vercel の env に X（`X_API_KEY` `X_API_SECRET` `X_ACCESS_TOKEN` `X_ACCESS_SECRET`＝X Developer Portal・Read and Write）・Threads（`THREADS_USER_ID` `THREADS_ACCESS_TOKEN`＝Meta for Developers の Threads API・長期トークン）・Instagram（`IG_USER_ID` `IG_ACCESS_TOKEN`＝Instagram Graph API・ビジネス／クリエイターアカウント）を入れる（無い送り先は予約せず、ファイルに残る）③ 環境 `leverage-reading` のネットワークのシークレットに Orime の接続キー。
