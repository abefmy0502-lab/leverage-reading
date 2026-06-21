/**
 * Help Content for Leverage Reading App
 *
 * 更新履歴:
 * - 2026-06-21: 🧠 マイ読書脳の回答ストリーミングを途中で止められるようにした (UX 改善)。長い AI 回答の生成中、送信ボタンが「中止」(■) ボタンに変わり、押すとその時点までの内容で確定して入力可能状態に戻る (streamClaude に AbortSignal を配線、abort はエラー扱いせず部分テキストを保持して onDone で正常終了 → ai.js streamMyBookBrain が partial body を返す → MyBookBrain が中止注記付きで DB 保存)。あわせてチャットのアクセシビリティを強化 — 会話スクロール領域に role="log" + aria-live="polite" + aria-busy、各メッセージに role="article" + ラベル、ストリーミング中は aria-busy で読み上げの過剰更新を抑制。履歴ビュー / AI 選書の会話履歴 (AdvisorHistory) にも region/article role を付与。myBookBrain ヘルプの「質問する」ステップに中止できる旨を追記
 * - 2026-06-21: 🌱 コールドスタート（新規ユーザーが本0冊・メモ0件で核価値を体感できない）の緩和。説明で終わらせず「行動」に繋ぐ軽い改善を追加。(1) オンボーディング最終カードの主 CTA を「📚 さっそく1冊、追加してみる」に変更し、閉じた直後に本追加（AddBookModal）を直接開くよう配線（onStart）。(2) 本棚の空状態コピーを価値先行＋「あとで想起として戻ってくる」予感つきに刷新（「まずは1冊、置いてみましょう」＋「最初の1冊を追加」）。(3) reading/done のカード式メモ空状態を「気になった一行を残すと、あとで振り返りの想起として戻ってくる」導線に変更。(4) マイ読書脳のメモ0件時に、質問例より先に「まずは1冊、メモを残すところから」を促す案内へ差し替え（空振り防止）。ユーザー可視フロー変更につき bookList / bookDetailReading / memoEditor / myBookBrain のヘルプを同期
 * - 2026-06-21: 💴 Web（Stripe）ソフトローンチに向けた価格改定 + 法務のチャネル整合。表示価格を月額 ¥990 →¥1,280（税込）/ 年額 ¥10,800（税込・月あたり約¥900）に更新（決済額は Stripe Price 設定が真実 — 表示コピーのみ変更）。billing ヘルプキーの「価格について」「お支払いについて（クレジットカード/Stripe 明記）」「解約・カードの変更（Stripe プラン管理ページ）」を新価格・Web チャネル前提に同期。あわせて billing.js の PLAN_LABELS 既定値を更新し「1 日約33円」の安さ訴求を削除（控えめな安心文言「いつでも解約OK・データは残ります」に置換）。LP（Landing.jsx）の「1 日 ¥33」「缶コーヒー 1 本より安く」「ビジネス書 1 冊の 1/1.65」等の安さフレーミングを全削除し、価値＋安心（10秒で解約・違約金ゼロ・データ保持）に置換。法務（TermsPage 第4〜6条 / SctPage / legal/terms.md / legal/tokushoho.md）を Web=Stripe(クレカ)/App=各ストア IAP の両チャネル併記に整合（価格・決済・自動更新・解約・返金・Apple EULA の適用範囲を明確化）。プライバシーポリシーの委託先一覧は価格非依存のため変更なし
 * - 2026-06-21: 💳 Web 版収益化（Stripe ソフトローンチ）。全機能有料のハードペイウォールを導入。認証済みかつ未課金（useSubscription の !isActive && !loading）のとき本棚等の手前で全画面ペイウォール `<Paywall>` を表示（loading 中はスピナー、isActive で通常アプリ）。月額＋年額の 2 プラン対応（価格非依存 — Stripe Price ID は env `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_ANNUAL` で指定、旧 `STRIPE_PRICE_ID` は monthly フォールバック。表示ラベルは `PLAN_LABELS`／env `VITE_PRICE_MONTHLY_LABEL` 等で、実価格は Stripe 側が真実）。ペイウォールは brand-messaging 準拠の静かな構成（価値プレビュー 4 点＋年額主役/月額控えめ＋解約自由・データ保持の安心コピー）。AccountSettings に「💳 プラン」セクション（状態 / 次回更新日表示・Customer Portal 導線・未課金時のアップグレード導線）を追加。Checkout 復帰（?checkout=success）は webhook 反映ラグ対策で refresh を数回リトライ、?checkout=cancel は静かに戻す。詰み防止: subscriptions テーブル未適用（schema-error）時は判定不能とみなして fail-open（ロックせず通す）。ユーザー可視の課金 UI 追加に伴い `billing` ヘルプキーを新設。CLAUDE.md のヘルプキー表にも追記
 * - 2026-06-21: アクセシビリティ・ハードニング（ローンチ品質）。(1) ユーザー可視の機能ラベル「レバレッジメモ」→「まとめメモ」に統一（本詳細の📝 まとめメモ見出し / 読了の AI 要約説明文 / 本詳細フォームの Field ラベル / 振り返りタブの派生ノート種別ラベル）。ヘルプ本文は既に「まとめ式メモ / まとめメモ」表記で整合済みのため文言変更不要、該当キー（bookDetailReading / bookDetailDone）の lastUpdated のみ更新。書名「レバレッジ・リーディング」/ DB 列 `leverage_memo` / `localStorage.leverageMemoMode` / CSS 接頭辞（lvg-）/ 本田直之氏の引用は不変。(2) タップ領域を iOS HIG の 44px に拡大（本棚/詳細/ヘッダー/メモ/行動/知識管理/トースト/更新バナー/認証/オンボーディングの各小ボタン・ケバブ・ソートタブ・ステータスピル）。(3) iOS 入力ズーム防止のため select/input の font-size を 16px に揃え（本棚ソート / 行動ソート / ヘルプ AI 質問欄）。(4) セーフエリア対応（認証フルスクリーン / 各モーダルヘッダー / マイ読書脳の入力欄を env(safe-area-inset-*) で iPhone ノッチ・ホームインジケータから保護）。(5) 破壊操作の視認性統一 — 確認ダイアログの削除ボタンを赤（--color-error）に、行動削除の確認をアプリ標準の確認ダイアログに置換（挙動は厳密維持）
 * - 2026-06-21: サービス名を「レバレッジ読書ログ」→「Orime」へリブランド。ユーザー可視のサービス名表記（PWA 名 / タイトル / LP / 認証画面 / スプラッシュ / 法的ページ / ヘルプ見出し / AI プロンプト内のアプリ名）を Orime に統一。あわせて LP（Landing.jsx）のコピーを法務 de-risk — 断定的な成果・倍率・損失額（「年収 10 万円に変える」「精度が 10 倍」「捨てられる金額 ¥4,702」「100% を資産化」等）を排し、誠実な訴求（「読みっぱなしを、やめる。」「精度が上がる」「活かしきれていないかもしれない金額（参考）」等）に調整。価格 ¥990 / 1 日 ¥33 / 解約自由 / データ保持 / 違約金ゼロは安心訴求として明記を維持。bookList ヘルプの title を「Orime の使い方」に更新。"レバレッジ・リーディング"（書名）/ "レバレッジメモ"（機能名）/ "レバレッジ化"（手法概念）はサービス名ではないため温存。コード識別子 / localStorage キー / DB 列 / CSS 接頭辞（lvg-）/ メールアドレス等の技術文字列は不変
 * - 2026-06-21: AI 利用量の月次上限（KGI 原価ガード）を導入。Claude API のコスト暴走（連打）を止めるランナウェイガードとして、api/claude.js に「月次の累積コール上限」(`AI_MONTHLY_CALL_LIMIT`、既定 120 回/月、env で可変) を追加。getUser 成功後・既存の分間レート制限と整合する位置で当月の利用回数を確認し、上限超過なら 429 +「今月の AI 利用上限に達しました。来月またご利用いただけます。」を返す。未超過なら成功後に service_role で原子的に +1（`increment_ai_usage` RPC）。堅牢性最優先で fail-open（usage 取得/加算がエラー or テーブル未適用なら通す）+ schema-fallback。新規 `supabase_ai_usage.sql`（`ai_usage(user_id, period_month 'YYYY-MM', calls)` + RLS: SELECT 本人のみ / 書き込み service_role のみ）。クライアントは ai.js / streamClaude.js の 429 ハンドラで `monthly_limit_exceeded` のサーバー文言を優先表示。上限は normal user がまず到達しない寛容値（通常 AI 利用は月数回）。ユーザー可視挙動のため myBookBrain / aiAdvisor のヘルプに「月の利用上限がある」旨を一文追記
 * - 2026-06-21: 「読みたい」「読書前」状態の本詳細に、メモが追加できない理由の控えめなヒントを明確化。アプリ側 (App.jsx の want/before メモ空状態) の文言を「『読書中』にすると ＋ ボタンからメモを追加できます」に統一したのに合わせ、bookDetailWant の「📝 メモは？」セクションと bookDetailBefore の「次のステップ」セクションに ＋ ボタンの存在を追記 (初回ユーザーが「メモできない」と誤解しないよう導線を明示)
 * - 2026-05-24: 続編 / 巻数違い (例: 「1分で話せ」と「1分で話せ2」) を別書誌として扱うように修正。旧 `isStrictMatch` (App.jsx) / `titleSimilarity` → `isSameBook` (bookSearch.js) は `longer.startsWith(shorter)` かつ shorter/longer ≥ 0.7 で同一書誌扱いにしていたため、「1分で話せ2」が「1分で話せ」の候補に紛れ込み AdvisorAddConfirmModal や findIsbnCandidates が誤 ISBN を採用、結果として続編の表紙が保存される事故が起きていた。新規 helper `_suffixIsVolume` / `suffixIsVolume` を追加 — `longer.startsWith(shorter)` の時に続く部分が「数字 (1〜9 / NFKC で半角化された全角数字 / ローマ数字 ii-xii) / 上 / 下 / 前編 / 後編 / 続編 / 完結編 / 外伝 / 新章 / 別巻 / 超 / vol / part / book / chapter / episode」のいずれかで始まる場合は false を返して別書誌扱いにする。逆に「新装版 / 改訂版 / 文庫版 / 完全版」のような同内容の異版表記は flag しないので、これらは引き続き元と同じ書誌扱い (0.7 ratio で別途絞り込まれる)。修正対象は AI 選書 → 候補絞り込み (`AdvisorAddConfirmModal` への candidates) / addFromAdvisor 内部の strict match 検索 / addRelatedBookFromAi の strict match 検索 / fullyResolveCover が呼ぶ `findIsbnCandidates` の候補フィルタの 4 経路すべて
 * - 2026-05-24: AI 選書の表紙が「自動取得できませんでした」になる問題を修正 (前コミット 67be9b6 の eager seed バグ rollback)。eager seed で `getCoverCandidates(isbn)[0]` を validation なしに保存していたため、Google Books に無い本では 128×170 PNG の "No cover available" プレースホルダー URL が DB に焼き込まれ、その後の `resolveCoverInBackground` は `saved.cover` が truthy なのでスキップしてしまい、表紙が永遠に直らない状態になっていた。さらに `refreshCoverFor` (🔄 表紙を取り直す) で fullyResolveCover を呼び直すと Google Books URL / Amazon / openBD すべてプレースホルダー / 1×1 / 404 で「自動取得できませんでした」が出る。修正: addFromAdvisor / addRelatedBookFromAi で `tryCoverForIsbn(isbn)` を `await` で同期実行し、`checkImageExists` の実在検証 (w≥50 + h/w≥1.35) を通った URL のみを cover に焼き込む。検証に通らなければ cover='' (本棚はカラフルグラデーション placeholder を出す)。レイテンシは 1〜2 秒 (画像 load + 3 秒 timeout × 候補数)。BookCard の `<img onLoad>` も Google Books 128×170 placeholder を弾く 1.35 閾値に強化したので、過去にバグ版で焼き込まれた placeholder URL の本も次回描画時に setBroken → enqueueCoverRetry が走り自動で gradient placeholder に縮退する
 * - 2026-05-24: AI 選書 / 関連書籍から追加した本に表紙が付かない問題を修正。openBD の cover enrichment が死んでいるため bookSearch.js が返す `result.cover` が常に空文字になり、addFromAdvisor / addRelatedBookFromAi は `newBook.cover = ''` のまま保存していた (bg resolver は後追いで動く保険でしかないため、ユーザーの体感は「表紙なし」のまま)。一方 pickBookFromAdd (本棚 + 本を追加 → 検索 → 選択) は `getCoverCandidates(isbn)[0]` を seed していたので手動経路では表紙が付いていた。今回 AI 経路にも同じ seed ロジックを入れた — verifiedIsbn が決まった瞬間に Google Books の直リンク URL (現状の表紙ソース 1 番手) を newBook.cover に焼き込み、保存時点で本棚に表紙が出るようにする。一次経路 (AdvisorAddConfirmModal で候補を選んだ時) + 二次経路 (modal skip → addFromAdvisor 内部で strict-match 検索で ISBN を発見した時) + 関連書籍経路 (addRelatedBookFromAi) の 3 箇所すべて
 * - 2026-05-24: 重複検出を ISBN-10 / ISBN-13 横断で効くように強化。`src/lib/checkDuplicate.js` の `normalizeIsbn` が今までハイフン剥がしだけだったため、同じ本を ISBN-10 文字列で 1 回、ISBN-13 文字列で 1 回保存すると別書誌扱いになっていた (例: `4492045775` ↔ `9784492045770`)。新規 helper `isbn10to13` で EAN-13 アルゴリズムでチェックディジット再計算 → どちらの入力も `978...` の正規 ISBN-13 にキャノニカライズ。`X` 末尾 ISBN-10 (`0306406152` 等) にも対応。これで `findDuplicateBook` / AddBookModal の「✅ 追加済み」バッジ / `handleDuplicateGate` / `addFromAdvisor` / 関連書籍追加すべての経路が同一書誌をひと括りで扱う。DB の UNIQUE 制約 (`books_user_isbn_unique`) は格納文字列に依存するので app 層の方が広く拾うが、UI ダイアログ → 既存本にジャンプの体験は保たれる
 * - 2026-05-24: 表紙取得が一斉に失敗していた問題を緊急修正。原因は外部依存の `cover.openbd.jp` が CloudFront で 404 を返すようになり (api.openbd.jp の summary.cover も空になった)、本アプリで最優先の表紙ソースが死んでいたこと。対応: `src/lib/bookCover.js` の `getCoverCandidates` に Google Books 直リンク (`books.google.com/books/content?vid=ISBN{ISBN}&printsec=frontcover&img=1&zoom=1`) を最優先で追加、Amazon ISBN-10 パターンは二番手、openBD は最下位に降格 (将来復旧したら自動的に再活用)。`checkImageExists` の h/w 閾値を 0.8 → 1.35 に厳格化して Google Books の「No cover」プレースホルダー (128×170 PNG、h/w 1.33) を弾く。既存 DB の openBD URL は `<img onError>` → `enqueueCoverRetry` → `resolveCoverFromCandidates` の経路でセッション内 1 回まで自動で Google Books URL に置換される (手動アップロード `coverIsbn='manual'` は保護)。CSP は `img-src` に既に `books.google.com` が入っていたため変更不要
 * - 2026-05-24: 全 AI 機能のストリーミング化 (TTFT 最短化)。AI 選書 / マイ読書脳 / 読書計画シート の 3 機能で、Claude の応答を Server-Sent Events で逐次受信し、文字が届く端から画面に流す。新規 `src/lib/streamClaude.js` (Supabase access token 付きで /api/claude にストリーミング POST、Anthropic SSE の content_block_delta を解釈して onChunk を発火)、`api/claude.js` に `stream: true` の場合の SSE パススルー (Content-Type / Cache-Control / X-Accel-Buffering ヘッダ + flushHeaders で Vercel の edge buffering を無効化)、`src/lib/ai.js` の callMyBookBrain を buildBrainContext + callMyBookBrain + streamMyBookBrain に分割 (memos/books 取得は共有、transport だけ差分)。UI: BookAdvisor / MyBookBrain は送信直後に空の assistant 吹き出しを追加 → skeleton + 「📚 過去の本を検索中…」「🧠 あなた専用の回答を生成中…」段階表示 → 文字が来始めたら点滅カーソル付きでテキストを伸ばす。読書計画シート (runAnalysis / runStrategy / runStrategyEdit) は form.aiAnalysis / aiStrategy へ逐次書き込み、MarkdownSections が 1 chunk ごとに progressive render。RECOMMENDATIONS_START..END / REFS_START..END は streaming 中は stripRecommendationsBlock / stripRefsBlock で隠し、onDone でだけパースしてカード化 (途中の不完全な JSON で UI が壊れる事故を防止)。関連書籍カードの「📚 読みたい」ボタンは aiLoading 中は無効化 (onAddRelatedBook を渡さず通常見出しに縮退)。新規 CSS: `.streaming-cursor` (点滅) / `.ai-thinking` + `.ai-thinking-dot` (pulse) / `.ai-skeleton` + `.ai-skeleton-line` (shimmer)、すべて transform/opacity/background-position だけで GPU 駆動 + prefers-reduced-motion 抑制を継承
 * - 2026-05-04: LP 購買率最適化リライト (13 → 9 セクション)。【削除】outcome / use-case timeline / use-list / guarantee (Pricing 内に統合) / philosophy → 222 行カット。【書き換え】Hero: 「読みっぱなしの本、もう作らない」→「本 1 冊を、年収 10 万円に変える」+ 「読書を、最強の自己投資に」eyebrow + clamp() で巨大見出し (36-56px)。Pain: 73%/68%/81% の調査データ → 損失計算機 (¥4,702/月 が "捨てられている" を視覚化、損失回避フレーミング)。Pricing: ¥1,000/月 → ¥33/日 を主役表示 + 缶コーヒー比較 + 3 つの保証 (1 タップ解約 / 違約金ゼロ / データ保持) を Pricing 内に grid 統合。FAQ: 7 → 4 問に圧縮。Final CTA: 「読書を、投資にする」→「今日の ¥33 が、1 年後のあなたを変える」。【追加】cta-secondary (Pain 末尾)、cta-large (Pricing/Final で full-width 大ボタン)、guarantee-row (3 列 / 狭幅で縦並び)。【意図的に省略】trust-bar (実数値が無い段階で fake metrics を入れない方針 — TODO コメントで disabled mount を残置)、「値上げの可能性」FOMO (発表事実が確定するまで書かない)。SW v46 → v47
 * - 2026-05-04: 関連書籍ボタンの縦割れ表示修正 + ラベル統一短縮。スクショで「Amazon で買 / う」のように 1 ボタンが 2 行に分裂する症状を確認。RelatedBookCard (MarkdownSections.jsx) の関連書籍カード内で `flexWrap: 'wrap'` + 長いラベル + 狭幅で縦割れが発生していた。修正: (1) ラベル短縮 — 「📚 読みたいに追加」→「📚 読みたい」、「🛒 Amazon で買う」→「🛒 Amazon」を 3 箇所 (BookAdvisor / AdvisorSessionDetail / RelatedBookCard) すべてで統一。(2) `whiteSpace: 'nowrap'` を全ボタン style に追加 — 物理的に文字途中改行を禁止。(3) RelatedBookCard 行から `flexWrap: 'wrap'` を撤去、padding を 8px 14px → 10px 12px に微調整、minWidth: 0 で flex 子要素が縮小可能に。(4) Amazon 外部リンクにも `e.stopPropagation()` + `touchAction: manipulation` を追加。aria-label は「読みたいに追加」のフル文言を維持 (スクリーンリーダー向け配慮)。SW v45 → v46
 * - 2026-05-04: 全「📚 読みたいに追加」ボタンに iOS タップ性能 + イベント防御を強化。(1) 3 箇所すべて (BookAdvisor live chat / AdvisorSessionDetail history card / RelatedBookCard 読書計画シート関連書籍) の onClick に `e.stopPropagation()` を追加 — 親要素の click ハンドラに食われる事故を防止。(2) `type="button"` 明示 + `touchAction: 'manipulation'` (iOS Safari の 300ms ダブルタップ遅延を撤去) + `WebkitTapHighlightColor` で視覚的な押下フィードバック + `minHeight: 44` (iOS HIG の最小タップ領域)。(3) BookAdvisor handleClickAdd と addRelatedBookFromAi の冒頭に `haptic.light()` を追加 — 画面の見た目とは別経路でタップ受付を即時 ack (UI 反映が遅れて見える場合の補強)。BookAdvisor は同 file 内のため `useHaptic()` を component scope で呼び出して `advisorHaptic` 経由で参照。SW v44 → v45 で busting
 * - 2026-05-04: 本詳細のフェーズ遷移時にスクロールトップへ + メモエディタ診断ログ追加。(1) AuthedApp に `detailScrollRef` を追加し、本詳細の overflowY: auto コンテナにアタッチ。`useEffect` で `view === 'detail'` かつ `current?.status` または `current?.id` が変わった時に `scrollTo({ top: 0 })` を呼ぶ。これで「読書前で下までスクロール → 読書を開始する → 読書中フェーズが下から始まる」事故を根治。(2) `BookMemoList` の openCreate / openEdit / closeEditor に `[memo-editor]` 診断ログを追加 — 既存コードは type="button" + onClick + state mount すべて正しく組まれているので、もし「+ 新しいメモ」が反応しない症状が残っていれば Web Inspector で経路 (button onClick / state 更新 / mount block 到達) のどこで止まっているか即特定できる。多くの場合は PWA cache に旧版が残っているケース (今回の SW v43 → v44 で busting)
 * - 2026-05-04: 関連書籍 (読書計画シート / ROI まとめ) の「📚 読みたいに追加」が反応しない問題を根治。真因 2 つ: (1) `addingTitles` を `addingRelatedTitlesRef.current` で渡していたため、ref を mutate しても **同じ Set 参照**が React の prop 比較を通って render が起きず「タップしても何も起きない」体験になっていた (`(() => { void addingRelatedTick; return ref.current })()` パターンは IIFE が同じ参照を返すため無効)。(2) handler が複数 await 直列で 1.5〜4s 沈黙していた。修正: ref + tick → state Set (`addedRelatedTitles`) に変更、setter で新しい Set を作るので React が確実に再 render。`addRelatedBookFromAi` を fire-and-forget 化 — クリック時 UI 即「✅ 追加済み」(< 5ms)、裏で重複チェック / 検索 / 保存。失敗時は state からロールバック。`isStrictMatch` で検索 1 件目を検証して誤 ISBN 採用を防止 (AI 選書追加と同じ WYSIWYG 原則)。診断ログ `[related-add] tapped / saved / failed` を追加。`RelatedBookCard` の表示を「追加中…」→「✅ 追加済み」に変更 (永続フラグなので追加済み表記が適切)
 * - 2026-05-04: 行動タブ — 完了モーダル削除 + インライン編集追加。(1) `toggleAction` から「✅ 完了おめでとうございます!」振り返りモーダルを撤去 — タップ即完了 / 即未完了戻しの軽快操作に統一。reflection は `applyActionToggle` の options から消し、`ActionEditModal` の振り返り欄からいつでも編集可能。(2) 新規 `src/components/ActionEditModal.jsx` (portal + box-sizing) — text / deadline / priority (3 chips) / recurrence (select) / reflection を編集可能、🗑 削除ボタン込み、Escape で閉じる、IME ガード。(3) `ActionList` のケバブメニューに「✏️ 編集」項目を追加 (本を開く / 削除 の上)。(4) App.jsx の `completingAction` state を `editingAction` にリネーム + 意味変更、`safeForUpdate` も同期。`onSave` は該当 actionIdx を patch して saveBook 経由で永続化。これで「振り返りモーダルが毎回邪魔」「内容を直すのに本詳細まで戻る必要」の 2 つのフリクションが同時解消
 * - 2026-05-04: 「完了済み表示なのに統計 0%」事故の修正。真因はフィールド名不一致ではなく (本コードベースは action 完了に `.done` boolean を使い、DB にも `done` 列が存在 — `.completed` 参照は grep でゼロ件確認)、レガシー行の `done=true / completed_at=NULL` 不整合。supabase_actions_full.sql で `completed_at` 列を後から追加したため、既存完了行はタイムスタンプ無し。useAllActions.computeForPeriod / computeStreak が `inRange(a.completedAt, ...)` を要求していたため、レガシー完了行が期間統計から漏れていた。修正: (1) 新規 SQL `supabase_actions_completed_at_backfill.sql` で `done=true AND completed_at IS NULL` の行に COALESCE(updated_at, created_at, now()) を埋める。(2) クライアント側 fallback として `completedAt || created_at` を使うように computeForPeriod / computeStreak を改修 (未適用 DB でも症状軽減)
 * - 2026-05-04: AI 選書の「📚 読みたいに追加」に視覚確認モーダルを挿入。新規 `src/components/AdvisorAddConfirmModal.jsx` (portal + 候補グリッド) を追加。BookAdvisor の onClick 時: (1) UI を即「✅ 追加済み」に切替 (連打防止 + ack)、(2) 裏で `searchBooksAPIFlat` → `isStrictMatch` で絞り込み、(3) 候補が 1 件以上 → 確認モーダルでユーザーが視覚的に選択 → 選んだ candidate の isbn / cover を rec に焼き込んで proceedAdd、(4) 候補 0 件 → モーダル skip して旧フローに任せる、(5) キャンセル → addedTitles から rollback。`addFromAdvisor` (App.jsx) を改修して `rec.isbn` / `rec.cover` が set されている時はそれを信頼、再 search で上書きしない (WYSIWYG)。これで AI 選書経由でも通常検索と同じ「視覚で確認した本がそのまま保存される」原則が成立。診断ログ `[advisor-add]` 維持。SW v39 → v40
 * - 2026-05-04: 「表紙を取り直す」をアクセスしやすい場所に配置。(1) 本詳細の表紙下に「🔄 表紙を取り直す」リンクを「表紙が違う?」の上に追加 — 両方とも常時可視で⋯ メニュー深く埋まっていた問題を解消。「取り直す」は同じ ISBN で再 fetch、「違う?」は別エディション候補から選び直し or 手動 upload。表紙が無い本でもプレースホルダ + 同じ 2 リンクを表示するように `{current.cover && ...}` の条件囲みを撤去 (旧実装は cover 無しの本では取り直しに辿り着けなかった)。(2) 本棚長押し ContextMenu (4093 line) に「🔄 表紙を取り直す」項目を「編集」と「共有」の間に挿入 — 本詳細を開かず 1 タップで再 fetch まで完結。誤表紙への対処を 3 秒以内に
 * - 2026-05-04: 本追加の誤表紙根本対策 — 「ユーザーが視覚で選んだ表紙」と「DB に保存される表紙」を必ず一致させる。AddBookModal の検索結果は既に各カードに `b.cover` を表示済みだったが、`pickBookFromAdd` (App.jsx) が選択後に async で `resolveCoverFromCandidates` を再実行し、別 ISBN の表紙で上書きすることがあった (検索画面と保存後で表紙が変わる事故の真因)。修正: 検索結果に visible cover が存在する時はそれを「視覚的に確認済み」とみなして信頼し、async リゾルバを skip。`coverIsbn` も primary ISBN にセットして「表紙ソース = primary ISBN」を確定。visible cover が無い時 (検索結果カードに表紙画像が無かった本) のみ既存の async リゾルバが走る。これで「画面に表示されたものをそのまま追加する」WYSIWYG 動作になる
 * - 2026-05-04: 画像 input から `capture="environment"` を完全に削除し、iOS のアクションシート (写真を撮る / フォトライブラリ / ファイル選択) を出すように修正。対象 4 箇所: 本追加フォーム表紙アップロード (App.jsx) / 本詳細手動アップロード (App.jsx) / カード式メモの写真添付 add 時 + edit 時 (BookMemoEditor.jsx)。これでスクショから表紙設定 / 既存写真からメモ添付 / iCloud Drive のファイル選択がすべて 1 タップで選べるようになる。capture 指定はカメラに直行してしまうのが難点だった
 * - 2026-05-04: 表紙修正モーダルが本詳細画面で出ない不具合の真因修正。前回 portal 化を施したが、肝心の `{coverFixForBook && <CoverFixModal />}` mount block が App.jsx の LIST view return JSX 内にしか存在せず、DETAIL view 描画中は React がこの JSX 枝に到達せず modal が render されない構造上のバグだった。現象: ユーザーが本詳細画面で「表紙が違う?」を押す → state は更新される → が DETAIL return には modal 条件付き mount が無いので何も表示されない → 本棚に戻った瞬間に LIST view が render → そこで初めて modal が出現、という体験。修正: DETAIL view return にも同じ mount block を追加 (LIST 側 mount は backup として維持、片方の view しか return されないため二重描画なし)。triggerManualCoverUpload / handleManualCoverPicked に `[manual-upload]` 診断ログを追加、ref が null の時は toast でユーザーに通知 (silent fail を回避)
 * - 2026-05-04: AI 選書 + マイ読書脳のシステムプロンプトを刷新 + temperature 制御を導入。(1) `bookAdvisor.system` (prompts.js) を全面書き直し — 「日本語の本のみ推薦」「業界・職種を 1〜2 ターン深掘り」「多様性 (古典 + 最近、有名 + 隠れた名著)」「具体的な変化を書く」「現実的な実践時間」「禁止事項 (英語原著 / 抽象推薦 / 同じ著者連発 / ベストセラーだけが理由)」の 6 ルールを明文化。(2) `BRAIN_SYSTEM` (ai.js) を刷新 — 既存のセキュリティルールは維持、新しい 6 つの絶対ルール (必ず引用 / 一般論禁止 / 知識ベース外を正直に / 複数の本を組み合わせ / 必ず行動に繋げる / ユーザー状況に寄り添う) と 4 セクション構造 (結論 / 参照した本のメモ / 状況別解釈 / 明日からできる 1 つの行動) を導入。`prompts.js` の myBookBrain ミラーも同期。(3) `callClaude` に `temperature` パラメータを追加し、Anthropic API へ pass-through。(4) 各機能ごとに最適な temperature を設定 — bookAdvisor: 0.7 (多様性) / myBookBrain: 0.5 (引用一貫性) / roiSummary: 0.3 (要約厳密性)
 * - 2026-05-04: 誤表紙の根絶 + CoverFixModal の portal 化。(1) `addFromAdvisor` で `searchBooksAPIFlat` の 1 件目を盲信していたのを修正 — `isStrictMatch` (タイトル: 完全一致 OR longer.startsWith(shorter) かつ shorter/longer ≥ 0.7、著者: 互含チェック必須) で同一書誌と確信できた時だけ ISBN を採用、それ以外は ISBN 空で保存して bg resolver の findIsbnCandidates 経路 (より厳格な isSameBook あり) に任せる。これで「エッセンシャル思考」で検索して「思考法の必読書 50 冊」が先に返るような事故で誤 ISBN が保存されることを根治。(2) 既存 DB の誤表紙を一括クリーンアップする `supabase_books_cover_reset.sql` を追加 — `cover_isbn != isbn` (primary と違う表紙ソース) の行を `cover = NULL` にして次回起動時に fullyResolveCover で再解決させる。手動アップロード (`cover_isbn = 'manual'`) は保護。(3) `CoverFixModal` を `createPortal(jsx, document.body)` 化 — 親ツリーの overflow:hidden / transform / z-index 影響を完全に排除、zIndex も 870 → 9999 に引き上げ。診断ログ `[cover-modal] open / candidates loaded / candidate selected / DB updated / closed` を追加して Web Inspector で挙動が追える
 * - 2026-05-04: AI 選書「📚 読みたいに追加」ボタンを完全な fire-and-forget 化 (UI 反応 < 5ms)。旧実装は onClick で `await summarizeAdvisorConversation` (5〜10s) → `await onAddBook` (= addFromAdvisor で `await searchBooksAPIFlat` + `await saveBook` で 1.5〜4s) を直列に行い、ボタンが「📚 計画を作成中…」のまま 7〜15 秒固まっていた。修正: BookAdvisor の onClick を完全同期に変更 — クリック時に `setAddedTitles((prev) => new Set([...prev, title]))` だけ実行 → 即「✅ 追加済み」表示。AI 要約 → onAddBook → sessionApi.addBookToSession の chain は `Promise.resolve().then(async () => ...)` で次の tick に逃がし、handler は同期で終了。失敗時は `setAddedTitles((prev) => prev.delete(title))` で rollback、ボタン復活。AdvisorSessionDetail (履歴詳細) も同じパターンで `locallyAdded` set + fire-and-forget に統一。診断用に `console.time(`[advisor-add] ${title}`)` / `console.timeEnd` を入れた — Web Inspector で実測値を確認できる
 * - 2026-05-04: PWA 更新を「ユーザー作業を中断しない」仕組みに刷新。`public/sw.js` の install handler から `self.skipWaiting()` を撤去 — 新版は waiting 状態で待機し、ユーザーが「今すぐ更新」を承諾するまで activate しない。新規 `src/components/UpdateBanner.jsx` を追加 — module level subscription で window event `app-update-available` を捕捉 (UpdateBanner が unmount/remount しても更新検知の事実が消えない)、createPortal で body に固定表示。安全状態の判定は AuthedApp で `safeForUpdate` を計算 — `view === 'list'` + `tab === 'books'` + 12 種類のモーダル/オーバーレイがすべて閉じている時のみ true。さらに UpdateBanner 内で `focusin/focusout` を listen し input/textarea/contenteditable にフォーカスがある時もバナー非表示。「後で」を押すと 30 秒クールダウンで再表示。`onUpdateAvailable` の toast は撤廃 (受動的バナーに集約)。SW v31 → v32
 * - 2026-05-04: AI 選書履歴の表示を整形 + 推薦本にアクションボタン追加。AdvisorSessionDetail で `stripRecommendations()` ヘルパーを追加し、各 assistant message から `RECOMMENDATIONS_START..END` の生 JSON ブロックを除去 (永続化用に raw text を保存する都合で履歴閲覧時に JSON が見えていた)。`session.recommended_books` 由来のカードを「タイトル + 著者 + なぜ / 核心 / ポイント / 時間」のリッチカード化、各カードに「🛒 Amazon で買う」(getAmazonLink 経由) +「📚 読みたいに追加」or「✅ 追加済み」ボタンを追加。重複判定は books の ISBN / ASIN / title+author 正規化キーで実施。`onAddBook` は live BookAdvisor と同じ `addFromAdvisor` を再利用、sourceQuery は session の最終 user 発話から復元。Amazon アソシエイトリンク注記も末尾に追加
 * - 2026-05-04: 「使ってくれて、ありがとう」モーダルの横はみ出しを再修正。前回追加した `.thanks-body { word-break: keep-all }` が真因 — 日本語長文で break point が無くなり右に飛び出していた。修正: `.thanks-body` から `word-break: keep-all` / `line-break: strict` / `text-wrap: balance` を撤去、代わりに `white-space: normal` + `overflow-wrap: anywhere` + `max-width: 100%` を設定 (折り返しの安全装置のみ担う)。改行制御は AuthorThankYou.jsx 側で `<br />` を意図的に明示する方針に変更。`.thanks-modal *` に `max-width: 100%` + `box-sizing: border-box` を追加して子要素のはみ出しを防御。`.thanks-title` は短いので balance だけ残す
 * - 2026-05-04: ヘルプの AI Q&A 被り防御 + 数字↔CJK 改行崩れ最終対応。(1) AI Q&A の hero に `position: 'static'` + `margin: 0` + `flexShrink: 0` を防御的に明示 (inheritance や stacking context の事故を完全排除)。(2) `word-break: keep-all` は CSS 仕様上 数字↔CJK 境目 (例: 「3ヶ月前」の 3 と ヶ の間) では効かないため、HelpModal renderer に `wrapNowrap()` ヘルパーを追加 — step.body / bullets / footer を render 時に正規表現で「数字+単位 (ヶ月/週間/日/年/冊/時間/メモ/カード)」「半年前/半年」「ブランド語 (AI 読書計画 / マイ読書脳 / カード式メモ / 投資の効果 等)」を自動検出し `<span class="nowrap">` で囲む。helpContent.js の文章本体には触らず、新規エントリも自動で保護される。CSS は src/index.css の `.lvg-help-body .nowrap` で `white-space: nowrap; display: inline-block` を適用
 * - 2026-05-04: 「使ってくれて、ありがとう」easter egg モーダル (AuthorThankYou) の改行崩れを修正。`.thanks-title` と `.thanks-body` (src/styles/components.css) に `word-break: keep-all` + `line-break: strict` + `text-wrap: balance` を追加。「変 / えていく」「ありますよう / に。」「3 / ヶ月前」のような不自然な単語途中・句読点孤立改行を CSS だけで吸収。文章本体には触らず、将来の追記もそのまま綺麗に折り返す
 * - 2026-05-04: ヘルプモーダルの「AI Q&A が上に被って見切れる」現象 + 改行崩れを修正。原因は header / footer に `flexShrink: 0` が無く、body content が大きくなると header が潰れて body の最初の section (= AI Q&A) が上端まで押し上げられて見切れていた。修正: header / footer に `flexShrink: 0` + `position: relative` + `zIndex: 1` を付与、body は `flex: 1` (= 1 1 0%) → `flexGrow: 1, flexShrink: 1, minHeight: 0` の正しいスクロール可能 flex 子要素 3 点セットに展開。改行崩れ対策として src/index.css に `.lvg-help-body` 専用ルールを追加 — 全子孫に `word-break: keep-all` + `line-break: strict` + `overflow-wrap: anywhere` を適用 (例: 「3 / ヶ月前」が「3ヶ月前」で纏まる)、p/li は `text-wrap: pretty`、見出しは `text-wrap: balance` で行末凸凹を抑制
 * - 2026-05-04: ヘルプモーダルのモバイル横はみ出しを修正 + 「他のタブのヘルプを見る」セクションを撤去。overlay padding を `min(20px, 2vw)` に縮小、card は `width: 100%` + `maxWidth: 'min(460px, 100vw - 16px)'` で iPhone 幅にフィット。stepCard / heroStyle / bodyStyle すべてに `boxSizing: border-box` + `overflowX: hidden` + `maxWidth: 100%` を明示。AI Q&A 入力欄は `flex: 1 1 0` + `width: 0` + `minWidth: 0` で placeholder 幅に押し広げられない調整。tabBtnStyle / KEY_TO_TAB / TABS / 内部 helpKey state を削除 (タブ切替が消えたため不要)。global `* { box-sizing: border-box }` は既に index.css にあったので新規追加なし
 * - 2026-05-04: 全タブのヘルプを「番号カード形式」に統一。HelpModal の renderer に `normalizeSteps()` ヘルパーを追加し、`.steps[]` と `.sections[]` の両方を同じ「番号 + タイトル + 説明 + 箇条書き + 結論」のカード視覚に正規化。schema を拡張: `step.bullets[]` (配列) と `step.footer` (string) を追加 — bullets は `・` プレフィックス付き、footer は italic で primary color。`bookList` / `aiAdvisor` / `myBookBrain` / `review` の 4 主要エントリを spec の 4 ステップ構成に書き換え (旧 8 セクションあった myBookBrain は 4 ステップに簡素化、review も 5 → 4 ステップに整理)。`bookDetailWant/Before/Reading/Done` / `memoEditor` / `actions` / `actionList` / `quotes` は既存 `sections:` 形式のまま、renderer 側で同じカード視覚で表示される。AI Q&A 検索バー / FAQ chips / タブ切替 / オンボーディングリンクは既存維持
 * - 2026-05-04: 廃止済み機能のデッドコードを完全削除。`src/components/CapitalDashboard.jsx` + `src/components/AIInsight.jsx` ファイル削除。`App.jsx` から `function TodayTab` / `function MemosTab` / `function ActionsTab` (旧実装、ActionList.jsx で再実装済) / `addBookFromPlan` / `loadData` / `saveData` / `STORAGE_KEY` / `data` state (collections + readingPlans) / `persist` callback を削除 (合計 303 行)。`HELP_CONTENT` から未参照だった `todayLearning` / `memos` / `personalCapital` キーを削除。CLAUDE.md の Removed Features 表を「過去に削除された機能（履歴メモ）」に書き換え + 削除済みヘルプキーを表から除去。`getCurrentHelpKey` のコメントを 5 タブ → 3 タブ構成に同期更新
 * - 2026-05-04: ターゲット拡大のため、ビジネス専門用語を一般向け語彙に置換。「ROI」→「投資対効果」、「ROI まとめ」→「投資の効果」、「ROI ひとことまとめ」→「投資の効果(一言)」、「AI セットアップ」→「AI 読書計画」、「セットアップシート」→「読書計画シート」、「KPI」→「目標数値」を全 UI / ヘルプ / AI プロンプト / LP に統一適用。DB カラム名 (`roi_summary` / `ai_summary` / `ai_strategy` / `invest_purpose`) と JS 変数 / ファイル名は変更せず内部互換性を維持。AI プロンプト (prompts.js) のヘディング (例: 旧「## 💪 投資収益(ROI)評価」→ 新「## 💪 投資の効果（評価）」) と MarkdownSections.jsx の highlight 正規表現を同期更新。残置: helpContent.js の changelog (line 22, 36) は当時のリテラルを保持
 * - 2026-05-04: マイ読書脳「知識管理」タブで全 9 種を編集・削除可能に拡張。旧来は カード式メモ / まとめメモ (= leverage_memo) / 学びログ の 3 種だけ一覧表示できたが、追加で 投資目的 / 現在の課題 / 仮説 / AI まとめ / 投資の効果 / 戦略 (books の各 setup フィールド) も同じカード形式で並ぶ。各カードの「編集」ボタンで TextEditModal を開き books.{column} に書き戻し、「クリア」で空文字化 + 5 秒 Undo (既存 summary と同じパターンを 7 列分に汎用化 — performClearSummary → performClearField)。フィルタピルに「📊 計画」を追加し、KIND_META.group で memo / summary / plan / learning にグルーピング。badge 色は plan のみ blue 系を新設。staged FIELD_SELECTS で未マイグレーション DB でも動作 (古い列が無い段階に縮退)
 * - 2026-05-04: LP に実アプリスクショ 8 枚を組み込み (本物感の最大化)。新規 `src/components/PhoneFrame.jsx` を導入し iPhone 風枠 (Dynamic Island 付き) で統一表示 — small/medium/large の 3 サイズ + float (浮遊アニメ) オプション。差し替え箇所: Hero (本棚スクショ + float) / AI Flow (詳細推薦カード + 読む順番の 2 枚連発) / Mech 01 (AI 選書) / Mech 02 (読書計画シート) / Mech 03 (マイ読書脳の質問→回答 2 枚並び + 矢印) 。Mechanisms と Use-List の間に「行動管理アピール」セクションを新設 (action-management.jpg 主役 + 4 つの機能リスト)。CSS は旧 `.phone-frame` (固定 width/height) を画像 aspect-ratio 追従の image-frame に置換、`.mech-screenshot*` `.screenshot-pair` `.screenshot-step*` `.screenshot-arrow` `.screenshot-caption` `.action-feature*` を追加。狭幅 (≤600px) では 質問→回答ペアを縦並びに自動切替、矢印は 90deg 回転。`prefers-reduced-motion` 時は float アニメ停止
 * - 2026-05-04: 繰り返しタスクの「無限生成 + 達成率おかしい」問題を根本修正。(1) 完了時に作る次回分は `actions.scheduled_for` (= 表示開始日時) を持って INSERT し、`useAllActions` が `scheduledFor > now` の行を非表示化することで「先取り完了」を物理的に阻止 (weekly: 1 日前 / monthly: 3 日前から表示開始)。(2) 達成率の計算を全期間ベース → 期間ベース (今週 / 今月 / 全期間 切替) に変更し、母数膨張を防ぐ。(3) `useAllActions.stats` に `week / month / streak` を追加 — streak は連続達成日数 (今日完了が無ければ昨日基準でカウント開始)。(4) ActionList の summary card を期間タブ付きに刷新、🔥 連続日数バッジを追加。(5) 既存の暴走タスクをクリーンアップする DELETE 文を `supabase_actions_scheduled.sql` に同梱。schema-error fallback で未適用 DB でも壊れないが、適用前は旧挙動 (即時 visible spawn) のまま
 * - 2026-05-04: 配布前ポリッシュ Tier 1 — Onboarding / EmptyState / Spinner / Skeleton / errors.js / ErrorBoundary を一通り見直し。Onboarding の 4 枚スライドを「本を投資管理 → AI 選書 → マイ読書脳 → 行動」の outcome 訴求に書き換え (旧: 本追加 / メモ / 振り返り のワークフロー解説)。errors.js の toMessage に timeout / AI 系 429 の特化メッセージ / does not exist スキーマエラー / 5xx 汎用 / API key 不正の分岐を追加、各メッセージに絵文字を付与してトースト視認性向上。ErrorBoundary を 😔 + "申し訳ありません" のフレンドリーなフルスクリーン表示にリニューアル — 本番ビルドではスタックトレースを隠蔽 (UX + セキュリティ) 、開発時のみ表示。"ホームに戻る" + "再読み込み" の 2 ボタン + "このエラーを報告する" mailto リンクを設置。EmptyState / Skeleton / Spinner は既存実装のカバレッジが既に十分 (本棚 / メモ / 振り返り / 行動 / 履歴 / マイ読書脳の各空状態 + ローディング状態に網羅展開済) のため再利用、新規ユーティリティは作らず
 * - 2026-05-04: 法的ページを LP / アプリ統一の単一ソース化 + 本格版に書き換え。新ディレクトリ src/legal/ に LegalLayout / TermsPage / PrivacyPage / SctPage を配置 (旧 src/pages/LegalPages.jsx は削除)。新 URL は /legal/terms · /legal/privacy · /legal/sct。旧 /lp/terms · /lp/privacy · /lp/contact は backward compat として同じページを返す (/lp/contact は SCT に統合)。利用規約は 19 条 (旧 11 条) に拡張、プライバシーポリシーは 14 条 + 委託先 / 国外移転 / 安全管理措置を明示、特定商取引法に基づく表記を新規追加 (月額課金に法的必須)。LP フッター + AccountSettings + AuthScreen の同意リンクを新 URL に差し替え (/terms.html · /privacy-policy.html はもう参照しない)。お問い合わせは mailto:leverage.book0502@gmail.com に統一。SCT の販売事業者名 / 運営責任者は TODO コメントで未記入のまま (商用化時に運営者が個人事業主届に基づき埋める)
 * - 2026-05-04: マイ読書脳の 3 つの問題を修正。(1) 読み込み時の "column books.current_challenge does not exist" を ai.js の callMyBookBrain に staged BOOK_SELECTS フォールバックを入れて段階縮退で対応 (full → middle → minimum)。(2) KnowledgeManager の知識ベース表示を 9 カテゴリ (本 / 投資目的 / AI まとめ / 投資の効果 / レバレッジメモ / まとめメモ / カード式メモ / 完了行動 / 学び) の 3 列グリッドに拡張。(3) AI 回答後に「解決しましたか？」プロンプトを表示、「✅ 解決した」で chat view をクリア (履歴は DB に残るので 履歴タブから見返し可能)、「💬 続けて質問する」でプロンプトのみ閉じる挙動を追加。clearedAt は localStorage に永続化
 * - 2026-05-03: マイ読書脳の RAG コンテキストを 7 種類に拡張。従来の カード式メモ + まとめメモ + 個人学び に加え、books の invest_purpose / current_challenge / hypothesis / ai_summary / roi_summary / ai_strategy も合成 memo として AI に渡す。回答が深くなる。Knowledge ヘッダーの「まとめ N 件」表示も全フィールド合算に。本詳細の最下部に「← 本棚に戻る」secondary ボタンを追加 (どのフェーズでも下スクロール後すぐ戻れる)
 * - 2026-05-01: ランディングページ (LP) を /lp に追加。8 セクション（Hero / Problem / Solution / How / Features / Why us / Pricing / FAQ）+ Footer の縦スクロール構成。React Router を持ち込まず App.jsx の path 検出だけで切替（SPA fallback の Vercel rewrite が既存で対応済み）。スプラッシュも認証も介さず即表示、scroll-trigger fade-in + prefers-reduced-motion 対応。「無料で始める」CTA は window.location='/' で既存 AuthScreen フローへ合流
 * - 2026-05-01: 本のタイトルと表紙が一致しない問題を修正。findIsbnCandidates をタイトル類似度 0.7 + 著者の互含チェック付きの厳格マッチに改修（「タイトルが似ているだけの全く別の本」の ISBN を候補から弾く）。本詳細の表紙下に「表紙が違う？」リンク + ISBN 表示を追加し、CoverFixModal でグリッド形式の候補表紙から選び直し or 手動アップロードへ誘導。backfill v3→v4 にバンプして既存の誤マッチを再解決
 * - 2026-05-01: ノートタブを「読書から生まれた知識すべて」の統合フィードに拡張。投資目的 / 課題 / 仮説 / AI まとめ / 投資の効果 / レバレッジメモ / カードメモ / 学び / 行動の振り返り を時系列で表示。冒頭に種類別件数チップ、横断検索に「種類で絞り込み」select を追加。各カードに種類アイコン + 色付きボーダーで一目で判別可能。派生ノート（books / actions 由来）はスワイプ削除不可（DB 単一レコードに対応しないため）
 * - 2026-05-01: 行動の繰り返しエラー修正 — actions.id の DB DEFAULT が無い環境で「null value in column 'id'」が発生していた問題を二重防衛で根治。supabase_actions_id_default.sql で DB の DEFAULT を補填、useBooks.saveBook で crypto.randomUUID() を使った client-side UUID 生成
 * - 2026-05-01: 行動タブをタスク管理化。本詳細の行動編集に「🎯 優先度（高/中/低）」「🔁 繰り返し（毎週/毎月）」「🔗 引用ページ」を追加、本棚横断の行動カードに各バッジ表示。✅ 完了タップで「✅ 完了おめでとうございます！」モーダル → 振り返りメモ任意入力 → 完了。完了後カードに「💭 振り返り」表示。繰り返し設定があれば次回分を自動 spawn。フィルタ拡張（⚠ 期限切れ / 今日まで / 今週期限）+ ソートに「優先度順」追加。週次レビュー画面と PWA 通知は次フェーズで実装予定
 * - 2026-05-01: 同じ本の重複登録を防ぐ二段構え。AddBookModal の検索結果には「✅ 追加済み（読書前 等）」バッジ + タップで既存本を開く挙動。新規追加（手動 / AI 選書 / 関連書籍）すべての保存パスで重複ダイアログ「📖 既存の本を見る」「← 戻る」を出す。supabase_books_unique_isbn.sql の部分 UNIQUE インデックスが最終防衛線
 * - 2026-05-01: ヘルプモーダル全面リニューアル。「?」をタップで開く HelpModal の上部に「🤖 AI に質問する」検索バー（PROMPTS.helpAi で Claude に問い合わせ）と「💡 よくある質問」chips を追加。下部に「🔁 他の画面のヘルプを見る」タブ切替（本棚 / 振り返り / AI）。既存 helpContent の steps/sections レンダリングは保持し、新層を上に重ねる構成
 * - 2026-05-01: 🕒 AI 選書アドバイザーに履歴機能追加。advisor_sessions テーブルに会話を 1 セッション = 1 行で永続化、ヘッダーの「🕒 履歴」「🆕 新規」から過去の会話を一覧 → 詳細閲覧 → 「💬 この会話を続ける」で再開可能。supabase_advisor_sessions.sql 未適用なら履歴ボタンは非表示で graceful degradation
 * - 2026-05-01: AI 選書 → 読書計画シート構造化引き継ぎ強化。「📚 読みたいに追加」を押した瞬間に Claude が会話全体 + 選んだ本を要約 → 4 フィールド (投資目的 / 現在の課題 / 仮説 / 選書理由) を生成しプレフィル。BeforePhase に独立 3 フィールド + 読み取り専用「🤖 AI の選書理由」カード。supabase_books_setup_fields.sql 適用が前提（未適用 DB では schema-error fallback で挙動維持）
 * - 2026-05-01: AI 選書 → 読書計画シート引き継ぎ。AI 選書で「読みたいに追加」した本は source_query を保持し、読書計画シートを開くと投資目的に自動プレフィル。「💡 AI 選書で入力した内容を引き継ぎました」バナー + 「↩ AI 選書で入力した内容に戻す」復元ボタン。supabase_books_source_query.sql 適用が前提（未適用 DB では schema-error fallback で挙動維持）
 * - 2026-05-01: 全画面の説明文を「具体的・短く・行動を促す」トーンに統一刷新。AddBookModal トップ説明追加 / 検索 not-found 文言改稿 / ROI ラベル「ひとことまとめ」 / 行動リスト「次の 1 週間でやる行動」 + 具体的プレースホルダー / Review の各セクション (ランダム表示 / タイムライン / 横断検索) サブタイトル追加 / MyBookBrain サブタイトル + 質問例ラベル + 履歴ヘッダー + 学びインライン文言 + 学びプレースホルダー / KnowledgeManager hero / ActionList ヘッダー / 本棚ピル上「タップで本を絞り込めます」ヒント
 * - 2026-05-01: 読書前画面の AI 読書計画導線を全面刷新 — 未完了時は本詳細上部にブランドグラデのヒーロー CTA、完了時は ✅ バッジ + 「編集する」、⋯ メニューに「AI 読書計画を編集」を before/reading/done で常設、before→reading 遷移には未完了確認モーダルを追加
 * - 2026-05-01: 本棚ヘルプを「4 ステップカード」レイアウトに刷新。冗長な機能説明を撤廃し、「本を追加 → 読書計画 → メモ → レバレッジ化」の使い方フローに集中
 * - 2026-05-01: 5 → 3 タブに整理（本棚 / 振り返り / AI）。振り返りは ノート / 行動 のサブタブ、AI は AI 選書 / マイ読書脳 のサブタブ。本棚を表紙グリッド表示（list との切替も可）に刷新、表紙未取得時はタイトルベースのカラフルプレースホルダ。データエクスポートを CSV 形式（UTF-8 BOM）に変更
 * - 2026-05-01: 簡素化 — 「シンプル・直感的」優先のフィードバックを受け Phase 4 の装飾を撤去。季節演出 / 連続日数バッジ / マイルストーン演出を削除、本検索を 1 ステップ (3 入力) に統合、AddBookModal を全画面シート化、ダークモード一時停止、placeholder コントラスト改善、操作説明テキスト削減。挨拶・名前・ロゴ長押しの感謝のみ残置
 * - 2026-04-30: デザインシステム Phase 4 — 人格。時刻別挨拶 + 名前呼びかけ、季節演出（春=桜・秋=紅葉・冬=雪）、🔥 連続日数バッジ、読了 1/5/10/25/50/100 冊と連続 3/7/14/30/50/100 日のお祝いモーダル、100 日 / 100 冊は legendary 階層、ロゴ長押しで開発者からの感謝メッセージ
 * - 2026-04-30: デザインシステム Phase 3 — コンテンツ精緻化。EmptyState / SectionHeader / ErrorMessage / StatCard 新設、本棚・行動・振り返り・読書脳の空状態を寄り添い形に刷新、行動の完了率に「あと N 件で X% 達成」マイルストーン文脈、ステータス進む時の事前ガイダンス
 * - 2026-04-30: デザインシステム Phase 2 — マイクロインタラクション充実（spring 押下、stagger 登場、shimmer 進捗バー、shimmer skeleton、check-pop、tab-content フェード、toast 改良、Pull-to-refresh 完了フラッシュ、AnimatedNumber 導入）。挙動のみ刷新でヘルプ文言は変更なし
 * - 2026-04-30: デザインシステム Phase 1 — `src/styles/tokens.css` / `src/styles/components.css` を新設し、index.css をスリム化。BottomNav / Shell / FAB / 共通インラインスタイルがトークン参照に。ユーザー向けヘルプ文言は変わらず（外観改善のみ）
 * - 2026-04-30: 📩 フィードバックフォーム導入（設定モーダル）。本検索を「シンプル / 詳細」2 モード化、サジェスト表示・並び替え・改良カード対応。bookList セクションに反映
 * - 2026-04-30: Amazon アソシエイト連携に伴い本詳細・関連書籍カード・AI 選書に「🛒 Amazon で買う」追加。リーガル注記とプライバシー/利用規約の更新も反映
 * - 2026-04-30: bookDetailBefore に「📝 修正リクエスト」「📚 関連書籍を読みたいに追加」追記。aiAdvisor / myBookBrain の入力欄複数行対応を反映
 * - 2026-04-25: 行動リスト単体ページ復活に伴い actionList キー新設（既存 actions キーは本詳細フォーム内アクション用として残置）
 * - 2026-04-27: 名言ライブラリ（quotes.js, 12 カテゴリ・129 件）連携に伴い quotes キー新設
 * - 2026-04-27: AI 機能 4 種（読書計画シート / 本解析 / ROI 要約 / 選書）の出力刷新に合わせて bookDetailBefore / Reading / Done / aiAdvisor の説明文を更新
 * - 2026-04-27: bookList と bookDetailReading にジェスチャー (スワイプ削除/長押しメニュー/Pull-to-Refresh/エッジスワイプ戻る) のセクション追記
 * - 2026-04-27: マイ読書脳に「📚 知識管理」「🤖 AIに含まれる知識の種類」セクション追記
 * - 2026-04-26: 🧠 マイ読書脳タブ追加に伴い myBookBrain キーを新規追加
 * - 2026-04-26: bookList を新 UI（ピルフィルタ / FAB / 続きから≥3 / 読了グロー）に合わせ更新
 * - 2026-04-26: コア機能簡素化に伴い review キー追加 / personalCapital を廃止予定マーク
 * - 2026-04-26: personalCapital に AI 分析 / 学習プラン提案セクションを追記
 * - 2026-04-26: パーソナルキャピタル拡張に伴い personalCapital キーを追加
 * - 2026-04-26: 下部ナビ 3 タブ用キー (todayLearning / memos / actions) を追加
 * - 2026-04-26: ページ別コンテキストヘルプへ刷新。各キーの sections を詳細版に差し替え
 * - 2026-04-26: 初版作成。本棚 / 各ステータスの本詳細 / AI 選書 / メモエディタの 7 キーを定義
 */

// Each entry powers HelpModal.jsx. Schema:
//   {
//     title:        画面タイトル（モーダル見出し）
//     description:  1〜2 行の概要
//     lastUpdated:  YYYY-MM-DD（ヘルプ末尾に表示、コード変更と同時に更新）
//     sections:     [{ heading, body, items? }] — body は string（\n\n で段落区切り）
//   }
//
// IMPORTANT: ユーザー目線の機能説明を維持する。技術用語（Supabase, Storage, RLS, etc）は
// 出さない。コードを変えたら必ず該当キーの sections と lastUpdated を更新すること。

export const HELP_CONTENT = {
  bookList: {
    title: 'Orime の使い方',
    description: '本を投資として捉え、行動につなげる 4 ステップ',
    lastUpdated: '2026-06-21',
    // `steps` を持つエントリは HelpModal が「ステップカード」レイアウトで描画。
    // bullets / footer は任意。sections フォールバックも renderer 側で対応。
    steps: [
      {
        title: 'まずは1冊、置いてみる',
        body: '[+ 本を追加] から ISBN・書名で検索。本棚が空のときは「最初の1冊を追加」から始められます。読んだ気づきは、ここに少しずつ貯まっていきます。',
      },
      {
        title: '読書前の読書計画',
        body: '読み始める前に「投資目的」を明確にする。',
        bullets: [
          'なぜこの本を読むのか',
          'どんな課題を解決したいのか',
        ],
        footer: 'AI があなた専用の読み方戦略を提案します。',
      },
      {
        title: '読書中はカードでメモ',
        body: '気づきを 1 メモ = 1 カードで記録。',
        bullets: [
          'ページ番号・写真・タグも添付可能',
          '後から検索・並び替え簡単',
        ],
      },
      {
        title: '読了後にレバレッジ化',
        body: '読み終わったら「投資の効果(一言)」と「行動アクション」を記録。',
        footer: '振り返りタブで定期的に見返し、行動に落とし込みます。',
      },
    ],
    tip: '完読を目指さず、必要な部分だけ抜き出す『レバレッジ読書』が最も効率的。',
  },

  bookDetailWant: {
    title: '🔖 読みたい',
    description: '登録したばかりの「読みたい本」のページです。',
    lastUpdated: '2026-06-21',
    sections: [
      {
        heading: 'この段階ですること',
        body:
          'なぜこの本を読みたいか（投資目的）を考えましょう。タイトルや著者、表紙を確認し、「本当に読む価値があるか」を吟味するタイミングです。',
      },
      {
        heading: '次のステップ',
        body:
          '読み始める準備ができたら「読書前へ進む」で次の段階（投資戦略フェーズ）へ進みます。',
      },
      {
        heading: '📝 メモは？',
        body:
          'まだ読み始めていないので、メモ機能は表示されません。本を「読書中」にすると、画面右下に ＋ ボタンが現れ、そこからメモを追加できるようになります。',
      },
      {
        heading: '削除したい時',
        body:
          '「削除」ボタンで本棚から削除。5 秒以内に「取消」で復活できます。',
      },
    ],
  },

  bookDetailBefore: {
    title: '🎯 読書前（投資戦略）',
    description: 'AI と一緒に「この本から何を得るか」を計画する段階です。',
    lastUpdated: '2026-06-21',
    sections: [
      {
        heading: '📋 AI 読書計画を始める（最初のメインアクション）',
        body:
          '本詳細を開くと、未完了なら茶系グラデの大きな CTA「AI 読書計画を始める →」が一番上に出ます。タップすると読書計画画面（投資目的入力 → AI 解析 → 読書計画シート生成）が開きます。\n\n' +
          '読書計画を完了すると同じ場所が「✅ AI 読書計画 完了」+ 小さな「編集する」リンクに切り替わります。\n\n' +
          'あとからでも見直したい時は、画面右上の ⋯ メニューから「📋 AI 読書計画を編集」を選べば、読書中・読了の本でも読書計画画面に戻れます。',
      },
      {
        heading: '読書計画シート',
        body:
          'AI が「投資戦略」「重点的に読む箇所（20%）」「流し読みでOKな箇所」「注意点」「期待される行動変化」「関連書籍」など、あなた専用の読書戦略書を生成。\n\n' +
          '読み始める前にこれを読むと、効率が 3 倍に。投資目的を入力するほど精度が上がります。',
      },
      {
        heading: '📝 修正リクエスト',
        body:
          '生成された読書計画シートをさらに調整できます。\n\n' +
          '「もっと簡潔に」「営業視点を強化」「章番号を増やして」など自然な指示を入力 →「🔧 修正する」で AI が同じ構造のまま書き換えます。\n\n' +
          '直前のバージョンが残っているので、気に入らなければ「↶ 元に戻す」で戻せます（保持は 1 つ前まで）。',
      },
      {
        heading: '📚 関連書籍を読みたいに追加 / 🛒 Amazon で買う',
        body:
          'シート末尾の「関連書籍」セクションに、各本の「📚 読みたいに追加」「🛒 Amazon で買う」ボタンが並びます。\n\n' +
          '・読みたいに追加：本棚の「読みたい」ステータスに登録。表紙や著者は自動で検索（ヒットしない場合はタイトルだけ手動追加）\n' +
          '・Amazon で買う：Amazon.co.jp を開いてその本を購入できます（外部リンク）\n\n' +
          '当アプリは Amazon アソシエイト・プログラムに参加しており、リンク経由の購入により紹介料が発生する場合があります（追加費用はかかりません）。',
      },
      {
        heading: '投資目的・予算（時間）',
        body:
          '「読書時間 = 投資」と捉え、何時間かけてどんなリターンを得るかを言語化しておくと、読書効率が上がります。',
      },
      {
        heading: '🤖 AI 選書から読書計画が自動で入る',
        body:
          'AI 選書アドバイザーと「営業成績を上げたい」「BtoB の新規開拓で…」のように何往復か会話してから「📚 読みたいに追加」を押すと、AI が会話全体を要約して以下 4 つを自動でプレフィルします:\n\n' +
          '・📊 投資目的（何のために読むか）\n' +
          '・⚠ 現在の課題（今困っていること）\n' +
          '・💡 仮説（読むとどう変わるか）\n' +
          '・🤖 AI の選書理由（なぜこの本を選んだか）\n\n' +
          '読書計画作成中はボタンが「📚 計画を作成中…」になります（数秒）。\n\n' +
          '上に「💡 AI 選書で話した内容を元に、AI が読書計画を作成しました」バナーが出るので、編集して自分の言葉に直すとより効果的。投資目的だけは「↩ AI 選書で入力した内容に戻す」で元に戻せます（選書理由は履歴のため編集不可）。',
      },
      {
        heading: '次のステップ',
        body:
          '戦略が固まったら「読書を開始する」で本格的な読書フェーズへ。画面右下に ＋ ボタンが現れ、メモ機能が使えるようになります。\n\n' +
          '読書計画 未完了のまま「読書を開始する」を押すと「読書計画 未完了のまま進みますか？」という確認が出ます。スキップしても進めますが、AI 戦略提案を活用したい時は先に読書計画を完了するのがおすすめです。',
      },
      {
        heading: '🛒 Amazon で買う',
        body:
          '本詳細の下部に「📚 Amazon で買う」ボタンがあります。ISBN がわかっている本は商品ページに直行、ISBN 不明ならタイトルで検索します。\n\n' +
          '当アプリは Amazon アソシエイト・プログラムに参加しています。リンク経由の購入により紹介料が発生する場合があります（追加費用はかかりません）。',
      },
    ],
  },

  bookDetailReading: {
    title: '📖 読書中',
    description: '気づきを記録しながら読み進める段階です。このアプリのメイン機能です。',
    lastUpdated: '2026-06-21',
    sections: [
      {
        heading: '🔍 AI 本の解析（読書のコンパス）',
        body:
          '読書前フェーズで生成した「著者の意図 / 本の構造 / キーコンセプト / 名言 / 適合する読者 / 実践へのヒント」が本詳細上部に常時表示されます。\n\n' +
          '読みながら参照すると、迷子にならず効率よく重要箇所を吸収できます。',
      },
      {
        heading: '📇 カード式メモ',
        body:
          '1 メモ = 1 カード。ページ番号・本文・写真・タグを入れて整理。読書しながらサクサク追加していくスタイル。\n\n' +
          '読みながら気になった一行を残しておくと、あとで「振り返り」タブの想起として、ふいに戻ってきます。',
      },
      {
        heading: '📝 まとめ式メモ',
        body:
          '本全体の感想や学びを大きなテキストエリアに自由に書く。集中読書派・読書後一気に整理派におすすめ。',
      },
      {
        heading: '＋ 新しいメモ（右下フローティングボタン）',
        body:
          '右下の丸ボタンを押すと画面下からクイックメモが上がってきます。\n\n' +
          'ページ番号 + 本文の最小入力で完了。詳細（写真・タグ）を追加したい時は「詳細入力」へ。',
      },
      {
        heading: '進捗バー',
        body:
          '現在のページ数を入力すると自動で進捗率が計算されます。ペース管理に。',
      },
      {
        heading: '次のステップ',
        body:
          '読み終わったら「読了へ進む」で完了。メモは引き続き編集可能です。',
      },
    ],
  },

  bookDetailDone: {
    title: '✅ 読了（振り返り）',
    description: '読み終わった本の振り返りと成果確認の段階です。',
    lastUpdated: '2026-06-21',
    sections: [
      {
        heading: '投資の効果（要約）',
        body:
          'あなたが書いたメモを基に、AI が「主要な学び TOP3」「投資の効果（評価）（★ 評価＋理由）」「推奨される次のアクション」「復習タイミング」「成長領域」を構造化レポートで生成。\n\n' +
          'これを定期的に読み返すと、本の知恵が定着します。',
      },
      {
        heading: '過去のメモ振り返り',
        body:
          '読書中に書いた全メモを再確認・編集できます。後日見直すと新たな気づきがあります。',
      },
      {
        heading: '評価（★）',
        body:
          '本に 5 段階評価を付けて、後で「評価順」でソートして名著だけ見返すことができます。',
      },
      {
        heading: 'アクションリスト',
        body:
          '本から学んだ「実行すべき行動」をリスト化。チェックを入れていくことで、読書を実生活に活かせます。',
      },
    ],
  },

  aiAdvisor: {
    title: '🤖 AI 選書アドバイザー',
    description: 'AI が 4 つの機能で読書を加速します。',
    lastUpdated: '2026-06-21',
    steps: [
      {
        title: 'AI 選書で本を見つける',
        body: 'あなたの悩み・課題を会話で深掘りし、最適な本を提案。',
        bullets: [
          '「営業成績を上げたい」など自由に入力',
          '選書理由・読み方戦略付き',
          '会話履歴は自動保存・後から再開可能',
        ],
      },
      {
        title: 'AI 読書計画を立てる',
        body: '読む前に「投資目的・現在の課題・仮説」を整理。',
        bullets: [
          '重点的に読むべき章を提案',
          '読まなくていい章まで明示',
          '実践時間の目安付き',
        ],
      },
      {
        title: 'マイ読書脳に質問する',
        body: '過去に読んだ本の知識から、あなた専用の AI が回答。',
        bullets: [
          '「決断に迷う時の判断軸は?」など',
          '参照した本・メモが表示されて根拠が見える',
        ],
      },
      {
        title: '学びを追加して精度を上げる',
        body: '本以外の気づき(会話・経験・観察など)を記録すると、AI の回答があなたらしくなる。',
        footer: 'カテゴリ・タグで整理可能。知識サブタブから編集も自由自在。',
      },
      {
        title: 'AI の利用について',
        body: 'AI 機能(選書・読書計画・マイ読書脳)には、使いすぎを防ぐための月ごとの利用上限があります。',
        footer: '通常の使い方ならまず届かない余裕のある上限です。上限は毎月リセットされます。',
      },
    ],
  },

  billing: {
    title: '💳 プラン・お支払い',
    description: 'Orime のご契約と、解約・カード変更について。',
    lastUpdated: '2026-06-21',
    sections: [
      {
        heading: 'すべての機能を使うには',
        body:
          'Orime は、本棚・振り返り・行動リスト・マイ読書脳・AI 選書などすべての機能を、ご契約いただいた方にお使いいただけます。\n\n' +
          'ログイン後にご契約のご案内が表示されます。プランは月額と年額の 2 つから選べます（年額がおすすめです）。',
      },
      {
        heading: 'お支払いについて',
        body:
          'お支払いはクレジットカードで行います（決済代行は Stripe の安全な決済ページ）。アプリ内にカード情報は保存されません。\n\n' +
          '契約が完了すると自動でアプリに戻り、すべての機能が使えるようになります（反映に数秒かかることがあります）。',
      },
      {
        heading: '解約・カードの変更',
        body:
          '⚙️ 設定の「💳 プラン」から「⚙️ プランを管理する」を開くと、Stripe のプラン管理ページで解約・カードの変更・請求履歴の確認ができます。\n\n' +
          'いつでも解約でき、違約金はかかりません。解約後もこれまでのデータ（本・メモ・行動など）は保持されます。',
      },
      {
        heading: '価格について',
        body:
          '価格は決済ページに表示される金額が正式なものです。月額 ¥1,280（税込）と、年額 ¥10,800（税込・月あたり約 ¥900）からお選びいただけます。年額の方がお得です。',
      },
    ],
  },

  memoEditor: {
    title: '✏️ メモ入力',
    description: '気づきや学びを記録する画面。',
    lastUpdated: '2026-06-21',
    sections: [
      {
        heading: 'ページ番号（任意）',
        body:
          '後から「あの一節どこだったっけ？」を防ぐために入れておくと便利。\n\n' +
          '前回値 +1 で自動入力されるので、連続入力時はそのままで OK。',
      },
      {
        heading: '本文（必須）',
        body:
          '気づきや引用、学んだことを自由に記述。1 メモ = 1 つの学び を意識すると後から探しやすいです。\n\n' +
          'ここに残した一行は、あとで「振り返り」の想起やマイ読書脳の根拠として戻ってきます。まずは気軽に一行から。',
      },
      {
        heading: '写真（任意）',
        body:
          '📷 ボタンから本のページやハイライト箇所を撮影。スマホのカメラから直接撮影も OK。\n\n' +
          '後から見返した時に強烈な記憶トリガーになります。',
      },
      {
        heading: 'タグ（任意）',
        body:
          '#気づき #実務 #要復習 など、後で分類検索する用のラベル。\n\n' +
          'タグ別に絞り込んだり、似た内容のメモを集約できます。',
      },
      {
        heading: '保存して次へ',
        body:
          '保存すると同時にフォームをクリアし、次のメモ入力モードに。\n\n' +
          'ページ番号は +1 で自動セット。連続入力に最適。',
      },
    ],
  },

  actions: {
    title: '🎯 行動',
    description: '本から学んだことを実際の行動に落とし込むタブです。',
    lastUpdated: '2026-04-26',
    sections: [
      {
        heading: 'なぜ行動タブが大事？',
        body:
          '読書の真価は『行動が変わるか』にあります。どれだけ良い本を読んでも、行動が変わらなければ 投資対効果ゼロ。このタブで『次にやること』を明確にしましょう。',
      },
      {
        heading: 'アクションの追加',
        body:
          '本から「これは実行しよう」と思ったことを箇条書きで追加。例：\n\n' +
          '・週次で営業時間を 30 分ブロックして実践\n' +
          '・上司に新しい報告フォーマットを提案\n' +
          '・チームミーティングでこの章を共有',
      },
      {
        heading: '完了チェック',
        body:
          '実行したアクションは ✅ でマーク。完了率が可視化され、本から得た投資リターンを定量化できます。',
      },
      {
        heading: '期日設定',
        body:
          'アクションには期日（deadline）を設定可能。リマインダー的に活用して、読書の学びを実生活に組み込みましょう。',
      },
      {
        heading: 'ヒント',
        body:
          '「読了」で完了率を見直すと、自分が本当に変わったか確認できます。完了率 50% 以上なら相当の効果あり。',
      },
    ],
  },

  actionList: {
    title: '🎯 行動リスト',
    description: '全ての本から学んだ「実行すべき行動」を横断して管理するタブです。',
    lastUpdated: '2026-05-01',
    sections: [
      {
        heading: 'なぜ行動タブが大事？',
        body:
          '読書の真価は『行動が変わるか』にあります。どれだけ良い本を読んでも、行動が変わらなければ 投資対効果ゼロ。\n\n' +
          'このタブで本を横断して『次にやること』を一覧管理し、実際の行動につなげましょう。',
      },
      {
        heading: '🎯 優先度・🔁 繰り返し・🔗 引用ページ',
        body:
          '本詳細の行動編集（読了画面の「次の 1 週間でやる行動」セクション）で 3 種の付加情報を設定できます。\n\n' +
          '・🎯 優先度: 🔴 高 / 🟡 中 / 🟢 低（カードに色付きバッジで表示。並び順「優先度順」で上位に表示）\n' +
          '・🔁 繰り返し: 毎週 / 毎月。完了するとその設定で次回分が自動的に末尾に追加されます\n' +
          '・🔗 引用ページ: 本のどのページから生まれた行動かを記録（カードに 🔗 p.42 と表示）',
      },
      {
        heading: '✅ 完了 → 振り返りメモ',
        body:
          'カードの ✅ をタップすると「✅ 完了おめでとうございます！」モーダルが開き、「やってみてどうでしたか？」を任意で入力できます。\n\n' +
          '振り返らずに完了することも可能。保存した振り返りは完了後カードに「💭」アイコン付きで表示されます。\n\n' +
          '読みっぱなしを防ぎ、読書 → 行動 → 学びの定着 を一気通貫させるための機能です。',
      },
      {
        heading: '📊 サマリーカード',
        body:
          '上部に「完了率（％）」「完了 / 全件」「今週期限の件数」を表示。\n\n' +
          'プログレスバーは 80% 以上で緑、50% 以上で黄、それ未満で赤。一目で『読書の投資リターン』が分かります。',
      },
      {
        heading: '🔍 フィルタ',
        body:
          '・全て: 全行動を表示\n' +
          '・未完了: まだ実行していない行動\n' +
          '・完了: ✅ 済みの行動\n' +
          '・⚠ 期限切れ: 期限を過ぎた未完了行動（赤背景）\n' +
          '・今日まで: 期限が今日以前の未完了\n' +
          '・今週期限: 期限が今日〜7日以内の未完了行動',
      },
      {
        heading: '↕️ 並び順',
        body:
          '・期限順: 期限が近い順（期限なしは末尾、完了は最後）\n' +
          '・優先度順: 🔴 高 → 🟡 中 → 🟢 低 → 期限近い順\n' +
          '・作成順: 新しく追加した順\n' +
          '・本タイトル順: 本のタイトル昇順',
      },
      {
        heading: '✅ チェックボックス',
        body:
          '左側の四角をタップで完了/未完了を切替。完了行動は取り消し線＋グレーアウトで視覚化されます。',
      },
      {
        heading: '📅 期限の色分け',
        body:
          '・期限切れ: 赤色＋⚠️アイコン、カード背景もピンク\n' +
          '・3 日以内: オレンジ色＋📅\n' +
          '・それ以降: 灰色＋📅\n\n' +
          '締め切りに追われる前に着手できます。',
      },
      {
        heading: '⋮ メニュー',
        body:
          '右上の⋮から:\n' +
          '・📖 本を開く: 該当する本詳細ページへジャンプ。テキスト編集や期限変更はそこで\n' +
          '・🗑️ 削除: 行動を完全削除',
      },
      {
        heading: '➕ 行動の追加',
        body:
          '行動の新規追加は本詳細画面（読書中・読了フェーズ）の「行動リスト」セクションから。\n\n' +
          '本ごとに管理することで「どの本から得た学びか」が辿れます。',
      },
      {
        heading: '💡 おすすめの使い方',
        body:
          '朝、このタブを開いて「今日やる行動」を 1 つ決める。\n\n' +
          '寝る前に完了率をチェック。1 週間の達成感が積み上がります。',
      },
    ],
  },

  myBookBrain: {
    title: '🧠 マイ読書脳',
    description: '過去に読んだ本の知恵が、あなた専用の AI になる。',
    lastUpdated: '2026-06-21',
    steps: [
      {
        title: 'まずは1冊、メモを残す',
        body: 'マイ読書脳は、あなた自身のメモを根拠に答えます。メモが 1 件もないうちは質問しても根拠がないので、まず本棚で 1 冊えらび、気になった一行を残すところから。',
        footer: 'メモが増えるほど、あなただけの AI に育っていきます 🌱',
      },
      {
        title: '質問する',
        body: '気になる悩みや疑問を入力すれば、過去に読んだ本の知識から答えが返ってくる。',
        bullets: [
          '具体的に書くほど精度が上がる',
          '参照された本・メモが回答に表示',
          '回答が長い時は「中止」(■) ボタンで途中で止められる(そこまでの内容は残ります)',
        ],
      },
      {
        title: '学びを追加する',
        body: '本以外の気づき(会話・経験・観察)を記録。',
        bullets: [
          'カテゴリで整理(会話 / 経験 / 観察 / 気づき)',
          'タグで絞り込み',
        ],
        footer: '学びを増やすほど、マイ読書脳の答えがあなた専用になります。',
      },
      {
        title: '履歴を見返す',
        body: '過去の質問と AI の答えがすべて保存される。',
        footer: '気になる答えは何度でも再確認できます。',
      },
      {
        title: '知識ベースを確認・編集する',
        body: 'AI が参照している知識をすべて見える化・編集可能。',
        bullets: [
          'カテゴリ別の件数表示で「自分の厚み」を可視化',
          '内容が古くなったら直接編集',
          '不要な知識は削除',
        ],
        footer: '編集内容は次回の AI 回答に即座に反映されます。',
      },
      {
        title: 'AI の利用について',
        body: 'AI への質問には、使いすぎを防ぐための月ごとの利用上限があります。通常の使い方ならまず届かない余裕のある上限です。',
        footer: '上限に達した場合は翌月またご利用いただけます(毎月リセット)。',
      },
    ],
  },

  review: {
    title: '🔄 振り返り',
    description: '読書から生まれた知識を、行動と記憶に変える 4 ステップ',
    lastUpdated: '2026-05-04',
    steps: [
      {
        title: '行動を管理する',
        body: '本から決めた行動に期限と優先度をつけて完了まで追跡。',
        bullets: [
          '期限切れは赤色でハイライト',
          '繰り返しタスクで習慣化',
          '完了時の振り返りメモで血肉化',
        ],
      },
      {
        title: 'ノートで知識を見返す',
        body: '過去の本で残した知識(投資目的・まとめメモ・カード式メモなど)を一覧で見返せる。',
        bullets: [
          'タイプ別フィルタで絞り込み',
          '本のタイトルから詳細にジャンプ',
        ],
      },
      {
        title: 'タイムラインで成長を実感',
        body: '読書の軌跡を時系列で振り返れる。',
        footer: '3 ヶ月前・半年前の自分の気づきを見返してみましょう。',
      },
      {
        title: '横断検索で必要な時に呼び出す',
        body: 'すべての本のメモ・学びをキーワードで横断検索。',
        bullets: [
          '「決断」「習慣」など気になる言葉で',
          'タグでも検索可能',
        ],
      },
    ],
  },

  quotes: {
    title: '💎 名言について',
    description: '読書と自己変革を頑張るあなたへ、世界の偉人の言葉。',
    lastUpdated: '2026-04-27',
    sections: [
      {
        heading: '🎲 表示場所',
        body:
          'アプリ起動のスプラッシュ画面、新規登録時のオンボーディング 1 枚目、本を読了した時のお祝いトースト、振り返りタブの「🎲 今日の振り返り」など、様々な場面で表示されます。',
      },
      {
        heading: '📚 100 以上の名言',
        body:
          '本田直之氏（『レバレッジ・リーディング』著者）を中心に、福沢諭吉・稲盛和夫・ベンジャミン・フランクリン・デカルト・ニーチェ・バフェット・チャーチル・エジソンなど、時代と国を超えた知恵を結集（合計 129 件）。',
      },
      {
        heading: '🎯 12 のテーマ',
        body:
          '読書 / 自己投資 / 行動 / 継続 / 失敗と成長 / 学び / 復習・記憶 / 自己変革 / 哲学・智慧 / 励まし / 達成感 / 時間と人生 — その場面に合うテーマから選ばれます。',
      },
      {
        heading: '🔥 飽きない設計',
        body:
          '直近 5 件は表示候補から外す賢い選択ロジック。何百回開いても新しい発見があります。`src/lib/quotes.js` を編集すれば名言を追加可能。',
      },
    ],
  },

  // 必要に応じて他のページも追加（設定画面、統計、タグ管理など）
};

// Helper to read a help entry safely.
export function getHelp(key) {
  return HELP_CONTENT[key] || null;
}
