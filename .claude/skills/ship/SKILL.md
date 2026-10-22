---
name: ship
description: 変更を出す前の決まった手順を 1 回で回す（テスト → ビルド → 文書の同期 → 画面なら撮影と ui-critic → コミット → 両方のブランチへ push）。「/ship」「出して」「push して」と言われたら使う。
---

# /ship — 出すまでの型（2026-10-22・開発のレバレッジ）

人が毎回思い出す代わりに、この順で機械的に回す。途中で赤ければ直してから次へ。**省かない**。

## 1. 確かめる（並列でよい）
```bash
npx vitest run            # 2,000 本超・SQL のまとめ・文書の同期（scripts/docsSync.test.js）も入っている
npm run build             # Vite のビルド
```

## 2. 文書の同期（触ったものに応じて）
| 触ったもの | やること |
|---|---|
| 利用者に見える画面・動き・文言 | `src/lib/helpContent.js`（ルール 1・先頭の履歴に 1 行）＋ `src/lib/releaseNotes.js`（ルール 5・ワクワクしない項目は `quiet: true`） |
| 画面の構成 | `SPEC.md` |
| 部品・トークン・見た目の決まり | `DESIGN.md` §5 の表 |
| `supabase_*.sql` | `node scripts/sql-bundle.mjs` → `CLAUDE.md` の表に 1 行 |
| AI の指示文・行き先 | `docs/ai-routing.md`・`src/lib/aiProcessors.js` |
| お試しモードの URL を足した | `CLAUDE.md`「お試しモード」の段落 |

## 3. 画面を触ったなら
```bash
npm run demo &            # :5173（死んでいたら nohup で立て直す）
npm run ui:shots -- after <画面名 1〜3 個>   # 120 秒で切れるので 3 画面ずつ
```
→ `ui-critic` サブエージェントに採点させ **16/20 以上**。15 以下なら指摘を直して撮り直す（本人の目だけで合格にしない）。

## 4. コミットして両方へ push
```bash
git add -A && git commit -m "<feat|fix|docs>: <日本語で何を>"   # モデル名は書かない・末尾に Co-Authored-By と Claude-Session
git pull --rebase -q origin main && git push -q origin HEAD:<作業ブランチ> && git push -q origin HEAD:main
```
main への push で `deploy.yml` が Vercel に出す。作業ブランチへの push で `ci.yml` がテストとビルドを回す。

## 5. オーナーへの報告（日本語・平易）
- 何ができるようになったか（利用者の言葉で）・何を頼むか（例: `supabase_all_in_order.sql` を流す・Mac で `npx cap sync ios`）・確かめられなかったこと。
- 鍵や秘密の値は聞かない。PR は頼まれたときだけ。
