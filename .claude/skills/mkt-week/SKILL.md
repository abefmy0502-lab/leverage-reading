---
name: mkt-week
description: 今週の投稿キット（X 10 本・Threads 7 本・Instagram 3 本・TikTok 2〜3 本・note 1 本）を、SNS の正（sns-strategy）と場ごとの勝ち筋（sns-playbooks）から下書きし、場ごとの機械の点検を通して company/weekly/<日付>.md に置く。土曜の朝の決まった仕事。「/mkt-week」「今週の投稿を作って」と言われたら使う。
---

# /mkt-week — 今週の投稿キット（2026-10-22・マーケのレバレッジ）

作るのはファイル 1 つ＋**投稿の予約**（2026-11-08 オーナー「投稿の文章や画像の作成も自動で・計画どおり投稿も」）。ファイルは土曜にオーナーが読んで直せる。予約は「orime」の運営の道具 `ops_post`（`node scripts/ops-mcp.mjs ops_post '{"action":"add",…}'`）に入れ、毎時の自動のセッションが時刻の来たものを出す（`docs/mcp.md` §7）。鍵の無い送り先（`ops_post status` で「なし」）は予約せず、ファイルに残すだけ（オーナーが手で出す）。画像は `ops_image`（ChatGPT と同じ画像の仕組み・Instagram は必須・X と Threads は週に 2〜3 本だけ）。予約の時刻は **月曜から**（土曜と日曜はオーナーが直す時間）・`company/sns-daily-system-2026-10.md` §3 の曜日と時刻。直したいときはダッシュボードの横で「火曜の X の投稿を直して」「水曜の Instagram を取り消して」。

## 読むもの（この順・全部）
> 2026-11-23 に読む順を今の正に合わせた。前の正（`marketing-master-plan-2026-10.md`・`sns-daily-system-2026-10.md`）とぶつかるときは、下の 1・2 を優先する。
1. **`company/sns-strategy-2026-11-22.md`**（SNS の正: 目的は入手・誰に＝入口 A/B/C・1 本は「ビフォー → きっかけ（機能 1 つ）→ アフター → 入手への道」・§3-3 の 4 週で回す機能・§4 の場ごとの頻度）
2. **`company/sns-playbooks-2026-11.md`**（場ごとの勝ち筋と機械の点検: X＝会話を起こす・本文にリンクなし・1 行目 25 字・ハッシュタグ 0／Threads＝問い・トピック 1 つ／Instagram＝送りたくなる 1 枚・ハッシュタグ 3〜5（上限 5）／TikTok＝1 秒目のビフォー・「orime」の検索の言葉／note＝題 15〜25 字・見出し画像・できないこと）
3. `company/lp-axis-2026-11-15.md`（芯「読んだ本と、会話できる。答えのもとは、あなたが残したメモ。」）・`company/brand-guardrails.md`・`docs/ai-marketing-automation.md` §1（画面は見本・著者を主役にしない・AI の印・ステマ）
4. `company/sns-quality-guide-2026-11.md` §0・§2・§3（1 行目・具体 1 つ・保存版・決まり文句・60 秒チェック）
5. 手本: `company/sns-prep/`（x-threads-week1.md・instagram-week1.md・note-01-consult.md）
6. `src/lib/releaseNotes.js` の **直近 14 日**の `quiet` でない項目（`node scripts/marketing/weekly-drafts.mjs --dry` が `marketing-out/drafts/<日付>/prompt.md` に材料をまとめる）
7. 前の週の `company/weekly/review-<日付>.md`（月曜の数字の見直しで「決めたこと」）と `company/weekly/<日付>.md` の「数字と学び」

## 書くもの: `company/weekly/<今週の土曜 YYYY-MM-DD>.md`（と `note-<日付>.md`）
```
# 今週の投稿キット（YYYY-MM-DD の週）
機能の週: N（sns-strategy §3-3）・今週の機能（入口 A/B/C と広がる）
## 1. X（10 本・各 140 字以内（重み 280）・本文にリンクなし・見出し「### X1 月 7:30｜入口｜機能」・返信の 1 本目の文は別に）
## 2. Threads（7 本・500 字以内・見出し「#### T1 月｜入口｜機能」・問いで終える）
## 3. Instagram（リール 2「### リール 1「…」（約 N 秒）」の台本と字幕・カルーセル 1「### カルーセル「…」」の 6〜8 枚の文）
## 4. TikTok（2〜3 本「### TikTok 1」・リールと同じ動画の説明・「App Store で「orime」と検索」）
## 5. note（本文は note-<日付>.md・題 15〜25 字・見出し画像・見出し 3〜5・できないこと・ct=note_<機能>）
## 6. 計測（各本の ct=<場>_<機能>・見る数字 3 つ）
## 7. 数字と学び（空欄・オーナーが書く）
## 直してほしい所（ℹ️ を直さなかった理由・伏せ字）
```

## 決まり
- 書き終えたら `node scripts/marketing/weekly-drafts.mjs --check company/weekly/<日付>.md`（と `note-<日付>.md`）。⚠️（言葉）は 0 行になるまで直す。ℹ️（形＝場ごとの決まり・sns-playbooks §7）は直すか、直さない理由を末尾「直してほしい所」に書く。伏せ字・反応を頼む言葉が出た投稿は予約しない。
- 実在の書名を出す投稿の最後には「画面はアプリの実際の動き（サンプルのデータ）です。本の著者・出版社とは関係ありません。」
- 「著者と話せる」「必ず」「先着」「AI 要約」「無料トライアル」は書かない。無料は「無料プラン（ずっと無料）」と「7 日間無料」の 2 つだけ。
- 文はとにかく成長したい人に向けて（煽らない・短い・読む量を責めない）。絵文字は 1 本に 1 つまで。返信は自動にしない（オーナーがする）。
- 同じ芯（今週の機能）を 5 つの場で言い換える（別のネタを 5 つ作らない）。

## 終わったら
- `git add company/weekly && git commit -m "docs: 今週の投稿キット（YYYY-MM-DD）"` → main へ push（文書だけ・2026-11-22 から保存先は main）。
- オーナーへ 5 行: 今週の芯・増やす型・ファイルの場所・直してほしい所（迷った 2 か所）・確かめられなかったこと。

## 予約の入れ方（スケジュールされたセッションがやる）
1. `node scripts/ops-mcp.mjs ops_post '{"action":"status"}'` で鍵のそろいを見る
2. 画像: `node scripts/ops-mcp.mjs ops_image '{"prompt":"…","size":"1024x1024","quality":"medium"}'` → 返った `url` を使う（Instagram 3 本ぶん＋X/Threads 2 本・写実的な人物・本の表紙・他社のロゴは描かせない）
3. 1 本ずつ `node scripts/ops-mcp.mjs ops_post '{"action":"add","platform":"x","text":"…","scheduled_at":"2026-11-10T21:00:00+09:00"}'`（文字数は X 重み 280＝日本語なら約 140 字（漢字・かな・絵文字は 1 字で 2・URL は 23）・Threads 500・Instagram 2,200 の中・本文にリンクを入れない決まりはそのまま）
4. ファイルの各本の下に「予約: 済（id …）／手で出す（鍵なし）」を書く
5. **note**（note には投稿の API が無い）: 本文まで書いて `company/weekly/note-<日付>.md` に置き（note-shippitsu の型・2,000〜3,500 字・見出し 3〜5・最後に orime の紹介 1 段落と App Store の案内）、`node scripts/ops-mcp.mjs ops_tasks '{"action":"add","title":"note を投稿する: company/weekly/note-<日付>.md（クロード in Chrome で下書きに貼る→読んで公開）","due_date":"<来週の水曜>","dept":"マーケ","assignee":"me"}'` でオーナーのやることに入れる。公開はオーナー（`docs/claude-in-chrome-setup.md` の「6. note」）

## 毎週自動で回す（スケジュールされたタスクの頼み方・1 回だけ）
Claude Code のセッションで次をそのまま頼む（claude.ai/code の「スケジュールされたタスク」に入る・止めるのも同じ場所）:

> 毎週土曜 5:47（Asia/Tokyo）に、新しいセッションで次を回すスケジュールされたタスク「土曜の投稿キット」を作って（通知はプッシュとメール）: `git fetch origin main && git checkout -B claude/weekly-posts origin/main` → `.claude/skills/mkt-week/SKILL.md` の手順どおり `company/weekly/<今週の土曜>.md` を書く → `--check` で使わない言い方 0 行 → `git add company/weekly && git commit` → `git push -u origin claude/weekly-posts --force-with-lease`。main には push しない・PR は作らない・SNS には投稿しない・鍵を聞かない。最後に日本語で 5 行（今週の芯・増やす型・場所・直してほしい 2 か所・確かめられなかったこと）。
