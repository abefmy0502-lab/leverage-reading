# 📱 iOS 再合流プラン（Web先行ローンチ後のiOS版・両チャネル化）

> CEO起草 2026-06-22。元帥決定：Web版（¥1,280・現main）を正としてローンチ済。**iOS版も並行で進める**。本書は、保全した `main-ios-snapshot-20260620`（旧iOS線）から**iOS土台だけを現mainへ安全に再合流**する手順。会社の真実は `company/board.md`。

## 0. 結論ファースト
- iOS土台は**消えていない**：`main-ios-snapshot-20260620`（commit `8717a0c`、iOS commit `145e6ce`）に保全済み。
- 現main（Web線）は**IAPバックエンドを既に保有**：`api/revenuecat-webhook.js`（entitlement同期）＋`supabase_subscriptions_provider.sql`（provider/store列）＋`useSubscription`（`status==='active'`でIAPも判定可）。
- だから残りは**フロントのCapacitor土台＋RevenueCat SDK配線＋ネイティブビルド/審査**。
- ⚠️ 旧iOS commitは**¥990への変更を同梱**している。再合流では**価格は触らない**（Web ¥1,280 / App ¥1,480 を維持）。価格関連の差分は取り込まない。

## 1. 現mainに「既にある」もの（再利用）
| 資産 | 状態 |
|---|---|
| `api/revenuecat-webhook.js` | ✅ IAP課金→`subscriptions`同期（timingSafeEqual認証・UUID検証済・冪等upsert） |
| `supabase_subscriptions_provider.sql` | ✅ `provider`/`rc_app_user_id`/`store`列（Stripe/IAP併存） |
| `src/hooks/useSubscription.js` | ✅ `status==='active'`判定＝IAPでもそのまま使える |
| `package.json` deps | ✅ `web-push`/`stripe`追加済（前デプロイブロッカー解消） |

## 2. snapshotから「持ってくる」iOS土台（価格変更は除外）
`main-ios-snapshot-20260620` の `145e6ce` から、以下**だけ**を現main上に再導入（¥990差分は取り込まない）：
- [ ] `capacitor.config.json`（appId `com.leveragereading.app`・webDir `dist`・iOS contentInset/Keyboard/SplashScreen）。**appName等は要ブランド確認（Orime表記）**。
- [ ] `src/lib/native.js`（Capacitor検出・ネイティブ初期化のユーティリティ・44行）
- [ ] `src/main.jsx` のネイティブ初期化呼び出し（5行）— 現mainのmain.jsxへマージ
- [ ] `src/hooks/useHaptic.js` のネイティブ・ハプティクス分岐（現main版と差分マージ。Web挙動は壊さない）
- [ ] `@capacitor/*` 依存（core/cli/ios/app/haptics/keyboard/splash-screen/status-bar）→ `package.json`＋lockへ（`npm install`で同期）
- [ ] `.gitignore` のiOSビルド成果物（`ios/App/Pods` 等）
- [ ] `IOS_APP_GUIDE.md`（ビルド/署名/審査の手順書）
> 取り込み方法：`git show 145e6ce -- <path>` で該当ファイルだけ取り出すか、`git checkout main-ios-snapshot-20260620 -- <path>` で個別チェックアウト→価格を¥1,280/¥1,480に保ったまま調整。**ファイル単位の選択取り込み**で、¥990混入を防ぐ。

## 3. 新規に「作る」もの（IAP配線）
- [ ] **RevenueCat SDK**（`@revenuecat/purchases-capacitor`）を導入し、ネイティブ時の課金フローを実装。
- [ ] `src/lib/billing.js`：`Capacitor.isNativePlatform()` で分岐——native=RevenueCatの購入シート / Web=現状のStripe Checkout（既にコメントで想定済み）。
- [ ] 購入前に `Purchases.logIn(user.id)` で `app_user_id = Supabase user.id` を揃える（webhookのUUID検証前提）。
- [ ] `Paywall`：ネイティブ時はApp価格（¥1,480/¥12,800）ラベル＋App Store課金、Web時は現状維持。**Apple 3.1.2必須開示**（自動更新の条件）をネイティブPaywallに明記。
- [ ] 反ステアリング順守：**「Webが安い」訴求はアプリ内に出さない**（board §8）。

## 4. 価格（確定・iOSチャネル）
- **App（IAP）＝ 月¥1,480／年¥12,800**（RevenueCat Products＋App Store Connectで商品登録）。
- 実価格はストア商品設定が真実（コード非依存）。手数料15%（Small Business Program）が黒字化前提。

## 5. ⚠️ 要・元帥/環境作業（コード外）
- [ ] **Apple Developer Program**（申込済・アクティベート確認）／App Store Connectで税・口座・**Small Business Program(15%)申請**。
- [ ] **RevenueCatアカウント**＋App Store連携＋商品（¥1,480/¥12,800）＋Webhook（`/api/revenuecat-webhook`・`REVENUECAT_WEBHOOK_AUTH`強固な値）。
- [ ] **ネイティブビルド環境**（Mac＋Xcode）＝この実行環境では不可。実機/Xcodeが要る工程（`npx cap add ios` / `cap sync` / 署名 / TestFlight / 審査提出）はオーナー環境で。
- [ ] アイコン・スプラッシュ・App名（**Orime**）・スクショ（`company/aso-store-listing.md`に素材あり）。

## 6. 推奨順序
1. **Web版を実販売軌道に乗せる**（env/Stripe/SQL＝`launch-readiness-runbook.md`）。← 最優先・収益直結
2. 落ち着いたら本書§2-3で**Capacitor土台＋RevenueCat配線**を現mainへ実装（私が担当可・ビルド検証まで）。
3. オーナー環境で**ネイティブビルド→TestFlight→審査提出**（§5）。
4. 両チャネル（Web=Stripe / iOS=IAP）が `subscriptions` で統一entitlement管理。

> 本書があれば、iOS再開は「価格を壊さずファイル単位で土台を戻す→IAP配線→ストア」の一直線。土台は永久保全済みなので、いつでも着手できる。
