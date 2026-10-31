---
name: webapp-testing
description: Orime のお試しモード（npm run demo・http://localhost:5173）を Playwright で動かして、画面を確かめる・撮る・押せるものを調べる型（anthropics/skills の webapp-testing を Orime 向けに写した・2026-10-31）。「画面を確かめて」「この操作で何が出る？」「スクショを撮って」「動かして確認して」「点検して」と言われたら使う。撮る前に押せるものの名前を調べる（偵察 → 操作）。
---

# /webapp-testing — 画面を動かして確かめる型（2026-10-31）

元: anthropics/skills の `webapp-testing`。Orime は Node の `playwright-core`＋入っている Chromium で動かす（Python は使わない）。

## 0. 道具
| 用途 | 使うもの |
|---|---|
| 決まった画面を明暗で撮る | `npm run ui:shots -- <ラベル> <画面名…>`（`scripts/ui-shots.mjs` の名前・120 秒で切れるので 3 画面ずつ） |
| 押せるもの・見出しを調べる（偵察） | `node scripts/ui-probe.mjs '<URL>' [--click '<セレクタ>'…] [--shot <パス>]`（下） |
| 自由に歩く | `ui-shots/_probe*/walk.mjs` の形で `playwright-core` のスクリプトを書く（git 管理外） |

サーバー: `npm run demo`（:5173）。死んでいたら `setsid nohup npm run demo > /dev/null 2>&1 < /dev/null &`（ふつうの `&` だと次のコマンドで消える）。

## 1. 偵察してから操作する（必ずこの順）
1. `page.goto(url, { waitUntil: 'networkidle' })` のあとに調べる（JS が動く前に DOM を見ない）。
2. `button:visible` / `summary` / `[role=dialog]` の innerText で**今の文言**を取る。画面の文言は変わる（例: 「保存してメモを書く」→ 写真の道では「保存してページを撮る」・「目安を決める」→「読む時間の目安」）ので、記憶のセレクタで押さない。
3. 押す・入れる・待つ・撮る。

```js
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/?demo=fewmemos', { waitUntil: 'networkidle' });
console.log(await p.locator('button:visible').allInnerTexts());
await p.click('button:has-text("相談してみる")');
await p.screenshot({ path: 'ui-shots/_probe/x.png' });
await b.close();
```

## 2. お試しモードの入口（よく使う）
`?demo=new`（初回ガイド）・`freenew`（無料の新規）・`fewmemos`（メモ 3 件）・`free` / `freeused` / `limit` / `trial`・`auth`（LP）・`&focus=timer|until|done|summary`・`&share=chooser`・`&seen=2026-10-28`（新しくなったことのシートを出さない）・`&today=2026-11-29`。全部は CLAUDE.md「お試しモード」。

## 3. つまずき
- **同じ page で URL を変えて歩き直すと前のタブが残る**（localStorage）。歩き直す前に `localStorage.clear()` して読み直すか、場面ごとに `newContext()`。
- **初回ガイドが出る**（`demo=new` / `freenew`）: 「次へ」→「仕事で、」→ `#app-purpose-input` に理由 → 「次へ」→ `[role=dialog] button[aria-label="閉じる"]`。
- **シートを Esc で閉じると、開いたボタンにフォーカスの輪が残る**（キーボード操作の正しい挙動）。撮るなら `page.mouse.click(10, 10)` で外す。
- **相談の送信**は `button[aria-label="送信"]`（Enter は IME の守りで送らない）。
- Chromium は Safari の `text-wrap: pretty` の幅の縮みや `hanging-punctuation` を再現しない。文字の組みの最終確認は iPhone の Safari で。
- 書いている途中の画面は `waitForTimeout(1500)` ほど、答えの最後は 6〜8 秒待つ。

## 4. 点検の報告の形
「必ず直す／直したほうがよい／できれば」に分け、各項目は 画面（URL と操作）・何が困るか・直し方の案・関係するファイル。撮った画像の絶対パス。良かった点も 3 つまで。
