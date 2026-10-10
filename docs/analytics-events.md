# 計測イベント — 初日の体験（2026-10-02）

`src/lib/analytics.js` の `track(event, props)` が `analytics_events(user_id, event, props, created_at)` に書くイベントのうち、
初日の体験（「自分のメモから答えが返ってきた」までの流れ）に関わるものの一覧。
props は数・真偽・32 字までの短い文字列だけ（本文・書名・検索語は入らない＝`sanitizeProps`）。
全体の方針と、ほかのイベントは `company/analytics-plan.md`。

## 流れと使うイベント

```
初回ガイド ─ onboard_path {path}
   ├ import     → import_previewed → import_done → onboard_path_done {path:'import'} → try_consult {from:'import'}
   ├ ocr        → book_added → memo_added → onboard_path_done {path:'ocr'} → try_consult {from:'ocr'}
   ├ quickstart → quickstart_started → quickstart_completed → onboard_path_done {path:'quickstart'} → try_consult {from:'quickstart'}
   └ skip（× で閉じた）
相談 ─ first_consult_sent → ai_used {feature:'brain'}
メモ ─ memos_reached_10
```

## 新しく足したイベント（2026-10-02）

| イベント | いつ | props | 送るところ |
|---|---|---|---|
| `onboard_path` | 初回ガイドの最後の画面で道を選んだ・選ばずに閉じた（×・Esc） | `path`: `import` / `ocr` / `quickstart` / `skip`、`step`: 閉じた／選んだ画面（1 / 2） | `Onboarding.jsx` |
| `onboard_path_done` | 初回ガイドで選んだ道を終えた（端末で 1 回） | `path`、取り込みは `memos`（入ったメモ＋まとめの数）、ページを撮るは `photo`（写真から書き起こした文を入れたか） | `App.jsx`（取り込みの保存・初日クイックスタートのメモ保存・メモのシートの保存） |
| `try_consult` | 道を終えた画面の「相談してみる」（取り込み・ページを撮る）／初日クイックスタートの「相談する」を押した | `from`: `import` / `ocr` / `quickstart` | `App.jsx`・`PastBooksQuickstart.jsx` |
| `first_consult_sent` | はじめての相談（AI に送る相談）を送った。前の相談が履歴に無いときだけ・端末で 1 回 | `memos`: 自分のメモの件数（数えている途中は -1）、`path`: 初回ガイドで選んだ道（無ければ `none`）、`preset`: ほかの画面から入れた相談か | `MyBookBrain.jsx` |
| `memos_reached_10` | メモ（カード式＋学び＋この本のまとめ）が 10 件になった。10 件より少ないのをこの端末で見たあとだけ（前からのユーザーはリリースの日に一斉に送らない）・端末で 1 回 | `memos`: その時の件数、`where`: `home` / `consult` | `HomeScreen.jsx`・`MyBookBrain.jsx` |

「端末で 1 回」は localStorage の印（`lib/firstDay.js` の `FIRST_DAY_KEYS`）。端末を変える・データを消すと
もう一度送ることがあるので、**集計は 1 人の最初の 1 件**で数える（下の SQL は `min(created_at)`）。

## もとからあるイベント（同じ流れで使う）

| イベント | 意味 |
|---|---|
| `signup_source` `{ch}` | 初回ガイドの「どこで知りましたか」 |
| `import_previewed` `{source, books, memos, …}` / `import_done` `{source, books, matched, memos, reviews}` | 取り込みの確かめる画面／取り込んだ |
| `quickstart_started` / `quickstart_completed` `{books, memos}` / `quickstart_first_consult` `{example}` | 初日クイックスタート |
| `book_added` `{via}` / `memo_added` `{via, count?}` | 本・メモを足した |
| `ai_used` `{feature:'brain', mode}` | 相談の答えを受け取った（中止は数えない） |
| `trial_nudge` `{action, offer}` | 10 件で出る「相談相手が育ってきました」（7 日間無料の案内） |
| `checkout_started` / `checkout_completed` | プランの購入 |

## 運営の集計（service_role で SQL Editor）

**正式なローンチの数字は `docs/launch-kpis.md`**（`supabase_admin_launch_kpis.sql` の `admin_launch_kpis`）。①「初日に相談」は
`chat_messages` を正とし、`first_consult_sent` は補助（記録の取りこぼしを拾う）。②「7 日でメモ 10 件」は `book_memos` を正とし、
`memos_reached_10` は補助。下の SQL は、イベントだけで見るときの目安と、初回ガイドの道ごとの比較用。

```sql
-- 登録から 24 時間以内に最初の相談を送った人の割合（直近 30 日に登録した人）
with u as (
  select id, created_at from auth.users
  where created_at > now() - interval '30 days' and created_at < now() - interval '1 day'
), f as (
  select user_id, min(created_at) as at from analytics_events
  where event = 'first_consult_sent' group by user_id
)
select count(*) as signups,
       count(*) filter (where f.at <= u.created_at + interval '24 hours') as consulted_24h
from u left join f on f.user_id = u.id;

-- 登録から 7 日以内にメモが 10 件になった人
-- （取り込んだメモは元の日付で入るので、book_memos.created_at ではなくこのイベントで数える）
select count(*) filter (where m.at <= u.created_at + interval '7 days') as reached_10_in_7d, count(*) as signups
from auth.users u
left join (select user_id, min(created_at) as at from analytics_events where event = 'memos_reached_10' group by user_id) m
  on m.user_id = u.id
where u.created_at between now() - interval '60 days' and now() - interval '7 days';

-- 初回ガイドの道ごとの、道を終えた率・最初の相談まで進んだ率
with p as (
  select distinct on (user_id) user_id, props->>'path' as path
  from analytics_events where event = 'onboard_path' order by user_id, created_at
)
select p.path, count(*) as users,
       count(*) filter (where exists (select 1 from analytics_events e where e.user_id = p.user_id and e.event = 'onboard_path_done')) as done,
       count(*) filter (where exists (select 1 from analytics_events e where e.user_id = p.user_id and e.event = 'first_consult_sent')) as consulted
from p group by p.path order by users desc;
```

D30（30 日後も使っている）と 7 日間無料 → 有料は、運営ダッシュボードの `admin_growth()`（`supabase_admin_growth.sql`）と
`subscriptions.period_type` で数える（このイベントは使わない）。

## 11 月の公開に向けて足したイベント（2026-10-08・マーケ戦略 §6）

### 🧪 はじめての相談の答えのあとの 7 日間無料（実験・§6-1／§9-2）

| イベント | いつ | props | 送るところ |
|---|---|---|---|
| `first_answer_trial` `{action:'eligible'}` | はじめての相談の答えが出きって、カードを出せる条件がそろった（無料プラン・7 日間無料を使える・関係するメモが無かった答えでない・根拠を確かめられた・③ を閉じていない）。**両方の組で送る**＝比べる母数 | `group`: `show`（見せる組）/ `hold`（見せない組） | `MyBookBrain.jsx` |
| `first_answer_trial` `{action:'shown'}` | 見せる組で、カード「この相談相手と、7 日間無料でもっと話す」を出した | `group: 'show'` | 同上 |
| `first_answer_trial` `{action:'tap'}` / `{action:'dismiss'}` | カードを押した（有料プランの画面へ）／× で閉じた | `group: 'show'` | 同上 |
| `paywall_viewed` `{reason:'first_answer'}` | カードから有料プランの画面を開いた | — | `Paywall.jsx` |
| `offer_code` `{action:'open'}` | 設定の「コードを使う」を押した（iPhone のアプリだけ・§6-6） | — | `AccountSettings.jsx` |

組はユーザー ID と実験の名前（`first_answer_trial_2026_11`）から決まる（`lib/firstAnswerTrial.js` の `firstAnswerTrialGroup`・どの端末でも同じ）。
**比べるのは `eligible` を送った人どうし**（`show` と `hold`）。見る数字は戦略 §7 の ⑥ 初日の 7 日間無料の開始率・⑦ 7 日間無料 → 有料・⑧ 継続。

```sql
-- 組ごとの、当日に 7 日間無料を始めた率と、有料になった率（subscription_events・supabase_subscription_events.sql）
with e as (
  select distinct on (user_id) user_id, props->>'group' as grp, created_at as at
  from analytics_events where event = 'first_answer_trial' and props->>'action' = 'eligible'
  order by user_id, created_at
), t as (
  select user_id, min(event_at) as trial_at from subscription_events
  where period_type = 'trial' group by user_id
), c as (
  select user_id, min(event_at) as paid_at from subscription_events
  where is_trial_conversion group by user_id
)
select e.grp, count(*) as eligible,
       count(*) filter (where t.trial_at between e.at and e.at + interval '24 hours') as trial_24h,
       count(*) filter (where c.paid_at is not null) as converted
from e left join t on t.user_id = e.user_id left join c on c.user_id = e.user_id
group by e.grp order by e.grp;

-- 見せる組の中で、押した・閉じた・何もしなかった
select props->>'action' as action, count(distinct user_id) from analytics_events
where event = 'first_answer_trial' and props->>'group' = 'show' group by 1 order by 2 desc;
```

> 管理者（`app_admins`）とテスト用アカウントは除いて見る。組の人数は 1 日数人のうちは揺れるので、判断は各組の `eligible` が 100 人ほどたまってから（目安・戦略 §9-2 の判断に使う）。

## 続けて使ってもらうための記録（2026-10-10）

| イベント | いつ | props | 送るところ |
|---|---|---|---|
| `app_open` | 起動のたび（`trigger:'launch'`）＋前面に戻ったとき（`trigger:'foreground'`・その端末の日付で app_open をまだ送っていない日だけ＝1 日に多くても 1 回・iOS のアプリを裏から戻したときも visibilitychange で拾う） | `trigger`: `launch` / `foreground` | `App.jsx`（`lib/analytics.js` の `trackAppOpen`・端末の印 `orime.analytics.appOpenDay`） |
| `push_opened` | 通知を押してアプリを開いた（Web の通知・iPhone の通知どちらも） | `kind`: `recall`（思い出しの通知）/ `action_deadline`（行動の期限の通知） | `App.jsx`（通知の URL の `push=` を読んで消す。前の版の通知は `lib/nativePush.js` の `withPushKind` が種類を足す） |
| `action_added` | 行動を足した | `source`: `consult`（相談の答えから）/ `memo`（メモ・思い出しカードから）/ `manual`（振り返り › 行動の「追加」・本の詳細の「＋ 行動を追加」） | `App.jsx`（`addActionFromMemo` / `createActionForBook`） |
| `focus_done` | 読む（集中モード）をおえた（30 秒未満の押し間違いは数えない） | `mode`: `timer` / `count`、`minutes`: `<5` / `5-14` / `15-29` / `30-59` / `60+` | `FocusMode.jsx` |
| `recall_answered` | 振り返りの思い出しカードで「覚えた」「まだ覚えていない」を押した | `mastered`: 覚えた＝true | `Review.jsx` |
| `checkout_started` に `memos` | プランの購入を始めたときの、ホームで最後に数えたメモの件数の区分 | `memos`: `unknown` / `0` / `1-2` / `3-9` / `10-29` / `30+` | `Paywall.jsx` |

思い出しの通知は 2026-10-10 から、作って 2 日たったメモから出す（1 日目に書いた人には 3 日目の朝ごろ・多くても週に 1 回は同じ）。
押すとそのメモの本を開いてそのメモまで送る（`/?book=<本>&memo=<メモ>&push=recall`）。

```sql
-- 通知の種類ごとの、送った週に開いた人（push_opened）
select date_trunc('week', created_at) as wk, props->>'kind' as kind, count(distinct user_id) as users
from analytics_events where event = 'push_opened' group by 1, 2 order by 1 desc, 2;

-- 行動を足したところ別（相談・メモ・手で）
select props->>'source' as source, count(*) from analytics_events
where event = 'action_added' and created_at > now() - interval '30 days' group by 1 order by 2 desc;
```

## LP（紹介ページ）の記録は別の表

ログインしていない訪問者の記録（`lp_view`・`cta_click`・`section_view`・`waitlist_submit`・`login_click`・`footer_link`・`hero_secondary` など）は `analytics_events` ではなく `lp_events` に入る（`api/lp-event.js`・`supabase_lp_events.sql`）。公開のお知らせの登録そのものは `lp_waitlist`（`api/lp-waitlist.js`）。一覧と集計例は `docs/lp-measurement.md`（2026-10-05）。

