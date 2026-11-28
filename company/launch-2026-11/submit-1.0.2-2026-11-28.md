# 1.0.2 を申請する（2026-11-28・指示文）

> 2026-11-28 オーナー「OK・提出の手順をまとめて」（提出前の最終検査のあと）。
> 版の数はリポジトリで上げてある：`MARKETING_VERSION = 1.0.2`・`CURRENT_PROJECT_VERSION = 11`・`package.json` 1.0.2。
> 新しい部品 2 つ（`@capacitor/local-notifications`・`@capacitor-community/in-app-review`）も `ios/App/CapApp-SPM/Package.swift` に入れてある（`npx cap sync ios` 済み）。
> 順番：**0 オーナー（Supabase）→ A Mac（作って上げる）→ B オーナー（TestFlight・任意）→ C Chrome の Claude（App Store Connect で審査に出す直前まで）→ オーナーが「審査に提出」**。
> 前の版の手順（`submit-1.0.1-2026-11-25.md`）と違うところだけ書く。分からないところはそちらを見る。

## 先に確かめること：1.0.1 は今どこか

App Store Connect → orime →「iOS App」で、1.0.1 の状態を見る。

| 1.0.1 の状態 | すること |
|---|---|
| **配信準備完了 / App Store で配信中** | このまま 1.0.2 を作る（下の手順どおり） |
| **審査待ち / 審査中** | 1.0.1 の画面で「審査から取り下げる」→ 1.0.2 を作らず、**1.0.1 のビルドを 11 に差し替える**（Xcode の Version を 1.0.1 に戻して Archive）。新機能の文は下の C の文に置き換える |
| **承認済み・手動のリリース待ち** | 先に 1.0.1 を「このバージョンをリリース」→ そのあと 1.0.2 を作る |

## 1.0.2 に入るもの（1.0.1＝ビルド 10・11/24 の朝のあと）

「新しくなったこと」の版 `2026-11-25`〜`2026-11-28d`（更新したあとのシートと設定に出る）。主なもの：
- 本と話す・著者と話す・2 冊の考えをぶつける（相談の最初の画面）／重ねて考える
- 本棚の写真からまとめて追加・バーコードで続けて何冊でも・Kindle と読書メーターのまとめての取り込み・書名の一覧を貼り付けて引越し
- AI 選書を無料プランでも・AI の答えの回数が増えた（1 回 約 3 トークン）
- 知識の地図・記録の作り直し・どこまで読んだか・アーカイブ
- お気に入りの著者の新しい本・QR コードでフォロー・ID を押してコピー
- 期限の日の朝の行動の知らせ・しばらく開かないときの思い出しの知らせ（端末の中だけ・サーバーなし）
- 提出前の最終検査の直し（日本語・初回ガイド・相談の送り・利用規約 11/28 改定）

## 0. オーナー：Supabase（約 5 分）

`submit-1.0.1-2026-11-25.md` の §0 と同じ（指示文もそのまま使える）。
1. `supabase_all_in_order.sql` を流し直す → `supabase_verify_rls.sql` で全部 `t`。
   - 11/25 からの新しい SQL（`supabase_books_progress_archive.sql`・`supabase_hardening_2026_11.sql`・`supabase_admin_retention_days.sql`・`supabase_ai_free_pool.sql`・`supabase_favorite_authors.sql`・`supabase_follows.sql` の直し）が入る。どこまで読んだか・アーカイブ・お気に入りの著者は、流していなくても端末に控えて動くが、ほかの端末に出ない。
2. 審査用のデモアカウントを、審査のあいだだけ有料（`active`）に。承認されたら `canceled` に戻す。

## A. Mac の Claude Code に貼る指示文（そのまま貼れる形は `mac-build-1.0.2-2026-11-28.md`）

---ここから---

orime の iOS 1.0.2（ビルド 11）を作って App Store Connect に上げます。リポジトリは Mac の `~/Documents/leverage-reading` です（ほかの写しは使わない）。

守ること：
- `.env.production.local` の中身は表示しないでください。
- 署名・Apple ID・2 段階の確認を求められたら、止めて私に頼んでください。
- コミットや push はしないでください。

1. `git pull` で main の最新にします。版の数（1.0.2・ビルド 11）はもう上がっています。
2. 確かめます（違う数が出たら止めて報告）。
   - `grep -c '^VITE_FOUNDING_OFFER_END=2027-01-10$' .env.production.local` → `1`
   - `grep -cE '^VITE_SOCIAL=(off|false)' .env.production.local` → `0`
3. `npm ci && npm run build && npx cap sync ios` を流します（新しい部品が 2 つあるので `npm ci` と cap sync を飛ばさない）。
4. 確かめます。
   - `grep -c 'LocalNotifications\|InAppReview' ios/App/CapApp-SPM/Package.swift` → `4`
   - `grep -A1 NSCameraUsageDescription ios/App/App/Info.plist` に「QR コード」が入っている
   - `node scripts/ios-prepare.mjs --check` →「iOS の準備はそろっています。」
   - `grep -l "2026-12-16" dist/assets/*.js` が何も出さない
5. Archive します：`xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj` → `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' clean archive -archivePath build/App.xcarchive`。`errSecInternalComponent` が出たら `security unlock-keychain ~/Library/Keychains/orime-build.keychain-db` のあとにやり直すか、Xcode の Product → Archive で（窓が出たら orime-build のパスワード →「常に許可」）。エラーは `error:` の行と前後 5 行をそのまま報告。
6. Organizer → Distribute App → App Store Connect → Upload。
7. 報告：ビルド番号（1.0.2 (11)）と、アップロードが終わったか。

---ここまで---

## B. オーナー：TestFlight（任意・約 10 分）

11/28 に「iPhone での確認なしで進める」と決めたので任意。触るなら次の 5 つだけ：
- [ ] 更新したあとに開くと「新しくなったこと」が出る
- [ ] 設定 → プロフィール → フォロー →「ID・QR コードでフォロー」の QR の印 → カメラが開き、相手の QR を読める（カメラの許可の文に「QR コード」）
- [ ] 同じ画面の「あなたの ID」を押すと「ID をコピーしました。」
- [ ] 相談で返事を書きかけてキーボードを閉じると、答えの上の名前の行が切れない
- [ ] 設定 → 通知 をオンにすると、許可の窓が 1 回出る

## C. Chrome の Claude に貼る指示文（App Store Connect）

**貼る指示文は `chrome-submit-1.0.2-2026-11-28.md`（そのまま貼れる形にした）。** 以下はその中身の要点＝`submit-1.0.1-2026-11-25.md` の C との違い：
- 「バージョン **1.0.1**」→「バージョン **1.0.2**」、ビルドは **1.0.2 (11)**
- 作業 2（名前を小文字に）は、1.0.1 で済んでいれば飛ばす
- 【新機能】を下の文に
- 【審査メモに足す】を下の文に（1.0.1 の 3 行は消して入れ替える）
- 説明文（概要）は変えない。スクリーンショットも今のまま（作り直すなら、新しく登録した人の状態で撮る＝お試しのデータの「いちばん古いのは 6 か月前」を写さない）

**最後の「審査用に追加」「審査に提出」は、押す直前に止まって私に聞く**（指示文の決まりのまま）。

【新機能】
```
・相談で、本や著者と話せるようになりました。2 冊を選んで、考えをぶつけることもできます（答えは AI の解釈です）。
・家の本棚を撮ると、背表紙から何冊もまとめて本棚に入れられます。バーコードも続けて読み取れます。
・ブクログ・読書メーター・Kindle の記録を、もっとまとめて取り込めるようになりました。
・AI 選書を無料プランでも使えるようになり、AI の答えの回数も増えました。
・知識の地図で、読んできた本とメモのつながりを眺められます。どこまで読んだかの記録と、アーカイブも。
・お気に入りの著者の新しい本を、ホームでお知らせします。
・QR コードでフォローし合えるようになりました。ID は押すだけでコピーできます。
・言葉づかいと使い心地を全体に見直しました。
```

【審査メモに足す】
```
1.0.2 の変更: 相談に「本と話す」「著者と話す」を加えました。答えはどれも「AI の解釈で、著者本人の言葉ではありません」と画面に明記し、本人として名乗りません。
「本棚の写真からまとめて追加」とフォローの QR コードの読み取りでカメラを使います（写真は書名を読むためだけに AI へ送り、保存しません。AI に送る前に同意を確認します）。
思い出しと行動の期限の知らせは、端末の中だけの通知です（オンにしたときだけ・サーバーから送りません）。
デモアカウントは前回と同じです（課金済みの状態）。
```

## D. 申請のあと

- 審査は 1〜2 日。承認されたら「このバージョンをリリース」（手動）。
- 承認されたらデモアカウントを `canceled` に戻す。
- 差し戻されたら、届いた文をそのまま Claude に貼る。
