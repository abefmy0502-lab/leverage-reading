# Global (English-language) business-book data sources for orime's translated-book catalog

Research date: 2026-11-17. Method: web search (US index) + attempted direct fetches. **Network limits in this session**: direct fetches of developer.nytimes.com, openlibrary.org, developers.google.com and porchlightbooks.com failed (host not allowed / blocked), so several terms pages could NOT be read first-hand; findings for those rely on search snippets and are flagged. No summary text from any service has been copied.

Legend: [V] = verified from a primary/official source snippet; [S] = secondary/aggregator source, treat as unverified; [I] = inference.

## 1. Bestseller lists (NYT, PW, USA Today, WSJ, Amazon Charts)

### Takeaway
The NYT Books API is the only bestseller source with a public API (incl. a Business list), but its official terms could not be read in this session, and secondary sources say commercial use needs NYT licensing and that caching/archiving NYT content is prohibited under general NYT terms — so storing NYT ranks in orime's DB is high-risk without a license. No reliable information was obtained on PW, USA Today, WSJ or Amazon Charts in this session.

### Cited Findings
- [S] NYT Books API: aggregator says limits are 500 requests/day and 5 requests/minute per key, recommends caching between publication dates, and says the API is free for non-commercial use while commercial use requires contacting NYT licensing — [Jentic: NYT Books API](https://jentic.com/apis/nytimes.com/books-api)
- [S] NYT general (site) terms, as mirrored by a university library (undated): "cache or archive the Content" listed as a prohibited use (exception: public search-engine indexing); providing cached datasets to others also barred. These are site terms, not the API terms — [LUT libguides mirror of NYT terms](https://libguides.lut.fi/terms/nyt)
- [S] NYT Best Sellers data has been available to developers via the NYT API since at least 2011 — [InfoDocket, 2011-04-02](https://www.infodocket.com/2011/04/02/more-best-sellers-data-available-to-devleopers-via-the-new-york-times-api/)
- OpenAPI spec of the Books API v3 is mirrored at [APIs.guru](https://api.apis.guru/v2/specs/nytimes.com:books_api/3.0.0.json) [S]
- The official API terms page (developer.nytimes.com/terms) could not be fetched in this session (tool blocked) — attribution wording and AI-use clauses unverified.

### Inferences
- [I] For orime, NYT lists are best used as an *internal, transient* signal (e.g., "was on a NYT business list" flag decided once, kept as a boolean derived fact) rather than storing/displaying rank tables — but even this should be cleared against the official API terms before shipping, since the app is commercial (paid plan).
- [I] Bestseller rank is mostly a popularity signal and overlaps with what orime already gets from Rakuten sales-rank for the Japanese edition; marginal value for *translated* books is "was it a hit in the original market," which an award/longlist list conveys more cheaply and with fewer license constraints.

### Gaps
- Official NYT API terms (storage, attribution text, AI/ML training restrictions, commercial use) — fetch blocked; must be read directly at developer.nytimes.com/terms.
- Publishers Weekly, USA Today (list was reported ended in 2022–23 per my prior knowledge — unverified here), WSJ (Circana BookScan-based) and Amazon Charts (believed discontinued ~2023 — unverified): no search results obtained. Treat all as "no public API; scraping not advisable" until checked.

## 2. Expert awards (FT/Schroders, Porchlight, getAbstract, 800-CEO-READ, Thinkers50)

### Takeaway
Awards are the cleanest "expert quality" signal: small, public, yearly lists of title/author facts (facts, not expressive text), which orime can curate by hand into its own catalog flags. FT/Schroders 2025 data is verified; getAbstract and Porchlight cycles are confirmed but winner names were not retrieved.

### Cited Findings
- [V] FT & Schroders Business Book of the Year 2025: 16-book longlist → 6-book shortlist announced 2025-09-24; winner Stephen Witt, *The Thinking Machine* (Nvidia/Jensen Huang); ceremony London 2025-12-03; prize £30,000 winner, £10,000 each shortlisted — [Schroders official page](https://www.schroders.com/en/global/individual/FT-Schroders-business-book-of-the-year-2025/); [Publishing Perspectives 2025-09](https://publishingperspectives.com/2025/09/the-30000-ft-schroders-business-book-2025-shortlist/)
- [V] 2025 shortlist: *House of Huawei* (Eva Dou), *Chokepoints* (Edward Fishman), *How Progress Ends* (Carl Benedikt Frey), *Abundance* (Ezra Klein & Derek Thompson), *Breakneck* (Dan Wang), *The Thinking Machine* (Stephen Witt) — [Shelf Awareness 2025-09-25](https://www.shelf-awareness.com/theshelf/2025-09-25/awards:_financial_times_and_schroders_business_book_shortlist.html); [Publishers Marketplace](https://lunch.publishersmarketplace.com/book_awards/ft-schroders-business-book-of-the-year-shortlist/)
- [S] Five Books keeps a page of FT/Schroders award books across years (useful for back-catalog) — [Five Books](https://fivebooks.com/books/ft-schroders-business-book-year/)
- [V] getAbstract International Book Award 2025: Business Impact winners announced at Frankfurt ceremony 2025-10-15; separate Learning Impact category — [getAbstract Journal](https://journal.getabstract.com/en/?p=127213)
- [V] getAbstract 2026 (26th) award: longlist published 2026-08; eligibility = works published June 2025–May 2026; winners announced 2026-10-08 at Frankfurter Buchmesse — [Publishing Perspectives 2026-08](https://publishingperspectives.com/2026/08/recognizing-human-contributions-longlist-revealed-for-the-26th-getabstract-international-book-award-for-business-impact/); [Börsen-Zeitung](https://www.boersen-zeitung.de/personen/praemierte-buecher-fuer-einen-lohnenden-abend)
- [V] Porchlight Business Book Awards 2025: winners revealed in New York 2026-01-28 (four category winners) — [Shelf Awareness 2026-02-05](https://www.shelf-awareness.com/theshelf/2026-02-05/awards:_porchlight_business_book_winners_arabic_fiction_shortlist.html); [Porchlight 2025 awards page](https://www.porchlightbooks.com/pages/2025-porchlight-business-book-awards)
- [V] Porchlight 2026 cycle: longlist of 20 books (5 × 4 categories), eligibility = US-published in 2026 (winners expected early 2027 [I]) — [Porchlight submissions 2026](https://www.porchlightbooks.com/pages/submissions-awards-2026)
- Porchlight (formerly 800-CEO-READ — rename from prior knowledge, unverified here) also publishes monthly business bestseller lists — [Porchlight business bestsellers 2025-01](https://porchlightbooks.com/buy-books/business-bestsellers/2025/january) [S]

### Inferences
- [I] Award lists are factual (title, author, year, list stage). Storing "FT longlist 2025" as a flag on an `advisor_books`-style row is low legal risk; do not copy judges' citations or blurbs.
- [I] Recency mismatch: Japanese translations typically appear 1–3 years after the original, so award flags are most valuable when back-filled for ~2005–2025 lists (e.g., *Fast & Slow* type titles), not just current years.
- [I] Thinkers50 (author-level ranking, biennial) would be an *author* authority signal, not a book signal — not researched in this session.

### Gaps
- Names of 2025 getAbstract and Porchlight winners (pages not retrievable: porchlightbooks.com fetch blocked).
- Thinkers50 list/terms; 800-CEO-READ historical awards archive: not researched (tool-call budget).
- Whether any award body offers a machine-readable list — none found; assume manual curation.

## 3. Summary / curation services (Blinkist, getAbstract, Shortform, Four Minute Books)

### Takeaway
None offers a public API; getAbstract integrates only through B2B partner deals arranged by email, and summaries are copyrighted content licensed with publishers — unusable as data for orime except possibly the *existence/rating* fact under a negotiated contract.

### Cited Findings
- [V] getAbstract content is integrated into partner platforms "via our API", arranged through corporate@getabstract.com (no public API docs) — [getAbstract support: GoodPractice integration](https://support.getabstract.com/en/knowledge/how-to-integrate-getabstract-into-goodpractice)
- [V] getAbstract offers prebuilt LMS integrations (e.g., Thrive) and a "Knowledge Layer" for corporate clients — [Thrive integration](https://www.thrivelearning.com/integrations/get-abstract); [getAbstract network](https://www.getabstract.com/en/network)
- [V] getAbstract states it works with publishing partners on copyright of summaries — [getAbstract summaries copyright](https://support.getabstract.com/en/knowledge/summaries-copyright); [publishers page](https://sta.getabstract.com/en/publishers)

### Inferences
- [I] Scraping Blinkist/Shortform/Four Minute Books summaries for AI use would conflict with their copyright/ToS and with orime's own rule ("never copy summary text"); the only safe derived signal is "a major summary service chose to summarize this book" (binary, manually checked), and even that should be gathered by hand.
- [I] getAbstract's yearly award + its own 1–10 rating could be a strong quality signal, but only via a commercial B2B license.

### Gaps
- Blinkist, Shortform, Four Minute Books terms/APIs: not researched directly (budget); no public API is known.

## 4. Open / commercial bibliographic data (Open Library, Wikidata, LoC, OCLC, Google Books, ISBNdb, OpenAlex, Semantic Scholar, Goodreads)

### Takeaway
For linking translations and enriching English originals, the practical stack is: Wikidata (CC0, work↔edition via P629/P747) + Open Library dumps (bulk, free) + Google Books (lookup) ; ISBNdb is paid; OCLC Classify is dead and WorldCat APIs need institutional subscriptions; Goodreads API is closed; OpenAlex now requires a (free) key and is a weak book signal.

### Cited Findings
- [V] Open Library API: unidentified requests 1 req/s; identified (User-Agent with app name + contact email) 3 req/s; violations → throttling/blocking; for bulk, use free monthly data dumps instead of the API — [Open Library Developer Center](https://openlibrary.org/developers/api)
- [S] Open Library data described as CC0 "where possible", with a request to credit Open Library/Internet Archive — [Jentic: Open Library](https://jentic.com/apis/openlibrary.org/openlibrary.md) (official license page not fetched — openlibrary.org blocked in this session)
- [V] Wikidata model: ISBN-13 (P212) belongs on the *edition* item; edition links to the *work* via "edition or translation of" (P629); inverse is "has edition or translation" (P747); a work item should not carry an ISBN — [Wikidata:WikiProject Books](https://www.wikidata.org/wiki/Wikidata:WikiProject_Books/en)
- [S] Wikidata only includes books meeting notability criteria, so many editions (incl. Japanese translations) are missing; Inventaire supplements it for this reason — [Inventaire wiki: Entities data](https://wiki.inventaire.io/wiki/Entities_data)
- [V] OCLC Classify web UI and API discontinued 2024-01-31; OCLC points to WorldCat Metadata API 2.0 (part of a Cataloging & Metadata subscription) — [OCLC help](https://help.oclc.org/Librarian_Toolbox/Troubleshooting/Why_is_OCLC_discontinuing_OCLC_Classify)
- [V] WorldCat Search API 1.0 ended 2024-12-31; v2.0 is JSON — [OCLC transition resources](https://www.oclc.org/developer/support/worldcat-search-transition.en.html); [WorldCat Search API](https://oclc.org/developer/api/oclc-apis/worldcat-search-api.en.html). No public pricing found (institution-oriented).
- [S] ISBNdb pricing (date unclear): Basic $14.99/mo, Premium $35.99/mo, Pro $99.99/mo, Enterprise $299.99/mo; no free tier — [BookScouter blog](https://bookscouter.com/blog/how-to-access-book-information-via-isbn-book-databases-overview/); per-second limits 1/3/5 for Basic/Premium/Pro per a third-party client README — [isbndb-client README](https://unpkg.com/isbndb-client@1.0.0/README.md); 7-day free trial per [Dart isbndb package](https://pub.dev/documentation/isbndb/2.0.0/)
- [V] OpenAlex: all API requests require an API key from 2026-02-13; keys free; usage-based pricing with a free daily credit allowance (official docs: 100,000 credits/day; third parties describe "$1/day" — conflicting descriptions) — [OpenAlex changelog](https://help.openalex.org/hc/en-us/articles/38868153578263-Changelog); [OpenAlex developers](https://developers.openalex.org/api-reference/introduction); [CASRAI news](https://casrai.org/news/openalex-api-keys-mandatory-usage-based-pricing-2026) [S]
- [V] OpenAlex indexes books as "works" (scholarly documents incl. books) — [OpenAlex API reference](https://developers.openalex.org/api-reference/introduction); ISBN filter support/coverage not confirmed.
- [V] Goodreads stopped issuing new developer keys on 2020-12-08 and plans to retire the API; some existing keys were disabled — [Goodreads developers discussion](https://www.goodreads.com/topic/show/21788520-api-deprecation); [InfoDocket 2020-12-13](https://www.infodocket.com/2020/12/13/report-goodreads-plans-to-retire-api-access-disables-existing-api-keys/)
- Google Books API terms page (developers.google.com/books/terms) exists but could not be fetched in this session — [Google Books API Terms](https://developers.google.com/books/terms.html). (orime already uses Google Books in `api/_bookSearch.js` / `api/_bookInfo.js`.)

### Inferences
- [I] OpenAlex/Semantic Scholar citation counts would mostly surface academic books (e.g., Kahneman, Christensen) and miss most practitioner business books; usable as a "scholarly grounding" bonus feeding orime's difficulty level (上級), not as a general quality score.
- [I] Open Library dumps (works/editions with `translation_of`/`translated_from` fields in some records — from prior knowledge, unverified here) can be loaded offline to map English ISBN ↔ work ↔ subjects without rate limits.
- [I] Library of Congress subject headings (LCSH) via id.loc.gov are public-domain US government data (prior knowledge, unverified in this session) and could feed orime's 14-field classifier for the English original.
- [I] Goodreads ratings are unavailable legally at scale; do not scrape (Amazon ToS).

### Gaps
- Semantic Scholar API terms and book coverage: not researched (budget).
- LoC API (loc.gov JSON, id.loc.gov) terms/rate limits: not researched in this session.
- Google Books terms (caching, AI use): fetch blocked.
- Official ISBNdb 2026 pricing: not found on isbndb.com.

## 5. Linking a Japanese translation to its English original

### Takeaway
The most reliable Japan-side key is the NDL bibliographic note 「原タイトル:」, recorded for English originals since 1977 and searchable/harvestable via NDL Search APIs (orime already calls NDL); match the extracted original title + author (romanized/katakana-normalized) against Wikidata/Open Library/Google Books to get the English ISBN and work ID. Quantified match rates were not found.

### Cited Findings
- [V] NDL records the original title of translated books in the 注記 field, shown as 「原タイトル:」; started 1977, initially for English, French, German, Italian, Russian, Spanish, Portuguese originals, later expanded to kanji, kana, Cyrillic, Hangul etc.; translations are searchable by original title when recorded — [NDL 書誌データQ&A タイトル](https://www.ndl.go.jp/data/faq/title)
- [V] Since 2021 NDL records authorized access points for works (著作の典拠形アクセス・ポイント), viewable in Web NDL Authorities — same source [NDL 書誌データQ&A](https://www.ndl.go.jp/data/faq/title)
- [V] NDL Search offers search APIs (SRU, OpenSearch, OpenURL) and harvest API (OAI-PMH), output incl. DC-NDL (RDF) — [NDLサーチのメタデータ](https://ndlsearch.ndl.go.jp/metadata_in_ndlsearch); API application form exists for some uses — [NDLサーチ API利用申請フォーム](https://form2.ndl.go.jp/form/pub/ndl07/api)
- [V] Wikidata can express translation via P629 (edition → work) / P747, but coverage is limited to notable books — [WikiProject Books](https://www.wikidata.org/wiki/Wikidata:WikiProject_Books/en); [Inventaire](https://wiki.inventaire.io/wiki/Entities_data)

### Inferences
- [I] Practical pipeline: (1) for each orime ISBN, read NDL DC-NDL note → extract 「原タイトル: X」; (2) author: take katakana author from NDL/openBD, map to Latin via Wikidata label or NDL authority (which often holds Latin-script variant names); (3) query Open Library/Google Books with title+author → English ISBN(s); (4) confirm via Wikidata P629 when present; (5) store `orig_title`, `orig_isbn`, `orig_work_id` once (facts only).
- [I] openBD's ONIX may carry original-title data only if the publisher supplied it; not verified — treat NDL as primary.
- [I] Expected match rates (no source found): NDL 原タイトル should be present for the large majority of post-1977 translated books held by NDL (legal deposit); Wikidata P629 linkage for Japanese editions is likely sparse (only famous titles like 『7つの習慣』); English-ISBN resolution via title+author search should be high for bestsellers. Measure on orime's own catalog (e.g., sample 200 translated titles) before committing.
- [I] Reverse use: knowing the original enables pulling award flags (§2), LCSH subjects (§4) and publication year of the original (age of ideas), which can refine difficulty and field classification for translated titles.

### Gaps
- Exact DC-NDL element name holding the 原タイトル note (likely a `dcndl:` note/description field) — not confirmed.
- Quantified match rates for any method — no source found; needs an in-house sample test.
- Whether openBD/版元ドットコム exposes 原書名 as a structured field — not verified.
