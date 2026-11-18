# Claude in Chrome への指示文（2026-11-18・build 6 で再提出する）

build 6（1.0.0）は 2026-11-18 22:08 に Mac からアップロード済み（`** EXPORT SUCCEEDED **`）。build 5 は App Store Connect の障害で提出できなかったので、build 6 で出す。下の「ここから」〜「ここまで」をそのまま Claude in Chrome に貼る。

build 6 に入っているもの（返事の文の根拠）:
- build 5 の直し: iPadOS 27 で起動したとたんに落ちる（審査 2.1(a)）→ UIScene の起動に移した（commit 3e27f7c）／iOS 27 で画面が真っ白 → CSP の meta に `capacitor://localhost`（commit 9c6b820）
- 写真で共有の「画像を保存」で写真に直接保存（`@capacitor-community/media`・写真への追加だけの許可＝NSPhotoLibraryAddUsageDescription）
- 画面の見た目の直し（全画面・文字サイズ最大まで）・文字の大きさは本文の 2 倍で止める
- 確かめられたのは iOS 26.5 まで。iOS 27 の実機・シミュレータでは確かめていない（返事に「iOS 27 で確かめた」と書かない）

---ここから---

あなたは Orime（読書メモの iPhone アプリ）の公開作業を手伝います。私の Chrome の App Store Connect で、次の作業を順に進めてください。

## 守ること（いちばん大事）
- パスワード・2 段階認証のコード・API キー・秘密鍵は、入力も表示もしないでください。ログインや確認コードを求められたら、そこで止めて私に頼んでください。
- お金の支払い・契約・規約への同意のボタンは押さないでください。出てきたら止めて私に聞いてください。
- 何かを消す操作はしないでください（ビルドを版から「外す」のは、作業 1 の中だけ認めます）。
- 審査への提出・返事の送信の最後のボタンは、押す前に画面を見せて私の「OK」を待ってください。
- 分からないとき、画面が手順と違うときは、推測で進めずに止めて聞いてください。
- 作業ごとに、何をしたか・最後の画面の状態を 1〜3 行で報告してください。

## 作業 0：build 6 の処理が終わったか確かめる
1. https://appstoreconnect.apple.com →「アプリ」→「Orime」→ 上の「TestFlight」を開きます。
2. 「iOS ビルド」の 1.0.0 の中に **6** があり、状態が「処理中」でないことを確かめます。
   - まだ「処理中」・6 が見当たらないときは、何もせずに「build 6 はまだ処理中です」と報告して止まってください。
   - 「輸出コンプライアンスの情報がありません」などの警告が付いていたら、止めて画面を見せてください（答えは私が決めます）。

## 作業 1：build 6 を版 1.0.0 に付ける
1. 「配信」（または「App Store」）のタブ → 左の「iOS アプリ」の **1.0.0** を開きます。
2. 下のほうの「ビルド」の欄を見ます。
   - いまのビルドが **1.0.0 (6)** なら、何もせず作業 2 へ。
   - **1.0.0 (5)** や **1.0.0 (4)** なら、その横の「−」（削除）で外し、「ビルドを追加」（＋）から **1.0.0 (6)** を選んで「完了」を押します。
   - 選ぶ画面に 6 が無いときは、何もせずに報告して止まってください。
3. 右上の「保存」を押します（提出ではないので押して大丈夫です）。ビルドの欄が「1.0.0 (6)」になったことを報告してください。

## 作業 2：審査チームへの返事を書く（送信はまだ）
1. 左の「App Review」（または版のページの上の「メッセージ」「解決センター」）で、前回の差し戻しのスレッド（Guideline 2.1 など）を開きます。
2. 差し戻しの理由の文と、私たちが最後に送った返事があればその文を、そのまま報告してください（下の返事の文と合っているか、私が確かめます）。
3. 次の英文を返事の欄に貼り付けます。**送信はまだ押さないでください。**

```
Hello App Review team,

Thank you for your review and the crash logs. Build 1.0.0 (6) fixes the issues:

1. Crash on launch on iPad (iPadOS 27): the app now adopts the UIScene life cycle (UIApplicationSceneManifest and a SceneDelegate), which apps built with the iOS 27 SDK require. The legacy main storyboard key was removed.

2. Blank screen on iOS 27: the app's Content Security Policy now allows its local content scheme (capacitor://localhost), so the app content is no longer blocked from loading.

This build also lets users save the images they create in "Share as photo" directly to Photos. The app asks only for permission to add photos, the first time the user taps "Save image".

The same demo account provided in the App Review Information can be used to sign in.

Best regards,
Orime
```

## 作業 3：再提出の直前まで進める
1. 版 1.0.0 のページに戻り、右上の「審査用に追加」（または「審査に提出」「再提出」）を探します。
2. **押す前に止めて**、版のページ全体（ビルドが 1.0.0 (6) であること）と、作業 2 の返事の欄を見せて、私の「OK」を待ってください。
3. OK をもらったら、返事の「送信」と、提出のボタンを押してください。途中で質問の画面（広告 ID・コンテンツの権利・暗号化など）が出たら、止めて画面を見せてください。
4. 提出のあとに出た状態（「審査待ち」など）を報告してください。

---ここまで---

## 私（オーナー）が先に・あとでやること
- 先に: 審査用のアカウントで、アプリの設定 → プライバシー →「AI へのデータ送信」を取り消しておく（`company/app-store-submission.md` §6-1）。
- 先に: Apple のシステム状況で App Store Connect が止まっていないか見る（11/18 未明は障害で提出できなかった）。
- あとで: また白い画面か起動時の落ちで差し戻されたら、差し戻しの文と添付のスクリーンショット・クラッシュログを Claude Code に貼る。
