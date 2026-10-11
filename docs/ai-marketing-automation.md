# AI で回す SNS の作り方（動画・画像・文）— 週 1 回 60〜90 分

> 2026-10-11 作成（マーケの自動化の担当）。オーナー向けの手順書。
> **訴求の正は `company/marketing-master-plan-2026-10.md`**（軸「読書を、受け身から対話へ」・5 つの柱・客・顔なし・0 円）。言葉は CLAUDE.md の用語の正典と `company/brand-guardrails.md`。
> 中身の文の見本は `company/launch-2026-11/`（`sns-playbook.md`・`x-posts.md`・`short-video-scripts.md`・`instagram-carousels.md`・`calendar.md`）。
> 道具の値段・決まりは 2026-10-11 に調べたもの。変わるので、**「確かめてから」と書いたところは使う前に公式のページを見る**。

---

## 0. 結論

- **0 円で回る。** 動画はこのリポジトリが自動で録る（お試しモードの画面＋字幕＋題＋ロゴ＝縦 1080×1920 の mp4）。文は Claude Code が下書きする。予約は各 SNS の公式の予約機能でする。
- **顔も声も出さない。** 画面の録画と字幕だけで成り立つ。声を入れたいときだけ、合成の声（VOICEVOX など）を任意で足す。
- **自動で投稿はしない。** スクリプトが作るのはファイルだけ。投稿は毎回オーナーが見て、自分の手で予約する。
- 週の作業は **ネタ → 文 → 画面の録画 → 字幕 → 画像 → 確かめる → 予約投稿 → 数字を見る** の 8 段（§3 の表）。

| 作るもの | 0 円の道具 | 出てくるもの |
|---|---|---|
| 縦の動画（15〜40 秒） | `npm run mkt:record`（Playwright＋ffmpeg） | `marketing-out/videos/<日付>/<台本>/final.mp4`・`captions.srt`・`cover.jpg` |
| 文（X・説明欄・ナレーション・note の構成） | `npm run mkt:drafts` → Claude Code | `marketing-out/drafts/<日付>/prompt.md`（＋鍵があれば `drafts.md`） |
| 画像（共有の 1 枚・アプリの画面） | `node scripts/share-images.mjs`・`npm run ui:shots`・`npm run lp:shots` | `ui-shots/…`・`public/lp/*.webp` |
| カルーセル | Canva の無料プラン（任意） | `instagram-carousels.md` の文をのせた画像 |
| 予約 | 各 SNS の公式の予約（Meta Business Suite・X の Web・TikTok Studio・YouTube Studio） | — |

---

## 1. 守ること（毎回・全部）

### 1-1. 言い方
- **「著者と話せる」と言わない。** 言えるのは「本の語り口で（AI が）答える」「本と対話する」まで（master-plan §0）。アプリの答えにも「（本の語り口で・AI）」「AI が本とあなたのメモから語り口をまねた答えです」と出ている。字幕・説明欄でも同じ。
- 立証できない数字・効果の言い切り（必ず・No.1・忘れない・9 割）、「先着」「通常価格」「期間限定」、「AI 要約」は使わない（brand-guardrails・master-plan §3）。
- 下書きを確かめる道具：`npm run mkt:drafts -- --check <文書.md>`（使わない言い方のある行を出す。完全ではないので、最後は目で読む）。

### 1-2. 本の表紙・著者の写真・書名（著作権・肖像）
- **動画・画像に映す表紙は、アプリが作った色の表紙だけ**（お試しモードの本は全部これ）。本物の表紙の画像・著者の写真は使わない。出版社の書影・著者の写真には著作権・肖像の権利があり、宣伝に使うと許しが要る。
- **書名は出してよい**（書名そのものに著作権は無い）。ただし「この本・著者がすすめている」と読める書き方をしない。説明欄に「画面はアプリの実際の動き（サンプルのデータ）です。本の著者・出版社とは関係ありません。」を入れる（`mkt:drafts` の下書きにも入る）。
- **実在の著者名は動画に映さない。** 1 冊に相談する動画（`consult-book`）は、名前の行の著者名を録画の間だけ書名に置きかえる（台本の `redact`）。新しい台本で本の語り口を映すときも `redact` を付ける。
- 画面のメモは自分の言葉（短い要約）にする。本の文を長く写した画面は映さない。

### 1-3. 実在の人の声・顔を AI で作らない
- 著者・有名人・利用者・オーナー自身の顔や声を AI で作らない・まねさせない（声のクローン機能は使わない）。ナレーションは、だれの声でもない合成の声だけ。
- 利用者の声（レビュー・感想）を作らない。載せるのは本人の明示の許しがある言葉だけ（brand-guardrails 3）。

### 1-4. 各 SNS の AI の印（ラベル）
| 場所 | 決まり（要点） | この動画で付けるか |
|---|---|---|
| YouTube | 本物と見間違う人・場所・出来事・声を合成・加工したときは、アップロードの「改変または合成されたコンテンツ」で「はい」。台本・字幕・アイデアに AI を使っただけなら不要。[YouTube 公式ブログ](https://blog.youtube/news-and-events/disclosing-ai-generated-content) | 画面の録画＋字幕だけなら不要。**合成の声のナレーションを入れたら「はい」にする**（本物の人の声と取られないように） |
| TikTok | 本物に見える AI の画像・音声・動画には AI の印（「AI 生成」のラベル・ステッカー・説明欄）を付ける。[TikTok の発表（AP）](https://newschannel9.com/news/nation-world/tiktok-answer-social-media-video-growing-amount-technology-universal-artificial-intelligence-ai-generated-content-label) | 合成の声を入れたら「AI 生成コンテンツ」をオンに |
| Instagram・Facebook（Meta） | 本物らしい動画・音声を AI で作ったり変えたりしたときは、投稿の「AI 情報」のラベルを付ける。[NPR（Meta の発表）](https://www.npr.org/2024/02/06/1229317971/meta-labeling-ai-generated-images-instagram-facebook-artificial-intelligence) | 合成の声を入れたら付ける |
| X | 誤解を招く合成・加工のメディアを禁じている（専用のラベルの欄は無い）。確かめてから | 説明に「ナレーションは合成音声です」と書く |

- 決まりは変わる（上の出典は 2024 年の発表）。**確かめてから**：各 SNS のヘルプの「AI 生成コンテンツ」のページ。
- 迷ったら付ける。付けても見られにくくはならない（YouTube はそう書いている）。
- アプリの中身が AI であることは、画面（「（本の語り口で・AI）」「AI の回答には誤りが含まれることがあります」）と説明欄で分かるようにする。

### 1-5. ステマ規制（景品表示法・2023-10-01 から）
- 事業者が関わった表示なのに、広告と分からないものは違反（令和 5 年内閣府告示第 19 号）。[解説（data-max）](https://data-max.co.jp/article/62920) / 原文は消費者庁のページで**確かめてから**。
- Orime のアカウントの投稿は運営者の投稿だと分かるように（プロフィールに「Orime の開発者（個人）」）。
- **協業・オファーコードを渡した相手**には、投稿の最初に「PR」「#提供」を書いてもらう（brand-guardrails 2・`partner-outreach.md`）。知り合いに頼んで印なしで紹介してもらうのもだめ。

### 1-6. 自動で投稿しない
- スクリプトは投稿しない（API で SNS に書き込むコードは無い）。予約も毎回オーナーが画面で確かめてからする。
- 理由：言い方・映り込みの間違いを人の目で止めるため。X の API の自動投稿は有料・制限も多い。

---

## 2. 道具と費用

### 2-1. 0 円の構成（これだけで回る）
| 段 | 道具 | 費用 | 日本語 |
|---|---|---|---|
| 動画を録る・字幕・題・ロゴ | このリポジトリ `npm run mkt:record`（Playwright・`ffmpeg-static`） | 0 円 | ○ |
| 文の下書き | Claude Code（このリポジトリで `claude`）・`.claude/agents/note-*`・`npm run mkt:drafts` | 0 円（いまの Claude の契約の中） | ○ |
| 画像 | `scripts/share-images.mjs`（写真で共有の画像）・`npm run ui:shots`・`npm run lp:shots` | 0 円 | ○ |
| 予約 | Instagram／Facebook＝Meta Business Suite・X＝x.com の投稿欄の予約・TikTok＝TikTok Studio（PC）・YouTube＝YouTube Studio の「予約」 | 0 円 | ○ |
| 数字 | 各 SNS の分析（インサイト・アナリティクス）・App Store Connect の `ct=`・LP の `lp_events` | 0 円 | ○ |

予約の細かい条件（確かめてから）：
- X：Web の投稿欄のカレンダーの印から予約できる（無料）。スマホのアプリの予約は対応が分かれている。[解説](https://roboin.io/article/2026/02/01/schedule-posts-from-x-mobile-app)
- TikTok：PC から予約。先の日数と、ビジネスアカウントが要るかは記事によって違う（10〜30 日）。[解説](https://www.sungrove.co.jp/tiktok-scheduled-post/)
- YouTube ショート：YouTube Studio のアップロードで「公開設定 → スケジュールを設定」。
- Instagram：Meta Business Suite の「投稿を作成 → 日時を指定」。

### 2-2. 任意（入れなくても回る）
| 道具 | 何に | 費用（確かめてから） | 注意 |
|---|---|---|---|
| CapCut（無料版） | 字幕の見た目を変える・BGM・つなぐ | 0 円（有料版あり） | 動画は字幕を焼き込み済みなので要らない。素の画面で録って（`--plain`）CapCut で字幕を付けるときだけ。商用での素材・曲の扱いは規約を**確かめてから**。BGM は各 SNS の中の曲を使う |
| VOICEVOX | 合成の声のナレーション | 0 円 | **声ごとに規約が違う**。多くは「VOICEVOX:キャラ名」のクレジットを説明欄に書けば商用可。会社が関わる利用に事前の確認が要る声もある。[エンジンの説明](https://hub.docker.com/r/voicevox/voicevox_engine) で確かめてから。入れたら §1-4 の AI の印 |
| Canva（無料プラン） | カルーセル・note の見出しの画像 | 0 円（Pro は有料） | AI の画像生成で人の顔・本の表紙を作らない |
| Buffer（無料プラン） | 複数の SNS をまとめて予約 | 0 円で 3 つの場所・1 か所 10 件まで（[解説](https://napoleoncat.com/blog/buffer-pricing/)） | 公式の予約で足りる。入れるなら X・Instagram・TikTok の 3 つ |
| Claude API の鍵（`ANTHROPIC_API_KEY`） | `npm run mkt:drafts` が直接下書きを作る | 安いモデルで 1 回およそ 1〜2 円の見込み。鍵を作るには前払いのクレジットが要る（確かめてから） | 無くても prompt.md を Claude Code に貼れば同じ。鍵はリポジトリに書かない（`.env.local` は git 管理外） |

**有料の広告と、有料の AI 動画・声のサービスは使わない**（master-plan §5・§8）。

---

## 3. 毎週の流れ（60〜90 分・1 週間分）

| # | 段 | 何をする | 時間 | 出てくるもの |
|---|---|---|---|---|
| 1 | ネタ | `calendar.md` のその週の行を見る → `npm run mkt:drafts` | 5 分 | `prompt.md`（＋`drafts.md`） |
| 2 | 文 | Claude Code に「`marketing-out/drafts/<日付>/prompt.md` のとおりに下書きして」。note は `note-henshucho` → `note-kosei` → `note-shippitsu`。直す | 20 分 | X 5 本・説明欄・ナレーション・note の構成 |
| 3 | 画面の録画 | 別の端末で `npm run demo` → `npm run mkt:record`（全部で 5〜8 分、待つだけ） | 10 分 | `final.mp4` × 台本の数 |
| 4 | 字幕 | `cover.jpg` と mp4 を見て、字幕が画面と合っているか。合わなければ `scenarios.mjs` の `say` を直して録り直す | 5 分 | — |
| 5 | 画像 | 共有の画像（`node scripts/share-images.mjs`）・カルーセル（Canva） | 10 分 | 画像 2〜4 枚 |
| 6 | 確かめる | 下の「投稿前の 8 つ」。`npm run mkt:drafts -- --check 直した文.md` | 10 分 | — |
| 7 | 予約投稿 | §2-1 の公式の予約で 1 週間分。動画は同じ 1 本を Instagram リール・TikTok・YouTube ショートへ | 15 分 | 予約済み |
| 8 | 数字を見る | 先週の投稿の「最後まで見た率」「保存」「プロフィールのクリック」と App Store Connect の `ct=` を `marketing-strategy-2026-11.md` §7 の表に書く。伸びた型だけ増やす | 10 分 | 週の表 |

**投稿前の 8 つ**
1. 「著者と話せる」「必ず」などの言い方を使わない（§1-1）。
2. 本物の表紙・著者の写真・実在の著者名が映っていない（§1-2）。
3. 「（お試しモードの応答です…）」・`localhost`・ブラウザの枠が映っていない（録画のスクリプトが自動で隠す。目でも見る）。
4. 字幕が画面の文と合っている（お試しの答えは決まった文）。
5. 料金・無料の書き方が「無料プラン（ずっと無料）」「7 日間無料」だけ。動画には料金を入れない。
6. 合成の声を入れたら AI の印を付けた（§1-4）。VOICEVOX はクレジットを書いた。
7. 協業の投稿は「PR」「#提供」が最初にある（§1-5）。
8. リンクは `ct=`（どこから来たか）付き（`sns-playbook.md`）。

---

## 4. 動画の自動録画（scripts/marketing/）

### 4-1. 使い方
```bash
npm run demo                      # 1 つめの端末（http://localhost:5173・データはサンプル）
npm run mkt:record                # 2 つめの端末：台本を全部録る
npm run mkt:record -- consult-book focus-mode   # 名前で絞る
npm run mkt:record -- --theme dark              # 暗い画面で
npm run mkt:record -- --plain                   # 字幕と題を焼き込まない（CapCut で付けるとき）
npm run mkt:record -- --file my-scenarios.json  # JSON の台本を足す
```
- ポートを変えるとき：`MKT_BASE_URL=http://localhost:5471 npm run mkt:record`。ブラウザは `PW_EXE` → `/opt/pw-browsers/chromium` → インストール済みの Chrome（`ui-shots.mjs` と同じ）。
- 出力：`marketing-out/videos/<日付>/<台本>/` に `final.mp4`（H.264・30fps・1080×1920・無音の音声トラックつき＝どの SNS でも読める）・`captions.srt`（mp4 の時間に合わせた字幕）・`cover.jpg`（表紙用・題が出ている 1 秒目）・`raw.webm`・`meta.json`。
- ffmpeg は `FFMPEG` → npm の `ffmpeg-static`（入れてある）→ PATH の順に探す。無いときは `captions.srt` だけ書き、CapCut での手順を表示する（`raw.webm` を読み込む → 「テキスト → 字幕を読み込む」で srt → 頭の読み込み中を切る → 1080p・30fps で書き出し）。

### 4-2. いまの台本（`scripts/marketing/scenarios.mjs`）
| 名前 | 柱 | 題（最初の 2 秒） | 中身 |
|---|---|---|---|
| `consult-book` | 本と対話 | 読んだ本と、対話しよう。 | 本の詳細 →「この本に相談する」→ 本の語り口の答え（「本の語り口で・AI」）→ 聞き返し → 行動 →「根拠を見る」で本とページ |
| `consult-answer` | 本と対話 | その答え、前に読んだ本に書いてありました。 | すべての本に相談 → 聞き返し → 答えと行動 → 根拠 →「行動に追加」 |
| `memo-to-consult` | 本と対話 | 読みながら残した一行が、あとで相談の根拠になる | メモを書く → 相談 → そのメモが根拠に並ぶ |
| `focus-mode` | 習慣 | 時間を決めて、集中して読む | 「読む」→ 30 分 →「はじめる」→ 読みながらメモ →（時計を 30 分進める）→「おわる」→「今日 N 分 読みました」 |
| `record-fields` | 客観視 | 自分の読書を、客観的に見る | 記録の「読書の時間」→「分野」→ まだ本がない分野 → AI 選書 |
| `share-magazine` | 発信 | 心に残った一文を、雑誌の 1 ページに | 写真で共有 → 雑誌 → ストーリーの形 |

### 4-3. 台本を足す
- `scenarios.mjs` の配列に 1 本足すか、同じ形の JSON を `--file` で読む。書き方はファイルの頭（`say`・`tap`・`type`・`waitFor`・`scrollTo`・`fastForward`・`goto`・`redact` など）。
- セレクタはアプリの中のボタンの名前（`aria-label`）か文字で書く（`scripts/ui-shots.mjs` と同じ）。お試しモードの URL（`?demo=…`・`&focus=…`・`&today=…`）で場面を作れる（CLAUDE.md の「お試しモード」）。
- 字幕は 1 つ 20 字くらいまで・2 行まで。1 本 15〜40 秒。言葉は用語の正典。
- 足したら 1 回録って、`cover.jpg` と mp4 を見る。`npx vitest run scripts/marketing` が台本の形と言い方を確かめる。

### 4-4. 仕組み（直すとき）
- 1080×1920 の「舞台」のページの中に、iPhone の幅（390×693）のアプリを置いて 2.1 倍にする（文字がくっきり・見た目は本物と同じ）。上の帯に字幕、最初の 2 秒は題、下に Orime のロゴ。色と書体は `src/styles/tokens.css`。
- 録画の間だけ、アプリの中の「（お試しモードの応答です…）」を隠し、`redact` の文字を置きかえる（アプリのコードは変えない）。
- 時間の経過は `fastForward`（アプリの時計を進める）で作る。集中モードの 30 分は一瞬で終わる。`goto`（別のお試しの場面に切り替え）は裏で読み込んでから差し替えるので白い画面は映らないが、読み込みの間は前の画面のまま待つ。
- 重い場面があると、録画の時間が台本の時計より少し（1 秒くらい）ずれる。字幕は画面に焼き込んであるので動画はずれない。`captions.srt` を CapCut で使うときは、目で合わせる。

---

## 5. 文の自動下書き（`npm run mkt:drafts`）

- 材料：その週の「新しくなったこと」（`src/lib/releaseNotes.js`）・master-plan・brand-guardrails・`sns-playbook.md`・`x-posts.md`・`short-video-scripts.md`・台本の題と字幕。
- 出すもの：X 5 本・動画ごとの説明欄（Instagram・TikTok・YouTube）・AI のナレーション（任意）・note 1 本の構成・投稿前に確かめること。
- **鍵が無いとき（0 円）**：`marketing-out/drafts/<日付>/prompt.md` だけ。Claude Code で「このファイルのとおりに下書きして、`company/launch-2026-11/` の言い方に合わせて」と頼む。
- **鍵があるとき**：`ANTHROPIC_API_KEY=… npm run mkt:drafts` で `drafts.md` もできる（安いモデル・`MKT_MODEL` で変えられる）。最後に言い方の確かめ（§1-1）の結果を出す。
- `--days 14`（2 週間分の「新しくなったこと」）・`--dry`（API を呼ばない）・`--check 文書.md`（言い方だけ確かめる）。
- note は `.claude/agents/note-*`（企画 → 構成 → 執筆 → 販売設計）。下書きの置き場は `company/note/`。

---

## 6. 画像
- **写真で共有の 1 枚**：`npm run demo` → `node scripts/share-images.mjs`（重ね方 × 形 × 地。雑誌は `node scripts/share-images.mjs ui-shots/share-magazine/images magazine-`）。ロゴはいつも入る。月末は「#◯月読了本」、12 月は「今年の読書」。
- **アプリの画面**：`npm run ui:shots -- <ラベル> <画面名…>`（明暗）・LP の写真は `npm run lp:shots`。
- **カルーセル**：`instagram-carousels.md` の文を Canva の無料のテンプレートに。画面の画像は上の 2 つから。
- **AI の画像生成は使わなくてよい。** 使うなら、模様・色の背景だけ。人の顔・手・本の表紙・実在の場所は作らない。本物らしい画像を作ったら §1-4 の AI の印。

---

## 7. 最初の 1 回の始め方（30 分）
1. `npm install`（`ffmpeg-static` と `@anthropic-ai/sdk` が入る）。
2. 1 つめの端末で `npm run demo`。
3. 2 つめの端末で `npm run mkt:record -- consult-book`（2 分くらい）→ `marketing-out/videos/<今日>/consult-book/final.mp4` を開いて見る。
4. 良ければ `npm run mkt:record`（全部）。
5. `npm run mkt:drafts` → できた `prompt.md` を Claude Code に渡して下書き → 直す。
6. §3 の「投稿前の 8 つ」を通して、Instagram リール・TikTok・YouTube ショートに `consult-book` を 1 本予約。説明欄に「画面はアプリの実際の動き（サンプルのデータ）です。本の著者・出版社とは関係ありません。」。
7. 1 週間後に §3 の 8 段目（数字）。

---

## 8. 出典（2026-10-11 に調べた・変わるので使う前に確かめる）
- YouTube：[How we're helping creators disclose altered or synthetic content](https://blog.youtube/news-and-events/disclosing-ai-generated-content)
- TikTok：[TikTok's answer to the growing amount AI-generated content: Label it](https://newschannel9.com/news/nation-world/tiktok-answer-social-media-video-growing-amount-technology-universal-artificial-intelligence-ai-generated-content-label)
- Meta：[Meta will start labeling AI-generated images on Instagram and Facebook（NPR）](https://www.npr.org/2024/02/06/1229317971/meta-labeling-ai-generated-images-instagram-facebook-artificial-intelligence)
- ステマ規制：[ステマ規制を告示 10月1日から取り締まりの対象に（data-max）](https://data-max.co.jp/article/62920)・消費者庁「令和 5 年内閣府告示第 19 号」
- VOICEVOX：[voicevox_engine（Docker Hub）](https://hub.docker.com/r/voicevox/voicevox_engine)・各キャラクターの利用規約（VOICEVOX 公式サイト）
- Buffer：[Buffer Pricing（NapoleonCat）](https://napoleoncat.com/blog/buffer-pricing/)
- X の予約：[roboin.io](https://roboin.io/article/2026/02/01/schedule-posts-from-x-mobile-app)
- TikTok の予約：[sungrove.co.jp](https://www.sungrove.co.jp/tiktok-scheduled-post/)
