# App 内課金をつなぐ手順書（App Store Connect → RevenueCat → Vercel）

最終更新: 2026-10-10。前提: Apple Developer Program は登録済み。App Store Connect のアプリはまだ無い。

これが終わると、iPhone のアプリで「7 日間無料で試す」「年額プランで始める」「トークンを追加」が押せるようになり、買った人に AI が開きます。
画面の名前は Apple / RevenueCat が変えることがあります。見つからないときはその画面を撮って聞いてください。

**全体の順番（上から）**: A 契約と口座 → B アプリを作る → C プラン 2 つ → D トークン 2 つ → E RevenueCat 用の鍵 → F RevenueCat → G Vercel → H テスト用アカウントで試す

---

## A. 契約・税・口座（App Store Connect・15 分・最初に必ず）

お金を受け取る契約が「有効」でないと、アプリから商品が 1 つも読めません（買うボタンが出ない）。

1. https://appstoreconnect.apple.com → **ビジネス**（Business / 契約・税金・口座情報）
2. **有料 App（Paid Apps）** の契約の「同意する」→ 内容に同意
3. **口座情報**（振込先の銀行）を追加
4. **税務情報**: 米国の税務フォーム（W-8BEN・日本の個人なら W-8BEN）を画面の質問どおりに入力
5. 状態が **「有効」（Active）** になるまで待つ（数時間〜1 日）。B 以降は待っている間に進めてよい

## B. アプリを作る（5 分）

1. **アプリ** → 左上の **＋** → **新規 App**
2. 入れる値
   - プラットフォーム: **iOS**
   - 名前: **Orime - 読んだ本が相談相手に**（2026-10-10 決定・`company/app-store-listing.md`。ホーム画面のアイコンの下の名前はアプリの設定で Orime のまま）
   - 主言語: **日本語**
   - バンドル ID: **com.leveragereading.app**（一覧に無ければ Apple Developer の Identifiers で同じ ID を作り、**In-App Purchase** にチェック）
   - SKU: **orime-ios-001**
   - ユーザアクセス: フルアクセス
3. **作成**

## C. プラン 2 つ（自動更新サブスクリプション・15 分）

1. 作った Orime → 左の **収益化 → サブスクリプション** → **サブスクリプショングループを作成**
   - 参照名: **Orime プラン**
   - グループのローカリゼーション（日本語）: 表示名 **Orime プラン**
2. グループの中で **＋（作成）** を 2 回

| | 月額 | 年額 |
|---|---|---|
| 参照名 | 月額プラン | 年額プラン |
| 製品 ID | **orime_monthly** | **orime_annual** |
| 期間 | 1 か月 | 1 年 |
| 価格（日本） | **¥1,480** | **¥12,800** |
| 表示名 | 月額プラン | 年額プラン |
| 説明 | すべての AI と毎月 800 トークン | すべての AI と毎月 800 トークン |

   - 製品 ID は**あとから変えられません**。上の文字のとおりに（アプリは `annual` / `month` の文字で月額・年額を見分ける）
   - 価格は「日本」を基準に設定し、ほかの国は自動のままでよい
   - 審査用のスクリーンショット欄は、アプリの有料プランの画面のスクショを 1 枚（あとで入れてもよい）
3. **7 日間無料**（お試しオファー）: 各プランの **サブスクリプション価格 → ＋ → お試しオファーを作成**
   - 月額: 国 すべて／開始日 今日／終了日 なし／**無料・7 日間**
   - 年額: 同じく **無料・7 日間**（創業メンバー価格を始める日に、年額の分は止めて差し替える＝`company/launch-founding-offer.md` §1。公開の数日前にやる）
4. 状態が「メタデータが不足」なら、表示名・説明・スクショが欠けている。「送信準備完了」になれば OK（最初の 1 つはアプリの審査と一緒に出す）

## D. トークンの買い足し 2 つ（消耗型・10 分）

1. 左の **収益化 → App 内課金** → **＋** → 種類 **消耗型**（Consumable）

| | 300 | 1,000 |
|---|---|---|
| 参照名 | トークン 300 | トークン 1000 |
| 製品 ID | **orime_tokens_300** | **orime_tokens_1000** |
| 価格（日本） | **¥300** | **¥800** |
| 表示名 | トークン 300 | トークン 1,000 |
| 説明 | AI の答え 約 30 回ぶん（購入から 180 日） | AI の答え 約 100 回ぶん（購入から 180 日） |

## E. RevenueCat 用の鍵を作る（App Store Connect・5 分）

RevenueCat が「誰が何を買ったか」を Apple に確かめるための鍵です。

1. App Store Connect → **ユーザとアクセス → 統合（Integrations）→ App 内課金（In-App Purchase）**
2. **＋ / キーを生成** → 名前「RevenueCat」→ 生成
3. **.p8 ファイルをダウンロード**（1 回しかダウンロードできない）。あわせて画面の **キー ID** と、上のほうの **発行者 ID（Issuer ID）** を控える

## F. RevenueCat（20 分）

1. https://app.revenuecat.com にログイン（はじめてなら Apple か Google でアカウントを作る）→ **Create project** → 名前 **Orime**
2. **Apps & providers（アプリ）→ ＋ App Store**
   - App name: Orime／Bundle ID: **com.leveragereading.app**
   - **In-App Purchase Key**: E の .p8 を上げ、キー ID と発行者 ID を入れる
   - 保存すると、**App Store Server Notifications の URL** が表示される → それをコピー
3. App Store Connect に戻る: Orime → **アプリ情報 → App Store サーバ通知** → 本番とサンドボックスの両方に、コピーした URL を貼って保存（RevenueCat が購入・解約をすぐ知るため）
4. RevenueCat → **Product catalog → Products → ＋ / Import**: C と D の 4 つ（orime_monthly・orime_annual・orime_tokens_300・orime_tokens_1000）を取り込む（取り込めないときは A の契約がまだ有効でない）
5. **Entitlements → ＋**: 識別子 **premium**（名前は自由）→ **orime_monthly と orime_annual だけ**を付ける。**トークンの 2 つは付けない**（付けると、トークンを買っただけで「プラン契約中」になってしまう）
6. **Offerings → ＋**: 識別子 **default** → 「Current（いま使う）」にする → **Packages**:
   - **Monthly**（$rc_monthly）に orime_monthly
   - **Annual**（$rc_annual）に orime_annual
   - トークンの 2 つは Offering に入れなくてよい（アプリが製品 ID で直接読む）
7. **API keys**（Project settings の中）:
   - **Public app-specific API key**（`appl_…`）をコピー → G の `VITE_REVENUECAT_IOS_KEY`
   - **Secret API keys → ＋ New**: 名前「Orime Vercel」・**V1**・読み取り → `sk_…` をコピー → G の `REVENUECAT_SECRET_API_KEY`（この画面でしか全部見えない）
8. **Integrations → Webhooks → ＋**:
   - URL: **https://orime.vercel.app/api/revenuecat-webhook**
   - Authorization header: 自分で作った長い文字列（Mac のターミナルで `openssl rand -hex 32`）→ 同じ文字列を G の `REVENUECAT_WEBHOOK_AUTH` に
   - 環境: Production と Sandbox の両方に送る
   - 保存して **Send test event** → 200 なら OK（G を入れて Redeploy したあとに押す）

## G. Vercel に入れる（3 分）

Settings → Environment Variables（Production）:

| Key | Type | Value |
|---|---|---|
| `VITE_REVENUECAT_IOS_KEY` | Config | `appl_…`（公開用。アプリの中に入る） |
| `REVENUECAT_SECRET_API_KEY` | Secret | `sk_…`（V1） |
| `REVENUECAT_WEBHOOK_AUTH` | Secret | F-8 で作った文字列 |

→ Deployments → いちばん上の「…」→ **Redeploy**。そのあと F-8 の **Send test event**。

`VITE_REVENUECAT_IOS_KEY` はアプリの中に組み込む値なので、**Mac で iOS アプリを作るときにも要る**（Mac の作業の手順で入れる）。

## H. テスト用アカウントで買ってみる（TestFlight のあと・10 分）

1. App Store Connect → **ユーザとアクセス → Sandbox（サンドボックス）→ テスター → ＋**: ふだん使っていないメール（例 `自分+sandbox1@gmail.com`）・国は日本
2. iPhone の **設定 → App Store → サンドボックスアカウント** でそのアカウントにサインイン
3. TestFlight の Orime で「7 日間無料で試す」→ 購入の画面に **[Sandbox]** と出ればテストの購入（お金はかからない）
4. 買ったあとすぐに相談や読書計画シートが使えれば、課金はつながっている

---

## うまくいかないとき

| こうなる | 原因 |
|---|---|
| アプリに買うボタン・値段が出ない | A の契約が有効でない／`VITE_REVENUECAT_IOS_KEY` が iOS のビルドに入っていない／F-6 の Offering が Current でない |
| RevenueCat に商品を取り込めない | A の契約が有効でない |
| 買ったのに「プランが必要です」 | G の `REVENUECAT_SECRET_API_KEY` が無い・V2 の鍵／Redeploy していない |
| Webhook の Send test event が 401 | F-8 と G の `REVENUECAT_WEBHOOK_AUTH` が 1 文字でも違う |
| トークンだけ買った人が「プラン契約中」になる | F-5 でトークンを Entitlement に付けてしまった |
