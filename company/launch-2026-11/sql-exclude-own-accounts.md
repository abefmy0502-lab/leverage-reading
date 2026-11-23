# 自分のアカウントを運営の数字から外す（公開の前に 1 回・オーナー・5 分）

> 運営ダッシュボードの「いまの有料 1・無料 5」は、いまは全部オーナー自身と審査用のアカウント（2026-11-22 時点）。公開の前に `app_admins` に入れて数から外す。
> 消すのではなく**数から外すだけ**（本やメモは残る・そのアカウントの AI は課金なしで使える）。契約の行を消すのはやめる（App Store から次の知らせが届くと書き戻され、AI も止まる）。
> Supabase の SQL Editor で流す。**①と②は続けて**（間にほかの人が登録すると、その人まで外れる）。公開の後には流さない。

```sql
-- ① 管理者に入っていないアカウントを確かめる（全部が自分と審査用のアカウントか）
select u.id, u.email, u.created_at, u.is_anonymous, s.status, s.period_type
from auth.users u
left join public.subscriptions s on s.user_id = u.id
where u.id not in (select user_id from public.app_admins)
order by u.created_at;

-- ② ①が全部自分（と審査用）なら、まとめて数から外す
insert into public.app_admins (user_id)
select id from auth.users where id not in (select user_id from public.app_admins)
on conflict do nothing;
```

- ①に知らない人がいたら、②の代わりに 1 人ずつ：`insert into public.app_admins (user_id) values ('<①の id>') on conflict do nothing;`
- 流したあと、Claude に「運営の数字を見て」と言えば、有料 0・無料 0 から数え直しになったかを確かめる。
- 審査用のアカウントの契約は、公開の日に外す（`launch-day-runbook.md` §4）。
