# Chrome への指示（2026-11-27 の直しのあとにオーナーがやること・ブラウザでできる分）

> 背景: 11-26〜27 に、無料ユーザーの継続（1〜365 日目・読む量の 3 つの型）を数える集計・DB の守り・アーカイブと読んだところの列・無料の AI の全体の予算を SQL に足した。相談の答え方（読む前に書いた仮説を「この本の学び」として答えない）・初回ガイドの「最近、本を読んでいますか？」・ホームの「まずは 15 分だけ読んでみる」なども入れた。Web（orime.vercel.app）は main への push で公開されるので、ブラウザでそのまま確かめられる。
> Chrome でできないこと: iPhone のアプリのビルド（Mac で `npm install && npx cap sync ios` → ビルド → TestFlight）、TestFlight の確認（iPhone）、審査に出すこと（オーナーの OK のあと）。
> 使い方: 下の「ここから」〜「ここまで」を Chrome の Claude に貼る。

---ここから---

あなたは orime（読書メモのアプリ）の公開作業を手伝います。今日の作業は 4 つです。上から順に進め、最後にまとめて報告してください。

## 守ること
- パスワード・API キー・秘密鍵は、入力も表示もしないでください。ログインを求められたら止めて私に頼んでください。
- 下に書いた SQL 以外は流さないでください。データを消す操作・設定を変える操作はしないでください。
- App Store Connect で「審査に提出」「リリース」は押さないでください。
- エラーが出たら、続けずに、赤いエラーの文をそのまま報告してください（失敗した SQL は何も変えません）。

## 作業 1：本番の Supabase にまとめの SQL を流す
1. 新しいタブで https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_all_in_order.sql を開き、右上の「Raw」を押します。
2. 開いたページの文をすべて選んでコピーします（約 400KB・6,000 行ほど。途中で切れないように、最後の行まで選べたか確かめてください）。
3. https://supabase.com/dashboard → プロジェクト（URL が tkrinnopfssdibgxuqzl のもの）→ 左の「SQL Editor」→「New query」に貼り付けて、右下の「Run」を押します。
4. 「Success. No rows returned」（または NOTICE だけ）なら成功です。
   - 全部をコピーできないときは、代わりに次の 2 本を同じやり方で順に流してください（どちらも小さいファイル）:
     https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_admin_retention_days.sql → https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_admin_mcp.sql

## 作業 2：入ったか確かめる（読むだけ）
新しいクエリで次を Run して、結果をそのまま報告してください。
```sql
select
  exists (select 1 from pg_proc where proname='admin_retention_days') as retention_fn,
  exists (select 1 from pg_proc where proname='force_created_now') as hardening_fn,
  exists (select 1 from pg_proc where proname='reserve_ai_free_pool') as free_pool_fn,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='archived_at') as archived_col,
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='books' and column_name='progress_unit') as progress_col;
```
5 つとも `true` なら完了です。

## 作業 3：Web 版で今日の直しを確かめる（orime.vercel.app）
1. https://orime.vercel.app を開きます（ログインしていなければ止めて私に頼んでください）。
2. 下の「相談」タブを開き、「たとえば」に並ぶ相談例を報告してください。
   - 「『書名』の学びで、明日から使えるものは？」の形の例が出ていたら、その書名と、その本にメモがあるか（ホーム →「すべての本」→ その本を開いてメモの一覧）を確かめて報告してください。メモの無い本が出ていたら不具合です。
3. 本棚に「読書準備（得たいこと・課題・仮説）は書いたが、メモは無い本」があれば（例：『確率思考の戦略論』）、相談の入力欄に「『（その書名）』の考え方を、仕事にどう活かせる？」と書いて送ってください。
   - 答えが、読む前に書いた仮説や得たいことを「この本の学びは」「この本によると」と本の中身のように書いていないか
   - 「読む前に〜と予想していましたね」のように、読む前の言葉として触れているか
   - 答えのすぐ下に出る引用の見出しが「読む前の仮説 · 〜」になっているか
   の 3 つを、答えの文をそのまま引いて報告してください。
4. 右上の設定 →「ほかのアプリから取り込む」を開き、一覧のいちばん上に「パソコンが手元に無いとき」が無いことを確かめてください（パソコンでは出さない作り。出ていたら報告）。

## 作業 4：Kindle のまとめて保存するコードを本物の Amazon で試す（できるところまで）
1. orime の設定 →「ほかのアプリから取り込む」→「Kindle アプリ」の下の「全部の本を 1 回で保存する（パソコン）」を開き、「コードをコピー」を押します。
2. Chrome で新しいブックマークを作り、名前を「orime に保存」、URL の欄にコピーしたコードを貼ります（ブックマークを作れないときは、作業 4 はここで止めて報告してください。私が手で行います）。
3. https://read.amazon.co.jp/notebook を開き（Amazon にログインしていなければ止めて私に頼んでください）、左に本が並んだら、作ったブックマーク「orime に保存」を押します。
4. 本ごとに 0.8 秒ずつ読み、最後に「◯ 冊・ハイライト ◯ 件を保存しました。」と出て kindle-notebook.html がダウンロードされます（本が多いと数分かかります）。出た文をそのまま報告してください。
5. orime の「ほかのアプリから取り込む」→「ファイルを選ぶ」でダウンロードした kindle-notebook.html を選び、確かめる画面に出た「本 ◯ 冊・メモ ◯ 件」と、本の状態（読書中・読了）の見立てを報告してください。**「取り込む」は押さないでください**（私が中身を見てから決めます）。

## 報告
- 作業 1 の結果（成功／エラーの文）
- 作業 2 の 5 つの値
- 作業 3 の相談例・答えの文（3 つの観点）・取り込みの画面
- 作業 4 の結果（保存の文・確かめる画面の冊数とメモの数・止まったところ）

---ここまで---
