# Landing pages of global reading, book-summary and AI-knowledge subscription apps (research date: 2026-10-11)

**Method and limits (read first).** Direct page fetches were blocked in this environment. WebFetch returned ENOTFOUND for readwise.io, blinkist.com, makeheadway.com, shortform.com, thestorygraph.com and granola.ai. curl through the proxy got a 403 CONNECT rejection for those sites, web.archive.org and r.jina.ai. Everything below comes from search-engine result titles and snippets (page `<title>` text, cached copies, App Store listings) plus third-party write-ups.

- **"Verified (title/snippet)"** means the wording appeared in the search index for the official URL. That is good evidence that the phrase existed on the page, but not that it is the current hero, how it is laid out, or where it sits.
- **"Paraphrase"** means the search tool summarised the page and the exact wording is not confirmed.
- I could not see CTA placement, sticky bars, visuals or section order directly for any site. Those items are mostly in Gaps.

## Q1. Hero headline, sub-headline and the promise (outcome vs feature)

### Takeaway
The winners lead with an outcome or identity promise in 4 to 9 words, then name the mechanism in the sub-line:
- "Get the most out of what you read" (Readwise)
- "Powerful ideas — 15 minutes at a time" (Blinkist)
- "Become the most interesting person in the room" (Headway funnel)
- "Understand anything" (NotebookLM)
- "Because life's too short for a book you're not in the mood for" (StoryGraph)

AI-native tools (Granola, Mem) are the exception. They put a category noun in the headline ("AI notepad", "AI Thought Partner") and add a sharp differentiator ("Without a meeting bot").

### Cited Findings
- **Readwise.** Page title, verified (title): "Readwise: Get the most out of what you read" — [readwise.io](https://readwise.io/). The search summary also reported a variant, "Get more out of what you read", and described the hero promise as a daily review that "resurfaces the right highlight at the right time via email or app" (paraphrase) — [readwise.io](https://readwise.io/). This is an outcome promise, with the mechanism (resurfacing) in the sub-line.
- **Readwise Reader.** Headline: "The first read-it-later app built for power readers" (wording comes from the App Store listing and the Readwise Chrome extension). A cached copy of readwise.io/read shows the fragmented heading "The first … read-it-later app for power readers", broken up by rotating words: "newsletters RSS reading web highlighting read-it-later" — [Readwise Reader](https://readwise.io/read); [App Store](https://apps.apple.com/us/app/readwise-reader/id1567599761?uo=4). This is identity positioning ("power readers") plus a rotating-word hero (inferred from the fragment). The snapshot may be about 3 years old.
- **Blinkist.**
  - Main page title, verified (title): "Blinkist: Best Book Summaries & Audio Book Guides" — [blinkist.com](https://www.blinkist.com/).
  - Free-trial page, verified (title/snippet):
    - Title: "Blinkist: Serving curious minds."
    - Heading: "Powerful ideas —15 minutes at a time"
    - Body line: "Open the app to sign up for 7 free days of Premium access"
    — [blinkist.com/app-free-trial](https://www.blinkist.com/app-free-trial).
  - An older Blinkist heading, "Learn something new every day", was paired with getting "the key ideas from the top books, podcasts, and experts in 15 minutes". This is paraphrase and the page is roughly 1,200 days old — same search.
  - Pattern: a time-cost outcome ("15 minutes").
- **Headway.** The web funnel landing page /onboarding/self-growth/landing is headed "Become the most interesting person in the room" and leads into a 3-minute quiz that asks for an age range and "personalizes your subscription plan" (heading verified via snippet, rest paraphrase) — [makeheadway.com onboarding](https://makeheadway.com/onboarding/self-growth/landing). Pattern: an identity or social outcome, with a quiz as the hero CTA. A blog title uses "Grow Smarter, Not Harder, with the Headway App" — [Headway blog](https://makeheadway.com/blog/grow-smarter-not-harder-with-headway-app/).
- **Shortform.** The homepage claims it writes "the world's best book guides" and invites visitors to "get a free book guide" (paraphrase from the snippet) — [Shortform summaries](https://www.shortform.com/summaries). App listing: the guides are "written by professional authors, PhD's, and Ivy League graduates" and add analysis comparing ideas to other books — [App Store](https://apps.apple.com/app/id1489472007). Pattern: a quality and authority claim ("best", "PhDs"), positioned against "summaries".
- **The StoryGraph.**
  - Hero tagline, verified via multiple sources: "Because life's too short for a book you're not in the mood for" — [thestorygraph.com](https://thestorygraph.com/); [Chronicle Online](https://www.chronicleonline.com/news/local/library-tech-talk-storygraph-because-lifes-too-short-for-a-book-youre-not-in-the/article_52a289f0-22e3-5290-b1b3-adfa445c3992.html).
  - Sub-line pitch: "choose your next book based on your mood and your favorite topics and themes" (paraphrase-level wording).
  - Hero layout described as the "tagline beside a wall of book covers" (third-party description) — [The StoryGraph](https://thestorygraph.com/).
  - Pattern: an emotional, wry outcome, with no feature in the headline.
- **Granola.**
  - Title, verified: "Granola — The AI notepad for people in back-to-back meetings". The URL was indexed with pubDate 20250821. — [granola.ai](https://www.granola.ai/?pubDate=20250821)
  - Sub-line: "Notes, actions and memory. Without a meeting bot." (verified via snippet) — [granola.ai](https://www.granola.ai/).
  - Pattern: a category noun plus a target persona ("people in back-to-back meetings") plus the differentiator stated as an absence ("without a bot").
- **Reflect.** The homepage heading is "Think better with Reflect" and appears twice: near the top and again near the bottom. The second instance adds copy about keeping ideas and connections from slipping away (paraphrase) — [reflect.app](https://reflect.app/). Newer positioning describes the app as "a complete rewrite of Reflect for the age of AI" and calls it "open-source, markdown first, and AI native" — [Reflect blog](https://reflect.app/blog); [X @reflectnotes](https://x.com/reflectnotes?lang=en).
- **Mem.** The App Store title is "Mem – Your AI Thought Partner" and the description says "the notes app that thinks alongside you". The release notes call Mem 2.0 "the world's first AI Thought Partner" — [App Store](https://apps.apple.com/us/app/id1578757028). The live homepage was not retrieved.
- **NotebookLM.** App Store headline: "Understand anything". It describes the product as "your brain's new best friend". Google reportedly also promotes it as "your research and thinking partner" (secondary source) — [App Store](https://apps.apple.com/app/google-notebooklm/id6737527615); [AI Supremacy](https://www.ai-supremacy.com/p/google-understand-anything-notebooklm).
- **Glasp.** It calls itself an "AI-powered social web highlighter that lets you build your personal AI clone" (paraphrase); the page title is "Glasp - Build Your AI Clone from Highlights & Notes" — [glasp.live](https://glasp.live/).
- **Rosebud.** The therapy page positions it as an AI journal for "bridging the gap between therapy sessions" (paraphrase). The company describes itself as "the World's Leading AI Journal" — [Rosebud therapy page](https://www.rosebud.app/therapy-and-coaching); [Rosebud blog](https://www.rosebud.app/blog/rosebud-raises-6m-to-expand-the-worlds-leading-ai-journal).

### Inferences
- **Two headline families.**
  - Reading and consumption apps (Readwise, Blinkist, Headway, StoryGraph) promise an outcome or identity: get more out of reading, become interesting, never waste time on the wrong book.
  - AI-knowledge tools (Granola, Mem, Glasp, NotebookLM) name a new category, then differentiate.
  - Orime sits between the two families. "Your own advisor that grows the more you read" is closest to the Readwise pattern: an outcome headline with the mechanism in the sub-line.
- **Short and concrete beats clever.** The strongest examples contain either a number ("15 minutes"), a persona ("people in back-to-back meetings", "power readers"), or a vivid situation ("the most interesting person in the room").
- **Defining by absence works.** Granola's "Without a meeting bot" turns a privacy or awkwardness objection into the headline. Orime could do the same, for example "答えはあなたのメモから — ネットの一般論ではなく" ("Answers come from your notes, not generic advice from the internet").

### Gaps
- Exact current (2026) hero and sub-copy for blinkist.com, makeheadway.com (main domain), shortform.com, speechify.com, mem.ai, notebooklm.google and rosebud.app. Live pages could not be fetched.
- Readwise's homepage sub-headline wording, beyond the paraphrase.

## Q2. CTA buttons: wording, placement, sticky CTA

### Takeaway
The CTA wording found is trial-framed or free-framed:
- "Start 30 day free trial" (Readwise)
- "get a free book guide" (Shortform)
- "Open the app to sign up for 7 free days" (Blinkist)
- A quiz as the first step (Headway)
- Download buttons for every platform (Granola)

Placement and stickiness could not be observed.

### Cited Findings
- **Readwise.** "Start 30 day free trial" (verified via pricing-page snippet). The Reader page says "free 30-day trial, no credit card required" — [Readwise pricing](https://readwise.io/pricing/reader); [Readwise Reader](https://readwise.io/read).
- **Blinkist.** The web trial page pushes users to the app: "Open the app to sign up for 7 free days of Premium access". Another page notes "This trial access is only available on our mobile apps" — [blinkist.com/app-free-trial](https://www.blinkist.com/app-free-trial).
- **Headway.** The landing page's first action is a "3-minute quiz" starting with an age-range choice. Passing the quiz "personalizes your subscription plan" — [Headway onboarding](https://makeheadway.com/onboarding/self-growth/landing). The FAQ also describes the flow as "a short quiz about your goals" that builds "a personalized learning plan" — [Headway FAQ](https://makeheadway.com/faq/).
- **Shortform.** "Get a free book guide" (paraphrase from the snippet) — [Shortform](https://www.shortform.com/summaries).
- **Granola.** The homepage lists downloads for macOS, Windows, iOS and Android and says it works with Zoom, Google Meet and Teams (paraphrase) — [granola.ai](https://www.granola.ai/).

### Inferences
- **Two CTA strategies.**
  - Low-commitment value first: Shortform's free guide, Readwise's 30 days with no card.
  - A quiz funnel: Headway uses a personalization quiz to build investment before showing the price. This is the dominant pattern for mobile subscription web funnels.
- For Orime (iOS-first), Blinkist's "Open the app to start your free days" mirrors the constraint that trials must happen in-app. The LP CTA should send users to the App Store with the free framing ("無料プランで始める", start on the free plan).

### Gaps
- Whether any of these pages uses a sticky header or bottom CTA, and how many CTAs per page. Not observable without fetching the live pages.
- Exact button labels on Blinkist and Headway main domains, Speechify, StoryGraph ("Sign up"?), Mem and Rosebud.

## Q3. Social proof: user counts, ratings, testimonials, press logos

### Takeaway
Consumer apps lead with very large user counts and star-rating volume:
- Blinkist: "44 million readers"
- Speechify: "50 million users", "500,000+ five-star reviews"
- Headway: 50M+ downloads, plus an App Store "Editors' Choice" badge

AI tools rely more on credible-persona testimonials and investor or press names. Placement on the page is unverified.

### Cited Findings
- **Blinkist.** The About page says it "connects 44-million readers worldwide". Older pages say about 35 million, and third parties say "over 40 million" — [Blinkist About](https://www.blinkist.com/en/about). Library size is cited inconsistently: "9,000+ nonfiction books and podcasts" in recent sources, 7,500 or 6,500 in older ones — [Shortform review of Blinkist](https://www.shortform.com/blog/hub/product/blinkist-review/); [Fastlancer](https://www.fastlancer.org/en/fastlancer-blog/blinkist-review/).
- **Speechify.**
  - "Trusted by over 50 million users worldwide" and "backed by 500,000+ five-star reviews" (company product page) — [Speechify](https://speechify.com/product-reviews/speechify/).
  - App Store: "526K Ratings 4.7"; the listing claims "top rated TTS app in the AppStore" — [App Store](https://apps.apple.com/us/app/speechify-text-to-speech-pdf/id1209815023).
  - The company newsroom claims "4.8+ star average", which conflicts with the 4.7 on the listing — [Speechify news](https://speechify.com/news/speechify-passes-400000-ratings-in-the-us-app-store/).
- **Headway.** Over 50 million downloads (Wikipedia); "55+ million downloads" elsewhere. An older store listing said "Join over 12 million users!" The parent company claims "170 million users across 170+ countries". The app won an App Store Editors' Choice badge (US, 2023) — [Wikipedia: Headway (app)](https://en.wikipedia.org/wiki/Headway_(app)); [TechSpot store](https://store.techspot.com/sales/headway-two-user-plan-lifetime-subscription).
- **Shortform.** Its authority proof is the writers' credentials ("professional authors, PhD's, and Ivy League graduates"), not user counts — [App Store](https://apps.apple.com/app/id1489472007).
- **Granola.** Referral URLs such as `?referee=Lenny` and `?referee=Popbitch` exist, suggesting influencer and newsletter-referral landing variants. Lenny's Newsletter is a well-known product-manager audience — [granola.ai ?referee=Lenny](https://www.granola.ai/?referee=Lenny); [granola.ai ?referee=Popbitch](https://www.granola.ai/?referee=Popbitch).
- **Rosebud.** Claims it was "built with therapists", drawing on CBT, ACT and IFS, and that therapists increasingly recommend it. It uses funding news ("Raises $6M") as credibility — [Rosebud therapy page](https://www.rosebud.app/therapy-and-coaching); [Rosebud blog](https://www.rosebud.app/blog/rosebud-raises-6m-to-expand-the-worlds-leading-ai-journal).

### Inferences
- **Large numbers are a scale-stage tactic.** A newly launched app such as Orime cannot use them honestly. The available substitutes, with a precedent for each:
  - Expert or creator endorsements (Granola's referral variants).
  - A domain-authority story (Rosebud's "built with therapists", Shortform's "PhDs").
  - The App Store rating once it exists.
- **Numbers conflict across a single brand's own pages** (Speechify 4.7 vs 4.8, Blinkist 35M, 40M and 44M). Any number Orime shows should come from one source and be updated.

### Gaps
- Specific named testimonials (person plus quote) on any of these LPs. None surfaced in search snippets.
- Press-logo bars: which outlets and where on the page.
- StoryGraph user count on the LP.

## Q4. Price presentation

### Takeaway
Reading apps keep the price off the hero and lead with a free period:
- Readwise: 30 days, no card
- Blinkist: 7 days, app-only
- Shortform: 5 days

Price lives on a separate pricing page or in the in-app paywall. Readwise and Shortform present the annual plan as a monthly equivalent. The most-cited pricing-UX innovation is Blinkist's transparent trial timeline.

### Cited Findings
- **Readwise Reader.** "$9.99/month billed annually, or $12.99/month billed monthly". The annual plan is shown as a per-month figure for anchoring — [Readwise Reader pricing](https://readwise.io/pricing/reader). Trial: "free 30-day trial, no credit card required" — [Readwise Reader](https://readwise.io/read).
- **Shortform.** A 5-day free trial with full access, then $24/month or $197/year ("about $16.42/month", per a Feb 2026 third-party review). There is no free tier. Billing complaints are noted: users report being charged after cancelling — [Headway blog review of Shortform](https://makeheadway.com/blog/shortform-review/). (The source is a competitor, so treat the critique cautiously.)
- **Blinkist.**
  - 7-day trial, app-only — [blinkist.com/app-free-trial](https://www.blinkist.com/app-free-trial).
  - One review says continuing after the trial requires committing to an annual plan — [Shortform Hub review](https://www.shortform.com/blog/hub/product/blinkist-review/).
  - A 2026 guide says a permanently free plan exists ("one Blink per day … Blinkist chooses which one"), with a "Free Blink of the Day" page — [Fastlancer](https://www.fastlancer.org/en/fastlancer-blog/blinkist-review/); [Blinkist Daily](https://www.blinkist.com/content/daily).
- **Blinkist's trial-timeline paywall.**
  - The screen shows a day-by-day timeline: full access today, a reminder on day 5, a charge on day 7.
  - Reported effect: "23% increase in trials" and cancellations down 4% (secondary write-ups).
  - Origin: user research found people avoided trials out of "fear of forgetting to cancel". Commentary adds that "33% of all cancellations were happening on Day Zero".
  — [UX Planet (Blinkist author)](https://uxplanet.org/how-solving-our-biggest-customer-complaint-at-blinkist-led-to-a-23-increase-in-conversion-b60ad514134b); [Indie Hackers](https://www.indiehackers.com/post/tip-increase-trial-signups-by-notifying-users-when-their-trials-are-about-to-end-51d2e789bf); [Onboard Me](https://onboardme.substack.com/p/why-most-free-trials-fail-and-how-blinkist-gets-it-right)
  - Counter-evidence: a replication in the Slopes app saw a 7.8% decrease in trial-to-paid among users who requested the notification, and the test was stopped after 2 weeks — [Curtis Herbert, Slopes Diaries #39](https://blog.curtisherbert.com/slopes-diaries-39-risky-business/).
  - Blinkist's newer paywall reportedly drove a "1,200% increase in notification opt-in rate" (secondary) — [B2B Pricing Insights](https://b2bpricinginsights.substack.com/p/4-min-read-how-blinkists-new-paywall).
- **Headway.** The price is revealed only after the quiz ("personalizes your subscription plan"), so it never appears on the first screen — [Headway onboarding](https://makeheadway.com/onboarding/self-growth/landing).
- **Reflect.** "Reflect Open is open source and free on Mac, with paid apps for iPhone and iPad" (paraphrase): the free tier is a whole platform — [reflect.app](https://reflect.app/).

### Inferences
- **Common pattern:**
  - The hero states the free part ("30 days, no card" or "free guide").
  - The pricing page shows annual as a per-month equivalent next to monthly.
  - Reminder and cancellation transparency is used as a trust lever.
- **Orime fit.** Orime already has a "forever free plan" and a 7-day free trial, and Japanese law forbids fake reference prices (二重価格). Two adaptations follow:
  - Show monthly ¥1,480 and annual ¥12,800 with "月あたり約¥1,066" (about ¥1,066 per month).
  - Mirror the Blinkist timeline: "今日：すべて使える → 5日目：お知らせ → 8日目から課金" (today: full access, day 5: reminder, charged from day 8). Before adopting it, check whether App Store trials allow a reliable day-5 reminder (local notification).
- **The evidence on the timeline is mixed.** Treat it as a hypothesis to A/B test, not a guaranteed win.

### Gaps
- Money-back guarantees on any of these LPs. None found; Headway is commonly reported to offer one in its web funnel, but this is unverified.
- Exact Blinkist, Headway and Speechify prices and "per day" framings (e.g. "$0.xx per day"). Not confirmed in this research.

## Q5. Visuals: screenshots vs video vs illustration, demo in the hero

### Takeaway
Little direct evidence was available. The confirmed points: StoryGraph uses a wall of book covers, and Readwise Reader's hero cycles words. Granola's pitch ("listens in the background while you write notes", then "a polished summary, action items, and follow-up drafts") implies a product-demo hero, but that is unverified.

### Cited Findings
- **StoryGraph.** "Hero tagline beside a wall of book covers" (third-party description) — [The StoryGraph](https://thestorygraph.com/).
- **Readwise Reader.** The cached hero fragment ("newsletters RSS reading web highlighting read-it-later") suggests an animated rotating-word headline — [Readwise Reader](https://readwise.io/read).
- **Granola.** The described flow: it listens to computer audio with no bot; you type notes; it then produces a summary, action items and follow-up drafts from your notes plus the transcript — [granola.ai](https://www.granola.ai/); [Layer3 Labs guide](https://www.layer3labs.io/guides/granola-ai).
- **Headway.** A design agency (Ozero) published a case study of a web revamp for Headway (not read in detail) — [Ozero design: Headway](https://www.ozero.design/works/headway).

### Inferences
- Book apps use real book covers as instant category recognition, which gives visual credibility at zero cost. Orime's LP can show the user's own covers inside a consult answer.

### Gaps
- Whether Blinkist, Headway, Granola, Mem or NotebookLM use video in the hero. Not verifiable here.

## Q6. Section order, length and FAQ topics

### Takeaway
Only fragments were found:
- Reflect repeats its headline at top and bottom, giving a bookend CTA structure.
- Headway's web entry is a quiz, not a long-scroll LP.
- Headway's FAQ covers the quiz and the personalised plan.

### Cited Findings
- **Reflect.** "Think better with Reflect" appears near the top and again further down, so the closing section restates the hero — [reflect.app](https://reflect.app/).
- **Headway.** The FAQ explains onboarding: "a short quiz about your goals" leads to "a personalized learning plan" — [Headway FAQ](https://makeheadway.com/faq/). Headway also publishes "Is Headway legit? Look at the cost, reviews, and more (2026)", which answers the cancellation and legitimacy objection on its own blog — [Headway blog](https://makeheadway.com/blog/is-headway-legit/).
- **Blinkist.** Publishes "Blinkist: Your Questions Answered" as a long-form FAQ article — [Blinkist Magazine](https://www.blinkist.com/magazine/posts/blinkist-questions-answered).

### Inferences
- Subscription apps move objection-handling (legitimacy, cancelling, cost) into dedicated SEO pages and FAQs. Orime's FAQ should cover cancellation, what is free forever and data handling.

### Gaps
- Full section order and length for each LP. Not observable without page access.

## Q7. Trust: privacy and AI-data statements

### Takeaway
Privacy is a headline-level message only where the data is intimate:
- Rosebud: journals
- Granola: meeting audio, "without a meeting bot"

Rosebud uses an explicit statement set: encrypted in transit and at rest, anonymised for AI, not used to train AI, not shared with third parties, exportable and deletable, biometric lock.

### Cited Findings
- **Rosebud.**
  - "All journal data is encrypted in transit and at rest."
  - Entries are "anonymized during AI processing" and practices are "HIPAA-aligned".
  - Data is "never used to train AI" and not shared with third parties.
  - Users can export and delete entries.
  - Face ID, Touch ID or PIN lock.
  - Disclaimer: "not a medical app and not a substitute for professional mental health care".
  — [Rosebud therapy page](https://www.rosebud.app/therapy-and-coaching); [App Store](https://apps.apple.com/us/app/rosebud-ai-journal-diary/id6451135127); [Rosebud blog](https://www.rosebud.app/blog/best-journaling-apps-for-adults-in-therapy); [Agent Finder review](https://agent-finder.co/reviews/rosebud)
- **Granola.** "Without a meeting bot" — it uses your computer's audio, so no bot joins the call. A third-party critique notes that meeting participants "may never know software is capturing the conversation" — [granola.ai](https://www.granola.ai/); [Layer3 Labs](https://www.layer3labs.io/guides/granola-ai).
- **Reflect.** Trust through openness: "open-source", "local Markdown files" — [reflect.app](https://reflect.app/).

### Inferences
- Orime's memos are personal reflections, which makes them closer to a journal than to summaries. A compact Rosebud-style trust block fits Orime's actual implementation:
  - Not used to train AI.
  - Only sent when you ask.
  - Export and delete anytime.
  - Photos stay on the device for sharing.
- Before copying any claim, verify it against Orime's privacy policy and AI processors list.

### Gaps
- Privacy and AI statements on Readwise, Mem and NotebookLM LPs. Not retrieved.

## Q8. How AI is described: headline or hidden?

### Takeaway
There is a clear split:
- AI-native products put "AI" in the headline: Granola ("The AI notepad"), Mem ("Your AI Thought Partner"), Glasp ("Build Your AI Clone"), Rosebud ("AI Journal").
- Established reading apps keep AI out of the hero and sell the reading outcome: Readwise, Blinkist ("Powerful ideas"), StoryGraph.
- NotebookLM, the most mainstream AI-knowledge product, also avoids "AI" in its headline: "Understand anything", "your brain's new best friend".

### Cited Findings
- **AI in the headline:**
  - Granola: "The AI notepad for people in back-to-back meetings" — [granola.ai](https://www.granola.ai/?pubDate=20250821)
  - Mem: "Your AI Thought Partner" — [App Store](https://apps.apple.com/us/app/id1578757028)
  - Glasp: "Build Your AI Clone from Highlights & Notes" — [glasp.live](https://glasp.live/)
  - Rosebud: "AI Journal" — [App Store](https://apps.apple.com/us/app/rosebud-ai-journal-diary/id6451135127)
- **AI not in the headline:**
  - NotebookLM: "Understand anything" — [App Store](https://apps.apple.com/app/google-notebooklm/id6737527615)
  - Readwise: "Get the most out of what you read" — [readwise.io](https://readwise.io/)
  - StoryGraph — [thestorygraph.com](https://thestorygraph.com/)
  - Blinkist — [blinkist.com](https://www.blinkist.com/app-free-trial)
- **Reflect** went from "Think better with Reflect" (headline) to "AI native" (positioning copy), keeping AI in the sub-copy — [Reflect blog](https://reflect.app/blog).

### Inferences
- **Orime's closest analogues are Glasp ("AI clone from your highlights") and Mem ("thought partner").** Both describe "AI that answers from your own notes".
- **Recommendation for Orime:** lead with the outcome in human terms, e.g. "読むほど、あなただけの相談相手が育つ" ("the more you read, the more your own advisor grows"). Introduce "AI" in the sub-line together with the differentiator: "あなたのメモを根拠に答える" ("answers based on your notes"), and "ネットの一般論ではなく" ("not generic advice from the internet"). This follows NotebookLM and Readwise, which avoid generic "AI" headlines that blend into a crowded category, while keeping Granola's "defined by absence" sharpness.

### Gaps
- Live 2026 hero copy for Mem and NotebookLM web LPs, and whether Readwise now advertises its "Chat with highlights" AI features on the homepage. Unverified.
