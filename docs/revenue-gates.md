# 売上までの関門（オーナーがやる順番・2026-10-22）

> オーナー「これで売り上げを最大化する仕組みはできたかな？徹底的に準備を進めてほしい」への答え。
> **仕組み（コード・CI・型・土曜の自動化）はできている。売上が出るかは、下の関門をオーナーが外で通すかで決まる。**
> どこまで通ったかは、運営ダッシュボード（`/?admin=1` 概況）の「公開の準備（売上までの関門）」が自動で見せる（`api/launch-health.js`＝設定の有無だけ・値は返さない・管理者だけ）。

## 0. 一言

売上 ＝ App Store にある × 買える（IAP）× AI が動く × 戻ってくる（通知）× 知られる（投稿）。
左から順に、1 つでも 0 なら売上は 0。だから**順番どおり**に通す。

## 1. 順番（合計 およそ 1 日半・Mac が要るのは 4 と 5）

| # | 関門 | 時間 | やること | 終わった印（ダッシュボードの行） |
|---|---|---|---|---|
| 1 | **SQL** | 10 分 | Supabase の SQL Editor に `supabase_all_in_order.sql` を貼って Run → `supabase_verify_rls.sql` → `app_admins` に自分を入れる（`docs/sql-runbook.md`） | 「契約の表」「AI の原価」「運営ダッシュボードの表と関数」「契約の履歴…」「通知の表に iPhone の列」が ✓ |
| 2 | **Vercel の env（売る分）** | 15 分 | `SUPABASE_SERVICE_ROLE_KEY`・`ANTHROPIC_API_KEY`・`GEMINI_API_KEY`・`CRON_SECRET`・楽天の 3 つ（CLAUDE.md の表） | 「サーバーの Supabase の鍵」「Claude の鍵」「Gemini」「楽天」「合言葉」が ✓ |
| 3 | **App Store Connect と RevenueCat** | 90 分 | `docs/iap-setup-runbook.md` A〜G（契約・税・口座 → アプリ → プラン 2 つ → トークン 2 つ → 鍵 → RevenueCat → Vercel に `REVENUECAT_WEBHOOK_AUTH`・`REVENUECAT_SECRET_API_KEY`） | 「RevenueCat の Webhook …」が ✓ |
| 4 | **iPhone の通知（Mac）** | 60 分 | `company/app-store-submission.md` §12: APNs の鍵（.p8）→ Vercel に `APNS_*` 4 つ → Xcode の Push Notifications → `npm i @capacitor/push-notifications && npx cap sync ios` → 1.0 のビルドは `VITE_NATIVE_PUSH=on` | 「iPhone の通知」「ビルドに通知のスイッチ」が ✓ |
| 5 | **ビルドと提出（Mac）** | 半日 | `company/app-store-submission.md` §1〜§10（証明書・Xcode・App Privacy・審査情報・PrivacyInfo・スクショ `company/launch-2026-11/screenshots/`・提出）。提出前に 審査用アカウントの AI の同意を取り消す（§6-1）。`VITE_RELEASE_NOTES_SINCE=<公開日>` | 「1.0 の公開日」が ✓ |
| 6 | **公開の日** | 30 分 | Vercel に `VITE_APP_STORE_URL`（実 URL）・`VITE_APP_STORE_PT`・創業メンバー価格なら `VITE_FOUNDING_OFFER=on`＋`VITE_FOUNDING_OFFER_END`・紹介なら `VITE_REFERRAL_CODE` → 再デプロイ。LP の入口が App Store に向く・QR・Smart Banner・レビュー依頼が自動で動く | 「App Store の URL」「キャンペーンの印」「創業メンバー価格」「友だちに紹介する」が ✓ → 見出しが **「売れる状態です」** |
| 7 | **知らせる** | 土曜 3 時間 | `company/weekly/<土曜>.md`（土曜 5:47 に自動で届く）を直して予約。`company/launch-2026-11/calendar.md` の公開の日の投稿・`launch-email.md`・`press-release.md` | 営業タブに週の数字を入れる |

## 2. 通したあと、毎週見るもの（5 分）

- 運営ダッシュボード 概況: **目標**（道しるべとのずれ）→ **売上と推定の粗利** → **今日の一手** → **公開の準備**（全部 ✓ のまま）→ ローンチの 4 つの数字。
- 営業タブに LP の押下・入手・有料の数を手入力（App Store Connect の `ct=`・各 SNS のインサイト）。
- `company/weekly/<土曜>.md` §7 に「数字と学び」を 3 行（次の土曜の下書きが読む）。

## 3. できないとき

| 困りごと | 見る所 |
|---|---|
| ダッシュボードが「確かめられませんでした」 | 自分が `app_admins` にいるか（SQL の末尾）。Vercel に `SUPABASE_SERVICE_ROLE_KEY` があるか |
| 表紙が出ない | CLAUDE.md「運用 — 表紙が取れないとき」（`/api/cover?health=1`） |
| 買えるのに AI が 402 | `REVENUECAT_SECRET_API_KEY`（購入直後の Webhook 前を救う）・`docs/iap-setup-runbook.md`「うまくいかないとき」 |
| 通知が届かない | `APNS_PRODUCTION`（TestFlight は未設定、App Store は `'true'`）・`supabase_push_native.sql` |
| 審査で落ちた | `company/app-store-submission.md`「審査で落ちやすい点」 |
