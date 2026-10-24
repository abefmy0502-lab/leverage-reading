# Supabase の SQL — これを見れば全部できる手順書

最終更新: 2026-10-24（前回 2026-10-11 の版を流した上に今の版を 2 回続けて流し、エラーなく通ることを Postgres 16 で確かめた）。対象: リポジトリにある `supabase_*.sql` すべて。

しばらく流していなくても、どれを流したか分からなくても、下の「1 本でまとめて流す」だけで最新の状態になります。

## 1. いちばん簡単なやり方: 1 本でまとめて流す（おすすめ）

1. **PC** で GitHub のリポジトリを開き、`supabase_all_in_order.sql` を開く（約 4,800 行・約 270KB あるので、スマホより PC が確実です。途中で切れると失敗します）
2. 右上の「Raw」→ 全部選んでコピー（⌘A → ⌘C）
3. Supabase → 左の「SQL Editor」→「New query」→ 貼り付け → 右下の「Run」
4. 下に `Success. No rows returned` と出れば完了

- **何度流しても壊れません**。前に流したものが混ざっていても、もう一度全部流して大丈夫です（2026-10-10 に、空の DB に 2 回続けて流して確かめました）
- **途中で失敗したら、そこまでの変更も入りません**（全部入るか、何も入らないか）。赤いエラーの文をそのまま貼ってください
- 前から別の形で作られていた表があっても止まりません。足りない列を、まとめが自動で足します（2026-10-10・本番の通知の表で `column "enabled" does not exist` が出たため）
- そのとき足す一意の索引は、前からある行に重なりがあると作れません。そのときは止まらずに `NOTICE … 一意の索引を作れませんでした` と出て先へ進みます（2026-10-10）。出たら、その表の重なりを整理してから流し直してください
- 利用者のデータは消えません。消す文は入れていません（テスト `scripts/sqlBundle.test.js` が確かめる）

## 2. 流したあとに確かめる（2 本・どちらも読むだけ）

**① 権限の確認**: `supabase_verify_rls.sql` を同じように貼って Run。

- どの表も `rls_enabled` が `t`
- 「誰にでも開いた決まり」の結果が 0 行

これなら問題ありません。違ったら、もう一度 `supabase_all_in_order.sql` を流してください（中に権限の直しが入っています）。

**② 運営ダッシュボードの管理者の確認**: 次の 1 文を Run。

```sql
select u.email from public.app_admins a join auth.users u on u.id = a.user_id;
```

あなたのメールアドレスが出れば OK です。出なければ、アプリにログインしているメールで次を Run します（メールのところを書き換える）。

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'あなたのメール'
on conflict (user_id) do nothing;
```

まとめの中で登録しているのは `leverage.book0502@gmail.com` です。

## 3. 今回（この 1 か月）で増えた・変わったもの

まとめて流せば全部入ります。何が変わるかの参考です。

**2026-10-11 より後に増えた・変わったもの**（前回まとめて流したあとの分）

| ファイル | 流すと何ができるか | 流さないと |
|---|---|---|
| `supabase_books_read_target.sql` | 本の詳細の「読む時間の目安」をほかの端末にも残す（2026-10-18） | その端末にしか残らない |
| `supabase_ai_cache_warm.sql` | 相談の指示文のキャッシュを温め直し、冷えた最初の答えの原価を下げる（2026-10-21） | 何もしない（今までの原価のまま） |
| `supabase_admin_profit.sql` | 運営ダッシュボードの「売上と推定の粗利」・12 か月の推移・更新の見込み（2026-10-22） | その区画に「流すと出ます」 |
| `supabase_core_indexes.sql` | 起動のときの本の読み込みを速くする索引 3 本を足した（2026-10-22・**流し直す**） | 本が増えると起動が遅くなる |

**それより前（2026-10-11 までに流していれば入っている）**

| ファイル | 流すと何ができるか | 流さないと |
|---|---|---|
| `supabase_reading_sessions.sql` | 読む（集中モード）の時間をほかの端末にも残す・記録の「読書の時間」 | その端末にしか残らない |
| `supabase_book_field_cache.sql` | 本の分野を本ごとに 1 回決めて全員で使う。2026-10-10 に「選び直した声」を 1 人 1 冊 1 回に絞る列（`voter`）と一意の索引を足した（**流し直す**） | その場で決めるだけ（覚えない）・声が残らない |
| `supabase_books_brief.sql` | この本で学べることを本に保存 | その端末にしか残らない |
| 0 | `supabase_books_read_target.sql` | 読む時間の目安 |
| `supabase_ai_cost.sql` | AI の原価をトークンで数える（有料会員 1 人から月 ¥900 を残す上限） | 回数だけの粗い上限 |
| `supabase_ai_token_credits.sql` | トークンの買い足し | 買ったトークンが反映されない |
| `supabase_ai_usage_purpose.sql` | トークンの使い方のシートの「今月の使い道」（相談・AI 選書 … ごとのトークン・2026-10-11） | 使い道の段が出ない（残り・追加分・ボタンは出る） |
| 0 | `supabase_ai_cache_warm.sql` | 相談のキャッシュを温め直す |
| `supabase_push_deadline.sql` | 行動の期限の日の朝の通知 | 期限の通知が届かない |
| `supabase_subscription_events.sql` | 契約の履歴（7 日間無料 → 有料を数える） | 運営の「7 日間無料 → 有料」が出ない |
| `supabase_admin_members_tasks.sql` | 会員の内訳・売上（創業メンバー価格を有料として数える） | 売上が古い数え方 |
| `supabase_admin_launch_kpis.sql` | ローンチの 4 つの数字（30 日後も使う＝読む・行動の完了も数える） | 4 つの数字が出ない・古い数え方 |
| `supabase_admin_goal.sql` | 運営ダッシュボードの「有料ユーザー 1,000 人」: 週ごとの流れ（LP → 登録 → 7 日間無料 → 有料 → 解約）・道しるべを画面で変える・毎週の見直しの記録・ストアのページ表示の手入力（2026-10-11・`docs/goal-1000.md`） | その区画に「SQL を流すと出ます」・目標は既定の値で計算 |
| 0 | `supabase_admin_profit.sql` | 売上と推定の粗利 |
| `supabase_lp_events.sql` | 紹介ページの記録（捨てられていた記録が入る） | 一部が捨てられる |
| `supabase_lp_waitlist.sql` | 紹介ページの「公開の日にメールで知らせる」。2026-10-11 に同じ IP から 1 日 5 回までの数え方を足した（**流し直す**） | 登録が「いま受け付けられませんでした」・連打は 1 分 5 回の簡易な制限だけ |
| `supabase_security_hardening.sql` | 2026-10-11 に、表紙の置き場は 2MB・メモの写真の置き場は 10MB まで、画像は JPEG・PNG・WebP だけに（**流し直す**） | 大きなファイルや画像でないファイルも置けてしまう |

## 4. まとめに入れていないもの（ふだんは流さない）

| ファイル | 理由 |
|---|---|
| `supabase_verify_rls.sql` | 確かめるだけ。上の §2 で流す |
| `supabase_books_unique_isbn.sql` | 同じ本の二重登録を DB でも止める（任意）。先に重複を整理しないと失敗する。流すときはファイル冒頭の確認の文を先に Run し、0 行なら本体を Run |
| `supabase_books_cover_reset.sql` | 昔の誤った表紙を消す一度きりの直し。流さない |
| `supabase_migration_memo_texts.sql` | 消した機能（コレクション）の表。流さない |

`supabase_actions_scheduled.sql` の中の「昔の暴走した繰り返しの行動を消す文」は、2026-10-10 にコメントにしました。流し直すと正しい次回分まで消してしまうためです。

## 5. 1 本ずつ流したいとき（まとめと同じ順）

まとめが長すぎて貼れないときだけ、この順で 1 本ずつ流します。順番を変えないでください（後ろのものは前の表を使います）。

| 順 | ファイル | 何のため |
|---|---|---|
| 1 | `supabase_books_isbn.sql` | 本の ISBN・ASIN |
| 2 | `supabase_added_via.sql` | 本の追加のしかた＋表紙の置き場 |
| 3 | `supabase_book_covers_bucket.sql` | 表紙の置き場の権限 |
| 4 | `supabase_books_cover_isbn.sql` | 表紙を取った ISBN |
| 5 | `supabase_normalize_urls.sql` | 表紙の http を https に |
| 6 | `supabase_books_source_query.sql` | AI 選書の相談を本に引き継ぐ |
| 7 | `supabase_books_setup_fields.sql` | 課題・仮説・選書理由 |
| 8 | `supabase_books_reading_progress.sql` | ページ数（裏で使う） |
| 9 | `supabase_books_brief.sql` | この本で学べること |
| 10 | `supabase_books_read_target.sql` | 読む時間の目安 |
| 11 | `supabase_book_collections.sql` | 本棚のフォルダ |
| 12 | `supabase_chat_messages.sql` | 相談の会話 |
| 13 | `supabase_recall_memory.sql` | 思い出しカードの間隔 |
| 14 | `supabase_core_indexes.sql` | 本・メモの読み込みを速く |
| 15 | `supabase_advisor_sessions.sql` | 過去の AI 選書 |
| 16 | `supabase_theme_reports.sql` | （廃止した機能の保存先・書き出し用に残す） |
| 17 | `supabase_reading_sessions.sql` | 読む（集中モード）の読書の時間 |
| 18 | `supabase_book_field_cache.sql` | 本の分野（本ごとに 1 回決めて全員で使う） |
| 19 | `supabase_actions_full.sql` | 行動の期限・繰り返し・ふりかえり |
| 20 | `supabase_actions_id_default.sql` | 行動の id |
| 21 | `supabase_actions_completed_at_backfill.sql` | 昔の完了日を埋める |
| 22 | `supabase_actions_scheduled.sql` | 繰り返しの次回分 |
| 23 | `supabase_push_subscriptions.sql` | 通知の登録 |
| 24 | `supabase_push_native.sql` | iPhone の通知 |
| 25 | `supabase_push_deadline.sql` | 行動の期限の通知 |
| 26 | `supabase_subscriptions.sql` | 契約 |
| 27 | `supabase_subscriptions_provider.sql` | App Store の契約 |
| 28 | `supabase_subscriptions_provider_backfill.sql` | 昔の契約の種類を埋める |
| 29 | `supabase_subscriptions_canceled_at.sql` | 解約した日 |
| 30 | `supabase_stripe_events.sql` | Web の決済の二重処理を防ぐ |
| 31 | `supabase_revenuecat_events.sql` | App Store の決済の二重処理を防ぐ |
| 32 | `supabase_subscription_events.sql` | 契約の履歴（7 日間無料 → 有料） |
| 33 | `supabase_ai_usage.sql` | AI の利用回数 |
| 34 | `supabase_ai_usage_atomic.sql` | AI の上限を同時に超えない |
| 35 | `supabase_ai_usage_release.sql` | 答えられなかった回を返す |
| 36 | `supabase_ai_rate_limit.sql` | AI の連打を止める |
| 37 | `supabase_ai_cost.sql` | AI の原価をトークンで数える |
| 38 | `supabase_ai_token_credits.sql` | トークンの買い足し |
| 39 | `supabase_ai_usage_purpose.sql` | トークンの使い道（用途ごとの内訳） |
| 40 | `supabase_ai_cache_warm.sql` | 相談のキャッシュを温め直す |
| 41 | `supabase_analytics_events.sql` | 利用状況の記録 |
| 42 | `supabase_feedback.sql` | フィードバック |
| 43 | `supabase_feedback_hardening.sql` | フィードバックの守り |
| 44 | `supabase_account_deletion.sql` | 退会の申し込み |
| 45 | `supabase_account_deletion_hardening.sql` | 退会の申し込みの守り |
| 46 | `supabase_lp_events.sql` | 紹介ページの記録 |
| 47 | `supabase_lp_waitlist.sql` | 公開のお知らせの登録 |
| 48 | `supabase_security_hardening.sql` | 本・メモ・行動・写真の権限 |
| 49 | `supabase_admin_metrics.sql` | 運営ダッシュボード（管理者の登録つき） |
| 50 | `supabase_admin_ops.sql` | 目標・チケット |
| 51 | `supabase_admin_growth.sql` | 継続率 |
| 52 | `supabase_admin_exclude_admins.sql` | 自分の利用を数えない |
| 53 | `supabase_admin_members_tasks.sql` | 会員の内訳・売上 |
| 54 | `supabase_ops_advisor.sql` | 参謀の会話 |
| 55 | `supabase_ops_floor.sql` | 作戦司令室の報告 |
| 56 | `supabase_ops_sales_metrics.sql` | 営業の週の数字 |
| 57 | `supabase_admin_launch_kpis.sql` | ローンチの 4 つの数字 |
| 58 | `supabase_admin_goal.sql` | 有料ユーザー 1,000 人の目標・毎週の見直し |
| 59 | `supabase_admin_profit.sql` | 売上と推定の粗利 |

## 6. 開発する人へ（SQL を足したとき）

1. 新しい `supabase_*.sql` は何度流しても壊れない形で書く（`if not exists`・`drop policy if exists` → `create policy`・`create or replace function`・制約は名前で有無を確かめてから足す）
2. `scripts/sql-bundle.mjs` の `ORDER`（依存の順の位置）か `EXCLUDED` に入れる
3. `node scripts/sql-bundle.mjs` で `supabase_all_in_order.sql` を作り直してコミット（古いままだとテストが落ちる）
4. CLAUDE.md の「SQL マイグレーション」の表に 1 行足す
