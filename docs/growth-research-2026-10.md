# Orime グロース調査メモ（2026-10-05）

> 調べ方の注意：この環境では **WebFetch が通らなかった**（revenuecat.com・apptweak.com・repro.io・rocketshiphq.com がどれもプロキシで遮断）。App Store のページも開いていない。数字は **WebSearch の検索結果の抜粋**から拾っている。原文の表・注記・定義（中央値か平均か、期間、母集団）は確かめきれていないので、意思決定に使う数字は原文で確かめ直すこと。
> 「推測」「試算」と書いたものは筆者の推論で、出典の主張ではない。
> 円換算は **1 ドル＝150 円** で置いた（試算）。

---

## 0. 結論の先出し（Orime への含意・推測を含む）

1. **獲得の主力は「自分の X/note での開発ストーリー＋公開日の予約注文＋Featuring Nomination」**。日本の個人開発の事例では、プレスリリースより「X での 1 本のバズ」が効いた例がはっきりある（よりしろ：1 日 600 DL・プレスリリースは無風）。広告は日本の CPI が 1 件あたり約 ¥220〜390（試算）で、フリーミアムの課金率では元が取りにくい。
2. **フリーミアムは課金率で不利**：インストール → 35 日以内の課金率の中央値は、ハードペイウォール 10.7%・フリーミアム 2.1%（RevenueCat）。日本全体の中央値は「2% 強」。ただし 1 年後の継続率は差がない（27% 対 28%）。
3. **7 日間無料をいつ見せるかが最大のレバー**：RevenueCat ではトライアル開始の **89.4% がインストール当日**。Orime の今の決まり（初回ガイド・ホームではすすめず、トークンを使い切った／プランの機能を押した／メモ 10 件の 3 つのときだけ）は、この「当日」の窓を捨てている可能性がある（推測・オーナー判断が必要）。
4. **AI アプリは解約が速い**：AI アプリの年額の 1 年継続 21.1%（AI でないアプリ 30.7%）、月額 6.1%（9.5%）。Orime の守りは「メモが積み重なるほど相談が良くなる＝やめにくい」こと。これを最初の 1 か月で体感させるのが継続の要（推測）。
5. **年額を押す根拠はある**：日本は年額プランの LTV が世界一（Adapty・$54.59）。年額の解約の 35% は 1 か月目に集中（自動更新オフ）。創業メンバー価格（年額 1 年目 ¥9,800）は筋が良いが、1 か月目に価値を見せないと 2 年目に残らない。
6. **季節**：手帳の売り場は 11 月下旬〜12 月が山、ビジネス書グランプリの投票は 12 月（2025 年は 12/2〜12/26）、年末の「まとめ」は Spotify Wrapped が 12 月初めに数億人規模で共有される。**11 月公開 → 12 月に「今年の読書のまとめ」画像 → 1 月「来年こそ読書」**が自然な流れ（推測）。
7. **ステマ規制**：無料コード・物品・金銭を渡して投稿してもらう＝広告。「広告」「PR」を最初に目に入る位置に。違反すると措置命令は**広告主（Orime）**に出る。

---

## 1. 日本の個人開発・小規模アプリが公開直後に伸びた事例

| 事例 | 何が効いたか | 数字 | 出典 |
|---|---|---|---|
| よりしろ（AI の自己分析日記・個人開発） | X の告知ポストのバズ。**プレスリリースは無風** | 翌日 1 日 600 DL・ランキング圏外 → 50 位・プロダクトページ閲覧 → DL 転換 7 割超 | [note（横田裕市）](https://note.yokoichi.jp/n/n5f2c9dd4d6f7) |
| 個人開発ゲーム「魔女の育成」 | iOS 予約注文＋Android 事前登録＋「予約トップ10」掲載を同時に | 事前登録 269 人 → 初週 3,377 DL（「やる価値があった」） | [note（おけ）](https://note.com/deft_eider3912/n/nfacc4b89103a) |
| ある会社の初の事前予約 | 予約分が公開日に一斉に入り、カテゴリランキングに即登場。**2 日目には圏外** | 予約期間 iOS 約 22 日・2 日間で予約数約 5 倍 | [Zenn（zoome）](https://zenn.dev/zoome/articles/29a23c1d55aa22) |
| IsTalk（ユーティリティ・個人） | 日本ランキング 1 位。値上げ（月 300→500 円・年 1,800→2,500 円）で売上増 | 月 100 万円超・サブスク 3,000 人超。**バズった週の翌週に 8 割超が離脱** | [note（けい）](https://note.com/keitaaaan/n/ncbfee0d853dd) |
| 家族カップル向け TODO（個人） | 地道な更新 | 1 年で 1 万 DL（前年 12 月 2,400 → 約 5 倍） | [note（ひろし）](https://note.com/hirothings/n/n86cb60f5ef38) |
| 個人開発（無風の 1 か月の後） | — | 3 日で 5 人課金・合計 11,500 円 | [note（りうる）](https://note.com/riulu_d/n/ne2c3e10a5a7d) |
| アトピヨ（個人） | PR TIMES で多数のメディアに掲載 → DL 増 | 別の個人開発者は 2 日で 6,703 PV・26 サイトに転載 | [PR TIMES MAGAZINE](https://prtimes.com/magazine/launch-of-app-service/) / [izanami](https://izanami.dev/post/12a15a76-1a11-4bd0-937b-81f11fdb287d) |
| 有料プレスリリース 3 万円（個人・英語学習ゲーム） | 効果の評価は記事本文を要確認（抜粋では判断できず） | — | [note（おとなし）](https://note.com/studynow/n/n61a81a179ffb) |

**海外の似た型（読書×個人・小規模）**
- **The StoryGraph**（Goodreads の代替・創業者 1 人から）：2021/6 に 20 万人 → 2022/6 に 100 万人 → 2023/12 に 200 万人 → 2026/1 に 500 万人。BookTok で「Goodreads（Amazon）からの乗り換え」が話題になった日は 1 日 2.5 万人（通常の 10 倍）。[ground.news / The Conversation](https://theconversation.com/amazons-goodreads-builds-community-but-breeds-division-indie-rival-storygraph-is-playing-it-safe-and-gaining-ground-250523) / [wearefounders](https://www.wearefounders.uk/the-storygraph-how-nadia-odunayo-built-a-better-alternative-to-goodreads/)
  → **含意（推測）**：「ほかのアプリから取り込む」は乗り換えの物語を作れる。ブクログ・読書メーターからの取り込みを前面に。
- **Readwise**（Kindle のハイライト取り込み＋毎日の振り返りメール・自己資金）：Tiago Forte の「Building a Second Brain」講座の受講生に 1 年分の有料を付ける提携。[producttalk](https://www.producttalk.org/2023/04/personal-knowledge-management/) / [Readwise blog](https://blog.readwise.io/why-were-bootstrapping-readwise/)
  → **含意（推測）**：読書術の著者・講座との「受講者に Orime の◯か月」型の提携は筋がある（オファーコードで実装可・§5）。

**Product Hunt**：日本の個人開発者が日次 2〜6 位を取った例は多いが、初日の訪問は約 700 で毎日半減（[Zenn](https://zenn.dev/sabigara/articles/4a4866fece771d) / [NOT SO BAD](https://blog.notsobad.jp/posts/6273d3ed-75a0-4936-abcb-e0c781f52a7a)）。英語圏の開発者向けの場なので、**日本語だけ・日本の会社員向けの Orime には効きにくい**（推測）。

**共通点（推測）**：①最初の波は「作った本人の言葉」の X 投稿 1 本から来る ②波は 1〜2 日で引くので、その時のプロダクトページの転換率と当日のトライアル導線が勝負 ③予約注文は公開日に順位を作る道具で、続かない。

---

## 2. App Store の打ち手

### 2-1. 予約注文（Pre-order）
- 公開の **最大 180 日前**から出せる。公開日に予約した人の端末へ自動でダウンロードされ通知が届く。予約・取り消し・純予約数が App Store Connect で見られる。[AppleInsider](https://appleinsider.com/articles/20/10/15/developers-can-now-offer-app-store-pre-orders-180-days-ahead-of-release) / [Apple 公式](https://developer.apple.com/app-store/pre-orders)
- 公開日の DL がランキングに反映 → 2 日目に圏外、の例あり（§1 Zenn）。
- **注意**：予約注文は App Review を通ったビルドが要る（推測・Apple の手順で要確認）。LP の「公開の日にメールで知らせる」は、予約注文の URL が取れたらそちらに差し替えるのが筋（CLAUDE.md のとおり `VITE_APP_STORE_URL` に予約ページの URL を入れても動く）。

### 2-2. Featuring Nomination（注目掲載の申請）
- App Store Connect の「Featuring → Nominations」から。新規公開・大型更新・In-App Event を編集部に知らせる。[Apple 公式ヘルプ](https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring/)
- 期限：出典で揺れる。「少なくとも 3 週間前」「最低 2 週間・本気なら 3 か月前」「編集部は 8〜12 週先を計画」。[aso.dev](https://aso.dev/metadata/nominations/) / [Kickstart](https://www.kickstart.tools/blog/how-to-get-featured-on-the-app-store-nominations-timing-and-what-editors-want) / [asomobile](https://asomobile.net/en/blog/featuring-in-the-app-store-a-detailed-guide-updated/)
  → **11 月公開なら、今日（10/5）すぐ出すべき**（推測）。
- 評価の観点（第三者の整理）：UX・UI・新しさ・独自性・アクセシビリティ・ローカライズ・プロダクトページの質。[appscreenshotstudio](https://appscreenshotstudio.com/blog/get-featured-on-the-app-store-2026-nominations-guide)
- 日本の個人開発者の体験：「役に立つ情報」欄に開発の思い・こだわりを書くのが良さそう。[note（あさひ）](https://note.com/sane_thyme398/n/n2a8b14f4ca90)
- Today 掲載の効果（古いデータ・Sensor Tower 2018 頃）：「今日のアプリ」で前週比 +685%、掲載アプリの約 29% は掲載前の累計 DL が 1 万未満＝小さなアプリにも機会。[iPhone Mania](https://iphone-mania.jp/news-210133/) / [xiaolongchakan](https://xiaolongchakan.com/archives/ios-app-store%E3%81%AE%E3%80%8C%E4%BB%8A%E6%97%A5%E3%81%AE%E3%80%87%E3%80%87%E3%80%8D%E7%AD%89%E3%81%A7%E7%B4%B9%E4%BB%8B%E3%81%95%E3%82%8C%E3%82%8B%E3%81%A8%E3%80%81%E3%83%80%E3%82%A6%E3%83%B3.html)

### 2-3. Apple Ads（旧 Apple Search Ads）
| 指標 | 値 | 出典 |
|---|---|---|
| 日本の CPT（検索結果の中央値） | $1.11（≈ ¥167・試算） | [AppTweak 2026](https://www.apptweak.com/en/aso-blog/apple-ads-benchmarks) |
| 日本の CPI（中央値） | $2.57（≈ ¥386） | 同上 |
| 日本の CPT／CPA／転換率（サブスクアプリ） | $0.73／$1.49（≈ ¥224）／49.28% | [Adapty 2026](https://adapty.io/blog/apple-ads-benchmarks-2026/) |
| 米国のカテゴリ別 CPT／CPI | ブック $0.88／$1.53・教育 $1.52／$2.91・仕事効率化 $1.74／$3.58 | [AppTweak 2026](https://www.apptweak.com/en/aso-blog/apple-ads-benchmarks)（米国） |
| ニッチ別（地域不明・全体と思われる） | Books & Reference 転換 70.3%・CPA $1.62／教育 65%・$2.18 | [Adapty niche](https://adapty.io/apple-ads-for-subscription-apps/) |
| 日本の CPT 水準 | 米国を 100 として 40〜55 | [Repro（抜粋）](https://repro.io/contents/apple-search-ads-cost/) |
| 個人開発の実例（古い） | Basic に約 7.8 万円・2 週間・700 インストール＝1 件 113 円 | [AppSeed ブログ](https://develop.hateblo.jp/entry/apple-search-ads-try) |
| 2026 年の変更 | 検索結果の広告枠が 1 → 複数へ。**日本は 2026/3/10 から**（iOS 26.2 以降に表示） | [Search Engine Land](https://searchengineland.com/apple-ads-adds-more-ad-slots-to-app-store-search-results-467905) / [ppc.land](https://ppc.land/apple-will-squeeze-more-ads-into-app-store-search-heres-what-changes/) |

**試算（推測）**：CPI ¥220〜390 × 課金率 2%（日本の中央値・§3）＝ **1 人の有料会員に ¥11,000〜19,500**。月額 ¥1,480 の手取りは約 ¥1,144（税と 15% を引く）で、月額の 1 年継続の中央値 6〜14%（§3）では回収しにくい。**自分の名前・競合名・「読書記録」などの指名に近い語に小さく絞り、年額の転換で回るかを確かめてから広げる**のが安全。Basic（CPI 課金）で上限を決めて始める手もある。

### 2-4. カスタムプロダクトページ（CPP）
- 1 アプリ **最大 70 ページ**（2025/10/29 から・以前は 35）。2025/7/30 から **キーワードを CPP に割り当てて自然検索にも出せる**（1 つのキーワードは 1 ページだけ）。[MobileAction](https://www.mobileaction.co/blog/apple-doubles-the-custom-product-page-limit/) / [RespectASO](https://respectaso.com/blog/custom-product-pages-app-store-guide-2026/)
- 効果：Apple Ads の広告バリエーションで転換率 約 +6%（AppTweak）、Redbox +30%、VOD で CTR +32%・CVR +11%。[optipschannel / AppTweak 日本語](https://www.apptweak.com/ja/aso-blog/apple-search-ads-custom-product-pages-best-practices)
- **Orime の使い方（推測）**：「ブクログから乗り換え」「Kindle のハイライト」「紙の本を撮って書き起こす」「ビジネス書を行動に」など入口ごとに 1 ページ。X・note・インフルエンサーの導線もページを分けて、どこから来た人が課金するかを見る（LP の `ct=` 計測とも合う）。

### 2-5. In-App Events
- イベントの **14 日前から**ストアに出せる。承認済みは最大 10 件・公開中は全地域で最大 5 件。通知の申し込み（「通知を受け取る」）ができる。[Apple Tech Talk](https://developer.apple.com/videos/play/tech-talks/110347/) / [Apple ヘルプ](https://www.developer.apple.com/help/app-store-connect/offer-in-app-events/overview-of-in-app-events)
- 効果（代理店の検証）：開催中にインプレッション・初回 DL が **+50% 超**、終わると元に戻る。[Phiture](https://phiture.com/asostack/in-app-events/)
- 予約注文中のアプリで出せるかは確認できなかった（不明）。
- **Orime の候補（推測）**：「12 月：今年の読書をふりかえる 7 日間」「1 月：来年こそ読む本の読書計画をつくる週」「ビジネス書グランプリ（2 月の発表）を読む会」。

---

## 3. サブスクの指標の目安

> 主な出典：RevenueCat「State of Subscription Apps 2025 / 2026」（2026 版は 115,000 アプリ・$16B）、Adapty「State of In-App Subscriptions 2026」（16,000 アプリ・$3B）。いずれも原文未確認（抜粋）。

### 3-1. 獲得 → トライアル → 有料
| 指標 | 値 | 出典 |
|---|---|---|
| DL → トライアル開始（中央値／上位 10%） | 6.2%／20.3% | [RevenueCat 2025](https://www.revenuecat.com/state-of-subscription-apps-2025) |
| 同（カテゴリ） | ビジネス 9.1%・教育 6.5%・ゲーム 4.4% | 同 / [RevenueCat 2026 Education](https://www.revenuecat.com/state-of-subscription-apps-2026-education) |
| 同（価格帯） | 高価格 約 10%・低価格 4.3% | [RevenueCat 2025](https://www.revenuecat.com/state-of-subscription-apps-2025) |
| DL → トライアル（Adapty・世界平均）／北米 | 10.9%／14.5%（ほか 7.6〜10.2%） | [Adapty 2026](https://adapty.io/state-of-in-app-subscriptions/) |
| トライアル → 有料（世界平均・Adapty） | 25.6% | 同上 |
| トライアル → 有料（長さ別・RevenueCat） | 4 日以下 25.5%・**5〜9 日 37.4%**・17〜32 日 42.5% | [RevenueCat 2026 まとめ](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026) |
| 年額プランのトライアル → 有料（長さ別） | 4 日以下 24%・5〜9 日 33%・10〜16 日 43%・17〜32 日 44.6%。**AI アプリは 16 日で頭打ち** | [SaaStr（RevenueCat 17,000 アプリ・2025/8〜2026/7）](https://www.saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days/) |
| トライアル開始の日 | **89.4% がインストール当日**（ビジネス 89.9%・仕事効率化 78%） | [RevenueCat 2026（抜粋）](https://www.revenuecat.com/state-of-subscription-apps) / [SaaStr](https://www.saastr.com/of-trials-start-on-day-0-dont-waste-your-shot) |
| トライアルの解約の日 | 全体の 55% が 0 日目。7 日トライアルの解約の 64% は 0〜1 日目 | [RevenueCat 2026 まとめ](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026) / [RevenueCat 7 日](https://www.revenuecat.com/blog/growth/7-day-trial-subscription-app) |

### 3-2. ハードペイウォール vs フリーミアム
- DL → 35 日以内の課金：**ハード 10.7%・フリーミアム 2.1%**（中央値）。60 日の 1 インストールあたり売上 $3.09 対 $0.38（約 8 倍）。[RevenueCat 2026](https://www.revenuecat.com/state-of-subscription-apps)
- ただし **1 年継続はほぼ同じ（27% 対 28%）**。フリーミアムが正解なのは無料の人が口コミ・ネットワーク効果・ブランドを生むとき。ハード → フリーミアムに変えた 2 社で、1 社は LTV +75%、もう 1 社は課金 −50%。[RevenueCat blog（2026/4）](https://www.revenuecat.com/blog/growth/hard-paywall-vs-freemium)
- **含意（推測）**：Orime のフリーミアム（無料プラン＋メモが答える相談）は「無料でもメモを書き続ける＝積み重なる＝口コミ・共有画像」の理屈で選んでいるので筋は通る。その代わり **「当日のトライアル」と「メモ 10 件の瞬間」の 2 点での転換**を磨かないと、課金率は 2% 前後に落ち着くと見ておく。

### 3-3. 地域（日本・アジア太平洋）
- アジア太平洋の DL → 課金（D35）中央値 2.4%（上位 4 分の 1 は 5.1% 超）。**日本は 2% をやや超える**程度（EMEA より上）。14 日目の 1 インストール売上はアジア太平洋 $0.28（西欧 $0.25）。[RevenueCat 2025/2026（抜粋）](https://www.revenuecat.com/state-of-subscription-apps-2025)
- **日本は年額プランの LTV が世界一（$54.59）**、アジア太平洋の 1 年 LTV 中央値は日本 $23.4。[Adapty 2026](https://adapty.io/state-of-in-app-subscriptions/) / [ppc.land](https://ppc.land/95-of-app-subscription-revenue-goes-to-top-10-adaptys-2026-benchmark-report/)
- 日本は返金率が他地域の 3 分の 1（RevenueCat 2024 年版の記述・2026 年版では未確認）。[RevenueCat 2024](https://www.revenuecat.com/state-of-subscription-apps-2024)
- 日本の消費者：サブスク利用 79%（20 代 92%）・平均 2.3 個・支出は月 1,000〜3,000 円が最多 31.4%・7 割が解約を検討した経験・理由 1 位は節約。[コマースピック](https://www.commercepick.com/archives/70690) / [Appliv 調べ（PR TIMES）](https://prtimes.jp/main/html/rd/p/000000491.000055900.html)

### 3-4. 年額と月額・継続
- プランの比率（地域）：週 16〜29%・月 36〜55%・年 19〜40%（北米が年額最大 40%）。カテゴリ：教育は年額 56%、健康 67%。**仕事効率化は売上の 91% が月額**。年額は月額の約 2 倍の 1 インストール売上。[RevenueCat 2025/2026（抜粋）](https://www.revenuecat.com/state-of-subscription-apps-2025)
- 1 年継続：月額の中央値 6〜14%（上位 4 分の 1 は 11〜25%）・年額 20〜40%（32〜59%）。初回更新での脱落：月額 39〜58%・年額 60〜77%。年額の解約の **35% は 1 か月目**、解約した年額の人の復帰は 5%。[9to5Mac](https://9to5mac.com/2026/05/27/new-report-shows-annual-app-subscribers-rarely-return-after-they-cancel/) / [ppc.land](https://ppc.land/95-of-annual-app-subscribers-who-cancel-never-return-revenuecat-finds/)
- **AI アプリ**：1 年目の課金者あたり売上は +41%（$30.16 対 $21.37）だが、解約は 30〜36% 速い。1 年継続は年額 21.1% 対 30.7%、月額 6.1% 対 9.5%。返金率 4.2% 対 3.5%。継続の上位群の中央値 13.9%・下位群 1.4%。[RevenueCat AI 継続調査](https://www.revenuecat.com/blog/growth/ai-app-retention-study) / [TechCrunch](https://techcrunch.com/2026/03/10/ai-powered-apps-struggle-with-long-term-retention-new-report-shows)

**Orime の計画の置き方（試算・推測）**
- DL → 7 日間無料：5〜9%（教育・ビジネスの中央値付近。当日に見せないなら下がる）
- 7 日間無料 → 有料：30〜37%（5〜9 日の中央値付近。AI アプリは低めに見る）
- DL → 有料（35 日）：約 2%（日本の中央値）。上位 4 分の 1 を狙うなら 5%
- 月額の初回更新での脱落 40〜60%、年額の 1 か月目の自動更新オフに注意
- 例：公開 1 か月で 3,000 DL なら有料 60 人前後（2%）→ 月の手取り 約 ¥6〜7 万（年額の比率で変わる）

---

## 4. 読書・自己啓発・ビジネス書の層に届くチャネル

### 4-1. 市場の前提
- **1 か月に 1 冊も本を読まない人 62.6%**（16 歳以上・2024/3 調査・文化庁 2024/9 公表）。1〜2 冊 27.6%。読む量が減った 69.1%（理由はスマホ等と忙しさ）。[文化庁 PDF](https://www.bunka.go.jp/tokei_hakusho_shuppan/tokeichosa/kokugo_yoronchosa/pdf/94116401_01.pdf) / [Web担当者Forum](https://webtan.impress.co.jp/n/2024/09/20/47773)
- **業務外の学習時間なし 56.1%**、学習方法「どれもしていない」54.9%（正規雇用 20〜64 歳・6,000 人・2023/10 調査）。日本は世界で突出して高い。[パーソル総合研究所](https://rc.persol-group.co.jp/news/202402071000/)
  → **含意（推測）**：狙うのは「すでに読んでいる 3〜4 割」。そのうえで「読んでも忘れる・行動に移らない」痛みが強いビジネス書の読者。

### 4-2. 動画・音声
| チャネル | 規模 | 出典 |
|---|---|---|
| 本要約チャンネル（YouTube） | 167 万人・4.7 億回（2024/7） | [東洋経済 著者ページ](https://toyokeizai.net/list/author/9288) |
| サラタメ（YouTube） | 76 万人（2024/11） | [Wikipedia](https://ja.wikipedia.org/wiki/%E3%82%B5%E3%83%A9%E3%82%BF%E3%83%A1) |
| 中田敦彦の YouTube 大学 | 約 547 万人 | [yutura](https://yutura.net/channel/10184/chart/) |
| Voicy「荒木博行の book cafe」（毎朝）・Podcast「超相対性理論」 | 荒木氏は『自分の頭で考える読書』『ビジネス書図鑑』の著者 | [日経クロストレンド](https://xtrend.nikkei.com/authors/19/00356/) / [Apple Podcasts](https://podcasts.apple.com/jp/podcast/%E8%B6%85%E7%9B%B8%E5%AF%BE%E6%80%A7%E7%90%86%E8%AB%96/id1567192930) |
| Voicy の読書系 | 「名もなき読書家のホントーク！」（フォロワー 2,352・48.6 万回）・「毎日書評」・「マグの 1% 読書ラジオ」・「日経の本ラジオ」 | [Voicy](https://voicy.jp/channel/2972) / [聴く日和](https://kikubiyori.net/voicy-osusume) |
| TikTok（小説中心） | けんご：紹介した『残像に口紅を』が 4 日間で売上約 17 倍・累計 11.5 万部の増刷 | [日経 xwoman](https://woman.nikkei.com/atcl/column/23/031300295/080100005/) / [Business Insider](https://www.businessinsider.jp/article/240199/) |

**含意（推測）**：大型の要約 YouTuber は費用が大きく、「要約で済ませる層」は Orime の「自分のメモが育つ」と思想が逆。**中規模（1〜10 万）の「読書術・アウトプット」系の X・Voicy・Instagram の人**の方が合う。PR は必ず表示（§6）。

### 4-3. Instagram・X・note
- Instagram の本垢：じゅんじゅん 10.4 万・やまてつ 6.5 万など。出版社（集英社の文芸編集部など）とのタイアップ投稿の例あり。[find-model](https://find-model.jp/insta-lab/influencer-marketing-books/) / [realiser](https://realiser.jp/reading-instagram/)
- X：「#読了」が最も一般的。「#読書垢」「#読書好きな人と繋がりたい」。**月末に「#3月読了本」のように、読書メーター等の読了棚のスクショが一斉に投稿されトレンド入り**。[X トレンド](https://x.com/i/trending/2038853473324974400) / [文学部](https://bungakubu.com/dokusyo-hashtag/)
  → **含意（推測）**：Orime の「写真で共有」に「今月の読了（#11月読了本）」の型を足すと、毎月末に既存の文化に乗れる。
- 読書メーターは 2023/4 に X への同時投稿を終了（個別のシェアのみ）。[読書メーター公式ブログ](https://media.bookmeter.com/2023/04/info_01005602543.html) → 共有のしやすさで差がつけられる余地（推測）。
- note：「#読書」549,538 件・「#読書記録」186,126 件・「#読書感想文」27 万件超（2025/11 末）。**note と 9 出版社の「#読書の秋2025」（9/30〜10/31）に 16,528 件**。2026 年版の有無は確認できず。[note 公式](https://note.com/info/n/n72cacfef4a8e) / [note #読書感想文](https://note.com/info/n/nbf3b707bc3b7)

### 4-4. 出版社・書店・要約サービス・コミュニティ
- **flier（本の要約）**：累計会員 125 万人超・法人 1,200 社超（2025/5）・2025/2 に東証グロース上場。グロービスと「読者が選ぶビジネス書グランプリ」を主催。[DreamNews](https://www.dreamnews.jp/press/0000320504/) / [PR TIMES](https://prtimes.jp/main/html/rd/p/000000005.000101803.html)
- **ビジネス書グランプリ 2026 の日程**：エントリー 2025/10/28〜11/24・**投票 12/2〜12/26**・発表 2026/2/12。[business-book.jp](https://business-book.jp/rules) / [グロービス](https://mba.globis.ac.jp/news/detail-25694.html)
  → 2027 年版も同じ時期なら、Orime 公開直後の 12 月に「あなたが今年いちばん行動に移した本」で乗れる（推測）。
- ビジネス書の出版社 4 社合同フェア（英治出版・かんき出版・文響社・ディスカヴァー）など、出版社の合同企画は前例あり。[ディスカヴァー note](https://note.com/discover21/n/n74ad12bc9041)
- 書店：有隣堂の YouTube「有隣堂しか知らない世界」、丸善ジュンク堂のアプリ開始キャンペーン。[日経](https://www.nikkei.com/article/DGXZQOUD102NR0Q3A210C2000000/) / [丸善ジュンク堂](https://www.maruzenjunkudo.co.jp/pages/appcp-202412)
- 読書会：**猫町倶楽部** 会員約 9,000 人・年約 300 回・延べ 1.2 万人超（東京・名古屋・関西・金沢・福岡）。[Wikipedia](https://ja.wikipedia.org/wiki/%E7%8C%AB%E7%94%BA%E5%80%B6%E6%A5%BD%E9%83%A8) / [プレジデント](https://president.jp/articles/-/31310?page=1)
- **アプリ×出版社の具体的な協業事例は検索で見つからなかった**。Readwise × Tiago Forte（§1）の型（著者の講座・本の読者に有料期間を付ける）が近い（推測）。

---

## 5. UGC・紹介の仕組み

### 5-1. 共有で伸びた例
- **Spotify Wrapped 2025**：24 時間で 2 億人が利用（前年比 +19%・2024 年は 62 時間かかった）、3 日足らずで 2.5 億人。共有は大幅増（Instagram の共有はほぼ倍）。[Music Business Worldwide](https://www.musicbusinessworldwide.com/spotify-wrapped-campaign-hit-200m-engaged-users-in-24-hours-a-19-yoy-increase/) / [Variety](https://variety.com/2025/music/news/spotify-wrapped-breaks-own-record-250-million-engagements-1236603493/)
- **Strava**：登録 1.8 億人（2025/11・毎月 300 万人増）・2025 年売上 $415M。2025 春に「Stats Stickers」（透明の数字＋ロゴを好きな写真に重ねて Instagram ストーリーへ）。共有機能と獲得の因果の数字は見つからず。[BikeRadar](https://www.bikeradar.com/news/strava-sticker-stats-spring-2025-updates) / [Business of Apps](https://www.businessofapps.com/data/strava-statistics/)
  → Orime の「写真で共有（ロゴは必ず入る）」は Strava の Stats Stickers と同じ型。
- **Goodreads Reading Challenge 2025**：参加 752 万人・宣言 2.8 億冊（平均 37 冊）。[Goodreads](https://www.goodreads.com/user_challenges/61594108)
- **読書メーター OF THE YEAR**：毎年 11 月中旬に投票開始・12 月下旬に発表、約 180 万件の感想を集計。月間 UU 約 605 万。[PR TIMES](https://prtimes.jp/main/html/rd/p/000000830.000096446.html) / [digital-dokusho](https://www.digital-dokusho.jp/magazine-hikaku/bookmeter-booklog/)

### 5-2. 紹介特典に使える App Store の仕組み
- **オファーコード**：使い切りコード（専用 URL で配れる）と、名前を決められる「カスタムコード」（例 SPRINGPROMO）。**1 アプリ 1 四半期に最大 100 万回**の利用。2025/10/29 から自動更新サブスク以外の課金にも対応。[Apple Developer News](https://developer.apple.com/news/?id=9sjl5wuv) / [App Store Connect ヘルプ](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-subscription-offer-codes/) / [MacRumors](https://www.macrumors.com/2025/10/29/apple-developer-app-store-updates/)
- **App 内課金のプロモーションコードは 2026/3/26 に新規作成終了**（オファーコードへ移行）。[BGR](https://www.bgr.com/2011787/apple-retire-in-app-purchase-promo-codes/)
- 日本ではアプリの「友だち紹介」はほぼ無い（古い記事）。[yapp](https://yapp.li/magazine/2552/)
- **App Store の審査ガイドライン**：評価・レビューの見返りに報酬を出すこと、評価を操作することは禁止（3.2.2・5.6 系）。[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- **案（推測）**：①創業メンバーに「友だちに渡せる 1 か月無料」の使い切りコードを数枚 ②著者・読書会・講座ごとのカスタムコード（どこから来たか測れる）③紹介した側の特典は「追加トークン」などにする場合、景表法・審査の両面で専門家に確認。

---

## 6. 景品表示法のステマ規制（2023/10/1〜）

- 事業者の広告なのに、それと分からないものは不当表示。SNS・動画・ブログなど全媒体が対象。**10/1 以前の投稿も、見られる状態なら対象**。[NTT 東日本](https://business.ntt-east.co.jp/bizdrive/column/post_188.html)
- 判断基準は「事業者が表示内容の決定に関与したか」と「第三者の自主的な意思と言えるか」。**無償提供・金銭・割引コード・イベント招待**を渡した投稿は自主的とは言えない＝広告表示が必要。依頼も対価も無く自分で買って書いた投稿は対象外。[BUSINESS LAWYERS](https://www.businesslawyers.jp/articles/1310) / [JADMA](https://jadma.or.jp/contents/blog/stealth_marketing3)
- 表示：「広告」「PR」等を**最初に目に入る位置に分かりやすく**。違反時の措置命令は**広告主**に出る（インフルエンサーではなく）。[effectual](https://effectual.co.jp/sorila/blog/pr-hyoki-stema-kisei/) / [アクセストレード](https://www.accesstrade.ne.jp/study/affidai/detail/343)
- 自社（本人）の公式アカウントでの宣伝は、事業者の表示と明らかなら対象外。**従業員・関係者の個人アカウントは対象になりうる**ので立場を明記。[セミナーズ](https://seminars.jp/media/1055)
- 口コミの見返り：特典を付けて口コミを集めるのは要注意。医療法人が高評価の口コミに治療費の割引を付けて違反と認定された例。[薬事法広告研究所](https://www.89ji.com/keihyou-guide/present_reviews.html) / [弁護士ドットコム](https://www.bengo4.com/c_8/n_16678/)
- 措置命令の例：**大正製薬（2024/11）** インフルエンサー 3 人に報酬約 1 万円＋商品を渡し投稿依頼・自社サイトに転載。**ロート製薬（2025/3/25）** モニターに画像・文言を指示して Instagram 投稿させ、自社サイトに転載。[薬事法広告研究所](https://www.89ji.com/news/41.html) / [Yahoo!ニュース（共同）](https://news.yahoo.co.jp/articles/46068f724947d4f8ab985e42be3e728017419749)

**Orime の実務（推測）**
- インフルエンサーに 7 日間無料より長い無料コードを渡すだけでも「広告」として扱い、**投稿の冒頭に「PR」**、Orime から提供を受けた旨を書いてもらう。投稿文を指定するならなおさら
- 投稿を LP・App Store の説明に転載するときも同じ（大正・ロートはどちらも転載が問題に）
- 「写真で共有」は利用者が自分で投稿するので、見返りが無ければ原則対象外。**共有で特典を付けると話が変わる**
- 創業メンバーの「開発者への直接の窓口・投票」は特典＝見返りと見られうる。創業メンバーに投稿をお願いする場合は PR 表示を案内する

---

## 7. 季節（11〜1 月）の打ち手

| 時期 | 世の中 | Orime の打ち手（推測） | 出典 |
|---|---|---|---|
| 9 月下旬〜12/25 | ブックサンタ（2025 年は 12.2 万冊・全国 1,747 店舗） | 共感の話題。直接の協賛は予算次第 | [PR TIMES](https://prtimes.jp/main/html/rd/p/000000028.000050669.html) / [学研](https://kosodatemap.gakken.jp/learning/book/95323/) |
| 9 月〜3 月（山は 11 月下旬〜12 月） | 手帳の売り場 | 「来年の読書計画は手帳でなくアプリで」の比較・相互送客 | [書きま帳+](https://www.kakimacho.jp/research/81/) |
| 11 月中旬〜12 月下旬 | 読書メーター OF THE YEAR の投票・発表 | 同時期に「Orime で今年の読書をふりかえる」画像 | [PR TIMES](https://prtimes.jp/main/html/rd/p/000000830.000096446.html) |
| 12 月初め | Spotify Wrapped（共有文化の山） | **「今年の読書のまとめ」画像**（冊数・メモの数・実行した行動・一番残った一文）＋ロゴ | [MBW](https://www.musicbusinessworldwide.com/spotify-wrapped-campaign-hit-200m-engaged-users-in-24-hours-a-19-yoy-increase/) |
| 12 月 | ビジネス書グランプリの投票（2025 年は 12/2〜12/26） | 「今年いちばん行動に移した 1 冊」 | [business-book.jp](https://business-book.jp/rules) |
| 月末ごと | X の「#◯月読了本」 | 「今月の読了」画像を月末に知らせる | [X トレンド](https://x.com/i/trending/2038853473324974400) |
| 1 月 | 新年の目標（2025 年に立てた目標：健康 57.1%・仕事（スキル・資格）34.7%）。2026 年の挑戦に「本を月 1 冊以上読む」 | 「来年こそ読む」読書計画シートの In-App Event・年額の訴求 | [マイナビ](https://news.mynavi.jp/article/20250118-3108047/) / [はてなブログ](https://ehondaisuki118.hatenablog.com/entry/2026/01/03/084527) |
| 2 月 | ビジネス書グランプリ発表（2026 年は 2/12） | 受賞作を Orime で読む週 | [グロービス](https://mba.globis.ac.jp/news/detail-25694.html) |

「読書」の Google トレンドの季節性そのものは確認できなかった（要確認：trends.google.co.jp で「読書記録」「読書 習慣」「本 要約」を 5 年で）。

---

## 8. 調べきれなかったこと・次に確かめること
- RevenueCat・Adapty の原文の表（日本・教育／仕事効率化の DL → 有料、年額比率の日本の値）
- 日本の Apple Ads のブック／教育／仕事効率化カテゴリの CPT・CPI（日本語の Repro 記事は開けず）
- 予約注文中のアプリで In-App Event を出せるか（Apple のヘルプで要確認）
- note「#読書の秋」の 2026 年版の有無（9/30 開始なら今まさに開催中の可能性）
- ステマ規制での「紹介特典（紹介した側への報酬）」の扱い（消費者庁の Q&A・弁護士に確認）
- 日本の読書系インフルエンサーの PR 単価（見つからず）
