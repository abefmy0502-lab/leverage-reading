# 表紙の取得 — 流れと、取れない原因（2026-09-30）

「表紙が取得できない」を直すときに、まずここを読む。本の検索（本を追加の検索欄・`/api/cover?search=`）は `docs/book-search.md`。

## 1. 流れ（入口 → 解決 → 保存 → 表示）

```
入口                                   解決                                  保存・表示
────────────────────────────────────  ────────────────────────────────────  ─────────────────────────
本を追加（検索結果を選ぶ）App.pickBookFromAdd  検索結果の cover（楽天・Google・openBD・2026-10-02〜 book-search.md）  books.cover / cover_isbn
  └ 表紙が無い → findIsbnCandidates → resolveCoverFromCandidates（端末）
本を手で追加して保存 App.handleSave         findIsbnCandidates → resolveCoverFromCandidates（端末）
初日クイックスタート / 取り込み / AI 選書 / 関連書籍  resolveCoverInBackground（保存のあと・裏で）
本棚の表紙が出ない（BookCoverCard / MiniCover）   coverAutoRetry.enqueueCoverRetry（裏で・順番に）
「表紙を取り直す」App.refreshCoverFor         手動（トースト付き）
「表紙が違う？」CoverFixModal               findIsbnCandidatesWithMetadata → tryCoverForIsbn（候補を並べる）
AI 選書のカード（BookAdvisor.verifyAndEnrich）   verifyBookExists（/api/cover）→ candidates を <img> で確認
起動時 backfillCovers（1 回だけ・v4）          findIsbnCandidates → resolveCoverFromCandidates
```

### サーバー `/api/cover`（api/cover.js・api/_coverSources.js）

入力 `title` / `author` / `isbn` → 出力 `{ cover, isbn, candidates }`。

1. ISBN があり、NDL で書名が合う（`isbnTitleMatches`）→ その ISBN の表紙を先に探す（**違う版の表紙より、登録した ISBN の表紙が先**）
2. 楽天ブックス（`RAKUTEN_APPLICATION_ID` + `RAKUTEN_ACCESS_KEY` + `RAKUTEN_APP_URL`）
3. NDL OpenSearch で 書名＋著者 → ISBN（書名が一致する項目だけ）
4. Google Books（`GOOGLE_BOOKS_API_KEY` があれば。無いと Vercel の共有 IP から 429 になりやすい）
5. ISBN が決まれば、鍵の要らない表紙の URL を `candidates` として返す（端末の `<img>` で最終確認）:
   openBD（API の summary.cover）→ NDL 書影 `https://ndlsearch.ndl.go.jp/thumbnail/{ISBN13}.jpg` → openBD の直リンク →
   Google の ISBN 直リンク → Amazon `images-na.ssl-images-amazon.com/images/P/{ISBN10}.09.LZZZZZZZ.jpg` → m.media-amazon → Open Library

### 端末（src/lib/bookCover.js・bookSearch.js・coverAutoRetry.js）

- `resolveCoverViaServer` → サーバーの cover と candidates を `<img>` で確かめる（`checkImageExists`: 50px 未満・横長のプレースホルダーを弾く）
- 端末だけの経路: `findCoverFromGoogleBooks`（Google の thumbnail）/ `findIsbnCandidates`（NDL + Google で ISBN 候補）→ `getCoverCandidates`
- 表示: `BookCoverCard` / `MiniCover` が onLoad で 1×1 やプレースホルダーを弾き、出ないときは `coverAutoRetry` に積む

## 2. 取れない原因（見つけたもの・起こりやすい順）

本番（2026-09-30）ではサーバーは正しく答えていた（`/api/cover?title=プレイングマネジャー 「残業ゼロ」の仕事術&author=小室淑恵` → 楽天の表紙と ISBN 9784478102923）。
なので「本棚に表紙が出ない」の主因は **端末側（確かめ方・保存・探し直しの条件）**。

| # | 原因 | どこ | 直したか |
|---|---|---|---|
| 1 | 表紙の無い本を **探し直す機会が無い**。起動時の backfill は端末ごとに 1 回きり（v4 のフラグ）・端末だけで探す（NDL の CORS・Google の 429）。自動の再取得は「すべての本」の表紙に出たときだけで、ホームの「いま読んでいる本」には無い | backfillCovers.js / HomeScreen.jsx | ✅ backfill v5: 表紙が空の本を 1 日 1 回サーバーで探し直して保存（ISBN も）。ホームでも探す |
| 2 | 楽天の表紙（`?_ex=420x420`）が正方形で返ると、確認（縦/横 1.05）と本棚（1.35）で **偽物扱い**。本棚のグリッドは確認より厳しく、確認を通って保存された正方形寄りの表紙・自分で撮った写真も隠していた | bookCover.js / BookCards.jsx | ✅ `isCoverLikeSize` を確認・本棚・サーバーで共有。無い本を 404/1×1/noimage で返す配信元（楽天・openBD・Amazon・Open Library・Supabase）は形を問わない |
| 3 | 保存済みの表紙 URL が読めない（openBD の 404・検索から選んだ本に入れた **確かめていない NDL の URL**）と、自動の再取得は「表紙が空の本」しか上書きしないので **永久にグラデーションのまま** | App.jsx `pickBookFromAdd` / coverAutoRetry | ✅ 確かめていない URL は入れない・読めない URL（brokenCover）は差し替えてよい |
| 4 | 起動時の backfill v4 は、探せなかった本の NDL の書影 URL を「壊れた印」とみなして **消していた**（いまはサーバーが確かめて返す正しい表紙）。新しい端末でログインすると表紙が消える | backfillCovers.js | ✅ v5 は今ある表紙を消さない |
| 5 | iOS アプリ: `/api/cover` の CORS をオリジンごとに返していたので、Web で CDN にキャッシュされた「CORS なし」の応答がアプリにも返り得る | api/cover.js | ✅ 全員に `Access-Control-Allow-Origin: *`（`api/cover-image.js` と同じ） |
| 6 | 本を手で入力して保存するとき・検索から選んだときは **端末だけ**で探していた（サーバーを使わない） | App.jsx `handleSave` / `pickBookFromAdd` | ✅ `resolveCoverForBook`（サーバー → 端末）にそろえた。保存は 8 秒で打ち切り、残りは裏で |
| 7 | 端末の `findIsbnCandidates` が、NDL/Google の **失敗（CORS・429・通信断）でも「0 件」を 7 日キャッシュ**する | src/lib/bookSearch.js | ✅ 失敗は保存しない・本当に 0 件のときだけ 1 日 |
| 8 | 取り込み・クイックスタートで **20 冊を同時に**解決（1 冊あたり外部へ 5〜7 回）→ 429 の嵐 → 7 と重なって 20 冊とも ISBN なし | App.jsx `resolveCoverInBackground` | ✅ 1 本のキュー（coverAutoRetry）に集め、1 冊ずつ |
| 9 | サーバーが表紙候補を **1 枚ずつ順番に**確かめる（1 枚 4 秒 × 6 URL × ISBN 最大 5 件）→ 遅い本は関数の時間切れ（504）で ISBN も候補も返せない。端末も候補を 1 枚 5 秒ずつ順番に | api/cover.js / bookCover.js | ✅ 同時に確かめる・サーバーは全体 9 秒で打ち切り・`maxDuration` 20 |
| 10 | 書名から見つけた ISBN を本に保存しない → 毎回書名検索からやり直し | App.jsx | ✅ 本に ISBN が無いときだけ保存（同じ ISBN の本があれば付けない）。本の ISBN は上書きしない |
| 11 | Open Library の表紙は archive.org へ転送されるが、CSP `img-src` に archive.org が無く **Web では必ず失敗** | vercel.json | ✅ `https://*.archive.org`・`images-fe.ssl-images-amazon.com` を追加 |
| 12 | ありふれた核タイトル（『プレイングマネジャー 「残業ゼロ」の仕事術』→「プレイングマネジャー」）で、核だけ一致する兄弟本を採り得る | api/cover.js | ✅ 副題まで一致する項目を先に（`titleTier`）。楽天で目当ての本に表紙が無いときは兄弟本の表紙で代用しない |
| 13 | NDL の古い本（2007 年以前）は ISBN-10 だけ。サーバーは `978…` しか拾わず書名→ISBN が空 | api/cover.js `extractIsbns` | ✅ ISBN-10 も拾って 13 桁に |
| 14 | サーバーの画像確認が「4KB 未満は偽物」の 1 本だけ。小さな本物を弾き、Google の「No cover」(128×170) は通す | api/_coverSources.js | ✅ 画像の縦横を読んで判定（1×1・43 バイトの GIF も弾く） |
| 15 | Google Books を鍵なしで Vercel から → 429/403。1 回の解決で最大 3 回叩く | api/cover.js | ✅ 429/403 のあと 5 分は叩かない（鍵ありは 1 分） |
| 16 | 楽天の鍵・`RAKUTEN_APP_URL` が無い → 楽天は黙ってスキップ／403 | 環境変数 | 🔎 `/api/cover?health=1`（本番は設定済み） |
| 17 | 表紙が見つからなかった本を、表示のたびに外部へ問い合わせ直す | coverAutoRetry | ✅ 「見つからない」は 7 日おく（通信の失敗は覚えない・「取り直す」はいつでも） |
| 18 | 英語の書名は `coreTitle` が最初の空白で切るので「The」だけで照合する | api/cover.js `coreTitle` | ⚠️ 未対応（書名照合の担当に報告） |

**アプリ側（1〜4・6〜8・10・17）は iOS アプリの出し直しで届く。** サーバー側（5・9・11〜15）は Vercel の公開ですぐ効く。

## 3. 本番で確かめる

`https://orime.vercel.app/api/cover?health=1` を開いて、出た JSON をそのまま貼る。中身は真偽と HTTP の番号だけ（鍵・利用者の情報は出ない）。

| 項目 | 意味 | 期待 |
|---|---|---|
| `rakutenConfigured` | 楽天の 2 つの鍵が入っている | true |
| `rakutenRefererSet` | `RAKUTEN_APP_URL` が入っている | true |
| `googleKeySet` | `GOOGLE_BOOKS_API_KEY` が入っている | true が望ましい |
| `sources.<名前>.status` / `found` | 決まった本（ISBN 9784862760852）で、各取得元が返した HTTP の番号と、表紙（や ISBN）が見つかったか | 多くが 200 / true |

- `rakuten.status` が 403 → `RAKUTEN_APP_URL` と楽天の「許可された Web サイト」が合っていない。400 → 鍵のどちらかが違う
- `google.status` が 429 → `GOOGLE_BOOKS_API_KEY` を入れる
- `ndlThumb` / `amazon` が 403・0（時間切れ）→ サーバーからは弾かれているだけ。端末（ブラウザ）からは読めるので、`candidates` で表紙は付く
- 結果は 5 分キャッシュされる
