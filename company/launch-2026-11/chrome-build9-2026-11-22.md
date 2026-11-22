# ビルド 9（フォローあり）で再提出する・Chrome への指示（2026-11-22）

> 背景: オーナー「8 も入れたい」→ ビルド 8 の内容に、残りの画面の点検の直し 9 件（iPhone のデータの書き出しが何も残さなかった＝審査 2.1 にも関わる・ほか）を足した **ビルド 9（1.0.0 (9)・フォローあり）** を 2026-11-22 18:42 にアップロード済み。
> 前回の提出（2026-11-18 22:20・未解決の問題）はバージョンを押さえていてビルドを替えられない。iOS アプリだけを ⊖ で外すと、課金 5 件と別々の提出に分かれる（はじめての課金はアプリと一緒に出す必要がある）。だから **提出をまるごとキャンセル → ビルド 9 を付ける → アプリと課金 5 件を 1 つの新しい提出にまとめて出す**。キャンセルしても何も消えない（項目は審査の前の状態に戻るだけ）。
> 見本のアカウントの準備は**飛ばす**（2026-11-22 オーナー「これは飛ばして OK」）。審査メモからも「デモアカウントは見本をフォロー済み」の 2 文を外した。デモアカウントの AI の同意の記録を外す 1 文の SQL だけは残す（審査官が同意の画面を見られるように・何も消さない）。

使い方: 「ここから」〜「ここまで」を Chrome の Claude に貼る。**貼ることが、提出のキャンセルと再提出への OK** です。


---ここから---

あなたは Orime（読書メモのアプリ）の公開作業を手伝います。オーナーの了承のもと、App Store の審査に「ビルド 9」で出し直します。順番どおりに進め、各作業の結果を最後にまとめて報告してください。

## 守ること
- パスワード・2 段階認証のコード・鍵（.p8、sk_ で始まる値など）は扱わない・読まない。ログインを求められたら止めて私に頼む。
- 支払い・契約の画面には進まない。値段・配信の国・年齢区分は変えない。
- SQL は下に書いたものだけを流す（ほかの SQL は流さない・DELETE や DROP を足さない）。
- 画面が手順と違う・迷うときは、止めて画面の文をそのまま報告する。

## 作業 1：デモアカウントのメールアドレスを読む（App Store Connect・読むだけ）
1. https://appstoreconnect.apple.com → アプリ → Orime → iOS App のバージョン 1.0 →「App Review に関する情報」の「サインイン情報」の**ユーザー名**（メールアドレス）を控える。パスワードの欄は読まない。

## 作業 2：デモアカウントの AI の同意の記録を外す（Supabase・1 文の SQL）
審査官が「AI に送る内容について」の画面を見られるようにするためです（アプリの 設定 → プライバシー →「AI へのデータ送信」を取り消すのと同じ）。
1. https://supabase.com/dashboard → プロジェクト（URL に tkrinnopfssdibgxuqzl を含む）→ 左の「SQL Editor」→「New query」。
2. 下の SQL の `DEMO_EMAIL` を作業 1 のメールに置き換えて（2 か所・引用符は残す）Run。

```sql
update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'ai_consent'
where lower(email) = lower('DEMO_EMAIL');
select count(*) as demo_found, bool_or(raw_user_meta_data ? 'ai_consent') as still_has_consent
from auth.users where lower(email) = lower('DEMO_EMAIL');
```

期待する結果: demo_found 1・still_has_consent false。

## 作業 3：前回の提出をキャンセルする（App Store Connect）
1. 左の「App Review」→ ステータス「未解決の問題」の提出（2026-11-18 22:20・6 件）を開く。
2. 「提出をキャンセル」を押す。確認の文を報告し、「提出を取り消す（項目は残る）」意味なら確定する。「削除」「アプリを消す」意味なら止める。
3. キャンセルのあと、バージョン 1.0 と課金 5 件（月額・年額・Orime プラン・トークン 300・トークン 1000）の状態を報告する。

## 作業 4：ビルド 9 を付けて、審査メモを差し替える
1. iOS App → バージョン 1.0 のページ。「ビルド」の欄でビルド 7 を外し（− か「ビルドを選択」）、**1.0.0 (9)** を選んで「完了」。
   - ビルド 9 が「処理中」なら、10 分ほど待ってからやり直す。30 分たっても出なければ止めて報告。
   - 輸出コンプライアンスを聞かれたら「暗号化を使っていない、または免除（HTTPS だけ）」。
2. 「App Review に関する情報」の「メモ」（Notes）の中身をすべて消し、下の全文に置き換える。

```
審査用デモアカウントは「サインイン情報」にあります（プラン契約中・AI 選書・読書計画シートなどプランの機能を確かめられます）。
登録は任意です。ログインの画面の「登録せずに始める」→「同意して始める」で、個人情報を入れずにすべての機能を使え、プランも買えます。

契約しなくても、本・メモ・振り返り・写真で共有などはすべて使えます（無料プラン）。無料プランの AI は、相談とこの本で学べること（あわせて毎月 30 トークン・アカウントを作った月と翌月は 130）と、写真から書き起こし（毎月 10 回）です。プランは月額 ¥1,480・年額 ¥12,800 で、毎月 800 トークンとすべての AI 機能が使えます（公開から 30 日間は年額の 1 年目 ¥9,800）。追加トークン（300・1,000）は消耗型で、期限はありません。課金は App 内課金だけです。購入の復元・自動更新の条件・利用規約・プライバシーポリシーを有料プランの画面に示しています。プランの画面は、右上の歯車（右から 2 つめ＝設定）→「プラン・お支払い」→「プランを見る」です（デモアカウントは契約中のため「プランを管理」と出ます。プランの画面を見るときは「登録せずに始める」で入ってください）。アカウント削除はアプリ内（右上の歯車＝設定 → アカウント削除）でできます。

AI 機能は、はじめて使うときに送る内容と送り先（Anthropic）を示して同意をいただき、同意のあと機能に必要な内容だけを Anthropic の API に送ります（学習には使われません）。同意は 設定 → プライバシー →「AI へのデータ送信」から取り消せます。

フォロー（利用者が作る中身）: 相手のリンクか ID でだけフォローを申し込めます（名前では探せません・メッセージの機能はありません）。相手が承認したときだけ、その人の本棚と本のまとめをアプリの中で見られます。登録せずに始めた人とニックネームの無い人は申し込めません。好ましくない言葉と連絡先は保存の前に止め、表示の前にも外します。人の本棚・その人の本のまとめの画面・フォロワー・届いた申し込み・ID で見つけた人の「…」から「通報する」「ブロックする」が使えます。通報は理由を選んで送り、運営が 24 時間以内に確かめて表示を止めます。ブロックするとお互いのフォローが外れ、申し込みも見ることもできなくなります。利用規約（第 7 条・第 10 条）で好ましくない内容を一切認めないことを定め、どの始め方（メール・Apple・登録せずに始める）でも規約への同意を示しています。フォローの画面は、右上の丸いアイコン（プロフィール）→「フォロー中」「フォロワー」「ID でフォローを申し込む」です。

[For App Review]
- Registration is optional. On the sign-in screen, tap "登録せずに始める" (Start without an account), then "同意して始める". No personal information is required. Sign in with Apple and the demo account in Sign-In Information also work. Every sign-in path shows the Terms of Use and Privacy Policy.
- Subscriptions (Orime 月額プラン / Orime 年額プラン): start with "登録せずに始める" (the demo account already has an active plan, so it shows "プランを管理" instead). Tap the gear icon at the top right of the Home screen (second from the right; the round icon at the far right is the profile) to open Settings (設定), then "プラン・お支払い" (Plan & Payment) > "プランを見る" (See plans). The plan screen shows both plans with prices and a purchase button. Registration is not required to purchase.
- Token packs (300 トークン / 1,000 トークン, consumable add-ons for subscribers): sign in with the demo account (it has an active plan), open Settings, then "プラン・お支払い" > "トークンを追加" (Add tokens).
- All In-App Purchases are available in every storefront where the app is available.
- Follow (user-generated content, Guideline 1.2): the round profile icon at the top right (プロフィール) > "フォロー中" / "フォロワー" (Following / Followers). Users can follow each other only with the other person's profile link or ID (there is no search by name and no messaging), and only after the other person approves. An approved follower can see that person's bookshelf and per-book summaries in the app. Guest users and users without a nickname cannot send requests. Objectionable words and contact details are blocked before saving and filtered before display; only book covers from bookstores and libraries are shown to others. Every person's shelf, every book page with that person's summary, every follower row, every incoming follow request and every person found by ID has a "…" menu with "通報する" (Report) and "ブロックする" (Block). A report asks for a reason, confirms delivery, and is reviewed within 24 hours (Terms, Articles 7 and 10). Blocking removes the follow in both directions and prevents new requests. To try it, a second account can send a follow request with the demo account's ID (shown on the profile screen).
```

3. ページ右上の「保存」。

## 作業 5：アプリと課金 5 件を 1 つの提出にまとめて出す
1. バージョン 1.0 のページの「アプリ内課金とサブスクリプション」の欄で、5 件（月額・年額・Orime プラン の 2 つのサブスクリプション、トークン 300・トークン 1000）を選んで「完了」。
2. 右上の「審査用に追加」（Add for Review）→ 提出の下書きに **6 件**（iOS アプリ 1.0 = 1.0.0 (9) と課金 5 件）が入っていることを確かめて報告。
3. 6 件そろっていたら「審査へ提出」（Submit for Review）。確認が出たら文を報告し、提出の意味なら確定する。足りなければ押さずに止めて報告。

## 報告
- 作業 2: SQL の結果（demo_found・still_has_consent）
- 作業 3: キャンセルの確認の文・そのあとの 6 件の状態
- 作業 4: ビルド番号・メモを差し替えたか
- 作業 5: 提出の 6 件・提出のあとのステータス（例「審査待ち」）

---ここまで---

## 結果（2026-11-22・Chrome）
- 作業 1: デモアカウントのユーザー名を読んだ（パスワードは読まない）。
- 作業 2: demo_found 1・still_has_consent false。
- 作業 3: 確認の文「キャンセルを確認／この提出によって受理された項目は、App Review に再提出する必要があります。」→「確認」。提出は「削除済み」。6 件とも「デベロッパにより却下済み」（消えていない）。
- 作業 4: ビルド 7 を外して 1.0.0 (9)（輸出コンプライアンスの質問なし）。メモを全文に差し替えて保存（3,314 字）。バージョンは「提出準備中」。
- 作業 5: 止まった。課金が「デベロッパにより却下済み」だと、バージョンのページに「アプリ内課金とサブスクリプション」の欄が出ない。課金の各画面の上に「審査用に追加」がある。

---

# Chrome への指示 その 2（6 件を 1 つの提出にまとめて出す）

---ここから---

報告ありがとうございます。あなたの提案の順で進めてください。オーナーの了承済みです（提出の取り消しと再提出は、前の指示文を貼った時点で了承をもらっています）。

## 守ること
- 値段・配信の国・年齢区分・説明文は変えない。「提出をキャンセル」「削除」は押さない。
- パスワード・2 段階認証のコードは扱わない。
- 画面の幅が狭くなっていたら、ブラウザの窓を広げてから続けてかまいません。

## 手順
1. iOS App → バージョン 1.0（ビルド 9）のページ右上の「審査用に追加」を押し、提出の下書きを作る。下書きの画面が開いたら、項目（いまは 1 件のはず）を報告メモに控える。
2. 「サブスクリプション」→「Orime プラン」（サブスクリプショングループ）の画面で「審査用に追加」。月額・年額が別々に追加を求めるなら、それぞれの画面でも「審査用に追加」。
3. 「アプリ内課金」→「トークン 300」「トークン 1000」の画面で、それぞれ「審査用に追加」。
4. 「App Review」で下書きの提出を開き、**6 件**（iOS アプリ 1.0 = 1.0.0 (9)・月額・年額・Orime プラン・トークン 300・トークン 1000）がそろっていることを確かめる。
   - 途中で「審査用のスクリーンショットが足りない」「メタデータが足りない」などが出たら、何も足さずに止めて文をそのまま報告。
   - 「Orime プラン」がグループとして項目にならない・件数が 5 件になる、など数が違うときも、押さずに止めて報告。
5. 6 件そろっていたら「審査へ提出」。確認が出たら文を報告し、提出の意味なら確定する。

## 報告
- 各手順で押したボタンと結果
- 下書き（提出）の項目と状態
- 提出のあとのステータス（例「審査待ち」）

---ここまで---

## 結果 その 2（2026-11-22 19:07・Chrome）
- **審査に出した。ステータス「審査待ち」**（iOS 1.0・6 件）。完了の画面「6 項目が提出されました　審査には最大 48 時間かかります。」
- 6 件: iOS アプリ 1.0（1.0.0 (9)）・Orime プラン（サブスクリプショングループ）・年額プラン・月額プラン・トークン 300・トークン 1000。
- 途中で「新しいサブスクリプショングループは、そのグループに属する自動更新サブスクリプションとともに提出する必要があります。」の注意 → 月額・年額を足して消えた。
- 「審査へ提出」は確認の画面なしでそのまま送られた。前回の提出（11-18 22:20）は「削除済み」として一覧に残る。
- 次: Apple のメールを待つ。差し戻しなら Resolution Center の文をそのまま Claude へ。通ったら LP・お知らせの準備（`docs/revenue-gates.md` の公開の日）。
