# orime.jp への切り替え手順（オーナー作業）

2026-09-26 決定：本番のドメインを `orime.jp` にする。目的は、旧名（leverage）を利用者に見せないこと。
コード側の準備は済んでいる。下の作業が終わったら、環境変数を入れて再デプロイするだけで切り替わる。

## 1. ドメインを取る
- [ ] `orime.jp` を取得する
  - .jp は日本国内の住所が必要。国内のサービスを使う（お名前.com・ムームードメイン・Xserverドメイン など）
  - Cloudflare では .jp を取得できない
- [ ] `www.orime.jp` も同じドメインの中で使える（追加の購入は不要）

## 2. Vercel につなぐ
- [ ] Vercel → プロジェクト → Settings → Domains で `orime.jp` と `www.orime.jp` を追加する
  - `www` は `orime.jp` へのリダイレクトにする
- [ ] 画面に表示される DNS の設定を、ドメインを買ったサービスの管理画面に入れる
  - 通常は `orime.jp` に A レコード `76.76.21.21`、`www` に CNAME `cname.vercel-dns.com`
  - 正確な値は Vercel の画面の表示に従う
- [ ] 数分〜数時間で「Valid Configuration」になり、HTTPS も自動で有効になる
- 旧 `leverage-reading.vercel.app` もそのまま動き続ける。古いリンクは切れない

## 3. 環境変数（Vercel → Settings → Environment Variables・Production）
- [ ] `VITE_SITE_URL` = `https://orime.jp`
  - アプリ内の規約リンクと、共有したときの URL に使われる
- [ ] `APP_ORIGIN` = `https://orime.jp`
- [ ] `RAKUTEN_APP_URL` = `https://orime.jp`
  - 楽天アプリ登録の「許可されたWebサイト」にも `https://orime.jp` を追加する
- [ ] 入れ終わったら再デプロイする（Deployments → Redeploy）

## 4. ログイン（Supabase）
**アプリの登録確認メールのリンクは Site URL に着地するため、必須。**
- [ ] Supabase → Authentication → URL Configuration
  - Site URL を `https://orime.jp` にする
  - Redirect URLs に `https://orime.jp/**` を追加する
  - 旧ドメインも移行期間は残しておく
- [ ] 確認メールの本文にドメインや旧名が書かれていれば、Email Templates で直す

## 5. Apple でサインイン（Web で使う場合だけ）
- [ ] Apple Developer → Service ID の Domains / Return URLs に `orime.jp` を追加する

## 6. 問い合わせメール
- [ ] `support@orime.jp` を用意する
  - 転送だけなら、ドメイン会社のメール転送や ImprovMX（無料）で足りる
  - 送信もするなら Google Workspace など
- [ ] Vercel の環境変数 `VITE_SUPPORT_EMAIL` = `support@orime.jp` を入れて再デプロイする
  - 設定・エラー画面・特商法などの表示が一斉に切り替わる

## 7. Amazon アソシエイト
- [ ] アソシエイト・セントラル →「トラッキング ID の管理」で Orime 名の ID（例 `orime-22`）を追加する
- [ ] 環境変数 `VITE_AMAZON_TAG` に入れて再デプロイする

## 8. App Store Connect（審査の前に）
- [ ] プライバシーポリシー URL: `https://orime.jp/legal/privacy`
- [ ] サポート URL: `https://orime.jp/legal/sct`（または問い合わせページ）
- [ ] マーケティング URL: `https://orime.jp`
- [ ] 利用規約（EULA）を説明文に書く場合: `https://orime.jp/legal/terms`
  - 文面は `company/app-store-listing.md` を orime.jp に更新済み

## 9. 最後の確認（実機）
- [ ] アプリの有料プランの画面で「利用規約」「プライバシーポリシー」を押すと、Safari で orime.jp のページが開く
- [ ] 新規登録 → 確認メールのリンク → orime.jp に着地し、「メールアドレスの確認が完了しました」が出る
- [ ] ログアウトした状態の Safari で `https://orime.jp/legal/terms` と `/legal/privacy` が開く（審査担当者はこの状態で見る）

すべて済んだら、コードに残っている旧ドメインの既定値（`src/lib/legalLinks.js`・`vite.config.js`・`index.html`）を orime.jp に書き換えて、環境変数が無くても orime.jp になるようにする（Claude に頼めば対応する）。
