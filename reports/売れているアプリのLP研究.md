# 売れているアプリの LP は、短く約束し、異論を先に消している

日本と世界で売れているサブスク型の消費者アプリ（読書・学習・習慣化・ノート・AI）の LP をくらべると、共通点は 3 つあった。1 つ目に、ヒーローは**短い言葉で成果か「誰になれるか」を約束**し、仕組みは補足の 1 行に回す。2 つ目に、ボタンには**「無料」をボタンの中に入れる**。価格はヒーローに出さない。3 つ目に、価格・解約・データの扱いといった**買う前の不安を、ページの中と FAQ で先に答えておく**。違いもはっきりしていた。日本の大手は「カテゴリ名＋利用者数＋No.1（出典の注釈つき）」と、あすけんの「専属栄養士」のような**役割の擬人化**で語る。海外の読書系はどちらかというと感情や自分のあり方への約束で語る。Orime の今の LP（`src/pages/Landing.jsx`・`src/pages/lpCopy.js`）は、ボタンの「無料」、追いかけてくる下のボタン、PC の QR、解約と AI の学習を扱う FAQ をすでに備えており、型の大半を満たしている。一方で、足りないものが 3 つある。①**一番の価値「読むほど、自分だけの相談相手が育つ」がヒーローにも本文の流れにも出ていない**。②**見えるヒーローに「読書メモアプリ」というカテゴリ名が無い**。③**数字が出せない時期の信頼の材料（仕組みの事実・データの扱い）が 1 行にとどまっている**。改善案は最後の表に、すぐできる順に並べた。ただし調べた材料は**すべて検索エンジンの結果の抜粋で、実際のページは 1 つも開けていない**。ボタンの位置・節の並び・動画の有無は、ほとんど確かめられていない。

## 材料はすべて検索結果の抜粋で、ページそのものは 1 つも見ていない

この調査では、公式サイトを直接読み込めなかった。WebFetch は名前解決のエラーで止まり、curl は通信の方針で拒否された。対象は flier・あすけん・マネーフォワード・クラシル・Readwise・Blinkist・Headway・Duolingo・Headspace・Strava などの公式ドメインと、ウェブアーカイブ。手元にあるのは次の 4 種類だけである。ページの題名と検索結果の抜粋、アーカイブやキャッシュに残った写し、App Store の説明文、第三者の分析記事。したがって**ここで引く文言は「そのページにあったはずの文」であって、今のヒーローかどうか、ページのどこにあるかは確かめていない**。とくに、ボタンの数と位置、追いかけてくるボタンの有無、ヒーローに動画があるか、節がどの順に並ぶか、FAQ が何問あるかは、どの会社についてもほぼ分からなかった。価格も第三者のサイトどうしで食い違いが多い（クラシルは公式のサポートが月額 480 円、第三者は 550 円（税別）と書く）([クラシル サポート](https://support.kurashiru.com/hc/ja/articles/360034602312))([アプリの達人](https://app-tatsujin.com/kurashiru-premium-comparison/))。以下の結論は「文言の型」については強く、「ページの組み立て」については弱い。そう読んでほしい。

## ヒーローは 3〜9 語の約束で、仕組みは補足に回す

海外の読書・学習アプリのヒーローは短く、機能ではなく得られるものを約束する。Readwise は「Get the most out of what you read」([readwise.io](https://readwise.io/))、Blinkist は「Powerful ideas — 15 minutes at a time」([Blinkist](https://www.blinkist.com/app-free-trial))、Headway の入口は「Become the most interesting person in the room」([Headway](https://makeheadway.com/onboarding/self-growth/landing))。StoryGraph は「Because life's too short for a book you're not in the mood for」と、皮肉の効いた感情の約束を表紙の壁の横に置く([The StoryGraph](https://thestorygraph.com/))。習慣化・学習の大手も同じで、Duolingo は「The free, fun, and effective way to learn a language!」([TypingMind の監査](https://custom.typingmind.com/tools/landing-page-audit/www.duolingo.com))、Headspace は「Be kind to your mind」([Headspace](https://www.headspace.com/headspace-subscription))、Day One は「Your journal for life.」([Wayback 2024](https://webcf.waybackmachine.org/web/20240704145136/https://dayoneapp.com))。強い例には、**数（15 minutes）・相手（power readers）・場面（the most interesting person in the room）のどれか**が入っている。Duolingo は 2021 年の「The world's #1 way to learn a language」から([Wayback 2021](https://webcf.waybackmachine.org/web/20211019143910/https://zs.duolingo.com))、「無料・楽しい・効く」へ変えた。規模が知られたあとは、順位より**不安への答え（無料）と体験**にヒーローを使っていることが分かる。

わかりやすい言葉が効くことには、数字の裏付けもある。Unbounce の 2024 年の調査は 41,000 の LP・5,700 万件のコンバージョンを集めたもので、**小学 5 年〜中学 1 年（米国の 5〜7 学年）で読める文の LP はコンバージョン率の中央値が 11.1%、大学レベルの文は 5.3%** と、約 2 倍の差があった([MarketingProfs の要約](https://marketingprofs.com/charts/2024/52374/landing-page-conversion-benchmarks))。英語の読みやすさの指標なので日本語にそのまま当てはまるとは限らない。それでも、短く具体的な語を選ぶ方向は、上の大手の短いヒーローと一致する。

AI の扱いは 2 つに分かれる。AI が中心の新しい道具は、ヒーローでカテゴリ名を名乗る。Granola は「The AI notepad for people in back-to-back meetings」に「Without a meeting bot.」を添え([granola.ai](https://www.granola.ai/?pubDate=20250821))、Mem は「Your AI Thought Partner」([App Store](https://apps.apple.com/us/app/id1578757028))、Glasp は「Build Your AI Clone from Highlights & Notes」([glasp.live](https://glasp.live/))。一方、いちばん広く使われている NotebookLM は「Understand anything」「your brain's new best friend」と、見出しに AI と書かない([App Store](https://apps.apple.com/app/google-notebooklm/id6737527615))。Granola の「Without a meeting bot.」は、**相手が抱く不安（会議に bot が入ってくる気まずさ）を「〜なしで」と言い切って見出しに変えた**例で、Orime の「要約ではなく、あなたのメモから」と同じ働きをしている。

日本の大手は、ここが違う。あすけんは「会員数800万人超、国内No.1 AI食事管理アプリ」と、**カテゴリ名の頭に AI を付け、数と No.1 を冒頭に置く**([エキサイトニュース](https://www.excite.co.jp/news/article/Prtimes_2023-01-04-58653-77/))。そのうえで、自社の役割を「すべての人の『専属栄養士』」と擬人化する([PR TIMES](https://prtimes.jp/main/html/rd/p/000000245.000058653.html))。AI 栄養士の「未来さん」とチャットで献立を決める新機能は「専属の栄養士に相談するような体験」と紹介され、名前に「(β版)」を付けて期待を抑えている([マイナビニュース](https://news.mynavi.jp/article/20260701-4646628/))。マネーフォワード ME の公式ページの題名は「人気の家計簿・資産管理アプリ」([moneyforward.com/me](https://moneyforward.com/me))、ブクログの App Store の名前は「読書管理ブクログ - 本棚/読書記録」([App Store](https://apps.apple.com/jp/app/%E8%AA%AD%E6%9B%B8%E7%AE%A1%E7%90%86%E3%83%96%E3%82%AF%E3%83%AD%E3%82%B0-%E6%9C%AC%E6%A3%9A-%E8%AA%AD%E6%9B%B8%E8%A8%98%E9%8C%B2/id359066582?mt=8))。日本では**「◯◯アプリ」と探される前提で、カテゴリ名を必ず言う**。「誰に相談できるか」を主語にする擬人化は、Orime の「自分だけの相談相手」にいちばん近い前例である。

## ボタンには「無料」を入れ、価格は換算で軽く見せる

ボタンの文言は、確かめられた範囲ではどれも無料か無料期間を軸にしていた。Notion は「Get Notion free」([Notion](https://www.notion.com/severance))、Strava は「Join Us Now」と「Explore Strava」を並べ、本文に「Join over 100 million active people on Strava for free.」と書く([Strava](https://www.strava.com/?hl=en-eu))。Readwise は「Start 30 day free trial」に「no credit card required」を添える([Readwise](https://readwise.io/pricing/reader))。Blinkist の Web の無料体験のページは「Open the app to sign up for 7 free days of Premium access」と、**無料期間はアプリの中でしか始められないことをそのまま書いて、アプリへ送る**([Blinkist](https://www.blinkist.com/app-free-trial))。これは iOS で始める Orime と同じ制約である。日本でも Audible の「30日間の無料体験を試す」のように、無料を動詞の前に置く形が報じられている([ドコモ いちおし](https://ichioshi.smt.docomo.ne.jp/articles/common/511155))。ただし各社の今のボタンの文字と位置は、原文では確かめられていない。Headway と Noom は、最初の行動を「3 分のクイズ」にして、答えたあとで料金を見せる([Headway](https://makeheadway.com/onboarding/self-growth/landing))。ただ Noom には残り時間を数える表示などの急かしの報告もあり([Landing Doctor](https://landingdoctors.com/teardowns/noom-com))、信頼を軸にする Orime の方針とは合わない。

価格の見せ方は、**ヒーローから外し、年額を「月あたり」に換算して月額の横に置く**のが海外の標準である。Readwise Reader は「$9.99/month billed annually, or $12.99/month billed monthly」と、年額を月あたりで書く([Readwise](https://readwise.io/pricing/reader))。Headspace は年額に 14 日、月額に 7 日の無料期間を付け、「自動で毎年更新されます」とその場で書く([Headspace](https://www.headspace.com/headspace-subscription))。無料期間の長さについては、RevenueCat のデータが紹介されている。**年額プランで、無料期間が 5〜9 日なら有料への移行率 33%、10〜16 日なら 43%**([SaaStr](https://saastr.com/what-17000-subscription-apps-tell-us-about-free-trial-length-annual-plans-convert-86-better-with-30-day-trials-monthly-tops-out-at-two-weeks-and-ai-apps-hit-a-wall-at-16-days))。ただしこれは二次の紹介で、元の報告書は読めていない。1 日あたりの額に言い換えると安く感じる効果は、Gourville の「Pennies-a-Day」（Journal of Consumer Research, 1998）が実験で示している([RePEc](https://ideas.repec.org/a/oup/jconrs/v24y1998i4p395-408.html))。ただし今回の材料では、**1 日あたりの額を LP に出している大手の実例は日本・海外とも見つからなかった**。日本の大手は「月額◯円（税込）」を基準にし、年額や 6 か月の割安を併せて書く。

信頼を高める工夫として最もよく引かれるのは、Blinkist の「無料期間の予定表」である。今日すべて使える → 5 日目にお知らせ → 7 日目に課金、と並べて見せる。調べたところ、無料期間を避ける理由は「解約を忘れるのが怖い」で、導入後に無料期間の開始が 23% 増えたと報告されている([UX Planet](https://uxplanet.org/how-solving-our-biggest-customer-complaint-at-blinkist-led-to-a-23-increase-in-conversion-b60ad514134b))。一方で、同じことを試した Slopes では、お知らせを頼んだ人の有料への移行が 7.8% 下がり、2 週間でやめている([Slopes Diaries #39](https://blog.curtisherbert.com/slopes-diaries-39-risky-business/))。**確実に効く施策ではなく、試して確かめる仮説**として扱うべきである。

日本では価格の書き方に法律の線がある。消費者庁の価格表示ガイドラインは、比べる価格が同じ商品のものでなかったり、あいまいだったりすると不当表示のおそれがあるとしている([消費者庁](https://www.caa.go.jp/policies/policy/representation/fair_labeling/representation_regulation/double_price))。年額を「1 日あたり」「月あたり」に換算すること自体は二重価格ではない。ただ、**一括の前払いであることを同じ場所に書く**のが無難である（公的な見解は見つからず、推論）。

## 数字が出せない時期の信頼は、出典と仕組みの事実で作る

規模を得たアプリは、大きな数字を 1 つと「#1」を出す。Strava の「over 100 million」([Strava](https://www.strava.com/?hl=en-eu))、Day One の「Apple's App of the Year with over 15 million downloads and 200,000 5-star ratings」([App Store](https://apps.apple.com/app/id1055511498))。注目すべきは、**大手ほど No.1 に出典を付けている**ことだ。Calm の「#1 app」には「Sensor Tower – Q2 2024」の注がある([Calm](https://www.calm.com/about))。クラシルの「ダウンロード数No.1」は、Sensor Tower 調べ・ストアのカテゴリ名・期間（2016 年 2 月〜2026 年 2 月）・2 つのストアの合算を明記し、「レシピ動画数No.1」は自社調べと書き分けている([kurashiru.com/about](https://www.kurashiru.com/about))。マネーフォワード ME も、利用者数の定義と、No.1 の調査（マクロミル・2025 年 8 月・1,034 名）を注に書く([moneyforward.com/me](https://moneyforward.com/me))。

背景には規制がある。消費者庁は 2024 年 9 月に No.1 表示の実態調査を公表し、**約 5 割の人が No.1 表示は買う判断に影響すると答えた**([ECのミカタ](https://ecnomikata.com/ecnews/44902/))。客観的な調査に基づくこと、調査の範囲・時点・出典を正しく示すことが求められ、満足度のような主観の No.1 にはさらに 4 つの要件が課される([BUSINESS LAWYERS](https://www.businesslawyers.jp/practices/153))。数字は同じ会社の中でも食い違う。Speechify は App Store で 4.7、自社の発表で 4.8 以上とし([App Store](https://apps.apple.com/us/app/speechify-text-to-speech-pdf/id1209815023))([Speechify](https://speechify.com/news/speechify-passes-400000-ratings-in-the-us-app-store/))、Blinkist の利用者数も 3,500 万から 4,400 万まで揺れる([Blinkist](https://www.blinkist.com/en/about))。数字を出すときは、出典を 1 つに決めて更新し続ける必要がある。

数字が無いアプリが代わりに使っている材料は、方法や作り手の確かさである。Shortform は「professional authors, PhD's, and Ivy League graduates」が書くと言い([App Store](https://apps.apple.com/app/id1489472007))、Fabulous は Duke 大学の研究室の生まれだと紹介される([Idealist](https://www.idealist.org/en/business/624dea068a5a455db19876157218f513-the-fabulous-paris))。Orime はオーナーの方針で開発者の名前を出さないので、使える材料は**「仕組みの事実」**になる。答えには根拠のメモ（本とページ）が付く。関係するメモが無ければ無理に答えない。そしてその相談のトークンは払い戻す。最後の払い戻しは 1 人・1 か月 10 回までで、`lpCopy.js` に `NO_INFO_REFUNDS = 10` がすでにあるのに、LP では使われていない。

プライバシーを見出しの近くに置くのは、扱うデータが私的なアプリだけである。AI の日記 Rosebud は、信頼の言葉をひとそろい並べている。通信時も保管時も暗号化、AI で処理するときは匿名化、AI の学習には使わない、第三者に渡さない、書き出しと削除ができる、顔認証などで鍵をかけられる([Rosebud](https://www.rosebud.app/therapy-and-coaching))。日本ではマネーフォワード ME が「必要な情報のみ取得…通信時・保管時ともにすべて暗号化」と書く([App Store](https://apps.apple.com/jp/app/%E5%AE%B6%E8%A8%88%E7%B0%BF%E3%83%9E%E3%83%8D%E3%83%BC%E3%83%95%E3%82%A9%E3%83%AF%E3%83%BC%E3%83%89-me-%E8%B3%87%E7%94%A3%E7%AE%A1%E7%90%86%E3%82%82%E3%81%93%E3%82%8C%E4%B8%80%E3%81%A4%E3%81%A7/id594145971))。読書メモは要約よりも日記に近い。そう考えると、Orime の本文にある「メモは、AI の学習に使われません。」の 1 行だけでは、Rosebud の水準に届かない。

## 画面と節の並びは、異論を順に消す設計だが、確かめられた材料は薄い

画面写真・動画・節の並びは、今回もっとも材料が少なかった。確かなのは次の 3 つである。StoryGraph は見出しを本の表紙の壁の横に置く([The StoryGraph](https://thestorygraph.com/))。Readwise Reader のヒーローは言葉が入れ替わる作りだったらしい([Readwise Reader](https://readwise.io/read))。Reflect は「Think better with Reflect」を上と下で繰り返し、最後の節でヒーローに戻る([reflect.app](https://reflect.app/))。Strava の「Join for the tracking, stay for the community.」は、**始める理由（記録）と続ける理由（仲間）を 1 行で分けて言う**型で、最初の日の価値と長く使ったときの価値が違うアプリに向いている([Strava](https://www.strava.com/?v3=true))。FAQ と独立したページで扱う話題は、海外では正当性・解約・費用が中心である。Headway は「Is Headway legit?」という記事まで自分で出している([Headway](https://makeheadway.com/blog/is-headway-legit/))。日本の LP は縦に長く、ファーストビュー → 問題提起 → 比較 → お客様の声 → FAQ が定番の構成だと制作会社は言う([ECのミカタ](https://ecnomikata.com/column/17625/))。ただし実証データではない。

インストールの導線では、iPhone の Safari ではスマートアプリバナー、PC では QR コードを使い、経路ごとに数えるのが現実的な組み合わせである。ただ、効果の数字はどれも販売会社の宣伝で、独立した比較試験は見つからなかった([Branch](https://www.branch.io/resources/blog/how-to-use-smart-banners-to-increase-app-downloads/))。Orime はすでに 3 つともそろえている（`vite.config.js` の `smartAppBanner`・`StoreQr`・`VITE_APP_STORE_PT`）。

## 日本と海外の違いは「何を主語にするか」に出る

| 観点 | 日本の売れているアプリ | 海外の売れているアプリ |
|---|---|---|
| ヒーローの主語 | カテゴリ名＋規模＋No.1、役割の擬人化（「専属栄養士」） | 成果・自分のあり方・感情（「Be kind to your mind」） |
| AI の見せ方 | カテゴリ名の頭に AI（「AI食事管理アプリ」）、名前のある相談相手、β版の明記 | AI が中心の道具は見出しに AI、大衆向けは AI を見出しに書かない |
| 社会的証明 | 累計の数＋No.1＋細かい注釈（調査会社・期間・母集団） | 大きな数 1 つ＋Apple の賞・評価、出典の注は大手のみ |
| 価格 | 月額（税込）が基準、年額・半年を併記、季節のセール | 年額を既定にして月あたりに換算、年額に長めの無料期間 |
| ページの長さ | 縦長・情報を全部載せる・FAQ とお客様の声で不安を消す（制作会社の見解） | 短い見出しで、詳しい話は別ページと FAQ 記事へ |
| 安心の表記 | お金・出会いのアプリで前に出す（暗号化・監視体制） | 日記・会議の録音など私的なデータのアプリで前に出す |

出典はそれぞれ前の節に書いた。ページの長さの違いは制作会社の見解だけが根拠で、定量的な比較は見つからなかった([ECのミカタ](https://ecnomikata.com/column/17625/))([shopowner-support](https://www.shopowner-support.net/?p=261851))。

## Orime への改善案（制約の中で、すぐできる順）

前提は 4 つ。開発者の名前を出さない。「著者と話せる」と書かない。実在しない比較価格・No.1 を使わない。利用者数とレビューはまだ無い。そのうえで、今の LP（ヒーロー「読んだ本と、対話しよう。」、本文 ②〜⑦、FAQ 5〜6 問）を見て、すでにできていることは除いた。ボタンの「無料」、下に追いかけてくるボタン、PC の QR、スマートアプリバナー、上下で繰り返すボタン、解約・学習・無料プランの FAQ、「画面は見本です」の注記がそれにあたる。

| 順 | 改善 | 根拠（この報告の節） | 手間 |
|---|---|---|---|
| 1 | **ヒーローの上の小さな行（eyebrow）にカテゴリ名を入れる**。例「AI 読書メモアプリ」、または「読書メモアプリ｜読書を、受け身から対話へ。」。今の見えるヒーローには「読書メモアプリ」が無く、題名（`LP_TITLE`）にしか無い | 日本では「◯◯アプリ」と必ず言う（あすけん・マネーフォワード・ブクログ） | 文言 1 か所 |
| 2 | **信頼の 1 行を、Rosebud 型の 4 項目の小さな欄にする**。①メモは AI の学習に使われない ②AI に送るのは AI の機能を使ったときだけで、はじめに送る内容と送り先を確かめられる ③CSV で書き出せて、退会で消せる ④共有の写真はサーバーに送らない。すべてアプリの実装（同意のシート・`exportData.js` の CSV・写真で共有）と FAQ の内容に合っている。載せる前に、プライバシーポリシーと突き合わせる | 私的なデータのアプリは安心を見出しの近くに置く（Rosebud・マネーフォワード） | 小 |
| 3 | **数字の代わりに「仕組みの事実」を 1 つ足す**。「関係するメモが無かった相談は、トークンを払い戻します（月 10 回まで）」。`NO_INFO_REFUNDS` がすでにあり、FAQ「ChatGPT と何が違う？」の答えの末尾か料金の注記に入れられる | 数字が無い時期は方法の確かさで信頼を作る（Shortform・Fabulous） | 小 |
| 4 | **年額の「1 日あたり約 ¥35」の横に「1 年分を前払い」と書く**。月額の「1 日あたり約 ¥49」は今どおり括弧の中の補足にとどめ、請求額より大きく見せない。料金の見出し「月に本 1 冊ほどの値段で」は、比べる価格ではなく価値の言い換えなので、そのまま使える | 換算は効く（Gourville）が、日本の大手は月額が基準。前払いを同じ場所に書くのが無難（推論） | 文言 1 か所 |
| 5 | **ヒーローの補足を 2 文に削る**。今は 3 文ある（迷ったことを聞くと…／要約ではなく…／本とページを添えて…）。「要約ではなく、あなたのメモから。」は Granola 型の「〜ではなく」の言い切りなので残す | 読みやすい文ほど約 2 倍のコンバージョン（Unbounce） | 文言 1 か所 |
| 6 | **FAQ に「Android・パソコンでも使えますか？」を戻す**。公開前の形にしか無く、公開後の形では iOS だけであることが分からない | 買う前の不安は FAQ で先に答える（Headway・Blinkist） | 小 |
| 7 | **一番の価値「読むほど、相談相手が育つ」を、Strava 型の 1 行で本文に入れる**。例「メモを残して始め、相談相手が育つから続く。」を ② の これまで／これから の下、または ④ の見出しの補足に置く。今の LP は「育つ」をどこにも書いていない | 始める理由と続ける理由を分ける（Strava）。CLAUDE.md の一番の価値 | 文言＋SPEC の確認 |
| 8 | **ヒーローの見出しを A/B で試す**。今の「読んだ本と、対話しよう。」は誘いの言葉で、成果の約束ではない。成果型の案「読むほど、あなただけの相談相手が育つ。」と比べる。`lpTrack` の振り分けの仕組み（今は 3D↔写真）を流用でき、`ct=` で App Store の実際の入手数まで追える | 読書系はヒーローで成果を約束する（Readwise・Blinkist） | 中（オーナーの判断が要る） |
| 9 | **無料期間の予定表を、料金の注記に文字で試す**。例「今日：すべての AI 機能 → 7 日目まで：いつでも解約で 0 円 → 8 日目から課金」。Orime から解約前のお知らせを送る仕組みは無いので、「お知らせします」とは書かない | 解約を忘れる不安を消す（Blinkist +23%）。ただし逆の結果もある（Slopes） | 中・試して判断 |
| 10 | **公開後、ストアの評価が出たら出典つきで出す**。例「App Store の評価 ★4.x（◯件・2026 年◯月◯日時点）」。No.1 や「最大級」は使わない。出す場合もクラシルの注の型にならう | No.1 には出典が要る（消費者庁の報告書・クラシル・Calm） | 公開後 |
| 11 | **年額の無料期間を長くする案は、ストアの設定として別に検討する**。RevenueCat の数字では、年額は無料期間を長くすると有料への移行が上がる。ただし創業メンバー価格の期間中は無料期間が月額だけなので、それが終わってからになる | 年額は 10〜16 日で 43%（RevenueCat・二次の紹介） | 大・LP の外 |

勧めないものもある。クイズで入口を作る形（Headway・Noom）は、Web で料金を決められない iOS 中心の Orime には合わない。急かしの表示も信頼の方針に反する。本の表紙を壁のように並べる形（StoryGraph）は、表紙の権利の確認が要るので急がない。

## 結論

今回の比較で分かったのは、Orime の LP の課題が「型が足りない」ことではないという点である。ボタン・価格・FAQ・インストール導線は、売れているアプリの型をほぼ満たしている。課題は、**一番の価値が LP に出ていない**ことにある。海外の読書系は「読んだものから最大の価値を得る」という成果をヒーローで約束し、日本の大手は「専属栄養士」のように誰に相談できるかを約束する。Orime だけが「対話しよう」という行動への誘いで止まり、続けた先に何が育つかを言っていない。数字・No.1・開発者の顔が使えない今、それを埋める材料は 2 つある。払い戻しや根拠のページといった**仕組みの事実**と、データの扱いを Rosebud の水準で書いた**安心の欄**である。どちらも、競合がまねしにくい「正直さ」をそのまま信頼の材料にできる。

検索の抜粋だけでは、ページの組み立ては分からない。次の一手は、外の LP をさらに調べることより、`ct=` つきの App Store のキャンペーンリンクと LP の計測（`lp_events`）で、Orime 自身の A/B の結果を集めることである。ヒーローの見出しと無料期間の予定表は、どちらも反対の証拠がある仮説なので、決める前に数字で確かめる価値がある。
