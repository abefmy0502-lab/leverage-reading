# マーケと開発にレバレッジを効かせる仕組み（2026-10-22）

> オーナー「とにかくマーケと開発をレバレッジ効かせられるような仕組みを整えて」。
> **1 ページで全部**。「何が自動で動き、オーナーは週に何分だけ何をするか」を決めた。細かい手順は各ファイルへ。

## 0. 一枚の絵

```
 開発                                        マーケ
 ───────────────────────────                ───────────────────────────
 /feature（作る型）                           土曜 05:47 JST 自動: /mkt-week
   ↓ 既存の部品 → 作る → お試しの入口          ↓ 新しくなったこと＋型＋暦 → 今週の投稿キット
   ↓ SPEC / DESIGN / help / releaseNotes      ↓ company/weekly/<日付>.md（ブランチへ push・通知）
 /ship（出す型）                              オーナー 土曜 3 時間: 読んで直す → 動画を書き出す → 予約
   ↓ vitest → build → 撮影 → ui-critic         ↓ npm run mkt:explainer / mkt:record / mkt:drafts --check
   ↓ 作業ブランチ push → CI（ci.yml）            日曜 1.5 時間: Threads・X・note を予約
   ↓ main push → Vercel（deploy.yml）          平日 15 分: 返信
 releaseNotes の quiet でない項目 ───────────→ 次の土曜の投稿の芯になる
 運営ダッシュボード（売上・粗利・目標・今日の一手）←── 営業タブに週の数字を手入力 → 型を替える
```

**売上が出るまでの関門（App Store・IAP・SQL・env・通知）は `docs/revenue-gates.md` の順番で通す。どこまで通ったかは運営ダッシュボードの「公開の準備」が自動で見せる。**

**開発がマーケの材料を作り、マーケの数字が開発の次の一手を決める。** つなぎ目は 3 つ: `releaseNotes.js`（開発 → マーケ）・`company/weekly/`（マーケの週の記録）・運営ダッシュボード（数字 → 両方）。

## 1. 自動で動くもの（手で思い出さない）

| 仕組み | 何をするか | 置き場 |
|---|---|---|
| **CI** | どのブランチへ push しても テスト（2,000 本超）→ ビルド。赤いうちは main に入れない | `.github/workflows/ci.yml` |
| **配信** | main への push で Vercel に本番配信 | `.github/workflows/deploy.yml` |
| **文書の同期のテスト** | `supabase_*.sql` が CLAUDE.md の表に無い・SKILL.md の形が違う・`mkt:*` が手順書に無い、で赤 | `scripts/docsSync.test.js`・`scripts/sqlBundle.test.js` |
| **編集のあとの一言** | Claude がファイルを触るたびに「次の一手」を 1 行（SQL → まとめを作り直す／画面 → 撮って採点／AI → 同意の送り先 …） | `.claude/settings.json` → `scripts/hooks/post-edit.mjs` |
| **土曜の投稿キット** | 毎週土曜 05:47 JST に新しいセッションが `/mkt-week` を回し、`company/weekly/<日付>.md` を `claude/weekly-posts` ブランチへ push して通知 | スケジュールされたタスク「土曜の投稿キット」（2026-10-22 に作成済み・最初の回は 2026-10-24（土）。claude.ai/code の「スケジュールされたタスク」で止める・直す。作り直すときの頼み方は `.claude/skills/mkt-week/SKILL.md` の末尾） |
| **ui-critic** | 画面の採点（16/20 で合格）。実装した本人の目だけで合格にしない | `.claude/agents/ui-critic.md` |
| **note チーム** | 企画 → 市場 → 構成 → 執筆 → 販売設計 → 管理の 7 役 | `.claude/agents/note-*.md`・`company/note/board.md` |

## 2. 人（と Claude）が毎回使う型

| 合図 | 型 | 中身 |
|---|---|---|
| 「〜を作って」 | `/feature` | 一番の価値に照らす → 既存を探す → 作る → お試しの入口 → 文書 → 撮って採点 → `/ship` → マーケへ渡す |
| 「出して」「push して」 | `/ship` | テスト → ビルド → 文書の同期 → 撮影と採点 → コミット → 両方のブランチへ push → 日本語で報告 |
| 「今週の投稿を作って」 | `/mkt-week` | 新しくなったこと＋3 つの型＋暦 → X 10・Threads 7・Instagram 7・note 1・動画の台本の候補 → `--check` |
| 「note を 1 本」 | `note-henshucho` | 7 役の段取り |

## 3. オーナーの週（合計 約 5 時間 15 分）

| いつ | 何分 | やること | 道具 |
|---|---|---|---|
| 土曜の朝 | 20 | 先週の数字を 1 行ずつ（Instagram・Threads・X・App Store の `ct=`・運営ダッシュボードの営業タブに手入力） | 各インサイト・`/?admin=1` 営業 |
| 土曜 | 160 | `company/weekly/<今週>.md` を読んで直す → `npm run mkt:explainer` / `npm run mkt:record` → スマホで見て直す → Instagram 7 本を予約 | sns-daily-system §4 |
| 日曜 | 90 | Threads 7・X 10 を直して予約 → note を直して予約 | 同 |
| 平日 | 15 × 5 | 朝: 返信（1 時間以内）。夜: 同じ分野の人の投稿 5 件に返信 | — |
| 月に 1 回 | 30 | 運営ダッシュボードの「目標」で道しるべとのずれ・いちばん弱い段階を見て、Claude に「〜を直して」（`/feature`） | `docs/goal-1000.md` |

## 4. 数字で型を替える（勝ち筋）

- 投稿の型は A（動くイラスト・価値）／B（画面の録画・何ができる）／C（保存される一枚）の 3 つ（sns-daily-system §5）。**週ごとに「増やす型」を 1 つ**決め、`company/weekly/<日付>.md` §0 に書く。
- 見る数字は 3 つだけ: 見た人あたりの送信（Instagram）・プロフィールへ → App Store（`ct=`）・有料の人数（運営ダッシュボード）。
- 5 週目から勝った型に寄せる。1 本の当たりを狙わない。

## 5. 足す順（困ってから）

1. 投稿キットの質が足りない → `/mkt-week` の「読むもの」に伸びた投稿の実物（`company/weekly/` の「数字と学び」）を足す。
2. Claude のセッションが遅い → CLAUDE.md の長い段落を `docs/` に移して CLAUDE.md は索引に。
3. 数字の手入力が重い → 運営ダッシュボードの営業タブに Instagram の CSV の取り込み。
4. 有料 150 人 → 紹介の特典（`docs/goal-1000-elements.md` 9-3）。

## 6. 止め方

- 土曜の投稿キット: claude.ai/code の「スケジュールされたタスク」で「土曜の投稿キット」を止める（Claude に「土曜のタスクを止めて」でもよい）。
- 編集のあとの一言: `.claude/settings.json` の `hooks` を消す。
- CI: `.github/workflows/ci.yml` を消す（配信は別なので影響なし）。
