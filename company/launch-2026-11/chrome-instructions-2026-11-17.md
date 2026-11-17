# Claude in Chrome への指示文（2026-11-17・build 5 の再提出の日）

下の「ここから」〜「ここまで」をそのまま Claude in Chrome に貼る。
Mac の作業（git pull・ビルド・Xcode で build 5 を Archive してアップロード）は Chrome ではできないので、先に Mac で済ませておく。

---ここから---

あなたは Orime（読書メモの iPhone アプリ）の公開作業を手伝います。私の Chrome で、次の 4 つの作業を順に進めてください。

## 守ること（いちばん大事）
- パスワード・2 段階認証のコード・API キー・秘密鍵は、入力も表示もしないでください。ログインや確認コードを求められたら、そこで止めて私に頼んでください。
- お金の支払い・契約・規約への同意のボタンは押さないでください。出てきたら止めて私に聞いてください。
- データを消す操作（削除・DELETE・DROP TABLE・TRUNCATE）はしないでください。
- 審査への提出・送信の最後のボタンは、押す前に画面を見せて私の「OK」を待ってください。
- 分からないとき、画面が手順と違うときは、推測で進めずに止めて聞いてください。
- 作業ごとに、何をしたか・最後の画面の状態を 1〜3 行で報告してください。

## 作業 1：Supabase で SQL を 1 本流す（目標とロードマップの表の更新）
1. 新しいタブで https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_goal_roadmaps.sql を開き、「Raw」を押して中身を全部コピーします。
2. 流す前に中身を確かめてください。`delete from`・`drop table`・`truncate` が無いこと（`drop constraint` と `drop policy if exists` は消すのではなく作り直しなので問題ありません）。あれば止めて私に聞いてください。
3. Supabase のダッシュボード（プロジェクト tkrinnopfssdibgxuqzl）→ 左の「SQL Editor」→「New query」に貼り付けて「Run」を押します。
4. 「Success」と出たら完了です。エラーが出たら、エラーの文をそのまま私に報告してください（直そうとしないでください）。

## 作業 2：App Store Connect のスクリーンショットを差し替える
1. https://appstoreconnect.apple.com →「アプリ」→「Orime」→ 提出する版（1.0）のページを開きます。
2. 「iPhone 6.9 インチ ディスプレイ」のスクリーンショットを、いまの画像を全部消してから、次の 6 枚をこの順で入れます（ファイルは私の Mac の `leverage-reading/company/launch-2026-11/screenshots/` にあります）。
   1. base-1-consult-6.9in-1320x2868.png
   2. base-2-evidence-6.9in-1320x2868.png
   3. base-3-action-6.9in-1320x2868.png
   4. base-4-goal-6.9in-1320x2868.png
   5. base-5-focus-6.9in-1320x2868.png
   6. base-6-grow-6.9in-1320x2868.png
   任意で 7〜10 枚目に base-7-share・base-8-fields・base-9-import・base-10-photo（同じく 6.9in）も足してかまいません。
3. 「iPhone 6.5 インチ ディスプレイ」の欄があれば、同じ順で「…-6.5in-1284x2778.png」を入れます。
   「iPad 13 インチ ディスプレイ」の欄があれば、同じ順で「base-1-consult-ipad13-2064x2752.png」〜「base-6-grow-ipad13-2064x2752.png」の 6 枚を入れます。
4. ファイルを選ぶ画面（Finder）を自分で操作できないときは、止めて「ファイルを選んでください」と私に頼んでください。
5. 右上の「保存」を押します（ここは提出ではないので押して大丈夫です）。並び順を画面で確かめて報告してください。

## 作業 3：build 5 を版に付ける（Mac から build 5 をアップロードしたあと）
1. 同じ版のページの「ビルド」の欄で、いまのビルド（4）を外し、「ビルドを追加」から **build 5** を選んで「完了」→「保存」を押します。
2. build 5 が一覧に無い（まだ処理中）ときは、何もせずに「まだ処理中です」と報告してください。
3. 「輸出コンプライアンス」を聞かれたら、止めて画面を見せてください（答えは私が決めます）。

## 作業 4：審査チームへの返事を書いて、再提出の直前まで進める
1. App Store Connect の「App Review」（または版のページの「メッセージ」）で、build 4 の差し戻し（Guideline 2.1(a)・iPad Air で起動時に落ちる）のスレッドを開きます。
2. 次の英文を返事の欄に貼り付けます（送信はまだ押さない）。

```
Hello App Review team,

Thank you for the crash logs. The crash on launch on iPad (iPadOS 27.2) was caused by the app not yet adopting the UIScene life cycle, which apps built with the iOS 27 SDK require. In build 5 we adopted the UIScene life cycle (UIApplicationSceneManifest and a SceneDelegate) and removed the legacy main storyboard key.

We tested build 5 on the iPad Air 11-inch (M3) simulator with iPadOS 27 and on iPhone: the app launches, and sign-in, consultations and the subscription screen work as expected.

The same demo account as before can be used for review.

Best regards,
Orime
```

3. 版のページの右上の「審査用に追加」（または「審査に提出」）の直前まで進め、ボタンを押す前に画面全体を見せて私の「OK」を待ってください。OK をもらったら、返事の「送信」と、提出のボタンを押してください。
4. 提出のあとに表示された状態（「審査待ち」など）を報告してください。

---ここまで---

## 私（オーナー）が先にやること
- Mac: `git pull && npm install && npm run build && npx cap sync ios && npm run ios:prepare -- --check` → Xcode でビルド番号を 5 → iPadOS 27 のシミュレータと iPhone で起動・ログイン・相談・購入画面 → Archive → アップロード（`company/app-store-submission.md` の 2026-11-16 の項）。
- 審査用のアカウントで、アプリの設定 → プライバシー →「AI へのデータ送信」を取り消しておく（`company/app-store-submission.md` §6-1）。
