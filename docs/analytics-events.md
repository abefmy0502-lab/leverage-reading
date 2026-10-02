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
