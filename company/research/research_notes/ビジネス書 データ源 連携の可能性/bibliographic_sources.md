# 日本のビジネス書の書誌・内容・目次・分類のデータ源（2026-11-17 時点の調査メモ）

調査の条件: このセッションのネットワークでは openbd.jp・ndlsearch.ndl.go.jp・www.hanmoto.com を直接開けなかった（DNS で拒否）。そのため規約の本文は**検索結果の抜粋（検索エンジンの要約を含む）**から拾っており、一字一句の原文確認はできていない。下の「」は検索結果に出た文言で、原文と細部が違う可能性がある。商用に使う前に、各公式ページを人の目で開いて確かめること。

## 目次・内容紹介はどこから取れ、商用アプリで保存して LLM に渡してよいか

### Takeaway
目次・内容紹介を「出版社の公式データ」として配るのは JPRO（有償・個別契約）と openBD（版元ドットコム会員社の分に縮小・「販促・紹介目的」に限る）。どちらも「本の紹介のため」の利用が前提で、保存・LLM への投入を明示的に許す文言は見つからなかった。LLM の材料にするのは灰色で、要確認（できれば書面）。

### Cited Findings
- openBD の利用規約（要旨）: 書誌・書影・内容紹介・書評などは「本の販促・紹介目的」に限られる。利用者が個人・団体・企業かは問わない。API から得たデータを任意に改変してはならない。近刊情報は後から変わる・消えるので、キャッシュしている場合は変更をできるだけ早く反映すること。個別の書誌・書影の削除要請には速やかに従う（第4条） — [openBD API 利用規約](https://openbd.jp/terms/)（検索の抜粋・本文は未確認）; 同じ趣旨の旧版 [openbdjp.github.io/tos](https://openbdjp.github.io/openbd-web/tos.html)
- openBD は 2023-07-25 に「openBD API（バージョン1）」の提供終了を発表。理由は 2023-06-05 に JPRO から版元ドットコムへのデータ配信が止まったこと（JPRO 側が「再配信は現行規約違反」との方針）。版元ドットコム会員社（2023-07-25 時点 520 社）の書誌・書影は代替 API（仮称）で引き続き配信、書影の収録範囲は「大幅に低下」 — [openBD からのお知らせ 2023-07-25](https://openbd.jp/news/20230725.html); [カレントアウェアネス](https://current.ndl.go.jp/car/185804); [openBD の X 投稿](https://twitter.com/openBDjp/status/1683658062303989760)
- 代替 API は「少なくとも 60 か月以上」提供する、運用はカーリル — [カーリルのブログ 2023-07](https://blog.calil.jp/2023/07/openbd-v1-end.html)（検索の要約経由）
- 2025〜2026 年に openBD の状況が変わったという公式の発表は見つからなかった（検索 2 回）。
- 版元ドットコムは「読者など（第三者）への提供承諾」の仕組みを持ち、承諾した会員社の書誌・書影を第三者が使える — [読者など（第三者）への提供承諾についての規約](https://www.hanmoto.com/permission-for-use/agreement); [利用承諾の案内 PDF 2024-07](https://www.hanmoto.com/wp/wp-content/uploads/2024/07/e94fd4a78a3c9133fbaeceb2a97d57f0.pdf)（本文未確認）
- 版元ドットコム独自の API は 2019 年 11 月末に停止、openBD への移行を案内 — [このサイトの API](https://www.hanmoto.com/about_api)
- JPRO の Web API（OAI-PMH 準拠・ONIX 形式）は原則**有償・事前申込**。「既刊のみ」か「既刊＋近刊」を選ぶ。取得した出版情報・画像はアクセス側で保存・再利用することを求め、詳細は個別契約による — [JPRO Web API 仕様（OAI-PMH 準拠）2025-10-21](https://jpro2.jpo.or.jp/documents/%E3%80%90API%E4%BB%95%E6%A7%98%E6%9B%B8%E3%80%91OAIPMH%E4%BB%95%E6%A7%98_20251021.pdf)（検索の要約経由）
- JPRO の近刊情報（kinkan）は NDL サーチの検索用 API・ハーベスト用 API からも出る。ただし「近日中に刊行される図書」の情報で実物と違う可能性あり — [NDL サーチ API 提供対象データプロバイダ一覧](https://iss.ndl.go.jp/information/api/dpid/)
- JPRO は Thema（国際的な主題分類）の説明資料も出している — [about_thema.pdf](https://jpro2.jpo.or.jp/documents/about_thema.pdf)（中身未確認）
- Google Books API の規約: 「You may not charge users any fee for the use of your application, unless you have entered into a separate agreement with Google or obtained Google's written permission.」 — [開発者フォーラムでの引用](https://discuss.google.dev/t/can-google-books-api-be-used-in-a-freemium-application/383820); [Terms of Service](https://developers.google.com/books/terms.html)。保存・キャッシュの条項は検索では確認できず。ブランドの指針は「results … may not reorder or otherwise alter」 — [Branding Guidelines](https://developers.google.cn/books/branding?hl=en)
- 楽天ウェブサービスの規約のうち、取得データの保存期間・表示のクレジットの条文は検索で見つからなかった。

### Inferences
- openBD・版元ドットコムの内容紹介・目次は「本を紹介して売る」ための許諾。アプリの画面で本を紹介する（いまの「この本について」）は趣旨に沿うが、AI に要約させて別の文章を作る・推薦の材料に溜めるのは「改変」「販促目的外」と読まれうる。orime は既に紹介文を AI に渡して「この本で学べること」「推薦用の概要」を作っているので、ここが最も規約上のリスクが高い箇所。
- orime は有料プランのあるアプリなので、Google Books の「料金を取るアプリは別契約が要る」という条文に触れる可能性がある（読み方次第・要確認）。
- 出版社の紹介文を最も確実に使えるのは JPRO との個別契約（有償）。

### Gaps
- openBD・NDL・版元ドットコムの規約本文を直接開けなかった（ネットワーク制限）。保存・AI 投入の可否は原文で確認が必要。
- JPRO の料金・ONIX に目次（TOC）の項目が含まれるかは確認できなかった。
- 楽天ブックス API の紹介文（itemCaption）の保存・AI 利用の条件は未確認。

## JPRO・版元ドットコム・日本出版インフラセンター（JPO）の第三者アクセス

### Takeaway
JPRO の生データは有償契約の世界で、スタートアップ単独では「申し込んで交渉」になる。無料で触れるのは NDL サーチ経由の JPRO 近刊情報と、openBD（版元ドットコム会員社のみ）。

### Cited Findings
- JPRO 本体の API は有償・申込制・ONIX、情報解禁日前のデータは取れない — [JPRO API 仕様書 2025-10-21](https://jpro2.jpo.or.jp/documents/%E3%80%90API%E4%BB%95%E6%A7%98%E6%9B%B8%E3%80%91OAIPMH%E4%BB%95%E6%A7%98_20251021.pdf)
- JPRO の電子書籍・オーディオブックも 2023-03 から NDL サーチと連携 — [NDL サーチのお知らせ](https://iss.ndl.go.jp/information/2023/03/jpro/)
- JPRO 事務局のお知らせ（2024-03-07）— [PDF](https://jpro2.jpo.or.jp/documents/9_%E4%BA%8B%E5%8B%99%E5%B1%80%E3%82%88%E3%82%8A%E3%81%8A%E7%9F%A5%E3%82%89%E3%81%9B.pdf)（中身未確認）

### Inferences
- 版元ドットコム会員社は中小・独立系が中心と思われ（推測）、大手ビジネス書版元（ダイヤモンド・東洋経済・日経 BP など）の目次・紹介文が openBD にどれだけ残っているかは不明。実測が必要（orime の `api/_bookInfo.js` で openBD のヒット率を数えればわかる）。

### Gaps
- JPRO の料金表、スタートアップ向けの条件、AI 利用条項。
- 版元ドットコム会員社のうちビジネス書の版元の割合。

## NDL（国立国会図書館）: サーチ API・全国書誌・典拠・デジタルコレクション

### Takeaway
NDL の全国書誌（NDC・NDLSH・件名・注記を含む）は**パブリックドメイン／営利も手続き不要**のオープンデータセットとして一括で取れ、分類の土台として最も安全。NDL サーチ API は営利利用なら**申請**が要り、連携先（JPRO など）のデータは提供元の条件に従う。全文テキストは著作権切れ資料だけで、現代のビジネス書には使えない。

### Cited Findings
- NDL のオープンデータセット: 「このデータセットはパブリックドメインであり、営利・非営利の目的を問わず、利用手続なしで自由にご利用になれます。」書誌データセットは 2002-01〜2026-03 の累積版と直近 6 か月分 — [NDL オープンデータセット](https://www.ndl.go.jp/jp/dlib/standards/opendataset/index.html)
- 全国書誌データは 2019-04 から無償・営利非営利を問わず申請なしで利用可能 — [書誌調整連絡会議 資料](https://ndl.go.jp/jp/data/basic_policy/bib_control/conference/pdf/bib_r5_resume3.pdf)
- 全国書誌は MARC・MARC タグ・MARCXML でダウンロード可能（電子書籍は対象外）。JAPAN/MARC の週次更新もある — [書誌データの利用方法](https://www.ndl.go.jp/data/data_service/quickguide); [全国書誌データ](https://www.ndl.go.jp/data/data_service/jnb)
- NDL は ISBN を管理しておらず、図書に表示された ISBN を記録しているだけ — [NDL データ FAQ](https://www.ndl.go.jp/data/faq/item)
- NDL サーチ API: SRU（1.1・1.2）`https://ndlsearch.ndl.go.jp/api/sru`、OpenSearch `https://ndlsearch.ndl.go.jp/api/opensearch`。最新の仕様書は第 1.4 版（2026-03-31） — [外部提供インタフェース仕様書 第1.4版](https://ndlsearch.ndl.go.jp/file/help/api/specifications/ndlsearch_api_20260331.pdf)
- 利用申請フォームは API（SRU・OpenSearch・OpenURL・OAI-PMH・書影 API）とデータベース・項目を選んで申請。データ提供機関が館外なら、申請内容が提供機関に示され、そちらで認められない場合がある — [API 利用申請フォーム](https://form.ndl.go.jp/form/pub/ndl1/api); [API のご利用について](https://iss.ndl.go.jp/information/api/)
- 営利（広告収入を含む）なら申請が必要という解説 — [Qiita](https://qiita.com/saoyagi2/items/5c23550b0a00933386a6)（二次情報）
- NDL サーチの API ヘルプは、一部メタデータを各提供機関のデジタルアーカイブ由来として CC BY 4.0 の出典表記例を示している — [NDL サーチ API ヘルプ](https://ndlsearch.ndl.go.jp/help/api)
- 次世代デジタルライブラリーの全文テキストは、デジタルコレクションの**著作権保護期間満了資料**（初期は NDC 6 類の約 2.1 万点、のち古典籍を含め約 35 万点）— [E2154](https://current.ndl.go.jp/e2154); [NDL 古典籍 OCR ver.3](https://current.ndl.go.jp/car/210095)

### Inferences
- orime は有料アプリなので、NDL サーチ API を本番で使い続けるなら申請しておくのが筋（いま `docs/book-search.md` で NDL OpenSearch を使っている）。
- NDC・NDLSH（件名）は NDL の書誌そのものなので、パブリックドメインのデータセットから ISBN で引いて「分野」の手がかりにでき、保存・AI 投入にも制約がない。ビジネス書は NDC 33x（経済・経営）・336（経営管理）・159（人生訓）・361 などに散る。
- 全文テキストは現代のビジネス書には使えない（著作権の保護期間内）。

### Gaps
- NDL Authorities（著者典拠）・Web NDL Authorities・NDL-Bib（Linked Data）・SPARQL の現行の提供状況と条件（検索で見つからず）。
- 全文テキストのライセンス。
- NDL の書誌に目次（内容細目）がどの程度入っているか（一般の単行本は限定的と思うが未確認）。

## CiNii Books・カーリル・Wikidata・Open Library・ISBNdb・Amazon PA-API

### Takeaway
CiNii は商用なら事前連絡が必要で、ビジネス書の中身のデータはほぼ無い。カーリルの図書館 API は「図書館の蔵書情報を提供する目的にのみ」で、書誌の供給源には使えない（2025-10 公開のカーリル for AI＝MCP は別の仕組み）。Amazon PA-API 5 は 2026-05 に終わり、後継の Creators API は 30 日で売上 10 件が条件。

### Cited Findings
- CiNii API は無償の登録（appid）が必要。商用サイト等での利用は申請前に ciniiadm@nii.ac.jp へ連絡 — [CiNii API User Registration](https://support.nii.ac.jp/en/cinii/api/developer); [Metadata and API](https://support.nii.ac.jp/en/cinii/api/api_outline)。CiNii Books の全件データはオープンデータとして入手可能（2020 年のレビュー）— [図書館関係 Web API レビュー 2020](https://contents.nii.ac.jp/sites/default/files/2020-09/1-別紙_図書館関係Web%20APIレビュー2020.pdf)
- カーリル図書館 API の規約: 「法人・個人を問わず無償で利用できます」「API は図書館の蔵書情報を提供する目的にのみ利用することができます」「利用者自身が運営しているウェブサイトまたはアプリケーションに限り本 API を利用することができます」 — [図書館 API 利用規約](https://calil.jp/doc/api_license.html); [API 概要](https://calil.jp/doc/api.html)
- カーリル for AI（カーリル図書館 MCP）は 2025-10-09 にベータ公開。約 7,400 館・無償・エンドポイント `https://mcp-beta.calil.jp/mcp`。2025-10-20 に大学・専門図書館も対応。不特定多数が使うチャットボットからは API キーを発行 — [GIGAZINE](https://gigazine.net/news/20251015-calil-for-ai/); [カーリル for AI](https://calil.jp/ai/); [API キー](https://calil.jp/ai/advanced/api-key/); [規約](https://calil.jp/ai/terms/)
- Amazon PA-API 5 は 2026-04-30 非推奨、2026-05-15 停止（公式の表記と第三者の記述に揺れあり）。後継 Creators API の条件は「直近 30 日に紹介売上 10 件」＋アソシエイトの最終承認 — [PA-API 5 Deprecation Notice](https://webservices.amazon.com/paapi5/documentation/); [FreshStore](https://blog.freshstore.com/amazon-creators-api-pa-api-retirement/); [keywordrush](https://www.keywordrush.com/blog/amazon-creator-api-what-changed-and-how-to-switch/)（第三者）
- 日本固有の「3 件」という条件は見つからず、資料はどれも 10 件 — 上の同じ資料

### Inferences
- カーリルは書誌・紹介文を配る源ではない（蔵書の有無・貸出可否）。「近くの図書館で借りられる」導線には使える可能性があるが、規約の「蔵書情報を提供する目的」の範囲で。
- Amazon の商品説明を AI の材料にするのは、Creators API の条件（売上 10 件/30 日）を満たすまで取れず、満たしてもアソシエイトの規約で表示用途に縛られる可能性が高い（推測・規約本文未確認）。

### Gaps
- Wikidata・Open Library・ISBNdb は今回の検索の範囲で日本のビジネス書の網羅度を確かめられなかった。Wikidata は CC0（既知の事実だが今回の出典なし）で、日本の翻訳ビジネス書の項目はまばらと推測。
- Creators API の日本の条件・データの保存の規定。

## Cコードと楽天ジャンルでビジネス書の細分類ができるか

### Takeaway
Cコードは出版社が付ける 4 桁で、内容コードはビジネス書を「33 経済」「34 経営」「36 社会」程度にしか分けない。営業・マーケ・リーダーシップ・習慣などの細かな区別には足りず、orime の 14 分野には紹介文・目次・書名の手がかりが要る。

### Cited Findings
- Cコード: 1 桁目＝販売対象（0 一般・1 教養・2 実用・3 専門 …）、2 桁目＝発行形態、3・4 桁目＝内容。ビジネスに関係するのは 33「経済・財政・統計」・34「経営」・36「社会」— [JPO「分類記号・各コードの内容解説・注意事項」2025-04-01](https://isbn.jpo.or.jp/doc/「分類記号・各コードの内容解説・注意事項」_2025.04.01.pdf); [Cコード一覧](https://www.asahi-net.or.jp/~ax2s-kmtn/ref/ccode.html)
- Cコードは出版社が決め、書店の置き場所の希望が反映されることがある。同じ 23（伝記）に歴史上の偉人と現代の経済人の評伝が混ざる、という指摘 — [choge-blog](https://www.choge-blog.com/?p=93276)（二次情報）

### Inferences
- 1 桁目（0 一般／2 実用／3 専門）は「読者の慣れ」の弱い手がかりになる（orime の `difficulty` の材料として既に c_code を持っている）。ただし出版社の都合で振れる。
- 楽天ジャンル（booksGenreId）の信頼性は今回の検索では資料なし。orime の `lib/bookFields.corpus.js` の 101 冊で実測した結果のほうが確か。

### Gaps
- 楽天ジャンルの付け方（誰が付けるか・細かさ）の公式説明。
- Thema（JPRO）がビジネス書の細分類（KJ 系）に使えるか、JPRO の書誌にどれだけ付いているか。

## 翻訳書 ↔ 原書の対応データ

### Takeaway
日本語版と英語の原書を ISBN で結ぶ公開データは見つからなかった。手がかりは NDL の書誌の原タイトルの注記（JAPAN/MARC）と Wikidata だが、どちらも今回は具体的に確かめられなかった。

### Cited Findings
- NDL の書誌は図書に表示された ISBN を記録するだけで、原書の ISBN を自動でつなぐ仕組みではない — [NDL データ FAQ](https://www.ndl.go.jp/data/faq/item)
- 翻訳と原書を直接つなぐデータセットの資料は検索で見つからなかった（1 回）。

### Inferences
- 現実的な道は、NDL の全国書誌（パブリックドメイン）の原タイトルの注記を取り出し、英語の書名で Open Library・Google Books を引いて原書の ISBN を当てる 2 段の照合（未検証）。

### Gaps
- JAPAN/MARC の原タイトルの項目の具体的な位置・入力の網羅率。
- Wikidata の日本語訳ビジネス書の収録数。

## 既に使っているものの現況（まとめ）
- openBD: v1 終了発表（2023-07）後、版元ドットコム会員社だけの代替 API が続いている（2025〜2026 の新しい発表は見つからず）— [openBD お知らせ](https://openbd.jp/news/20230725.html)
- NDL サーチ: 仕様書 第 1.4 版（2026-03-31）。営利は申請 — [仕様書](https://ndlsearch.ndl.go.jp/file/help/api/specifications/ndlsearch_api_20260331.pdf); [申請フォーム](https://form.ndl.go.jp/form/pub/ndl1/api)
- 楽天: 2026 年の刷新で applicationId＋accessKey（pk_…）が必須・ドメインが openapi.rakuten.co.jp に・旧エンドポイントの期限は 2026-05-13 か 14（記事で揺れ）・Web アプリは許可したサイトの Referer が要る — [kanaxx](https://kanaxx.hatenablog.jp/entry/rakuten-webservice-new-spec); [miscnote](https://miscnote.com/blog/20260217-entry-01/)（いずれも第三者・公式未確認）
- Google Books: 有料のアプリは別契約か書面の許可が要るという条文 — [Terms](https://developers.google.com/books/terms.html)
- Amazon: PA-API 5 は 2026-05 停止、Creators API へ — [PA-API docs](https://webservices.amazon.com/paapi5/documentation/)
