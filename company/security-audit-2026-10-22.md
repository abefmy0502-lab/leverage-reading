# セキュリティ監査と直し（2026-10-22）

> オーナー「システムと LP のセキュリティレベルを最大化して」。API の中継 12 本・配信のヘッダーと CSP・LP・認証・端末の控え・依存パッケージ・秘密情報を監査し、同日に直した。前回は `security-audit-2026-06.md`。

## 0. 結論

- **「高」（直ちに悪用できる穴）は 0 件。** 認証・Webhook の署名・SSRF の許可リスト・XSS・オープンリダイレクト・秘密情報の混入は、いずれも対策済みを確かめた。
- **「中」8 件・「低」の主なものを同日に直した**（下の表）。残りは「受け入れ」として理由を書いた。
- 依存パッケージの脆弱性 6 件（開発・ビルド用と iOS の殻）は `npm audit fix` で 0 件に（本番に入るパッケージは元から 0 件）。
- オーナーがやること 3 つ（§3）。

## 1. 直したこと

| 重さ | 場所 | 何が | 直し |
|---|---|---|---|
| 中 | `api/claude.js` `stripe-checkout.js` `stripe-portal.js` `launch-health.js` | 利用者ごとの回数制限が認証（`auth.getUser`）の**後**にあり、でたらめな Bearer の連打で Supabase Auth の枠を食いつぶせた | 認証の前に IP ごとの固定窓（`api/_ipRate.js`・1 分に 120 / 30 / 30 / 20 回）。IP は数えるだけで保存しない |
| 中 | `api/_providers.js` | Anthropic への呼び出しにだけタイムアウトが無く、上流が黙ると予約した原価が戻らないまま関数が居座った | OpenAI / Gemini と同じ `firstOutputMs`（既定 20 秒）で打ち切り。ヘッダーが来たら時計を止める |
| 中 | `api/cover-image.js` | 回数制限の表が肥大すると全員ぶんを消していた | 期限切れのキーだけ掃く |
| 中 | `vercel.json` | `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` / `X-Permitted-Cross-Domain-Policies` が無く、`Permissions-Policy` が 3 項目だけ | COOP `same-origin`・CORP `same-origin`（OG 画像・ロゴ・アイコン・LP の画像だけ `cross-origin`）・`X-Permitted-Cross-Domain-Policies: none`・`X-DNS-Prefetch-Control: off`・Permissions-Policy に payment / usb / bluetooth / serial / midi / センサー / interest-cohort / browsing-topics を追加 |
| 中 | `src/lib/sentry.js` | パンくず（fetch の URL＝Supabase REST の `?book_id=eq.<uuid>`）とトランザクション名を洗っていなかった | `scrubText` を `beforeBreadcrumb` / `beforeSendTransaction` にも適用し、`=eq.<id>` も落とす（テスト） |
| 中 | `src/hooks/useAuth.js` | サインアウトで消す検索の控えのキー名が古く、何も消えていなかった | 今のキー（`bookSearchCache:v2`）と、本人 id つきの控え（読書の時間・入れた理由）も消す |
| 低 | `api/_cors.js` | 本番でも `http(s)://localhost` を許可オリジンにしていた | 本番は `capacitor://` / `ionic://` だけ |
| 低 | `api/claude.js` ほか | 利用者ごとの JSON 応答に `Cache-Control: no-store` が無かった | 認証の直後に `no-store`・ストリームも `no-store` |
| 低 | `api/stripe-webhook.js` | 署名を確かめる前に本文を無制限に積んでいた | 1MB で切る |
| 低 | `api/revenuecat-webhook.js` `push-cron.js` | 500 の応答に環境の構成名を返していた・`app_user_id` を丸ごとログに | `server_not_configured`・先頭 8 文字だけ |
| 低 | `api/push-cron.js` | Web Push の送信にタイムアウトが無く、1 件が固まるとバッチ全体が止まった | 10 秒 |
| 低 | `src/components/ErrorBoundary.jsx` | 本番でもエラー文の先頭 160 字を画面に出していた（Supabase の文や URL が混ざりうる） | 部品の読み込み失敗のときだけ出す |
| 低 | `src/lib/limits.js` | 拡張子 `.png` で MIME が svg のファイルが端末内の処理を通った | MIME があるときは MIME で決める |
| 低 | `src/App.jsx` | iPhone の通知の `url` を検証せずに `replaceState` していた | `sw.js` の `safeRecallPath` と同じ決まり（同一オリジンの相対パスだけ） |
| 低 | 運営ダッシュボード「公開の準備」 | — | `LP_IP_SALT` の行を足した（サーバーの鍵の使い回しをやめる） |
| 依存 | `package-lock.json` | `@capacitor/ios`（critical）・`sharp`・`vite`・`source-map-js`・`@vitest/mocker` | `npm audit fix` → 0 件。テスト 2,189 本・ビルド OK |

## 2. 受け入れたもの（理由つき）

| 場所 | 内容 | 理由 |
|---|---|---|
| `vercel.json` の CSP | `connect-src` / `img-src` の `https://*.supabase.co` がワイルドカード | 自分のプロジェクトのホストは env にしか無く、`vercel.json` は値を差し込めない。**公開前に `*.supabase.co` を自分のホスト（`https://xxxx.supabase.co`）に書き換える**（§3）。iOS の meta CSP は `vercel.json` から作るので自動で揃う |
| `style-src 'unsafe-inline'` | React の `style={}` に必要 | 全廃には全画面の書き直しが要る。`script-src` は `'self'` だけで `unsafe-inline` / `unsafe-eval` 無し |
| `api/cover.js?health=1` | 未認証で設定の真偽を返す | 鍵の中身は返さず、IP の回数制限と 5 分キャッシュの内側。表紙が取れないときの切り分けに要る |
| 追加トークンのサンドボックス購入を記録 | TestFlight のテスターが無料で AI を使える | App 審査で「買ったものが届かない」却下を避けるためのオーナー裁定。**審査が終わったら `RC_SANDBOX_TOKENS=false`** |
| 思い出しの通知の二重送信の可能性 | Cron が重なったときだけ | Vercel の Cron は重ならない。期限の通知と同じ「先に claim」にするのは次の機会 |
| HSTS の `preload` / CSP の `report-uri` | 任意 | preload は hstspreload.org への登録とセット。report-uri は Sentry の CSP 受け口を作ってから |

## 3. オーナーがやること

1. Vercel の env に `LP_IP_SALT`（長いランダムな文字列・サーバーだけ）を入れる → 「公開の準備」の行が ✓ に
2. 公開前に `vercel.json` の CSP の `https://*.supabase.co https://*.supabase.in`（connect-src と img-src の 2 か所）を、自分の Supabase のホストだけに書き換える（Claude に「CSP の Supabase を https://xxxx.supabase.co に絞って」と頼めばよい）
3. App 審査が終わったら `RC_SANDBOX_TOKENS=false`

## 4. 問題なしと確かめた点（再監査のときの出発点）

- Webhook: Stripe は raw body ＋ `constructEvent`、RevenueCat / Cron / keepalive は `timingSafeEqual` で fail-closed、event.id の先取りで冪等
- SSRF: `cover-image` は https のみ・許可リスト・転送先も毎回確かめる・2MB・5 秒。通知の endpoint は既知のゲートウェイだけ
- AI の中継: 送るものを許可リストで組み直し（tools・URL 画像は落ちる）・モデルは許可リストで矯正・本文 1.5MB・利用者 id は `auth.getUser` の結果だけ
- フロント: `dangerouslySetInnerHTML` 0 件・外部リンク 23 か所すべて `noopener noreferrer`・OAuth の戻り先は `origin` 固定・サービスワーカーは `/api/*` と別オリジンに触らない・LP の登録は honeypot ＋ IP ハッシュの 1 日 5 回
- 秘密: 追跡対象に鍵なし・sourcemap なし・`.env` は無視
