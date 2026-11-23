# Mac の Claude Code に渡す指示文（iOS 1.0.0 のビルドを App Store Connect へ上げる・2026-11-15）

> 使い方: Mac のターミナルで、作業用のフォルダ（例 `~/dev`）に移って `claude` を起動し、下の「---」から最後までを全部貼る。
> 前提: Mac に Xcode 26 以降・Node.js 20 以降・git がある。Xcode に Apple ID（Apple Developer Program のアカウント）でサインインできる。
> **先に済ませておくもの**: RevenueCat の設定（`docs/iap-setup-runbook.md` の F）。`appl_` で始まる公開用の鍵が要る。
> 鍵（Supabase の anon key・RevenueCat の `appl_…`）は、**チャットに貼らない**。Claude が開くファイルに自分で書く。

---

あなたは私の Mac で、iPhone アプリ「Orime」（React + Vite を Capacitor で包んだアプリ・リポジトリ `abefmy0502-lab/leverage-reading`）のバージョン 1.0.0 を作り、App Store Connect に上げます。審査への提出は私がブラウザでやるので、あなたは**ビルドを上げるところまで**です。

## 守ること
- **鍵の値をチャットに出さない・聞かない**。鍵はファイルに私が書く。確かめるときも「入っている／空」だけを言い、値は表示しない（`cat` しない・`echo` しない）。
- `.env.production.local` を git に入れない（`.gitignore` 済み）。**コミット・push はしない**（Xcode が変えた `project.pbxproj` も含む）。
- コードは直さない。ビルドやテストが失敗したら、そのエラーの要点を私に見せて、直し方の案を出して止まる。
- Xcode の画面の操作（Apple ID・Team・Capability）は私がやる。あなたは何をどこで押すかを 1 つずつ言って、私の「できた」を待つ。
- 迷ったら勝手に決めずに聞く。各ステップが終わるたびに 1〜2 行で報告する。

## ステップ 1: 道具を確かめる
次を実行して、結果を表にして報告する。足りなければ止まって入れ方を案内する。
```bash
sw_vers -productVersion
xcodebuild -version        # Xcode 26 以降が必要（古いと App Store Connect が受け付けない）
node -v                    # v20 以降
npm -v
git --version
xcode-select -p            # /Applications/Xcode.app/... であること
```

## ステップ 2: リポジトリを用意する
- いまのフォルダに `leverage-reading` が無ければ:
  `git clone https://github.com/abefmy0502-lab/leverage-reading.git && cd leverage-reading`
- あれば: `cd leverage-reading && git checkout main && git pull`
- `git log --oneline -1` を報告する。

## ステップ 3: 鍵のファイルを用意する（値は私が書く）
1. `.env.production.local` が無ければ、次の中身で作る（値は空のまま）:
```
VITE_SUPABASE_URL=https://tkrinnopfssdibgxuqzl.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_REVENUECAT_IOS_KEY=
```
2. `open -e .env.production.local` でテキストエディットを開き、私にこう伝えて待つ:
   - 「`VITE_SUPABASE_ANON_KEY=` の後ろに、Supabase → Project Settings → API Keys の **anon public** の値を貼ってください」
   - 「`VITE_REVENUECAT_IOS_KEY=` の後ろに、RevenueCat → Project settings → API keys の **`appl_` で始まる公開用の鍵**を貼ってください」
   - 「保存して閉じたら『できた』と言ってください」
3. 「できた」のあと、値を表示せずに確かめる:
```bash
for k in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_REVENUECAT_IOS_KEY; do
  v=$(grep -E "^$k=" .env.production.local | head -1 | cut -d= -f2-)
  if [ -n "$v" ]; then echo "$k: 入っている（${#v} 文字）"; else echo "$k: 空"; fi
done
grep -q '^VITE_REVENUECAT_IOS_KEY=appl_' .env.production.local && echo "RevenueCat の鍵は appl_ で始まる" || echo "RevenueCat の鍵が appl_ で始まらない"
```
   空や形の違いがあれば、どれかだけを言ってもう一度お願いする。
4. 秘密でない値（公開日 `VITE_RELEASE_NOTES_SINCE=2026-11-17`・創業メンバー価格 `VITE_FOUNDING_OFFER=on`／`VITE_FOUNDING_OFFER_END=2027-01-10`・`VITE_SITE_URL`）は `.env.production` に入っている。`grep -E '^VITE_(RELEASE_NOTES_SINCE|FOUNDING_OFFER|FOUNDING_OFFER_END|SITE_URL)=' .env.production` を報告する。
5. iPhone の通知（`VITE_NATIVE_PUSH=on`）は**入れない**（APNs の鍵と Push Notifications の capability がそろうまで。1.0.1 で足す）。私が「通知も入れる」と言ったときだけ相談する。

## ステップ 4: 作る
```bash
npm install
npx vitest run             # 全部 passed であること（失敗したら止まる）
npm run build
npx cap sync ios
npm run ios:prepare -- --check   # 「iOS の準備はそろっています。」であること
```
作ったアプリに鍵が入ったかを、値を出さずに確かめる:
```bash
grep -rl "tkrinnopfssdibgxuqzl" ios/App/App/public >/dev/null && echo "Supabase の URL: 入っている" || echo "Supabase の URL: 無い"
grep -rlE "appl_[A-Za-z0-9]" ios/App/App/public >/dev/null && echo "RevenueCat の鍵: 入っている" || echo "RevenueCat の鍵: 無い"
```
どちらかが「無い」なら止まる（ステップ 3 をやり直す）。

## ステップ 5: Xcode の署名（私がやる）
`npx cap open ios` で Xcode を開き、私に次を 1 つずつ案内して、終わるたびに「できた」を待つ:
1. Xcode → Settings → **Accounts** に Apple Developer の Apple ID が入っているか（無ければ ＋ で追加）
2. 左の一覧の **App**（青いアイコン）→ TARGETS の **App** → **Signing & Capabilities**
   - **Automatically manage signing** にチェック
   - **Team** に自分のチームを選ぶ
   - Bundle Identifier が `jp.orime.app` であること
   - **Sign in with Apple** が一覧にあること（無ければ「＋ Capability」で足す）
   - 「＋ Capability」→ **In-App Purchase** を足す
   - 赤いエラー（Provisioning など）が無いこと。出たら、その文を私が読み上げるので、直し方を言う
3. **General** → Version **1.0.0**・Build **1**・Display Name **Orime** になっていること（見るだけ）
4. Xcode を閉じなくてよい

「できた」のあと、チーム ID を読む: `grep -m1 "DEVELOPMENT_TEAM" ios/App/App.xcodeproj/project.pbxproj`（10 文字の英数字。これは秘密ではないので表示してよい）。

## ステップ 6: シミュレータで 1 回起動する（5 分）
```bash
xcrun simctl list devices available | grep -E "iPhone 1[6-9]|iPhone [2-9][0-9]" | head -3
npx cap run ios --target <上で見つけた iPhone シミュレータの ID>
```
起動したら、私に次を見てもらう: ログイン画面が出る（「設定が未完了です」が出ない）・新しいアカウントで本を 1 冊とメモ 1 件が保存できる。購入はシミュレータでは確かめない（実機の Sandbox で私があとでやる）。

## ステップ 7: アーカイブして App Store Connect に上げる
1. 書き出しの設定を作る（`<チーム ID>` はステップ 5 の値）:
```bash
mkdir -p build
cat > build/ExportOptions.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>TEAM_ID_HERE</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
sed -i '' "s/TEAM_ID_HERE/<チーム ID>/" build/ExportOptions.plist
```
2. アーカイブ（10 分ほど）:
```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Orime.xcarchive \
  -allowProvisioningUpdates archive
```
   最後に `** ARCHIVE SUCCEEDED **` が出ること。
3. 上げる:
```bash
xcodebuild -exportArchive -archivePath build/Orime.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates
```
   `** EXPORT SUCCEEDED **` と「Upload succeeded」のような行が出ること。
4. うまくいかないとき:
   - 署名のエラー → ステップ 5 の Team・Capability をもう一度
   - 「このビルド番号は使われている」→ `cd ios/App && xcrun agvtool new-version -all 2 && cd ../..` でビルド番号を 1 つ上げて、2 からやり直す
   - コマンドで上げられない → Xcode の **Window → Organizer** に `Orime` のアーカイブが出ているので、私に「**Distribute App → App Store Connect → Upload**」を押すよう案内する

## ステップ 8: 最後の報告
次を一覧にして報告して終わる:
1. 上げたビルド（バージョン 1.0.0・ビルド番号）
2. 「App Store Connect の TestFlight にビルドが出るまで 10〜30 分。『処理中』が終わったら、ブラウザの作業（バージョン 1.0 の画面でビルドを選ぶ）に進めます」
3. 私が次にやること: ①App Store Connect でビルドを選ぶ ②スクリーンショット（リポジトリの `company/launch-2026-11/screenshots/` の base-1〜6・6.9 インチと 6.5 インチ）とサブスク・追加トークンの審査用の画像を上げる ③審査用のデモアカウント（`company/app-store-submission.md` §7）④「審査に提出」
4. 余裕があれば: 私の iPhone をケーブルでつないで実機で起動し、Sandbox のアカウントで「プランを始める」と「購入を復元」が動くかを確かめる手順を案内する（`docs/iap-setup-runbook.md` の H）
