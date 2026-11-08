# クロード in Chrome に頼む指示文（運営の自動化の準備・2026-11-08）

オーナーが手元の Chrome で「クロード in Chrome」に貼って使う文。上から順に 1 つずつ。鍵の値はチャットに書かせず、画面から画面へコピーさせる。

共通の前置き（毎回いちばん上に貼る）:

```
あなたは私の代わりに Chrome で作業します。鍵・トークン・パスワードの値は、チャットに書かず、読み上げず、コピーして貼る先に直接貼ってください。削除・解約・支払いの操作はしないでください。分からない画面になったら止まって私に聞いてください。終わったら何をしたかを 3 行で報告してください。
```

## 1. Supabase に SQL を流す

```
1. https://github.com/abefmy0502-lab/leverage-reading/blob/main/supabase_admin_mcp.sql を開き、「Raw」を押して中身を全部コピーする。
2. https://supabase.com/dashboard/project/tkrinnopfssdibgxuqzl/sql/new を開き、エディタに貼って「Run」。緑の Success を確かめる。
3. 同じエディタで次を流し、2 行（admin_snapshot_for と admin_act_for）が返ることを確かめる:
   select proname from pg_proc where proname in ('admin_snapshot_for','admin_act_for');
4. 次を流し、1 が返ることを確かめる:
   select count(*) from storage.buckets where id = 'ops-media';
5. 赤いエラーが出たら、そのエラーの文だけを私に見せて止まる。
```

## 2. Orime の接続キーを、自動セッションの環境に入れる

```
1. https://orime.vercel.app を開いてログインし、右上の設定（歯車）→「Claude・ChatGPT とつなぐ」→ 上の切り替えで「Claude Code」を選び「Claude Code 用の接続キーを作る」。出てきたキー（orime_mcp_ で始まる）をコピーする（1 回しか見えない。チャットには書かない）。
2. 新しいタブで https://claude.ai を開き、設定 → Claude Code → 環境（Environments）→「leverage-reading」を開く。
3. 「ネットワークのシークレット」（Network secrets）で追加: ホスト orime.vercel.app、ヘッダー Authorization、種類 Bearer、値にさっきのキーを貼る。名前は「Orime 接続キー」。保存。
4. 保存できたら、Orime の設定の画面で「登録しました（閉じる）」を押す。
```

## 3. ダッシュボードで Orime のコネクタをつなぐ

```
1. https://claude.ai/artifact/RmXcpzbgaNftAjZrJi6FDX を開く。
2. 右上の「Sources」（元データ）を開き、Orime のコネクタが「接続」「有効」になっているか見る。なっていなければ押してつなぐ。
3. ページを再読み込みして、「概況」の数字が「—」でなく出ているかを確かめ、出ていない区画の名前を私に教える。
```

## 4-a. X の鍵を作って Vercel に入れる

```
1. https://developer.x.com/en/portal/dashboard を開く（Orime 用の X アカウントでログイン）。無料プランでよい。プロジェクトとアプリを 1 つ作る（名前 Orime）。
2. アプリの「User authentication settings」→ Set up: App permissions は「Read and Write」、Type of App は「Web App, Automated App or Bot」、Callback URI と Website URL は https://orime.vercel.app 。保存。
3. 「Keys and tokens」で、API Key と API Key Secret を（必要なら Regenerate して）表示し、Access Token と Access Token Secret を「Read and Write」で Generate する。4 つの値はこのタブに置いたまま。
4. 新しいタブで https://vercel.com を開き、プロジェクト orime → Settings → Environment Variables。Production にチェックして 4 つ追加する: X_API_KEY（API Key）、X_API_SECRET（API Key Secret）、X_ACCESS_TOKEN（Access Token）、X_ACCESS_SECRET（Access Token Secret）。値は X のタブからコピーして直接貼る。
5. Deployments → いちばん上の Production → 「Redeploy」。
```

## 4-b. Threads の鍵を作って Vercel に入れる

```
1. https://developers.facebook.com/apps を開き、「アプリを作成」→ ユースケースは「Threads API にアクセス」（Access the Threads API）。名前 Orime。
2. 左の「ユースケース」→ Threads API → 「設定」で threads_basic と threads_content_publish を追加。「ロール」→「Threads テスター」に投稿に使う Threads アカウントを追加し、Threads アプリ（スマホ）側の 設定 → アカウント → ウェブサイトのアクセス許可 で招待を承認する（承認は私がやるので、そこまで来たら止まって教える）。
3. 承認のあと、同じ画面の「Threads API」の「ユーザートークンを生成」でトークンを作る（短期）。
4. 長期トークンにする: 新しいタブで次の URL を開く（<短期トークン> と <アプリシークレット> は値を直接埋める・チャットに書かない）:
   https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<アプリシークレット>&access_token=<短期トークン>
   返ってきた access_token が長期トークン（60 日）。
5. ユーザー ID: https://graph.threads.net/v1.0/me?fields=id,username&access_token=<長期トークン> を開き、id を控える。
6. Vercel（https://vercel.com → orime → Settings → Environment Variables・Production）に THREADS_USER_ID（id）と THREADS_ACCESS_TOKEN（長期トークン）を追加し、Redeploy。
```

## 4-c. Instagram の鍵を作って Vercel に入れる

```
前提: 投稿に使う Instagram は「プロアカウント（ビジネスかクリエイター）」で、Facebook ページとリンクしていること。なっていなければ、そこまでで止まって私に教える。
1. https://developers.facebook.com/apps で 4-b と同じアプリに「Instagram」の製品を追加（Instagram API with Facebook Login）。
2. https://developers.facebook.com/tools/explorer を開き、アプリを選び、権限に instagram_basic・instagram_content_publish・pages_show_list・pages_read_engagement を付けて「Generate Access Token」（Facebook でログイン・ページと Instagram を選ぶ）。
3. 長期トークンにする: 新しいタブで
   https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<アプリ ID>&client_secret=<アプリシークレット>&fb_exchange_token=<短期トークン>
4. Instagram のユーザー ID: https://graph.facebook.com/v21.0/me/accounts?fields=name,instagram_business_account&access_token=<長期トークン> を開き、instagram_business_account の id を控える。
5. Vercel（orime → Settings → Environment Variables・Production）に IG_USER_ID（その id）と IG_ACCESS_TOKEN（長期トークン）を追加し、Redeploy。
```

## 5. そろったか確かめる

```
1. https://claude.ai/artifact/RmXcpzbgaNftAjZrJi6FDX を開き、「公開の準備」の区分で「X の投稿（4 つの鍵）」「Threads の投稿」「Instagram の投稿」「指示を受ける関数」「SNS の投稿の表」が「ある」になっているか見る。
2. 「やること・声」の区分で、SNS の投稿のカードの「鍵のそろい」も見る。
3. 「ない」が残っていたら、その名前を私に教える。
```

## 6. note に下書きを貼る（毎週・土曜の投稿キットが本文を書いたあと）

note には投稿の API が無いので、ここだけは手元の Chrome で貼る。公開は自分で押す。

```
1. https://github.com/abefmy0502-lab/leverage-reading/blob/claude/weekly-posts/company/weekly/ を開き、いちばん新しい note-<日付>.md を開いて「Raw」で中身を表示する。
2. 最初の行（# で始まる題）を題として、残りを本文としてコピーする。
3. 新しいタブで https://note.com/notes/new を開く（ログイン済みのアカウント）。題の欄に題を貼り、本文の欄に本文を貼る。見出し（## の行）は note の「見出し」に、箇条書きは箇条書きに整える。## や * の記号が残っていたら消す。
4. 本文の中の「見出し画像」の指示があれば、その文のとおりに note の見出し画像を選ぶ（無ければ何もしない）。
5. 右上の「下書き保存」を押す。公開は押さない。
6. 下書きができたら、その URL を私に教える。私が読んで公開する。
```

## 動作を試す（Claude Code のセッションか、ダッシュボードの横のチャットで）

- 「『docs/README.md の日付を今日に直す』を Claude の担当で足して」→ 次の偶数時 13 分に自動のセッションが取りに来る（claude.ai の「スケジュールされたタスク」で履歴が見える）。
- 「X に『テスト投稿です』をいますぐ出して」→ `ops_post now`。出たら X で消してよい。
