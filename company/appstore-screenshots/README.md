# App Store の画像の作り方（Orime）

App Store に並ぶ画像（背景＋見出し＋端末の枠＋アプリの画面）を作る道具です。`index.html` が見た目のテンプレートと文言（`SETS`）。

> 2026-10-08 改訂：実機で撮らずに、**お試しモードのいまの画面を自動で撮って重ねる**形にした。基本の 6 枚（相談→根拠→行動→取り込み→撮る→写真で共有）と、カスタムプロダクトページ 3 種（各 3 枚）。並びと文言の正典は `company/aso-store-listing.md` §8、書き出したものと使い方は `company/launch-2026-11/README.md`。

## いちばん簡単な作り方（Mac でも Linux でも）

```bash
npm run demo                        # 別のターミナル（http://localhost:5173）
node scripts/appstore-shots.mjs     # 撮る（ui-shots/appstore-raw/）→ 重ねる（company/launch-2026-11/screenshots/）
```

- 撮るだけ：`node scripts/appstore-shots.mjs raw answer sources`／重ねるだけ：`node scripts/appstore-shots.mjs compose`
- 書き出す大きさ：6.9 インチ 1320×2868 と 6.5 インチ 1284×2778（どちらも PNG）
- 画面は iPhone 6.9 インチ相当（440×902pt・@3x）で撮り、上の 54pt に時計の行（9:41）を足す
- 見出しの字体は Noto Serif JP（Mac は無くてもヒラギノ明朝で出る。Linux は Google Fonts から入れておく）

## 文言を変えるとき

`index.html` の `SETS`（`base` / `cpp-import` / `cpp-photo` / `cpp-ask`）を直して `compose` だけ流す。ブラウザで `index.html?set=all` を開くと一覧で見られる（見出しはクリックで仮に書き換えられる。保存は `compose` で）。

決まり：
- 価格を入れない。効果を言い切らない（「忘れない」「必ず」）。
- ほかの会社のアプリ名・サービス名を見出しに焼き込まない（取り込みの画面に実際に写る分は構わない）。ChatGPT などと名前を出して比べない。
- 実在の著者が話し手に見える画面を使わない（相談は `&lpshot=1` で「2 冊の本と自分の学び」）。
- アプリに無い画面・動きを見せない（審査 2.3.3）。画面を変えたら撮り直す。

## 撮る画面を足すとき

`scripts/appstore-shots.mjs` の `SHOTS` に名前と手順を足し、`index.html` の `shot` にその名前を書く。
