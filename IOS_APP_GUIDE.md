# 📱 iOS ネイティブアプリ化ガイド（App Store 配信）

このドキュメントは、レバレッジ読書ログ（React + Vite の PWA）を **Capacitor** で
ネイティブ iOS アプリにラップし、**App Store に配信する**ための手順書です。

専門用語はできるだけ避けて書いています。技術者に渡す場合はそのまま渡せます。

---

## 0. いま終わっていること / これからやること

### ✅ このリポジトリで設定済み（Linux 上で完了）

- **Capacitor** を導入（`@capacitor/core` / `cli` / `ios` + プラグイン）
- `capacitor.config.json`（アプリ ID・名前・スプラッシュ設定）
- `src/lib/native.js` … ネイティブ時だけ StatusBar / Keyboard / SplashScreen を初期化（Web には無影響）
- `src/hooks/useHaptic.js` … **ネイティブでは本物の iPhone 振動（Taptic Engine）** を使うよう強化（Web PWA では効かなかった）
- `package.json` に iOS 用スクリプト（`ios:add` / `ios:sync` / `ios:open`）
- `.gitignore` に iOS のビルド生成物を追加

### ⛔ ここ（クラウド/Linux 環境）ではできないこと

iOS アプリのビルド・署名・申請は **macOS + Xcode が必須**です。このクラウド環境は
Linux なので、以下は **Mac 上で**行ってください（あなたの Mac か、Codemagic /
GitHub Actions の macOS ランナー等のクラウド Mac）。

### 🧾 あなたが用意するもの（お金・アカウント）

| 必要なもの | 費用 | 備考 |
|---|---|---|
| Mac（macOS） | — | Xcode が動く Mac。借りる/クラウド Mac でも可 |
| Xcode | 無料 | Mac App Store から |
| Apple Developer Program | **年 $99（約 1.5 万円）** | これがないと App Store に出せない |
| iPhone（実機） | — | 実機テスト用（任意だが推奨） |

---

## 1. Mac での初回セットアップ

```bash
# 1) リポジトリを取得して依存をインストール
git clone <このリポジトリ>
cd leverage-reading
npm install

# 2) Web をビルド（dist/ を作る）
npm run build

# 3) iOS プロジェクトを生成（ios/ フォルダができる。初回だけ）
npm run ios:add        # = npx cap add ios

# 4) 最新の Web ビルドを iOS に同期
npm run ios:sync       # = npm run build && npx cap sync ios

# 5) Xcode で開く
npm run ios:open       # = npx cap open ios
```

> 💡 **以後、Web のコードを変えたら `npm run ios:sync` を実行**すれば、その変更が
> ネイティブアプリ側にも反映されます。

---

## 2. Xcode での設定（署名・名前・権限）

Xcode で `ios/App/App.xcworkspace` を開いた状態で：

### 2-1. 署名（Signing & Capabilities）
- 左の **App** ターゲット → **Signing & Capabilities** タブ
- **Team** に自分の Apple Developer アカウントを選ぶ
- **Bundle Identifier** を確認（現在 `com.leveragereading.app`）
  - ⚠️ **Bundle ID は一度 App Store に出すと変更不可**。自分のドメインに合わせるなら
    今のうちに `capacitor.config.json` の `appId` を変えてから `ios:add` し直す。

### 2-2. ホーム画面に出るアプリ名を日本語にする
- `ios/App/App/Info.plist` に以下を追加（または Xcode の Info タブで）：
  - キー `CFBundleDisplayName` → 値 `読書ログ`
- （Xcode のプロジェクト名は英語 `Leverage Reading` のまま。表示名だけ日本語になります）

### 2-3. 権限の説明文（カメラ・写真）
このアプリはメモに写真を添付できます。iOS は権限利用時に「なぜ必要か」の文言が
**必須**です。`Info.plist` に以下を追加してください（無いと審査リジェクト）：

| キー | 値（例） |
|---|---|
| `NSCameraUsageDescription` | 本やメモの写真を撮影して記録するために使用します。 |
| `NSPhotoLibraryUsageDescription` | 保存済みの写真をメモに添付するために使用します。 |
| `NSPhotoLibraryAddUsageDescription` | 画像を写真ライブラリに保存するために使用します。 |

> 現状の写真添付は HTML の `<input type="file">` ベースで動きます。よりネイティブな
> 撮影体験にしたい場合は後日 `@capacitor/camera` に差し替え可能（任意）。

---

## 3. アプリアイコン & 起動画面（スプラッシュ）

`public/icons/icon-512.png` を元に、iOS 用の全サイズを自動生成できます：

```bash
npm install -D @capacitor/assets
npx capacitor-assets generate --ios
```

- アイコン元画像: 1024×1024 の PNG を `assets/icon.png` に置くのが理想
- スプラッシュ: `assets/splash.png`（2732×2732 推奨、背景 `#EDE0CA`）
- 生成後に `npm run ios:sync` で反映

---

## 4. 💳 月額課金（最重要・ここが審査の関門）

### 結論
- **価格: 月額 ¥990（税込）／無料トライアルなし**（決定済み）
- iPhone アプリ内で課金する場合、**Apple の「アプリ内課金（In-App Purchase）」を
  使うことが Apple のルールで義務**です。クレジットカードや Stripe で直接課金する
  実装は **審査でリジェクト**されます（App Store Review Guideline 3.1.1）。
- Apple は売上の **15〜30%** を手数料として取ります（小規模事業者プログラムなら
  初年度〜年間売上 100 万ドルまで 15%）。
  - 手取り目安: ¥990 × 85% ≒ **¥841/月**（15% の場合）

### 実装方針（推奨: RevenueCat）
アプリ内課金は「買った／解約した／期限切れ」の状態管理とレシート検証が面倒です。
これを肩代わりしてくれる **RevenueCat**（小規模なら無料枠あり）を使うのが、
非エンジニアでも回しやすい王道です。

おおまかな流れ（Mac + Apple Developer 登録後）：

1. **App Store Connect** で「サブスクリプション商品」を作成
   - 商品 ID 例: `monthly_990`
   - 価格: ¥990／自動更新／無料トライアルなし
2. **RevenueCat** に登録 → このアプリと商品を紐付け
3. アプリに `@revenuecat/purchases-capacitor` を入れ、
   - ログイン中ユーザー（Supabase の user id）と RevenueCat を紐付け
   - 「購入する」ボタン / 「購入を復元」ボタンを設置
   - 課金状態に応じて機能をロック/アンロック
4. **サーバー側で課金状態を Supabase に同期**（RevenueCat の Webhook →
   Supabase Edge Function 等）。「どの端末でログインしても課金状態が一致」する状態に
5. **サンドボックス（テスト用）アカウントで購入テスト**（← Mac 必須）

> ⚠️ アプリ内に「Web でもっと安く買えます」等の**外部決済への誘導は禁止**です
> （リーダーアプリ例外を除く）。リジェクトの典型原因。

> 📝 補足: Web 版（Vercel）で別途 Stripe 課金を持つ構成も可能ですが、その場合
> でも **iOS アプリ内からは Web 課金に触れさせない**設計が必要です。まずは iOS 内
> 課金（IAP）に一本化するのが最短です。

#### このリポジトリでの残作業（段階2・要 Mac）
- [ ] App Store Connect でサブスク商品 `monthly_990` を作成
- [ ] RevenueCat 連携（または StoreKit 直叩き）の実装
- [ ] 課金状態 → Supabase 同期（Webhook）
- [ ] 購入 / 復元 UI の追加（設定モーダル or 専用ペイウォール）
- [ ] サンドボックス購入テスト

---

## 5. 既存の法的文面の価格を ¥990 に統一

価格を ¥990 に決めたので、以下は本リポジトリ側で **¥1,000 → ¥990 に更新済み**です：

- `src/pages/Landing.jsx`（LP の価格表記）
- `src/legal/TermsPage.jsx`（利用規約 第◯条 利用料金）
- `src/legal/SctPage.jsx`（特定商取引法に基づく表記 販売価格）

> ⚠️ なお `SctPage.jsx` の **販売事業者名 / 運営責任者**は空欄のままです（実名 or
> 屋号が必要）。月額課金サービスでは法的に必須なので、商用公開前に記入してください。

---

## 6. App Store 申請（Mac + Apple Developer 登録後）

1. Xcode → **Product › Archive**（実機/汎用 iOS デバイス向けにアーカイブ）
2. **Distribute App › App Store Connect** でアップロード
3. [App Store Connect](https://appstoreconnect.apple.com) で申請情報を入力：
   - アプリ名 / サブタイトル / 説明文 / キーワード
   - **スクリーンショット**（6.7インチ・6.5インチ等の必須サイズ）
   - **プライバシー「栄養成分表示」**（収集データの申告。本アプリ: メール・読書データ等）
   - **年齢レーティング**
   - **審査メモ**にテスト用アカウント（メール/パスワード）を必ず記載
4. **審査に提出** → 通常 1〜3 日で結果

### このアプリが既にクリアしている主な審査要件 ✅
- アカウント削除機能あり（設定 → アカウント削除）… ガイドライン 5.1.1(v) 必須
- プライバシーポリシー / 利用規約 / 特商法表記あり
- ソーシャルログインなし → 「Sign in with Apple 必須」要件には非該当
- データのエクスポート（JSON）あり

### 申請前の最終チェック
- [ ] アプリ内に外部決済への誘導リンクが無い
- [ ] 写真権限の説明文が入っている
- [ ] 審査用テストアカウントを審査メモに記載
- [ ] 特商法の事業者名 / 運営責任者を記入済み
- [ ] クラッシュしない（実機で一通り操作）

---

## 7. よくある質問

**Q. Web 版（Vercel / PWA）はどうなる？**
A. そのまま生きています。Capacitor は Web を壊しません。Web は今まで通り
`git push` → Vercel 自動デプロイ。iOS は `npm run ios:sync` で別途同期します。

**Q. iOS のコードは別管理？**
A. いいえ、同じリポジトリです。`ios/` フォルダが iOS プロジェクト本体（Mac で
`ios:add` 時に生成）。Web のコードを 1 つ直せば両方に反映できます。

**Q. Android も出せる？**
A. 出せます。`npx cap add android`（要 Android Studio）。本ガイドは iOS 用です。

---

## 付録: 主要コマンド早見表

```bash
npm run build      # Web をビルド
npm run ios:add    # iOS プロジェクト生成（初回のみ・要 Mac）
npm run ios:sync   # Web の変更を iOS に同期（毎回）
npm run ios:open   # Xcode で開く
```
