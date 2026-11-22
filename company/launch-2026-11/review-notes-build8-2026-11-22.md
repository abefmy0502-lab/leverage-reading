# ビルド 8（フォローあり）の審査メモ・2026-11-22

> 背景: オーナー「プロフィールを作ってフォロー、フォロワーを表示する機能を今回の再審査にも入れたい」（2026-11-21）→「その前に現在の仕様で Apple の審査に通るかどうかを徹底的に確認してほしい」。4 つの領域（課金 3.1／アカウント・プライバシー 4.8・5.1／利用者が作る中身 1.2／完成度・メタデータ 2.1・2.3・4.0・4.2）を点検した。コードの直しは 2026-11-22 のコミット（通報・ブロックの入口・表紙・Apple の同意・規約・AI の禁止・arm64）。
> いまの審査メモは「アプリの中でほかの人のプロフィールを見る機能はありません」と書いている。フォローを入れると事実でなくなる（2.3）ので、ビルド 8 を付けるときに下の全文に差し替える。

## 1. 出す前にそろえること（順番）

| # | だれが | やること | 確かめ方 |
|---|---|---|---|
| 1 | Chrome | 本番の Supabase に `supabase_all_in_order.sql` を流す（`follows`・`report_profile`・`summary_public` が入る） | SQL Editor で `select proname from pg_proc where proname in ('report_profile','follow_request','followee_shelf');` が 3 行 |
| 2 | オーナー | 見本のアカウントを作る（Supabase → Authentication → Add user・Auto Confirm）。パスワードはオーナーだけが持つ | — |
| 3 | Mac | `.env.production.local` に `VITE_SOCIAL=on`（ほかに `VITE_REVENUECAT_IOS_KEY`・`VITE_RELEASE_NOTES_SINCE` があること。`VITE_SENTRY_DSN` を入れるならプライバシーの申告にクラッシュと性能を足す）→ ビルド 8 | シミュレータで右上の丸いアイコン（プロフィール）に「フォロー中・フォロワー」が出る・歯車（設定）のプランの画面に値段が出る |
| 4 | シミュレータ | 見本のアカウント: ニックネーム・本 3 冊・まとめ 2 つ → デモのアカウント: ニックネーム → 見本の ID で申し込む → 見本で承認 → デモで本棚とまとめが見える・「…」に通報とブロック | 撮る |
| 5 | Chrome | 月額・年額をすべての国で売る（`chrome-fix-iap-availability-2026-11-21.md` の作業 1） | 2 つとも 175 か所 |
| 6 | Chrome | 審査メモを下の全文に差し替え・ビルド 8 を付ける | 字数と最後の行 |
| 7 | Chrome | 年齢区分の「ソーシャルメディア」の答えを見直す（フォローで人の本棚が見える。メッセージは無い） | 区分が 9+ のまま、または変わったら報告 |
| 8 | オーナー | 「審査内容を更新」→「App Review に再提出」はオーナーの OK のあと | — |

Vercel の確かめ（名前だけ・値は見ない）: `APPLE_SIGNIN_KEY_ID`・`APPLE_SIGNIN_PRIVATE_KEY`・`APPLE_TEAM_ID`（または `APNS_TEAM_ID`）・`APPLE_SIGNIN_CLIENT_ID`（または `APNS_BUNDLE_ID`）＝退会で Apple の許可を取り消す。`AI_ROUTE_*` が入っていないこと（入っていると同意を取り直さずに別の会社へ送る）。`REVENUECAT_SECRET_API_KEY` があること。

## 2. 審査メモ（Notes）の全文（日本語の段落 → 英語の段落）

`____` は見本のアカウントの ID（`public_id`・10 字）。パスワードは書かない（見本は審査官がログインする必要が無い＝デモのアカウントがすでにフォローしている）。

```
審査用デモアカウントは「サインイン情報」にあります（プラン契約中・AI 選書・読書計画シートなどプランの機能を確かめられます）。
登録は任意です。ログインの画面の「登録せずに始める」→「同意して始める」で、個人情報を入れずにすべての機能を使え、プランも買えます。

契約しなくても、本・メモ・振り返り・写真で共有などはすべて使えます（無料プラン）。無料プランの AI は、相談とこの本で学べること（あわせて毎月 30 トークン・アカウントを作った月と翌月は 130）と、写真から書き起こし（毎月 10 回）です。プランは月額 ¥1,480・年額 ¥12,800 で、毎月 800 トークンとすべての AI 機能が使えます（公開から 30 日間は年額の 1 年目 ¥9,800）。追加トークン（300・1,000）は消耗型で、期限はありません。課金は App 内課金だけです。購入の復元・自動更新の条件・利用規約・プライバシーポリシーを有料プランの画面に示しています。プランの画面は、右上の歯車（右から 2 つめ＝設定）→「プラン・お支払い」→「プランを見る」です（デモアカウントは契約中のため「プランを管理」と出ます。プランの画面を見るときは「登録せずに始める」で入ってください）。アカウント削除はアプリ内（右上の歯車＝設定 → アカウント削除）でできます。

AI 機能は、はじめて使うときに送る内容と送り先（Anthropic）を示して同意をいただき、同意のあと機能に必要な内容だけを Anthropic の API に送ります（学習には使われません）。同意は 設定 → プライバシー →「AI へのデータ送信」から取り消せます。

フォロー（利用者が作る中身）: 相手のリンクか ID でだけフォローを申し込めます（名前では探せません・メッセージの機能はありません）。相手が承認したときだけ、その人の本棚と本のまとめをアプリの中で見られます。登録せずに始めた人とニックネームの無い人は申し込めません。好ましくない言葉と連絡先は保存の前に止め、表示の前にも外します。人の本棚・その人の本のまとめの画面・フォロワー・届いた申し込み・ID で見つけた人の「…」から「通報する」「ブロックする」が使えます。通報は理由を選んで送り、運営が 24 時間以内に確かめて表示を止めます。ブロックするとお互いのフォローが外れ、申し込みも見ることもできなくなります。利用規約（第 7 条・第 10 条）で好ましくない内容を一切認めないことを定め、どの始め方（メール・Apple・登録せずに始める）でも規約への同意を示しています。デモアカウントは、見本のアカウント（ID: ____）をフォロー済みです。右上の丸いアイコン（プロフィール）→「フォロー中」から本棚を開けます。

[For App Review]
- Registration is optional. On the sign-in screen, tap "登録せずに始める" (Start without an account), then "同意して始める". No personal information is required. Sign in with Apple and the demo account in Sign-In Information also work. Every sign-in path shows the Terms of Use and Privacy Policy.
- Subscriptions (Orime 月額プラン / Orime 年額プラン): start with "登録せずに始める" (the demo account already has an active plan, so it shows "プランを管理" instead). Tap the gear icon at the top right of the Home screen (second from the right; the round icon at the far right is the profile) to open Settings (設定), then "プラン・お支払い" (Plan & Payment) > "プランを見る" (See plans). The plan screen shows both plans with prices and a purchase button. Registration is not required to purchase.
- Token packs (300 トークン / 1,000 トークン, consumable add-ons for subscribers): sign in with the demo account (it has an active plan), open Settings, then "プラン・お支払い" > "トークンを追加" (Add tokens).
- All In-App Purchases are available in every storefront where the app is available.
- Follow (user-generated content, Guideline 1.2): the round profile icon at the top right (プロフィール) > "フォロー中" / "フォロワー" (Following / Followers). Users can follow each other only with the other person's profile link or ID (there is no search by name and no messaging), and only after the other person approves. An approved follower can see that person's bookshelf and per-book summaries in the app. Guest users and users without a nickname cannot send requests. Objectionable words and contact details are blocked before saving and filtered before display; only book covers from bookstores and libraries are shown to others. Every person's shelf, every book page with that person's summary, every follower row, every incoming follow request and every person found by ID has a "…" menu with "通報する" (Report) and "ブロックする" (Block). A report asks for a reason, confirms delivery, and is reviewed within 24 hours (Terms, Articles 7 and 10). Blocking removes the follow in both directions and prevents new requests. The demo account already follows a sample account (ID: ____); open it from the round profile icon at the top right > "フォロー中" (Following).
```

## 3. 点検で「問題なし」と確かめたこと（要点）

- 3.1: アプリから Stripe・外の支払いへ行く道は無い。値段はストアの値だけ。自動更新・解約の方法・復元・規約・プライバシーポリシーがある。登録せずに買える。オファーコードは Apple の画面。
- 4.8・5.1.1(v): Apple のボタンの形と置き場所。退会はアプリの中で最後まで・登録していない人も・契約中の人には「支払いは続く」と解約の方法。
- 5.1.2(i): 送る前の同意は全部の AI の入口と送る直前で効く。
- 1.2: 絞り込み・通報・ブロック・連絡先・名前で探さない・メッセージなし・アイコンは決まった 10 個。
- 2.1・2.5・4.0: 「近日公開」はアプリに出ない・外のコードを読まない・iPad は 4 つの向きとマルチタスク・通知はスイッチを入れたときだけ・レビューのしつこい依頼なし。

## 4. 残る小さな点（出してから）

- 運営への通報の知らせ（メール・通知）は無い。`ops_dashboard` の最初の行の件数を毎日見る（24 時間の約束）。
- `App.entitlements` に `aps-environment` が無い＝ITMS-90078 の警告メールが来うる（審査は止まらない）。通知を出すとき（`VITE_NATIVE_PUSH=on`）に Push Notifications の capability を足す。
- 本の一覧は iPad で横いっぱいに広がる（使えるが、あとで中身の幅を 720〜840 に）。
