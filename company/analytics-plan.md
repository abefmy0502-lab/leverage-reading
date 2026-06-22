# 📊 Orime 利用状況の記録（ファーストパーティ計測）プラン

> 目的：ローンチ後の「磨きの優先順位」を**実データ**で決めるための、最小限・プライバシー最優先の計測基盤。
> 関連：`supabase_analytics_events.sql`（テーブル/RLS）・`src/lib/analytics.js`（`track`）・`src/components/AccountSettings.jsx`（オプトアウト）。

## 大原則（絶対）

1. **ファーストパーティのみ** — 自前 Supabase（`analytics_events`）にだけ書く。外部トラッカー・外部ドメインへの送信は一切なし → **CSP 変更不要**。
2. **PII を絶対に送らない** — 送るのは「**イベント名 ＋ 小さな enum / 数値カウント / 真偽**」だけ。メモ本文・書名・著者・メールアドレス・検索語・自由入力は**送らない**。クライアントの `sanitizeProps` で number(有限) / boolean / 短い文字列(≤32字) **以外を構造的に捨てる**ため、自由入力や本文は型・長さで弾かれて入り込めない。
3. **オプトアウト可** — 設定（⚙️ → 📥 データ・アプリ →「📊 利用状況の記録」）でいつでもオフ。既定は ON。オフ時は `track` が即 no-op。
4. **fail-silent / never blocks** — 未設定・未ログイン・オプトアウト・テーブル未適用（schema error）・ネットワーク失敗はすべて静かに no-op。`track` は同期処理を一切ブロックしない（`Promise.resolve().then(...)` で次 tick に逃がす fire-and-forget）。

## イベント taxonomy（送るもの一覧）

> props は **enum / 数値 / 真偽のみ**。自由入力・本文・識別子は載せない。

| イベント名 | props（許可される値） | 発火意図 | 配線サーフェス |
|---|---|---|---|
| `app_open` | （なし） | 起動回数・WAU/MAU の素 | App.jsx（AuthedApp マウント時 1 回） |
| `book_added` | `via`: `'search' \| 'manual' \| 'barcode' \| 'advisor'` | 本追加の経路別ファネル | App.jsx（handleSave / addFromAdvisor）。AddBookModal の barcode 由来は後続 |
| `status_changed` | `to`: `'before' \| 'reading' \| 'done'` | 読書ファネルの進行（読了率） | App.jsx（advanceStatus） |
| `memo_added` | `mode`: `'card' \| 'summary'`, `has_photo`: bool, `has_page`: bool | 核体験（メモ）の発生頻度 | **後続**：BookMemoEditor / QuickMemoSheet / BookMemoList |
| `paywall_viewed` | （なし） | ペイウォール露出 → 転換率の分母 | App.jsx（PaywallGate でペイウォール表示時） |
| `checkout_started` | `plan`: `'monthly' \| 'annual'` | 課金転換ファネル | AccountSettings（startCheckout 近辺）。Paywall 内も後続で可 |
| `push_enabled` | （なし） | 想起プッシュのオプトイン率 | **後続**：AccountSettings の通知トグル ON 成功時 |
| `reading_progress_set` | （なし） | 進捗バー機能の利用率 | **後続**：ReadingPhase の進捗入力確定時 |
| `export_used` | `kind`: `'csv' \| 'markdown'` | データ可搬性機能の利用率 | **後続**：AccountSettings のエクスポート成功時 |
| `ai_used` | `feature`: `'advisor' \| 'brain' \| 'theme' \| 'ocr' \| 'analysis'` | AI 機能別の利用率（原価ガードの実測） | **後続**：各 AI 呼び出し成功時（ai.js or 各画面） |
| `review_opened` | （なし） | 振り返り（核）の到達率 | **後続**：Review タブ表示時 |
| `action_completed` | （なし） | 行動の実行率 | **後続**：ActionList の完了トグル時 |

定数は `src/lib/analytics.js` の `EVENTS` に列挙。配線箇所は文字列直書きでも動くが、タイポ防止に定数推奨。

### この MVP で**実際に配線済み**（App.jsx / AccountSettings）

- `app_open`（AuthedApp 初回マウント）
- `book_added` { via: 'search' | 'manual' | 'advisor' }（App.jsx で判別できる範囲。barcode は後続）
- `status_changed` { to }（advanceStatus）
- `paywall_viewed`（PaywallGate）
- `checkout_started` { plan }（AccountSettings の startCheckout 近辺）

残り（`memo_added` / `push_enabled` / `reading_progress_set` / `export_used` / `ai_used` / `review_opened` / `action_completed` / barcode 経由の `book_added`）は taxonomy に列挙のみ。各サーフェス担当が後続で 1 行 `track(...)` を仕込む。

## PII が構造的に入らない根拠

- props は `sanitizeProps` を必ず通る。許可は **有限 number / boolean / 長さ ≤32 の文字列**のみ。
  - 本文・書名・著者・検索語・メモは「長さ >32 の文字列」か「object」なので**捨てられる**。
  - object / array / null / undefined / 関数も通さない（ネストした構造で PII を忍ばせられない）。
- キー数は最大 12、キー名長は ≤32 に制限（肥大化・偶発的な PII 同梱を抑止）。
- イベント名は ≤64 字に clamp。
- 識別子は `user_id`（auth の UUID）のみ。メールやデバイス指紋は送らない。
- 送信先は `analytics_events` テーブル**のみ**（外部送信なし）。

## オプトアウト / fail-silent の経路

- `isAnalyticsOptedOut()` が `localStorage['orime-analytics-optout'] === 'true'` を見る（既定 ON）。
- `setAnalyticsOptOut(true)` で記録停止 → `track` は即 return（no-op）。
- `track` の no-op 条件：Supabase 未設定 / オプトアウト / イベント名空 / 未ログイン（getSession で user_id 取れず）/ insert 失敗（schema error 含む）。すべて静かに握りつぶす。

## 管理者向け 集計クエリ例（service_role で SQL Editor 実行）

```sql
-- 直近 30 日のイベント別ボリューム
select event, count(*) as n
from analytics_events
where created_at > now() - interval '30 days'
group by event
order by n desc;

-- 日次アクティブ（app_open ベースのユニークユーザー）
select date_trunc('day', created_at) as day, count(distinct user_id) as dau
from analytics_events
where event = 'app_open' and created_at > now() - interval '30 days'
group by day
order by day;

-- 本追加の経路別内訳（どの追加導線が使われているか）
select props->>'via' as via, count(*) as n
from analytics_events
where event = 'book_added' and created_at > now() - interval '30 days'
group by via
order by n desc;

-- 読書ファネル（before/reading/done の遷移ボリューム）
select props->>'to' as to_status, count(*) as n
from analytics_events
where event = 'status_changed'
group by to_status;

-- ペイウォール → checkout の転換（粗いファネル）
select
  count(*) filter (where event = 'paywall_viewed') as viewed,
  count(*) filter (where event = 'checkout_started') as started
from analytics_events
where created_at > now() - interval '30 days';

-- 解約・退会前提のクリーンアップは ON DELETE CASCADE（auth.users 削除で自動消去）。
```

## 拡張方針

- **新イベントを足すとき**：(1) この表に 1 行追加 → (2) `EVENTS` 定数に追加 → (3) 発火点で `track('...', { enum だけ })`。**テーブル/RLS の変更は不要**（`props jsonb` がスキーマレスに吸収）。
- **PII の追加は禁止**。どうしても粒度が要る場合も「短い enum 化」する（例：ページ数そのものではなく `bucket: '0-50'`）。
- **集計の重さ対策**：イベント数が増えたら日次ロールアップ用のマテビュー/集計テーブルを別途検討（本テーブルは追記専用の生ログのまま）。
- **保持期間**：当面は無期限の生ログ。プライバシーポリシーの保持期間方針に合わせ、将来は古い行の定期削除（service_role バッチ）を検討。
- **匿名化集計の公開**：個人を特定できない統計（例：累計読了数の分布）に限り公開可能（プライバシーポリシー第3条8号に整合）。
