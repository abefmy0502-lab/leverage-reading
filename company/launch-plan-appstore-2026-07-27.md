# 🚀 Orime App Store 正式リリース計画 — 2026-07-27（月）

> ⚠️ 2026-10-05: マーケ・営業・ローンチの方針と数字は **`company/marketing-strategy-2026-11.md` が正**。この文書は前提（公開日・価格・主役・無料プラン）が古い。投稿文・記事などの素材は使ってよい。

> 起草 2026-07-12。**これが 7/27 リリースの単一の真実**（App Store ネイティブ配信・IAP課金）。
> 旧 `launch-readiness-runbook.md` は Web(Stripe) 先行前提だったため、本書が優先する。
> SNS実行は `sns-sales-plan-july.md`＋`launch-thread-and-content-july.md`、ASO文面は `aso-store-listing.md`、素材は `assets-checklist-appstore.md` を参照。

---

## 0. 結論（最初に読む）

- **勝負は「7/20〜22 に審査提出できるか」の一点**。App Store 審査は通常 24〜48h だが、サブスク＋AI アプリは 2〜5 日＋リジェクト1回を見込む。7/22（水）までに提出できれば 7/27 は現実的。**7/23 以降の提出は 7/27 を落とす前提で動く**。
- コード側は驚くほど揃っている：IAP(RevenueCat)クライアント・webhook・ペイウォール・APNs送信・計測・管理ダッシュボードすべて実装済み。**未着手なのは「Apple側の手続きと実機ビルド」だけ**であり、これは全て元帥（あなた）のMac/Apple ID でしか進められない。
- したがって**最優先タスクはただ一つ：今日 Apple Developer Program に登録する**（承認に24〜48h、本人確認で数日かかる事例あり。これが遅れると全てが遅れる）。
- Plan B を先に決めておく：**リジェクト2回で 7/27 に間に合わない場合、リリース日を 8/3（月）に順延**し、SNS予告は「7月末」表現で逃げる（具体日を予告に書かない）。

### クリティカルパス（これ以外は全部並行作業）

```
D0 Apple Developer登録 → D2 ASCアプリ作成+ios/生成+初ビルド → D4 IAP商品+RevenueCat疎通
→ D6 TestFlightでサンドボックス課金テスト → D7 スクショ+メタデータ投入 → D8〜10 審査提出
→ 審査(1〜5日+リジェクト対応) → D15 7/27 手動リリース+告知一斉実行
```

---

## 1. 📅 日次カレンダー（D0=7/12 → D15=7/27）

凡例：👤=元帥（あなたにしかできない）／🤖=Claude（リポジトリ内で実施可）／🔴=クリティカルパス／🟡=重要／🟢=並行可

### D0 7/12（日）今日
- 🔴👤 **Apple Developer Program 登録**（個人・年間 ¥12,980・developer.apple.com。Apple ID の2FA有効化＋クレカ。D-U-N-S は個人なら不要）
- 🔴👤 **RevenueCat アカウント作成**（無料枠で開始・app.revenuecat.com）
- 🟡👤 Mac 環境確認：Xcode 最新版インストール開始（数GB・時間がかかるので今夜仕掛ける）
- 🤖 本計画・素材リスト・監査修正一式をリポジトリに反映（本日実施済み）

### D1 7/13（月）
- 🔴👤 Xcode セットアップ完了 → リポジトリ clone → `npm install && npm run build && npx cap add ios && npx cap sync ios && npx cap open ios`
- 🔴👤 Xcode で Signing & Capabilities：Team 選択（登録承認待ちなら Personal Team で先にビルドだけ）→ シミュレータで起動確認
- 🟡👤 実データ準備開始：自分のアカウントに「見栄えの良い本棚」を作る（スクショ素材。assets-checklist 参照：実書影 8〜12冊・メモ・行動・テーマまとめ）
- 🟢🤖 LP の App Store 対応差分・審査リスク修正の残り

### D2 7/14（火）
- 🔴👤 （Developer 承認済み前提）**App Store Connect でアプリ作成**：名前「Orime」/ Bundle ID `com.leveragereading.app` / SKU `orime-ios`
- 🔴👤 Xcode：Push Notifications capability + Background Modes(Remote notifications) を追加、実機ビルドで全機能スモーク（ログイン→本追加→メモ→想起→AI選書）
- 🟡👤 APNs 認証キー(.p8) を Developer Portal で発行 → Vercel に `APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID` 設定（`APNS_PRODUCTION` は TestFlight 中 false）

### D3 7/15（水）
- 🔴👤 **ASC でサブスクリプション商品を作成**：
  - サブスクリプショングループ「Orime プレミアム」
  - `orime_monthly` 月額 ¥1,480 ＋ **無料トライアル7日**（Introductory Offer）
  - `orime_annual` 年額 ¥12,800 ＋ 無料トライアル7日
  - 各商品にローカライズ表示名・説明・**審査用スクショ**（ペイウォール画面のスクショでよい）
- 🔴👤 **RevenueCat 設定**：iOS アプリ登録（Bundle ID）→ ASC の App-Specific Shared Secret / In-App Purchase Key 連携 → Entitlement `premium` → Offering `default` に monthly/annual パッケージ → **Public SDK Key を Vercel `VITE_REVENUECAT_IOS_KEY` に設定**
- 🔴👤 RevenueCat Webhook：URL `https://<本番ドメイン>/api/revenuecat-webhook`・Authorization ヘッダー値を `REVENUECAT_WEBHOOK_AUTH` として Vercel に設定
- 🟡👤 Supabase SQL 未適用分の一括適用（`launch-readiness-runbook.md` §2 の順で。特に 🔴`supabase_subscriptions.sql`→`supabase_subscriptions_provider.sql`→`supabase_revenuecat_events.sql`、最後に `supabase_security_hardening.sql`、検証 `supabase_verify_rls.sql`）

### D4 7/16（木）
- 🔴👤 **TestFlight 内部テスト配信**（Archive → Distribute → TestFlight。輸出コンプライアンス：標準暗号化のみ＝「はい/免除」）
- 🔴👤 **サンドボックス課金の疎通テスト**：Sandbox Apple ID で購入 → ペイウォール解除を確認（クライアントは RC SDK 直読で解除される）。⚠️ サーバー AI ゲートは sandbox イベントを既定スキップ（`RC_ALLOW_SANDBOX` 未設定時）なので、**AI 機能まで通すなら審査期間中だけ `RC_ALLOW_SANDBOX=true` を設定**（リリース後に外す）
- 🟡👤 家族・友人 3〜5 名を TestFlight 外部テスターに招待（実機での初見フィードバック＋ローンチ日の初期レビュー要員）

### D5 7/17（金）
- 🔴👤 **スクリーンショット撮影**（assets-checklist 参照。iPhone 16 Pro Max シミュレータ 1320×2868・6枚）
- 🔴👤 ASC メタデータ投入：`aso-store-listing.md` の最終版をコピペ（名前30字/サブタイトル30字/キーワード100字/説明文/プロモテキスト170字）
- 🟡👤 App Privacy（プライバシー質問票）回答（本書 §3.4 の回答表どおり）
- 🟡👤 審査用デモアカウント作成＋データ投入＋subscriptions 手動 active 化（§3.5 の SQL）

### D6 7/18（土）
- 🔴👤 TestFlight ビルドでの最終バグ確認（テスター報告の triage。クラッシュ・課金・プッシュ許諾）
- 🟡🤖 テスター報告のバグ修正（リポジトリ側は Claude が即日対応）
- 🟢👤 note 記事1本目公開（`note/editorial-calendar.md` の予告記事。「7月末リリース」表現）

### D7 7/19（日）
- 🔴👤 修正ビルドを再アップロード → 最終スモーク
- 🟡👤 X で開発ストーリー投稿開始（`launch-thread-and-content-july.md` の予告フェーズ）

### D8 7/20（月・祝）🎯 提出目標日
- 🔴👤 **App Store 審査提出**：バージョン 1.0.0 / 「承認後に手動でリリース」を必ず選択 / 審査メモ＋デモアカウント記入（§3.5）/ IAP 商品も同時提出
- 🟢👤 提出後は待つだけ。SNS 予告投稿を継続

### D9〜D10 7/21（火）〜7/22（水）⛔ 提出デッドライン
- 🔴 **まだ提出できていなければ、あらゆる🟡🟢を止めて提出を最優先**
- 🟡 リジェクト到着時：24h 以内に修正→再提出（🤖 コード起因は Claude が即応。文言・メタデータ起因は👤）
- 🟢👤 PR 準備：`press-release.md` を PR TIMES 下書きに（配信予約 7/27 朝 10:00）※無料も可：自社 note + X で代替

### D11〜D14 7/23（木）〜7/26（日）審査バッファ＋マーケ仕上げ
- 🟡👤 承認が来たら：**リリースはまだ押さない**（手動リリース待機）。App Store URL が確定するので → Vercel `VITE_APP_STORE_URL` に実 URL 設定 → LP の CTA が自動で「App Store で入手」に切替わる（実装済み）
- 🤖 LP へ Smart App Banner（`apple-itunes-app` meta）追加・OGP 確認
- 🟡👤 note 記事2本目（機能深掘り）公開・X予告「7/27(月) リリース」を明言（承認後のみ）
- 🟡👤 初期レビュー要員（TestFlight テスター・友人）に「7/27 に DL して正直なレビューを書いてほしい」と依頼（謝礼・見返りは規約違反なので**依頼は「正直な感想」のみ**）
- 🟢👤 Apple Search Ads アカウント開設（配信はまだ・§6）

### D15 7/27（月）🚀 リリース日
- 08:00 👤 ASC で「このバージョンをリリース」ボタン → ストア反映（〜2h）
- 09:00 👤 DL・課金・プッシュの本番動作を自分の実機で最終確認（`APNS_PRODUCTION=true` に切替、`RC_ALLOW_SANDBOX` を外す）
- 10:00 👤 一斉告知：X ローンチスレッド（`launch-thread-and-content-july.md` 当日分）→ note 本編記事 → PR 配信 → 知人への個別連絡（sales-playbook の初動リスト）
- 終日 👤 30分おきにエゴサ・リプ全返し・レビュー返信・管制塔（管理ダッシュボード）でファネル監視
- 🤖 障害・バグ報告への即応待機

---

## 2. 🗂 ワークストリーム別の要求品質（Definition of Done）

| # | ストリーム | 成果物 | 品質バー | 期限 |
|---|---|---|---|---|
| P0-1 | 提出プロダクト | 審査を通る TestFlight ビルド | クラッシュ0・課金疎通・全タブ動作・オフライン時に白画面にならない | 7/19 |
| P0-2 | IAP | ASC 商品2種＋RC 連携＋webhook | サンドボックス購入→subscriptions active→AI が使える、まで一気通貫 | 7/16 |
| P0-3 | ASO | メタデータ＋スクショ6枚 | サブタイトル・キーワード100字を使い切る／スクショ1〜3枚目だけで価値が伝わる（§4） | 7/19 |
| P0-4 | 審査対策 | デモアカウント＋審査メモ | 審査員がログイン→本追加→AI→課金確認まで詰まらない | 7/19 |
| P1-1 | LP/SEO | App Store 導線切替 | 実URL反映・Smart Banner・OGP・LCP<2.5s | 7/26 |
| P1-2 | SNS | 予告→当日→翌週の投稿群 | `launch-thread-and-content-july.md` 通り。**「話題の本」機能への言及を全除去済みであること** | 7/27 |
| P1-3 | PR | プレスリリース1本 | `press-release.md` ベース・スクショ3点添付・配信 7/27 10:00 | 7/22 |
| P1-4 | レビュー | 初週レビュー10件 | 実利用者の正直な感想のみ（インセンティブ禁止）・全件に返信 | 8/3 |
| P1-5 | 計測/KPI | ファネル可視化 | 管制塔＋RevenueCat＋ASC Analytics の3点で §5 の KPI が読める | 7/27 |
| P2-1 | 広告 | Apple Search Ads | §6 のゲート条件を満たすまで**配信しない**（口座と管理画面の準備のみ） | 8月 |
| P2-2 | 動画 | App Preview（15〜30秒） | v1.1 で追加（初回提出はスクショのみで出す＝律速にしない） | 8月 |
| P2-3 | レビュー促進 | アプリ内レビュー依頼（SKStoreReviewController） | 読了1冊 or 想起3回目の直後に表示・年3回上限を尊重 | v1.1 |

---

## 3. 📱 提出プロダクト詳細（P0）

### 3.1 ビルド手順（元帥の Mac で）
```bash
git clone <repo> && cd leverage-reading
npm install
npm run build          # dist/ 生成（Capacitor は dist をバンドルする）
npx cap add ios        # ios/ を初生成（初回のみ）
npx cap sync ios       # 以後 JS を変えるたびに build→sync
npx cap open ios       # Xcode が開く
```
Xcode 側の一度きり設定：
1. TARGETS > Orime > Signing & Capabilities → Team 選択・Automatically manage signing
2. **+ Capability → Push Notifications**、**+ Capability → Background Modes → Remote notifications** にチェック
3. General → Deployment Info → **iPhone のみにチェック**（iPad を外す＝iPad スクショ不要・QA 範囲半減。iPad ユーザーは互換モードで利用可）
4. App Icons：`public/icons/icon-1024-appstore.png`（アルファ除去済み・本日生成）を AppIcon にセット
5. Info.plist：カメラ（バーコードスキャン）と写真ライブラリの利用目的文言が入っているか確認 —
   `NSCameraUsageDescription`＝「本のバーコードを読み取るときと、写真に読書の記録を重ねて共有するときに使用します」（2026-09-30: 写真で共有＝ホームのカメラ）
   `NSPhotoLibraryUsageDescription`＝「読書メモに写真を添付するときと、写真に読書の記録を重ねて共有するときに使用します」
   （画像を写真に保存するなら `NSPhotoLibraryAddUsageDescription`＝「共有用の画像を写真に保存するために使用します」も。iOS の共有シートの「画像を保存」で使われる）
   （**未設定だと該当機能に触れた瞬間クラッシュ＝2.1 リジェクト**）

### 3.2 バージョニング
- Marketing Version `1.0.0` / Build `1`。再アップロードのたびに Build を +1（1.0.0(2), (3)…）。

### 3.3 環境変数（Vercel・App 用の増分のみ）
| 変数 | 値 | いつ |
|---|---|---|
| `VITE_REVENUECAT_IOS_KEY` | RC の Public SDK Key (appl_...) | D3 |
| `REVENUECAT_WEBHOOK_AUTH` | RC Webhook 設定と同じ任意トークン | D3 |
| `APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID` | .p8 一式 | D2 |
| `APNS_PRODUCTION` | TestFlight 中 `false` → **リリース日に `true`** | D15 |
| `RC_ALLOW_SANDBOX` | **審査期間中のみ `true`** → リリース日に削除 | D4→D15 |
| `VITE_APP_STORE_URL` | 承認後に確定する実 URL | D11〜14 |
⚠️ `VITE_*` はビルド時埋め込み。**Vercel に設定するだけでなく、設定後に `npm run build && npx cap sync ios` でアプリを作り直すこと**（アプリ側の VITE 変数はローカルの `.env.production` にも同値を置く）。

### 3.4 App Privacy（プライバシー質問票の回答）
| ASC の質問 | 回答 | 紐付け |
|---|---|---|
| 連絡先情報 > メールアドレス | 収集する・アカウント機能・ユーザーに紐付く・トラッキングに不使用 | Supabase Auth |
| ユーザーコンテンツ > その他（メモ・写真） | 収集する・アプリ機能・紐付く・不使用 | book_memos / photos |
| 識別子 > ユーザーID | 収集する・アプリ機能・紐付く・不使用 | user_id |
| 購入 > 購入履歴 | 収集する・アプリ機能・紐付く・不使用 | subscriptions |
| 使用状況データ > 製品の操作 | 収集する・分析・紐付く・不使用 | analytics_events（自前・第三者送信なし） |
| 診断 > クラッシュデータ | 収集する・アプリ機能・紐付かない | Sentry |
- **トラッキング（ATT）は「なし」**：外部広告 SDK・クロスサイト計測ゼロ。ATT ダイアログ不要。

### 3.5 審査用デモアカウント＋審査メモ
1. `review@`（または捨てアドレス）で通常サインアップ → メール確認
2. データ投入：本5冊（読書中2・読了2・積読1）・カード式メモ10件・行動5件（完了2）・テーマまとめ1回生成
3. **subscriptions を手動 active 化**（Supabase SQL Editor・service_role）：
```sql
insert into subscriptions (user_id, status, provider, price_id, current_period_end)
select id, 'active', 'manual', 'review-comp', now() + interval '60 days'
from auth.users where email = '<デモアカウントのメール>'
on conflict (user_id) do update set status='active', current_period_end=now()+interval '60 days';
```
4. ASC の審査メモ（英語推奨・要旨）：
> Demo account: <email> / <password> (already subscribed for your convenience).
> Orime is a reading-notes app with AI features (book recommendation Q&A, notes-grounded chat). AI responses are generated server-side via Anthropic Claude; user notes are treated as data, not instructions. Subscriptions: monthly ¥1,480 / annual ¥12,800, both with 7-day free trial, managed via App Store IAP (RevenueCat). Account deletion is available in-app: Settings → アカウント削除.
> Barcode scanning uses the camera to add books by ISBN. Push notifications are opt-in reminders of the user's own notes (spaced repetition).

### 3.6 既知の審査リスクと対処（監査結果は §9 で更新）
- 🔴 アイコンのアルファチャンネル → **対処済み**（`icon-1024-appstore.png` 生成・D1 で Xcode にセット）
- 🟡 サンドボックス課金でサーバー AI ゲートが 403 → `RC_ALLOW_SANDBOX=true`＋デモアカウントの手動 active で二重に回避
- 🟡 外部課金（Stripe）文言のネイティブ露出 → 7/4 に一本化済みだが、監査エージェントの結果で最終確認（§9）
- 🟡 AI 月次上限（120回）が審査員を止める可能性 → デモアカウントは実質使い切らない想定。心配なら審査期間中 `AI_MONTHLY_CALL_LIMIT=1000` に一時増枠

---

## 4. 🎨 ASO・スクリーンショット（P0）

文面の正典は `aso-store-listing.md`（⚠️ 本日削除した「話題の本を探す」への言及が残っていれば除去する — §9 監査反映）。

### スクショ設計（6枚・順序とコピーの正典は `aso-store-listing.md` §8）
> 撮影仕様・撮り方の詳細は `assets-checklist-appstore.md`。生成器 `appstore-screenshots/index.html`（6.9インチ 1320×2868 対応済み）と 1:1 同期済み。**1〜3枚目で「何のアプリで・何が変わるか」が伝わらなければ作り直し**が品質バー。

1. **マイ読書脳**（「あの本、なんて言ってた？」に自分のメモが答える）— 最大の差別化
2. **想起カード**（忘れた頃に、ふいに戻ってくる）
3. **メモ**（心が動いた一行を、残すだけ）
4. **AI選書**（いまの課題に合う本を、AIが選ぶ）
5. **行動リスト＋料金**（学びは行動に変わる／7日間無料・月¥1,480／年¥12,800）
6. **本棚**（読んだ本が、あなたの中に残る）

### 検索キーワード方針（100字を使い切る）
- 軸：読書管理 / 読書記録 / 読書メモ / 読書ノート / 積読 / 読書習慣 / 本棚アプリ / 記憶定着 / 間隔反復 / AI選書
- 「話題の本」「新刊」系キーワードは機能撤去に伴い**使わない**（審査で機能不一致を突かれる）

---

## 5. 📊 分析基盤・KPI（P1）

### 計測の3点セット（全て準備済み or 設定のみ）
1. **自前ファネル**（analytics_events → 管制塔）：`signup → activation(本1冊+メモ1件) → paywall_viewed → 課金`。ネイティブでも Supabase 直書きで動く
2. **RevenueCat ダッシュボード**：トライアル開始数・転換率・MRR・チャーン（課金の真実）
3. **ASC App Analytics**：インプレッション→プロダクトページ閲覧→DL の ASO ファネル

### Week1 KPI（7/27〜8/2）— 管制塔＋営業タブに週次入力
| 指標 | 目標 | 赤信号（if-then は playbook.js） |
|---|---|---|
| DL 数 | 150（オーガニック+PR） | <50 → 告知チャネル追加（個人開発系メディア・Podcast 出演打診） |
| トライアル開始 | 20 | <10 → ペイウォール到達率を管制塔で確認（LP/オンボの離脱位置特定） |
| アクティベーション率（本1冊+メモ1件/登録） | 40% | <25% → オンボーディング改修を最優先 |
| D1 継続率 | 35% | <25% → 初日 aha（想起の予告）の見せ方を改修 |
| クラッシュフリー率（Sentry） | 99.5% | <99% → 全作業停止でバグ修正 |
| 有料転換（8/3 以降に判明） | トライアル→有料 40% | <25% → トライアル中の価値実感導線（7日で想起1回転）を設計 |

### 北極星
**有料課金者数**（`kgi-roadmap.md`：2026年12月 100人 → 2027年12月 1,000人）。日次で追うのは「トライアル開始数」（先行指標）。

---

## 6. 💰 広告（P2 — ゲート付きで待機）

**原則：オーガニックでアクティベーション率 40%・トライアル転換が見えるまで 1 円も使わない**（穴の空いたバケツに水を注がない）。
- 準備だけ D11〜14 に：Apple Search Ads アカウント開設・支払い設定
- 開始条件（全て満たしたら）：①Week1 の DL≥100 ②アクティベーション≥35% ③致命バグ0
- 開始構成：Search Ads **完全一致のみ**「読書管理」「読書記録」「読書メモ アプリ」「読書 習慣」・日予算 ¥1,000・**CPI ¥500 超が3日続いたら停止**
- Meta/X 広告は9月以降（クリエイティブ資産=スクショ/動画の使い回しができてから）

---

## 7. 🤝 営業・PR・レビュー獲得（P1）

- **営業**（個人向けプロダクトの「営業」= 手売り初動）：`sales-playbook-owner.md` の初動リスト（知人・読書コミュニティ・X の読書クラスタ）に**個別メッセージで7/27に依頼**。テンプレは playbook 内。目標：初日 DL 30 件は手売りで作る
- **PR**：`press-release.md` を配信。PR TIMES（¥33,000/回）or 無料代替（自社 note ＋ X ＋ 個人開発メディア（例：個人開発の集い系・ProductHunt 日本タグ）への持ち込み）。**個人開発ストーリー（なぜ作ったか）が最強のフック**なので note 記事をプレス代わりに使うのが費用対効果最良
- **レビュー**：
  - 初週 10 件目標。TestFlight テスター＋初動リストに「正直な感想のレビュー」を依頼（**見返り提供は規約 5.6.4 違反・アカウント BAN リスクなので絶対にしない**）
  - ASC で全レビューに 24h 以内返信（低評価ほど丁寧に。返信は検索者も読む）
  - v1.1 でアプリ内レビュー依頼（読了 or 想起3回目の直後・SKStoreReviewController）

---

## 8. 🌐 LP・SEO（P1）

- LP は実装・最適化済み。残タスク：
  - 👤 承認後 `VITE_APP_STORE_URL` 設定（CTA が自動切替）
  - 🤖 Smart App Banner（`<meta name="apple-itunes-app" content="app-id=XXXX">`）— App ID 確定後に追加
  - 🤖 OGP 画像の最終確認（1200×630 済み）
- SEO：`seo-articles-batch1.md` の記事を note で公開（`note/editorial-calendar.md` の日程通り D6・D12・D15+）。ドメイン独自ブログは Phase 2（まず note でインデックスと流入実績を作る）
- App Store URL 確定後、note 記事・LP・X プロフィールの導線を全て App Store に向ける

---

## 9. 🛠 リポジトリ側の実施記録（Claude 担当・随時更新）

- [x] 2026-07-12: 「話題の本を探す」機能の完全撤去（品質が差別化にならないため機能ごとクローズ）
- [x] 2026-07-12: App Store 用アイコン `public/icons/icon-1024-appstore.png` 生成（アルファ除去 — 透過付きアイコンはリジェクト対象）
- [x] 2026-07-12: 本計画書・素材チェックリスト作成
- [x] 2026-07-12: LP から削除済み機能「話題の本の棚」の宣伝文を除去（Landing.jsx）
- [x] 2026-07-12: スクショ生成器を Apple 必須の 6.9 インチ（1320×2868）に更新＋スライド構成を aso-store-listing §8 と 1:1 同期（1枚目=マイ読書脳）
- [x] 2026-07-12: aso-store-listing.md に 7日間無料トライアル訴求を全箇所反映＋正典宣言
- [x] 2026-07-12: マイ読書脳に AI 免責注記を追加（審査ガイドライン AI 対応）
- [x] 2026-07-12: 審査リスク監査完了 — 3.1.1（外部課金誘導）は isNative 分岐で完全封鎖済みを確認 🟢／3.1.2 必須表示 🟢／5.1.1 アカウント削除 🟢／プッシュ pre-permission 🟢。**唯一のブロッカー=サンドボックス課金で AI 402** は運用対処（§3.3 の RC_ALLOW_SANDBOX + §3.5 のデモアカウント手動 active）で二重化
- [x] 2026-07-12: マーケ文書群の価格（→¥1,480/¥12,800）・トライアル（→7日）・チャネル（→App一本）・日付（→7/27）一括是正
- [ ] 恒久対策: api/claude.js の entitlement 判定に RevenueCat REST フォールバック追加（v1.1・クライアントとサーバーの判定非対称の根治）
- [ ] Smart App Banner 追加（App ID 確定後）
- [ ] v1.1: アプリ内レビュー依頼・App Preview 動画

---

## 10. ⚠️ リスク登記簿

| リスク | 確率 | 影響 | 対処 |
|---|---|---|---|
| Apple Developer 登録の本人確認遅延 | 中 | 全遅延 | **今日申請**。3日経って未承認ならサポートに電話 |
| 審査リジェクト（1回目） | 高（初回提出の常） | 1〜3日 | 24h 以内修正・再提出。コード起因は Claude 即応 |
| リジェクト2回以上 | 中 | 7/27 を逸す | **Plan B: 8/3 に順延**。SNS 予告は承認まで具体日を出さない |
| サンドボックス課金で審査員が AI に触れない | 中 | 2.1 リジェクト | デモアカウント手動 active ＋ RC_ALLOW_SANDBOX=true の二重化（§3.5） |
| 初週 DL が伸びない | 中 | 士気・KPI | 手売り30件で底を作る＋個人開発ストーリー note が2本目の波 |
| 実機で未知のネイティブバグ（キーボード・セーフエリア等） | 中 | 数日 | D2 に前倒しで実機スモーク・Claude が即日修正 |
| 元帥の可処分時間不足（手続き系が全部👤） | 高 | 全体 | 本計画の👤タスクは1日90分想定で組んである。D0〜D5 だけは死守 |

---

## 11. 📋 運用体制（リリース後の定常運転）

- **毎朝15分**：管制塔（⚙️→運営）で「今日の一手」＋ファネル確認 → 営業タブに週次 KPI（月曜）
- **毎日**：ASC レビュー返信・X エゴサ・Sentry クラッシュ確認（各10分）
- **週1**：feedback テーブルの triage（`CLAUDE.md` 運用節の SQL）・note 記事1本（editorial-calendar）
- **隔週**：v1.x リリース列車（レビュー依頼・App Preview 動画・改善バックログ消化）。**新機能は9月まで凍結**（事業レビューの結論：作るより売る）
