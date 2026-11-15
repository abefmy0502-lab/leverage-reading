# Claude in Chrome に渡す指示文（Supabase の SQL・審査用のデモアカウント・2026-11-15）

> 使い方: 下の「---」から最後までを全部コピーして、Claude in Chrome に貼る。Chrome で Supabase・GitHub・Gmail（orime.support@gmail.com）・App Store Connect にログインしておく。
> 中身は `docs/sql-runbook.md` §1〜2 と `company/app-store-submission.md` §7。

---

あなたは私（iPhone アプリ「Orime」の運営者）の代わりに、①Supabase のデータベースを最新にし、②App の審査で Apple の審査官が使うデモアカウントを用意し、③その情報を App Store Connect の審査の欄に入れます。私は横で見ています。

## 守ること
- **データを消す SQL を書かない・流さない**（delete・drop・truncate を自分で書かない）。流すのは下に書いた SQL と、リポジトリの 2 つのファイルだけ。
- Supabase の **service_role の鍵・データベースのパスワード**は開かない・読まない。
- 私のふだんのアカウント（運営者のアカウント）の設定は変えない。
- エラーが出たら、赤い文をそのまま報告して止まる。勝手に直す SQL を書かない。
- 各ステップが終わるたびに 1〜2 行で報告する。

## ステップ 1: データベースを最新にする
1. GitHub で `https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_all_in_order.sql` を開く →「Raw」→ 全部選んでコピー（約 5,000 行。途中で切れると失敗するので、コピーした行数か最後の行が `-- ` で終わるかを確かめる）。
   - うまくコピーできないときは止まって私に知らせる（私が Mac から貼る）。
2. Supabase → プロジェクト（URL に `tkrinnopfssdibgxuqzl` を含むもの）→ 左の「SQL Editor」→「New query」→ 貼り付け →「Run」。
3. `Success. No rows returned`（か、NOTICE だけ）なら成功。結果を報告する。
4. 同じやり方で `supabase_verify_rls.sql` を流し、どの表も `rls_enabled` が `t`、「誰にでも開いた決まり」が 0 行かを報告する。

## ステップ 2: デモアカウントを作る
1. https://orime.vercel.app を開く（ログイン中なら、私のアカウントからログアウトはせずに、**シークレットウィンドウ**で開く。開けなければ止まって聞く）。
2. 新しいアカウントを作る:
   - メール: `orime.support+review@gmail.com`
   - パスワード: 英大文字・小文字・数字を混ぜた 16 文字を自分で作る（記号は使わない）。**報告に書いてよい**（Apple の審査の欄に入れるため）。
3. 確認のメールが来たら、Gmail（orime.support@gmail.com）で開いて確認のリンクを押す。
4. ログインして、初回ガイドを最後まで進める。
5. 本を 3 冊足す（「本を追加」で書名を検索して選ぶ・状態は **読了**）:
   - `嫌われる勇気`
   - `7つの習慣`
   - `考え方 稲盛和夫`
6. 各本の詳細の「メモを書く」から、次のメモを 1 件ずつ保存する（合わせて 10 件・文はそのまま）:
   - 嫌われる勇気
     - `他人の課題と自分の課題を分ける。相手が自分をどう評価するかは相手の課題。`
     - `ほめるのでも叱るのでもなく、ありがとうと伝える。`
     - `今ここに集中する。過去と未来は、今の言い訳にしない。`
   - 7つの習慣
     - `反応する前に一呼吸おく。刺激と反応のあいだには選択の自由がある。`
     - `緊急ではないが重要なことに、週のはじめに時間をとる。`
     - `まず理解に徹し、そして理解される。`
     - `終わりを思い描くことから始める。`
   - 考え方 稲盛和夫
     - `「できる」と信じ切れないと、少し難しいと思っただけで手が止まる。`
     - `小さな工夫を毎日重ねることが、大きな成果につながる。`
     - `朝のうちに、その日に考えることを決めておく。`
7. 相談のタブで 1 回だけ相談する: `会議で意見を言いにくい。どうしたらいい？`（AI に送る内容の確認が出たら「同意して続ける」）。答えが返ることを確かめる。
8. 設定 → プライバシー →「AI へのデータ送信」で **同意を取り消す**（審査官が同意の画面を見られるように）。
9. ログアウトする。

## ステップ 3: デモアカウントを課金済みにする
Supabase の SQL Editor で、次をそのまま Run する（このアカウントだけを「プラン契約中」にする）:
```sql
insert into public.subscriptions (user_id, status, provider, period_type, current_period_end)
select id, 'active', 'manual', 'normal', now() + interval '1 year' from auth.users where email = 'orime.support+review@gmail.com'
on conflict (user_id) do update set status = 'active', provider = 'manual', period_type = 'normal', current_period_end = excluded.current_period_end;
```
続けて、入ったかを確かめる:
```sql
select s.status, s.provider, s.current_period_end from public.subscriptions s join auth.users u on u.id = s.user_id where u.email = 'orime.support+review@gmail.com';
```
`active`・`manual` が 1 行出れば成功。

## ステップ 4: 運営者が管理者になっているか（読むだけ）
```sql
select u.email from public.app_admins a join auth.users u on u.id = a.user_id;
```
出たメールアドレスの件数だけを報告する（中身は書かなくてよい）。0 件なら止まって私に聞く。**デモアカウントは管理者に入れない**。

## ステップ 5: App Store Connect の審査の欄
App Store Connect → Orime → 配信 → iOS App → 1.0 →「App Review に関する情報」:
- サインインが必要: **はい**
- ユーザー名: `orime.support+review@gmail.com`
- パスワード: ステップ 2 で作ったもの
- 連絡先（姓・名・電話・メール）は**空のまま**にして、私に知らせる（私が入れる）。
- メモの欄の `email=【オーナーが入れる】 / password=【オーナーが入れる】` を、このメールとパスワードに置き換える（ほかの文は変えない）。
- 保存する。「審査に提出」は押さない。

## ステップ 6: 最後の報告
1. 終わったこと（ステップごと）
2. デモアカウントのメールとパスワード
3. 私がやること（App Store Connect の連絡先・ほかに止まった所）
