# Mac の Claude Code に渡す指示文（ビルド 7 を作って App Store Connect へ上げる・2026-11-21）

> 使い方: Mac のターミナルで作業用のフォルダ（例 `~/dev`）に移って `claude` を起動し、下の「---」から最後までを全部貼る。
> 11 月 19 日の差し戻し（5.1.1(v)・2.1(a)・2.1(b)）の直しが入ったビルド。くわしくは `review-2026-11-19.md`。

---

あなたは私の Mac で、iPhone アプリ「Orime」（React + Vite を Capacitor で包んだアプリ・リポジトリ `abefmy0502-lab/leverage-reading`）の **バージョン 1.0.0・ビルド 7** を作り、App Store Connect に上げます。前のビルド 6 は審査で差し戻されました。審査への提出は私がブラウザでやるので、あなたは**ビルドを上げるところまで**です。

## 守ること
- **鍵の値をチャットに出さない・聞かない**。確かめるときは「入っている／空」だけを言い、値は表示しない（`cat` しない・`echo` しない）。
- **コミット・push はしない**（Xcode が変えた `project.pbxproj` も含む）。`.env.production.local` は git に入れない。
- コードは直さない。ビルドやテストが失敗したら、エラーの要点を見せて、直し方の案を出して止まる。
- Xcode とシミュレータの画面の操作は私がやる。何をどこで押すかを 1 つずつ言って、私の「できた」を待つ。
- 迷ったら勝手に決めずに聞く。各ステップが終わるたびに 1〜2 行で報告する。

## ステップ 1: 道具を確かめる
```bash
xcodebuild -version        # Xcode 26 以降
node -v                    # v20 以降
xcode-select -p            # /Applications/Xcode.app/... であること
```
足りなければ止まって入れ方を案内する。

## ステップ 2: 最新のコードにする
- `leverage-reading` が無ければ: `git clone https://github.com/abefmy0502-lab/leverage-reading.git && cd leverage-reading`
- あれば: `cd leverage-reading && git status --short` で手元の変更を見る。`ios/` 以外の変更があれば止まって私に聞く。`ios/` の変更（前回 Xcode が書き換えたもの）だけなら `git checkout -- ios` で捨ててから `git checkout main && git pull`
- 次を報告する:
```bash
git log --oneline -1
grep -c "CURRENT_PROJECT_VERSION = 7;" ios/App/App.xcodeproj/project.pbxproj   # 2 であること（ビルド 7）
grep -m1 "MARKETING_VERSION" ios/App/App.xcodeproj/project.pbxproj             # 1.0.0
```

## ステップ 3: 鍵のファイルを確かめる（値は出さない）
```bash
for k in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_REVENUECAT_IOS_KEY; do
  v=$(grep -E "^$k=" .env.production.local 2>/dev/null | head -1 | cut -d= -f2-)
  if [ -n "$v" ]; then echo "$k: 入っている（${#v} 文字）"; else echo "$k: 空か無い"; fi
done
grep -q '^VITE_REVENUECAT_IOS_KEY=appl_' .env.production.local && echo "RevenueCat の鍵は appl_ で始まる" || echo "RevenueCat の鍵が appl_ で始まらない"
grep -E '^VITE_(RELEASE_NOTES_SINCE|FOUNDING_OFFER|FOUNDING_OFFER_END|SITE_URL)=' .env.production
```
空や形の違いがあれば、`open -e .env.production.local` で開き、私に足りない行だけを書いてもらう（`VITE_SUPABASE_URL=https://tkrinnopfssdibgxuqzl.supabase.co`・`VITE_SUPABASE_ANON_KEY=`＝Supabase の anon public・`VITE_REVENUECAT_IOS_KEY=`＝RevenueCat の `appl_…`）。`VITE_NATIVE_PUSH` は**入れない**。

## ステップ 4: 作る
```bash
npm install
```
- ログに **`[patch-apple-sign-in] Plugin.swift を直しました`**（2 回目からは「直してあります」）が出ることを確かめて報告する。これが「Apple でサインインが『サインイン中…』のまま進まない」（2.1(a)）の直し。
```bash
node scripts/patch-apple-sign-in.mjs --check   # 「直してあります」であること。違えば node scripts/patch-apple-sign-in.mjs を打ってもう一度
npx vitest run                                  # 全部 passed
npm run build
npx cap sync ios                                # 必ず npm install（patch）のあと
npm run ios:prepare -- --check                  # 「iOS の準備はそろっています。」
grep -rl "tkrinnopfssdibgxuqzl" ios/App/App/public >/dev/null && echo "Supabase の URL: 入っている" || echo "Supabase の URL: 無い"
grep -rlE "appl_[A-Za-z0-9]" ios/App/App/public >/dev/null && echo "RevenueCat の鍵: 入っている" || echo "RevenueCat の鍵: 無い"
```
どれかが違えば止まる。

## ステップ 5: Xcode の署名を確かめる（私がやる）
`npx cap open ios` で Xcode を開き、次を 1 つずつ案内して「できた」を待つ:
1. 左の **App** → TARGETS の **App** → **General**: Version **1.0.0**・Build **7**・Display Name **Orime**（見るだけ）
2. **Signing & Capabilities**: Automatically manage signing にチェック・Team が選ばれている・Bundle Identifier が `jp.orime.app`・**Sign in with Apple** と **In-App Purchase** がある・赤いエラーが無い（出たら私が文を読み上げるので直し方を言う）

「できた」のあと、チーム ID を読む: `grep -m1 "DEVELOPMENT_TEAM" ios/App/App.xcodeproj/project.pbxproj`（`85Q7Q562A4` のはず・秘密ではない）。

## ステップ 6: iPad のシミュレータで、差し戻された 3 つを確かめる（私が操作する）
```bash
xcrun simctl list devices available | grep -iE "iPad Air|iPad Pro|iPad \(" | head -5
```
iPad Air 11-inch (M3) があればそれ、無ければいちばん新しい iPadOS の iPad を選び、`npx cap run ios --target <ID>` で起動する。先に私に「シミュレータの『設定』アプリで Apple ID にサインインしておいてください」と伝える。

私に次の 3 つを順に試してもらい、それぞれ「できた／できなかった（画面の文）」を聞く:
1. ログインの画面の **「Appleでサインイン」** → Apple の画面が出て、終わるとホームに入る（もう一度試すときは、キャンセルしたらボタンが元に戻ることも見る）
2. アプリを消して入れ直す（`xcrun simctl uninstall booted jp.orime.app` のあと同じ `npx cap run`）→ **「登録せずに始める」→「同意して始める」** → ホームに入る → 右上の自分のアイコン → いちばん上が「アカウントを作っていません」
3. そのまま「プラン・お支払い」→ **「プランを見る」** → 月額・年額の値段が出る（シミュレータで値段が出ないときは、そう報告して先へ進んでよい。実機の Sandbox で私があとで確かめる）

1 か 2 ができなければ、**アップロードせずに止まる**（画面の文とログの要点を見せる）。iPadOS 27 で確かめられなかったときは、その事実を最後の報告に書く。

## ステップ 7: アーカイブして上げる
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
  <key>teamID</key><string>85Q7Q562A4</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST
rm -rf build/Orime.xcarchive build/export
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Orime.xcarchive \
  -allowProvisioningUpdates archive
```
`** ARCHIVE SUCCEEDED **` を確かめてから:
```bash
xcodebuild -exportArchive -archivePath build/Orime.xcarchive \
  -exportOptionsPlist build/ExportOptions.plist -exportPath build/export \
  -allowProvisioningUpdates
```
`** EXPORT SUCCEEDED **` と Upload の成功の行を確かめる。

うまくいかないとき:
- 署名のエラー → ステップ 5 をもう一度
- 「このビルド番号は使われている」→ 止まって私に聞く（7 が使われているなら 8 にする: `cd ios/App && xcrun agvtool new-version -all 8 && cd ../..` のあと、ステップ 4 の `npm run build && npx cap sync ios` からやり直す）
- コマンドで上げられない → Xcode の **Window → Organizer** に Orime のアーカイブがあるので、私に「**Distribute App → App Store Connect → Upload**」を押すよう案内する

## ステップ 8: 最後の報告
1. 上げたビルド（1.0.0 の何番か）
2. ステップ 6 の 3 つの結果と、確かめた iPad と iPadOS の版
3. 「10〜30 分で App Store Connect の TestFlight に出ます。『処理中』が終わったら、Chrome に `company/launch-2026-11/review-2026-11-19.md` の『Chrome への指示 B』を渡してください（ビルドを付け替え・返事の英文・提出の直前で止まる）」
