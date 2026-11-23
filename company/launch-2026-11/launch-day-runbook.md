# 公開の日の手順（1 枚・2026-11-23）

> 古い `release-day-checklist.md`（公開日 11/17 の前提）の代わり。正は `company/sns-strategy-2026-11-22.md` §5・§7。
> 今の状態：**ビルド 9 を 2026-11-22 に提出・審査待ち**。リリースは「手動」。創業メンバー価格は **2027-01-10（日本時間）まで**。SNS は承認まで出さない。
> 印：**オ**＝オーナー（パスワード・2 段階の確認・お金・提出・公開のボタン）／**C**＝Claude がこのリポジトリと運営の道具でできる。

## 0. 承認を待つ間に済ませておくこと

| | やること | 誰 | 確かめ方 |
|---|---|---|---|
| [ ] | App Store Connect の年額の初回特典の終了日が **2027-01-11**、月額・年額の「無料・1 週間」の開始が **2027-01-11**（`chrome-founding-0110-2026-11-22.md`） | オ | 初回特典の画面 |
| [ ] | Vercel の `VITE_FOUNDING_OFFER_END=2027-01-10` で本番を公開し直した（同ファイルの手順 ②・済んでいれば印だけ） | オ | LP の料金に「1 月 10 日まで」 |
| [x] | `.env.production` を `2027-01-10` に（次の iOS のビルド 1.0.1 から反映） | C | 2026-11-23 済み |
| [ ] | 公開のメール（`launch-email.md`）を自分宛てに試し送り。【住所】を埋める（特定電子メール法） | オ | 届いた文 |
| [ ] | `company/sns-prep/` の伏せ字（自分の体験・実数）を埋める。動画は `marketing-out/videos/` | オ | `node scripts/marketing/weekly-drafts.mjs --check company/sns-prep/*.md` が ✓ |
| [ ] | note の連載 1 本目（`sns-prep/note-01-consult.md`）を note の下書きに入れておく | オ | note の下書き |
| [ ] | LINE オープンチャット（創業メンバーの部屋）を作り、まだ公開しない（`line-openchat.md`） | オ | — |
| [ ] | 自分のテスト用のアカウントを `app_admins` に入れる（運営の数字から外す・SQL は `sql-exclude-own-accounts.md`） | オ | 運営ダッシュボードの有料が 0 |

## 1. 承認の知らせが来たら（その日のうちに・5 分）

- [ ] 公開する朝を決める：**次の平日の朝 7:30**（金曜の夜に来たら月曜）。カレンダーに入れる。**オ**
- [ ] Claude に「承認された。◯日の朝に公開」と伝える → Claude が SNS の 1 週目の日付を入れ、土曜の投稿キット（自動）を動かす準備をする。**C**
- [ ] 公開の見張り（自動・毎日 9:07）は、App Store に並んだ日に自分で土曜の投稿キットを動かして止まる。手で何かする必要はない。

## 2. 公開の朝（この順で）

| 時刻 | やること | 誰 | 確かめ方 |
|---|---|---|---|
| 7:00 | App Store Connect で「このバージョンをリリース」 | オ | 「App Store で配信中」（検索に出るまで最大 24 時間） |
| 7:10 | アプリのページの URL（`https://apps.apple.com/jp/app/…/id…`）と、App 分析 → キャンペーンの `pt=` を控えて Claude に渡す | オ | iPhone で開いて「入手」 |
| 7:15 | Vercel の env：`VITE_APP_STORE_URL`・`VITE_APP_STORE_PT` → 公開し直す | オ（Mac の Vercel のコマンドなら C も可） | LP のボタンが App Store のページへ |
| 7:20 | 場ごとのキャンペーンリンクを作る：note は `VITE_APP_STORE_URL=… VITE_APP_STORE_PT=… node scripts/store-link.mjs note consult`。ほかは `<アプリの URL>?pt=<pt>&ct=<名前>&mt=8`（メール `email_launch`・X `x_launch` `x_consult` …・Threads `th_consult`＝`sns-prep/` の各返信に書いてある名前）。下書きの `{APP_STORE_URL}` を置き換える | C | `ct=` が場ごとに違う |
| 7:30 | 公開のメール（`launch-email.md`）を送る → 送った人に `lp_waitlist.notified_at` | オ | 自分にも届く |
| 7:30 | X の公開日のスレッド 5 本（1 本目を固定・リンクは返信の 1 本目）・Threads 1 本（`sns-prep/x-threads-week1.md` §2） | オ（鍵があれば C が予約） | 固定に出ている |
| 8:00 | TestFlight で試してくれた方へ（`review-request.md` (a)・「はい」と答えた人だけ） | オ | — |
| 8:30 | App Store のプロモーションテキストを「創業メンバー期間」の文に（`company/app-store-listing.md`・審査なし） | オ | ストアのページ |
| 9:00 | note の連載 1 本目を公開・LINE オープンチャットを公開 | オ | — |
| 9:30 | iPhone で通しの確かめ（下の §3） | オ | — |
| 21:00 | Instagram の公開日のカルーセル（`sns-prep/instagram-week1.md`） | オ（鍵があれば C が予約） | — |

## 3. iPhone で通しの確かめ（10 分）

- [ ] App Store から入れて、新しいアカウント → 初回ガイド → 本を 1 冊 → メモを 1 件
- [ ] 相談を 1 回 → AI の同意 → 答え（「あなたのメモ N 件から答えました」）
- [ ] 設定 → プラン：無料プランの残りが **130 トークン**（はじめの月）
- [ ] 有料プランの画面：年額が「1 年目 ¥9,800／2 年目から ¥12,800」・期間中は 7 日間無料が出ない
- [ ] 「購入を復元」・利用規約・プライバシーポリシーが開く
- [ ] 本棚の写真からまとめて追加：本棚を 1 枚撮って 3 冊以上が候補に出る

## 4. 公開の日のうちに

- [ ] 審査用のデモアカウントの契約を外す（`release-day-checklist.md` §4 の SQL）**オ**
- [ ] 運営ダッシュボードの「公開の準備」を見る（Claude に「公開の準備を見て」で足りないものを並べる）**C**
- [ ] 返信・引用には自分で返す（X は返信が勝ち筋・自動では返さない＝`company/automation-map-2026-11.md` §3）**オ**

## 5. 公開のあと（予定に入れておく）

| 日 | やること | 誰 |
|---|---|---|
| 公開の翌週 | **1.0.1** を出す（創業メンバーを年額だけにした画面・創業メンバーの期限 1/10・`.env.production` は直してある） | オ（Mac）＋C |
| 毎週月曜 | 数字の見直し（自動の下書き → 15 分で 1 つ決める） | C → オ |
| 2027-01-07 | 1 回だけ「創業メンバー価格は 1 月 10 日まで」（煽らない・人数は書かない） | オ |
| 2027-01-11 朝 | プロモーションテキストをふだんの文に戻す・月額と年額に 7 日間無料が付いたかを確かめる・創業メンバーの一覧を取る（`launch-founding-offer.md`） | オ＋C |

## 6. つまずいたら

| 困りごと | 見る所 |
|---|---|
| 審査で落ちた | 理由の画面をそのまま Claude に送る（`company/app-store-submission.md`） |
| 買えるのに AI が使えない | `REVENUECAT_SECRET_API_KEY`・`docs/iap-setup-runbook.md` |
| LP が App Store に飛ばない | `VITE_APP_STORE_URL` を入れたあと公開し直したか（`VITE_` はビルドに焼き込む） |
| 表紙が出ない | `https://orime.vercel.app/api/cover?health=1` の JSON を Claude に |
