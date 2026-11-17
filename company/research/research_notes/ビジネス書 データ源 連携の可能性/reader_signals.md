# Reader-generated data about Japanese business books (ビジネス書): sources, signals, terms, and Orime's own data (as of 2026-11-17)

> Method note (2026-11-17): this session's network blocked direct fetches of bookmeter.com, booklog.jp, honzuki.jp, honto.jp, note.com, goodreads.com, b.hatena.ne.jp (robots.txt via curl → proxy 403), webservice.rakuten.co.jp and www.bunka.go.jp (WebFetch → host not allowed). So **no robots.txt file was actually read**, and terms were only seen as search snippets. Everything marked "(unverified)" comes from training knowledge (cutoff June 2026) or third-party pages and must be checked before any build decision. To verify, allow those hosts in the session's network settings and re-run.
>
> Repo fact: Orime already requests `reviewCount,reviewAverage,booksGenreId` from Rakuten (`api/_bookSearch.js:25`, `api/_advisorBooks.js:34`), stores `review_count` / `review_avg` in `advisor_books` (`api/_advisorBooks.test.js:67`), and uses reviewCount as a popularity tiebreak in ranking (`api/_bookRank.js:215`).

## Q1. Japanese reader-review / reading-log services (読書メーター, ブクログ, 本が好き!, honto, 楽天, Amazon, Kindle, Google Books)

### Takeaway
None of the big Japanese reading-log communities (読書メーター, ブクログ) offers a public data API found in this search. The only reader signal that is officially and legally easy to get is Rakuten's review count and average, which Orime already uses. Amazon review data is not available through Amazon's affiliate API, and Kindle Popular Highlights have no official API. In practice, the outside sources only give popularity numbers ("how many people read or rated this"), not "who it suits" or "how hard it is".

### Cited Findings
- 読書メーター's terms define 「当社」 as 株式会社ドワンゴ (the site is branded KADOKAWA Group), and the service as 「読書メーター」. No API or scraping clause appeared in the search snippets. — [読書メーター 利用規約](https://bookmeter.com/terms)
- No public 読書メーター API was found in search results (2026-11). A third-party gem, `bookmeter_exporter`, exists to export one user's own records, which suggests export goes through scraping or the user's own session, not an official API. — [bookmeter_exporter README](https://rubydoc.info/gems/bookmeter_exporter/file/README.md)
- 読書メーター's help/about pages describe the service as a reading log with 感想 posts. — [読書メーター about](https://bookmeter.com/help/introduction/about)
- No official ブクログ API or export terms were found. Search results only showed ブクログ reviews syndicated on other stores (e.g. BookLive pages showing reviews). — [BookLive review page](https://booklive.jp/review/author-list/a_id/273128)
- Rakuten Books total-search API officially supports `sort=reviewCount` (most reviews first) and `sort=reviewAverage` (highest rating first). — [楽天ブックス総合検索API](https://webservice.rakuten.co.jp/documentation/books-total-search)
- Orime already pulls `reviewCount` and `reviewAverage` from Rakuten's Books search (repo: `api/_bookSearch.js`, `api/_advisorBooks.js`). Rakuten's API returns no review text, reviewer level or "suits whom" fields: the fields Orime requests contain only the count and the average. Rakuten's API docs could not be fetched to confirm that no other review fields exist.
- Amazon PA-API 5 is deprecated and replaced by the Creators API. Old calls now return 403. — [Amazon Creators API: PA-API v5 deprecation](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation)
- Sources disagree on the PA-API cutoff date: one says April 30, 2026 (deprecation) and May 15, 2026 (endpoint retired); a vendor says May 15, 2026. — [DEV Community](https://dev.to/th3nate/amazon-pa-api-v5-is-shutting-down-april-30-2026-here-is-what-changes-at-the-auth-layer-22ek); [affiliate-toolkit](https://www.affiliate-toolkit.com/affiliate-toolkit-3-8-5-amazon-creators-api-support-why-you-need-to-migrate-before-may-15-2026/)
- Creators API access needs new credentials, an approved account, and reportedly at least 10 qualifying sales in the last 30 days. Access is paused if sales lapse. — [keywordrush blog](https://www.keywordrush.com/blog/?p=245) (third-party)
- A PA-API 5 forum thread shows a `MinReviewsRating` search filter existed (and was reported broken), but PA-API never returned review text. Review text not being returned is training knowledge (unverified). — [AWS re:Post](https://repost.aws/pt/questions/QUuK1-uHDtTeiBg7HKs0n8Ow/paapi5-searchitems-endpoint-filter-by-minreviewsrating-not-working)
- Kindle Popular Highlights still exist as of January 2026, and they "track passages Kindle readers have consistently highlighted". No official API or 2026 change was found. — [Android Authority, 2026-01](https://www.androidauthority.com/kindle-popular-highlights-3634804)
- Kindle highlight export is limited by publishers (third-party claims: 10–20% of a book, or 1–3% for copy-paste). Third-party tools scrape read.amazon.com instead of using an API. — [Glasp](https://glasp.ai/posts/how-to-copy-and-paste-kindle-highlights-beyond-the-export-limits) (vendor, treat cautiously)
- Google Books API documentation (ja) exists. Its volume data carries `averageRating` / `ratingsCount` (training knowledge, unverified; these fields are usually empty for Japanese titles). — [Google Books API 使い方](https://developers.google.com/books/docs/v1/using?hl=ja)
- 本が好き! and honto レビュー: no API, terms or data-access information was found in this search. honto product pages show reviews, but no data feed was found. — [honto product page example](https://honto.jp/netstore/pd-book_33067663.html)

### Inferences
- 読書メーター and ブクログ have the most valuable Japanese signals: 読んだ / 読みたい / 積読 counts, ratings, 感想 text, and a co-reading graph via user shelves. Neither has an official API that turned up. Scraping them would be a terms risk (unverified) and a reputational risk. The realistic route is a business partnership: ドワンゴ/KADOKAWA for 読書メーター, or ブクログ's operator (training knowledge: 株式会社ブクログ, a 株式会社paperboy&co. lineage; unverified).
- A permitted, low-effort import is a **user-initiated import of the user's own shelf**. Orime already has an "取り込み" flow (CLAUDE.md, 初日の体験). That gives co-reading data only from Orime's own consenting users.
- For "difficulty" and "who it suits", none of these APIs returns structured fields. They would have to be derived from review text, which runs into the copyright and terms issues in Q4.

### Gaps
- robots.txt for bookmeter.com, booklog.jp, honzuki.jp, honto.jp: not read (network blocked). Must verify.
- Full text of the 読書メーター and ブクログ terms (prohibited acts, scraping, who owns review copyright, AI use): not seen.
- Rakuten Books Book Search API output field list: could not be fetched; whether any other review-related field exists is unconfirmed.
- 本が好き! terms and API status: nothing found.
- Whether Amazon's Creators API returns rating or review counts: not confirmed.

## Q2. Social and media sources (note, X, Threads, はてブ, Instagram, YouTube, podcasts)

### Takeaway
X now charges per call and has no free tier for new developers (since 2026-02). note's official API (since 2026-10) is for publishing on note pro only, not for reading other people's articles. The はてなブックマーク count API and the YouTube Data API are the cheapest legitimate ways to get "how much attention a book got". Both measure attention, not reader difficulty or what readers applied.

### Cited Findings
- X made pay-per-use the default on 2026-02-06 and ended the free tier for new signups. Basic subscribers were auto-migrated from 2026-06-01. — [Open Terms Archive memo](https://opentermsarchive.org/en/memos/x-replaces-its-dollar200-entry-level-api-plan-with-a-pay-per-use-model/); [GIGAZINE 2026-02-09](https://gigazine.net/gsc_news/en/20260209-x-api-pay-per-use)
- Commonly cited X rates (third-party): $0.005 per post read, $0.01 per user lookup, $0.015 per post created ($0.20 with a link). The monthly read cap is disputed: 2M vs 3M. — [postproxy](https://postproxy.dev/blog/x-api-pricing-2026); [bundle.social 2026-08](https://bundle.social/blog/x-api-pricing-2026-costs-limits) (verify on docs.x.com)
- note株式会社 disclosure (2026-10-08): "note API" launched for note pro corporate customers, for creating and managing articles from external services; the first integration is StoryHub. — [note TDnet disclosure 2026-10-08](https://finance-frontend-pc-dist.west.edge.storage-yahoo.jp/disclosure/20261008/20261008547769.pdf)
- The note help center has a FAQ titled 「noteが公式で公開しているAPIはありますか?」; the answer text was not retrieved. — [noteヘルプセンター](https://www.help-note.com/hc/ja/sections/25011081987481-%E3%81%9D%E3%81%AE%E4%BB%96%E3%81%AE%E6%A9%9F%E8%83%BD)
- はてなブックマーク: per secondary blogs, a no-auth count endpoint exists (`count/entry?url=`; `count/entries` takes up to 50 URLs). The official doc is reportedly at developer.hatena.ne.jp. Endpoint names conflict across blogs. — [app-tatsujin (secondary)](https://app-tatsujin.com/?p=120246); official reference cited there: [Hatena developer docs](https://developer.hatena.ne.jp/ja/documents/bookmark/apis/getinfo/) (not fetched)
- YouTube Data API: the default is 10,000 units/day; the official page also describes separate default buckets of 100 `search.list` calls and 100 `videos.insert` calls per day. `commentThreads.list` costs 1 unit per page. — [Google: quota cost](https://developers.google.com/youtube/v3/determine_quota_cost)
- Threads, Instagram #読書記録 and podcast data: not researched with sources here. Training knowledge (unverified): the Instagram Graph API's hashtag search is limited to business accounts (30 unique hashtags per 7 days) and returns posts, not reliable counts. The Threads API mainly covers publishing plus keyword search with limits. There is no Japanese podcast transcript API.

### Inferences
- The はてブ count for a book's Amazon/Rakuten/publisher URL, or for a note review article, is a cheap proxy for "how much a book was discussed". It says nothing about difficulty.
- YouTube 本要約チャンネル (e.g. well-known business-book summary channels) show which business books get *summarized*. Video titles and view counts are legal to read via the API. Comment text, though, belongs to individual users (privacy and copyright apply).
- At $0.005 per read, a keyword sample of 100k posts costs about $500 (inference from the cited rates). Feasible for a one-off study, but X posts about books are mostly marketing or affiliate posts, so the signal is noisy.
- note articles tagged #ビジネス書 / #読書記録 are the richest Japanese long-form "what I applied" text. But there is no read API, and scraping them for display is not appropriate. At most, Orime could manually curate *links* to them.

### Gaps
- The text of note's terms on scraping and AI training (note added AI-training opt-out settings in 2023–24 per training knowledge; unverified).
- Official X pricing page (docs.x.com): not fetched.
- Threads, Instagram and podcast details: no sources.

## Q3. English-language sources (Goodreads, StoryGraph, Open Library, LibraryThing) for originals of translated business books

### Takeaway
The Goodreads API has been closed to new keys since December 2020, so Goodreads cannot be used legitimately. Open Library is the only open option: it needs no keys and offers data dumps. Its reading-log coverage of business books is thin (inference).

### Cited Findings
- Goodreads stopped issuing new developer keys on 2020-12-08 and announced it would retire the API. The API reportedly stopped returning many fields around mid-2022. — [Slashdot 2020-12-17](https://developers.slashdot.org/story/20/12/17/1522242/goodreads-is-retiring-its-current-api-and-book-loving-developers-arent-happy); [Goodreads developer forum](https://www.goodreads.com/topic/show/21788520-api-deprecation); [infoDOCKET](https://www.infodocket.com/2020/12/13/report-goodreads-plans-to-retire-api-access-disables-existing-api-keys/)
- 2026 commentary: developers find "a dead end" with Goodreads. Scraping vendors (Apify) sell Goodreads data without the API. That is a terms risk, not a legitimate path. — [Apify blog](https://blog.apify.com/goodreads-data-without-api/)
- Open Library: open source, no API keys, and offers data dumps (per a user comment on the Goodreads forum; verify). — [Goodreads developer keys thread](https://www.goodreads.com/topic/show/22303603-developer-keys)
- Training knowledge (unverified): Open Library exposes per-work `/works/{id}/bookshelves.json` (want-to-read, currently-reading and already-read counts) and `/ratings.json`. Data dumps include reading-log and ratings dumps. StoryGraph has no public API. LibraryThing has older APIs with restrictive terms.

### Inferences
- For a translated business book (e.g. 『7つの習慣』 → *The 7 Habits*), the Open Library want-to-read and already-read counts plus ratings could serve as a free "global popularity" signal. Matching would go through the original ISBN; Japanese-edition ISBNs won't match.
- Goodreads review text is often where "too basic or too dense for beginners" is discussed, but that data is not legitimately accessible.

### Gaps
- Open Library reading-log endpoints, the dump license (training knowledge says CC0 for its data) and coverage were not verified this session.
- StoryGraph and LibraryThing API status: no sources found.

## Q4. Japanese law: copyright Art. 30-4 / 47-5, APPI, and what is allowed for (a) analyzing reviews into signals vs (b) storing or showing review text

### Takeaway
Japanese copyright law broadly allows **analysis that doesn't "enjoy" the work**: reading reviews to compute counts, sentiment or "difficulty mentioned" flags (Art. 30-4), unless doing so unreasonably harms the rights holder. **Showing or summarizing review text to users** is a different matter. Art. 47-5 covers it only for "minor use" (軽微利用) tied to search or analysis, and generating summaries from reviews, as in RAG, falls outside 30-4. Separately, site terms and robots.txt can contractually bar scraping even where copyright would allow it. Review usernames are personal information under the APPI.

### Cited Findings
- 文化庁 and the 文化審議会著作権分科会法制度小委員会 compiled 「AIと著作権に関する考え方について」 in 令和6年3月 (March 2024). The same page links the 令和元年10月24日 guidance on the flexible exception clauses (30-4, 47-4, 47-5). — [文化庁 AIと著作権](https://www.bunka.go.jp/seisaku/chosakuken/aiandcopyright.html) (seen via search; the page could not be fetched)
- Per 小委員会 materials: Art. 30-4 is a flexible exception that covers AI development beyond generative AI. **But when a generative AI summarizes target data to produce answers, the copying is not a non-enjoyment purpose, so 30-4 does not apply.** RAG-type use may fall under 47-5, but **only for 軽微利用**; anything beyond that needs the rights holder's permission in principle. — [法制度小委員会 資料 r05_05](https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/hoseido/r05_05/); [r05_04](https://www.bunka.go.jp/seisaku/bunkashingikai/chosakuken/hoseido/r05_04/)
- Art. 47-5 requirements (legal commentary): information analysis or result provision following government-ordinance standards; the work is publicly offered; use is limited to what is necessary; use is incidental (付随性); and use is minor (軽微性). Minor use is judged by the share of the work used, the amount, and the display resolution. — [有斐閣Online](https://yuhikaku.com/articles/-/28485)
- PPC: processing personal information *to create statistical information* is not "creating" 仮名加工情報 or 匿名加工情報, so those regimes' creation duties don't apply to statistics. — [PPC FAQ](https://www.ppc.go.jp/all_faq_index/faq4-q010)
- The PPC 匿名加工情報 guideline covers processing standards, safety measures, public notice on creation, third-party provision and the ban on re-identification. It was partly revised in 令和8年4月 (April 2026). — [PPC ガイドライン（仮名加工情報・匿名加工情報編）](https://www.ppc.go.jp/personalinfo/legal/guidelines_anonymous/)
- Training knowledge (unverified): the PPC's 通則編 and Q&A treat statistical data aggregated so it cannot be linked to individuals (統計情報) as not personal information, so it may be provided to third parties without consent. Check APPI Q&A — [PPC APPI Q&A](https://www.ppc.go.jp/personalinfo/faq/APPI_QA/)
- A violation of terms of use does not automatically mean damages or criminal liability, but the risk depends on circumstances (lawyer Q&A). — [弁護士ドットコム](https://www.bengo4.com/c_1015/c_17/c_1263/m_1041514/)

### Inferences
- (a) **Deriving signals.** Counting reviews that mention 「難しい」「初心者」「入門」, building aggregate "difficulty" scores, or computing co-occurrence across public reviews is the textbook case of 30-4 non-enjoyment analysis. It is copyright-permissible *if access is lawful*. The binding constraint is the site's terms and robots.txt (contract law, plus possible 業務妨害 if load is heavy), not copyright.
- (b) **Storing or displaying text.** Quoting review sentences in the app, or having the AI paraphrase reviews into answers, needs either 47-5-compliant minor snippets with the source shown, or permission. Orime's existing rule ("AI に書評の言い回しを写さない", the bookvinegar ext table per CLAUDE.md) matches this. But even *storing full summary text* from a third party is a contract and terms question, not only a copyright one.
- Reviewer handles and profile links are personal information. Store none. Aggregate to book-level numbers before saving.
- **Recommendation:** derive difficulty or "who it suits" for public reviews only through a licensed partnership or the user's own-data import. Use public stats such as Rakuten counts and はてブ counts for popularity only.

### Gaps
- The final text of 「AIと著作権に関する考え方について」 (2024-03-15) was not fetched. The quotes above come from 小委員会 materials and commentary, not the final document. Verify the exact passages on 47-5 and RAG.
- The exact PPC wording on 統計情報 was not retrieved.
- Whether the 読書メーター or ブクログ terms prohibit AI analysis or scraping: unknown.

## Q5. Orime's own first-party data as a "Orime 読者の声" dataset

### Takeaway
Orime's own logs already hold signals that outside sources can't provide: how many memos people wrote, "覚えた" counts, the share of books turned into 行動, completion, reading time, the difficulty setting, and which books were noted together. If these are aggregated per book with a minimum group size (k ≥ 10–20 readers), and the user data and terms are updated, this can become a better source than any outside one for "beginners find this hard" and "readers actually applied this". App Store 5.1.2 and the APPI mainly require disclosure and purpose-limitation. They do not ban using aggregated statistics.

### Cited Findings
- Statistics creation is outside the 仮名加工 / 匿名加工 creation duties (PPC FAQ above). — [PPC FAQ](https://www.ppc.go.jp/all_faq_index/faq4-q010)
- App Store 5.1.2(i): apps may use, transmit or share personal data only after disclosure and permission. An Apple rejection quotes the rule: "does not clearly explain what data is sent, identify who the data is sent to, and ask the user's permission". — [Apple Developer Forums 815109](https://developer.apple.com/forums/thread/815109)
- 5.1.2(i) was expanded (reported date 2025-11-13) to name "third-party AI" explicitly, requiring disclosure and opt-in. — [iGeeksBlog](https://www.igeeksblog.com/apple-app-store-ai-data-disclosure-guidelines/) (secondary)
- Apple's user-privacy page: functionality cannot be gated on agreeing to tracking (5.1.2(i)). — [Apple: User privacy and data use](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- Repo facts (CLAUDE.md, 2026-11-17): Orime already records `book_memos` (with `recall_count`, i.e. the 覚えた count), `actions` (with `source_memo_id`, `completed_at`), `reading_sessions` (seconds per book), book `status` / `rating`, `analytics_events` (opt-out, PII-free props), and `book_field_cache`. The last of these is already a shared, cross-user per-book table keyed by ISBN.

### Inferences
Candidate per-book aggregates (all computed server-side, only for books with ≥ k distinct readers):
- 読了率 = done / (reading + done). A low rate signals a hard or abandoned book. Readers by difficulty setting (やさしめ / ふつう / 難しめ) × completion gives "beginners finish this less often".
- Median memos per reader, and memos per 100 pages (with `total_pages`). This measures engagement density.
- 行動化率 = readers with ≥ 1 action whose `book_id` is this book / readers. Completed-action rate gives "readers actually applied this".
- 覚えた rate = recall_count > 0 share. This measures how memorable the ideas were.
- Median reading time to finish (from `reading_sessions`) gives real effort, which beats page counts.
- Rating distribution (★), shown only when n ≥ k.
- Co-noting graph: "people who wrote memos on X also wrote memos on Y". Use pair counts with a minimum pair support (e.g. ≥ 5 users per pair), never single-user paths.
- Memo **text** must never be pooled into shared answers. It is the user's own expression, and the product promise is "答えのもとは、あなたが残したメモ". Use counts only. If topic tags are derived, use the user's tags only after aggregation.

Thresholds and safeguards (inference, based on common practice; no Japanese official k-value exists):
- k-anonymity: publish a book-level stat only when ≥ 10 distinct readers contribute (≥ 20 for difficulty × level breakdowns). Suppress cells < 5. Round counts to 5. Exclude admins and test accounts, as the existing admin SQL already does. Add small noise if exact counts could be differenced over time.
- Never show "N 人" for very small N on niche books, since a friend could identify the reader.
- Consent: aggregate statistics that cannot identify individuals are generally outside the APPI's third-party provision rules (PPC position, training knowledge). Still, **update the privacy policy's purpose of use** to say "本ごとの集計（個人を特定しない）を、おすすめの改善と画面の表示に使う". Offer an opt-out, extending the existing 利用状況の記録 opt-out. App Store: list "Product Interaction / Other User Content" usage under App Privacy "Analytics / App Functionality". No ATT is needed (no cross-app tracking).
- If any aggregate is sent to a third-party AI (e.g. as recommendation context), it is not personal data. Even so, keep the AI-consent sheet's description accurate. Raising `AI_CONSENT_VERSION` is needed only if the destination changes.
- Coverage: early on, few books will reach k ≥ 10. Use Rakuten review counts and Open Library counts as the fallback. Show the Orime signal only when n is enough, e.g. 「Orime で読んだ人の多くが、行動に移しています」 without percentages. That fits the anti-gamification rule (no %, rankings or badges).

### Gaps
- No Japanese official guidance gives a numeric k threshold. The values above are a judgment call and should be decided by the owner, ideally with legal review.
- Apple's guideline text on aggregated or anonymized data was not retrieved. It is unclear whether Apple treats per-book aggregates shown to other users as "sharing" (inference: it does not, if not personally identifiable).
- The current user base size is unknown here, so it is unclear how many business books would reach k within 6–12 months.
