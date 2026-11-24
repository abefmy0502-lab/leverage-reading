# Chrome への指示文: 動画の声のための OpenAI の鍵を作る（2026-11-22）

> オーナー「音声の機械感がすごい・もっと自然な声にしたい」→ OpenAI の読み上げ（gpt-4o-mini-tts・男性の声 onyx）。費用は動画 1 本 30 秒で 1 円未満。
> **鍵（sk- で始まる文字）は Chrome に読ませない・写させない・会話に貼らない。** 鍵が画面に出たら、オーナーが自分でコピーして Mac のターミナルに貼る。
> パスワード・確認コード・カードの番号は Chrome にさせない（オーナーの決まり）。

---ここから---

あなたは、読書アプリ orime の運営者の代わりに、OpenAI の管理画面で「動画の読み上げに使う API の鍵」を作る準備をします。私は横で見ています。

## 守ること（いちばん大事）
- **パスワード・確認コード・電話番号の確認・カードの番号や住所の欄が出たら、何も入れずに止まって「ここで入力してください」と私に頼む。** 私が入れて「続けて」と言ったら続ける。
- **鍵（`sk-` で始まる長い文字）が画面に出たら、読み上げない・コピーしない・報告に書かない。** その画面になったら止まって「鍵が出ました。ご自身でコピーしてください」とだけ言う。
- 支払いは「前払いのクレジット」で **5 ドル** だけ。**自動のチャージ（Auto recharge）はオフ**。金額を決めるボタン・購入の確定は、私が押す（止まって頼む）。
- 有料のプラン（ChatGPT Plus など）・ほかのサービスの申し込みには進まない。
- 画面が手順と違う・迷うときは、止めて画面の文をそのまま報告する。

## 作業 1：入る
1. https://platform.openai.com を開く。
2. ログインしていなければ「Log in」→ メールアドレスの画面で止まって、私に入ってもらう（どのアカウントで入るかは私が決める）。
3. 入れたら、右上の組織（Organization）とプロジェクト（Project）の名前を報告する。

## 作業 2：使いすぎない設定
1. 左の「Settings」→「Billing」を開き、今の残高（Credit balance）と、支払い方法が登録済みかを報告する。
2. 残高が 0 で支払い方法が無ければ、「Add payment details」の画面で止まって私に入れてもらう。
3. 「Add to credit balance」で **5 ドル**。**「Auto recharge」はオフ**のまま。確定のボタンの前で止まって、私に押してもらう。
4. 「Limits」（使用量の上限）を開けたら、**月の上限（Budget / Usage limit）を 5 ドル**・知らせ（Notification threshold）を 3 ドルにして保存する。項目が無ければ、その旨を報告する。
5. 「Settings」→「Data controls」（または「Sharing」）で、**入力と出力を OpenAI と共有する設定がオフ**になっているかを報告する（オンならオフにする）。

## 作業 3：鍵を作る
1. 左の「API keys」→「Create new secret key」。
2. 入れる値:
   - Owned by: **You**
   - Name: `orime-voice-mac`
   - Project: 作業 1 で報告したプロジェクト（Default project のままでよい）
   - Permissions: **Restricted** を選べたら、「Model capabilities」（読み上げ＝/v1/audio を含む）だけ **Write**、ほかは **None**。分かりにくければ **All** でよい（どちらにしたかを報告）。
3. 「Create secret key」を押す前に止まって、入れた値を報告する。私が「作って」と言ったら押す。
4. **鍵が表示されたら、そこで止まる。** 「鍵が出ました。ご自身でコピーしてください」とだけ言い、鍵の文字には触れない。私が「閉じて」と言ったら「Done」を押す。

## 報告（最後に）
- 組織とプロジェクトの名前・残高・自動のチャージがオフか・月の上限・共有の設定・鍵の名前と権限（**鍵の文字は書かない**）

---ここまで---

## Chrome のあとにオーナーがすること（Mac のターミナル）
1. 鍵の画面の「Copy」で鍵をコピーする（会話にもファイルにも貼らない）。
2. ターミナルで `security add-generic-password -a orime -s orime-openai-tts -w` を打つ → 「password data for new item:」と聞かれたら鍵を貼って Enter → もう一度聞かれたら同じく貼って Enter（画面には出ない）。
3. `cd ~/Documents/leverage-reading && npm run mkt:videos` を打つ（7 本を声入りで作り直す・数分）。できあがりは `marketing-out/videos/<今日>/<名前>/final-voice.mp4`。
4. 終わったら Claude に「できた」と言う（確認とダウンロードのフォルダへのまとめは Claude がする）。

- 鍵を作り直す・消すときは、OpenAI の「API keys」でその鍵を「Revoke」。Mac のキーチェーンからは `security delete-generic-password -a orime -s orime-openai-tts`。
- 鍵は Vercel にもリポジトリにも入れない（動画を作る Mac の中だけで使う）。
