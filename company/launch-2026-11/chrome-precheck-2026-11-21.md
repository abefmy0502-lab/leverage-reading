# Chrome への指示（再提出の前に確かめる 3 つ・2026-11-21）

> 背景: 審査への返事（`review-2026-11-19.md` の指示 B の作業 3）に「審査用のデモアカウントはプランが有効」と書いている。①それが事実か ②デモアカウントの「AI へのデータ送信」の同意が取り消してあるか（同意済みだと審査官にシートが出ない・`app-store-submission.md` §6-1）③Vercel に `REVENUECAT_SECRET_API_KEY` があるか（Sandbox で買った直後に AI が止まらないため）を、出す前に確かめる。
> 使い方: 下の「ここから」〜「ここまで」を Chrome の Claude に貼る。App Store Connect の再提出のタブはそのまま残して、新しいタブで作業してもらう。

---ここから---

あなたは Orime（読書メモの iPhone アプリ）の公開作業を手伝います。審査に出し直す前に、3 つを確かめます。いま開いている App Store Connect の返事のタブ（貼った返事が入っている）は**閉じたり読み込み直したりしないで**、新しいタブで作業してください。

## 守ること
- パスワード・2 段階認証のコード・API キー・秘密鍵・環境変数の値は、入力も表示もしないでください（目のアイコンや「値を表示」は押さない）。ログインを求められたら止めて私に頼んでください。
- 何かを消す操作はしないでください。SQL は下に書いたものだけを使ってください。
- 書きかえる SQL（作業 2 の 3）は、条件に当てはまるときだけ・1 行だけに効くことを確かめてから流してください。プラン（subscriptions）は書きかえないでください。
- 画面が手順と違うときは、推測で進めずに止めて聞いてください。

## 作業 1：デモアカウントのメールを確かめる（見るだけ）
1. 新しいタブで App Store Connect →「アプリ」→「Orime」→「配信」→ iOS アプリの **1.0** を開きます。
2. 下の方の「App Review に関する情報」（App Review Information）の「サインイン情報」で、**ユーザー名（メールアドレス）だけ**を読みます。パスワードの欄は開かない・見せないでください。
3. このメールを作業 2 で使います（報告にメールを書く必要はありません）。

## 作業 2：Supabase でデモアカウントのプランと同意を見る
1. 新しいタブで https://supabase.com/dashboard → プロジェクト（URL が tkrinnopfssdibgxuqzl のもの）→ 左の「SQL Editor」→ 新しいクエリ（「+」）を開きます。前のクエリのタブは触らないでください。
2. 次の SQL の `デモのメール` を作業 1 のメールに置きかえて Run します（読むだけの SQL です）。
```sql
select
  s.status,
  s.provider,
  s.period_type,
  s.current_period_end,
  (s.current_period_end > now()) as plan_still_valid,
  (u.raw_user_meta_data ? 'ai_consent') as consent_key_exists,
  (u.raw_user_meta_data -> 'ai_consent') as ai_consent
from auth.users u
left join public.subscriptions s on s.user_id = u.id
where u.email = 'デモのメール';
```
3. 結果を見て、次のとおりにしてください。
   - 行が 0 件 → 止めて報告（メールが違う可能性）。
   - `status` が `active` でない、または `plan_still_valid` が true でない → **書きかえずに止めて報告**（プランは私が決めます）。
   - `ai_consent` が null か空（`consent_key_exists` が false も含む）→ 同意はもう取り消してあるので、何もしません。
   - `ai_consent` に `{"version": …, "at": …}` のような値がある → 同意が残っているので、次の SQL（`デモのメール` を置きかえる）を Run して取り消します。アプリの「同意を取り消す」と同じ形（値を null にする）です。結果が **1 行**だけ更新されたことを確かめ、もう一度 2 の SQL を Run して `ai_consent` が null になったことを確かめてください。
```sql
update auth.users
set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{ai_consent}', 'null'::jsonb)
where email = 'デモのメール';
```

## 作業 3：Vercel に REVENUECAT_SECRET_API_KEY があるか（名前だけ）
1. 新しいタブで https://vercel.com → プロジェクト（orime）→「Settings」→「Environment Variables」を開きます。
2. 検索の欄に `REVENUECAT_SECRET_API_KEY` と入れ、その名前の行があるか、対象の環境（Production など）を読みます。**値は表示しないでください。**

## 報告
- 作業 2: status・provider・period_type・current_period_end・plan_still_valid の値と、同意（取り消し済みだった／いま取り消した）
- 作業 3: REVENUECAT_SECRET_API_KEY の行があるか・対象の環境
- 止まったところがあれば、その画面の文

---ここまで---
