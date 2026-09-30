# 表紙の取得 — 流れと、取れない原因（2026-09-30）

「表紙が取得できない」を直すときに、まずここを読む。

## 1. 流れ（入口 → 解決 → 保存 → 表示）

```
入口                                   解決                                  保存・表示
────────────────────────────────────  ────────────────────────────────────  ─────────────────────────
本を追加（検索結果を選ぶ）App.pickBookFromAdd  検索結果の cover（openBD の summary.cover）  books.cover / cover_isbn
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

| # | 原因 | どこ | 直したか |
|---|---|---|---|
| 1 | サーバーが表紙候補を **1 枚ずつ順番に**確かめ（1 枚 4 秒まで × 6 URL × ISBN 最大 5 件＋楽天・NDL・Google）、関数の時間切れ（504）になる。すると端末は ISBN も候補も受け取れない。NDL・Amazon はデータセンターの IP を弾く／遅いことがあり、毎回タイムアウトまで待つ | api/cover.js `coverFromIsbn` | ✅ 並べて確かめる・全体 9 秒で打ち切って分かった分を返す・`maxDuration` |
| 2 | 端末の `findIsbnCandidates` が、NDL/Google の **失敗（CORS・429・通信断）でも「0 件」を 7 日キャッシュ**する。取り込み 20 冊を同時に解決して Google が 429 → 20 冊とも 7 日間 ISBN なし | src/lib/bookSearch.js | ✅ 失敗は保存しない・本当に 0 件のときだけ 1 日 |
| 3 | 取り込み・クイックスタートで **20 冊を同時に**解決（1 冊あたり外部へ 5〜7 回）→ 429 の嵐 | App.jsx `resolveCoverInBackground` | ✅ 1 本のキュー（coverAutoRetry）に集め、1 冊ずつ |
| 4 | 保存済みの表紙 URL が死んだ（openBD の 404 など）とき、自動の再取得は「表紙が空の本」しか上書きしないので **永久にグラデーションのまま** | coverAutoRetry / App.jsx | ✅ 壊れた URL は差し替えてよい |
| 5 | 本棚のグリッドだけ縦横比 1.35 未満を「壊れた表紙」扱い（確認は 1.05）。正方形寄りの本（ムック・絵本・大型本）は保存されても表示されない | BookCards.jsx | ✅ 判定を 1 つの関数に |
| 6 | Open Library の表紙は archive.org へ転送されるが、CSP `img-src` に archive.org が無く **Web では必ず失敗** | vercel.json | ✅ `https://*.archive.org`・`images-fe.ssl-images-amazon.com` を追加 |
| 7 | 楽天の鍵が無い／`RAKUTEN_APP_URL` が無い → 楽天は黙ってスキップ／403。和書で最も当たる取得元が使えない | 環境変数 | 🔎 `/api/cover?health=1` で確認 |
| 8 | Google Books を鍵なしで Vercel から → 429/403。1 回の解決で最大 3 回叩く | api/cover.js `googleFetchVolumes` | ✅ 429/403 のあと 5 分は叩かない（鍵ありは 1 分）|
| 9 | NDL の古い本（2007 年以前）は ISBN-10 だけ。サーバーは `978…` しか拾わず **書名→ISBN が必ず空** | api/cover.js `extractIsbns` | ✅ ISBN-10 も拾って 13 桁に |
| 10 | 書名から見つけた ISBN を本に保存しない → 毎回書名検索からやり直し・Amazon リンクも書名検索のまま | App.jsx | ✅ 本に ISBN が無いときだけ保存（同じ ISBN の本があれば保存しない） |
| 11 | サーバーの画像確認が「4KB 未満は偽物」の 1 本だけ。小さな本物のサムネを弾き、Google の「No cover」(128×170) は通す | api/cover.js `imageIsReal` | ✅ 画像の縦横を読んで判定（1×1・43 バイトの GIF も弾く） |
| 12 | 表紙が見つからなかった本を、起動のたびに（本棚に出るたびに）外部へ問い合わせ直す | coverAutoRetry | ✅ 「見つからない」は 7 日おいてから（通信の失敗は覚えない・「取り直す」はいつでも） |
| 13 | 英語の書名は `coreTitle` が最初の空白で切るので「The」だけで照合する（誤一致・取りこぼし） | api/cover.js `coreTitle` | ⚠️ 書名照合を直している別の作業に報告済み（ここでは触らない） |

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
