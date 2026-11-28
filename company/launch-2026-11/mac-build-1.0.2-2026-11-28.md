# Mac の Claude Code に貼る指示文：1.0.2（ビルド 11）を作って上げる（2026-11-28）

> 使い方：Mac で Claude Code を `~/Documents/leverage-reading` で開き、下の「ここから」〜「ここまで」をそのまま貼る。
> 版の数（1.0.2・ビルド 11）と新しい部品 2 つ（端末の中の通知・レビュー依頼）は、リポジトリで入れてある＝Mac では上げない。
> 終わったら `chrome-submit-1.0.2-2026-11-28.md` を Chrome の Claude に貼る。

---ここから---

orime の iOS 1.0.2（ビルド 11）を作って App Store Connect に上げます。リポジトリは Mac の `~/Documents/leverage-reading` です（`~/leverage-reading` と `~/Downloads/leverage-reading` は古い写しなので使わない）。

守ること：
- `.env.production.local` の中身は表示しないでください（下に書いた grep の数だけを見ます）。
- 署名・Apple ID・2 段階の確認・保管庫のパスワードを求められたら、止めて私に頼んでください。
- コミットや push はしないでください。ファイルを直す必要が出たら、直す前に私に聞いてください。
- エラーが出たら、`error:` の行とその前後 5 行をそのまま報告してください。

1. 最新にする
   - `cd ~/Documents/leverage-reading && git status --short` で、手で直したファイルが無いかを見ます（あれば一覧を報告して止まる）。
   - `git pull` で main の最新にします。
   - `grep -E 'MARKETING_VERSION|CURRENT_PROJECT_VERSION' ios/App/App.xcodeproj/project.pbxproj | sort -u` → `MARKETING_VERSION = 1.0.2;` と `CURRENT_PROJECT_VERSION = 11;` だけが出ること。

2. 値を確かめる（違う結果なら止めて報告）
   - `ls .env.production.local` → ファイルがあること
   - `grep -cE '^VITE_(SUPABASE_URL|SUPABASE_ANON_KEY|REVENUECAT_IOS_KEY)=.+' .env.production.local` → `3`
   - `grep -E '^VITE_FOUNDING_OFFER_END=' .env.production.local | grep -vc '=2027-01-10$'` → `0`（行が無いか、2027-01-10 のどちらか）
   - `grep -cE '^VITE_SOCIAL=(off|false)' .env.production.local` → `0`

3. 作る
   - `npm ci && npm run build && npx cap sync ios`（新しい部品が 2 つあるので、`npm ci` と `cap sync` を飛ばさない）

4. 確かめる（違う結果なら止めて報告）
   - `grep -c 'LocalNotifications\|InAppReview' ios/App/CapApp-SPM/Package.swift` → `4`
   - `grep -A1 NSCameraUsageDescription ios/App/App/Info.plist` に「QR コード」が入っている
   - `node scripts/ios-prepare.mjs --check` →「iOS の準備はそろっています。」
   - `grep -l "2026-12-16" dist/assets/*.js` → 何も出ない
   - `grep -l "2027-01-10" dist/assets/*.js | head -1` → ファイル名が 1 つ出る
   - `grep contentInset ios/App/App/capacitor.config.json` → `"contentInset": "never"`
   - `git status --short` → `ios/App/App/public` 以外に変わったファイルが無い（あれば一覧を報告。止まらなくてよい）

5. Archive する
   - `xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj`
   - `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' clean archive -archivePath build/App-1.0.2-11.xcarchive`
   - `errSecInternalComponent` が出たら、保管庫の鍵がかかっています。私に「`security unlock-keychain ~/Library/Keychains/orime-build.keychain-db` を流してください」と頼んで止まってください（パスワードは私が入れます）。私が流したらもう一度 Archive します。
   - それでも通らなければ、「Xcode の Product → Archive で作ってください」と私に頼んで止まってください（窓が出たら私が orime-build のパスワード →「常に許可」を押します）。
   - 署名の保管庫は orime-build だけを使います。「ログイン」と orime-signing の保管庫は署名に使わず、消したり探す一覧から外したりもしないでください。

6. 上げる
   - `open build/App-1.0.2-11.xcarchive` で Xcode の Organizer を開き、私に「Distribute App → App Store Connect → Upload を押してください」と頼んで止まってください（私が押します）。
   - または `xcodebuild -exportArchive` で上げられる設定（`ExportOptions.plist` の method が app-store-connect・destination が upload）がすでにあれば、それで上げてもかまいません。無ければ作らずに、上の Organizer の道にしてください。

7. 報告
   - ビルド番号（1.0.2 (11)）
   - 1〜4 の確かめの結果（全部合っていたか・違ったものは何か）
   - Archive とアップロードが終わったか（Organizer で私が押す場合は「押してもらう前で止まった」と）
   - エラーは文のまま

---ここまで---

## 上げたあと（オーナー）

- App Store Connect の TestFlight に 1.0.2 (11) が出るまで 15〜30 分。出たら `chrome-submit-1.0.2-2026-11-28.md` を Chrome の Claude に貼る。
- iPhone で触るなら（任意）: 更新したあとの「新しくなったこと」・フォローの QR の読み取り・ID を押してコピー・相談でキーボードを閉じたときの名前の行・設定 → 通知 をオンにしたときの許可の窓。
