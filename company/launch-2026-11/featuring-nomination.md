# App Store の注目掲載の申請（Featuring Nomination）— そのまま貼る文

> 2026-10-08 作成。正は `company/marketing-strategy-2026-11.md` §4・§5-3。出す日：**10/9（金）まで**（公開 11/17 の 5 週前。Apple は「少なくとも 3 週間前」、編集部は 8〜12 週先を計画しているので、早いほど良い）。
> 出す人：オーナー（App Store Connect →「アプリ」ではなく上の「Featuring」→「Nominations」→「＋」）。

## 0. 字数の上限（Apple のテンプレートで確かめた・2026-10-08）

| 欄 | 上限 | 出したあと |
|---|---|---|
| Nomination Name（名前） | 60 字 | 直せる |
| Nomination Type（種類） | `App Launch` | **直せない** |
| Nomination Description（説明） | **1,000 字** | **直せない**（出す前に読み直す） |
| Helpful Details（補足） | **500 字** | 直せる |
| Supplemental Materials（資料の URL） | 5 個まで | 直せる |
| Related Apps | 10 個まで | 直せない |

出典：App Store Connect ヘルプ「Nominations template」「Nominate your app for featuring」。字数は空白・改行も数える前提で、下の文はどれも上限の内側（Python で数えた値を各見出しの横に書いた。貼ったあと App Store Connect の表示でも確かめる）。

**どちらの言語で出すか（決めたこと）**：説明と補足は**英語版を出す**（申請の画面とテンプレートが英語で、どの国の編集部にも回る）。日本語版は同じ中身の控え（オーナーの確認用・プレス資料と note に流用できる）。日本の編集部向けであることは「Relevant Countries＝JPN」「Localization＝ja」で伝える。日本語で出したい場合は日本語版をそのまま使ってよい（どちらも上限内）。

---

## 1. 欄ごとの入力

| 欄 | 入れるもの |
|---|---|
| Name | `Orime launch — Nov 17, 2026 (Japan)` |
| Nomination Type | `App Launch` |
| Publish Date | Day：**2026-11-17**（予約注文を開いたら、そのまま） |
| Platforms | `iOS (iPhone)` |
| Relevant Countries or Regions | `JPN`（日本だけ） |
| Do you plan to launch in certain markets first? | `Yes`（日本が先） |
| Localization | `ja`（英語のストア情報を足したら `en-US` も） |
| Does this app include a pre-order? | `Yes`（10 月下旬に開く予定。開けなかったら `No` に直す） |
| Do you intend to submit a new In-App Event? | `Yes`（12 月「今年の読書をふり返る」・1 月「読書計画を立てる」） |
| Supplemental Materials | ①LP `https://orime.vercel.app/lp` ②TestFlight の公開リンク（あれば）③スクショ 6 枚を置いた共有フォルダの URL（Google Drive 等・`screenshots/base-*-6.9in-*.png`）④開発の物語の note 記事（10/14 以降に出したもの） |

---

## 2. Description（英語・提出用）— 977 字（上限 1,000）

```
Orime is a Japanese reading-notes app that turns the books you have read into a personal advisor. You save short notes while reading, or import the records you already keep in other reading apps (CSV/HTML exports and Kindle highlights). When you are stuck at work or in life, you describe the problem. Orime answers only from your own notes, shows which book and page each point came from, asks one question back about your situation, and then helps you decide a single next step that goes into your action list with a due date. If none of your notes are relevant, it says so instead of guessing.

What is new: most reading apps stop at recording, and AI summary services answer from other people's summaries. Orime answers from the lines you chose to keep, so the more you read and write, the closer the advice gets to you.

Paper books work too: photograph a page and Orime transcribes it into a note.

Built by one independent developer in Japan, in Japanese from the start.
```

## 3. Helpful Details（英語・提出用）— 428 字（上限 500）

```
Free plan forever: books, notes, review cards, actions and sharing, plus monthly AI consults and page transcription. Paid plan with a 7-day free trial. Built by a solo developer who reads business books but could not use what he read when it mattered. Quiet, text-first design that follows the system text size and dark mode. Photos for sharing are composed on the device. Launch timed for year-end reading reflections in Japan.
```

---

## 4. 日本語版（控え・日本語で出す場合はこちら）

### 説明 — 452 字

```
Orime（オリメ）は、読んだ本を「自分だけの相談相手」に変える日本語の読書メモアプリです。読みながら一行メモを残すか、ほかの読書アプリの書き出しファイルや Kindle のハイライトを取り込むと、それが相談の材料になります。仕事や暮らしで困ったときに「相談」に書くと、Orime はあなたのメモだけを根拠に答え、どの本の何ページから来た考えかを示し、状況を一つ聞き返してから、明日やることを一つ一緒に決めます。決めた行動は期限つきで行動リストに入ります。関係するメモが無いときは、推測で答えず「無い」と伝えます。

新しさ：読書アプリの多くは記録で止まり、AI の要約サービスは他人の要約から答えます。Orime はあなたが選んで残した一行から答えるので、読むほど、書くほど、答えがあなたに近づきます。

紙の本は、ページを撮れば書き起こしてメモにできます。読み終えた本は、写真に書名と心に残った一文を重ねて共有できます（Orime のロゴ入り）。

日本の個人開発者が、はじめから日本語で作りました。
```

### 補足 — 211 字

```
無料プラン（ずっと無料）で、本・メモ・思い出しカード・行動・写真で共有と、毎月の AI の相談・写真から書き起こしが使えます。プランは月額・年額で、月額は最初の 7 日間無料。ビジネス書を読んでも、いざというときに使えなかった開発者が自分のために作りました。文字を主役にした静かな画面で、文字の大きさの変更とダークモードに対応。共有の画像は端末の中で作ります。日本の年末の「今年の読書をふり返る」時期に合わせて公開します。
```

---

## 5. 出す前の確かめ

- [ ] 説明の英文に、効果の断定（"never forget" "guaranteed" 等）・他社名・数字の誇張が無い（Kindle は取り込みの互換の説明だけ）
- [ ] 公開日（11/17）が予約注文・`VITE_FOUNDING_OFFER_END=2026-12-16`・App Store の初回特典の日付と合っている
- [ ] 補足の「follows the system text size」：iPhone の設定で文字を大きくしても崩れないことを TestFlight で確かめてから出す（崩れるなら「that follows the system text size and dark mode」を「with dark mode」に）
- [ ] 出したら、このファイルの末尾に「提出日・Nomination ID」を書き足す
- [ ] In-App Event を作ったら（12 月・1 月）、この申請の「Related In-App Events」に足す（あとから足せる）

## 6. 提出の記録

| 日 | Nomination ID | 種類 | メモ |
|---|---|---|---|
| （オーナーが記入） | | App Launch | |
