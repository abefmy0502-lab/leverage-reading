# 📱 Orime iOS アプリ ビルド & 申請ガイド（Mac作業用）

> 更新 2026-06-22。Web版（Stripe・¥1,280）はコード完成・別途デプロイ。本書は **iOS版（App内課金 / IAP・¥1,480）** を Mac でビルドして App Store 審査に出すための手順。コード側（Capacitor土台 + RevenueCat配線）は本リポジトリに実装済み。**この環境（クラウド）ではネイティブビルドができないため、ここから先は Mac + Xcode が必要**。

## 0. 前提（価格・チャネル）

- **iOS（IAP）= 月¥1,480 / 年¥12,800**（App Store Connect + RevenueCat で商品登録。コードに価格は焼かない）
- Web（Stripe）= 月¥1,280 / 年¥10,800（別チャネル。アプリ内で「Webが安い」とは**書かない＝Apple反ステアリング順守**）
- 課金の真実 = `subscriptions` テーブル（`status='active'`）。Stripe / RevenueCat 両方が同じテーブルに書く統一entitlement
- 手数料 15%（Small Business Program）が黒字化前提 → **必ず申請**

## 1. 必要なもの（オーナー手配）

- [ ] **Apple Developer Program**（年¥12,980・有効化済みであること）
- [ ] **Mac + Xcode**（最新安定版）
- [ ] **App Store Connect**：税・銀行口座・**Small Business Program(15%)申請**
- [ ] **RevenueCat アカウント**（無料枠で可）+ App Store 連携
- [ ] アプリアイコンは **`public/icons/icon-1024.png`**（確定ロゴ案A）を Xcode の AppIcon に設定。スプラッシュ/スクショ文言・構成は `company/aso-store-listing.md`

## 2. ローカルで iOS プロジェクトを生成（Mac）

```bash
npm install                 # 依存取得（@capacitor/* は package.json に同梱済み）
npm run build               # dist/ を生成（Capacitor が webDir として使う）
npx cap add ios             # ios/ を生成（初回のみ）
npx cap sync ios            # dist + プラグインを iOS へ同期（毎回ビルド前に）
npx cap open ios            # Xcode が開く
```

- `capacitor.config.json`：appId `jp.orime.app` / appName **Orime** / webDir `dist`
- Xcode で **Signing & Capabilities** → Team を選択、Bundle ID を `jp.orime.app` に一致
- **In-App Purchase** capability を追加

## 3. RevenueCat 設定

1. RevenueCat → Project → **Apps** に iOS アプリ（Bundle ID 一致）を追加。**Public SDK Key (apple)** を控える
2. **Products**：App Store Connect で作る商品 ID を登録
   - 月額: `orime_monthly`（¥1,480 / 自動更新 / 無料トライアルなし）
   - 年額: `orime_annual`（¥12,800 / 自動更新 / 無料トライアルなし）
3. **Entitlement**：`pro` を作り、上記2商品を紐付け
4. **Offering**：`default` に monthly / annual パッケージを登録
5. **Webhook**：URL `https://<本番ドメイン>/api/revenuecat-webhook`、Authorization ヘッダに `REVENUECAT_WEBHOOK_AUTH` と同じ強固な値（Vercel env と一致させる）
6. アプリの env（Vercel / `.env`）：`VITE_REVENUECAT_IOS_KEY=appl_xxx`（Public SDK Key。クライアント露出OKな公開鍵）

> コードは `src/lib/iap.js` がこの公開鍵で `Purchases.configure` し、購入前に `Purchases.logIn(user.id)` で `app_user_id = Supabase user.id` を揃える（webhook の UUID 検証前提）。

## 4. App Store Connect 商品登録

- [ ] サブスクリプショングループを作成（例: `Orime Pro`）
- [ ] `orime_monthly`（¥1,480）/ `orime_annual`（¥12,800）を作成・**価格・自動更新・無料トライアルなし**
- [ ] 審査用スクショ・説明（自動更新の条件 = **Apple 3.1.2 必須開示**。アプリ内ペイウォールにも明記済み）
- [ ] カテゴリ：仕事効率化（プライマリ）/ ブック（セカンダリ）

## 5. ビルド → TestFlight → 審査

```bash
npm run build && npx cap sync ios   # 最新の dist を反映
```

1. Xcode → Product → **Archive** → Distribute App → App Store Connect → Upload
2. App Store Connect → TestFlight で実機確認（**実機でサンドボックス購入 → 課金後にロック解除 → Restore が効く**を必ず確認）
3. ストア掲載情報（`company/aso-store-listing.md`）を入力 → **審査提出**
4. リジェクト時の頻出点：①課金の自動更新条件の開示不足（3.1.2）→ ペイウォール文言で対応済 ②「外部の安い決済」誘導（反ステアリング）→ アプリ内は出さない設計 ③Restore 不在 → Restore ボタン実装済

## 6. リリース後

- Web（Stripe）と iOS（IAP）の課金は `subscriptions` で一元管理 → どちらで契約しても `useSubscription` が `active` を返しアンロック
- 解約：iOS は「App Store のサブスク設定」へ誘導（コード実装済）/ Web は Stripe ポータル
- AI 原価上限は IAP 手数料15%前提で ≤45円/人・月に締める（`AI_MONTHLY_CALL_LIMIT`）

---

**コード側はここまで実装済み**（Capacitor土台 + `iap.js` + Paywallのネイティブ分岐 + Restore + 反ステアリング）。残りは本書 §1〜§5 の **Mac/Xcode/ストア作業（オーナー）** のみ。
