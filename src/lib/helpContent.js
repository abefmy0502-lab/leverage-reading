/**
 * Help Content for Leverage Reading App
 *
 * 更新履歴:
 * - 2026-06-27: 💰 操縦席に「粗利」と「4部門の常駐」を追加（管理者のみ）。①目標に gross_profit（月次粗利）を追加＝売上ではなく粗利で目標設定→達成ペース逆算（ops_goals の metric 制約に gross_profit 追加。既存DBは ALTER で拡張）。②売上セクションに月次粗利の概算（MRR − 決済手数料3.6% − AI原価[コール数×概算単価]）を表示。直接原価ベース・人件費/固定費は含まない旨を明記、係数はローンチ後に実測調整。③MRR概算の月額単価を実価格 ¥1,480 に修正（旧 ¥990）。④「今やるべきこと」を経営/マーケ営業/開発/経理の4部門に割当＝各アクションに担当部門バッジ＋上部に部門ロスター（担当件数）を表示。経理ルール（粗利率<50%・AI原価/人>¥45）を追加。ユーザー数・新規・売上は従来どおり自動算出。npm run build 成功
 * - 2026-06-27: 🎛️ 運営ダッシュボードを「操縦席（Founder Cockpit）」に進化（管理者のみ）。数字の羅列から「いつ何をすべきか」を指示する操縦席へ。①🎯目標（MRR/有料会員数/総ユーザー＋締切）を設定→現在地との差分で達成ペース（週いくら必要か）を逆算。②📋今やるべきこと＝指標から自動生成される優先アクション（集客/定着/収益化/継続/品質のファネル別・優先度順、各アクションに"根拠"の数字付き）。数字が動くと指示も軌道修正（再読込で再計算）。③🎫チケット＝顧客フィードバックをワンタップでバグ/要望チケットに変換（カテゴリで自動振分・バグは優先度高）＋進捗管理（対応中/完了/却下/優先度）。DB は supabase_admin_ops.sql（ops_goals / ops_tickets ＋ admin_set_goal/admin_tickets/admin_ticket_from_feedback 等の DEFINER RPC、要・先に supabase_admin_metrics.sql 適用）。一般ユーザーには無関係（ヘルプキー追加なし）。npm run build 成功
 * - 2026-06-27: 🗑️ AI選書「テーマの棚」の『最新の新刊』モードを撤去（CEO 決断）。Google Books の発売日順は本屋の新刊台のようなキュレーションではなく無名・自費出版・海外版まで混ざるノイズの多いデータで「微妙／何も出ない」状態だった（サーバー移行でもデータ品質は不変）。隣の『良書の棚（AI・テーマ別）』が機能し本田哲学（目的を持った棚歩き）にも合うため、モード切替・新刊グリッド・fetchNewReleases 経路・関連 state（browseMode/newReleases…）を撤去し「テーマの棚を眺める＝AIが良書を選書理由つきで並べる」に一本化。aiAdvisor ヘルプの該当節を同期。fetchNewReleases 自体は bookSearch.js に dormant 温存（git 履歴から復活容易）。npm run build 成功
 * - 2026-06-27: ⭐ 本棚の絞り込み「評価」を選択式に＋タグの導線を明確化。(1) 評価フィルタが「★4以上のみ」固定だったのを、★1〜★5以上から選べるチップ式に変更（同じ星を再タップで解除）。各本の評価は本詳細の★で付ける（既存）。(2) 絞り込みシートのタグ欄は、タグ付きの本が無いと出ないため、未使用時に「本を開いて『タグ』欄でキーワードを付けると、ここで絞り込めます」の導線を表示（タグ機能自体は既存＝本詳細の『タグ』欄で付与→OR絞り込み）。bookList ヘルプの絞り込み節を同期。DB 変更なし。npm run build 成功
 * - 2026-06-27: 🎙 クイックメモに「✨ 凝縮」と音声入力ヒントを追加（自前録音は持たない設計判断）。話してメモは iOS 中心 PWA でも OS 標準のキーボード🎤ディクテーション（無料・端末内・速い）で既に可能なので、自前の音声認識 API（Google STT）は採らず＝手段の目的化を回避。我々が足す独自価値は「凝縮」だけに絞った: (1) クイックメモ（QuickMemoSheet）にカード編集と同じ「✨凝縮」ボタン（60字以上で出現・既存 condenseMemo で核心へ・↩元に戻す可）を追加。(2) クイックメモ／カードメモ編集の両方に「キーボードの🎤を押すと、話して入力できます」のヒントを追加（標準ディクテーションへの導線）。新 API・録音 UI・音声の外部送信は無し（プライバシー論点ゼロ）。memoEditor ヘルプに音声入力＋凝縮の節を同期。npm run build 成功
 * - 2026-06-27: 🛰️ 運営ダッシュボード（管理者のみ）を新設。⚙️設定→「運営」から、アクティブ人数（DAU/WAU/MAU・新規・日次推移）/売上・課金（有料会員・概算MRR・期限間近）/AIコスト・API消費（月次コール）/機能別の利用状況（イベント別・AI機能内訳・本の追加経路）/問い合わせ受信箱（feedback をステータス別表示＋トリアージ）を1画面に集約。DB は supabase_admin_metrics.sql（app_admins ＋ is_app_admin ゲート ＋ SECURITY DEFINER 集計 RPC）。未適用 DB では入口が出ないだけ（既存挙動非破壊）。一般ユーザーには無関係（ヘルプキー追加なし）。npm run build 成功
 * - 2026-06-27: 🛰️ 表紙取得をサーバーサイド化（端末の Google 429 / NDL CORS を根治）。実機で「自動でも手動でも表紙が見つからない」のは、端末から Google Books を叩きすぎて 429 になり、NDL も CORS でブラウザから読めないクロスオリジン起因と判明。新 api/cover.js（固定IP・CORS制約なし・CDNキャッシュ）が title/author/isbn から Google Books → NDL/openBD/Amazon を順に解決し検証済み URL を返す。クライアント（resolveCoverInBackground / coverAutoRetry / 表紙を取り直す）は resolveCoverViaServer を最優先で呼ぶ。失敗時は従来のクライアント側経路にフォールバック。npm run build 成功
 * - 2026-06-27: 🖼️ 表紙の取得失敗の主因（副題付きタイトル）を根治。「確率思考の戦略論 USJでも実証された…」のように副題ごと保存された本は、NDL/Google が返す核タイトル「確率思考の戦略論」と類似度判定で 0.3 程度に落ち、isSameBook が不一致→ISBN 解決失敗→NDL/openBD 書影に到達できず表紙ゼロになっていた。修正: titleSimilarity を「核タイトル＋副題＝同一書誌」として高スコア(0.95)に（暴発防止＝核≥6字かつ続き≥3字の時のみ。『営業』→『営業の魔法』のような短核は比率のまま却下）。あわせて ISBN 候補キャッシュを v4 に bump（旧 v3 の失敗キャッシュを破棄し再解決）、緩い Google 表紙検索から langRestrict=ja を除去（ja タグ無しの取りこぼし防止）。既存の表紙なし本は次回本棚表示で自動回復（coverAutoRetry）。ユニットテストで副題3例=MATCH / 短核・巻数・別書=却下 を確認。npm run build 成功
 * - 2026-06-27: ✨ アクションの手応えを刷新（下部ポップアップ→上品な反応）。実機フィードバック「アクションのたびに下に出るポップアップが不要・押したボタンがおしゃれに反応してほしい」を反映。(1) 成功（保存/追加/更新等）の「○○しました」を下部バーから、画面中央に一瞬だけ出て消える ✓ HUD（iOS 風・blur・スケールイン→フェード 1.15s）に変更＝下部ポップアップを廃止。HUD は ✓ を出すのでメッセージ先頭の絵文字は自動除去。(2) タッチ端末でボタン押下中に僅かに沈む手応え（:active scale、keyframe と干渉しない無 transition）。(3) 削除の「取消（アンドゥ）」は誤削除の保険として温存しつつ、下部バーを blur・角丸・ピル型「取消」・ラインアイコンで上品に。(4) エラーは見逃すと困るので下部バーで残す（同様に上品化）。Toast.jsx 全面改修・index.css に HUD/press のキーフレーム追加。挙動（undo/error の機能）は不変。npm run build 成功
 * - 2026-06-27: 🔄 アプリの自動更新化（手動「更新」タップ不要に）。原因: (1) sw.js の SW_VERSION が手動 'v54' 固定で、コード変更のみのデプロイでは sw.js のバイト列が変わらず新 SW が検出されない（＝開きっぱなしの iOS PWA が古いまま）。(2) 検出しても更新バナーのタップ待ちだった。対策: ①vite.config.js に stamp-sw-version プラグインを追加し、ビルドごとに dist/sw.js の SW_VERSION へ git commit を焼き込む（'v54-<sha>'）→ 毎デプロイで sw.js が必ず変わり新 SW を検出。②swUpdate.js に autoApply を新設し App から有効化: 起動直後に待機版があれば即適用（開いた直後で失うものが無い＝一瞬の再読込で新版へ）、利用中の検出は「次にバックグラウンドへ入った時」に静かに適用（メモ入力/AI 会話を中断しない）。更新バナーは「今すぐ更新したい人」向けの保険として温存。設定の「最新版に更新」も手動オーバーライドとして継続。npm run build 成功
 * - 2026-06-27: 🖼️ 表紙の取得率を大幅改善（~99% 目標）＋「最新の新刊」0件問題を修正。①表紙: (a) findCoverFromGoogleBooks に緩いフォールバック相3を追加（厳格マッチに漏れても、タイトル＋著者のプレーン検索の上位ヒットの thumbnail を採用＝部分一致で同一書籍とみなす）。(b) 表示時の自動再取得 coverAutoRetry を ISBN 専用から「Google Books サムネ経路を最優先」に強化＝ISBN が無い/厳格マッチに漏れる和書も拾えるように（既存の表紙なし本は次回本棚表示で自動回復・1秒1冊）。(c) 追加時検索で既に取れている表紙を捨てずに採用（addFromAdvisor）。(d) checkImageExists の timeout 3s→5s（モバイル回線の取りこぼし防止）。②最新の新刊: fetchNewReleases の「表紙必須」フィルタが新しめの和書を全部落として0件にしていた→表紙必須を撤去し「表紙 or ISBN あり」で残す＋表紙ありを前に寄せる＋未来日付の誤データのみ除外。新刊グリッドは表紙なしでもタイトルのプレースホルダで表示。CSP/DB 変更なし。npm run build 成功
 * - 2026-06-27: 🔗 Amazon リンクを「商品ページ直リンク」に改善。これまで ISBN しか無い本は `/s?k={ISBN}` の検索ページに飛び、スポンサー商品や他の本が混ざって表示されていた。書籍の Amazon ASIN は基本 ISBN-10 と一致するため、ISBN-13（978 始まり）を ISBN-10 にアルゴリズム変換して `/dp/{isbn10}` の商品ページへ直接着地させる（amazonLink.js の isbn13to10 / toProductAsin 新設）。979 始まり等 変換不可のものだけ従来の ISBN 検索にフォールバック。アソシエイトタグ・開示文は不変。npm run build 成功
 * - 2026-06-27: 🆕 本屋モードに「最新の新刊」モードを追加（Phase 2）。本田直之の"本屋で最新刊を眺める"を実データで実現。テーマチップの上に「📚 良書の棚（AI）/ 🆕 最新の新刊（実データ）」のモード切替を新設。新刊モードは Google Books の orderBy=newest で発売日の新しい順に取得（langRestrict=ja・表紙あり・本棚既存を除外・最大12冊）し、表紙グリッドで表示＝本屋の新刊台。各カードの「読みたい」は isbn/cover 取得済みなので onAddBook へ直接（先のクロージャ修正済み追加フロー再利用）。429/失敗は静かに空→「良書の棚」へ誘導。新関数 bookSearch.js の fetchNewReleases。CSP は googleapis/Google Books 表紙とも既存許可で変更不要。DB 変更なし。npm run build 成功
 * - 2026-06-27: 📚 AI 選書に「本屋モード（テーマの棚を眺める）」を追加。本田直之の「本屋で棚を歩いて新刊・良書を眺める」の追体験を、新タブを作らず AI 選書の中で実現。課題が曖昧な日でも、最初の画面の「テーマの棚を眺める」チップ（あなたのタグ/フォルダ由来テーマを先頭に＋営業/リーダーシップ等の定番）をタップすると、AI が定番＋比較的新しい良書を並べる。既存の推薦カード・追加フロー（先のクロージャ修正済み）・会話履歴をそのまま再利用（generateRecommendations にテーマ起点クエリを流すだけ）。汎用の新刊カタログ（思想ズレ・データ源コスト・アイデンティティ希薄化リスク）は採らず、ユーザーの関心に紐づく"発見"に寄せた（本田: 目的なき読書はしない＝アンテナを張った棚歩き）。aiAdvisor ヘルプにステップ追加。DB 変更なし。npm run build 成功
 * - 2026-06-27: 🗂 本棚のフォルダ分けを標準搭載（Phase 2）。本を自由なグループ（例: デザイン / マンガ / マイベスト）に整理。割当は本詳細の「フォルダ」欄（TagInput 再利用・book.collections 配列・1 冊複数フォルダ可）。本棚はフォルダが1つ以上あるときだけ折りたたみ式の切替チップ行が出る（新規ユーザーには出ずスッキリ維持）。DB は book_collections 新規テーブル（supabase_book_collections.sql・book_tags 同型・RLS）。useBooks は staged schema-error fallback（BOOK_SELECT_FULL→BASE / 保存時 isMissingRelationError 握りつぶし）で未適用 DB でも保存・読込が壊れない。手動ドラッグ並べ替えは非採用（本田判断＝"見せる"機能）。bookList ヘルプにステップ追加。**要・Supabase で supabase_book_collections.sql を実行**。npm run build 成功
 * - 2026-06-27: 🧹 本棚をシート化ツールバーで整理＋絞り込みを拡張（競合相当を標準搭載・Phase 1）。本の前にコントロールが3段積まれていた「ごちゃつき」を解消: 常時表示のステータスピル列と並び順セレクトを撤去し、「絞り込み / 並び」ボタン→ボトムシートに集約（新 BottomSheet.jsx）。絞り込みは ①ステータス ②★4以上のみ ③タグ（本に付いたタグを頻度順に最大24個）に拡張＝OR 条件、件数バッジ＋「条件をクリア」付き。並びは 更新/登録/タイトル/評価 をシートで選択。表示モード（グリッド⇄リスト）は据え置き。手動ドラッグ並べ替えは"見せる機能"のため非採用（本田判断）。bookList ヘルプにステップ追加。DB 変更なし。npm run build 成功
 * - 2026-06-27: ✂️ 説明文を「短く・普通の言葉」に（実機フィードバック）。説明しすぎ＆専門用語を削減。(1) テーマまとめのヒーロー文を「テーマを選ぶと、そのメモをまとめて『この1行』と『次の一歩』にしぼります。あとで振り返りや通知でそっと思い出せます。」に短縮。(2) 専門用語「行動の鏡」を撤去 →「行動できてる？」に（統計ラベルも 宣言した行動→決めた行動 / 放置→放置中）。help の該当 title/body も同期。(3) マイ読書脳の空状態を2文に圧縮（重複する括弧注記を削除）。(4) 振り返りノートの空状態を2行に短縮＋種別の羅列を「残したメモや学びが、すべてここに集まります」に、アイコンも 📝→ラインアイコンに。npm run build 成功
 * - 2026-06-27: 🎖️ 本田レビュー②視覚の地金 premium 化＋構造の簡素化（CEO 決断）。(視覚) 全 lucide を strokeWidth 1.75 + 光学中央寄せに一括精錬（線が太い=安さを解消）/ Review 種類バッジと行動の Material 原色をウォーム3アクセント（達成=苔green・警告=brick・注意=gold）に統一 / 装飾グラデを単色トークン面に平面化 / 端数 font-size を整数スケールへスナップ。(構造) ①レバレッジメモ→「テーマまとめ」に改名（独自名の認知コスト減。AI プロンプト概念・LEVERAGE_RECALL_MARKER データキー・書名・コード識別子 themeReport/theme_reports は不変）②読了の行動エディタを「内容＋期限」の2項目に凝縮し、優先度/繰り返しは「行動」タブの編集に集約＝本詳細を1画面1アクションへ（既存データ・列は温存）③まとめ式メモに「✨ カードからまとめを生成（AI）」を新設—カード2枚以上で AI が1枚に統合した下書きを作る（summarizeCards / prompts.js の cardsToSummary。手書きの手間＝まとめが redundant に感じる原因を解消、モード削除やデータ消去はしない）。npm run build 成功
 * - 2026-06-27: ✨ デザイン言語を刷新（絵文字→モノクロのラインアイコン）。「個人開発の安いアプリ感」を解消し、先進的でクレバーな AI アプリの佇まいへ。本棚・振り返り・AI の3タブに加え、奥の画面（レバレッジメモ／マイ読書脳／知識ベース／AI選書履歴／本の追加フロー／行動の編集／メモ入力・カード／本詳細の各フェーズ）まで、見出し・ボタン・チップ・ラベルの絵文字を lucide-react のラインアイコンに統一。文言・機能・データ・コード識別子は不変（見た目のトーン統一のみ。ヘルプ説明文・トースト・AI 生成の Markdown 見出しの絵文字は据え置き）。npm run build 成功
 * - 2026-06-27: 🎯 レバレッジメモの行動の行き先を明確化＋🧹データ初期化を新設。(1) レバレッジメモ「✅ この一歩を行動リストに入れる」の追加先が分からなかった問題→ボタン下に「追加先は『振り返り』タブ→『🎯行動』」を明記、追加後はボタンが「✅追加済み・🎯行動リストで見る →」になりタップでそのまま行動タブへ遷移、追加時に books を refresh して即時反映、トーストも「🎯振り返りタブ→『行動』に追加しました」に。(2) ⚙️設定→アカウントに「🧹 データを初期化」を新設—アカウント（ログイン）は残したまま、本・メモ・写真・行動・対話履歴・テーマ履歴などを全消去してまっさらに戻す（確認ダイアログ必須、完了後リロード、端末ローカルの一時状態も掃除）。npm run build 成功
 * - 2026-06-27: 🐛 実機フィードバック3点を修正。(1) 「読書の投資対効果」パネルが初見で意味不明だった→「📈 読書が成果に変わった記録」に改題し「読んだ本が、行動の実行、そして学びの収穫へつながった数です」の説明文を追加、ラベルも「読んだ本／実行した行動／残した収穫」に平易化。(2) 同じ繰り返しタスクが何個も並ぶ重複を解消→ useAllActions に完全重複（同一本・文言・期限・完了状態・繰り返し）の dedup を追加、useBooks の保存時にも重複行を1件へ収束（DB 掃除）、繰り返し spawn は未完了の同一インスタンスが残っていれば作らないガードを追加。(3) 振り返りノートで上方向スクロールがカクつく問題→ PullToRefresh が安静時も translate3d(0,0,0) で縦長リスト全体を常時 GPU レイヤー化していたのを、引っ張り中だけ transform を効かせるよう変更（iOS Safari のスクロールジャンク解消）。npm run build 成功
 * - 2026-06-26: 🎯 本田100点化③— 行動の輪を閉じる（やり残しを名指しで突き返す）。(1) 🎯 行動の鏡に「🔸 まだやれていない一歩」を追加 — テーマの未完了アクションを最大3件、実名で表示（数字だけでなく中身を突きつける）。gatherThemeActions が openSteps を返す。(2) 💭 今週の問いに未完了アクションを渡し、AI が「先に決めた〇〇、やれましたか？」と実名で問えるように（行動→実行→振り返りの輪を能動的に閉じる）。コード識別子は不変。npm run build 成功
 * - 2026-06-26: 🎯 本田100点化①— 投資目的の必須化＋ROI可視化＋用語統一。(1) 🎯 投資目的を必須化（本田第一原則「目的なき読書はしない」）: 読書前(before)→読書中へ進む時、投資目的が空なら設定画面へ誘導（AI解析/読書計画は任意・警告のみ）。before 見出しを「読む前に、投資目的を決めましょう」に。(2) 📈 ROI損益計算書: 本棚ヘッダーに「読書の投資対効果」漏斗（読了→行動 実行→収穫）。読了=作業量、行動完了/収穫=成果として可視化。(3) 用語統一: 「投資の効果」→「一番の収穫」、AI要約まわり→「要点の凝縮」（投資目的/投資対効果/投資の効果 の3変種を解消）。コード識別子は不変。npm run build 成功
 * - 2026-06-26: 🎯 本田100点化（細部の総点検）。(1) ✨ メモを「3行に凝縮」ボタンを追加（BookMemoEditor）— 長文/OCR を本田流レバレッジメモ化。60字以上で表示、AI が本質だけに削る、↩元に戻す可（condenseMemo / prompts.js の condense）。(2) オンボーディング4枚を「本は投資・読書を行動と成果に変える」哲学で全面改稿（記録→投資の入口へ）。(3) 「続きから」をフィルタから独立表示（タグで絞っても読みかけに戻れる）。(4) 検索ヒットなし時の「手動で追加」を実線ソリッドボタンに格上げ（見つけやすく）。コード識別子は不変。npm run build 成功
 * - 2026-06-26: 💭 マイ読書脳を能動化「今週の問い」（本田レビューの宿題）。受け身（質問しないと出ない）を、向こうから問いを投げる能動型に。メモがある人にだけ、開いたとき chat 空状態の先頭に「💭 今週の問い」カードを表示。`generateWeeklyQuestion`（prompts.js の weeklyQuestion）がユーザー自身のメモから 1 文の問いを生成。端末ローカルで週次キャッシュ（同じ週は再生成しない・AI コール節約）、生成不可/未接続は定型フォールバック、その週に × で dismiss 可、新規（メモ無し）には出さない。「この問いに答える →」で入力欄にセット。挙動の本質・コード識別子は不変。npm run build 成功
 * - 2026-06-26: 🧭 本田直之レビューに基づく取捨選択（CEO 決断）。(1) 削除: 📖 読書進捗バー（ページ管理）— 「作業量の可視化」は成果ではなく、進捗を見て満足する病を生む（本田哲学=ROI は行動で測る）。ReadingPhase の現在/総ページ入力・本棚カードの進捗バー・本詳細の進捗ブロック・計測を撤去。DB 列（current_page / total_pages）は dormant で温存し復活容易・既存データ保持。memoEditor ヘルプの「読書進捗」節を削除。(2) 強化: 🎯 行動の鏡 →「✅ この一歩を行動リストに入れる」で、AI が出した次の一歩を 1 タップで 🎯 行動に追加（テーマで最もメモが多い主役の本に紐づく）。学び→実践の輪を閉じる。actions への insert は id を client 生成（gen_random_uuid 未設定 DB 対策）+ schema-error fallback。挙動の本質・コード識別子は不変。npm run build 成功
 * - 2026-06-26: 📐 「テーマレポート」を「レバレッジメモ」に昇格（本田直之哲学を体現する目玉）。要約の羅列だったレポートを、(1) 🧭核心1行＋🔑繰り返す原則3つ（出典）＋🎯次の一歩1つ に「凝縮」（プロンプト全面改訂・冗長な共通パターン/対立/引用元セクションを廃止）、(2) 🎯行動の鏡 — そのテーマの actions を集計し「宣言/完了/放置」を実データ表示、メモは多いのに行動0件の盲点を炙り出す（数値は AI でなく実集計）、(3) 🔄想起ループ接続 — 「想起にセット」で核心を personal メモとして保存し 🔄振り返りのランダム想起＋🔔想起通知 に自動で乗せる（読んで終わりにしない）、(4) 📈前回からの変化 — 端末ローカルのスナップショット比較でメモ/本の増加を表示（DB 変更ゼロ・偽数字を出さない）。AI サブタブ名「📊 レポート」→「📐 レバレッジメモ」。コード識別子（themeReport / theme_reports 等）は不変。DB マイグレーション不要（recall は book_memos の personal を再利用）。npm run build 成功
 * - 2026-06-26: 🧭 タブの入口を一定にする＋マイ読書脳の開き方を改善。(1) 下部ナビの「振り返り」を押すと必ず 🎯行動 から、「AI」を押すと必ず 🔍AI選書 から開くように（サブタブの localStorage 永続化を廃止し、ナビ切替時に既定へリセット）。直前に見ていたサブタブ（ノート/マイ読書脳/レポート）に毎回飛んで「押したのに違うものが出る」混乱を解消。(2) マイ読書脳の 💬質問 は、開くたびに新しい会話から始まるように（過去のやりとりは 📜履歴 にすべて残る）。「開いた瞬間に前回の会話がそのまま出てきて違和感」を解消。クロックずれ対策で境界はサーバ時刻基準。挙動の本質・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-26: ⚙️ アカウント設定の情報整理（第2弾）。(1) グループ見出しとカード見出しの絵文字重複を解消 — 見出し（💳プラン・お支払い等）から絵文字を外し、絵文字はカード側のアイコンに一本化（iOS「設定」のセクション見出し＝淡いグレーのプレーン文字に）。(2) 雑多だった「📥データ・アプリ」グループを意味のある 4 つに再編 — 「通知」（想起の通知）/「データとプライバシー」（データのダウンロード＋利用状況の記録）/「アプリ・サポート」（最新版に更新＋フィードバック）/「アカウント」（削除）。グループ見出しの上余白を広げ、切れ目を一目で分かるように。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-26: ⚙️ アカウント設定画面の分かりにくさを改善。(1) オン/オフ設定（🔔想起の通知・📊利用状況の記録）を「オン（タップでオフ）」という状態＋操作を詰め込んだ全幅ボタンから、iOS 風トグルスイッチ（右端・色＋ノブ位置で状態が一目で分かる）に変更。ToggleSwitch / SettingRow を新設し「設定＝スイッチ・実行＝ボタン」を視覚的に区別。(2) 💳プランカードの行き止まり解消 — 管理ボタンを出せない状態（Web で stripeCustomerId 未同期・付与契約など）でも説明文が「解約・カード変更…はこちらから」とボタンの存在を匂わせていたため、ボタンが無い時は「お問い合わせよりご連絡ください」と実際の導線に書き換え、宙に浮いた「次回更新後にご利用いただけます」を撤去。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-26: 📱 iOS アプリ専用への一本化（App-only ピボット）。Web は紹介 LP のみ・利用は iOS アプリのみという位置づけに統一。(1) 価格を全面統一: 月額 ¥1,280→¥1,480 / 年額 ¥10,800→¥12,800（月あたり約 ¥900→約 ¥1,066 に再計算）。(2) billing ヘルプを App Store 課金前提に書き換え（お支払い・解約は App Store / Apple ID 経由、Stripe/クレカ直課金の記述を撤去、「購入を復元」案内を統合）。(3) LP(Landing.jsx)の CTA を Web 新規登録(?auth=signup)から App Store ダウンロードへ（APP_STORE_URL プレースホルダ・公開時に実 URL 差し替え要）、5日間返金保証など Stripe 前提コピーを Apple 返金ポリシー前提に。(4) 法務文書(特商法/利用規約/プライバシー、SctPage/TermsPage/PrivacyPage + legal/*.md)から Web 版・Stripe・Google Play の記述を撤去し App Store IAP 前提に整理。Stripe 関連のコード（api/stripe-*.js / billing.js の startCheckout 等）は将来の再開に備え温存（dormant）。挙動・データ・コード識別子は不変。
 * - 2026-06-25: 🔁 アプリに戻ると初期画面に戻る問題を改善（画面復帰）。iOS PWA はバックグラウンドでメモリ解放されると復帰時にまるごとリロードされ state が初期化される。従来はタブ(activeTab)のみ復元だったため、本の詳細を見ていても一覧に戻されていた。view（詳細/編集）と開いていた本の id を localStorage('navState') に保存し、books 読込完了後に一度だけ同じ本の詳細へ復帰する（初回マウントで上書きされる前に保存値を ref 退避）。編集中だった場合は未保存フォームが失われているため detail に着地。本が削除済みなら一覧のまま、想起プッシュのディープリンク処理中はそちらを優先。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🐛 読書設計ページが横スクロールする（ページ全体の横幅崩れ）を修正。原因は MarkdownSections が flex column で、子要素の既定 min-width:auto により幅広な内容（Markdown 表など）が縮まずページを横に押し広げていたこと。(1) wrap/section に minWidth:0・maxWidth:100% を付与し縮小可能に（表は内側の overflowX:auto で横スクロール）。(2) 共有 inp に minWidth:0・appearance:none を付与（iOS の日付入力の最小幅はみ出し対策）。(3) 詳細/編集のスクロール領域に overflowX:hidden を付与し、ページ全体の横スクロールを確実に封じる belt-and-suspenders。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🐛 読書設計まわりの修正。(1) AI『本の解析』出力内の「関連書籍」の 読みたい ボタンが無反応だった問題を修正 — 解析(aiAnalysis)の MarkdownSections に onAddRelatedBook / addingTitles が渡っておらず、解析セクションの関連書籍だけボタンが死んでいた（読書計画シート側は機能していた）。編集・詳細の両方で渡すよう統一。(2) 横幅はみ出し対策 — AI 出力の見出し/本文/箇条書きに overflowWrap:anywhere を付与し、長い英語タイトルや URL でカードが画面外に膨らんで『横幅が合わない』現象を防止。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 📷 バーコード読取を iPhone でも対応（CEO アップグレード）。従来は Web 標準 BarcodeDetector のみで iOS Safari/WKWebView 非対応＝iPhone ではボタン非表示だった。ZXing(@zxing/browser + @zxing/library)を遅延 import のフォールバックとして追加し、BarcodeDetector があれば優先・無ければ ZXing で連続デコード（背面カメラ・EAN-13/ISBN）という二段構えに。BARCODE_SUPPORTED の条件を「カメラ(getUserMedia)が使える HTTPS 環境」に緩め、全端末でボタン表示。ZXing は専用の動的チャンク(≈110KB gzip)として『スキャンを開いた時だけ』ロードするので初回ロード・メインバンドルは不変。停止経路(close/成功/アンマウント)で controls.stop() を確実に呼びカメラ消し忘れ無し。bookList ヘルプを同期。npm run build 成功（警告なし）
 * - 2026-06-25: ✨ マイ読書脳の回答も「設計された回答」化。素の pre-wrap テキストダンプだった AI 回答を、【結論】【参照した本のメモ】… の構造を小さなアクセントのオーバーライン見出し＋読みやすい段落＋**太字**対応で描画（ストリーミング中は途中の【】誤組みを避け素のまま流し、完了時に構造化）。下部の参照ラベルも絵文字付き→クリーンなオーバーラインに統一。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🤖→✨ 「AIっぽいUI」の脱・素markdown化。AI 出力の最大の“ChatGPT 感”だった (1) 見出し冒頭の絵文字(🏆🔑📚🎯👋💬📋 …) を MarkdownSections のレンダリング層で一括ストリップ（プロンプト不変・全AI出力=選書/本の解析/読書計画/テーマレポートに一括適用。ハイライト判定は元テキストで行い装飾は維持）。(2) 箇条書きをブラウザ既定の黒丸/数字から、上品なアクセントの小ドット＋専用番号スタイルに置換（list-style:none + flex マーカー）。(3) 推薦カードの 🎯💡📍⏱️ ラベルを、絵文字なしの iOS 風オーバーライン（小・太・字間広め・ミュート色「なぜあなたに/この本の核心/注目ポイント/目安」）に刷新。素のLLM出力ではなく“設計されたアプリ画面”の見え方に。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 📈 商用プロダクト化アップグレード（CEO）。(1) SNS リッチプレビュー — index.html に Open Graph / Twitter Card メタを追加し、URL を LINE/X/Slack 等に貼るとブランドカードが出るように。og-image.png(1200x630・グリフ＋Orime をアプリと同じクリームグラデ背景に合成)を新規生成。口コミ流入の質が上がる。(2) PWA manifest 強化 — id / lang(ja) / dir / categories(books,education,productivity) を追加しインストール品質・発見性を向上。挙動・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: ⚡ パフォーマンス大幅改善（CEO アップグレード）。(1) レンダーブロッキングだった Google Fonts(Noto Serif JP 3 weights＋Inter＝和文数MB級)の読み込みを撤去 — アプリ本体は OS 標準フォントに移行済みで不要だった。LP/法務ページは landing.css/legal.css の OS mincho フォールバック(Yu Mincho/Hiragino Mincho ProN)で同等の見た目を維持しつつダウンロード 0。初回表示が大きく軽くなる。(2) vite の manualChunks で単一 800KB バンドルを vendor-react / vendor-supabase / vendor-icons / vendor / アプリ本体に分割。アプリ本体 chunk が 800KB→394KB(gzip 244→124KB)に減り、滅多に変わらない vendor は長期キャッシュが効くため更新時の再ダウンロード量が激減。chunkSizeWarningLimit も整理。挙動・データ・コード識別子は不変。npm run build 成功(警告なし)
 * - 2026-06-25: 🧹 有識者パネルレビュー反映 第4弾（絵文字密度・設定）。(C) 推薦カードの絵文字過密(📕🎯💡📍⏱️🛒📚)のうち、タイトル横の装飾 📕（『』表記と重複）を撤去。機能を示すラベル絵文字は可読性に寄与するため温かみ重視で残置。AI 出力本文の見出し絵文字も「方向C(温かみ)」かつハイライト判定に使用のため意図的に維持。(D) 設定モーダルのコピーは第1〜3弾の精緻化で既に簡潔・余白十分のため大きな変更は不要と判断。色トーン・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🧹 有識者パネルレビュー反映 第3弾（情報密度の削減）。(A) 本棚: 累計パネルを出すときは「今月: 読了X/読書中Y/積読Z」の重複行を撤去（読了推移は月別グラフ、読書中/積読数はステータスのフィルタピルに既出のため二重表示はノイズ）。(B) 振り返りノート: AI 選書のヒアリング Q&A 等の長文メモがカード内スクロールで読みづらかったのを、6 行クランプ＋「もっと見る/閉じる」展開に変更。タイムラインが一覧しやすくなる。色トーン・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: ♿ 有識者パネルレビュー反映 第2弾（可読性/a11y）。薄すぎた三次テキスト色 #6b5f4d を一段濃い暖色ブラウン #5a4f3e に統一（157 箇所・テキスト/アイコン専用なのでレイアウト無影響）。クリーム背景上の小さなキャプション・日付・補足の WCAG コントラストを底上げしつつ、本文(濃)→補足(中)の階層は維持。色トーン・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🧹 有識者パネルレビュー反映 第1弾（重複・ノイズ除去）。AI 画面が自己説明を 3 重(サブタブ注釈＋h2＋subtitle)に出していた冗長を解消 — AI 選書/マイ読書脳の h2 から重複 subtitle を撤去し h2 タイトルの絵文字も外して整理（マイ読書脳は subtitle を「根拠にできるメモ数」1 行に集約）。本棚の「タップで本を絞り込めます」の手取り足取りコピーを撤去（ピルは自明）。色トーン・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🎨 デザイン刷新 第5弾（AI 出力の読みやすさ・タイポ精緻化）。AI 画面（選書/読書脳/テーマレポート/本の解析）の MarkdownSections レンダリングを「ダンプ感」から「設計された文章」へ。見出しを 15px/700/濃色＋微トラッキング、サブ見出し 13.5px/700、本文の行間を 1.85 に拡げ、箇条書きの項目間隔（li 5px）と字下げを整理。AI が出すすべてのカードに一括で効く。色トーン・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🎨 デザイン刷新 第4弾（ヘッダー精緻化）。(1) ロゴを生の 📚 絵文字から実ブランドアイコン（/apple-touch-icon.png・28px・角丸スクワークル＋微シャドウ）に差し替え＝「ちゃんとしたアプリ」の第一印象。(2) ヘッダーの ?・⚙️ 等のアイコンボタンを枠付き丸ボタンから iOS ナビバー風の枠なしグリフ（22px）に統一（本棚/詳細/編集の各画面）。(3) ヘッダー背景をページ（クリーム）と同色にして上部を一体化（白いカードが下で浮く構図）。色トーン・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🎨 デザイン刷新 第3弾（カードの奥行き）。最大の「のっぺり感」の原因＝カード背景(#faf6f0)とページ背景がほぼ同色で浮いて見えなかった問題を解消。(1) カード面を温かいオフホワイト(#fffdf8)に統一し、クリームのページ背景から「浮く」ようにコントラストを付与（#faf6f0 を全 92 箇所一括置換）。(2) 硬いタン枠を淡いヘアライン(#e4ddd0→#ece5d9 / #d4ccbe→#e0d8ca)に軟化。(3) 主要カード（AI セクション/推薦/行動/メモ）に角丸 14〜16・余白拡大・極薄シャドウ(0 1px 3px)で上質な奥行きを付与。色トーン（温かみ）・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🎨 デザイン刷新 第2弾（クローム精緻化）。(1) ボトムナビを iOS タブバー風に — 半透明＋backdrop-blur＋0.5px ヘアライン、web 的なアクセントバーを撤去しアイコン/ラベルの色＋太さで選択を示す（アイコン 24px）。(2) 主要ボタンの重さ解消 — AccountSettings の btnPrimary / App の btnS の「letter-spacing:1（間延び）」を撤去、角丸を lg に、微シャドウ＋weight 600 で軽快に。btnO・入力欄（inp）も角丸/枠を統一。(3) FAB（＋）をブランド色付きのやわらかい浮遊シャドウに。色・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🎨 デザイン刷新 第1弾（Apple 純正アプリ風 × 読書の温かみ）。最大の「個人開発アプリ感」の原因だった本文フォントを明朝（Noto Serif JP）から上質なゴシック（-apple-system/Hiragino Sans 系の新トークン --font-app）に全面移行。App 本体ルート＋モーダル/シート/トースト等 20+ コンポーネントのインライン serif 指定を一括置換。body に微トラッキング（letter-spacing .012em）。共通コンポーネント（.btn/.card/.input）をゴシック化＋角丸 lg・余白・primary に微シャドウで精緻化。色・データ・コード識別子は不変。npm run build 成功
 * - 2026-06-25: 🐛 AI 選書で「複数提案されても本カードが 1 冊しか出ない」バグを修正。原因は前回入れた実在検証フィルタ（findIsbnCandidates で確認できた本だけ表示）が効きすぎたこと — Google Books 429 / NDL 照合の厳格さで「実在する本でも確認できない」ことが多く、5 冊提案でも 1 冊しか残らなかった。対策: 実在検証フィルタを撤去し、提案された本は全部（最大 5 冊）表示するように。実在しない本を出さない担保は bookAdvisor プロンプト側の厳格ルールに一本化、ISBN は本棚追加時に解決（Amazon リンクは title+author 検索で機能）。生成の待ち時間も短縮（検証の数秒を削減）。npm run build 成功
 * - 2026-06-25: 📕 表紙が取得できないバグを修正（AI 選書追加時・取り直し時とも）。原因は表紙ソースの不安定さ（openBD が一時 404 / Google Books API が匿名で 429 多発）＋「追加フローが強い解決経路を使っていなかった」こと。対策: (1) lib/bookCover.js の getCoverCandidates を増強・再優先順位化 — NDL（国会図書館）書影 → openBD → Open Library（?default=false）→ Google Books → Amazon CDN（新旧ホスト）の順に。いずれも鍵不要で、checkImageExists が 1×1/平たいプレースホルダーを弾くため誤検出しない（全ホストは既に CSP img-src 許可済み）。(2) 本追加の表紙解決を取り直しボタンと同じ強い経路に統一 — resolveCoverInBackground を「Google Books 検証済みサムネ → ISBN ベース multi-source」に。(3) addFromAdvisor の同期表紙解決（最大数秒ブロック）を撤去し、即保存→裏で解決に変更（「追加」の体感を高速化）。npm run build 成功
 * - 2026-06-25: 🤖 AI 選書の「提案力」を大幅強化（第3弾）。(1) 多段ヒアリング — 1 周で即推薦せず、回答を踏まえて AI が深掘り質問を重ねる方式に（最大 3 周 MAX_INTERVIEW_ROUNDS、AI が done を返すか上限で締める）。advisorInterview プロンプトをラウンド対応（priorQA/round/maxRounds を渡し {done, questions} を返す）に刷新。UI に「深掘り2」バッジ＋「回答をもとにさらに深掘りしています…」ローディングを追加。(2) 実在検証 — 推薦された各本を findIsbnCandidates（NDL+Google 厳格マッチ）で実在確認し、確認できた本のみ表示＋ISBN を付与（Amazon リンクが商品ページへ直行）。3 冊未満なら 1 回だけ「実在する定番に差し替え」を AI に再依頼して補充。「Amazon に無い本が出る」事故を構造的に抑止。(3) 推薦プロンプト最大強化 — ペルソナを一流ブックコンシェルジュ化、「実在・正確・入手可能のみ（捏造は致命的違反）」「段階に合わせる/真因に効く/役割分担した精選」を明文化。npm run build 成功
 * - 2026-06-25: 🛠️ ユーザーフィードバック5点を反映（第2弾）。(1) 📋 推薦の「読む順番」表が崩れる問題を修正 — MarkdownSections に Markdown 表（`| … |` + `|---|`）パーサ＋モバイル横スクロール対応の <table> 描画を追加し、AI 選書の前置き(before)/締め(after)プローズを生テキストではなく MarkdownSections 経由で描画（生の `##`/パイプが見えなくなる）。(2) 🔁 アプリを離れて戻ると毎回 books に戻る問題 — 直近タブ(books/review/ai)を localStorage 'activeTab' に保存し起動時に復元。(3)(4) 🤖 AI 選書ウィザード強化 — 質問を 4〜5 問に増やし「課題の背景・場面・原因・理想」まで深掘り、複数回答が自然な質問は multi 選択（チップトグル＋「決定（N件）」、その他は選択肢に追加）に対応。推薦プロンプトに「実在し入手できる正確な書名/著者の本のみ。捏造禁止」を最重要ルールとして追記（Amazon に無い本を避ける）。(5) 🔄 振り返りタブの既定サブタブを 🎯 行動に変更（最初に「次にやること」が見える）。npm run build 成功
 * - 2026-06-25: 🛠️ ユーザーフィードバック4点を反映。(1) 📕 表紙取得の改善 — Google Books の検証済みサムネ（imageLinks.thumbnail を ISBN 直引き→タイトル/著者厳格マッチで取得する findCoverFromGoogleBooks を新設）を最優先にし、ISBN ベース multi-source・通常検索の順にフォールバック。「表紙を取り直す」に即時トースト＋ボタンを「⏳ 取得中…」表示＋二重起動防止を追加し「押しても無反応で壊れて見える」を解消。(2) 🤖 AI サブタブの折返し崩れ修正 — .sub-tab を nowrap + footnote サイズ + 字間詰めにし「テーマレ/ポート」の不自然な途中改行を解消。ラベル「📊 テーマレポート」→「📊 レポート」に短縮（説明は下のサブタイトルで補完）。(3) 🎯 行動タブの既定を「未完了」フィルタに変更（タスク管理アプリの基本＝やることを最初に表示）。フィルタピルも未完了を先頭に。未完了 0 件時は「🎉 未完了の行動はありません」と讃える空状態＋「完了した行動を見る」導線。(4) 📊 本棚サマリーの月別読了グラフを分かりやすく — 「📅 月別の読了（直近6ヶ月）」の見出しを追加、軸ラベルを「5」→「5月」に、今月を太字強調、累計ラベルを「累計の読了」に。npm run build 成功
 * - 2026-06-25: 🤖 AI 選書アドバイザーのヒアリングを「ガイド付きウィザード」に刷新。旧来は AI が 4 つの質問を一括テキストで投げて自由記述で受ける作りで「一気に聞かれて答えにくい」摩擦があった。新フロー: 初回に課題を一言入力 → AI が回答しやすい質問セット（3〜4 問・各 3〜4 択）を設計（新プロンプト PROMPTS.advisorInterview）→ クライアントが 1 問ずつチップ UI で提示（選択肢タップ or「その他」自由入力、「←」で前問/相談入力に戻れる、進捗バー + 既回答チップ表示）→ 全回答を束ねて bookAdvisor へ 1 回ストリームし推薦カード生成。質問生成失敗 / JSON 解釈不能時はヒアリングを skip して相談内容だけで直接推薦に graceful fallback。aiAdvisor ヘルプの「AI 選書で本を見つける」手順を新フローに同期。npm run build 成功
 * - 2026-06-25: 🔧 AI モデル ID を旧スナップショット claude-sonnet-4-20250514（廃止済み）から現行 claude-sonnet-4-6 に更新（api/claude.js の allowlist/default・ai.js・streamClaude.js・aiSetupSummary.js・App.jsx）。「model: claude-sonnet-4-20250514」エラーで全 AI 機能が停止していたのを復旧。単価据え置きのため原価ガードの試算は不変
 * - 2026-06-23: 🤝 競合移住者の拒否反応を下げる UI 文言調整（表示のみ・挙動/データ/コード識別子は不変）。他の読書アプリ（読書メーター/ブクログ/Goodreads/Kindle）から来た人が戸惑わないよう、馴染みのある言葉・並びに統一し独自語はやさしく注釈。(1) ステータス「読書前」→「積読」に表示統一（読みたい→積読→読書中→読了 の自然な並び。key=before 不変）。App.jsx 全表示箇所・Review フィルタ・BookshelfSummary・checkDuplicate バッジ・本ガイド該当箇所を同期。(2) メモ欄ラベル「まとめメモ」→「メモ・感想」＋説明を平易化。(3) フェーズ見出しの投資ジャーニー濃度を緩和（「読書の投資設計をしましょう」→「読む準備をしましょう（任意）」/「投資回収をまとめましょう」→「読み終えて、振り返りましょう」）。(4) オンボーディング1枚目「本を投資として管理」→「読んだ本を、記録する」、最終CTAの「人生を変える読書投資」を削除。(5) LP eyebrow「読書を、自己投資に」→「読んだ本を、ちゃんと活かす」・「読書を資産に」→「読んだことを身につける」、削除済み機能の虚偽表示「🔥連続達成日数」を撤去（反ゲーミフィケーション整合）。(6) AI サブタブ（マイ読書脳/テーマレポート）に内容の一言注釈（独自名の progressive disclosure）。npm run build 成功
 * - 2026-06-23: 📊 利用状況の記録（製品改善のためのファーストパーティ計測）を追加。ローンチ後の「磨きの優先順位」を実データで決める最小限の計測基盤。外部トラッカーは使わず自前 Supabase（analytics_events）にだけ書く（CSP 変更不要）。送るのは「イベント名＋小さな enum/数値/真偽」だけで、メモ本文・書名・著者・メール・検索語・自由入力等の PII は src/lib/analytics.js の props サニタイズ（number(有限)/boolean/≤32字文字列のみ通す）で構造的に入らない。⚙️ 設定 →「📥 データ・アプリ」に「📊 利用状況の記録」トグル（role=switch・44px・既定 ON・オフで setAnalyticsOptOut(true)）を新設。track() は fire-and-forget・never throws・never blocks で、未設定/未ログイン/オプトアウト/テーブル未適用（schema error）は静かに no-op（fail-silent）。App.jsx に app_open（起動1回）/ book_added{via}（search/manual/advisor、barcode は後続）/ status_changed{to}（advanceStatus）/ paywall_viewed（PaywallGate）を、AccountSettings に checkout_started{plan} を配線。新規 supabase_analytics_events.sql（RLS: INSERT/SELECT 本人のみ・UPDATE/DELETE ポリシー無し＝改ざん防止の監査ログ・管理者は service_role で読む）。プライバシーポリシー（src/legal/PrivacyPage.jsx + legal/privacy.md）にファーストパーティ利用状況記録（個人特定情報を含まない・設定でオフ可・外部送信なし）を正直に開示。billing ヘルプに「📊 利用状況の記録について」セクションを新設。company/analytics-plan.md（taxonomy / プライバシー方針 / 集計 SQL / 拡張方針）新規。残りのイベント（memo_added / push_enabled / reading_progress_set / export_used / ai_used / review_opened / action_completed / barcode 経由 book_added）は taxonomy に列挙のみで各サーフェス担当が後続配線。委託先一覧は外部送信が無いため変更不要
 * - 2026-06-22: 📱 iOS版（App内課金/IAP）の両チャネル化を実装（Mac不要のコード部分を先行）。Capacitor 土台を main へ再合流（capacitor.config.json は appName=Orime / native.js / main.jsx の initNative / useHaptic のネイティブ分岐 / @capacitor 依存。価格差分 ¥990 は持ち込まず ¥1,280 を維持）。新規 src/lib/iap.js（RevenueCat ラッパ。SDK は dynamic import + isNative ガードで Web バンドルから除外＝Web 完全無害。store 価格取得 / 購入 / 復元 / App Store サブスク管理）。Paywall と AccountSettings を Capacitor.isNativePlatform() で分岐 —— native は App Store 購入シート＋ストアのローカライズ価格（¥1,480）表示＋「購入を復元」（Apple 必須）＋自動更新条件の開示（審査要件 3.1.2）＋解約/管理は App Store 設定へ。反ステアリング順守で特商法リンク・サービス紹介 LP（安い Web 価格を含む）は native では非表示。Web は従来どおり Stripe（¥1,280）で不変。entitlement は subscriptions テーブル（status=active）で両チャネル共通、価格はコード非依存（Stripe Price ID / App Store 商品設定が真実）。IOS_APP_GUIDE.md を現行（App ¥1,480・RevenueCat・両チャネル）に全面刷新。billing ヘルプに「📱 App（iOS）版でご契約の場合」（管理・復元・自動更新の開示）を新設。npm run build / npm ci 成功。残りは Mac/Xcode での実機ビルドと App Store 審査（オーナー作業）
 * - 2026-06-22: 📖 読書進捗（現在ページ/総ページ→進捗バー）の UI を実装。「読書中」の本詳細（ReadingPhase）に数値入力 + 進捗バー、本棚の「読書中」カードにも細いバー（total_pages 設定時のみ）。反ゲーミフィケーション（目標/ノルマ/連続なし・あくまで続きを思い出す目安）。`books.current_page`/`total_pages`（既存の payload で送出済の列を UI から活用）、新規 supabase_books_reading_progress.sql で idempotent 追加、useBooks の schema-error fallback で未適用 DB でも保存・読込が壊れない。bookDetailReading の既存「進捗バー」セクションを実 UI に合わせて刷新（総ページ必須・カード表示・目安である旨）
 * - 2026-06-22: 🆕 2 機能追加（獲得・継続レバー）。(1) 🖼 引用カード画像共有 — カード式メモの「⋮」/長押しメニューに「🖼 画像で共有」を新設。その一行を 1080×1350 の美しい画像（書名・著者・ページ・Orime ワードマーク入り、Noto Serif JP）にして、📤 共有（端末の共有シート＝保存/各アプリ）または 💾 保存できる。外に出るのはその 1 枚だけ・自動 SNS 投稿はしない（SNS 化せず獲得の複利を狙う）。新規 shareCard.js（canvas 描画・フォント確定待ち・ワードラップ）/ ShareCardModal.jsx、BookMemoCard/List に onShare 配線（既存編集/削除/コピー/スワイプは不変）。memoEditor ヘルプに追記。(2) 🔄 ホームに「今日の想起」— 本棚上部に過去メモが 1 枚そっと戻る（メモ 5 件以上＋7 日以上前＋当日未 dismiss のときだけ・日替わりで安定・× で当日非表示）。振り返りを開かずに核体験を surface（プッシュのアプリ内版）。反ゲーミフィケーション厳守（バッジ/連続なし）。新規 HomeRecall.jsx + recall.js 再利用、App.jsx に 1 行マウント。review ヘルプに追記。いずれも npm run build 成功
 * - 2026-06-22: ⚙️ 設定（AccountSettings）簡素化に伴うヘルプ同期（文言のみ・挙動不変）。設定が「💳 プラン・お支払い / 📥 データ・アプリ / ⚠️ アカウント」の 3 グループに整理され「🔔 想起の通知」が「📥 データ・アプリ」群に内包された件を反映。review ヘルプの「🔔 通知で、向こうから戻ってくる」ステップで通知設定の所在を「📥 データ・アプリ」内と明記。billing ヘルプの「解約・カードの変更」は既に 3 グループ構成・プラン管理からの解約/カード変更/請求履歴・いつでも解約/データ保持を記載済みのため文言据え置き、lastUpdated のみ 2026-06-22 に更新。npm run build 成功
 * - 2026-06-22: 🔁 二次レビュー + UX 磨き。(1) 【修正/内部】想起プッシュの endpoint ローテーション自己修復を配線（SW の pushsubscriptionchange を App.jsx が受けて ensurePushSubscription で DB 再同期 + 起動時にも再同期）。これが無いと endpoint ローテーション後に通知が恒久的に届かなくなる穴があった。(2) 📊 テーマレポートの磨き — テーマチップの件数バッジ/44px/折返し、notice をメモ0件(info)とエラー(error)で型分け（アイコン/色/role 出し分け + エラー時「🔄 もう一度試す」）、完成レポートに「🕒 履歴」導線、a11y（role=list/aria-label）。(3) ⚙️ 設定（AccountSettings）の視覚一貫性 — 共通スタイル定数化、グループを 3 群（💳プラン・お支払い / 📥データ・アプリ / ⚠️アカウント）に整理し「🔔 想起の通知」を「データ・アプリ」群に内包、文言簡素化、a11y。挙動（課金判定/削除確認ゲート/通知購読/エクスポート）は一切不変・表示のみ。いずれも npm run build 成功
 * - 2026-06-22: 📝 メモの Markdown 書き出しを追加（データ可搬性）。⚙️ 設定 →「📥 データ・アプリ」に「📝 Markdown で書き出す」を新設。全メモ（カード式 / まとめ / 本以外の学び）を本ごとに見出し付きで 1 つの .md にまとめ、NotebookLM や Obsidian にそのまま取り込んで AI 活用・執筆に使える形に。ロックインの不安を消す（自分のメモはいつでも持ち出せる）狙い。`exportMemosAsMarkdown`（exportData.js）新規、CSV 書き出しと並置。AI 競合（Obsidian×Kindle×NotebookLM ワークフロー）分析を踏まえた可搬性強化で、Orime の AI（マイ読書脳/テーマレポート）は同じ価値を設定ゼロでネイティブ提供という位置付けを補強
 * - 2026-06-22: 🔔 想起プッシュ通知（Web Push）の試作を追加。⚙️ 設定（AccountSettings）に「🔔 通知 → 🔔 想起の通知」セクションを新設（デフォルト OFF・完全オプトイン・トグル ON 時のみ許可要求＝ユーザージェスチャ内）。週1回ほど、過去のメモが通知でそっと戻ってくる体験を自動化（Orime の核＝想起の自動化）。通知タップで /?recall=<memoId> 起動 → 振り返りタブ（💭 ノート）へ誘導（App.jsx のディープリンク + SW postMessage 受信）。public/sw.js は既存 cache/fetch ロジック無改変のまま push / notificationclick / pushsubscriptionchange を末尾追記（SW_VERSION v52→v53）。新規 src/lib/push.js（機能検出 / 購読 / 解除、VITE_VAPID_PUBLIC_KEY 未設定や iOS タブ・許可拒否は静かに無効化＝graceful degradation）/ src/lib/recall.js（想起の文言・選定ロジックを Review と共有）/ api/push-cron.js（Vercel Cron 送信・web-push・service_role、410/404 失効購読は DELETE、CRON_SECRET 認証）/ supabase_push_subscriptions.sql（RLS 本人のみ）。vercel.json に crons 追記。ユーザー可視の通知機能追加につき review ヘルプに「🔔 通知で、向こうから戻ってくる」ステップを新設。※ VAPID 鍵生成・env 投入・SQL 実行・npm i web-push・deploy・実機検証は環境作業として別途必要
 * - 2026-06-21: 競合分析（読書メーター/ブクログ/Reads/ブックノーション/Notion）を踏まえた 3 機能を追加。(1) 📷 バーコードで本を追加（AddBookModal）— Web 標準 BarcodeDetector + getUserMedia で本の裏の ISBN をカメラ読取 → 既存検索フローへ。未対応端末（iOS Safari 等）はボタン非表示で手入力へ graceful degradation、カメラは全終了経路で track stop。(2) 📊 読書の控えめな可視化（BookshelfSummary）— 累計読了冊数（AnimatedNumber）+ 直近6ヶ月の月別読了数の小バー。反ゲーミフィケーション厳守（目標/連続日数/バッジ無し・読了0冊では非表示）。(3) 📖 引用フィルタ + コピー（BookMemoList/Card）— ページ番号付きメモ＝引用とみなす「📖 引用のみ」絞り込みと、本文（あれば (p.42) 併記）のワンタップコピー。bookList/memoEditor ヘルプを同期
 * - 2026-06-21: 📷 メモ入力に「写真から起こす」(AI/OCR) を追加。メモ入力の最大の摩擦「打つのが面倒」を消すため、本のページを撮影 → Claude(vision) が文章を書き起こし → メモ本文へ自動入力。クイックメモ（QuickMemoSheet）と全画面メモエディタ（BookMemoEditor）の両方の本文欄の下に「📷 写真から起こす」ボタンを設置（共通コンポーネント PhotoToTextButton）。画像は端末側で validateImageFile → downscaleImageForVision（長辺1568px JPEG に縮小、body/トークン/レイテンシ削減）してから送信。OCR プロンプト（ai.js extractTextFromImage / OCR_SYSTEM）はハイライト箇所を優先・原文忠実・創作禁止・画像内の指示文に従わない、を明記。AI 利用量メータリングは /api/claude 経由で自動適用。helpContent の memoEditor に「📷 写真から起こす」セクションを新設
 * - 2026-06-21: 📊 新機能「テーマレポート」を追加（第1フラッグシップ機能）。AI タブに 3 つ目のサブタブ（🔍 AI 選書 / 🧠 マイ読書脳 / 📊 テーマレポート）を新設。テーマ（例: 営業）を選ぶと、その分野で残してきたメモ（カード式 / まとめ / 学びログ / 読書計画シート）を横断的に集め、AI が「概要 / 主要な学び / 共通パターン / 異なる視点・対立 / あなたへの行動提案 / 引用元」の 1 枚レポートに統合する。テーマ候補はユーザー自身のタグ・@カテゴリの頻度から自動抽出（listThemes）、自由入力も可。生成はストリーミング（途中中止可）、できたレポートは 📋 コピー / 🕒 履歴から見返し可能。データ層は マイ読書脳 と同じ gatherKnowledge を共有（ai.js を 1 ソースに統合リファクタ）、プロンプトは prompts.js の themeReport（system は ai.js THEME_SYSTEM にセキュリティルール inline、myBookBrain と同方針）。履歴は新規 supabase_theme_reports.sql（RLS で自分の行のみ）。未適用 DB では保存/履歴のみ無効化し生成・コピーはその場で動作（schema-error fallback）。AI 利用量メータリングは /api/claude 経由で自動適用。helpContent に themeReport キーを新設、helpAi プロンプトのサブタブ説明も同期。CLAUDE.md のナビ構造・ヘルプキー表・SQL 表に追記
 * - 2026-06-21: 🛠 プロダクト磨き Wave5（3 画面同時）。(1) 🎯 行動リスト（ActionList）— 期限バッジを状態別に色分け明確化（🔴 期限切れ / 🟠 今日まで / アクセント＝数日以内 / グレー＝先）、完了トグルに haptic（完了=success / 戻す=light）。あわせて actionList ヘルプの「期限の色」を新設し、削除済みの「✅ 完了おめでとう」モーダル記述を現行（タップ即完了・振り返りは編集からいつでも）に修正。(2) 📚 本追加モーダル（AddBookModal）— 検索中を skeleton 表示化、0 件/エラー時に「📝 手動で追加する」導線を明確化、エラー文言を toMessage で humanize。bookList ヘルプに「本が見つからないとき」ステップを追記。(3) ⚙️ 設定（AccountSettings）— 「💳 プラン・お支払い / 📥 データ・アプリ / ⚠️ アカウント」の 3 グループ見出しに整理（退会を最下部に分離）。billing ヘルプに設定画面の構成を一文追記。いずれも追加的・低リスク・既存ロジック不変、npm run build 成功
 * - 2026-06-21: 🔄 振り返りタブ（核＝想起）のランダム想起体験を控えめに強化。(1) ランダム表示のカード上に「💭 ◯ヶ月前のあなたのメモ」という"久しぶりに戻ってきた感"を出す一行を追加（当日書いたメモには出さない）。(2) メモが少ない初期（3 件以下）に「🌱 メモが貯まるほど、戻ってくる気づきも豊かになります。今は少なくても大丈夫。」とコールドスタートを責めずに前向きに案内。(3) ノート 0 件の空状態コピーを「ここに、あなたの気づきが戻ってきます／まずは一行から」と想起の予感を伝える文言に刷新。(4) 「別のメモを見る」操作に haptic.light() を追加（既存ジェスチャー基盤を流用、新規重複なし）。データ・ロジック・既存挙動は不変。review ヘルプキーの「ランダム想起」説明を同期
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
    description: '本を投資として捉え、行動につなげる使い方',
    lastUpdated: '2026-06-27',
    // `steps` を持つエントリは HelpModal が「ステップカード」レイアウトで描画。
    // bullets / footer は任意。sections フォールバックも renderer 側で対応。
    steps: [
      {
        title: 'まずは1冊、置いてみる',
        body: '[+ 本を追加] から ISBN・書名で検索。または「📷 バーコードで追加」で本の裏のバーコードをカメラで読み取れます（iPhone でも利用可能）。本棚が空のときは「最初の1冊を追加」から始められます。',
        footer: '見つからない / 通信エラーのときは、その場の「📝 手動で追加する」から登録できます。書名を少し変える・ISBN（裏表紙のバーコード番号）で探すと見つかりやすいです。',
      },
      {
        title: '積読の読書計画',
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
      {
        title: '🗂 フォルダで本棚を整理',
        body: '本の詳細画面の「フォルダ」欄に名前を入れると（例: デザイン / マンガ / マイベスト）、その本がフォルダに入ります。1 冊を複数フォルダに入れてもOK。',
        bullets: [
          'フォルダを1つでも作ると、本棚の上に切替えチップが出ます（無いうちは出ないのでスッキリ）',
          'チップをタップでそのフォルダの本だけ表示、「すべて」で解除',
          'フォルダ名は既存の候補から選ぶか、新しく入力して作れます',
        ],
        footer: 'タグが「検索用のラベル」なのに対し、フォルダは「本棚の見た目のグループ分け」です。',
      },
      {
        title: '🔍 絞り込み・並び替えで探す',
        body: '本棚の上の「絞り込み」「並び」を押すと、下からシートが開きます。本棚自体はスッキリ保ったまま、必要なときだけ条件を出せます。',
        bullets: [
          '絞り込み：ステータス（積読/読書中/読了）・評価（★1〜★5以上を選べる）・タグ で絞る',
          'タグは本を開いて「タグ」欄で付けられます。1冊でも付けると絞り込みに出てきます',
          '並び：更新順 / 登録順 / タイトル順 / 評価順',
          '右上のアイコンで「表紙グリッド ⇄ リスト」を切替',
        ],
        footer: '絞り込み中はボタンに件数バッジが付きます。「条件をクリア」で一括解除できます。',
      },
      {
        title: '📊 読書の積み重ねを眺める',
        body: '本棚の上部に、これまで読み終えた本の累計冊数と、直近6ヶ月の月別読了数が静かに表示されます。',
        footer: '目標やノルマではなく、自分の積み重ねをそっと振り返るためのものです（読了が1冊もないうちは表示されません）。',
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
          '読み始める準備ができたら「積読へ進む」で次の段階へ進みます。',
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
    title: '🎯 積読（読む準備）',
    description: 'AI と一緒に「この本から何を得るか」を計画する段階です。',
    lastUpdated: '2026-06-26',
    sections: [
      {
        heading: '🎯 投資目的は必須です',
        body:
          '読書中へ進む前に「📊 投資目的（何のためにこの本を読むか）」を 1 行だけでも決めてください。空のままだと読書を開始できません。\n\n' +
          '本田直之『レバレッジ・リーディング』の第一原則は「目的なき読書はしない」。目的を先に決めるだけで、同じ本から得られるリターンが大きく変わります。AI 解析・読書計画シートの作成は任意です（あると「どの 20% を読むか」が分かります）。',
      },
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
    lastUpdated: '2026-06-22',
    sections: [
      {
        heading: '🔍 AI 本の解析（読書のコンパス）',
        body:
          '積読フェーズで生成した「著者の意図 / 本の構造 / キーコンセプト / 名言 / 適合する読者 / 実践へのヒント」が本詳細上部に常時表示されます。\n\n' +
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
    description: 'AI が読書を加速します。',
    lastUpdated: '2026-06-27',
    steps: [
      {
        title: '📚 テーマの棚を眺める',
        body: '課題がはっきりしない日でも、AI 選書の最初の画面にある「テーマの棚を眺める」でテーマをタップすると、AI がそのテーマの良書を選書理由つきで並べます。本屋で棚を歩く感覚で、気になる本を見つけられます。',
        bullets: [
          'AI がそのテーマの定番＋新しめの良書を、なぜ良いかの理由つきで提案',
          'チップの先頭には、あなたがタグ／フォルダでよく使うテーマ（＝あなたの棚）が出ます',
          '気になった本は「読みたい」でそのまま本棚へ',
        ],
        footer: 'テーマを選ぶだけで、その分野の良書がAIの選書理由つきで並びます。',
      },
      {
        title: 'AI 選書で本を見つける',
        body: 'まず「どんなことで本を探しているか」を一言入力。あとは AI からの質問に、表示される選択肢をタップで答えるだけ。AI はあなたの回答を踏まえて深掘りし、十分に理解できたら本を提案します。',
        bullets: [
          '「営業成績を上げたい」など、ざっくり一言でOK',
          '質問は 1 問ずつ・選択肢をタップで回答（当てはまらなければ「その他」で自由入力）',
          '回答に応じて AI がさらに掘り下げて質問（最大 3 周。「深掘り」表示）',
          '質問によっては複数選べます（「決定（N件）」で次へ）',
          '「←」で前の質問に戻ってやり直しもできる',
          '提案する本は実在チェック済み（Amazon で買える本だけ）。選書理由・読む順番・読み方つき',
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
    lastUpdated: '2026-06-26',
    sections: [
      {
        heading: 'すべての機能を使うには',
        body:
          'Orime は iPhone（iOS）専用アプリです。本棚・振り返り・行動リスト・マイ読書脳・AI 選書などすべての機能を、ご契約いただいた方にお使いいただけます。\n\n' +
          'ログイン後にご契約のご案内が表示されます。プランは月額と年額の 2 つから選べます（年額がおすすめです）。',
      },
      {
        heading: 'お支払いについて',
        body:
          'お支払いは App Store（Apple ID）を通じて行います。アプリ内の購入シートから契約でき、カード情報はすべて Apple 側で管理されるため、アプリ内に保存されることはありません。\n\n' +
          '契約が完了すると自動でアプリに戻り、すべての機能が使えるようになります（反映に数秒かかることがあります）。\n\n' +
          '機種変更・再インストール時は、ご契約のご案内の下にある「購入を復元」で、元のご契約を引き継げます。',
      },
      {
        heading: '解約・プラン変更',
        body:
          '⚙️ 設定は「💳 プラン・お支払い」「📥 データ・アプリ」「⚠️ アカウント」の 3 グループに整理されています。解約・プラン変更は「💳 プラン・お支払い」内の「⚙️ サブスクリプションを管理（App Store）」から、または iPhone の「設定 →（自分の名前）→ サブスクリプション」から行えます。\n\n' +
          'いつでも解約でき、違約金はかかりません。解約後もこれまでのデータ（本・メモ・行動など）は保持されます。サブスクリプションは自動更新で、期間終了の 24 時間前までに解約しない限り更新されます。',
      },
      {
        heading: '価格について',
        body:
          '価格は App Store の購入画面に表示される金額が正式なものです。月額 ¥1,480（税込）と、年額 ¥12,800（税込・月あたり約 ¥1,066）からお選びいただけます。年額の方がお得です。',
      },
      {
        heading: '📊 利用状況の記録について',
        body:
          '⚙️ 設定の「📥 データ・アプリ」に「📊 利用状況の記録（製品改善のため）」のスイッチがあります。\n\n' +
          'どの機能がよく使われているかを、機能名や回数だけ（メモ本文・書名・検索語など個人を特定する内容は一切含めず）そっと記録し、Orime の改善に役立てます。外部のサービスには送らず、自前のサーバーにだけ保存します。\n\n' +
          'いつでもオフにできます（オフにしても機能はすべてそのまま使えます）。',
      },
      {
        heading: '🧹 データを初期化する',
        body:
          '⚙️ 設定の「アカウント」グループに「🧹 データを初期化」があります。\n\n' +
          '本・メモ・写真・行動・対話履歴・テーマ履歴など、あなたのデータをすべて消して、まっさらな状態に戻します。アカウント（ログイン）は残るので、そのまま新しく使い始められます。\n\n' +
          '⚠️ 取り消せません。実行前に確認ダイアログが出ます。残しておきたいデータは、先に「📥 データをダウンロード」で書き出しておくと安心です。',
      },
    ],
  },

  memoEditor: {
    title: '✏️ メモ入力',
    description: '気づきや学びを記録する画面。',
    lastUpdated: '2026-06-27',
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
        heading: '📷 写真から起こす（AI）',
        body:
          '本文の下の「📷 写真から起こす」を押して本のページを撮影すると、AI がその文章を読み取ってメモ本文に入れてくれます。打ち込む手間なしで引用を残せます。\n\n' +
          '線や蛍光ペンで強調した箇所があれば、そこを優先して書き起こします。明るく・まっすぐ撮ると精度が上がります。読み取った後は自由に直せます。',
      },
      {
        heading: '🎤 話して入力（音声）',
        body:
          'キーボードの🎤（マイク）ボタンを押すと、打ち込まずに話してメモできます。読書中に湧いた気づきを、本を置かずにそのまま声で残せます。\n\n' +
          'iPhone・Android の標準機能なので、速くて無料、音声が外部に送られることもありません。話した内容はそのまま下の「✨ 凝縮」で核心だけに削れます。',
      },
      {
        heading: '✨ 凝縮（AI）',
        body:
          'メモが長くなったら（または話して入力したら）「✨ 凝縮」を押すと、AI が本質だけを残して短く削ってくれます（要約ではなく凝縮）。クイックメモでも、カードメモの編集でも使えます。\n\n' +
          '本田直之『レバレッジ・リーディング』の「繰り返し読み返して行動に変える1枚」を作るための機能です。短いほど後で読み返しやすくなります。気に入らなければ「↩ 元に戻す」で戻せます。',
      },
      {
        heading: '✨ カードからまとめを生成（AI）',
        body:
          'カード式メモが 2 枚以上たまると、「まとめ」タブに「✨ カードからまとめを生成」が出ます。押すと、AI がそのカードたちを 1 枚のまとめメモに統合した下書きを作ります（手書きの手間なし）。\n\n' +
          '出てきた下書きは自由に直して「保存」。既にまとめがある場合は、置き換える前に確認します。カード（断片）＝素材、まとめ＝1 枚の統合、という関係です。',
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
        heading: '📖 引用を取り出す・コピー',
        body:
          'カード式メモの上にある「📖 引用のみ」を押すと、ページ番号を入れたメモ（抜き書き・引用）だけが表示されます。「あの一文どこだっけ」を探す時間を短くできます。\n\n' +
          '各メモの「⋮」や長押しメニューの「コピー」で本文をクリップボードにコピー。ページ番号があれば自動で「(p.42)」が付くので、そのまま引用に貼り付けられます。',
      },
      {
        heading: '🖼 メモを画像にして共有',
        body:
          'カード式メモの「⋮」メニュー、または長押しメニューから「🖼 画像で共有」を選ぶと、その一行を美しい 1 枚のカード画像にできます。\n\n' +
          '「📤 共有」で端末の共有シート（保存・各アプリへ送る等）が開き、対応していない端末では画像が自動で保存されます。「💾 保存」でそのまま保存も可能。外に出るのはその 1 枚だけで、自動で SNS に投稿することはありません。',
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
    lastUpdated: '2026-06-25',
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
        heading: '🗓 期限の色で優先度がわかる',
        body:
          '期限の表示は状態ごとに色が変わり、今やるべき行動が一目で分かります。\n\n' +
          '・🔴 期限切れ（赤・太字）— もう過ぎている行動\n' +
          '・🟠 今日まで（橙・太字）— 今日が期限の行動\n' +
          '・あと数日（アクセント色）— 3 日以内に期限が来る行動\n' +
          '・グレー — それより先の期限\n\n' +
          '上部の「⚠ 期限切れ / 今日まで / 今週期限」フィルタと合わせて、優先度の高いものから片づけられます。',
      },
      {
        heading: '✅ 完了 → 振り返りメモ',
        body:
          'カードの ✅ をタップすると、その場ですぐ完了になります（完了の瞬間に軽い手応え）。もう一度タップすれば未完了に戻せます。\n\n' +
          '「やってみてどうでしたか？」の振り返りは、カードの ✏️ 編集からいつでも書けます。保存した振り返りは完了後カードに「💭」アイコン付きで表示されます。\n\n' +
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
          '最初は「未完了」だけが表示されます（いま やることに集中できるよう、完了済みは脇に置いています）。タップで切り替えられます。\n\n' +
          '・未完了: まだ実行していない行動（既定の表示）\n' +
          '・全て: 全行動を表示\n' +
          '・完了: ✅ 済みの行動\n' +
          '・⚠ 期限切れ: 期限を過ぎた未完了行動（赤背景）\n' +
          '・今日まで: 期限が今日以前の未完了\n' +
          '・今週期限: 期限が今日〜7日以内の未完了行動\n\n' +
          'やることを全部こなして「未完了」が 0 件になると、「🎉 未完了の行動はありません」と表示されます。',
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
    lastUpdated: '2026-06-26',
    steps: [
      {
        title: 'まずは1冊、メモを残す',
        body: 'マイ読書脳は、あなた自身のメモを根拠に答えます。メモが 1 件もないうちは質問しても根拠がないので、まず本棚で 1 冊えらび、気になった一行を残すところから。',
        footer: 'メモが増えるほど、あなただけの AI に育っていきます 🌱',
      },
      {
        title: '💭 今週の問いが、向こうから届く',
        body: 'メモが貯まると、マイ読書脳を開いたときに「💭 今週の問い」が表示されます。あなたのメモから生まれた、立ち止まって考えたくなる問いを週に1つ、AI の方から投げかけます。',
        bullets: [
          'まだやれていない行動（先に決めた一歩）があると、AI が「あの〇〇、やれましたか？」と実名で問い直します',
          '「この問いに答える →」でそのまま質問に。受け身でなく、向こうから考えるきっかけが来ます',
          '今週はいい、と思ったら × で閉じればその週は出ません',
          '本田直之『レバレッジ・リーディング』の「読書は行動に変えてこそ」を後押しする仕掛けです',
        ],
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

  themeReport: {
    title: '📐 テーマまとめ',
    description: 'テーマの学びを「核心1行＋次の一歩」に凝縮し、繰り返し呼び戻して行動に変える1枚。',
    lastUpdated: '2026-06-27',
    steps: [
      {
        title: 'テーマを選ぶ',
        body: 'AI タブ →「📐 テーマまとめ」を開くと、あなたのメモから見つかったテーマ（例: 営業）がボタンで並びます。気になるテーマをタップ、または自分で入力して指定できます。',
        footer: 'メモに付けたタグや「@カテゴリ」がテーマの候補になります。',
      },
      {
        title: '凝縮された1枚ができる',
        body: 'そのテーマのメモを横断し、要約ではなく「凝縮」した1枚を作ります（本田直之『レバレッジ・リーディング』の思想）。',
        bullets: [
          '🧭 核心（暗記できる1行）/ 🔑 繰り返す原則3つ（出典付き）/ 🎯 次の一歩（明日の行動1つ）',
          'あなたのメモを根拠にするので、一般論ではなく「あなた専用」',
          '作成中は「中止」で途中で止められます',
        ],
      },
      {
        title: '🎯「行動できてる？」で実践を確認',
        body: 'そのテーマで「決めた行動 / 完了 / 放置中」を実データで表示します。メモは多いのに行動0件、という盲点をはっきり突きつけます。',
        bullets: [
          '数字は、本詳細などで登録したあなたの行動リストから集計しています',
          '「🔸 まだやれていない一歩」で、未完了の行動を実名で表示。やり残しを名指しで突き返します（🎯 行動タブで完了にすると消えます）',
          '「✅ この一歩を行動リストに入れる」で、AI が出した“次の一歩”を追加。追加先は「振り返り」タブ →「🎯 行動」（最も関連が深い本に紐づきます）',
          '追加すると、ボタンが「✅ 追加済み・🎯 行動リストで見る →」に変わり、タップでそのまま行動タブへ移動できます',
          '学び→実践の輪を、1 タップで閉じられます',
        ],
      },
      {
        title: '🔄 想起ループにセットする',
        body: '「🔄 想起ループにセット」を押すと、核心が 🔄 振り返り と 🔔 想起通知 に乗ります。忘れた頃にそっと戻ってきて、読んで終わりにしません。',
        bullets: [
          '同じテーマで作り直すと、核心は最新に置き換わります',
          '「📋 コピー」で持ち出し、「🕒 履歴」で後から見返せます',
          '前回作成時からのメモ・本の増加も「📈 前回からの変化」に表示',
        ],
      },
      {
        title: 'AI の利用について',
        body: 'テーマまとめの作成も AI を使うため、月ごとの利用上限の対象です（マイ読書脳・AI 選書と共通）。通常の使い方ならまず届かない余裕のある上限です。',
        footer: '上限に達した場合は翌月またご利用いただけます。',
      },
    ],
  },

  review: {
    title: '🔄 振り返り',
    description: '読書から生まれた知識を、行動と記憶に変える振り返りの場所',
    lastUpdated: '2026-06-22',
    steps: [
      {
        title: '🎲 ランダムで気づきが戻ってくる',
        body: '過去のメモが偶然に表示されます。忘れた頃に「あの時の気づき」がふいに戻ってくる、Orime の核となる体験です。',
        bullets: [
          '「◯ヶ月前のあなたのメモ」と、いつのものか一目で分かる',
          '「別のメモを見る」で次の一枚へ',
          'メモが貯まるほど、戻ってくる気づきが豊かになります',
        ],
      },
      {
        title: '🔄 ホームにも、ふいに戻ってくる',
        body: '本棚の上に、過去のメモが 1 枚そっと現れることがあります（メモが貯まってくると）。タップするとこの振り返りが開きます。',
        bullets: [
          '今日はいい、と思ったら右上の ✕ で閉じれば、その日はもう出ません',
          '毎日うるさく出すことはありません',
        ],
      },
      {
        title: '🔔 通知で、向こうから戻ってくる',
        body: '⚙️ 設定の「📥 データ・アプリ」内にある「🔔 想起の通知」をオンにすると、週1回ほど、過去のあなたのメモが通知でそっと戻ってきます。タップするとその振り返りを開けます。',
        bullets: [
          'デフォルトはオフ。あなたが選んだときだけ届きます',
          '低頻度（週1ほど）で、通知疲れしない静かなお届け',
          'iPhone / iPad は「ホーム画面に追加」したアプリから開くと使えます',
          'いつでも設定からオフにできます',
        ],
      },
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
