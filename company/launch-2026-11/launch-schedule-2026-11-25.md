# 公開の予定表（2026-11-25 水 の朝に公開・2026-11-24 に作成）

> 2026-11-24 に App Store の審査を通過（Apple ID 6821277760・アプリのページ https://apps.apple.com/jp/app/id6821277760）。
> オーナー決定「明日 11/25 の朝に公開する」。手順の正は `launch-day-runbook.md`、投稿の文は `company/sns-prep/` のまま（ここは日付だけ）。
> 時刻はすべて日本時間。投稿は承認の前は出さない決まり＝公開の朝から。

## 前の夜（11/24 火）

| 時刻 | やること | 誰 |
|---|---|---|
| 夕方以降 | Vercel のデプロイ上限が戻ったら **Redeploy**（Use existing Build Cache はオフ）。LP の直し・新しいヒーローの絵・App Store のリンク先（`.env.production` の `VITE_APP_STORE_URL`）・新しくなったことの公開日（`VITE_RELEASE_NOTES_SINCE=2026-11-25`）が本番に出る | オーナー |
| Redeploy のあと | 確認用のセッション「LP の本番確認（Redeploy のあと）」に「Redeploy したので確かめて」 | オーナー → Claude |
| 寝る前 | App Store Connect の「契約／税金／口座情報」で有料 App の契約が有効か確かめる | オーナー |

## 公開の朝（11/25 水）＝ `launch-day-runbook.md` §2 のとおり

| 時刻 | やること | 文 |
|---|---|---|
| 7:00 | App Store Connect で「このバージョンをリリース」 | — |
| 7:10 | 「App 分析 → キャンペーン」の `pt=` の値を Claude に渡す（アプリの URL はもう入れてある） | — |
| 7:15 | Vercel に `VITE_APP_STORE_PT` を入れて公開し直す（`VITE_APP_STORE_URL` と `VITE_RELEASE_NOTES_SINCE` は `.env.production` に入れ済み・Vercel に同じ名前の古い値があれば消す） | — |
| 7:30 | 公開のメール | `launch-email.md` |
| 7:30 | X 公開日のスレッド 5 本（1 本目を固定・リンクは返信の 1 本目）・Threads 公開日 | `sns-prep/x-threads-week1.md` §2 |
| 8:00 | TestFlight で試してくれた方へ | `review-request.md` (a) |
| 8:30 | App Store のプロモーションテキストを創業メンバー期間の文に | `company/app-store-listing.md` |
| 9:00 | note 連載 1 本目を公開・LINE オープンチャットを公開 | `sns-prep/note-01-consult.md`・`line-openchat.md` |
| 9:30 | iPhone で通しの確かめ | `launch-day-runbook.md` §3 |
| 21:00 | Instagram 公開日のカルーセル 7 枚 | `sns-prep/instagram-week1.md` (a) |

## 公開日の翌日から日曜まで（11/26 木〜11/29 日）

`x-threads-week1.md` §3 の決まり（公開日が週の途中なら、X2 と X3 を先に出し、残りを月曜から）。

| 日 | 時刻 | 投稿 |
|---|---|---|
| 11/26 木 | 21:00 | X2｜本棚の写真からまとめて追加 |
| 11/27 金 | 7:30 | X3｜相談 |
| 11/28 土 | 朝 | 土曜の投稿キット（自動）が `company/weekly/` に 2 週目の下書きを置く → 直して予約 |

## 1 週目（11/30 月〜12/6 日）

| 日 | 7:30 | 9:00 | 21:00 |
|---|---|---|---|
| 11/30 月 | X1｜相談｜開発の物語・Threads T1 | — | Instagram リール 1「本棚の写真」・TikTok 1 |
| 12/1 火 | Threads T2 | — | — |
| 12/2 水 | X4｜集中モード｜保存版・Threads T3 | — | X5｜目標とロードマップ・Instagram リール 2・TikTok 2 |
| 12/3 木 | X6｜集中モード・Threads T4 | — | — |
| 12/4 金 | Threads T5 | — | X7｜相談｜問い・TikTok 3「相談」 |
| 12/5 土 | X8｜目標とロードマップ｜開発の物語・Threads T6 | Instagram カルーセル「使い方の保存版」 | X9｜本棚の写真｜問い |
| 12/6 日 | Threads T7 | — | X10｜相談｜問い |

- X2（月 21:00）と X3（火 7:30）の枠は、公開日の週に先に出したので空ける。
- 返信・引用には自分で返す（自動では返さない）。
- 公開の翌週（12/16 までに App Store へ）に 1.0.1 を出す＝`release-1.0.1.md`。
