# Sales, ranking and library-circulation data sources for Japanese business books (as of 2026-11-17)

Research method note (2026-11-17): this cloud session could NOT reach several primary hosts. DNS failed for webservice.rakuten.co.jp, calil.jp, www.tohan.jp, www.nippan.co.jp and support.nii.ac.jp (they are outside the session's allowed network). Facts about those sources come from web-search snippets of the official pages, press coverage, and Orime's own code. Treat anything marked "(unverified)" as needing a direct check once those hosts are allowed. Only about 15 tool calls were used, so coverage is broad but shallow. E-book stores, 三省堂, TSUTAYA, 有隣堂, 八重洲, 出版科学研究所, 新文化 and 文化通信 were not researched individually. They are listed under Gaps.

## 1. Distributor / chain rankings (日販, トーハン, オリコン, 紀伊國屋, 丸善ジュンク堂)

### Takeaway
The big public "who sells" signals for business books are the distributors' (取次) bestseller lists from 日販 and トーハン, the オリコン 本ランキング, and chain POS lists from 紀伊國屋 and 丸善. All of them are published as editorial web pages or press releases, not as APIs. The raw POS data behind them (for example 紀伊國屋 PubLine) is a paid service for publishers. None of these offers a licence an app can rely on to store the lists or show them commercially. They are useful as a hand-curated or low-frequency "annual and half-year bestseller" flag, not as a live feed.

### Cited Findings
- **日販 and トーハン annual bestsellers 2025**: both announced on 2025-12-01. Both put 『改訂版 本当の自由を手に入れる お金の大学』 (両@リベ大学長) at No. 1 in the ビジネス書 category. The book had sold more than 500,000 copies. Nippan's overall No. 1 was 『大ピンチずかん3』, and お金の大学 was 3rd overall. — [秋田魁新報 (Kyodo) 2025-12-01](https://www.sakigake.jp/news/article/20251201CO0014/); [Business Insider Japan](https://www.businessinsider.jp/article/2512-why-did-ryogakuchos-money-university-become-the-bestseller-of-the-reiwa-era/)
- **日販 / トーハン first half 2026**: 日販 announced on 2026-06-01 for the period 2025-11-19 to 2026-05-20. Overall No. 1 at both distributors was 『ハーバード、スタンフォード、オックスフォード… 科学的に証明された すごい習慣大百科』 (SBクリエイティブ), a practical book based on psychology and behavioural economics. — [熊本日日新聞 (Kyodo)](https://kumanichi.com/articles/1997374); [koubo.jp](https://koubo.jp/article/51236)
- **Cadence and genre (from the above, inferred)**: the distributors publish annual lists (around 1 December) and half-year lists (around 1 June) with genre sections that include ビジネス. Weekly lists also exist at nippan.co.jp/ranking and on トーハン's site, but their pages could not be fetched (unverified: format, genre breakdown, store base, reuse terms). — [search summary pointing to nippan.co.jp/ranking](https://koubo.jp/article/51236)
- **オリコン 本ランキング**: the annual BOOK ranking 2025 was published on 2025-11-28 and ranks by estimated copies sold in the period (例: No. 1 『大阪・関西万博ぴあ』 62.4万部). オリコン calls itself the "only nationwide book ranking with estimated sales copies" (日本で唯一の全国推定売上部数付き書籍ランキング). Genre lists for ビジネス書 and 新書 have run since the 2008-04-07 weekly issue, so business-book history goes back about 18 years. A 上半期 2026 edition exists. — [ORICON 年間本ランキング2025](https://www.oricon.co.jp/special/73522/); [ORICON 上半期 2026 genre note](https://www.oricon.co.jp/special/75283/); [koubo.jp press release on 上半期 2026](https://koubo.jp/press-release/prtimes/c34467_r769)
- **オリコン terms**: the published rankings are editorial content. No public API or licence was found. Store-level data comes from オリコン's paid POS panel (オリコン BiZ). The panel detail is unverified because the methodology page was not reached.
- **紀伊國屋書店 PubLine**: a paid service that publishes POS sales information from all 紀伊國屋 stores over the internet, used by publishers for reprint and marketing decisions. In July 2026 it added POS data from 旭屋書店 and 紀伊國屋書籍販売, taking listed stores from 71 to 103. A 2010 add-on, PubLine ASSIST, cost 月額1万円 for new single-service users. That price is old and the current price is unknown. — [紀伊國屋 press release PDF 2026-07](https://cdn.kyodonewsprwire.jp/prwfile/release/M000215/202607021913/_prw_PR1fl_L94r79jV.pdf); [ビジネス+IT 2010-04-23](https://www.sbbit.jp/article/cont1/21590); [PubLine seminar PDF](https://publine.kinokuniya.co.jp/publine/pages/contents/publine_seminar_2015.pdf)
- **紀伊國屋 annual award**: 紀伊國屋 also publishes an annual 「紀伊國屋書店ベストセラー大賞」 (Jan–Dec) via press release. The publisher award is judged on sales amount, units and cooperation. — [Kyodo PR Wire 2026-02 PDF](https://cdn.kyodonewsprwire.jp/prwfile/release/M000215/202602103834/_prw_PR1fl_XRJi833a.pdf); [2021 award](https://kyodonewsprwire.jp/release/202201316787)
- **丸善ジュンク堂**: publishes monthly ranking blog articles on maruzenjunkudo.co.jp (example: 2025-06). Orime already records 丸善 丸の内本店・日本橋店 business-book rankings only indirectly, through bookvinegar, which logs them weekly and summarises them monthly. — [丸善ジュンク堂 blog 2025-06](https://www.maruzenjunkudo.co.jp/blogs/article/202506-04-1); internal note `company/research/bookvinegar-2026-11.md` §2-4
- **Related non-sales signal**: TOPPOINT's 2026 first-half 「ベストビジネス書」 大賞 went to 『「人の器」の磨き方』, with 『HIDDEN POTENTIAL 可能性の科学』 2nd. This is a reader/editor award, not sales. — [koubo.jp PR TIMES](https://koubo.jp/press-release/prtimes/c31087_r35)
- **ブクログ** publishes an annual 「年間ランキング2025」 that includes a ビジネス書 list, based on its users' shelf registrations. That makes it a reader-engagement signal rather than a sales signal. — [Web担当者Forum 2025-12-23](https://webtan.impress.co.jp/n/2025/12/23/51906)

### Inferences
- Copying the full weekly lists of 日販, トーハン, オリコン or 紀伊國屋 into a commercial app and showing them as rankings would almost certainly need permission. A one-bit fact ("this ISBN appeared in a 2025 annual business top 10, per 日販") is the lower-risk use. A small hand-curated table (ISBN, source, year, rank) updated twice a year (June and December) fits Orime's existing `ops_books add` and `curated` flow.
- オリコン's genre list going back to 2008 is the deepest public time series for ビジネス書 sales. It is the best candidate for a "定番" (long-seller) signal if a data licence (オリコン BiZ) were ever affordable.
- Lists from different sources agree at the very top (お金の大学 in 2025, すごい習慣大百科 in the first half of 2026). Agreement across several lists is a cheap, robust "breakout" flag.

### Gaps
- Weekly 日販 and トーハン business lists: exact URL, format (HTML, PDF or image), store base and reuse terms were not verified because the hosts were unreachable.
- オリコン methodology, panel size and licensing price were not verified.
- PubLine's current price, and whether non-publishers (an app developer) can subscribe, were not found.
- 三省堂, TSUTAYA (and its Tポイント-based rankings), 有隣堂 and 八重洲ブックセンター: not researched in this session.
- 出版科学研究所 (『出版指標年報』, paid), 日経 and the trade papers 新文化 and 文化通信: not researched. They are believed to publish annual business bestseller summaries, but this is unverified.

## 2. Online store rankings (楽天ブックス, Amazon)

### Takeaway
楽天 is the only major store with an official free API that exposes sales order for books. Orime already uses BooksBook/Search with `sort=sales`. Amazon's PA-API 5 (which had BrowseNode SalesRank) was deprecated in 2026 in favour of the Creators API. Access to the Creators API depends on Associate sales, and whether it carries SalesRank is unconfirmed. Amazon rank should therefore not be a dependency.

### Cited Findings
- **楽天ブックス 書籍検索 API** (BooksBook/Search): "retrieve information of selling books on Rakuten Books". It supports a `booksGenreId` filter and sort options. — [Rakuten docs (search snippet)](https://webservice.rakuten.co.jp/documentation/books-book-search)
- **Orime already uses it this way**: `sort: 'sales'` and `outOfStockFlag: '0'`, requesting `reviewCount`, `reviewAverage` and `booksGenreId` (`api/_advisorBooks.js` line 160 and `ELEMENTS` at line 34). Review count and average are therefore already available as secondary popularity signals at no extra cost. — internal code `/home/user/leverage-reading/api/_advisorBooks.js`
- **Keys (internal, from CLAUDE.md)**: since the 2026 Rakuten API renewal, both `applicationId` (UUID) and `accessKey` (`pk_...`) are required, and a `Referer` registered as an allowed site is needed or the API returns 403. The rate is about 1 request per second per app ID (`docs/book-search.md` §5). — internal `CLAUDE.md` 環境変数 section
- **楽天市場 商品ランキング API** (Ichiba Item Ranking) returns the top 30 items per genre (SDK example: `Genre[...].ranking` gives the "TOP 30 items"). The genre ID 200162 often quoted for books is shown in the SDK README as 「水・ソフトドリンク」, so do NOT assume 200162 means books. Also note that the Ichiba ranking covers marketplace shops, not 楽天ブックス' own book catalogue. — [rakuten_web_service README](https://www.rubydoc.info/gems/rakuten_web_service/1.4.0); [rws-ruby-sdk](https://www.github.com/rakuten-ws/rws-ruby-sdk)
- **Amazon PA-API 5**: SalesRank sat under `BrowseNodeInfo.BrowseNodes.SalesRank`, giving a rank per browse node (for example a business-book node). — [PA-API 5 docs: browse nodes and sales ranks](https://webservices.amazon.com/paapi5/documentation/use-cases/organization-of-items-on-amazon/browse-nodes/browse-nodes-and-sales-ranks.html)
- **PA-API 5 deprecation**: Amazon's notice says PA-API 5 is deprecated and replaced by the Creators API. Its docs give 2026-04-30 as the deprecation date, while third parties cite 2026-05-15 as retirement. Old keys do not work, and new credentials come from Associates Central. Creators API access is reportedly paused if qualifying sales fall below the requirement. Calls to the retired API reportedly return 403 AccessDeniedException. — [Amazon Associates: PA-API v5 deprecation](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation); [DEV Community](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek); [affiliate-toolkit](https://www.affiliate-toolkit.com/affiliate-toolkit-3-8-5-amazon-creators-api-support-why-you-need-to-migrate-before-may-15-2026/). The sources conflict on the exact date.

### Inferences
- 楽天's `sort=sales` is a current-sales snapshot, and its definition (period, weighting) is undocumented. Re-fetching it on Orime's existing 7-day refresh cycle and storing the rank with a date (`sales_rank`, `first_seen_at`) would itself create a time series. That gives a "rising" signal (rank improved over the last N snapshots) versus an "enduring" signal (in the top N for many months), using only data Orime already collects. This is Orime's own derived data, not a copy of a ranking page.
- Combining `salesDate` (publication date), `reviewCount` and the sales rank separates 新刊の勢い (recent date with a high rank) from ロングセラー (old date with a still-high rank and a high review count).
- Amazon: without Associate sales volume, Creators API access is uncertain. Scraping Amazon bestseller pages breaks Amazon's conditions of use (not verified this session).

### Gaps
- Official 楽天 ranking and search API terms on storage and derived display could not be fetched. Check the 楽天ウェブサービス 規約, especially on caching and on showing "ranking" wording.
- The exact 楽天ブックス genre ID for 「ビジネス・経済・就職」 (believed to be under 001006 in BooksGenre) was not verified this session. Orime's test fixture uses `001006009`.
- Whether the Creators API returns SalesRank is unknown.

## 3. E-book store rankings (Kindle, BookLive, honto, ebookjapan, Kobo)

### Takeaway
Not verified in this session. Only 楽天Kobo has an official API, and it was found only by name.

### Cited Findings
- 楽天ウェブサービス has a Kobo genre search API (and, per Rakuten's API family, a Kobo e-book search API), so Kobo titles can be searched through the same keys. — [Rakuten Kobo genre search doc](https://webservice.rakuten.co.jp/documentation/kobo-genre-search)

### Inferences
- Kindle, BookLive, honto and ebookjapan rankings appear to be HTML-only store pages with no public API (unverified). For business books, e-book rankings are heavily distorted by sales campaigns (for example Kindle 日替わりセール), so they are a noisy quality signal.

### Gaps
- Whether Kobo search supports `sort=sales`, and the terms for each e-book store's ranking pages: not researched.

## 4. Library data (カーリル, CiNii Books, NDL, municipal open data)

### Takeaway
Library data can supply a "定番" (holdings breadth) signal, but not a ranking feed. カーリル gives availability per library, free, but its terms limit use to providing library holdings information. CiNii Books (university libraries) exposes holder information and can sort by holder count on the web. Municipal open data publishes aggregate lending counts per library, not per title. No per-title lending or reservation ranking dataset was found.

### Cited Findings
- **カーリル 図書館API**: free for companies and individuals. Terms Article 2 limits use to providing library holdings information, on a site or app the user operates themselves. It cannot be used free inside systems developed and delivered for a client, and the right of use cannot be transferred. The spec sets call limits and logo display requirements. — [カーリル 図書館API 利用規約](https://calil.jp/doc/api_license.html); [API spec](https://calil.jp/doc/api_ref.html)
- No evidence was found that カーリル exposes reservation counts or lending counts. The API reports holding and lending status (such as 貸出中) per library. — [search over calil.jp docs](https://calil.jp/doc/api.html) (the page itself could not be fetched; unverified detail)
- **CiNii Books**: the OpenSearch base is `https://ci.nii.ac.jp/books/opensearch/search?`, and parameters not in the list are ignored. There is a separate holder OpenSearch feed whose `opensearch:totalResults` gives the number of holders. Sorting by holder count (所蔵館数, descending or ascending) is documented as a web UI feature, and the API equivalent is unverified. Developer registration and an appid are required. APIs are offered in OpenURL, OpenSearch and RDF/JSON-LD forms. — [CiNii Books OpenSearch](https://support.nii.ac.jp/en/cib/api/b_opensearch); [holders OpenSearch](https://support.nii.ac.jp/en/cib/api/b_opensearch_hold); [CiNii metadata and API outline](https://support.nii.ac.jp/en/cinii/api/api_outline)
- **Municipal open data**: 府中市 publishes 図書資料貸出数 as statistics via the Tokyo Metropolitan API, aggregated per facility rather than per title. 練馬区 publishes library usage totals under CC-BY. 東京都 publishes lists of public libraries (updated yearly) and 統計年鑑 tables. — [府中市 dataset spec](https://spec.api.metro.tokyo.lg.jp/spec/t132063d0000000006-91fdbf7c8f4bb6ac1da303d5731e14e0-0?lang=en); [練馬区 open data](https://www.city.nerima.tokyo.jp/kusei/tokei/opendata/opendatasite/bunka/riyoujoukyou.html); [東京都 catalog](https://catalog.data.metro.tokyo.lg.jp/dataset/t000003d2000000760/resource/55747898-b755-4e58-bcc4-33f0b12652d6)
- 横浜市 図書館年報 2024 is published under CC BY 4.0, but it is an annual report, not a title ranking. — [横浜市 図書館年報](https://www.city.yokohama.lg.jp/kurashi/kyodo-manabi/library/unei/Annual-report/nenpou2024.html)
- 武蔵野市 library statistics PDFs include yearly reservation totals (予約件数), but not per title. — [武蔵野市 統計 PDF](https://www.library.musashino.tokyo.jp/images/upload/05toukei.pdf)
- Historical: a 2003 survey by 日本図書館協会 and 日本書籍出版協会 examined lending and copy counts for specific titles. It was a one-off study, not ongoing data. — [JBPA PDF](https://www.jbpa.or.jp/nenshi/pdf/0611.pdf)
- Some city libraries publish curated business lists, for example 大阪市立図書館's list of 日経ビジネス recommended books (2021). These are curated, not counts. — [大阪市立図書館 PDF](https://www.oml.city.osaka.lg.jp/torikomi/upload/202104business.pdf)

### Inferences
- **Most practical 定番 proxy**: the number of public libraries holding an ISBN, via カーリル. Checking against a fixed sample of large city systems would show how widely a title was bought. However, カーリル's terms tie use to "providing library holdings information", so using it purely as a hidden ranking feature for AI 選書 is likely outside the permitted purpose. Ask カーリル (or use their paid or partner channel) before doing that. Showing "この本がある近くの図書館" to users would fit the terms better and could double as a signal.
- CiNii holder counts skew toward academic and university purchases. For business books they reflect "textbook-like enduring titles" (for example classic management books) rather than popular trade titles, which is still useful for a "定番 / 教養" level.
- Many library catalogues (OPACs, for example TRC-based or 富士通 iLiswave) show reservation counts (予約数) on the title page, but scraping them is not an open-data use, and robots and terms vary by municipality (unverified).

### Gaps
- No per-title lending ranking or reservation ranking open dataset in Japan was found. Individual libraries publish 「予約ベスト」 as HTML or PDF lists (not confirmed in this session).
- NDL Search holdings and union-catalogue counts (ゆにかねっと) as an API signal: not researched.
- e-Stat has only aggregate library statistics (日本の図書館 by JLA is paid). This is not verified.

## 5. Academic and open datasets of Japanese book sales

### Takeaway
No open, title-level Japanese book-sales dataset was found. Title-level sales data is proprietary: distributor POS (日販 オープンネットワークWIN, トーハン TONETS), 紀伊國屋 PubLine and オリコン BiZ. Aggregate market figures come from 出版科学研究所 (paid).

### Cited Findings
- PubLine is explicitly described as a paid service (有料サービス). — [ビジネス+IT](https://www.sbbit.jp/article/cont1/21590)
- オリコン describes its book ranking as the only nationwide ranking with estimated copies sold, which implies no comparable open source exists. — [koubo.jp PR](https://koubo.jp/press-release/prtimes/c34467_r769)

### Inferences
- For Orime, the realistic "time dimension" is self-built: snapshot 楽天 `sort=sales` positions over time, add the publication date and review count, and hand-tag annual and half-year distributor lists (日販 / トーハン / オリコン ビジネス部門 top 10–20, published every June and December) as curated flags with the source and year. This needs no paid licence. It also avoids redistributing anyone's ranking: show "2025年 年間ベストセラー（日販調べ）" only with attribution, or use it internally only.
- Before feeding any third-party ranking text to an AI or showing it in a commercial app, check each publisher's terms. None was verified in this session.

### Gaps
- Academic datasets (for example papers using 日販 POS under NDA) were not searched.
- The terms of all ranking pages (robots.txt, copyright on lists) remain unverified because the official hosts were unreachable from this session. Hosts to allow for follow-up: webservice.rakuten.co.jp, calil.jp, www.tohan.jp, www.nippan.co.jp, support.nii.ac.jp.
