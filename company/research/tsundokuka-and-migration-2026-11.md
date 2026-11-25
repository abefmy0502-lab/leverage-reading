# 積読家と「引越し（取り込み）」の調査（2026-11-25）

> 目的: 読書メモの iPhone アプリ orime の差別化と、「ほかのアプリの記録を取り込む」を業界でいちばん良くするための材料。
> 正式なアプリ名は **「私は積読家 - 積読管理と読書記録」**（App Store id6758698105・Android `org.jpn.tsundoku`）。以下「積読家」。

## 0. 調べ方と限界（先に読む）

- この作業環境は外部のページを直接開けなかった（App Store・公式サイト・note・iTunes の API がどれもネットワークの許可外で拒否）。**事実は検索エンジンの結果の抜粋（ページの中の文の引用）から拾った**。各項目に出典の URL を付けたが、**抜粋の文をそのまま写した所以外は、原文を開いて確かめる作業がまだ**。
- 確かめられなかったことは「分からない」と書いた。推測は「推測」と書いた。
- 出典が互いに食い違う所（価格・評価の件数など）は両方を書いた。
- 次の 1 手: オーナーの端末で App Store のページ（https://apps.apple.com/jp/app/id6758698105）と公式サイト（https://tsundoku.jpn.org/ ・ 移行ガイド https://tsundoku.jpn.org/migration/ ）を開き、§1 の表の「要確認」を埋める。作業環境で読むには、設定でこれらのホストを許可する必要がある。

---

## ① 積読家の全体像

| 項目 | 内容 | 出典・確かさ |
|---|---|---|
| ひとことで | 積んだ本の厚みを積み上げた「積読タワー」で眺める読書記録・蔵書管理アプリ。「積読は、減らさなくていい。」が看板の言葉 | 公式 X の固定の投稿（2026-10-03）[S3]・公式サイト [S1] |
| 対象 | 本を買いすぎて積んでしまう人（積読を責めずに肯定する）。YouTube の紹介も「本を買いすぎちゃうあなたへ」 | [S1][S14] |
| 開発元 | The Rhipidon Society（App Store の表記）。個人名は分からない | [S2] の検索の抜粋 |
| 対応 | iPhone・iPad・Android。**Web・PC 版は無い**（X に「PC版（web版）は無いのか～」2026-10-04） | [S1][S9][S10] |
| 公開時期 | 分からない。App の id（6758…）からは 2026 年の初めごろと推測。2026-11 時点で 3.8 系（Android 3.8.38＝2026-11-14 配信） | [S11]（推測を含む） |
| 価格 | 無料プラン＋PRO。**PRO は買い切り ¥980**（App Store・公式サイト）。App Store の別の抜粋とブログに ¥480 の表記もある（値上げ前の価格とみられる） | [S1][S2][S12] |
| 価格の今後 | 利用規約: **2026-12-31 までは買い切り、2027-01-01 から自動更新のサブスク（月額・年額）**。それまでに買い切りを買った人は追加の費用なく PRO のまま | 利用規約 [S5] の抜粋 |
| 無料の境界 | 積読の登録は **50 冊まで**・広告あり。バーコード・進捗・積読タワー・月間／年間の振り返りは無料。あらすじ＆要約は無料で週 5 回（公式サイト。App Store は「1分要約（PRO版）」と書き、食い違う） | [S1][S2] |
| PRO の中身 | 広告なし・蔵書の上限なし・読書タイマー・積読スペース・タワーをタグ別に・あらすじ／要約の無制限・欲しい本のレコメンド（AI）・ブログや書評の AI 検索・週刊レター／月刊レポート・クラウド同期・CSV/zip 書き出し | [S1][S2] |
| 本の登録 | バーコード（「読み取りが早い」「複数冊を読み込ませてワンタップで積読に登録」）・書名／著者で検索・ISBN 直接入力・手動（ISBN の無い古本・自費出版・同人誌） | [S8][S15] |
| 状態 | 積読／読書中（進捗）／読了／欲しい（手元にない本は塔に積まず「欲しい本の本棚」に立てる） | [S1][S15] |
| 評価 | **偏愛スコア**＝★ではなく 100 点満点のスライダー | [S1][S15] |
| 進捗・予測 | ページ数で入力（「◯ページ読みました。読了まで◯ページです。」）。残りページと週のペースから積読を読み終える日を出す | [S2] の抜粋 |
| メモ・感想 | 読書メモあり（CSV 書き出しで 1 冊に複数のメモ）。カメラで撮った文を文字にする（「残しておきたい言葉をカメラで撮るだけで、一瞬で正確にテキスト化」）。感想・抜き書きをカード型の画像に | [S2][S8] |
| タグ・棚 | タグあり（タグの色を選びたいという要望が出ている）。PRO でタワーをタグ別に | [S2][S12] |
| 統計 | 読書ヒートマップ・年間レポート（読了冊数・総ページ・月別・ベスト 10・**最長連続日数**・積読傾向）・週刊レター・月刊レポート（PRO） | [S2] の抜粋 |
| SNS・共有 | 積読タワー・読了タワー・欲しい本の本棚を画像に・年間レポートの共有・読書中の本の共有（Android 3.8.38）・公式 X が「今週は2冊読了・675ページ読みました。（積読スペース滞在時間 4時間14分） #私は積読家」の形で投稿 | [S2][S11][S4] |
| 人の気配 | **積読スペース**（PRO）: 読書タイマーの間、同じ時間に本を開いているほかの人が小さな星で見える | [S1][S2] |
| 通知 | 分からない（検索の抜粋に出てこなかった） | — |
| AI | あらすじ＆要約（ネタバレなし）・欲しい本のレコメンド・書評の AI 検索・ジャンルの AI 判定（「AI判定中」のまま止まる不満あり）。**「AI選書」は版の履歴で削除**と書かれている | [S2][S12] |
| ウィジェット | 6 種類（ロック画面 iOS 16 以降・タワーの 3 種の切り替え iOS 17 以降） | [S1] の抜粋 |
| 同期・保存 | Apple でサインインして同じ Apple ID の端末と同期（PRO）・Google Drive／iCloud へのバックアップ | [S2][S1] |
| 取り込み | ブクログ（公式 CSV を読むだけ・2 ステップ）／読書メーター（**PC の Chrome 拡張「読書メーターデータ移行」が自動でページをめくって本と感想を集め → QR コードを出し → アプリで読む**）／Kindle（電子書籍。読了日・状態を引き継ぐ。「書名を取得中」のまま残る不具合を直した記録あり）／ビブリア（CSV）。取り込む前に一覧で確かめる。取り込み直しても重複しない（レビュー） | [S1][S6][S2][S7] |
| 書き出し | CSV・zip（PRO）。書籍の CSV に加えて、メモを 1 行 1 件にした CSV（前は 1 冊に最新のメモ 1 件しか入らなかったのを直した）。列の名前は分からない | [S1][S2] |
| App Store の評価 | 抜粋 A: **4.8・80 件**（App Store の構造化データ・時点は分からない）。抜粋 B: app-ranking.net で 247 件・平均 4 台・最終更新 2026-11-22。食い違うので要確認 | [S2][S13] |
| Android | Google Play で 500 以上のダウンロード・書籍＆参考書の月間 30 位前後（第三者の推計）・評価 4.5 の表記 | [S9][S10] |
| 更新の速さ | ほぼ毎日（「毎日のように更新の通知が来るのは減らしてほしい」というレビューがあるほど） | [S13] |

### レビューで褒められている点（検索の抜粋より）

- 「カメラを使ったISBNの読み取りが早い。あと複数冊読み込ませて、ワンタップで積読に登録されるのも嬉しい。」[S8]
- 「1000円しない買い切り」「デザインや操作感もシンプルながらも凝っていて使いやすくて、iPadにも即時反映」[S2 レビュー]
- 前のアプリ（接続エラーと広告があった）より動作が軽い [S12]
- 積読が溜まるだけだったのが、1 か月で 300 ページほどの本を 2 冊読み終えた [S13]
- 積読を「減らさなくていい」と肯定する姿勢・頻繁な改善 [S8][S13]
- ブクログのエクスポートから移行できた・PRO にして取り込み直しても重複しない [S8][S7]

### 不満・要望（検索の抜粋より）

- 電子書籍の進捗がパーセントで、ページ数で入れたい [S2]
- タグの色を自由に選びたい [S2]
- 更新が多すぎる（毎日の更新通知）[S13]
- 購入日・読了日・積読を始めた日を手で直したい／出版社・発行年を出してほしい／バーコードのあとの読み込みがほかのアプリより遅い／ジャンルが「AI判定中」のまま [S10]（Android のレビュー）
- 古い本・雑誌・特殊な大きさの本で表紙が読み込み中のまま／「その他」の分類が無い／本棚を SNS で共有しにくい／読書中に記録するハードルが高い [S12]（note）
- 別の端末と同期したら冊数がずれた（1 件）[S8]
- 登録したアイコンが次の起動で消える（開発者が v3.1.4 で直したと返信）[S2]
- Web・PC 版が無い [S3b]

---

## ② 積読家と orime の比較

| 機能 | 積読家 | orime | どちらが強いか |
|---|---|---|---|
| 一番の価値 | 積読を肯定して「眺める」・読書の気分を上げる | 残したメモが「相談相手」になる・行動につなぐ | **別の山**。正面で戦わない |
| 本の登録 | バーコード（複数冊を一気に）・検索・ISBN・手動 | 検索・バーコード・手動・**本棚の写真からまとめて追加**（AI） | 互角（まとめて登録は両方ある。速さの体感は未比較） |
| 積読の見せ方 | 積読タワー・高さの比較・欲しい本の本棚 | 状態の 1 つ（積読）・読書計画シート | **積読家**。感情に訴える見せ方は強い |
| 評価 | 偏愛スコア 100 点 | ★1〜5（相談で★4〜5 の本を優先） | 積読家は表現が細かい／orime は評価が答えに効く |
| メモ | あり・カメラで文字に・カード画像 | カード式＋まとめ式・ページ・写真・**写真から書き起こし（無料も月 10 回）**・タグの提案・つながるメモ・思い出しカード | **orime**（メモが主役で、あとで使われる） |
| AI | あらすじ要約・レコメンド・書評検索（本の外の情報） | **自分のメモを根拠にした相談**・AI 選書（実在を確かめる）・この本で学べること・重なり | **orime**。積読家の AI は「本の情報」、orime は「自分の記録」 |
| 行動 | 無い（分からない） | 行動リスト・期限・相談から行動へ | **orime** |
| 読書の時間 | 読書タイマー 15/25/45 分（PRO）・積読スペース（人の気配） | 集中モード（無料）・読書の時間の記録 | 時間は orime が無料で厚い／**人の気配は積読家だけ** |
| 統計 | ヒートマップ・年間レポート・最長連続日数・週刊レター | 足あと（16 週）・月別の読了・読書の時間・分野（連続日数やバッジは作らない方針） | 積読家のほうが「毎週届く」作りが強い |
| 共有 | タワー・年間レポート・カード画像 | 写真で共有（雑誌の 1 ページの形など）・プロフィール・公開の本棚 | 互角。orime は「自分の言葉」が主役 |
| ウィジェット | 6 種類 | 無い | **積読家** |
| 対応 OS | iOS・iPad・Android | iOS・Web | 積読家は Android、orime は Web |
| 価格 | 無料（50 冊まで・広告）／PRO ¥980 買い切り（2027 からサブスク） | 無料プラン（冊数の上限なし・AI は月 30 トークン）／月額 ¥1,480・年額 ¥12,800 | **値段の見た目は積読家**。2027-01 にサブスクへ移ると差が縮む |
| 取り込み | ブクログ CSV・読書メーター（拡張機能＋QR で全ページ自動）・Kindle（電子書籍）・ビブリア CSV | ブクログ CSV・読書メーター（保存した HTML を全ページ分・書き出しツールの CSV/JSON）・**Kindle のハイライト**（アプリのノートブックの HTML・端末の My Clippings.txt）・取り消し | **読書メーターの手間は積読家が上**（拡張機能 1 回 vs ページごとに保存）。**メモの引越しは orime が上**（ハイライトを本ごとのメモに） |
| 書き出し | CSV・zip（PRO）・メモは 1 行 1 件 | CSV（全部の表を 1 ファイル）・メモの Markdown（無料） | orime（無料で全部）。ただし orime の CSV は自分で読み戻せない（§⑤） |

**勝つ所**: 自分の記録が答えになる相談・行動・メモまわり（書き起こし・つながる・思い出す）・Kindle のハイライトの取り込み・無料で冊数の上限が無い・Web。
**負ける所**: 積読を肯定する感情の作り（塔・欲しい本の本棚）・人の気配（積読スペース）・毎週届くレター・ウィジェット・Android・読書メーターからの取り込みの手軽さ・「¥980 買い切り」という分かりやすい値段。

---

## ③ 差別化の打ち手（会員数を増やす方針に照らした優先度）

優先度は「新しく入る人が増えるか × 作る重さ」で付けた。

| 優先 | 打ち手 | ねらい |
|---|---|---|
| **A** | **引越しを入口の主役にする**（§⑤の A 群を直したうえで、LP・ストアの文・SNS で「ブクログ・読書メーター・Kindle の記録を 3 分で。メモが、そのまま相談相手に」） | 積読家は「積んだ本を眺める」に引越す。orime は「書いたメモが答えに変わる」に引越す。乗り換えの理由を 1 文で言える。2026 年は Readee の終了（2026-03-23）で引越し先を探す人が出た年で、ブクログ・Bookstand・Libra Mate・Passim が Readee からの移行を打ち出した［S30〜S34］。引越しの受け皿の質がそのまま集客になる |
| **A** | **読書メーターの「全ページ自動」**（拡張機能かブックマークレットで、ページをめくって集めて 1 ファイル／貼り付けで渡す）。積読家と同等以上に | 読書メーターの人は感想（＝自分の言葉）を最も多く持っている層。orime の相談の材料にいちばん効く。今の「ページを 1 つずつ保存」は 1,000 冊で 25〜50 回の保存になる |
| **A** | **Kindle のハイライトを全冊まとめて**（read.amazon.co.jp/notebook から全冊を集めるブックマークレット等） | Readwise は amazon.co.jp と同期できないと公式ヘルプに書いている［S27］。日本の Kindle のハイライトを全冊まとめて持ち込める先は空いている。BookNotes は「Kindle にログインして半自動」を打ち出している［S35］ |
| **B** | 「積読」を責めない言葉の点検（積読の本の画面・ホームの文） | 積読家の支持の芯は「減らさなくていい」。orime も積読を「これから相談相手を育てる材料」と言い換えられる。作るものは小さい |
| **B** | 積読家からの取り込み（PRO の CSV/zip を読む） | 積読家の PRO は 2027-01 からサブスクになる。乗り換えを考える人が出る時期に受け皿を用意。**列の名前は分からない**ので、実物の CSV を 1 つ手に入れてから作る |
| **B** | 毎週届く 1 通（その週に書いたメモから 1 つ・決めた行動の結果） | 積読家の週刊レターに当たるもの。orime の方針（連続日数・順位なし）のまま「自分の言葉が戻ってくる」形で作れる |
| C | ウィジェット（今日の思い出しカード 1 枚） | 積読家は 6 種類。orime は Capacitor なので作るのが重い。後回し |
| C | 人の気配（集中モードで同じ時間に読んでいる人の数） | 積読家の独自の強み。orime の一番の価値から遠いので見送りでよい |
| 見送り | 塔・偏愛スコアの真似 | 別の山。真似ると orime の芯がぼける |

---

## ④ 引越し元の形式の一覧

### ブクログ（本棚のエクスポート）

- 入口: **パソコンの Web 版だけ**。本棚の右上の「本棚マーク」→ 本棚の灰色の部分の「スパナマーク」→「エクスポート」［S16］。スマホのアプリからは出せない（同じヘルプ）。
- 列（エクスポート・見出し行の有無は記事により不明）: `サービスID, アイテムID, 13桁ISBN, カテゴリ, 評価, 読書状況, レビュー, タグ, 読書メモ(非公開), 登録日時, 読了日, タイトル, 作者名, 出版社名, 発行年, ジャンル, ページ数`（17 列）［S16］［S17］。
- 取り込み用（まとめて登録の CSV）は先頭 11 列（`…非公開メモ, 登録日時, 読了日`）［S18］。
- 値: サービスID は amazon.co.jp＝1・amazon.com＝2［S17 の紹介記事］。アイテムID＝ASIN（Kindle 版は B0…・紙は ISBN-10）。読書状況＝`読みたい`／`いま読んでる`／`読み終わった`／`積読`［S19］。評価は 0〜5 とみられる（範囲の公式の記述は見つからず＝要確認）。カテゴリは本人が作る分け方。タグの区切りは分からない。
- 文字コード: ブクログへの**取り込み**は Shift_JIS が前提と複数の記事［S19］。**エクスポート**の文字コードは記事からは確定できない。
- 困りごと: スマホのアプリから書き出せない［S16］／ISBN の無い本はオリジナルアイテムで白い表紙になる［S31］／1,000 冊を超えると分割されることがある［S18 周辺］。

### 読書メーター

- **公式の書き出しは無い**（2026 年の記事でも同じ）［S20］［S21］。逆向き（ブクレコ形式 → 読書メーター）の取り込みは公式にある［S22］。
- 利用者がしていること:
  1. 「読んだ本」を「テキストのみ」表示にしてコピー → 生成 AI に貼ってブクログ形式に（2025 年の記事）［S21］
  2. スクリプト・ツール: `bookmeter_exporter`（Ruby・Chrome Driver・CSV）［S23］、`export_bookmeter`（ユーザー ID だけで CSV と JSON）［S24］、`bookmeter_crowler`（ブクログ用）、`bookloganize`（ASIN・状態・読了日。評価・登録日は既定値。オリジナル本は移せない）［S25］
  3. 積読家の Chrome 拡張（ページを自動でめくる → QR）［S6］
- 主な値: ASIN（紙は ISBN-10・Kindle は B0…）・読了日・感想・ページ数・本棚（ユーザーが作る棚）。**評価は無い**。棚は 読んだ本／読んでる本／積読本／読みたい本（URL は `/books/read|reading|stacked|wish`）。
- 困りごと: 公式に出口が無い・ページに分かれている・スクリプトは環境を選ぶ・読書メーター側の画面の変更で動かなくなる。

### Kindle

| 出口 | 中身 | 形 |
|---|---|---|
| 端末の `documents/My Clippings.txt` | 全冊のハイライト・メモ・しおり。追記していくだけなので、ハイライトを伸ばすと前の版も残る［S26］ | UTF-8 のテキスト。1 件＝「書名 (著者)」／「- 25ページ\|位置No. 372-373のハイライト \|作成日: 2025年4月2日水曜日 21:05:10」／空行／本文。`==========` で区切る。英語の端末は「- Your Highlight on page 12 \| Location 172-173 \| Added on …」。**日本語の書式は公式の文書が見つからず、orime のテストの見本（実物から作ったもの）で確認**。スマホ・タブレットのアプリには無い |
| Kindle アプリのノートブック →「エクスポート」 | 1 冊ずつのハイライトとメモ。メールか共有で HTML | `bookTitle` `authors` `noteHeading`（「ハイライト(黄) - ページ 61 · 位置No. 900」）`noteText` の HTML。**出版社が決めた割合を超えるハイライトは書き出せない**（1%〜15% などの記述・公式未確認）［S28］ |
| read.amazon.co.jp/notebook（Web） | 全冊のハイライトの一覧 | 書き出しのボタンは無い。拡張機能やプラグインが読む［S29］。**Readwise は amazon.co.jp と同期できない**［S27］ |
| 購入した本の一覧（コンテンツと端末の管理・Kindle for Mac） | ASIN・書名・著者・購入日 | 公式の書き出しは無い。ブラウザでスクリプトを動かす・Mac のアプリの SQLite を読む方法が記事にある［S36］ |
| 読書の記録（日付・日数） | Kindle アプリの中で見るだけ | 書き出しは分からない |

### 読書管理ビブリア

- 書き出し＝ Dropbox へのバックアップ。新しい版は `アプリ/Biblia/books.csv`［S37］。Excel で開くと文字化けする問題に対応したとある（＝文字コードの扱いを変えた）。
- 列の名前・状態の値・評価の範囲は**分からない**（公式のページの本文を読めなかった）。ほかのサービスからの移行は公式に「サポートしていません」［S38］。
- 積読家はビブリアの CSV を取り込める［S2］。

### Readee（楽天・2026-03-23 に終了）

- 終了前に 3 つの CSV を Dropbox へ: 「Readee バックアップ形式」（終了後は使えない）・「Readee 全項目形式」（`readee_all.csv`・**Shift_JIS**・一部出ない項目あり）・「ブクログ形式」［S30］［S39］。
- 状態は 読みたい／未読／読書中／既読（Readee の 4 つ）［S33］。
- 困りごと: ブクログに入ったのがエクスポートの約半分（約 660 件）だった報告［S30 周辺］／ISBN の無い本・電子書籍・手で登録した本は移らないという報告［S31］。**手元に CSV を残している人は、いまも行き先を探している可能性がある**（推測）。

### Goodreads（CSV）

- 列（コミュニティと変換ツールでよく出る並び）: `Book Id, Title, Author, Author l-f, Additional Authors, ISBN, ISBN13, My Rating, Average Rating, Publisher, Binding, Number of Pages, Year Published, Original Publication Year, Date Read, Date Added, Bookshelves, Bookshelves with positions, Exclusive Shelf, My Review, Spoiler, Private Notes, Read Count, Owned Copies`［S40］。**公式の仕様書は無い**。
- 値: `Exclusive Shelf`＝`read`／`currently-reading`／`to-read`（新しい書き出しで did-not-finish もという記述）・`My Rating`＝0〜5（0＝未評価）・`ISBN13` は表計算で崩れないよう `="978…"` の形（変換ツールのコードからの推定）・日付は `YYYY/MM/DD`・`Date Read` が空のことがある［S40］。
- 日本の利用者は少ない（洋書の読み手・英語学習者）。

### StoryGraph（CSV）

- 列（変換ツールから）: `Title, Authors, Contributors, ISBN/UID, Format, Read Status, Date Added, Last Date Read, Dates Read, Read Count, Moods, Pace, …, Star Rating, Review, Content Warnings, Tags, Owned?`［S41］。**公式の一覧は見つからない**。
- 値: `Read Status`＝`read`／`to-read`／`currently-reading`／`did-not-finish`／`paused`（コミュニティの知識・要確認）・`Star Rating` は 0.25 刻み（3.75 など）・`ISBN/UID` に ISBN でない ID が入ることがある。

### そのほか

- **積読家**: CSV・zip（PRO）・メモは 1 行 1 件の別の CSV。列の名前は分からない［S1][S2］。偏愛スコアは 0〜100（★に直すには割る必要）。
- **Bookstand**: Web 版の「エクスポート・インポート」でブクログ形式の CSV を受ける（Readee からの移行の記事）［S32］。書き出しの列は分からない。
- **BookNotes**: Kindle にログインしてハイライトを半自動でメモに［S35］。書き出しは分からない。
- **メディアマーカー**（2018 年に終了）: 当時、多くの人がブクログへ。今もファイルを持つ人がいるかは分からない。

---

## ⑤ いまの orime の取り込みに足りないもの

いまの対応（`src/lib/importers.js`・`src/components/ImportSheet.jsx`・保存は `src/App.jsx` の `importLibrary`）:
ブクログ CSV（見出しの有無どちらも・UTF-8 か Shift_JIS）／読書メーター（保存した HTML・書き出しツールの CSV/JSON・自分で作った表）／Kindle（ノートブックの HTML・My Clippings.txt）。複数ファイルを一度に・同じ本はゆるく 1 冊に・同じメモは二重にしない・新しい本は 1 回 300 冊まで・取り消せる・端末の中だけで読む。

> **注（2026-11-25 の調査の時点）**: 下の点検はコミット済みのコード（HEAD）に対して行った。調査中に、作業ツリーに**別の作業の未コミットの変更**が入った（`importers.js` に Goodreads・StoryGraph の専用の読み取り＝`parseGoodreadsCsv` / `parseStorygraphCsv`、1 回の上限 300 → 2,000 冊、`App.jsx` の保存を 4 冊ずつ並べる）。**A-5 と B-14 はその変更で大半が片づく**見込み。ただし A-1（ブクログ経路の `mapStatus` が 空欄・未読・読中・`before` を読了にする）は、その変更の後も残る。新しい読み取りは `did-not-finish` を読了・`paused` を読書中にしている（どちらが良いかは決めごと）。

### A（引越しの質に直接効く・小さく直せる）

> A-1・A-3（ページ数・カテゴリが消える）・A-4・A-6 は、使い捨ての試験で実際に確かめた（2026-11-25・コードは変えていない）: `mapStatus` は `to-read`・`未読`・`読中`・空欄・`before`・`did-not-finish` をすべて `done` に／ブクログの見出しなしの行は空の読書状況で `done`・タグ「ビジネス 書」は `["ビジネス","書"]`・ページ数とカテゴリは結果に無い／書名 1 行・ISBN 1 行の一覧は .txt でも .csv でも 0 冊。

1. **状態が分からないときに「読了」にしてしまう**（`mapStatus` の最後が `return 'done'`）。
   - 空の読書状況・「未読」（Readee の状態）・「読中」（移行の事例で使われる語）→ どれも読了になる。**未読＝積読、読中・読書中＝読書中**であるべき。
   - 英語の `to-read` は `/read$/` に当たって**読了**になる（Goodreads・StoryGraph の値）。`did-not-finish`・`paused` も読了になる。
   - orime 自身の書き出しの `before` も読了になる。
   - 直し方: 分からない値は「積読」か、確かめる画面で選ばせる（「状態の分からない本 N 冊を → 積読／読了」）。
2. **Kindle のハイライトの本を全部「読了」にする**（`parseKindleClippings`・`parseKindleNotebookHtml` が `status: 'done'`）。読んでいる途中の本も読了で入り、月別の読了がふくらむ。いちばん新しいハイライトが最近（例 30 日以内）なら「読書中」にするか、確かめる画面で選ばせる。
3. **ブクログの列を捨てている**: `BOOKLOG_ORDER` が `作者名` までで、`出版社名`・`発行年`・`ジャンル`・**`ページ数`** を読まない（見出しなしの本物のエクスポートでページ数が入らない）。**`カテゴリ`（本人が作った分け方）も捨てている** → フォルダに入れるべき（タグはもうフォルダ／分野に分けている）。`登録日時` は本の追加日に使っていない（メモの日付にだけ使う）。
4. **ブクログのタグを空白でも割る**（`split(/[,、\s]+/)`）。「ビジネス 書」のような空白を含むタグが 2 つに割れる。区切りを確かめてから（実物で）直す。
5. **Goodreads・StoryGraph の CSV が「見出しで読める」ように見えて中身が抜ける**: 見出しの別名に `my rating`・`exclusive shelf`・`my review`・`private notes`・`bookshelves`・`number of pages`・`authors`（ブクログ経路）・`isbn/uid`・`read status`・`star rating`・`last date read` が無い。結果、**状態は全部読了・評価 0・感想なし**で入る。別名を足すだけで大半が直る（StoryGraph の 3.75 は四捨五入で 4）。
6. **書名だけ・ISBN だけの一覧が読めない**: 1 行 1 冊のテキスト（メモ帳・スプレッドシートから貼った一覧・バーコードの読み取りアプリの ISBN の羅列）は「読み取れる本がありませんでした」になる。ISBN の行は ISBN として、それ以外は書名として読めばよい（書名は書店の検索で確かめる＝本棚の写真の取り込みと同じ確かめ方を使える）。
7. **貼り付けで渡せない**: 読書メーターの「テキストのみ」表示のコピー（記事で広まっている方法）［S21］をそのまま貼る口が無い。ファイルを選ぶしかない。iPhone では「ファイルに保存して選ぶ」が一段多い。
8. **案内の言葉が公式と合っていない可能性**: シートは「ブクログで『設定』→『エクスポート』」。公式ヘルプは「本棚マーク → スパナマーク → エクスポート」でパソコンの Web 版だけ［S16］。要確認のうえ直す（スマホではできないことも書く）。

### B（手間を大きく減らす・作るものが中くらい）

9. **読書メーターの全ページを 1 回で**: いまは「リスト表示のページを 1 つずつ保存」。1,000 冊なら 25〜50 回。積読家は拡張機能が自動でページをめくる［S6］。案:
   - パソコンのブラウザで動く**ブックマークレット**（拡張機能より入れやすい）で全ページを集め、1 つの JSON を保存させる → 今の `parseBookmeterJson` がそのまま読める。
   - またはユーザー ID を入れるだけで公開の本棚を読む（`export_bookmeter` と同じ考え）［S24］。**読書メーターの利用規約とサーバーの負荷の判断が要る**（オーナー判断）。
10. **Kindle のハイライトを全冊まとめて**: いまはノートブックの HTML を 1 冊ずつ。read.amazon.co.jp/notebook の全冊を集めるブックマークレット → 1 ファイル。Readwise が日本で使えない［S27］ので、ここは空いている。
11. **確かめる画面で直せない**: 1 冊ずつ外す・状態をまとめて変える・「この本と同じとみなしました」（書名のゆれでまとめた本）を見せて外す、ができない。いまは新しい本の先頭 20 冊と「本棚にある本 N 冊」の 1 行だけ。精度の不安を消すには「ゆるくまとめた本」だけでも見せる。
12. **読めなかった行の数を言わない**: 書名も ISBN も無い行は黙って飛ばす（`continue`）。「N 行は読めませんでした」と、その例を 1 つ出す（Readee → ブクログで「半分しか入らなかった」不安の再発を防ぐ［S30］）。
13. **本棚にもとからある本の情報を足さない**: 取り込み元の評価・タグ・読了日・ページ数は、新しい本にしか入らない（もとからある本にはメモを足して、読みたい／積読なら読了にするだけ）。空の欄だけ埋める、を選べるとよい。
14. **1 回 300 冊・1 冊ずつ保存**: ブクログの重い利用者（1,000 冊以上）は 4 回選び直す。保存も 1 冊ずつで、50 冊以上は「1 分ほど」と出している。まとめて保存すれば上限を上げられる。
15. **形式の幅**: タブ区切り（Excel の「Unicode テキスト」・Numbers）・UTF-16・.xlsx を読めない。サイズの上限 5MB（何年分もの My Clippings.txt は超えることがあり得る・推測）。
16. **Readee の `readee_all.csv`**（Shift_JIS・全項目）を読めるかは確かめていない。列の名前が分からない（実物が要る）。ブクログ形式で書き出した人は今のブクログの経路で読めるはずだが、状態の「未読」は A-1 の問題に当たる。

### C（あるとよい）

17. **orime 自身の書き出しを読み戻せない**: 書き出しは全部の表を `table` の列つきで 1 つの CSV にしている。今の取り込みに渡すと、状態 `before` は読了・`done_date`・`leverage_memo` は捨てる・メモの行は本として読もうとする。「出口と入口がそろう」は乗り換えの不安を下げる（積読家は書き出しを PRO の売りにしている）。
18. **積読家・ビブリア・Bookstand の CSV**: 実物の見出しを 1 つずつ手に入れて別名を足す。積読家の偏愛スコア（0〜100）は ★ に直す（例: 20 点ごとに 1）。いまの `rating` は 5 で頭打ちにするので、全部 ★5 になる。
19. **Kindle の位置**: 日本の Kindle 本は「位置No.」だけでページが無いことが多い。いまは位置を捨てる（ページは null）。メモに位置を残すと、あとで本で探せる。ハイライトに付けたメモ（「のメモ」）も別のメモになり、どのハイライトへのメモかが切れる。
20. **伸ばしたハイライトの重なり**: My Clippings.txt は追記だけなので、ハイライトを伸ばすと短い版と長い版の両方が残る［S26］。いまは全く同じ文だけを 1 つにする。片方がもう片方を含むときは長いほうだけ残す。
21. **途中で止まったときの再開**: 同じファイルを選び直せば二重にならずに続きが入る（今の作り）。ただ画面を閉じると、どこまで入ったかが残らない。

### よその良い作り（引越しの精度とストレスを減らす工夫）

| 工夫 | 例 | orime で当てはめる所 |
|---|---|---|
| 形式の自動判別 | 積読家・Literal・Hardcover は取り込み元を選ばせてから読む［S42］ | orime は自動判別済み。強みとして LP で言える |
| 取り込む前に一覧で確かめる | 積読家［S7］ | orime も済み。B-11 で「直せる」まで |
| 見つからなかった物を一覧で出す | TuneMyMusic は合わなかった曲の一覧を出す。ただし「違う版に勝手に合わせた」ものは出さず不満が出ている［S43］ | 「ゆるくまとめた本」「書名だけで確かめた本」を出す（B-11） |
| やり直しても二重にしない | 積読家（PRO にして取り込み直しても重複しない）［S7］。StoryGraph は二重の取り込みが重複のいちばんの原因と自ら書く［S44］ | orime は済み（本・メモとも）。取り消しもある（よそに無い強み） |
| 取り込みは待たせない | StoryGraph は最大 24 時間・裏で進む［S44］ | 1 冊ずつの保存をまとめる（B-14） |
| 手順をアプリの外に出さない | 積読家の読書メーター＝拡張機能 → QR → アプリ［S6］。Readwise＝拡張機能が自動で同期［S27］ | B-9・B-10。QR の代わりに「ファイルを保存」か「コピー → 貼り付け」でもよい |
| 識別子を優先して合わせる | Hardcover の CSV は ID・ISBN-10/13 を受ける［S42］。Goodreads も ISBN・ASIN → 書名・著者の順［S42 周辺］ | orime は ISBN → 書名＋著者（ゆるく）。ASIN（Kindle 版）も合わせる |

---

## ⑥ 出典の URL

積読家
- [S1] 公式サイト https://tsundoku.jpn.org/ （直接は開けず・検索の抜粋）
- [S2] App Store https://apps.apple.com/jp/app/id6758698105 ／ レビュー https://apps.apple.com/jp/app/6758698105?see-all=reviews&platform=iphone
- [S3] 公式 X https://x.com/i_am_tsundokuka/status/2106355865964208596 （2026-10-03）
- [S3b] X の声「PC版（web版）は無いのか～」 https://x.com/n4s103d/status/2106538694429794654
- [S4] 公式 X の週の投稿 https://x.com/i_am_tsundokuka/status/2124511857486803368
- [S5] 利用規約・プライバシー https://tsundokuka.app/privacy/
- [S6] 読書データ移行ガイド https://tsundoku.jpn.org/migration/
- [S7] 取り込み（検索の抜粋・App Store と公式サイト）同上 [S1][S2]
- [S8] note「『私は積読家』というアプリを入れた」 https://note.com/pppskywalker/n/n3ce4d55ea2a5 ／ note「触ってみた感想」 https://note.com/patita/n/nb9dd60de43a4 ／ note「ダウンロードしてみた」 https://note.com/amasake_mofliy/n/n7be34e941c68
- [S9] Google Play https://play.google.com/store/apps/details?id=org.jpn.tsundoku ／ AppBrain https://www.appbrain.com/app/%E7%A7%81%E3%81%AF%E7%A9%8D%E8%AA%AD%E5%AE%B6-%E8%AA%AD%E6%9B%B8%E8%A8%98%E9%8C%B2%E3%83%BB%E8%94%B5%E6%9B%B8%E7%AE%A1%E7%90%86%E3%83%BB%E7%A9%8D%E8%AA%AD%E7%AE%A1%E7%90%86/org.jpn.tsundoku
- [S10] applion（Android のレビュー・版） https://applion.jp/%E7%A7%81%E3%81%AF%E7%A9%8D%E8%AA%AD%E5%AE%B6/android-org.jpn.tsundoku/
- [S11] 同上（3.8.38・2026-11-14）
- [S12] ブログ「1か月使ったら」 https://www.t-kitchen.info/tundokuka-report/
- [S13] app-ranking.net https://www.app-ranking.net/id/6758698105
- [S14] YouTube 紹介 https://www.youtube.com/watch?v=txUYi7tUhqE
- [S15] mwm.ai（ストアの説明の写し） https://mwm.ai/apps/app/6758698105 ／ アプリみっけ https://appmikke.com/apps/2b3fdc01-1fb5-496e-86a5-43e0b10ae7b0

ブクログ
- [S16] 公式ヘルプ「エクスポート機能」 https://booklog.zendesk.com/hc/ja/articles/33979908113175
- [S17] 紹介記事（列・サービスID） https://naokis.doorblog.jp/archives/mediamarker_to_booklog.html ／ https://blog.uni-3.app/tableau-booklog-books/
- [S18] 公式ヘルプ「他の読書管理サイトからブクログへデータを移行したいです」 https://booklog.zendesk.com/hc/ja/articles/360048930533 ／「インポート機能」 https://booklog.zendesk.com/hc/ja/articles/34031790406935 ／ monogrow https://monogrow.com/booklog/
- [S19] bookloganize の記事（Shift_JIS・状態の値） https://kymmt.com/blog/posts/bookloganize ／ M's View https://muranaga.hatenablog.com/entry/20181007/p1

読書メーター
- [S20] 比較記事 https://amanaut.co.jp/bookcrunch/booklog-bookmeter/ ／ https://atama-muji.com/bukurogu-dokusyometar/
- [S21] 2025 年版の移行 https://blog.yukidmy.com/bookmeter-to-booklog ／ ChatGPT で CSV https://note.com/yosifumi/n/nc4ccdea6efde
- [S22] 公式ブログ（インポート機能の追加） https://blog.bookmeter.com/post/161045372797
- [S23] bookmeter_exporter https://github.com/ikuwow/bookmeter_exporter ／ https://queryok.ikuwow.com/entry/bookmeter-exporter-and-booklog/
- [S24] export_bookmeter https://github.com/dogatana/export_bookmeter
- [S25] bookloganize https://github.com/kymmt90/bookloganize ／ bookmeter_crowler https://github.com/teandt/bookmeter_crowler

Kindle
- [S26] My Clippings.txt の解説 https://flaviocopes.com/apps/tutorials/kindle-my-clippings-mac/ ／ Lifehacker https://www.lifehacker.jp/article/2609-gemini-notebook-kindle-highlights/ ／ 日本語の解析の失敗例 https://note.com/a0082273/n/n559f86ea0ef5
- [S27] Readwise「Kindle」 https://docs.readwise.io/readwise/docs/importing-highlights/kindle ／ 国際ドメイン https://help.readwise.io/article/31-how-do-i-import-kindle-highlights-from-an-international-amazon-domain
- [S28] 書き出しの上限 https://www.hongkiat.com/blog/export-kindle-highlights/
- [S29] Obsidian の Kindle 連携 https://community.obsidian.md/plugins/kindle-bridge
- [S36] 購入した本の一覧 https://internet.watch.impress.co.jp/docs/yajiuma/1264534.html ／ https://zenn.dev/yamazaking/articles/kindle-manage

Readee・ほかの引越し先
- [S30] Readee 終了のお知らせ https://readee-maintain.s3.ap-northeast-1.amazonaws.com/notice/prod/notice.html ／ 移行の記録 http://streamline-jp.net/nextlife/2025/12/08/122691/
- [S31] ブクログ公式「Readee からのお引越し」 https://booklog.jp/hon/info/readee-import-guide ／ Readee FAQ https://readee.rakuten.co.jp/faq/index.html
- [S32] Bookstand への移行 https://note.com/bookstandapp/n/ndfea6dec4384
- [S33] Passim の移行ガイド https://passimapp.com/blog/readee-migration-guide-2026/
- [S34] Libra Mate の移行機能 https://note.com/hal1986/n/nb93b991a4af7
- [S35] BookNotes https://apps.apple.com/jp/app/id1638554625
- [S39] 登録データのエクスポート方法（2026-02-27） https://readee-maintain.s3.ap-northeast-1.amazonaws.com/notice/prod/%E7%99%BB%E9%8C%B2%E3%83%86%E3%82%99%E3%83%BC%E3%82%BF%E3%81%AE%E3%82%A8%E3%82%AF%E3%82%B9%E3%83%9B%E3%82%9A%E3%83%BC%E3%83%88%E6%96%B9%E6%B3%95%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6.pdf

ビブリア
- [S37] App Store https://apps.apple.com/jp/app/id894377244
- [S38] 公式サポート「他のサービスからデータを移行できますか？」 https://biblia978.com/support/articles/23/

Goodreads・StoryGraph・引越しの作り
- [S40] Goodreads の書き出しの議論 https://www.goodreads.com/topic/show/22566592-what-s-in-an-export-file ／ https://www.goodreads.com/topic/show/19573750-date-read-missing-from-export-csv ／ 変換の例 https://gist.github.com/tmcw/3e268886be83f25cd9728cc6f3bc4184
- [S41] StoryGraph → Goodreads の変換 https://tangled.org/tijs.org/storygraph-to-goodreads ／ StoryGraph の取り込みの見本 https://thestorygraph.freshdesk.com/support/solutions/articles/79000146300-bulk-import-template
- [S42] Hardcover の CSV 形式 https://hardcover.app/pages/custom-csv-import-format ／ Literal の取り込み https://literal.club/import/storygraph
- [S43] TuneMyMusic と Soundiiz の比較 https://www.playlistgo.io/compare/tunemymusic-vs-soundiiz/
- [S44] StoryGraph の重複 https://thestorygraph.freshdesk.com/support/solutions/articles/79000141985-duplicate-books-in-lists ／ Book Riot https://bookriot.com/storygraph-review/
