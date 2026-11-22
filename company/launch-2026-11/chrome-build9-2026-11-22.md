# ビルド 9（フォローあり）で再提出する・Chrome への指示（2026-11-22）

> 背景: オーナー「8 も入れたい」→ ビルド 8 の内容に、残りの画面の点検の直し 9 件（iPhone のデータの書き出しが何も残さなかった＝審査 2.1 にも関わる・ほか）を足した **ビルド 9（1.0.0 (9)・フォローあり）** を 2026-11-22 18:42 にアップロード済み。
> 前回の提出（2026-11-18 22:20・未解決の問題）はバージョンを押さえていてビルドを替えられない。iOS アプリだけを ⊖ で外すと、課金 5 件と別々の提出に分かれる（はじめての課金はアプリと一緒に出す必要がある）。だから **提出をまるごとキャンセル → ビルド 9 を付ける → アプリと課金 5 件を 1 つの新しい提出にまとめて出す**。キャンセルしても何も消えない（項目は審査の前の状態に戻るだけ）。
> 見本のアカウント（審査官のデモアカウントがフォローしている人）は、パスワードを使わずに用意する（Supabase の「招待」＋ SQL。SQL は足す・オンにするだけで、何も消さない）。

使い方: 下の「見本用のメールアドレス」を埋めて、「ここから」〜「ここまで」を Chrome の Claude に貼る。**貼ることが、提出のキャンセルと再提出への OK** です。

- 見本用のメールアドレス: `＿＿＿＿＿＿＿＿＿＿`（オーナーが受け取れるアドレス。例: いつもの Gmail に `+sample` を付けたもの。招待メールが届くが、開かなくてよい）

---ここから---

あなたは Orime（読書メモのアプリ）の公開作業を手伝います。オーナーの了承のもと、App Store の審査に「ビルド 9」で出し直します。順番どおりに進め、各作業の結果を最後にまとめて報告してください。

## 守ること
- パスワード・2 段階認証のコード・鍵（.p8、sk_ で始まる値など）は扱わない・読まない。ログインを求められたら止めて私に頼む。
- 支払い・契約の画面には進まない。値段・配信の国・年齢区分は変えない。
- SQL は下に書いたものだけを流す（ほかの SQL は流さない・DELETE や DROP を足さない）。
- 画面が手順と違う・迷うときは、止めて画面の文をそのまま報告する。

## 作業 1：見本のアカウントを招待で作る（Supabase）
1. https://supabase.com/dashboard → プロジェクト（URL に tkrinnopfssdibgxuqzl を含む）→ 左の「Authentication」→「Users」。
2. 右上「Add user」→「Send invitation」→ メール欄に **（見本用のメールアドレス）** を入れて送る。
   - パスワードの欄が出る「Create new user」は使わない。
   - すでに同じメールのユーザーがいれば、何もせず次へ。

## 作業 2：デモアカウントのメールアドレスを読む（App Store Connect・読むだけ）
1. https://appstoreconnect.apple.com → アプリ → Orime → iOS App のバージョン 1.0 →「App Review に関する情報」の「サインイン情報」の**ユーザー名**（メールアドレス）を控える。パスワードの欄は読まない。

## 作業 3：見本の本棚とフォローを SQL で用意する（Supabase）
1. Supabase の左「SQL Editor」→「New query」に、下の SQL を貼る。`SAMPLE_EMAIL` を作業 1 のメール、`DEMO_EMAIL` を作業 2 のメールに置き換える（2 か所ずつ・引用符は残す）。
2. Run。警告が出たら文を報告してから続ける（この SQL は追加と更新だけ）。
3. 結果に出た `public_id`（英小文字と数字の 10 字）を控える＝**見本の ID**。

```sql
do $$
declare s uuid; d uuid;
begin
  select id into s from auth.users where lower(email) = lower('SAMPLE_EMAIL');
  select id into d from auth.users where lower(email) = lower('DEMO_EMAIL');
  if s is null then raise exception '見本のアカウントが見つかりません（作業 1 のメールを確かめてください）'; end if;
  if d is null then raise exception 'デモアカウントが見つかりません（作業 2 のメールを確かめてください）'; end if;

  -- 見本のプロフィール（公開・本棚も公開・まとめも公開）
  insert into public.profiles (user_id, public_id, nickname, bio, avatar, is_public, shelf_public, summary_public)
  values (s, lower(substr(md5(random()::text || clock_timestamp()::text), 1, 10)), 'みほん', '仕事で読んだ本のまとめを残しています。', 'leaf', true, true, true)
  on conflict (user_id) do update set nickname = 'みほん', is_public = true, shelf_public = true, summary_public = true;

  -- デモアカウントのニックネーム（無いときだけ）
  insert into public.profiles (user_id, public_id, nickname, avatar)
  values (d, lower(substr(md5(random()::text || clock_timestamp()::text), 1, 10)), 'デモ', 'book')
  on conflict (user_id) do update set nickname = case when public.profiles.nickname = '' then 'デモ' else public.profiles.nickname end;

  -- 見本の本棚（まだ本が無いときだけ 3 冊）
  if not exists (select 1 from public.books where user_id = s) then
    insert into public.books (user_id, title, author, isbn, status, rating, start_date, done_date, leverage_memo, added_via) values
      (s, 'イシューからはじめよ', '安宅和人', '9784862760852', 'done', 5, current_date - 40, current_date - 30,
       '手を動かす前に「本当に答えを出すべき問い」を決める。' || chr(10) || '解の質より、問いの質が成果を決める。', 'search'),
      (s, '1兆ドルコーチ', 'エリック・シュミット ほか', null, 'done', 4, current_date - 25, current_date - 15,
       '1 on 1 は相手の仕事の話の前に、相手の人生の話から始める。' || chr(10) || 'チームの信頼が、率直な議論の土台になる。', 'search'),
      (s, '数値化の鬼', '安藤広大', null, 'reading', 0, current_date - 5, null, null, 'search');
  end if;

  -- デモアカウントが見本をフォロー（承認済み）
  insert into public.follows (follower_id, followee_id, status, accepted_at)
  values (d, s, 'accepted', now())
  on conflict (follower_id, followee_id) do update set status = 'accepted', accepted_at = coalesce(public.follows.accepted_at, now());

  -- 審査官が AI の同意の画面を見られるように、デモアカウントの同意の記録を外す（設定 → プライバシー →「AI へのデータ送信」を取り消すのと同じ）
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'ai_consent' where id = d;
end $$;

select p.public_id, p.nickname, p.is_public, p.shelf_public, p.summary_public,
       (select count(*) from public.books b where b.user_id = p.user_id) as books,
       (select status from public.follows f where f.followee_id = p.user_id and f.follower_id = (select id from auth.users where lower(email) = lower('DEMO_EMAIL'))) as follow
from public.profiles p
where p.user_id = (select id from auth.users where lower(email) = lower('SAMPLE_EMAIL'));
```

期待する結果: 1 行・nickname「みほん」・3 つの true・books 3・follow「accepted」。

## 作業 4：前回の提出をキャンセルする（App Store Connect）
1. 左の「App Review」→ ステータス「未解決の問題」の提出（2026-11-18 22:20・6 件）を開く。
2. 「提出をキャンセル」を押す。確認の文を報告し、「提出を取り消す（項目は残る）」意味なら確定する。「削除」「アプリを消す」意味なら止める。
3. キャンセルのあと、バージョン 1.0 と課金 5 件（月額・年額・Orime プラン・トークン 300・トークン 1000）の状態を報告する。

## 作業 5：ビルド 9 を付けて、審査メモを差し替える
1. iOS App → バージョン 1.0 のページ。「ビルド」の欄でビルド 7 を外し（− か「ビルドを選択」）、**1.0.0 (9)** を選んで「完了」。
   - ビルド 9 が「処理中」なら、10 分ほど待ってからやり直す。30 分たっても出なければ止めて報告。
   - 輸出コンプライアンスを聞かれたら「暗号化を使っていない、または免除（HTTPS だけ）」。
2. 「App Review に関する情報」の「メモ」（Notes）を、**この後に私（Claude）が渡す全文**に置き換える。
   - 全文は `company/launch-2026-11/review-notes-build8-2026-11-22.md` の §2 の中身で、`____`（2 か所）を作業 3 の**見本の ID** に置き換えたもの。Chrome で GitHub のファイルを開けない場合は、作業 3 の ID を報告して止まる（私が全文を渡す）。
3. ページ右上の「保存」。

## 作業 6：アプリと課金 5 件を 1 つの提出にまとめて出す
1. バージョン 1.0 のページの「アプリ内課金とサブスクリプション」の欄で、5 件（月額・年額・Orime プラン の 2 つのサブスクリプション、トークン 300・トークン 1000）を選んで「完了」。
2. 右上の「審査用に追加」（Add for Review）→ 提出の下書きに **6 件**（iOS アプリ 1.0 = 1.0.0 (9) と課金 5 件）が入っていることを確かめて報告。
3. 6 件そろっていたら「審査へ提出」（Submit for Review）。確認が出たら文を報告し、提出の意味なら確定する。足りなければ押さずに止めて報告。

## 報告
- 作業 1: 招待できたか（すでにいたか）
- 作業 3: SQL の結果の 1 行（public_id を含む）
- 作業 4: キャンセルの確認の文・そのあとの 6 件の状態
- 作業 5: ビルド番号・メモを差し替えたか
- 作業 6: 提出の 6 件・提出のあとのステータス（例「審査待ち」）

---ここまで---

## 結果
（Chrome の報告をここに）
