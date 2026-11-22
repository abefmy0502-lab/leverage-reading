# 機能を主役にした SNS の調べ（2026-11-22）

> 問い: オーナー「X・Instagram・Threads は機能＝何ができるかを主に、note は 1 つの機能を深掘り。この方向でどうか。SNS ごとに方針を変えるべきか」。
> 前回の調べ（`sns-quality-research-2026-11.md`・各 SNS の仕組み）に、今回の検索 6 回の結果を足した。数字の根拠が弱いものは「要確認」。

## 結論
- 方向は良い。ただし **1 本は「困りごと（場面）→ 機能 1 つ → 結果」**。機能から入る型と困りごとから入る型を入手数で比べた公開のデータは見つからなかったので、自分のアカウントで比べる。
- **再生数と入手は別**。入口別の入手（App Store Connect の `ct=`）で判断する。
- 場ごとに形を変える: X＝縦の画面動画＋短文（滞在と返信）・Instagram＝リール（視聴時間・送信）と使い方の保存版カルーセル（保存・送信）・Threads＝機能を問いで出す（会話・宣伝は伸びにくい）・note＝1 機能の深掘りの連載（検索で長く読まれる）。

## 分かったこと

### アプリの短い動画の型
- 30 日のローンチの手引きは「困りごと → 1 つの機能のデモ → 1 つの結果」の順と、「機能の台本と結果の台本」を比べることをすすめる（Clouted・2026-02 https://clouted.com/blog/the-30-day-app-launch-playbook ）。
- 「1 本に 1 つの困りごとと解決・15 秒＋15 秒」（Zebracat https://www.zebracat.ai/post/promote-app-social-media ・宣伝を含む）。
- 個人開発者の仮説: 困りごとのつかみが最初の 1 秒を取り、結果のつかみが入手を決める＝組で試している（Indie Hackers https://www.indiehackers.com/post/0bfffe36bd ・検証前）。
- 再生 500 万回でも入手につながらなかった例（Superwall https://superwall.com/blog/copy-this-strategy-itll-blow-up-your-app ）。リンク無しの動画 2 本で 1 週間後に有料会員が出た体験談（HackerNoon https://hackernoon.com/i-posted-two-tiktoks-with-no-link-to-my-app-and-i-still-got-a-paid-subscriber ・時期だけの根拠）。
- AppsFlyer は 2024Q1〜2025Q1 の動画素材 110 万件を分析した報告を出している（https://www.appsflyer.com/?p=461437 ・つかみの種類の結果は確かめられていない＝要確認）。

### Instagram
- リールは新しい人に届きやすく、Meta によれば利用時間の半分がリール（Shopify の解説 https://www.shopify.com/blog/how-to-use-instagram-reels-marketing ）。機能・利点・使い方を見せる型がすすめられる（Hootsuite https://blog.hootsuite.com/instagram-reels/ ）。
- フォロワー外にだけ見せて反応を試す「お試しリール」（MacRumors 2024-12 https://www.macrumors.com/2024/12/10/instagram-trial-reels/ ）。
- 視聴時間・リプレイ・保存・送信がいいねより強い（Creatify https://creatify.ai/ja/blog/how-to-make-a-great-reel-create-engaging-instagram-content-in-minutes ・前回の調べの Mosseri の発言と一致）。音を消して見られるので字幕を最初から（Filmora https://filmora.wondershare.jp/instagram/reels-buzz.html ）。

### X
- 2026-07 に iOS の X で、写真や画面を背景にした字幕つき（日本語対応）の動画を作れるようになった（窓の杜 https://forest.watch.impress.co.jp/docs/news/2122877.html ）。
- 縦の動画は全画面で流れやすく、音を消して見られるので冒頭で伝える構成がよい（広告.jp の 2026 年版 https://www.koukoku.jp/service/suketto/marketer/?p=29312 ）。
- 個人開発者の機能紹介の動画が伸びた日本語の一次情報は見つからなかった（検索 1 回）。

### Threads
- 機能の一覧（500 字の投稿・1 万字の長文の添付・コミュニティ など）はあるが、宣伝・機能紹介の反応の実データは見つからなかった（Web 担 https://webtan.impress.co.jp/e/2025/10/23/50189 ・コムニコ https://www.comnico.jp/we-love-social/threads ）。前回の調べ（会話が軸・宣伝は伸びにくい・リンクは押されにくい）を引き継ぐ。

### note
- 開発者が自分のアプリの機能を連載して利用者を増やした型の一次情報は見つからなかった（検索 1 回）。前回の調べ（題 25 字・リード 50 字・体験と実数・失敗談が読まれる・note 内検索の言葉）を引き継ぐ。

## 見つからなかったこと（自分で測る）
- 機能から入る型と困りごとから入る型の入手の差 → 同じ機能で 2 本ずつ比べる（`ct=` を分ける）。
- どの機能がいちばん入手につながるか → 機能ごとに `ct=<機能>` を付けて 4 週で比べる。
