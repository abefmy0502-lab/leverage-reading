# note 運用チーム（カスタムサブエージェント）

Orime の集客・信頼構築・課金転換を、note.com で継続運用するための専門エージェント群。
本田直之哲学（誠実・凝縮・煽らない・行動が全て）を全役が共有する。

## メンバー
| 役 | サブエージェント | 担当 |
|---|---|---|
| 編集長（統括） | `note-henshucho` | 運用方針・編集カレンダー・段取り・最終品質 |
| 企画 | `note-kikaku` | 売れるテーマを提案 |
| 市場分析 | `note-shijo` | 読者ニーズ・競合を調査（WebSearchで裏取り） |
| 構成 | `note-kosei` | 読みやすい記事設計（アウトライン） |
| 執筆 | `note-shippitsu` | 下書き・改善案を作成 |
| 販売設計 | `note-hanbai` | タイトル・導線・CTA・値付けを最適化 |
| 管理 | `note-kanri` | タスク整理・進行管理（`company/note/board.md`） |

## 使い方
- まず **`note-henshucho`（編集長）** に相談すると、方針と段取り（誰を→どの順で）を出してくれる。
- 単発で頼んでもよい。例:
  - 「`note-kikaku` でテーマを5つ出して」
  - 「`note-shijo` でこのテーマの市場を調べて」
  - 「`note-kosei` → `note-shippitsu` で1本書いて」
  - 「`note-kanri` で進行を整理して」
- 標準パイプライン: **企画 → 市場分析 →（編集長が取捨）→ 構成 → 執筆 → 販売設計 → 管理が記録**。
- 並行で複数テーマを回すときは、各役を同時に動かしてよい。

## 成果物の置き場
すべて `company/note/` 配下に Markdown で蓄積する:
- `theme-ideas-*.md`（企画）/ `market-*.md`（市場分析）/ `outline-*.md`（構成）
- `draft-*.md`（執筆）/ `sales-*.md`（販売設計）/ `editorial-calendar.md`（編集長）
- `board.md`（管理 = 進行の真実）

## 各役が参照するブランド資産（`company/`）
`brand-messaging.md` / `marketing-playbook.md` / `product-north-star.md` /
`sns-sales-plan-july.md` / `seo-articles-batch1.md` ほか。声と既存戦略に齟齬を出さないため、作業前に必ず確認する。

---

# UI レビュー（カスタムサブエージェント）

| 役 | サブエージェント | 担当 |
|---|---|---|
| UI レビュー | `ui-critic` | 明暗のスクショを `DESIGN.md` / `SPEC.md` と 10 項目×2 点で採点（16/20 以上で合格）。実装した本人とは別の目。コードは直さない |

使い方：`npm run demo` を起動 → `npm run ui:shots -- after <画面名>` → 「`ui-critic` で ui-shots/after の home を採点して（比較は ui-shots/before）」。
