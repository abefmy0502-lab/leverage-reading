# Chrome への指示（11/22〜11/23 にオーナーがやり残していそうなこと・2026-11-23）

> 中身: ①本番の Supabase にまとめの SQL を流し直す（1 冊だけ共有の `shared_books`・フォロー中／フォロワーの一覧と「見せる」スイッチ・それより前の分も入る）②自分と審査用のアカウントを運営の数字から外す（`sql-exclude-own-accounts.md`・確かめてから）③Vercel の `VITE_FOUNDING_OFFER_END` を Secret でない形で作り直す（`launch-day-runbook.md` §0）。
> 入れていないもの（Chrome に任せない）: SNS・OpenAI の鍵（秘密）、公開のメールの【住所】、`company/sns-prep/` の自分の体験の伏せ字、LINE オープンチャット、公開の朝の `VITE_APP_STORE_URL`・`VITE_RELEASE_NOTES_SINCE`（承認のあと）。
> 使い方: 下の「ここから」〜「ここまで」を Chrome の Claude に貼る。

---ここから---

あなたは Orime（読書メモのアプリ）の公開作業を手伝います。今日やることは 3 つです。順番に進めて、最後にまとめて報告してください。

## 守ること
- パスワード・API キー・秘密鍵・確認コードは、入力も表示もしないでください。ログインや 2 段階の確認を求められたら、止めて私に頼んでください。
- 書いてある操作以外はしないでください。データを消す操作はしないでください（作業 3 の「環境変数を作り直す」だけは例外で、同じ値で作り直します）。
- エラーが出たら、続けずに、エラーの文をそのまま報告してください。

## 作業 1：本番の Supabase にまとめの SQL を流す（約 5 分）
理由: アプリの「この本を共有」を押すと「この本の共有は、まだ使えません。」と出る。本番のデータベースに、11/23 に足した列（`profiles.shared_books`・`profiles.follows_visible`）と関数がまだ無いため。この SQL は何度流しても壊れず、利用者のデータを消す文は入っていません。
1. 新しいタブで https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_all_in_order.sql を開き、右上の「Raw」を押します。
2. 開いたページの文をすべて選んでコピーします（約 6,000 行。最後の行まで選べたか確かめてください）。
3. https://supabase.com/dashboard → プロジェクト（URL に tkrinnopfssdibgxuqzl が入っているもの）→ 左の「SQL Editor」→「New query」に貼り付けて、右下の「Run」を押します。
4. 「Success. No rows returned」（または NOTICE だけ）なら成功です。
5. 新しいクエリで次を Run して、5 つの値を控えてください（読むだけ）。
```sql
select
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='shared_books') as shared_books_col,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='follows_visible') as follows_visible_col,
  exists (select 1 from pg_proc where proname='followee_connections') as connections_fn,
  exists (select 1 from pg_proc where proname='set_follows_visible') as visible_fn,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='summary_public') as summary_public_col;
```
5 つとも `true` なら完了です。

## 作業 2：自分と審査用のアカウントを、運営の数字から外す（約 5 分・私の確認が要る）
理由: 運営ダッシュボードの「有料 1・無料 5」は、いまは私自身と審査用のアカウントだけ。公開の前に数から外す（消すのではなく、管理者の一覧に入れるだけ。本やメモは残る）。
1. Supabase の SQL Editor の新しいクエリで、次を Run します（読むだけ）。
```sql
select u.id, u.email, u.created_at, u.is_anonymous, s.status, s.period_type
from auth.users u
left join public.subscriptions s on s.user_id = u.id
where u.id not in (select user_id from public.app_admins)
order by u.created_at;
```
2. **ここで止まって**、出てきた行（メールと作った日）を私に見せ、「全部あなたのアカウントか、審査用のアカウントですか？」と聞いてください。
3. 私が「全部そう」と答えたら、次を Run します。
```sql
insert into public.app_admins (user_id)
select id from auth.users where id not in (select user_id from public.app_admins)
on conflict do nothing;
```
4. 私が「この人は違う」と言った行があれば、③は流さず、私が指定した id だけを 1 つずつ入れます：`insert into public.app_admins (user_id) values ('<id>') on conflict do nothing;`
5. 最後にもう一度 1. を Run して、0 行になったか（または私が残すと言った人だけか）を控えてください。

## 作業 3：Vercel の VITE_FOUNDING_OFFER_END を、Secret でない形で作り直す（約 3 分）
理由: この値が Secret（Sensitive）になっていると、GitHub からの本番の出し直しで値が読めず、食い違いのもとになる。値は日付で、秘密ではない。
1. https://vercel.com → Orime のプロジェクト（orime）→ Settings → Environment Variables を開きます。
2. `VITE_FOUNDING_OFFER_END` を探し、今の設定（Sensitive かどうか・どの環境に入っているか）を控えます。
3. Sensitive でなく、値が `2027-01-10` なら、何もせずに作業 3 は終わりです。
4. Sensitive なら：同じ名前の変数を削除し、Add New で作り直します。
   - Key：`VITE_FOUNDING_OFFER_END`
   - Value：`2027-01-10`
   - Environments：Production（もともと Preview にも入っていたら、Preview も）
   - **Sensitive はオフ**
5. 保存したら、Deployments の いちばん上の本番の「…」→「Redeploy」を押します（Use existing Build Cache はオフ）。終わったら https://orime.vercel.app/lp を開き、料金の節に「1月10日」まで、と出ているかを確かめます。

## 報告（最後にまとめて）
- 作業 1：成功／エラーの文、確かめの 5 つの値
- 作業 2：①で出た行の数と、何件を管理者に入れたか、最後の確かめの行の数
- 作業 3：もともとの設定（Sensitive か・環境）、作り直したか、LP の確かめの結果

---ここまで---
