# Claude in Chrome に渡す指示文（RevenueCat の設定・2026-11-15）

> 使い方: 下の「---」から最後までを全部コピーして、Claude in Chrome に貼る。
> 前提: App Store Connect に 4 つの商品（`orime_monthly`・`orime_annual`・`orime_tokens_300`・`orime_tokens_1000`）ができている（`chrome-asc-prompt.md`）。有料 App の契約が「有効」でないと、RevenueCat に商品を取り込めない。
> 中身は `docs/iap-setup-runbook.md` の E〜G と同じ。
> **秘密の鍵は Chrome に扱わせない**: App 内課金の鍵（.p8）のダウンロードとアップロード、`sk_` の秘密の鍵、Webhook の合言葉は**オーナーが自分で**扱う（指示文の中で止めてある）。`appl_` の公開用の鍵は秘密ではないので Chrome が扱ってよい。

---

あなたは私（iPhone アプリ「orime」の運営者）の代わりに、RevenueCat（https://app.revenuecat.com）と App Store Connect（https://appstoreconnect.apple.com）の画面で、アプリ内課金をつなぐ設定を進めます。私は横で見ています。

## 守ること
- **秘密の値を読まない・書き写さない・チャットに出さない**: App Store Connect の App 内課金の鍵（.p8）の中身、RevenueCat の **Secret API key（`sk_` で始まる）**、Webhook の Authorization の合言葉。この 3 つが出る場面では、画面を私に渡して止まり、私の「できた」を待つ。
- `appl_` で始まる **Public app-specific API key** は秘密ではない。報告に書いてよい。
- ファイルのダウンロード・アップロード（.p8）は私がやる。
- **消さない**: 既にあるプロジェクト・アプリ・商品・Entitlement・Offering を削除しない。同じものがあれば作り直さず、中身を下の値に合わせる。違っていたら私に聞く。
- 支払いの情報の入力・有料プランへの申し込み（RevenueCat の料金プラン）はしない。止めて私に聞く。
- 下に書いた識別子（`jp.orime.app`・`premium`・`default`・製品 ID）は**一字も変えずに**入れる。
- 画面が説明と違う・迷う・エラーが出たら、勝手に決めずに画面の状態を伝えて聞く。各ステップが終わるたびに 1〜2 行で報告する。

## ステップ 0: 今の状態を見る（まだ何も変えない）
1. App Store Connect → アプリ → orime → 「収益化」で、4 つの商品（`orime_monthly`・`orime_annual`・`orime_tokens_300`・`orime_tokens_1000`）があるか、それぞれの状態を報告する。
2. App Store Connect →「ビジネス」で、有料 App の契約が「有効」かを報告する。
3. RevenueCat にログインしているか、**orime** というプロジェクトがあるかを報告する。ログインしていなければ止まる（私がログインする）。

## ステップ 1: App Store Connect の App 内課金の鍵（私が受け取る）
1. App Store Connect →「ユーザとアクセス」→「統合」（Integrations）→「App 内課金」（In-App Purchase）を開く。
2. 既に「RevenueCat」という名前の鍵があれば、作り直さずに報告する（.p8 を私が持っているかを聞く。持っていなければ新しく作る）。
3. 無ければ「＋」（キーを生成）→ 名前 `RevenueCat` → 生成。
4. **ここで止まる**。私にこう伝える: 「.p8 をダウンロードしてください（1 回しかダウンロードできません）。画面のキー ID と、上のほうの発行者 ID（Issuer ID）も、あとで RevenueCat に入れます」。キー ID と発行者 ID は秘密ではないので、報告に書いてよい。

## ステップ 2: RevenueCat のプロジェクトとアプリ
1. プロジェクトが無ければ「Create project」→ 名前 `orime`。
2. 「Apps & providers」（アプリ）→「＋」→ **App Store**:
   - App name: `orime`
   - Bundle ID: `jp.orime.app`
   - **In-App Purchase Key**: .p8 のアップロードは**私がやる**。キー ID と発行者 ID の欄は、ステップ 1 の値を入れてよい。
   - 保存のあと、画面の「App Store Server Notifications」の **URL** を報告する（秘密ではない）。
3. App Store Connect に戻る: orime →「App 情報」（一般）→「App Store サーバ通知」→ **本番** と **サンドボックス** の両方に、その URL を貼って保存する。バージョンは「バージョン 2」を選ぶ（選べるとき）。

## ステップ 3: 商品・Entitlement・Offering
1. RevenueCat →「Product catalog」→「Products」→「＋」か「Import」で、4 つを取り込む: `orime_monthly`・`orime_annual`・`orime_tokens_300`・`orime_tokens_1000`。取り込めなければ、出た文を報告する（たいていは App Store Connect の契約が有効でない）。
2. 「Entitlements」→「＋」: 識別子 `premium`・表示名 `orime プラン`。付ける商品は **`orime_monthly` と `orime_annual` の 2 つだけ**。**トークンの 2 つは絶対に付けない**（付けると、トークンを買っただけで「プラン契約中」になる）。
3. 「Offerings」→「＋」: 識別子 `default`・表示名 `orime プラン` → **Current（いま使う）にする**。Packages:
   - **Monthly**（`$rc_monthly`）に `orime_monthly`
   - **Annual**（`$rc_annual`）に `orime_annual`
   - トークンの 2 つは Offering に入れない
4. Entitlement と Offering の中身（どの商品が付いているか）を報告する。

## ステップ 4: 鍵
1. 「Project settings」→「API keys」を開く。
2. **Public app-specific API key**（App Store のアプリの、`appl_` で始まるもの）を報告する。これは Mac の作業で使う（秘密ではない）。
3. **Secret API key は作らない・開かない**。ここで止まり、私にこう伝える: 「Secret API keys →＋New → 名前 `orime Vercel`・**V1**・読み取り で作り、`sk_` の値を Vercel の `REVENUECAT_SECRET_API_KEY` に、ご自分で貼ってください（この画面でしか全部見えません）」。私の「できた」を待つ。

## ステップ 5: Webhook（合言葉は私が入れる）
1. 「Integrations」→「Webhooks」→「＋」:
   - 名前: `orime Supabase`
   - Webhook URL: `https://orime.vercel.app/api/revenuecat-webhook`
   - 環境: **Production と Sandbox の両方**
   - イベント: すべて
   - **Authorization header の欄は空のまま**にして、私に渡す。私にこう伝える: 「Mac のターミナルで `openssl rand -hex 32` を実行し、出た文字列を、この欄と Vercel の `REVENUECAT_WEBHOOK_AUTH` の両方に貼ってください」。
2. 私が「できた」と言ったら保存する。**Send test event はまだ押さない**（Vercel を出し直したあと）。

## ステップ 6: Vercel（公開用の鍵だけ）
1. https://vercel.com → プロジェクト **orime**（無ければ leverage-reading）→ Settings → Environment Variables。
2. 次の 3 つがあるかを見て報告する（値は見ない・書き写さない）: `VITE_REVENUECAT_IOS_KEY`・`REVENUECAT_SECRET_API_KEY`・`REVENUECAT_WEBHOOK_AUTH`。
3. `VITE_REVENUECAT_IOS_KEY` が無ければ足す: 値はステップ 4 の `appl_…`・環境は **Production**。**Sensitive（秘密）にしない**（`VITE_` で始まる値は、秘密にするとアプリに入らず出し直しが止まる）。
4. 出し直しは Vercel の Redeploy ではなく GitHub から（私か、別の Claude がやる）。ここでは押さない。

## ステップ 7: 最後の報告
次を一覧にして報告して終わる:
1. 終わったこと（ステップごと）
2. `appl_` で始まる公開用の鍵（Mac の作業で使う）
3. 私がやること: ①.p8 をアップロード（まだなら） ②`sk_` を Vercel へ ③Webhook の合言葉を両方へ ④GitHub の Actions で出し直し → RevenueCat の Webhook の **Send test event** が 200 になるか確かめる
4. 画面に出ている警告やエラー
