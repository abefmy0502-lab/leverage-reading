# 🚀 Orime Webローンチ Go-Live Runbook（push解放の瞬間に売り始める手順書）

> CEO起草 2026-06-22。元帥指示「push解放されたら、ガンガン売れるように準備を徹底」。
> **これは"push解放後にボタンを押す順番"の単一の真実**。Web版(Stripe)先行ソフトローンチ／直接課金／北極星=有料課金者数。会社の真実は `board.md`、SNSは `sns-sales-plan-july.md`。

## 0. 現在地（コード側＝ほぼ完成・ローカルに積み上げ済み）
- ✅ 課金基盤（Stripeチェックポート/ポータル/webhook・RevenueCat webhook・useSubscription・Paywall）
- ✅ サーバー側entitlementゲート・AIメータリング・セキュリティ堅牢化
- ✅ ファーストパーティ計測（ファネル：paywall_viewed→checkout_started→checkout_completed）
- ✅ LP（直接課金最適化済・社会的証明枠・CTA→登録直行）
- ✅ **依存パッケージ修正（stripe/web-push）＝デプロイブロッカー解消・脆弱性0**（commit e15f70f）
- ⛔ **唯一の律速＝push 403 ＋ 署名鍵**（元帥対応）。これが開いた瞬間に下記を実行。

---

## 1. 🔴 売るための最小クリティカルパス（これだけで課金が回る）
> 「ガンガン売れる」の前に「1円が通る」を確実にする最小集合。順に。

1. **push解放 → main にデプロイ**（Vercelが`main`を自動デプロイ）。
2. **Vercel 環境変数を設定**（§3の🔴必須のみでも可）。
3. **Supabase で課金の最小SQLを実行**：`supabase_subscriptions.sql` →（IAP併用なら）`supabase_subscriptions_provider.sql`。
   - ⚠️ **これが無いと PaywallGate が fail-open で全機能無料になり、誰も課金されない**（＝売れない）。最優先。
4. **Stripe 設定**（§4）：商品＋月額¥1,480/年額¥10,800のPrice ID＋Webhook（4イベント）＋署名シークレット。
5. **テストモードで1課金を疎通**（§6スモークテスト）→ subscriptions が active → ペイウォール解除を目視。
6. **本番キーに切替 → 公開URL確定 → ローンチ告知**（§7）。

> ここまでで「直接課金が成立する」。以降（§2全SQL・計測・ハイジーン）は"ガンガン"の質を上げる肉付け。

---

## 2. 🗄 Supabase SQL マイグレーション実行順（SQL Editorに貼付・全て冪等）
> 既存本番プロジェクトには核テーブル（books/book_memos/actions/book_tags+auth）が既にある前提。下記は増分。**全て冪等設計なので、適用済みでも安全に再実行可**。上から順に。

**A. コア増分**
- [ ] `supabase_migration_memo_texts.sql`
- [ ] `supabase_chat_messages.sql`（マイ読書脳・book_id nullable・source_type）

**B. books 列追加**
- [ ] `supabase_books_isbn.sql`
- [ ] `supabase_added_via.sql`（added_via＋book-coversバケット）
- [ ] `supabase_book_covers_bucket.sql`（idempotent・未作成時の保険）
- [ ] `supabase_books_cover_isbn.sql`
- [ ] `supabase_books_source_query.sql`
- [ ] `supabase_books_setup_fields.sql`
- [ ] `supabase_books_reading_progress.sql`
- [ ] `supabase_books_unique_isbn.sql` ⚠️**実行前に既存重複の整理が必要**（SQL内に確認/削除サンプルあり）
- [ ] `supabase_normalize_urls.sql`（既存cover httpのhttps化・既存本が無ければ不要）
- [ ] `supabase_books_cover_reset.sql`（誤表紙の一括リセット・任意）

**C. actions タスク化**
- [ ] `supabase_actions_full.sql`
- [ ] `supabase_actions_id_default.sql`
- [ ] `supabase_actions_scheduled.sql`
- [ ] `supabase_actions_completed_at_backfill.sql`

**D. 補助テーブル**
- [ ] `supabase_advisor_sessions.sql`（AI選書履歴）
- [ ] `supabase_theme_reports.sql`（テーマレポート保存）
- [ ] `supabase_feedback.sql`（フィードバック）
- [ ] `supabase_account_deletion.sql`（退会リクエスト）

**E. 💰課金（売るために必須）**
- [ ] `supabase_subscriptions.sql` 🔴
- [ ] `supabase_subscriptions_provider.sql`（IAP併用列・Web単独でも害なし）

**F. 計測・原価ガード・通知**
- [ ] `supabase_ai_usage.sql`（AI月次上限・原価ガード）
- [ ] `supabase_analytics_events.sql`（ファネル計測）
- [ ] `supabase_push_subscriptions.sql`（想起プッシュ・Web Push・任意/後でも可）

**G. 🛡仕上げ（必ず最後＝テーブルが揃ってから）**
- [ ] `supabase_security_hardening.sql`（コアRLS再保証・private写真バケット・book-covers書込封じ・analytics props上限）

> ⚠️ **技術的負債（要認識）**：核テーブル（books/book_memos/actions/book_tags）の CREATE 文はリポジトリに無く、本番Supabaseにしか存在しない。**完全な災害復旧/再現はできない**。ローンチ後の落ち着いたタイミングで `supabase_base_schema.sql` として現行スキーマをダンプ→版管理に入れること（P1）。

---

## 3. 🔑 Vercel 環境変数
**🔴必須（売る最小）**
- [ ] `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`（クライアント）
- [ ] `SUPABASE_URL` / `SUPABASE_ANON_KEY`（サーバー）
- [ ] `SUPABASE_SERVICE_ROLE_KEY`（webhook/メータリング・**クライアント露出厳禁**）
- [ ] `ANTHROPIC_API_KEY`（AI）
- [ ] `STRIPE_SECRET_KEY`（**クライアント露出厳禁**）
- [ ] `STRIPE_WEBHOOK_SECRET`（`whsec_...`）
- [ ] `STRIPE_PRICE_ID_MONTHLY`（¥1,480）/ `STRIPE_PRICE_ID_ANNUAL`（¥10,800）

**🟠任意（表示/調整）**
- [ ] `VITE_PRICE_MONTHLY_LABEL`（既定「月額 ¥1,480（税込）」）/ `VITE_PRICE_ANNUAL_LABEL` / `VITE_PRICE_ANNUAL_NOTE`
- [ ] `AI_MONTHLY_CALL_LIMIT`（既定120）

**🟢後で（プッシュ通知導入時）**
- [ ] `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `CRON_SECRET`（`vercel.json`のcrons設定も）

---

## 4. 💳 Stripe 設定
- [ ] 商品「Orime」を作成 → **2つのPrice（recurring）**：月額¥1,480 / 年額¥10,800。各 **Price ID** を env へ。
- [ ] **Webhook エンドポイント**：`https://<本番ドメイン>/api/stripe-webhook`
  - 送信イベント（コードが処理する4つ）：`checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` / `invoice.payment_failed`
  - 署名シークレット（`whsec_...`）→ `STRIPE_WEBHOOK_SECRET` へ。
- [ ] **まずテストモード**で疎通（§6）→ 問題なければ**本番キー**に差し替え。
- [ ] （任意）Customer Portal を有効化（`api/stripe-portal.js`が解約/カード変更に使用）。
- 補足：成功時の戻りURLは `/?checkout=success`（コードが計測＋subscription反映ポーリング）。失敗は `/?checkout=cancel`。

---

## 5. ⚙️ Supabase ダッシュボード設定（商用ハイジーン）
- [ ] Authentication → **Enable email confirmations = ON**（CLAUDE.mdチェックリスト）
- [ ] Secure email change / Secure password change = ON
- [ ] CORS allowed origins = **本番ドメインのみ**
- [ ] Storage：`book-memo-photos` が **private**、`book-covers` が public read であること（§2-Gで担保）
- [ ] Rate limit / JWT expiry = デフォルト維持

---

## 6. ✅ スモークテスト（本番デプロイ後・テストカードで end-to-end）
> 1つでも詰まれば売れない。順に確認。
1. [ ] `/lp` が表示される（LP）。CTA「始める」→ `/?auth=signup` で**登録画面**に着地。
2. [ ] 新規登録 → 確認メール受信 → リンク → ログインできる。
3. [ ] ログイン後、**ペイウォールが出る**（未課金が gate される＝subscriptions適用の証拠）。
4. [ ] 「年額/月額で契約する」→ Stripe Checkout（テストカード`4242...`）→ 決済 → `/?checkout=success`へ戻る。
5. [ ] 数秒以内に**ペイウォールが外れ本棚に入れる**（webhook→subscriptions active→useSubscription反映）。
6. [ ] 本追加→メモ→振り返り(想起)→行動→マイ読書脳(AI回答) の核ループが通る。
7. [ ] 設定→プラン管理（Customer Portal）で解約導線が開く。
8. [ ] 計測：Supabase `analytics_events` に paywall_viewed / checkout_started / checkout_completed が入る（§7のSQL）。
9. [ ] スマホ実機（iOS Safari）で1〜6を再確認（セーフエリア/ズーム/IME）。

---

## 7. 📣 ローンチ告知（買える化が確認できた瞬間）
> 文面は `company/launch-thread-and-content-july.md`（fumiyaが自分の言葉に上書き）。
1. [ ] 固定ポストを「今日から使える（月¥1,480・7日間無料・10秒解約・データ残る）＋LPリンク」に差し替え。
2. [ ] ローンチ告知スレッド投稿（なぜ作った→何ができる→正直な現在地→価格の理由→リンク）。
3. [ ] Readee難民の受け皿宣言。
4. [ ] Note 1本目公開＋X告知。
5. [ ] SNSリンクに**UTM**付与（`?utm_source=x&utm_campaign=launch`）＝流入計測。
6. [ ] 週次ファネルSQL（`funnel-measurement.md`§4）を見て、漏れている段を1つずつ磨く。

---

## 8. 🔭 ローンチ後すぐ（"ガンガン"の加速）
- [ ] 最初の有料ユーザーの**許可済みの声**を `Landing.jsx` の `TESTIMONIALS` に1〜2件入れる（社会的証明＝次の転換を生む）。
- [ ] `marketing-week1-kit.md` の旧価格¥990を¥1,480へ更新（コンテンツagentが不整合検出済）。
- [ ] App版（IAP）は並行でB5（Apple/Google/RevenueCat）を進め後追いローンチ。
- [ ] `supabase_base_schema.sql` を作って核スキーマを版管理下に（災害復旧・P1）。

---

## 9. 状態サマリ（このRunbook作成時点）
| 区分 | 状態 |
|---|---|
| コード（課金/計測/LP/セキュリティ/依存） | ✅ ローカル完成・要push |
| SQL移行手順 | ✅ 本書§2に集約（実行は要push後・元帥/管理者） |
| env/Stripe/ダッシュボード | 📋 本書§3-5に集約（要オーナー作業） |
| push 403 / 署名鍵 | ⛔ 元帥対応（唯一の律速） |
