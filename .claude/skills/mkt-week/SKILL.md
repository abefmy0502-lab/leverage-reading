---
name: mkt-week
description: 今週の投稿キット（X 10 本・Threads 7 本・Instagram の説明欄 7 本・note の構成 1 本・動画の台本の候補）を、リポジトリの事実（新しくなったこと・型・暦）から下書きして company/weekly/<日付>.md に置く。土曜の朝の決まった仕事。「/mkt-week」「今週の投稿を作って」と言われたら使う。
---

# /mkt-week — 今週の投稿キット（2026-10-22・マーケのレバレッジ）

**自動では投稿しない。** 作るのはファイル 1 つ。オーナーが土曜に読んで直し、自分の手で予約する（`company/sns-daily-system-2026-10.md` §4）。

## 読むもの（この順・全部）
1. `company/marketing-master-plan-2026-10.md` §0〜§3（訴求の軸「読書を、受け身から会話へ」・5 つの柱・使わない言葉）
2. `company/brand-guardrails.md`・`docs/ai-marketing-automation.md` §1（言い方・画面は見本・著者を主役にしない・AI の印・ステマ）
3. `company/sns-daily-system-2026-10.md` §3・§5（曜日ごとの中身・3 つの型 A/B/C）
4. `company/launch-2026-11/calendar.md`・`x-posts.md`・`threads-posts.md`・`sns-playbook.md`（見本・今週に当たる暦の予定）
5. `src/lib/releaseNotes.js` の **直近 14 日**の `quiet` でない項目（＝利用者がワクワクすること。`node scripts/marketing/weekly-drafts.mjs --dry` が `marketing-out/drafts/<日付>/prompt.md` に材料をまとめる）
6. 前の週の `company/weekly/<日付>.md` の「数字と学び」（あれば。伸びた型を増やし、伸びない型を減らす）

## 書くもの: `company/weekly/<今週の土曜 YYYY-MM-DD>.md`
```
# 今週の投稿キット（YYYY-MM-DD の週）
## 0. 今週の芯（1 行）と、増やす型（A/B/C のどれか・理由 1 行）
## 1. X（10 本・各 140 字以内・本文にリンクなし・曜日と時刻つき・返信の 1 本目に入れる文は別に）
## 2. Threads（7 本・各 300 字以内・曜日つき）
## 3. Instagram（7 本の説明欄・リール 5＝台本の題と柱・カルーセル 2＝7 枚の文・どれも最後に見本の注記）
## 4. note（1 本の題・構成・冒頭 200 字。本文は note-shippitsu に頼む）
## 5. 動画の台本の候補（scenarios.mjs / reels.mjs に足す 2〜3 本・題と 3 コマの字幕）
## 6. 今週の計測（見る数字 3 つ・どうなったら型を替えるか）
## 7. 数字と学び（空欄・オーナーが土曜に 3 行書く）
```

## 決まり
- 1 本ずつ `node scripts/marketing/weekly-drafts.mjs --check company/weekly/<日付>.md` を通す（使わない言い方が 0 行になるまで）。
- 実在の書名を出す投稿の最後には「画面はアプリの実際の動き（サンプルのデータ）です。本の著者・出版社とは関係ありません。」
- 「著者と話せる」「必ず」「先着」「AI 要約」「無料トライアル」は書かない。無料は「無料プラン（ずっと無料）」と「7 日間無料」の 2 つだけ。
- 文は本田直之さんの読者に向けて（煽らない・短い・行動で終わる）。絵文字は 1 本に 1 つまで。
- 同じ芯を 4 つの SNS で言い換える（別のネタを 4 つ作らない）。

## 終わったら
- `git add company/weekly && git commit -m "docs: 今週の投稿キット（YYYY-MM-DD）"` → 作業ブランチへ push（main には入れない・オーナーが読んでから）。
- オーナーへ 5 行: 今週の芯・増やす型・ファイルの場所・直してほしい所（迷った 2 か所）・確かめられなかったこと。

## 毎週自動で回す（スケジュールされたタスクの頼み方・1 回だけ）
Claude Code のセッションで次をそのまま頼む（claude.ai/code の「スケジュールされたタスク」に入る・止めるのも同じ場所）:

> 毎週土曜 5:47（Asia/Tokyo）に、新しいセッションで次を回すスケジュールされたタスク「土曜の投稿キット」を作って（通知はプッシュとメール）: `git fetch origin main && git checkout -B claude/weekly-posts origin/main` → `.claude/skills/mkt-week/SKILL.md` の手順どおり `company/weekly/<今週の土曜>.md` を書く → `--check` で使わない言い方 0 行 → `git add company/weekly && git commit` → `git push -u origin claude/weekly-posts --force-with-lease`。main には push しない・PR は作らない・SNS には投稿しない・鍵を聞かない。最後に日本語で 5 行（今週の芯・増やす型・場所・直してほしい 2 か所・確かめられなかったこと）。
