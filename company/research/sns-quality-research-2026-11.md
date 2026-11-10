# SNS 投稿の質を上げるための調査（2026-11-10）

> 対象: Orime（読書メモ・AI 相談の iOS アプリ・公開 2026-11-17・顔出しなし・広告費 0）の X / Threads / Instagram / note。
> 調べ方: Web 検索（日本語の実践者の分析・海外の公式発言の報道・X の公開コード）。2024 年以前だけの情報は使わず、日付を添えた。数字には出典を付け、推測は「推測」と書いた。
> 注意: この作業環境では多くのサイトの本文を直接開けなかった（note.com・zenn.dev・dev.to ほか）。検索結果の要約と、直接読めた GitHub の README を根拠にしている。本文を読んで数字を確かめたいものは「要確認」と書いた。
> 関連: `company/brand-guardrails.md`（実数原則・テンプレは下書き専用）、`company/marketing-research-2026-10-20.md`（売り方）、`company/launch-2026-11/sns-playbook.md`。

---

## 1. X（旧 Twitter）で伸びる要素（2025〜2026）

### 分かったこと

- **アルゴリズムは公開されている**: xAI が 2026-01-20 に `xai-org/x-algorithm`（Apache 2.0・Rust）を公開。更新履歴の最古は 2026-08-13、最新は 2026-10-26。README を直接読んだ。
  - 候補は「フォロー中（Thunder）」と「フォロー外（Phoenix retrieval・SimClusters・人気投稿）」から集め、**48 時間を超えた投稿は候補から外す**（AgeFilter）。
  - 予測する行動: いいね・返信・リポスト・引用・シェア／投稿・プロフィール・**リンク**・写真・動画のクリック／**滞在時間（dwell）**・クリック後の滞在・動画の継続秒数・プロフィール滞在／フォロー／ネガティブ（興味なし・ミュート・ブロック・報告・「読まれなかった」）。
  - スコア＝「重み × 本人の予測確率」の合計。README は「報告の重みはいいねの 468 倍だから 1 件の報告が 468 いいねを打ち消す」と読むのは誤りと明記。ネットで出回る「リプはいいねの 75 倍」のような数字も同じ理由で**そのまま信じない**。
  - 後段の補正: 同じ投稿者の 2 件目以降を減衰／フォロー外の投稿を割引／**フォロー中アカウントの返信・リポストを割引**／インプレッションの少ない新規投稿者をブースト。
  - 2026-10-08 の更新で滞在時間の予測精度を改善、2026-10-13 に「最後まで読まれる投稿」を拾うよう retrieval も学習（README の更新履歴）。
  - 出典: https://github.com/xai-org/x-algorithm ／公開の経緯 https://www.tonyreviewsthings.com/x-algorithm-open-source-january-2026/ ／2026-05 の更新で Phoenix モデルが配布された報道 https://pasqualepillitteri.it/en/news/2594/x-algorithm-open-source-may-2026
- **滞在時間が 2026 年の中心**: 日本語の解説も「どれだけじっくり見られたか」「長文は最後まで読まれたか」を主要指標に挙げる（https://www.marke-media.net/whitepaper/sns-120/ ・ https://contentai.jp/blog/twitter-x-algorithm-2026 ・ https://mirai-works.co.jp/business-pro/business-column/x-202607/ ＝2026-07）。
- **返信＋返信への返信が最強の加点**という実践者の見立て（株式会社西村 2026-03-06 https://24mura.co.jp/column/xalgorithm20260306 ）。公開コードの予測対象にも「返信」「会話」が複数含まれる。
- **外部リンク**: 「明示的なペナルティは無い」と X の経営トップと製品責任者が述べた一方、**Premium 未加入のリンク付き投稿はリーチが大きく落ちる傾向**が複数の観測で報告されている（https://koiyal.com/blog/x-link-posts-reach-2026 ・要確認）。公開コードでは「リンクのクリック」は予測対象の 1 つで、リンク専用の減点の記述は README に無い（直接確認）。推測: リンクを開いて X を離れる＝X 内の滞在が切れるので、結果として不利になりやすい。
- **画像・動画**は滞在時間を伸ばす手段として挙げられる。**スレッド・アンケート**は反応を集めやすい形式（https://www.ownly.jp/sslab/x-algorithm ・ https://yoshikazunomori.com/blog/digitalmarketing/x-algorithm/ ）。
- **Premium**: 長文・記事（Articles・2026 年に Premium へ広く開放）・編集・検索と返信での表示優遇（https://www.koukoku.jp/ の 2026 年版 Premium 解説・ https://yoshikazunomori.com/blog/digitalmarketing/x-long-post/ ）。
- **投稿時間**: 日本の解説は 7〜9 時（通勤）と 21 時以降、または 6 時台を挙げるが、どれも自社アカウントのアナリティクスで確かめよと注記（https://yoshikazunomori.com/blog/digitalmarketing/x-posting-time/ ・ https://mobinc.jp/media/?p=3900 ）。**公的な大規模データは見つからなかった**。「業種別で 2 倍」のような数字は算出方法が無いので採用しない。
- **読書・学び系の伸びる型**（日本語の実践者の観察・数字なし）: 1 行目で読む理由を作る／1 文 1 行の改行／箇条書きと数字／体験談／「保存」「あとで読む」を誘う。読書アカウント特有の検証データは今回見つからなかった（検索 1〜3 回とも）。

### Orime ならこうする

- 投稿は **X の中で完結させる**（結論・メモの一節・問いまで本文に）。アプリのリンクは返信欄か固定ポスト・プロフィールに置き、本文のリンクは週 1 回まで。
- 「読んで 3 秒で分かる 1 行目」＋「最後まで読ませる 1 つの具体」＋「返事を書きたくなる問い」の 3 段で、滞在と返信を両方取りに行く。返信には必ず返す（会話の枝が加点）。
- 数字の出回り話（75 倍など）を投稿のネタにしない。実数原則と同じで、出典の無い数字は書かない。

---

## 2. Threads で伸びる型

### 分かったこと

- **返信（会話）がいいねより重い**という点で 2026 年の日本語解説はほぼ一致（https://tatap.jp/knowledge/how-to-extend-threads/ ・ https://addness.co.jp/media/threads-algorithms/ ・ https://note.com/inakaonline/n/n8d48caacb18e ）。コムニコのイベント報告では「インプレッションの半分は返信が生む」という見方（https://www.comnico.jp/we-love-social/sns-trend-summit-threads ・要確認）。
- **Meta 公式に近い発言**:
  - Mosseri: リンクを意図的に下げてはいないが「人はリンク投稿にいいねやコメントをあまりしないので、あまり価値を置いていない」→ その後 **リンク付き投稿をおすすめに出しやすくする方針へ転換**、プロフィールのリンクは 5 件まで（Engadget https://www.engadget.com/social-media/threads-is-finally-embracing-links-150012499.html ）。ただし「Threads の利用者はいまもほとんどリンクを押さない」との続報（ https://www.engadget.com/social-media/threads-users-still-barely-click-links-170139103.html ）。
  - Threads 責任者 Emily Dalton Smith: 「リアルタイムの会話アプリ」「**ほとんどの配信はその日のうちの数時間で決まる**」（Business Insider https://businessinsider.in/tech/news/metas-head-of-threads-shares-advice-about-how-and-when-to-post-as-the-debate-swirls-around-engagement-bait/amp_articleshow/114227410.cms ）。
  - Mosseri: エンゲージメントベイト（「賛成なら 1、反対なら 2」の類）は「抑え込む作業中」。フォロー中のアカウントを優先する調整で「フォロー外へのリーチは減り、フォロー内は増える」（ https://www.neowin.net/news/threads-is-finally-fixing-a-major-complaint-about-its-algorithm/ ）。
  - Meta 日本法人の担当者が **週 7 回以上**の投稿をすすめたという報告（コムニコ・要確認）。
- **データ**: BlackTwist が 2026-03 に 283 クリエイター・21,864 投稿（2,650 万ビュー）を分析。平均エンゲージメント率 5.3%、**長いスレッド形式は平均ビュー 4,416 で多く、短文はエンゲージメント率 6.09% で最高**。閲覧は土曜・エンゲージメントは金曜に強い（ https://dev.to/luca_restagno_acb4c68c5ca/i-analyzed-21864-threads-posts-in-march-2026-heres-what-i-found-4pe8 ・サンプルは限定的）。Buffer の 5,200 万投稿の調査（2026）は、Threads は「文字中心」の印象に反してビジュアルを重視する傾向と指摘（ https://buffer.com/resources/state-of-social-media-engagement-2026/ ）。
- **型（日本語の実践者）**: 最初の 1 行で決まる／末尾を「どう思いますか？」など開いた問いで締める／投稿直後 15〜30 分はコメントに返す（初速）／テーマを絞る（ https://note.com/notesensei98/n/n7df272883bd1 ・ https://note.com/nice_heron4924/n/n24b864e157ea ・ https://akagami.blog/threads__-2/ ）。
- **Threads の規模**: 2025-09-20 時点の全世界 DAU で Threads 1 億 2,870 万人 ＞ X 1 億 2,710 万人（コムニコの引用・要確認）、2026-06 に MAU 5 億（GIGAZINE https://gigazine.net/gsc_news/en/20260617-threads-500-million-mau/ ）。
- **日本語の読書・習慣の伸びた例**: 具体的な投稿と閲覧数を示す一次情報は見つからなかった（検索 3 回）。Threads 内で「#読書」「読書記録」を直接見て回るのが確実。

### Orime ならこうする

- Threads は **1 日 1 本・短文・問いで終える・返信に 30 分つきあう**。長い話は X のスレッドか note に回し、Threads では「本を読んで変えた 1 つのこと」を 2〜4 行で。
- 「1 か 2 で答えて」の類はやらない（Meta が抑制中）。問いは答えが長くなる開いた形（「最近、読み返して助かった本は？」）。
- リンクは本文に入れない。聞かれたら返信で。

---

## 3. Instagram リール／カルーセル（2025〜2026）

### 分かったこと

- **公式に近いシグナル**: Mosseri が 2025-01 に「ランキングで最も大事な 3 つは **視聴時間・いいね・送信（sends）**」、Insights では「平均視聴時間・リーチあたりのいいね・リーチあたりの送信」を見よと発言（Social Media Today https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/ ）。sends per reach がフォロワー外への到達と最も相関するという 2024 の発言も複数で引用。
- **ハッシュタグ**: Mosseri は 2025 年に繰り返し「**ハッシュタグはリーチを増やさない**。投稿が何についてかを伝え、投稿同士をつなぐためのもの」（ https://storyboard18.com/digital/explained-are-hashtags-really-irrelevant-83474.htm ・ https://onlinemarketing.de/social-media-marketing/hashtags-still-matter-instagram-chef-mosseri ）。「3〜5 個」という数字は二次情報が多く、言った時期も食い違う（要確認）。**1 投稿 5 個までに制限した**という報道あり（ https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/ ・要確認）。
- **カルーセル**: 2024-08 に最大 20 枚へ拡大。日本の解説は 8〜10 枚構成・1 枚目は「結論か意外性」・**保存率 5% が入口、10〜15% で伸びが変わる**（保存数÷リーチ）と目安を示すが根拠は示されていない（ https://www.neworder.co.jp/2026/04/19/instagram_carousel_8ro10/ ・ https://media.slooooth.com/instagram-carousel/ ・ https://tatap.jp/knowledge/instagram-carousel-captions/ ）。評価軸は「保存・いいね」→「**視聴維持とシェア（DM 送信）**」へ移ったという見立て（2026 の日本語解説）。
- **リール**: 最大 3 分（2026-07 の解説・90 分の「Features」も紹介）。冒頭 3 秒に結論か意外性・**字幕は 1 秒目から**（ https://www.neworder.co.jp/2026/07/07/length_of_thereel/ ・ https://blog.edugate.jp/instagram-reels-growth-guide/ ・ https://gyaku-ten.jp/column/instagram-20260710 ）。
- **投稿時間**: 「20〜22 時がゴールデンタイム」は出典の無い数字と並んでいて信頼できない（ https://wakariyasukuosieruyo.blog/instagram-reel-growth-2026/ ）。Insights のフォロワーの活動時間を優先。
- **役割分担**: リールで入口 → カルーセルで深掘り（ https://web-hiroshima.com/blog/5976/ ）。

### Orime ならこうする

- カルーセルは **1 枚目に「自分のメモがそのまま相談相手になる」1 行**、中は実際の画面（スクショ）で 6〜8 枚、最後は「保存して、次に本を読むときに」。ハッシュタグは 3〜5 個の関係するものだけ（#読書記録 #読書メモ #読書好きな人と繋がりたい ＋ 本の分野 1 つ）。
- リールは字幕を 1 秒目から・冒頭に結論（例「読んだ本、1 年後に何も覚えてなかった」）・15〜30 秒・DM で送りたくなる 1 枚（「写真で共有」の画像）を最後に置く。
- 見る数字は「保存率」より **送信（DM）／リーチ** と平均視聴時間。

---

## 4. note で読まれる記事の型

### 分かったこと

- **note 公式ヘルプ（note 編集部監修）**: 題は伝えたい相手に届くか・一覧で省略されないよう **25 字くらいまで**（15〜25 字の目安）・具体的な数字やエピソードを入れる／**リード文は要点か目次を 50 字程度**（X で省略されない長さ）／スマホ前提で 3〜5 行ごとに改行・段落・見出しで章立て（ https://www.help-note.com/hc/ja/articles/360012426353 ・ https://www.help-note.com/hc/ja/articles/360012303134 ）。第三者ツールは 25〜40 字を最適帯とするが公式を優先（ https://curythm.com/apps/content-checker/note/ ）。
- **note 内検索を意識**: 探されている言葉を題か冒頭に入れると表示機会が増える（ https://note.com/sinbu/n/na9bc913fb264 ・実践者の観察）。
- **個人開発の記事で目立つ型**（#個人開発 の人気一覧）: 体験談＋実測の数字（作業時間・収益・DL 数）／「ヒット作が出ないまま 10 年続けた話」のような失敗談／年額サブスクの伸び・継続率など数字を軸にした運用知見（ https://note.com/hashtag/個人開発 ・ https://note.com/iritec/n/nd06b5dea88fa ・ https://note.com/nosuke0926/n/ncb074b5d01f7 ・ https://note.com/ken_t_code/n/n66b5837d83bc ）。
- **公開の時間帯**: note 公式の推奨も大規模データも見つからなかった（検索 2 回）。個人の体験談では週 1〜2 本で「スキ率 20%」の例（2026-03・リベシティ・会員限定で詳細は読めず）。推測: X・Threads で告知する時間に合わせて公開し、note 自体の時間は気にしすぎない。
- **閲覧数の実データ付きの「題の A/B」は見つからなかった**。効果の確認は note の分析（表示数・読了率）で自分の記事を比べるのが確実。

### Orime ならこうする

- 題は 25 字以内・数字か固有の体験を 1 つ（例「読書メモ 400 件を、相談相手にした」）。リード 50 字で「誰の・何の話か」。
- 中身は「困ったこと → 試したこと → 実測の数字 → 今の決まり」の順。Orime の宣伝は最後の 1 段落だけ。
- 失敗談を隠さない（「作りました」より「捨てた機能 3 つ」のほうが読まれる型）。

---

## 5. 個人開発アプリのローンチ投稿（日本語圏）

### 分かったこと

- **伸びた／伸びなかったの分かれ目は文の工夫より「需要」と「事前の見込み客」**:
  - 告知しても増えなかった例: 「楽器店をレビューする」行為そのものに需要が無かった（のすけ・note https://note.com/nosuke0926/n/ncb074b5d01f7 ）。
  - 2025 年の振り返り: あるアプリは X で大きく拡散、別のアプリは獲得に苦戦。「作ることより広め方」（Zenn https://zenn.dev/kotap15/articles/look_back_tech_2025 ）。
  - 入江慎吾（40 個作った）: 失敗パターンは「宣伝を後回し」「バズだけ狙う」「SNS を日記に使う」。リリース時に 200 人に使ってもらうには**作る前から集客**（ https://note.com/iritec/n/nd06b5dea88fa ・要確認）。
  - ShiftB のガイド（2026）: 事前登録ページを用意した受講生は初週ユーザーが多かった（講座内データ・一般化に注意 https://shiftb.dev/articles/indie-dev-launch-strategy ）。
- **2026 年の環境**: AI で個人開発が急増し、DL の伸びは限られる＝**同じ「作りました」が埋もれる**（Xtheme https://xtheme.jp/blogs/indie-dev-2026/ ）。
- **海外の体験談（2026）**: フォロワー 200 人未満では投稿しても手応えが無い／ローンチ直後の沈黙を「失敗」と決めない（原因がマーケ・プロダクト・市場のどれか分からない）（dev.to https://dev.to/allan_jiang/i-got-tired-shipping-in-silence-so-i-built-featdrop-4e9d ・ https://dev.to/aritomofukuda/i-launched-my-saas-on-product-hunt-a-week-later-i-still-have-zero-users-2ccd ）。
- **伸びる動機づけ**: 「自分の困りごと」が明確なアプリ（猫不足を解消するバズ猫アプリ・Zenn https://zenn.dev/flutteruniv_dev/articles/release_nyanbuzz ）／他人の投稿を見て「自分もやりたい」と思わせ、最短でシェアまで運ぶ導線（ https://zenn.dev/appbrew/articles/how-to-create-buzz-service ）。
- **「作りました」投稿そのものの型と数字（インプレッション・保存）を示す日本語の一次情報は見つからなかった**（検索 3 回）。推測: 「作りました」単体より「なぜ作ったか（自分の困りごと）」「作る途中で分かったこと」「使った人の 1 言」の 3 本立てのほうが、滞在と返信（§1・§2）に合う。

### Orime ならこうする

- 公開日の投稿は「作りました」ではなく「**読んだ本を 1 年後に思い出せなかった自分のために作った**」の体験から入り、画面の実物（写真で共有の画像）を 1 枚。リンクは返信に。
- 公開前の 1 週間は「作る途中」（捨てた機能・迷った決まり・TestFlight の声）をビルドインパブリックで出し、公開日に「見てくれていた人」がいる状態にする。
- 公開直後の数字が小さくても型を変えず、1 週間後に「初週の実数」を投稿する（実数原則）。

---

## 6. 「AI っぽい文」と見なされる特徴（日本語）と避け方

### 分かったこと

- **特徴（複数の解説で共通・2025〜2026）**:
  - 語尾・文の長さが均一で起伏が無い。「〜することが重要です」「〜と言われています」の繰り返し。「まず第一に／次に／最後に」の機械的な列挙。「いかがでしたか」「ぜひ〜してみてください」の締め。「〜について探っていきましょう」の導入（ https://promptune.jp/blog/ai-sounding-text-fix-guide ・ https://qiita.com/robitan/items/76af9fa8b82c0f9c739f ）。
  - **具体性の欠如**: 固有名詞・数字・実体験が無く一般論（ https://writers-hub.co.jp/blog/ai-written-text ）。
  - **判断の弱さ**: 「場合による」「一概には言えない」が続き、読み手に判断を預ける（Zenn https://zenn.dev/fibujrsl/articles/4958a844214709 ）。
  - 3〜4 個重なった瞬間に「AI っぽい」と感じる。**全部直さなくても 1〜2 個ほどくだけで印象が変わる**（promptune）。
  - 簡易チェック: 「段落を 1 つ消しても読めてしまう」＝感情・主観が薄い（ https://note.com/nahouemura/n/n9e519ef21b17 ）。「そのときの緊張・予想外・具体的な数字」が自然に入っているかで見分ける。
  - ChatGPT の履歴 500 件から拾った定型構文の一覧（ https://kappa-kobuta.com/how-to-detect-ai-writing/ ）。
- **読書系で嫌われる言い回し**: 日本語の一次情報は見つからなかった（検索 3 回）。周辺の根拠として、英語圏では 2025-08 に「読書を楽しんでいるふりをするな」という反発＝読書が performance になることへの違和感（ https://www.dazeddigital.com/life-culture/article/60751/1/is-booktok-sucking-the-joy-out-of-reading-tiktok-competitive ）。英国では消費者の 65% がインフルエンサーを「偽装された広告」と見る（2025-06 https://www.onepulse.com/?p=15643 ）。茂木健一郎「他人に影響を与えるっておこがましい」（ https://news.livedoor.com/article/detail/30905645/ ）。
  - 推測（これらから）: 「読むべき」「人生が変わる」「〜しない人は損」の断定・押しつけ、「刺さる」「気づき」「学びをシェア」の自己啓発の定型、他人の本の中身を要約して自分の手柄のように出すこと、は読書の人に嫌われやすい。Orime の GLOSSARY・ブランドガードレール（実数原則・バッジや順位をつけない）と同じ方向。

### Orime ならこうする

- 投稿の前に **3 つだけ見る**: ①数字か固有名詞があるか ②「〜すべき」「〜が重要」「いかがでしたか」が無いか ③段落を 1 つ消したら壊れるか。
- 本の中身を要約して語らない。語るのは「自分のメモ」と「それで変えた行動」だけ。本の評価は★や順位にせず、「この 1 行に助けられた」の形。
- 「読書で人生が変わる」系の見出しは出さない。代わりに実測（「メモ 10 件で相談の答えが変わった」）。

---

## 7. 読書の SNS の文化（読書垢・ブクログ・読書メーター）

### 分かったこと

- **タグの使われ方**: 読了報告は「書名・著者・感想＋ #読了」が基本形。よく使われるのは **#読了 #読書記録 #読書垢 #読書好きと繋がりたい #読書好きな人と繋がりたい #名刺代わりの小説10選**。#読書垢 はアカウントが読書用だと示すためのタグで、ほかと併用（ https://note.com/atuma_lab/n/ncd7296fd479b ・ https://note.com/yamatsullu/n/nf94c4a96b98a ・ https://decadence666.com/booktwitter/ ・ https://note.com/hitsuji20xx/n/n925f0331b0ec ）。Instagram では「#作品名 #著者名 #読了」のように本そのものをタグにする（ https://sora-no-kimagure.com/entry/insta-no-susume ）。構成の例は「書名＋感想＋どんな人に＋タグ」。
- **月末の慣習**: 読書メーターの利用者ページに「◯月の読書メーターまとめ」が並び、月ごとのまとめを出す仕組みがある（ https://bookmeter.com/users/273944/authors ほか）。「#◯月読了本」「#今月の読書メーター」のタグの実際の投稿数・使われ方を示す一次情報は**見つからなかった**（検索 3 回）。推測: 月末〜翌月 1 日に「今月読んだ本」をまとめる文化はある（読書メーターの機能・英語圏の monthly wrap-up も同型）が、タグの表記は人によって割れる。Orime の `shareHashtags`（「#11月読了本」）は、投稿前に X・Instagram で実際のタグの数を確かめて決めるのがよい。
- **ネタバレ**: 読書メーターのレビューには「ネタバレ」表示があり、サービスの仕組みと利用者の自主的な配慮の両方で成り立つ（ https://bookmeter.com/users/300021/reviews ）。
- **引用・著作権**:
  - 一文の引用は著作権法 32 条が出発点。公表済み・引用部分を明確に区別・自分の感想が主で引用が従・出典（書名・著者）を示す（ https://atsoho.com/blog/blog-image-quotation-rules ）。北大の平澤論文（2025）は SNS 投稿を適法な引用と認めた裁判例が多いと整理しつつ、従来基準では認めにくい事案もあると指摘（ https://eprints.lib.hokudai.ac.jp/repo/huscap/all/95526/70-07_Hirasawa.pdf ）。
  - 表紙画像は**出版社ごとに基準が違う**: 偕成社は書名・著者名・出版社名の明記を条件に SNS 投稿を認め、中面は 2 見開きまで（ https://www.kaiseisha.co.jp/wp-content/uploads/2020/04/online_copyrights_kaiseisha.pdf ）。新潮社は写真集で表紙を含む無断転載と生成 AI での加工を「固くお断り」し法的措置にも言及（ https://www.bengo4.com/c_18/n_20340/ ）。
  - 弁護士相談では「紹介目的でも表紙・一文の扱いが争点」になる例（ https://www.bengo4.com/c_23/bbs/sns+本の表紙/ ）。法律の判断はできないので、迷う投稿は出版社の方針を確かめる。

### Orime ならこうする

- 公式の投稿のタグは **3〜4 個を固定**（#読書記録 #読書メモ #読了 ＋ 月末だけ #◯月読了本）。「繋がりたい」系は利用者が付けるもので、公式は付けない（売り込みに見える）。
- 一文の引用は「自分のメモ（感想）が主・一文は従・書名と著者を必ず」。表紙は書店の API で取れる公開の書影に限り、本文の写真は出さない（アプリの「写真で共有」も同じ決まり）。
- 月末の 3 日間の声かけ（`ShareNudge`）の文は、タグの実際の使われ方を確かめてから（表記が割れていれば「#読書記録」だけに寄せる）。

---

## Orime の投稿に効く 10 の原則

1. **投稿の中で完結させる**（リンクは返信・固定・プロフィールへ）— §1 滞在時間・リンクの扱い、§2 Mosseri の「リンクに価値を置かない」。
2. **1 行目で「自分のことだ」と思わせ、最後まで読ませる具体を 1 つ入れる** — §1 公開コードの dwell・「最後まで読まれる投稿」、§2 「最初の 1 行で決まる」。
3. **開いた問いで終え、返信には 30 分以内に返す** — §1 返信＋返信の加点、§2 返信重視・初速・数時間で配信が決まる。
4. **数字は実測だけ、出典の無い数字（75 倍・2 倍）は書かない** — §1 README の注意、§3 根拠の無い保存率、`brand-guardrails` 実数原則。
5. **本の中身を要約しない。語るのは自分のメモと変えた行動** — §6 読書が performance になることへの反発、§7 引用は従。
6. **「〜すべき」「重要です」「いかがでしたか」を消し、段落を 1 つ消したら壊れる文にする** — §6 AI っぽさの 3〜4 の重なり・簡易チェック。
7. **ローンチは「作りました」ではなく「なぜ作ったか」＋画面の実物＋初週の実数** — §5 需要と事前の見込み客・2026 年は埋もれる。
8. **公開前 1 週間はビルドインパブリック（捨てた機能・迷い・TestFlight の声）** — §5 事前登録の効果・SNS を日記にしない。
9. **Instagram は字幕 1 秒目・冒頭に結論・DM で送りたくなる 1 枚で締め、ハッシュタグは関係する 3〜5 個** — §3 視聴時間・送信・ハッシュタグはリーチを増やさない。
10. **引用は書名と著者を必ず・表紙は公開の書影だけ・月末タグは実際の使われ方を確かめてから** — §7 著作権法 32 条・出版社ごとの基準・タグ表記の揺れ。

---

## 出典の一覧（主なもの・日付）

- xai-org/x-algorithm README（2026-08〜10 の更新履歴・直接読んだ） https://github.com/xai-org/x-algorithm
- X 公開の経緯（2026-01） https://www.tonyreviewsthings.com/x-algorithm-open-source-january-2026/ ／2026-05 の更新 https://pasqualepillitteri.it/en/news/2594/x-algorithm-open-source-may-2026
- X の日本語解説（2026）: https://www.issoh.co.jp/tech/details/10690/ ・ https://mirai-works.co.jp/business-pro/business-column/x-202607/ ・ https://24mura.co.jp/column/xalgorithm20260306 ・ https://koiyal.com/blog/x-link-posts-reach-2026 ・ https://contentai.jp/blog/twitter-x-algorithm-2026 ・ https://www.marke-media.net/whitepaper/sns-120/
- Threads: Engadget（リンクの方針転換／利用者はリンクを押さない）・Business Insider（Dalton Smith）・Neowin（Mosseri のフィード調整）・BlackTwist 2026-03 の 21,864 投稿分析（dev.to）・Buffer 2026・コムニコ・tatap・addness・note の実践者記事
- Instagram: Social Media Today（2025-01 Mosseri の 3 シグナル／ハッシュタグ 5 個の制限）・storyboard18・onlinemarketing.de・neworder（2026-04・07）・slooooth・edugate
- note: 公式ヘルプ 360012426353 / 360012303134・sinbu・#個人開発 の人気一覧・入江慎吾・のすけ・Ken.T
- 個人開発: Zenn kotap15（2025 の振り返り）・ShiftB（2026）・Xtheme（2026）・dev.to（2026 の体験談）
- AI っぽい文: promptune・writers-hub・Zenn fibujrsl・note nahouemura・kappa-kobuta・Qiita robitan
- 読書の SNS: note atuma_lab / yamatsullu / hitsuji20xx・文学マニアック・読書メーター・偕成社 PDF・弁護士ドットコム（新潮社）・平澤論文（2025）・atsoho
