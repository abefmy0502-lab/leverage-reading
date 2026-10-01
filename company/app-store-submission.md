# 📱 Orime — App Store 提出 完全手順書（v1.0.0）

> 対象: iOS / Capacitor + RevenueCat(IAP)。Bundle ID `com.leveragereading.app`、表示名 `Orime`。
> このドキュメントは「コード側は提出可能水準」を前提に、**Apple 側でやる作業**を順に網羅する。
> ✅=実装/準備済み、⬜=あなた（Mac/Apple アカウント）が行う作業。

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
| 第三者データ収集 | Sentry（クラッシュ計測）のみ → App Privacy で申告 |
| 自前利用計測 | analytics_events（ファーストパーティ・外部送信なし） |

---

## 1. Apple Developer / 証明書（⬜）

1. **Apple Developer Program** 登録（年 ¥12,980）。
2. **App ID** を作成: `com.leveragereading.app`。Capability で **In-App Purchase** を有効化（Push は後日＝今回は不要）。
3. 署名は **Xcode の Automatically manage signing** に任せるのが最速（Team を選ぶだけ）。

## 2. App Store Connect でアプリ作成（⬜）

1. [App Store Connect](https://appstoreconnect.apple.com) → My Apps → ＋ → New App。
   - Platform: iOS / Name: **Orime** / Primary Language: 日本語 / Bundle ID: `com.leveragereading.app` / SKU: `orime-ios-001`。
2. **サブスク商品（Auto-Renewable Subscription）を2つ**登録（App内課金 → サブスクリプショングループ「Orime Premium」を作りその中に）:
   - 月額: Product ID `orime_premium_monthly` / ¥1,480 / 期間1ヶ月
   - 年額: Product ID `orime_premium_annual` / ¥12,800 / 期間1年
   - ローカリゼーション（表示名・説明）を各商品に記入。**審査用に最低1商品をアプリのバイナリと一緒に提出**。
   - ※ **7日間無料トライアル（月額・年額とも・確定オファー）**: 各商品の **Introductory Offer（Free Trial・7日間）** をここで必ず設定する。RevenueCat webhook がダッシュボードの period_type を 'trial' で書く設定と対にする。自前の「返金保証」は謳わない（Apple 一元管理）。

## 3. RevenueCat 設定（⬜）

1. RevenueCat ダッシュボードで **iOS アプリ**を追加（Bundle ID 紐付け）。**App Store Connect API Key（.p8）** を RevenueCat に登録（サブスク状態同期に必須）。
2. **Entitlement** を1つ作成（例 `premium`）。コードは「active な entitlement が1つでもあれば有効」判定なので名称は任意（`src/lib/iap.js` 参照）。
3. **Offering（current）** を作り、**Packages を Monthly / Annual** で登録し、上の Product ID を割り当てる（コードは packageType=MONTHLY/ANNUAL で引く）。
4. **公開 SDK キー（Apple 用）** を取得 → 環境変数 `VITE_REVENUECAT_IOS_KEY` に設定（下記）。
5. **Webhook → Supabase**: RevenueCat の Webhook を、`subscriptions` テーブルへ status / period_type を書く中継に向ける（既存 Stripe webhook と同型。未実装なら別途。最悪 webhook 無しでも端末ローカル entitlement で課金は通るが、ダッシュボードの会員数は更新されない）。

## 4. 環境変数（本番ビルドに必要・⬜ 確認）

| 変数 | 用途 |
|---|---|
| `VITE_REVENUECAT_IOS_KEY` | RevenueCat Apple 公開キー（**必須**・未設定だと課金導線が出ない） |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | クライアント |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | サーバー(API) |
| `ANTHROPIC_API_KEY` | AI（相談・AI 選書の推薦・ほかが失敗したときの代わり。**必須**） |
| `OPENAI_API_KEY` / `GEMINI_API_KEY`（任意） | AI の安い行き先（`docs/ai-routing.md`）。無ければ全部 Claude。Gemini は請求先を設定したプロジェクトのキーだけ |
| `GOOGLE_BOOKS_API_KEY` | 表紙解決（サーバー） |
| `VITE_SENTRY_DSN`（任意） | クラッシュ計測 |

## 5. Xcode / ネイティブプロジェクト（⬜）

```bash
# Mac で
npm install
npm run build
npx cap sync ios
npx cap open ios   # Xcode が開く
```
Xcode で:
1. Signing & Capabilities → Team を選択、**In-App Purchase** capability を追加。
2. General → **Version 1.0.0 / Build 1**、Display Name `Orime`。
3. App アイコン: `public/icons/icon-1024.png` を AppIcon にセット（1024 必須）。
4. **PrivacyInfo.xcprivacy** を `ios/App/App/` に追加（下記 §8 の内容をコピー）。
5. 実機（あなたの iPhone）で一度ビルド＆起動して、**課金（Sandbox）と復元**が動くか確認。

## 6. App Privacy（プライバシー栄養成分・⬜ App Store Connect で入力）

「データを使用してユーザーを追跡しますか？」→ **いいえ**（第三者トラッキング/IDFA なし）。

収集データ（すべて **App 機能のため**、トラッキングには未使用）:
| データ種別 | 用途 | 識別子に紐づく |
|---|---|---|
| 連絡先情報 → メールアドレス | アカウント/認証 | はい |
| 識別子 → ユーザーID | アカウント/購入管理 | はい |
| 利用状況データ → 製品操作 | 分析（自前 analytics_events） | はい |
| 購入履歴 | 課金管理（Apple/RevenueCat） | はい |
| ユーザーコンテンツ → その他のユーザーコンテンツ（メモ・写真） | アプリ機能（読書メモ・写真の保存/表示。**収集する・ユーザーに紐付く・トラッキング不使用**） | はい |
| 診断 → クラッシュデータ / パフォーマンス | アプリ品質（**Sentry**＝第三者） | いいえ（PII 無効化前提） |

### 6-1. AI の送り先が 3 社になった（2026-10-01・`docs/ai-routing.md`）

AI 機能ごとに、Anthropic（相談・AI 選書の推薦）／OpenAI（読書計画シート・AI 選書の質問づくり）／Google の Gemini API（凝縮・まとめ・**写真から書き起こし**）に送る。App Privacy の入力で変えるところ:

| データ種別 | 変えること | 理由 |
|---|---|---|
| ユーザーコンテンツ → **写真またはビデオ** | **新しく「収集する」にする**（用途: App の機能・ユーザーに紐付く: はい・トラッキング: いいえ） | 写真から書き起こしで、撮った写真を Google に送る。Google・OpenAI は不正利用の監視のため一定期間保存することがあり、Apple の「収集」（その場の処理に必要な時間より長く、自分や委託先が見られる形で端末の外に送る）に当たる。メモの写真は Supabase にも保存している |
| ユーザーコンテンツ → その他のユーザーコンテンツ | そのまま（メモ・質問・相談内容）。用途は App の機能 | 送り先の会社が増えても、データの種類と用途は変わらない |
| トラッキング | 「いいえ」のまま | AI 事業者は当方の代わりに処理する委託先（広告・データブローカーではない）。ユーザー ID・メールは送らない |

- App Privacy は「どの会社に送るか」を書く欄が無い。会社名はプライバシーポリシー（`/legal/privacy` 第5条・第7条）に書いた
- ✅ **審査ガイドライン 5.1.2(i)**（2025-11 改訂）: 個人データを**第三者の AI と共有する前に、はっきり知らせて明示の許可を取る**こと（[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)・[2025-11 の更新のお知らせ](https://developer.apple.com/news/?id=ey6d8onl)）。**2026-10-01 に実装した**（SPEC §1-6）:
  - はじめて AI を使う操作（相談を送る・AI 選書・読書計画シート・凝縮・まとめ・写真から書き起こし）のときに、シート「AI に送る内容について」（機能ごとに送るものと送り先＝Anthropic / OpenAI / Google・「つながらないときは Anthropic が代わりに答えます」・学習に使わない・プライバシーポリシーへのリンク）＋「今はやめる」／「同意して使う」。やめたら何も送らない
  - コード: `src/components/AiConsentSheet.jsx`（シート）・`src/lib/aiConsent.js`（同意の保存・関所）・`src/lib/aiProcessors.js`（送り先の説明＝`api/_aiRouting.js` と同じかをテストで確かめる）。関所は各機能の入口と、送る直前（`src/lib/ai.js` の `postClaude`・`src/lib/streamClaude.js`）の 2 段
  - 同意は Supabase のアカウント（`user_metadata.ai_consent = { version, at }`）に残る。⚙️ 設定 → プライバシー →「AI へのデータ送信」で見られ、取り消せる（次に AI を使うときにまた聞く）。送り先を変えたら `AI_CONSENT_VERSION` を上げる＝全員にもう一度聞く
  - サーバーでは止めていない（この版ではアプリ側だけ・`docs/ai-routing.md` §5）。**出し直す前の iOS アプリは聞かない**（審査に出すビルドには入っている）
  - ⚠️ **審査のデモアカウントは、提出の前に 設定 → AI へのデータ送信 →「同意を取り消す」にしておく**（動作確認で同意していると、審査官にシートが出ない）
- Review Notes に足す一文:
  > AI 機能は、はじめて使うときに送る内容と送り先（Anthropic・OpenAI・Google）を示して同意をいただき、同意のあと機能に必要な内容だけを各社の API に送ります（各社の API の規約で学習には使われません）。写真を送るのは「写真から書き起こし」だけです。同意は 設定 → プライバシー →「AI へのデータ送信」から取り消せます。

## 7. App 審査情報（⬜）

- **デモアカウント**を用意（審査官がペイウォール内を見られるよう、課金済みの test アカウント or Sandbox 手順を Review Notes に明記）。（2026-09-27〜フリーミアム: 契約しなくてもアプリは使え、AI は相談だけ毎月 30 トークン。AI 選書・テーマまとめなどプランの機能を審査官が確かめられるよう、課金済みのデモアカウントは引き続き用意する）
- Review Notes 文例:
  > サブスクリプション制アプリです。審査用デモアカウント: email=____ / pass=____（このアカウントは課金済み状態にしてあります）。課金は RevenueCat 経由の App 内課金、購入の復元・自動更新条件・利用規約・プライバシーポリシーを Paywall に明示しています。アカウント削除はアプリ内（設定→アカウント削除）で可能です。
- **サポートURL** / **マーケティングURL** / **プライバシーポリシーURL**（`/legal/privacy`）/ **利用規約(EULA)URL**（`/legal/terms`）を登録。
- 年齢レーティング: 4+（不適切コンテンツ無し）。

## 8. PrivacyInfo.xcprivacy（⬜ `ios/App/App/` に追加）

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
      <string>NSPrivacyCollectedDataTypeProductInteraction</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurposeAnalytics</string></array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeCrashData</string>
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

- 必須: **6.9インチ（1320×2868）**（最低3枚、推奨5枚）。生成器 `appstore-screenshots/index.html` は 6.9 対応済み。
- 推奨カット: ①本棚（表紙グリッド）②メモ/凝縮 ③振り返り（想起）④AI選書 ⑤行動リスト。
- Xcode のシミュレータ or 実機でキャプチャ。日本語UIで。

## 10. 提出（⬜）

1. Xcode → Product → Archive → Distribute App → App Store Connect → Upload。
2. App Store Connect でビルドを選択、上記メタデータ/スクショ/価格/サブスク商品を紐付け。
3. **サブスク商品もこのバージョンと一緒に「審査に追加」**（忘れると IAP が審査されない）。
4. Submit for Review。初回審査は通常 24〜48h。

---

## ⚠️ 審査で落ちやすい点（事前対策・本アプリの状態）
- ❗ **デモアカウント未提供** → プランの機能（AI 選書・テーマまとめ等）が確かめられず差し戻されうる。§7 必須。
- ✅ 復元ボタン・自動更新条件・規約/プライバシー → 実装済み。
- ✅ アカウント削除（5.1.1(v)）→ 実装済み。
- ✅ 第三者の AI に送る前の同意（5.1.2(i)）→ 2026-10-01 実装済み（§6-1）。デモアカウントは同意を取り消した状態で渡す。
- △ **価格の二重表示に注意**: アプリ内の価格表記は App Store の実価格と一致させる（コードは ¥1,480 固定フォールバックだが、実際は RevenueCat のストア価格で上書きされる）。
- △ Review Notes に「無料: メモ・記録・シェアと相談（毎月 30 トークン）／プラン: 毎月 800 トークンとすべての AI 機能（7 日間無料）」と明記し、デモアカウントを渡すこと（2026-09-27 フリーミアム）。

## 宿題（ローンチ後でよい）
- 🔔 ネイティブ Push（APNs / @capacitor/push-notifications）— 現状 Web Push は WebView で発火しないため未対応。リテンション施策として後日。
- 🧾 RevenueCat → subscriptions webhook（会員数の自動同期）。未実装なら課金は通るがダッシュボード会員数が手動確認になる。
