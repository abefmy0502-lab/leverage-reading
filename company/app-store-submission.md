# 📱 Orime — App Store 提出 完全手順書（v1.0.0）

> 対象: iOS / Capacitor + RevenueCat(IAP)。Bundle ID `jp.orime.app`、表示名 `Orime`。
> このドキュメントは「コード側は提出可能水準」を前提に、**Apple 側でやる作業**を順に網羅する。
> ✅=実装/準備済み、⬜=あなた（Mac/Apple アカウント）が行う作業。
> **最終更新 2026-10-24**。課金の画面の操作は `docs/iap-setup-runbook.md` が正（このファイルと食い違ったらそちら）。

### 2026-10-24 の見直しで変わったこと（前に読んだ人へ）

| 項目 | 前の書き方 | 今 |
|---|---|---|
| Mac の道具 | 指定なし | **Xcode 26 以降（iOS 26 の SDK）でないと App Store Connect に上げられない**（Apple の決まり・2026-04-28 から）。Capacitor 8 も Xcode 26 が要る |
| iOS のプロジェクト | `npx cap sync ios` から | リポジトリに `ios/` がまだ無い。**最初の 1 回だけ `npx cap add ios`**（§5） |
| 通知の部品 | `npm i @capacitor/push-notifications` | **もう package.json に入っている**。`npm install` だけでよい（§12） |
| App 名 | Orime | **`Orime - 読んだ本と会話する読書メモ`**（2026-10-11 オーナー決定・`company/app-store-listing.md`）。ホーム画面の名前は Orime のまま |
| サブスクのグループ名 | Orime Premium | **Orime プラン**（`docs/iap-setup-runbook.md` C） |
| RevenueCat → Supabase の Webhook | 未実装なら別途 | **実装済み**（`api/revenuecat-webhook.js`）。F-8 で URL と合言葉を入れるだけ |
| 無料プランの AI | 毎月 30 トークン | **毎月 30・はじめの 2 か月は 60**（2026-10-21）。Review Notes を直した（§7） |
| 年齢レーティング | 4+ と書くだけ | **新しい質問票**（4+／9+／13+／16+／18+）に答える。答え方は §7 |
| デモアカウント | 「課金済みにしておく」だけ | **課金済みにする SQL** を §7 に |
| Mac で作るときの値 | 書いていない | `.env.production.local` に `VITE_` の値（§4-1） |
| 出し直し | Vercel の Redeploy | **GitHub の Actions の Run workflow**（Redeploy は使えない）。`VITE_` は **Config** |
| スクショ | 生成器だけ | 2026-10-11 に作った 6.9 / 6.5 インチの画像が `company/launch-2026-11/screenshots/` にある。その後に足した機能（読む時間の目安など）は入っていないので、出す前に見直す（§9） |

---

## 0. 現状サマリー（コード側の到達点）

| Apple の必須要件 | 状態 |
|---|---|
| IAP で課金（RevenueCat 経由・`src/lib/iap.js`） | ✅ |
| 購入の復元ボタン（Guideline 3.1.1） | ✅ Paywall に実装 |
| 自動更新の条件明示（3.1.2） | ✅ 「期間終了24時間前まで…」表示済み |
| 利用規約(EULA)・プライバシーポリシーへのリンク（3.1.2 / 5.1.1） | ✅ Paywall・設定に表示 |
| 価格・期間の明示 | ✅ ¥1,480/月・¥12,800/年 |
| アカウント削除を**アプリ内**で提供（5.1.1(v)） | ✅ 設定→アカウント削除 |
| 第三者トラッキング / IDFA / ATT | ✅ 無し（ATT プロンプト不要） |
| 第三者データ収集 | Sentry（クラッシュと動作の速さ・`VITE_SENTRY_DSN` を入れたビルドだけ）→ App Privacy で申告 |
| 自前利用計測 | analytics_events（ファーストパーティ・外部送信なし） |
| 追加トークンに期限なし（3.1.1「買ったクレジットを期限切れにしない」） | ✅ 2026-10-11（`supabase_ai_token_credits.sql` を流し直す） |
| 通知のスイッチは通知を出せるビルドだけ | ✅ 2026-10-11（`VITE_NATIVE_PUSH=on` のときだけ iPhone に出す・既定は隠す） |
| **iPhone の通知を 1.0 から出す（ローンチ前の必須・2026-10-21）** | ⬜ APNs の鍵・capability をそろえ（プラグインは package.json に入っている・`supabase_push_native.sql` は 2026-10-24 に流した）、**1.0 のビルドを `VITE_NATIVE_PUSH=on` で出す**（§12）。思い出しの通知・行動の期限の通知が、2 日目・7 日目・30 日目に戻るきっかけになる（30 日後も使う 25% の柱）。入れないと iPhone には何も届かない |

---

## 1. Apple Developer / 証明書（⬜）

1. **Apple Developer Program** 登録（年 ¥12,980）。
   - **Mac に Xcode 26 以降**（App Store から入れる・macOS は Xcode 26 が動く版に）。古い Xcode で作ったビルドは App Store Connect が受け付けない（2026-04-28 から）
2. **App ID** を作成: `jp.orime.app`。Capability で **In-App Purchase** と **Sign in with Apple** を有効化。**Push Notifications** は、通知を出すビルド（`VITE_NATIVE_PUSH=on`・APNs の鍵 `APNS_*` を Vercel に入れた）のときだけ足す。入れないビルドでは iPhone の設定に通知のスイッチは出ない（2026-10-11）。
3. 署名は **Xcode の Automatically manage signing** に任せるのが最速（Team を選ぶだけ）。

## 2. App Store Connect でアプリ作成（⬜）

1. [App Store Connect](https://appstoreconnect.apple.com) → My Apps → ＋ → New App。
   - Platform: iOS / Name: **Orime - 読んだ本と会話する読書メモ**（ホーム画面の名前は Orime のまま）/ Primary Language: 日本語 / Bundle ID: `jp.orime.app` / SKU: `orime-ios-001`。
2. **サブスク商品（Auto-Renewable Subscription）を2つ**登録（App内課金 → サブスクリプショングループ「Orime プラン」を作りその中に・画面の操作は `docs/iap-setup-runbook.md` C）:
   - 月額: Product ID `orime_monthly` / ¥1,480 / 期間1ヶ月
   - 年額: Product ID `orime_annual` / ¥12,800 / 期間1年
   - ローカリゼーション（表示名・説明）を各商品に記入。**審査用に最低1商品をアプリのバイナリと一緒に提出**。
   - ※ **7 日間無料と創業メンバー価格**: 月額は **Introductory Offer（無料・7 日間）**。年額は **公開から 30 日間だけ「前払い・1 年・¥9,800」（創業メンバー価格）**、そのあと 7 日間無料に差し替える（1 つの商品に初回特典は同時に 1 つだけ・`company/launch-founding-offer.md`）。RevenueCat webhook がダッシュボードの period_type を 'trial'／'intro' で書く設定と対にする。自前の「返金保証」は謳わない（Apple 一元管理）。
   - ※ **追加トークン（消耗型）`orime_tokens_300` / `orime_tokens_1000`** に期限は付けない（審査ガイドライン 3.1.1・2026-10-11）。説明は `docs/iap-setup-runbook.md` D。

## 3. RevenueCat 設定（⬜）

> 2026-10-10: 手順は `docs/iap-setup-runbook.md`（契約 → アプリ → 商品 → RevenueCat → Vercel → サンドボックス）を正とする。製品 ID は `orime_monthly` / `orime_annual` / `orime_tokens_300` / `orime_tokens_1000`。

1. RevenueCat ダッシュボードで **iOS アプリ**を追加（Bundle ID 紐付け）。**App Store Connect API Key（.p8）** を RevenueCat に登録（サブスク状態同期に必須）。
2. **Entitlement** を1つ作成（例 `premium`）。コードは「active な entitlement が1つでもあれば有効」判定なので名称は任意（`src/lib/iap.js` 参照）。
3. **Offering（current）** を作り、**Packages を Monthly / Annual** で登録し、上の Product ID を割り当てる（コードは packageType=MONTHLY/ANNUAL で引く）。
4. **公開 SDK キー（Apple 用）** を取得 → 環境変数 `VITE_REVENUECAT_IOS_KEY` に設定（下記）。
5. **Webhook → Supabase**: 中継は実装済み（`api/revenuecat-webhook.js`）。RevenueCat の Webhook に `https://orime.vercel.app/api/revenuecat-webhook` と合言葉を入れる（`docs/iap-setup-runbook.md` F-8・G）。

## 4. 環境変数（本番ビルドに必要・⬜ 確認）

| 変数 | 用途 |
|---|---|
| `VITE_REVENUECAT_IOS_KEY` | RevenueCat Apple 公開キー（**必須**・未設定だと課金導線が出ない） |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | クライアント |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | サーバー(API) |
| `ANTHROPIC_API_KEY` | AI（相談・AI 選書の推薦・ほかが失敗したときの代わり。**必須**） |
| `OPENAI_API_KEY` / `GEMINI_API_KEY`（任意） | AI の安い行き先（`docs/ai-routing.md`）。無ければ全部 Claude。Gemini は請求先を設定したプロジェクトのキーだけ |
| `GOOGLE_BOOKS_API_KEY` | 表紙解決（サーバー） |
| `VITE_SENTRY_DSN`（任意） | クラッシュ計測（入れたビルドだけ、プライバシーポリシーの委託先に Sentry の行が出る・§6・§8 もクラッシュとパフォーマンスを申告） |
| `VITE_RELEASE_NOTES_SINCE` | **App Store 1.0 のビルドには公開日（`YYYY-MM-DD`）を入れる**。それより前の「新しくなったこと」（公開前にたまった 27 の版）を、設定の一覧・更新したあとのシート・「何が変わった？」に出さない（2026-10-11）。Vercel の Web にも同じ値 |
| `VITE_NATIVE_PUSH`（任意） | `on` のビルドだけ iPhone に通知のスイッチを出す。APNs の鍵・capability・プラグインがそろうまでは入れない（既定は隠す・2026-10-11） |

### 4-1. Mac でアプリを作るときの値（2026-10-24）

iPhone のアプリは、Mac で `npm run build` したときの `VITE_` の値を中に焼き込む（Vercel の値は使われない）。リポジトリのいちばん上に **`.env.production.local`** を作り、次を書く（git には入らない・`.gitignore` 済み）。値は Vercel の Environment Variables と同じもの。

```
VITE_SUPABASE_URL=https://tkrinnopfssdibgxuqzl.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ…（Supabase の API Keys の anon public）
VITE_REVENUECAT_IOS_KEY=appl_…（docs/iap-setup-runbook.md F-7）
VITE_SITE_URL=https://orime.vercel.app
VITE_RELEASE_NOTES_SINCE=（公開日 YYYY-MM-DD）
# 通知を 1.0 から出すとき（§12 がそろってから）
# VITE_NATIVE_PUSH=on
# 入れているなら
# VITE_SENTRY_DSN=…
```

- 抜けているとアプリは「設定が未完了です」の画面になる（`VITE_SUPABASE_URL`・`VITE_SUPABASE_ANON_KEY`）か、買うボタンが出ない（`VITE_REVENUECAT_IOS_KEY`）
- 値を変えたら `npm run build && npx cap sync ios` をやり直してから Xcode でビルドする

## 5. Xcode / ネイティブプロジェクト（⬜）

```bash
# Mac で（リポジトリを clone したフォルダで・先に §4-1 の .env.production.local を作る）
npm install
npm run build
npx cap add ios    # 最初の 1 回だけ（ios/ を作る・2 回目からは不要）
npx cap sync ios
npx cap open ios   # Xcode が開く
```

- `npx cap add ios` で作った `ios/` は、Info.plist と PrivacyInfo を入れたあとでリポジトリにコミットする（次から作り直さないため・Pods とビルドの中身は .gitignore 済み）
Xcode で:
1. Signing & Capabilities → Team を選択、**In-App Purchase** と **Sign in with Apple** の capability を追加（**Push Notifications** と Background Modes の Remote notifications は `VITE_NATIVE_PUSH=on` で出すビルドだけ）。
2. General → **Version 1.0.0 / Build 1**、Display Name `Orime`。
3. App アイコン: `public/icons/icon-1024.png` を AppIcon にセット（1024 必須）。
4. **PrivacyInfo.xcprivacy** を `ios/App/App/` に追加（下記 §8 の内容をコピー）。
5. 実機（あなたの iPhone）で一度ビルド＆起動して、**課金（Sandbox）と復元**が動くか確認。
6. **Info.plist** に `ITSAppUsesNonExemptEncryption` = `NO`（Boolean・暗号化は HTTPS だけ）と、次の 3 つの説明文を入れる（`@capacitor/camera` は package.json に入っているので `npm install && npx cap sync ios` で入る・無いと開いた瞬間に落ちる・2026-10-11 に文を決めた）:

   | キー | 文 |
   |---|---|
   | `NSCameraUsageDescription` | 本のバーコードを読み取るとき、本のページを撮って文字に書き起こすとき、メモに写真を添えるとき、写真で共有の画像を撮るときに使います。 |
   | `NSPhotoLibraryUsageDescription` | メモに添える写真や、写真で共有の背景にする写真をアルバムから選ぶときに使います。 |
   | `NSPhotoLibraryAddUsageDescription` | 写真で共有で作った画像を、写真に保存するときに使います。 |

   実機で「写真で共有」→「写真から選ぶ」を押し、iOS のメニューが二重に出ずにフォトライブラリが直接開くことを確かめる（2026-10-11）。

## 6. App Privacy（プライバシー栄養成分・⬜ App Store Connect で入力）

「データを使用してユーザーを追跡しますか？」→ **いいえ**（第三者トラッキング/IDFA なし）。

収集データ（すべて **トラッキングには未使用**・2026-10-11 に実際の収集に揃えた。§8 の PrivacyInfo.xcprivacy と同じ）:

| データ種別（App Store Connect の名前） | 何か | 用途 | ユーザーに紐づく |
|---|---|---|---|
| 連絡先情報 → メールアドレス | ログイン・フィードバックに任意で書いたメール | App の機能・（フィードバックへの返事） | はい |
| 連絡先情報 → 名前 | Apple でサインインで共有された氏名・フィードバックに任意で書いた名前 | App の機能 | はい |
| 識別子 → ユーザー ID | アカウントの ID（購入・AI の量の管理にも） | App の機能 | はい |
| 購入 → 購入履歴 | プラン・追加トークンの購入（Apple／RevenueCat） | App の機能 | はい |
| ユーザーコンテンツ → 写真またはビデオ | メモに添えた写真・写真から書き起こしで撮ったページ（Google の Gemini API にも送る） | App の機能 | はい |
| ユーザーコンテンツ → その他のユーザーコンテンツ | 本・メモ・行動・相談・読書の時間 | App の機能 | はい |
| ユーザーコンテンツ → カスタマーサポート | フィードバック・要望の文 | App の機能（サポート） | はい |
| 使用状況データ → 製品の操作 | 自前の analytics_events（設定でオフにできる） | アナリティクス | はい |
| 診断 → クラッシュデータ／パフォーマンスデータ | **Sentry を入れたビルドだけ**（`VITE_SENTRY_DSN`）。IP・メールは送らない（`sendDefaultPii: false`） | App の機能 | いいえ |

- 通知のデバイストークンは Apple の区分の「デバイス ID」には当たらない（広告 ID ではなく通知の宛先）ので申告しない。通知を出すビルド（`VITE_NATIVE_PUSH=on`）でも同じ
- 写真で共有の写真は端末の中で描くだけで送らない（収集に当たらない）

### 6-1. AI の送り先が 3 社になった（2026-10-01・`docs/ai-routing.md`）

AI 機能ごとに、Anthropic（相談・AI 選書の推薦）／Google の Gemini API（読書計画シート・AI 選書の質問づくり・凝縮・まとめ・**写真から書き起こし**）に送る（2026-10-01 の 2 回目の振り分けで OpenAI は運営の参謀＝管理者だけ・集計の数字だけになった）。App Privacy の入力で変えるところ:

| データ種別 | 変えること | 理由 |
|---|---|---|
| ユーザーコンテンツ → **写真またはビデオ** | **新しく「収集する」にする**（用途: App の機能・ユーザーに紐付く: はい・トラッキング: いいえ） | 写真から書き起こしで、撮った写真を Google に送る。Google・OpenAI は不正利用の監視のため一定期間保存することがあり、Apple の「収集」（その場の処理に必要な時間より長く、自分や委託先が見られる形で端末の外に送る）に当たる。メモの写真は Supabase にも保存している |
| ユーザーコンテンツ → その他のユーザーコンテンツ | そのまま（メモ・質問・相談内容）。用途は App の機能 | 送り先の会社が増えても、データの種類と用途は変わらない |
| トラッキング | 「いいえ」のまま | AI 事業者は当方の代わりに処理する委託先（広告・データブローカーではない）。ユーザー ID・メールは送らない |

- App Privacy は「どの会社に送るか」を書く欄が無い。会社名はプライバシーポリシー（`/legal/privacy` 第5条・第7条）に書いた
- ✅ **審査ガイドライン 5.1.2(i)**（2025-11 改訂）: 個人データを**第三者の AI と共有する前に、はっきり知らせて明示の許可を取る**こと（[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)・[2025-11 の更新のお知らせ](https://developer.apple.com/news/?id=ey6d8onl)）。**2026-10-01 に実装した**（SPEC §1-6）:
  - はじめて AI を使う操作（相談を送る・AI 選書・読書計画シート・凝縮・まとめ・写真から書き起こし）のときに、シート「AI に送る内容について」（機能ごとに送るものと送り先＝Anthropic / Google・「つながらないときは Anthropic が代わりに答えます」・学習に使わない・プライバシーポリシーへのリンク）＋「今はやめる」／「同意して使う」。やめたら何も送らない
  - コード: `src/components/AiConsentSheet.jsx`（シート）・`src/lib/aiConsent.js`（同意の保存・関所）・`src/lib/aiProcessors.js`（送り先の説明＝`api/_aiRouting.js` と同じかをテストで確かめる）。関所は各機能の入口と、送る直前（`src/lib/ai.js` の `postClaude`・`src/lib/streamClaude.js`）の 2 段
  - 同意は Supabase のアカウント（`user_metadata.ai_consent = { version, at }`）に残る。⚙️ 設定 → プライバシー →「AI へのデータ送信」で見られ、取り消せる（次に AI を使うときにまた聞く）。送り先を変えたら `AI_CONSENT_VERSION` を上げる＝全員にもう一度聞く
  - サーバーでは止めていない（この版ではアプリ側だけ・`docs/ai-routing.md` §5）。**出し直す前の iOS アプリは聞かない**（審査に出すビルドには入っている）
  - ⚠️ **審査のデモアカウントは、提出の前に 設定 → AI へのデータ送信 →「同意を取り消す」にしておく**（動作確認で同意していると、審査官にシートが出ない）
- Review Notes に足す一文:
  > AI 機能は、はじめて使うときに送る内容と送り先（Anthropic・Google）を示して同意をいただき、同意のあと機能に必要な内容だけを各社の API に送ります（各社の API の規約で学習には使われません）。写真を送るのは「写真から書き起こし」だけです。同意は 設定 → プライバシー →「AI へのデータ送信」から取り消せます。

### 6-2. Jev（TypeSafe AI）を入れるとき（2026-10-02・`docs/jev-plan.md`・既定は入れていない）

判断の補助（相談で関係するメモを選ぶ）に、TypeSafe AI の Jev（文を書かず、選ぶ・確率だけを返すモデル・米国）を使えるようにした。**アプリの `VITE_AI_JEV=on` で出したビルドにだけ入る**（入れていないビルドの同意のシート・プライバシーポリシーには TypeSafe AI は出ない）。入れるときにすること:

- 同意の版が 2 になる＝同意済みの人にも、次に AI を使うときにもう一度シートが出る（相談の送り先が「Anthropic・TypeSafe AI」になる。合いそうなタグは端末の中だけで決め、TypeSafe AI には送らない）。TypeSafe AI には版 2 の同意がある人の分だけ送る（アプリ `src/lib/jev.js` とサーバー `api/_jevRelay.js` の両方で確かめる）
- プライバシーポリシー（`/legal/privacy` 第5条・第6条・第7条）は同じビルドで TypeSafe AI の行が出る。`legal/privacy.md` のドラフトにも ※ つきで書いた
- **出す前に確かめる**: TypeSafe AI の規約で「顧客のデータを学習に使わない」が今も書かれていること（プライバシーポリシーとシートの「どの会社も…学習に使いません」の根拠）・データの保存期間（ゼロ保持は Enterprise だけ＝一定期間の保存はありうる、第7条の「一定期間保存することがあります」で覆っている）
- App Privacy の入力: データの種類（メモ・質問＝その他のユーザーコンテンツ）と用途（App の機能）は変わらない。写真は送らない
- Review Notes の一文を「送り先（Anthropic・Google・TypeSafe AI）」に
- 審査のデモアカウントは版 2 の同意も取り消しておく（§6-1 と同じ）

## 7. App 審査情報（⬜）

- **デモアカウント**を用意（審査官がペイウォール内を見られるよう、課金済みの test アカウント or Sandbox 手順を Review Notes に明記）。
  - 作り方（2026-10-24）: ①アプリでふつうにアカウントを作る（例 `orime.review@gmail.com`・ふだん使わないメール）②本を 3 冊・メモを 10 件ほど入れておく（相談が答えられるように）③Supabase の SQL Editor で次を Run して課金済みにする ④設定 → プライバシー →「AI へのデータ送信」で同意を取り消す（§6-1）
    ```sql
    insert into public.subscriptions (user_id, status, provider, period_type, current_period_end)
    select id, 'active', 'manual', 'normal', now() + interval '1 year' from auth.users where email = 'orime.review@gmail.com'
    on conflict (user_id) do update set status = 'active', provider = 'manual', period_type = 'normal', current_period_end = excluded.current_period_end;
    ```
  - このアカウントは運営ダッシュボードの有料の数に 1 人として入る。公開のあとに `update public.subscriptions set status = 'canceled' where user_id = (select id from auth.users where email = 'orime.review@gmail.com');` で外す（`app_admins` に入れると運営ダッシュボードが審査官に見えるので入れない）（2026-09-27〜フリーミアム: 契約しなくてもアプリは使え、AI は相談・この本で学べること（あわせて毎月 30 トークン）と写真から書き起こし（毎月 10 回）。AI 選書・読書計画シートなどプランの機能を審査官が確かめられるよう、課金済みのデモアカウントは引き続き用意する）
- Review Notes 文例:
  > 審査用デモアカウント: email=____ / pass=____（このアカウントはプラン契約中にしてあり、AI 選書・読書計画シートなどプランの機能を確かめられます）。
> 契約しなくても、本・メモ・振り返り・写真で共有などはすべて使えます（無料プラン）。無料プランの AI は、相談とこの本で学べること（あわせて毎月 30 トークン・アカウントを作った月と翌月は 60）と、写真から書き起こし（毎月 10 回）です。プランは月額 ¥1,480・年額 ¥12,800 で、毎月 800 トークンとすべての AI 機能が使えます（月額は最初の 7 日間無料）。追加トークン（300・1,000）は消耗型で、期限はありません。
> 課金は App 内課金（RevenueCat 経由）です。購入の復元・自動更新の条件・利用規約・プライバシーポリシーを有料プランの画面に示しています。アカウント削除はアプリ内（設定 → アカウント削除）でできます。
> AI 機能は、はじめて使うときに送る内容と送り先（Anthropic・Google）を示して同意をいただき、同意のあと機能に必要な内容だけを各社の API に送ります（各社の API の規約で学習には使われません）。写真を送るのは「写真から書き起こし」だけです。同意は 設定 → プライバシー →「AI へのデータ送信」から取り消せます。
- **サポートURL** / **マーケティングURL** / **プライバシーポリシーURL**（`/legal/privacy`）/ **利用規約(EULA)URL**（`/legal/terms`）を登録。
- 年齢レーティング: **新しい質問票**（2025-07 に変わった・結果は 4+／9+／13+／16+／18+）に答える。Apple は「AI のアシスタントやチャットの機能も含めて、出てくる内容の頻度で答える」としている。Orime の答え方の目安:
  - 暴力・性的な内容・ギャンブル・薬物など: **なし**（相談は本人のメモと本に沿って答え、AI 選書は本を推す）
  - 医療・健康の情報: 健康の本を推すことはあるが、診断・治療はしない（答えの補足で「医師や専門家にも相談を」と添える）→ **ほとんど無い／まれ** のどちらかを選ぶ
  - ほかの人とのやりとり（メッセージ・投稿の公開）: **なし**（写真で共有は端末の共有シートに渡すだけ）
  - 制限の無いウェブの閲覧: **なし**（Amazon・楽天などの本のページを Safari で開くだけ）
  - 結果は 4+ か 9+ の見込み。画面の質問が増えていたら、その画面を撮って確かめる

## 8. PrivacyInfo.xcprivacy（⬜ `ios/App/App/` に追加）

2026-10-11 に §6 の表と同じ種類に揃えた（メール・名前・ユーザー ID・購入履歴・写真またはビデオ・その他のユーザーコンテンツ・カスタマーサポート・製品の操作、Sentry を入れたビルドだけクラッシュとパフォーマンス）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeUserID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePurchaseHistory</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeOtherUserContent</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeCustomerSupport</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeProductInteraction</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAnalytics</string></array>
    </dict>
    <!-- ↓ Sentry を入れたビルド（VITE_SENTRY_DSN）だけ残す -->
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeCrashData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePerformanceData</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><false/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
    </dict>
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

## 9. スクリーンショット（⬜）

- 必須: **6.9インチ（1320×2868）**（最低3枚、推奨5枚）。2026-10-11 に作った画像が `company/launch-2026-11/screenshots/`（`base-1〜6` が本番用・6.9 と 6.5 の両方）。生成器は `company/appstore-screenshots/index.html`。その後に変わった画面があれば撮り直す
- 推奨カット: ①相談（メモを根拠にした答え）②ホーム（いま読んでいる本・メモを書く）③振り返り（行動・思い出しカード）④写真で共有 ⑤AI 選書。
- Xcode のシミュレータ or 実機でキャプチャ。日本語UIで。

## 10. 提出（⬜）

1. Xcode → Product → Archive → Distribute App → App Store Connect → Upload。
2. App Store Connect でビルドを選択、上記メタデータ/スクショ/価格/サブスク商品を紐付け。
3. **サブスク商品もこのバージョンと一緒に「審査に追加」**（忘れると IAP が審査されない）。
4. Submit for Review。初回審査は通常 24〜48h。

---

## ⚠️ 審査で落ちやすい点（事前対策・本アプリの状態）
- ❗ **デモアカウント未提供** → プランの機能（AI 選書・読書計画シート等）が確かめられず差し戻されうる。§7 必須。
- ✅ 追加トークン（消耗型）は期限なし（3.1.1）→ 2026-10-11。**提出の前に `supabase_ai_token_credits.sql` を流し直す**（前の版の期限を null に）。
- ✅ 退会（5.1.1(v)）: Apple でサインインの人の退会は、管理者がアカウントを消すときに Apple のトークンも取り消す（§11）。
- ✅ 復元ボタン・自動更新条件・規約/プライバシー → 実装済み。
- ✅ アカウント削除（5.1.1(v)）→ 実装済み。
- ✅ 第三者の AI に送る前の同意（5.1.2(i)）→ 2026-10-01 実装済み（§6-1）。デモアカウントは同意を取り消した状態で渡す。
- △ **価格の二重表示に注意**: アプリ内の価格表記は App Store の実価格と一致させる（コードは ¥1,480 固定フォールバックだが、実際は RevenueCat のストア価格で上書きされる）。
- ✅ Review Notes の文は §7 にまとめた（無料プランの量・プラン・追加トークン・AI の同意・デモアカウント・2026-10-24）。

## 11. 退会したときの管理者の作業（Apple でサインインの人は Apple のトークンも取り消す・⬜）

アプリの「アカウント削除」は `account_deletion_requests` に行を残し、データを消す。最後に管理者が auth.users を消す（CLAUDE.md「データプライバシー」）。**Apple でサインインで作ったアカウントは、そのとき Apple のトークンも取り消す**（審査ガイドライン 5.1.1(v)・Apple の「Sign in with Apple を使うアカウントの削除」の要件）。

1. Supabase の SQL Editor で、削除リクエストの `user_id` と、その人が Apple でサインインかを確かめる:
   ```sql
   select r.user_id, r.created_at, u.email, i.provider
     from account_deletion_requests r
     join auth.users u on u.id = r.user_id
     left join auth.identities i on i.user_id = r.user_id
    where r.created_at > now() - interval '30 days'
    order by r.created_at desc;
   ```
2. `provider = 'apple'` の人は、auth.users を消す**前に** Apple のトークンを取り消す:
   - 必要なもの: Apple Developer の **Sign in with Apple の鍵（.p8）**・キー ID・Team ID・クライアント ID（iOS は Bundle ID `jp.orime.app`、Web は Service ID）
   - client_secret（ES256 の JWT・iss=Team ID・sub=クライアント ID・aud=`https://appleid.apple.com`・有効 6 か月まで）を作り、
     `POST https://appleid.apple.com/auth/revoke`（`Content-Type: application/x-www-form-urlencoded`）に `client_id`・`client_secret`・`token`（その人のリフレッシュトークン、無ければアクセストークン）・`token_type_hint`（`refresh_token` / `access_token`）を送る。200 なら取り消し済み
   - トークンは Supabase の `auth.identities` の `identity_data` や、ログインの時に受け取ったものに入っていることがある。**見つからないときは**、本人に iPhone の 設定 → Apple ID → 「Apple でサインイン」→ Orime →「Apple ID の使用を停止」を案内する（返信のメールに 1 行）
3. Supabase の Authentication → Users でその人を消す（user_id で探す・メールでは探さない）
4. `account_deletion_requests` の行に済みの印（メモ）を残す

> サーバーの関数にする（鍵を Vercel に入れて、管理者の操作で revoke を呼ぶ）のは、Apple でサインインの退会が増えてからでよい。

## 12. 🔔 iPhone の通知（ローンチ前の必須・2026-10-21 に「宿題」から上げた）

**なぜ必須か**：思い出しの通知（週 1 まで）と行動の期限の通知（期限の日の朝）は、アプリを閉じた人が 2 日目・7 日目・30 日目に戻ってくる唯一の外からのきっかけ。これが無いと「30 日後も使う 25%」（`docs/launch-kpis.md` ③）は、本人が思い出して開くのを待つだけになる。コードは全部ある（`src/lib/nativePush.js`・`api/push-cron.js`・`supabase_push_native.sql`）。足りないのは Apple 側の鍵と設定だけ。

| # | やること（Mac・約 1 時間） | 確かめ方 |
|---|---|---|
| 1 | Apple Developer → Keys → **APNs 用のキー（.p8）** を 1 つ作る（Key ID・Team ID を控える） | .p8 は 1 回しか落とせないので安全な場所に |
| 2 | App ID `jp.orime.app` の Capability に **Push Notifications** を足す | — |
| 3 | Vercel の環境変数 `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_PRIVATE_KEY`（.p8 の全文）/ `APNS_BUNDLE_ID=jp.orime.app` / `APNS_PRODUCTION=true`（TestFlight は `false`） | `CRON_SECRET` も入っていること |
| 4 | Supabase で `supabase_push_native.sql`（`supabase_all_in_order.sql` に入っている） | `push_subscriptions` に `platform` 列 |
| 5 | Mac で `npm install && npx cap sync ios`（プラグインは package.json に入っている）、Xcode の Signing & Capabilities に **Push Notifications** と **Background Modes → Remote notifications** | ビルドが通る |
| 6 | **`VITE_NATIVE_PUSH=on` で 1.0 のビルド** | iPhone の設定に「通知」のスイッチが出る |
| 7 | TestFlight で 通知をオン → 行動に今日が期限のものを 1 つ作る → 翌朝 8 時台に届く | `vercel.json` の Cron が毎日動いている |

間に合わないときは、1.0 は `VITE_NATIVE_PUSH` 無しで出し（スイッチは隠れる・審査は通る）、**1.0.1 を公開から 2 週間以内**に出す。

## 宿題（ローンチ後でよい）
- （2026-10-24）RevenueCat → subscriptions の webhook は実装済み。残りなし。
