# Chrome への指示（Supabase: Apple でサインインをオンにする・2026-11-21）

> 背景: iPad のシミュレータで「Appleでサインイン」を試すと、Apple の画面は通ったあと Supabase が `400 provider_disabled` で断った（Apple のサインインがオフ）。審査の人が Apple で試しても同じ所で失敗するので、build 7 を出す前に入れる。あわせて「登録せずに始める」に要る 2 つのスイッチも確かめる（`review-2026-11-19.md` の指示 A と同じもの）。
> 使い方: 下の「ここから」〜「ここまで」を Chrome の Claude に貼る。

---ここから---

あなたは Orime（読書メモの iPhone アプリ）の公開作業を手伝います。私の Chrome の Supabase のダッシュボードで、サインインの設定を入れます。

## 守ること
- パスワード・確認コード・API キー・秘密鍵（Apple の鍵を含む）は、入力も表示もしないでください。求められたら止めて私に頼んでください。
- 支払い・プランの変更・契約のボタンは押さないでください。
- 何かを消す操作はしないでください。ここに書いた項目以外は変えないでください。
- 画面が手順と違うときは、推測で進めずに止めて聞いてください。

## 作業
1. https://supabase.com/dashboard でプロジェクト（URL が tkrinnopfssdibgxuqzl のもの）を開きます。
2. 左の「Authentication」→「Sign In / Providers」（または「Providers」）を開きます。

### A. Apple でサインインをオンにする
3. 一覧の **Apple** を開きます。
4. **「Enable Sign in with Apple」（Apple を有効にする）をオン**にします。
5. **「Client IDs」**（Authorized Client IDs）の欄に `jp.orime.app` を入れます。すでに別の値が入っていたら消さずに、カンマで区切って後ろに足します（例 `いまの値,jp.orime.app`）。すでに `jp.orime.app` があれば何もしません。
6. **「Secret Key (for OAuth)」の欄は触らない**でください（空でも、入っていてもそのまま。開かない・見せない）。iPhone のアプリからのサインインには要りません。
7. 「Save」を押します。保存できずに「Secret Key が必要」などと出たら、そこで止めて、出た文をそのまま教えてください。

### B. 登録せずに始める に要る 2 つ
8. 同じ「Sign In / Providers」の画面（または「Authentication → Settings」）で、**「Allow anonymous sign-ins」（匿名のサインインを許す）がオン**か確かめます。オフならオンにして保存します。
9. **「Allow manual linking」（手動でつなぐ）がオン**か確かめます。オフならオンにして保存します。

### C. 報告
10. 次を報告してください。
   - Apple: 有効になったか・Client IDs に `jp.orime.app` が入ったか（Secret Key の欄の中身は書かない）
   - Allow anonymous sign-ins: オン／オフ（変えたかどうか）
   - Allow manual linking: オン／オフ（変えたかどうか）
   - 保存のときに出たメッセージ（あれば）

---ここまで---
