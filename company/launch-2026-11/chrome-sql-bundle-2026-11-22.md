# Chrome への指示（本番の Supabase にまとめの SQL を流す・2026-11-22）

> 背景: 「本のまとめも公開する」を保存しても、それだけオフに戻る。本番のデータベースに `profiles.summary_public` の列がまだ無い（アプリは列が無いとき、その部分だけ外して保存する）。あわせて、フォロー（ビルド 8 の再審査に入れる）・アプリの中の通報（`report_profile`）・公開が黙ってオフに戻る直し（`_auth_is_anonymous`）も、この SQL で入る。利用者のデータを消す文は入っていない（`scripts/sqlBundle.test.js` が確かめる）・何度流しても壊れない。
> 使い方: 下の「ここから」〜「ここまで」を Chrome の Claude に貼る。

---ここから---

あなたは orime（読書メモのアプリ）の公開作業を手伝います。本番の Supabase に、リポジトリのまとめの SQL を流します。

## 守ること
- パスワード・API キー・秘密鍵は、入力も表示もしないでください。ログインを求められたら止めて私に頼んでください。
- 下に書いた SQL 以外は流さないでください。何かを消す操作もしないでください。
- エラーが出たら、続けずに、赤いエラーの文をそのまま報告してください（失敗した SQL は何も変えません）。

## 作業 1：まとめの SQL を流す
1. 新しいタブで https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_all_in_order.sql を開き、右上の「Raw」を押します。
2. 開いたページの文をすべて選んでコピーします（約 6,000 行。途中で切れないように、全部選べたか最後の行まで確かめてください）。
3. https://supabase.com/dashboard → プロジェクト（URL が tkrinnopfssdibgxuqzl のもの）→ 左の「SQL Editor」→「New query」に貼り付けて、右下の「Run」を押します。
4. 「Success. No rows returned」（または NOTICE だけ）なら成功です。

## 作業 2：入ったか確かめる（読むだけ）
新しいクエリで次を Run して、結果を報告してください。
```sql
select
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='summary_public') as summary_public_col,
  exists (select 1 from pg_proc where proname='report_profile') as report_fn,
  exists (select 1 from pg_proc where proname='_auth_is_anonymous') as anon_fn,
  exists (select 1 from pg_proc where proname='follow_request') as follow_fn;
```
4 つとも `true` なら完了です。

## 報告
- 作業 1 の結果（成功／エラーの文）
- 作業 2 の 4 つの値

---ここまで---
