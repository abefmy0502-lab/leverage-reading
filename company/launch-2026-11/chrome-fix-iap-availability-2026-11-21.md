# Chrome への指示（再提出の前の直し 2 つ・2026-11-21）

> 背景: Apple の 3 回分の指摘を原文で照らし合わせた（`review-2026-11-19.md`）。コードの指摘（起動で落ちる・登録しないと買えない・Apple でサインインが止まる）は build 7 で直っている。残りは App Store Connect の設定:
> 1. 月額・年額プランの配信が 175 か所のうち 1 か所だけ（トークン 2 つは全部）。Apple の指摘の値段は USD＝審査はアメリカのストアの Sandbox の見込み → サブスクが出ず、2.1(b)「課金の商品が見つからない」がまた来うる。返事にも "not restricted by storefront" と書いて送ってある
> 2. 審査メモが日本語だけで、「登録せずに始める」と課金の場所が書かれていない
> 使い方: 下の「ここから」〜「ここまで」を Chrome の Claude に貼る。日本だけで売りたい場合は貼らない（作業 1 を飛ばし、返事で日本のストアだけと伝える）。

---ここから---

続けてお願いします。今回は App Store Connect の設定を 2 つ変えます。「審査内容を更新」「App Reviewに再提出」はまだ押さないでください。

## 守ること
- 下の 2 つ以外は変えない・消さない。パスワードやコードは扱わない。
- 画面が手順と違うときは止めて聞いてください。

## 作業 1：月額・年額プランを、すべての国と地域で売る
1. まず、アプリ本体の「価格および配信状況」（配信 → 左の「価格および配信状況」）で、アプリが何か所の国・地域で配信されているかを読んで報告してください（変えない）。
2. 「サブスクリプション」→「Orime プラン」→「月額プラン」→「配信可否」（Availability）を開きます。いま選ばれている 1 か所がどこかを報告してから、**アプリと同じすべての国・地域**を選んで保存します。
3. 「年額プラン」も同じようにします。
4. 2 つとも「175か所」（またはアプリと同じ数）が選ばれたことを報告してください。値段（価格スケジュール）は変えないでください。

## 作業 2：審査メモの後ろに英語の案内を足す
1. 版 1.0 のページ →「App Review に関する情報」のメモ（Notes）の**いまの文はそのまま**にして、最後に 1 行あけて下の英文を足し、ページ右上の「保存」を押します。
2. 保存のあと、メモの字数と、英文が最後に入っていることを報告してください。

```
[For App Review]
- Registration is optional. On the sign-in screen, tap "登録せずに始める" (Start without an account), then "同意して始める". No personal information is required. Sign in with Apple and the demo account in Sign-In Information also work.
- Subscriptions (Orime 月額プラン / Orime 年額プラン): tap the round profile icon at the top right of the Home screen to open Settings, then "プラン・お支払い" (Plan & Payment) > "プランを見る" (See plans). The plan screen shows both plans with prices and a purchase button. Registration is not required to purchase.
- Token packs (300 トークン / 1,000 トークン, consumable add-ons for subscribers): sign in with the demo account (it has an active plan), open Settings, then "プラン・お支払い" > "トークンを追加" (Add tokens).
- All In-App Purchases are available in every storefront where the app is available.
```

## 報告
- アプリの配信の国の数・月額と年額のもとの 1 か所・変えたあとの数
- 審査メモの字数と保存できたか

---ここまで---
