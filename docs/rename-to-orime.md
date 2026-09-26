# 旧名（leverage）を外に出さない切り替え手順 — 0 円版

2026-09-26 決定：**完全に 0 円**で始める。
- アドレスは `orime.vercel.app`
- 問い合わせは Gmail の新しいアドレス
- 売上が出てきたら独自ドメイン（orime.jp など）に移る。そのときは環境変数を差し替えるだけ（下の「将来 orime.jp に移るとき」）

## 先に知っておくこと
- **Supabase の作業（手順 3）だけは、Supabase にログインできるようになってから**行う。いまは GitHub のアカウントの件でログインできない。手順 1・2・4 は先に進めてよい。
- **表示が切り替わるのは、作業ブランチを main に取り込んで再デプロイした後**。環境変数を読むコードは、まだ作業ブランチにある。環境変数は先に入れておいてよい。
- 管理画面のボタン名は、サービスの更新で少し変わることがある。見つからないときは、近い名前のメニューを探す。
- 所要時間は全部で 30 分ほど。待ち時間はほぼない。

---

## 手順 1. `orime.vercel.app` を取る（5 分・0 円）✅ 2026-09-26 完了
1. Vercel にログインし、Orime のプロジェクトを開く。
2. 上のメニューの **Settings** → 左の **Domains** を開く。
3. **Add**（または Add Domain）を押し、`orime.vercel.app` と入力して追加する。
   - **追加できた** → そのまま使える。DNS の設定も HTTPS の設定も要らない。
   - **「使われています」と出た** → `orime-app.vercel.app` → `orimeapp.vercel.app` の順に試す。取れたアドレスを Claude に伝える。
4. ブラウザで `https://orime.vercel.app` を開き、Orime の画面が出れば完了。
   - 旧アドレス `leverage-reading.vercel.app` も、そのまま動き続ける。古いリンクは切れない。
   - プロジェクト名（Settings → General → Project Name）も `orime` に変えておくと、管理画面で迷わない。変えなくても動く。

## 手順 2. 問い合わせ用の Gmail を作る（10 分・0 円）
1. Google アカウントの作成画面で、新しいアカウントを作る。
   - 名前は「Orime」など。
   - アドレスは `orime.support@gmail.com` などを試す。使われていたら `orime.app.support` など、Orime が入った名前で探す。
2. 作ったアドレスで、送信と受信ができることを確かめる（普段のアドレスとの間で 1 通ずつ送り合う）。
3. このアドレスは、利用者と App Store の審査担当者が見る。プロフィール名を「Orime サポート」にしておくと、返信を受け取った人に分かりやすい。
4. 普段のスマホの Gmail アプリにこのアカウントも追加しておくと、問い合わせを見逃さない。

## 手順 3. Supabase の設定（5 分・**Supabase にログインできるようになってから**）
アプリで新規登録したとき、確認メールのリンクはここで設定したアドレスに飛ぶ。

1. Supabase にログインし、Orime のプロジェクトを開く。
2. 左の **Authentication** → **URL Configuration** を開く。
3. **Site URL** を `https://orime.vercel.app` にして **Save**。
4. すぐ下の **Redirect URLs** で **Add URL** を押し、`https://orime.vercel.app/**` を追加する。
   - 旧アドレス（`https://leverage-reading.vercel.app/**`）は、しばらく消さずに残す。
5. 同じ Authentication の **Email Templates** で、確認メールの本文を開く。旧名（レバレッジ など）が直接書かれていれば、Orime に直す。

## 手順 4. 環境変数を入れる（10 分）
環境変数は「アプリに渡す設定値」。コードを書き換えずに、値だけ差し替えられる。

1. Vercel のプロジェクト → **Settings** → **Environment Variables** を開く。
2. 次を 1 つずつ追加する。Key に名前、Value に値を入れ、**Environment は Production にチェック**する。

   | Key | Value |
   |---|---|
   | `VITE_SITE_URL` | `https://orime.vercel.app`（コードの既定値も orime.vercel.app にしたので、入れなくてもよい） |
   | `APP_ORIGIN` | `https://orime.vercel.app` |
   | `RAKUTEN_APP_URL` | `https://orime.vercel.app` |
   | `VITE_SUPPORT_EMAIL` | 手順 2 で作った Gmail のアドレス |

   - URL の末尾に `/` を付けない。
   - `RAKUTEN_APP_URL` がすでにある場合は、⋯ → Edit で値を書き換える。
3. **楽天ウェブサービス**のアプリ設定で、「許可された Web サイト」に `https://orime.vercel.app` を追加する。これが無いと、本の表紙が楽天から取れなくなる。
4. 反映させるには再デプロイする：**Deployments** → 一番上の Production の行の ⋯ → **Redeploy**。
   - 作業ブランチを main に取り込むときも自動で再デプロイされるので、そのタイミングでもよい。

## ついでにやること（0 円）
- **Amazon アソシエイト**：アソシエイト・セントラル →「トラッキング ID の管理」で Orime 名の ID（例 `orime-22`）を追加し、環境変数 `VITE_AMAZON_TAG` に入れる。同じアカウント内の追加なので無料。
- **App Store Connect**（審査の前に）
  - プライバシーポリシー URL：`https://orime.vercel.app/legal/privacy`
  - サポート URL：`https://orime.vercel.app/legal/sct`
  - マーケティング URL：`https://orime.vercel.app`
  - 文面は `company/app-store-listing.md` を更新済み。

## 最後の確認（実機）
- [ ] `https://orime.vercel.app` が開く
- [ ] ログアウトした状態の Safari で `https://orime.vercel.app/legal/terms` と `/legal/privacy` が開く（審査担当者はこの状態で見る）
- [ ] アプリの有料プランの画面で「利用規約」を押すと、Safari で orime.vercel.app のページが開く
- [ ] 新規登録 → 確認メールのリンク → orime.vercel.app に着地し、「メールアドレスの確認が完了しました」が出る
- [ ] 設定画面の「お問い合わせ」が新しい Gmail のアドレスになっている

すべて済んだら Claude に伝える。コードに残っている旧アドレスの既定値を新しいものに書き換え、環境変数が無くても旧名が出ないようにする。

---

## 将来 orime.jp に移るとき（売上が出てから・年に数千円）
1. 国内のドメイン会社（お名前.com・ムームードメイン・Xserverドメインなど）で `orime.jp` を買う。
   - 自動更新は ON にする。
   - 住所を出したくなければ「Whois 情報公開代行」を選ぶ。
2. Vercel → Settings → Domains に `orime.jp` を追加し、画面に出る値（A レコード・CNAME）をドメイン会社の DNS 設定に入れる。
3. 上の手順 3・4 の `https://orime.vercel.app` を、すべて `https://orime.jp` に差し替えて再デプロイする。
4. メールも `support@orime.jp` にしたければ、無料の転送サービス（ImprovMX など）で Gmail に転送する。
