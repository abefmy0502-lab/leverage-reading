# Mac の Claude Code に渡す指示文（審査用のデモアカウントを自動で作る・2026-11-15）

> 使い方: Mac の Claude Code（leverage-reading のフォルダで動いているもの）に、下の「---」から最後までを貼る。
> 画面を使わずに、公開用の鍵（anon）と Supabase の決まりの範囲だけで作る（サーバー用の秘密の鍵は使わない）。
> 確認のメールの代わりに、Chrome の Claude が SQL で「確認済み」にする 1 行を流す。

---

App の審査で Apple の審査官が使う「デモアカウント」を、画面を使わずに作ってください。

## 守ること
- 使ってよい鍵は `.env.production.local` の `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY`（公開用）だけ。サーバー用の秘密の鍵は使わない・探さない。
- パスワードはあなたが作り、**チャットにも画面にも出さない**。`.env.review.local`（git に入らない・`.env.*.local`）に保存し、`pbcopy` でクリップボードにも入れる。
- 作るのはこのアカウントの本とメモだけ。ほかのアカウント・ほかの表は触らない。コミット・push はしない。
- スクリプトは `build/` の下の一時ファイルに書き、終わったら消す。

## 手順
1. **パスワードを作る**: 英大文字・小文字・数字の 16 文字（記号なし）。`.env.review.local` に次の 2 行で保存する（値は表示しない）:
   ```
   REVIEW_EMAIL=orime.support+review@gmail.com
   REVIEW_PASSWORD=<作ったパスワード>
   ```
2. **アカウントを作る**: Node と `@supabase/supabase-js`（リポジトリに入っている）で `auth.signUp({ email, password })`。
   - すでにある（User already registered）なら、作らずに次へ。
   - 結果は「作れた／すでにある」「確認済みか（session が返ったか）」だけを報告する。
3. **確認済みでなければ止まる**。私にこう伝える: 「Chrome の Claude に、次の 1 行を流してもらってください」:
   ```sql
   update auth.users set email_confirmed_at = now() where email = 'orime.support+review@gmail.com' and email_confirmed_at is null;
   ```
   私が「流した」と言ったら 4 へ。
4. **ログインして、本とメモを入れる**: `auth.signInWithPassword` → そのユーザーとして（RLS の範囲で）入れる。
   - `books` に 3 冊（`user_id` は本人・`status: 'done'`・`rating: 5`・`added_via: 'search'`・`start_date` は 60 日前・`done_date` は 30 日前）:
     - `嫌われる勇気`／`岸見一郎, 古賀史健`
     - `完訳 7つの習慣`／`スティーブン・R・コヴィー`
     - `考え方`／`稲盛和夫`
   - すでに同じ書名の本があれば足さない。
   - `book_memos` に 10 件（`book_id` はその本・`user_id` は本人・`tags: []`・`created_at` は 1 件ずつ 1〜25 日前にずらす）:
     - 嫌われる勇気: `他人の課題と自分の課題を分ける。相手が自分をどう評価するかは相手の課題。` / `ほめるのでも叱るのでもなく、ありがとうと伝える。` / `今ここに集中する。過去と未来は、今の言い訳にしない。`
     - 完訳 7つの習慣: `反応する前に一呼吸おく。刺激と反応のあいだには選択の自由がある。` / `緊急ではないが重要なことに、週のはじめに時間をとる。` / `まず理解に徹し、そして理解される。` / `終わりを思い描くことから始める。`
     - 考え方: `「できる」と信じ切れないと、少し難しいと思っただけで手が止まる。` / `小さな工夫を毎日重ねることが、大きな成果につながる。` / `朝のうちに、その日に考えることを決めておく。`
   - すでに同じ文のメモがあれば足さない。
   - AI の同意は付けない（新しいアカウントは未同意のまま＝審査官が同意の画面を見られる）。
   - 最後に `auth.signOut()`。
5. **確かめる**: もう一度ログインして、本の数・メモの数・本ごとのメモの数を数えて報告し、ログアウトする。
6. **課金済みにする SQL を私に渡す**: 次をそのまま報告に書く（私が Chrome の Claude に流してもらう）:
   ```sql
   insert into public.subscriptions (user_id, status, provider, period_type, current_period_end)
   select id, 'active', 'manual', 'normal', now() + interval '1 year' from auth.users where email = 'orime.support+review@gmail.com'
   on conflict (user_id) do update set status = 'active', provider = 'manual', period_type = 'normal', current_period_end = excluded.current_period_end;
   ```
7. **パスワードをクリップボードに入れる**: `grep '^REVIEW_PASSWORD=' .env.review.local | cut -d= -f2- | tr -d '\n' | pbcopy`。私に「App Store Connect の『App Review に関する情報』のパスワード欄で ⌘V してください」と伝える。
8. 一時ファイルを消して、終わったことを報告する（パスワードは書かない）。
