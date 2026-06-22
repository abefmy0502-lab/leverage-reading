# 📈 直接課金ファネル計測 設計（LP → signup → checkout → 課金）

> CEO起草 2026-06-22。`sns-sales-plan-july.md`§7 の具体設計。北極星＝**有料課金者数**。プライバシー思想（PII送らない・自前Supabaseのみ・fail-silent）厳守。

## 0. 結論ファースト
- **計測できる場所が2層に分かれる**：①ログイン前（LP〜登録）＝自前DBに書けない ②ログイン後（活性化〜課金）＝`analytics_events`で追える。
- 今回、ログイン後ファネルの**欠けていた2イベントを実装**：`checkout_started`（ペイウォール）/`checkout_completed`（決済成功復帰）。
- **課金者数の"真実"は `subscriptions` テーブル＋Stripeダッシュボード**。`checkout_completed` は転換の動き（UX計測）用で、売上の正本ではない。

## 1. ファネル全体と計測層

```
[SNS投稿] ──UTM/リンク──▶ [LP /lp] ──「始める」──▶ [/?auth=signup 登録] ──確認メール──▶ [ログイン]
   └ SNS側の分析          └ ▲ここまで自前DB不可      └ Supabase Authの登録数        │
                                                                                  ▼
                                                   [app_open] ▶ [paywall_viewed] ▶ [checkout_started] ▶ [Stripe] ▶ [checkout_completed]＝🎯
                                                   └──────────── analytics_events（ログイン後・自前DB）────────────┘
                                                                                                         （真実）[subscriptions.status='active']
```

### なぜログイン前は自前DBに書けないか（設計上の制約・正直に）
- `analytics.js` の `track()` は **未ログイン時に no-op**（`resolveUserId()` が user_id を返せない＝RLSで書けない・匿名追跡をしない設計）。
- さらに **メール確認ON**（商用化チェックリスト）だと、登録直後はセッションが無く、登録イベントも自前DBに残せない。
- → **これは弱点でなく思想**（匿名トラッキングをしない＝CSP変更不要・プライバシー最優先）。ログイン前は外部の手段で測る（下記）。

### ログイン前の代替計測（外部）
| 段 | 測り方 |
|---|---|
| SNS→LP クリック | 投稿リンクに**UTM**（例 `?utm_source=x&utm_campaign=launch`）／X Analyticsのリンククリック／短縮リンク |
| LP→登録 開始 | LPの「始める」クリック数は当面**推定**（SNSクリックと登録数の差分）。将来、必要なら軽量beaconを別途検討（今はやらない＝過剰計測回避） |
| 登録（アカウント作成数） | **Supabase Auth ダッシュボード**（管理者）。`auth.users` の作成数・確認済み率 |

## 2. ログイン後の自前計測（analytics_events）— 今回の実装

| イベント | 発火点 | 状態 |
|---|---|---|
| `app_open` | AuthedApp マウント（初回認証セッション）＝活性化の代理 | 既存 |
| `paywall_viewed` | PaywallGate でペイウォール表示時（転換の分母） | 既存 |
| `checkout_started` { plan } | **Paywall.handleSubscribe**（決済ページへ送る直前） | ✅**今回追加**（主要導線が未計測だった穴を解消） |
| `checkout_completed` | **?checkout=success 復帰時に1回**（App.jsx PaywallGate） | ✅**今回追加**（ファネル終端＝転換の動き） |

- すべて **PII なし**（plan は enum のみ）。`checkout_completed` はクエリを消してから計上するので**リロード再発火なし**。
- 注：`checkout_started` は AccountSettings（設定内の課金）にも既存。ペイウォールと設定の両導線が揃った。

## 3. 売上の"真実"（正本）
- **`subscriptions` テーブル**（`status='active'`）＝entitlementの真実。Stripe/RevenueCat webhookが service_role で書く。
- **Stripe ダッシュボード**＝MRR・課金者数・解約・返金の正本。
- → **北極星「有料課金者数」は subscriptions / Stripe で数える**。`checkout_completed` は「決済完了画面に戻ってきた人数」で、webhook反映前のUX指標（両者は概ね一致するが、決済直後の離脱や反映ラグでズレうる）。

## 4. 毎週見る（KPIダッシュボード・SQLは service_role で SQL Editor 実行）

```sql
-- ログイン後ファネル（直近30日・段ごとのユニークユーザー）
select
  count(distinct user_id) filter (where event = 'app_open')          as activated,
  count(distinct user_id) filter (where event = 'paywall_viewed')    as saw_paywall,
  count(distinct user_id) filter (where event = 'checkout_started')  as started_checkout,
  count(distinct user_id) filter (where event = 'checkout_completed') as completed_checkout
from analytics_events
where created_at > now() - interval '30 days';

-- プラン別の checkout_started（年額/月額どちらが選ばれているか）
select props->>'plan' as plan, count(*) as n
from analytics_events
where event = 'checkout_started' and created_at > now() - interval '30 days'
group by plan;

-- 課金者数の真実（subscriptions）
select count(*) as active_paid
from subscriptions
where status = 'active';
```

**読み方（どこで漏れているか＝磨きの的）：**
- `saw_paywall` → `started_checkout` が低い＝**ペイウォールの説得力不足**（価値プレビュー/価格提示を磨く）。
- `started_checkout` → `completed_checkout` が低い＝**Stripe決済画面での離脱**（価格ショック/入力摩擦。年額主役の見せ方・¥表示を見直す）。
- `activated` → `saw_paywall` はほぼ100%のはず（未課金はペイウォールに必ず当たる）。乖離があれば実装バグを疑う。
- ログイン前（SNS→LP→登録）の歩留まりは外部数値で別途。**登録は来るのに app_open が伸びない＝メール確認で脱落**を疑う。

## 5. やらないこと（過剰計測の回避）
- 匿名・ログイン前の自前トラッキングは**やらない**（プライバシー思想・CSP不変）。
- PostHog等の外部トラッカーは**法務前提（プライバシーポリシーに委託先追記）が通るまで入れない**。当面は自前 analytics＋Stripe＋Supabase Authダッシュボードで十分。
- UTMビーコンの作り込みは需要が見えてから（今はSNS側分析＋登録数で足りる）。

## 6. 実装サマリ（このコミット）
- `src/lib/analytics.js`：EVENTS に `CHECKOUT_COMPLETED` 追加。
- `src/components/Paywall.jsx`：`handleSubscribe` で `checkout_started`{plan} を計上。
- `src/App.jsx`：`?checkout=success` 復帰時に `checkout_completed` を1回計上。
- （関連）`src/pages/Landing.jsx`：CTA を `/?auth=signup` に（登録直行＝摩擦減）。`src/components/auth/AuthScreen.jsx`：`?auth=signup` で登録モード初期化。
