# 🔔 想起プッシュ通知（Web Push / PWA）— 技術調査 & 最小試作 実装計画

> 作成: 2026-06-21（CEO/エンジニア調査）。会社の真実は `company/board.md`。
> 目的: Orime の核「想起（過去のメモが向こうから戻ってくる）」を**自動化**する。競合（ブックノーション等）の #1 リテンション施策＝過去ハイライトの定期リマインドを、**Web Push（Service Worker）**で実現する。
> 制約: このリポは push/署名がブロック中（B2/B3）。**コード雛形は今書けるが、VAPID 鍵生成・Cron 登録・DB マイグレーション適用・本番デプロイは元帥の環境設定が必要**。本書は「いつでも着手できる設計」を確定する。
> 思想ガード: Orime は静か・控えめ・Apple Notes 級・反ゲーミフィケーション。通知は**低頻度（週1〜数回）・完全オプトイン・1タップで該当メモへ**。通知疲れを生むなら入れない方がマシ、を大前提とする。

---

## 0. 結論（先に）

- **技術的に実現可能**。Web Push（VAPID + Service Worker + `web-push` npm）で、ネイティブ化（Capacitor）を待たずに **PWA のまま** 配信できる。
- ただし **iOS は「ホーム画面に追加した PWA」かつ iOS 16.4+ のみ**。Safari タブ内では一切不可。これが最大の制約。
- 既存基盤との相性は良い: SW は既にあり（`public/sw.js`）、service_role 経由のサーバー書き込み流儀（`api/claude.js` / `api/revenuecat-webhook.js`）、RLS テーブルの雛形パターン（`supabase_ai_usage.sql`）、想起メモ選定ロジック（`Review.jsx` の `randomMemo` / `ai.js` の `gatherKnowledge`）がすべて再利用できる。
- **7月のネイティブ（Capacitor）ローンチとの関係**: ネイティブ版では Capacitor の Push（APNs/FCM）に切り替えるのが本筋。だが **Web Push は今すぐ・追加コストゼロで PWA ユーザーに効く**ため、MVP は Web Push で先行し、ネイティブ化時に配信トリガ（Cron→送信 API）はそのまま流用、購読・送信レイヤだけ差し替える二段構えが最適。

### プラットフォーム別 可否表

| プラットフォーム | Web Push 可否 | 条件・注意 |
|---|---|---|
| **iOS / iPadOS Safari（PWA）** | ⭕ 条件付き | **iOS 16.4+** かつ **ホーム画面に追加（A2HS）した standalone PWA から起動**した時のみ。Safari の通常タブ内は ❌。許可ダイアログは**ユーザージェスチャ（タップ）内**でしか出せない。`manifest` の `display: standalone` 必須（充足済）。 |
| **iOS Safari（タブ内ブラウズ）** | ❌ | ホーム画面追加していないと Push API 自体が無効。 |
| **Android Chrome / Edge / Firefox** | ⭕ | A2HS 不要。タブでもインストール済 PWA でも可。最も素直に動く。 |
| **Android（インストール済 PWA / TWA）** | ⭕ | 通常の Web Push。 |
| **デスクトップ Chrome / Edge / Firefox** | ⭕ | OS 通知センター連携。許可フローも素直。 |
| **デスクトップ Safari (macOS)** | ⭕ | macOS 13+ で Web Push 対応（VAPID）。 |
| **ネイティブ（Capacitor / 7月〜）** | ⭕（別経路） | APNs/FCM。Web Push ではなく Capacitor Push Notifications プラグイン。**本計画の配信トリガは流用、購読/送信層だけ差し替え。** |

> 重要: iOS の制約により、**「通知をオンにする前にホーム画面へ追加してください」という案内（A2HS 誘導）が UX 上必須**。これを省くと iOS ユーザーは「許可ボタンが反応しない」体験になる。

---

## 1. 現状の PWA 基盤（調査結果）

| 要素 | 現状 | Push 対応に向けた評価 |
|---|---|---|
| `public/sw.js` | `v52`。install で skipWaiting せず waiting 待機 → ユーザー合意で更新。`activate` で旧 cache 掃除 + `clients.claim()`。fetch は asset=SWR / doc・code=networkFirst、`/api/` と cross-origin は SW 介入なし。`message`（SKIP_WAITING / CLEAR_CACHES）あり。 | **`push` / `notificationclick` / `pushsubscriptionchange` ハンドラは未実装**。ここに追記が必要（既存ロジックは無改変で追加可能）。 |
| `public/manifest.json` | `display: standalone` / `start_url:"/"` / `scope:"/"` / icons(192,512,maskable) 揃い。 | **A2HS で standalone 起動できる前提が既に満たされている**（iOS Web Push の必須条件）。追加変更ほぼ不要。 |
| SW 登録 | `src/lib/swUpdate.js` の `initServiceWorker()` が `/sw.js` を登録、registration を `registrationRef` に保持。`index.html` は登録しない（コメントで明示）。 | **`registrationRef` から `registration.pushManager` にアクセスできる**。購読フックは swUpdate の registration を再利用するのが綺麗。getter を1つ生やすだけで済む。 |
| `index.html` | `apple-mobile-web-app-capable` 等メタ完備。SW 登録は React 側。 | 追加不要。 |
| `vercel.json` CSP | `connect-src` に self/Supabase/Anthropic/Google/openBD/Stripe/Sentry。`img-src`/`script-src` 等ホワイトリスト。**crons 設定なし。** | **Web Push の購読は `connect-src` に追加ドメイン不要**（subscribe はブラウザ↔プッシュサービス間で、CSP の管轄外。アプリ→自社 `/api/*` は self で既に許可）。**ただし Vercel Cron 定義（`crons`）が未設定**＝定期配信のトリガを追加する必要あり。`SW` の `Cache-Control: no-store` 設定済（Push ハンドラ追記後の即時反映に有利）。 |
| `api/` 構成 | `claude.js`（service_role で ai_usage 書込）/ `revenuecat-webhook.js` / `stripe-*.js`。**service_role クライアント生成 + Bearer トークン検証のパターンが確立済**。 | **送信 API・購読保存 API はこの流儀をコピーで作れる**。`getServiceSupabase()` / `getBearerToken()` をそのまま踏襲。 |
| 依存 | `@supabase/supabase-js` のみ（サーバー）。 | **`web-push` を devDeps ではなく deps に追加が必要**（VAPID 署名・送信に使う。元帥が `npm i web-push`）。 |

---

## 2. Web Push の技術要件（正確版）

### 2.1 VAPID（Voluntary Application Server Identification）
- 公開鍵/秘密鍵のペアを1組生成（`npx web-push generate-vapid-keys`）。
  - `VAPID_PUBLIC_KEY` … クライアントが `pushManager.subscribe({ applicationServerKey })` に渡す（`VITE_` 接頭辞で公開してよい）。
  - `VAPID_PRIVATE_KEY` … **サーバー専用**。送信 API でのみ使用。クライアント露出厳禁（service_role と同格の扱い）。
  - `VAPID_SUBJECT` … `mailto:` 連絡先（例 `mailto:f.abe@pntwhere.com`）。
- 鍵は**一度作ったら固定**。変えると既存購読が全失効する。

### 2.2 許可フロー（Notification permission）
1. ユーザーが設定で「想起の通知を受け取る」をタップ（**必ずユーザージェスチャ内**。iOS はこれが必須、Android/Desktop も推奨）。
2. iOS の場合のみ: standalone 起動でなければ「ホーム画面に追加してから開いてください」を先に案内（`navigator.standalone` / `display-mode: standalone` を判定）。
3. `Notification.requestPermission()` → `granted` なら次へ。`denied` は二度と自前ダイアログを出せない（OS 設定からの手動許可を案内）。
4. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })` で `PushSubscription` 取得。
5. 購読 JSON（`endpoint` / `keys.p256dh` / `keys.auth`）を `/api/push-subscribe` に POST（Bearer トークン付き）→ `push_subscriptions` テーブルに upsert。

### 2.3 SW 側ハンドラ（`public/sw.js` に追記）
- `self.addEventListener('push', ...)` … `event.data.json()` を読んで `self.registration.showNotification(title, { body, icon, badge, tag, data:{ url } })`。`userVisibleOnly:true` なので**必ず通知を出す**（出さないとブラウザがペナルティ＝購読失効リスク）。
- `self.addEventListener('notificationclick', ...)` … `notification.close()` → `clients.openWindow(url)` または既存ウィンドウに `focus()` + `postMessage`。`data.url` は「該当メモを開くディープリンク」（例 `/?recall=<memoId>` または `/?book=<bookId>`）。
- `self.addEventListener('pushsubscriptionchange', ...)` … プッシュサービスが endpoint をローテーションした時に発火。**再 subscribe → サーバーに新 endpoint を再登録**（旧行は失効処理）。実装しないと購読が静かに死ぬ。

### 2.4 iOS Safari の制約（要注意ポイント集）
- **iOS 16.4+ 限定**。それ未満は Push API が `undefined`（機能検出で graceful degrade）。
- **ホーム画面に追加した standalone PWA からの起動時のみ**購読可。Safari タブ内は不可。
- **許可ダイアログはユーザージェスチャ必須**（自動・onload では出ない）。
- **`badge`（アイコンの数字バッジ）は App Badging API 経由で別管理**。MVP では未使用でよい。
- **配信の信頼性は OS 任せ**（省電力・まとめ配信あり）。「確実に時刻ぴったり」は保証されない＝低頻度の想起用途とは相性が良い。
- A2HS していない iOS ユーザーには通知価値を語る前に**ホーム画面追加を促す**のが鉄則。

### 2.5 Android / デスクトップとの差
- A2HS 不要・タブでも可・許可率が iOS より高い・配信が即時で信頼性高い。
- 実装は同一コード（機能検出で分岐するのは iOS の standalone ガードと 16.4 未満の除外のみ）。

---

## 3. 配信側アーキテクチャ

```
[Vercel Cron] --(毎週 指定時刻)--> [/api/push-cron]
                                       |
                                       | 1. service_role で push_subscriptions を全件 or バッチ取得
                                       | 2. ユーザーごとに「今日戻すメモ」を選定（§3.3）
                                       | 3. web-push.sendNotification(subscription, payload, {VAPID})
                                       |    - 410/404 は失効 → push_subscriptions から DELETE
                                       v
[プッシュサービス(APNs/FCM/Mozilla)] --> [端末の sw.js 'push'] --> showNotification --> タップで該当メモへ
```

### 3.1 購読保存テーブル `push_subscriptions`（新規 SQL マイグレーション雛形）

`supabase_push_subscriptions.sql` として追加（`supabase_ai_usage.sql` と同じ RLS 流儀: 本人 SELECT のみ、書き込みは service_role）。

```sql
-- 🔔 Web Push 購読情報 + 通知設定。
-- RLS: 本人は自分の購読を SELECT/INSERT/UPDATE/DELETE 可（自分でオン/オフできる）。
--      送信は api/push-cron が service_role で全件読む（RLS バイパス）。
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text        NOT NULL,                 -- プッシュサービスの一意 URL
  p256dh       text        NOT NULL,                 -- subscription.keys.p256dh
  auth         text        NOT NULL,                 -- subscription.keys.auth
  -- 通知設定（思想ガード: 低頻度デフォルト）
  enabled      boolean     NOT NULL DEFAULT true,
  frequency    text        NOT NULL DEFAULT 'weekly', -- 'off' | 'weekly' | 'twice_weekly'
  preferred_hour smallint  NOT NULL DEFAULT 8,        -- 0-23, ユーザーのローカル目安
  tz_offset_min  smallint  NOT NULL DEFAULT 540,      -- 端末の getTimezoneOffset 反転(JST=+540)
  last_sent_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)                          -- 同一端末の重複登録防止 + upsert キー
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_enabled_idx ON public.push_subscriptions (enabled) WHERE enabled = true;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 本人は自分の行を全操作可（クライアントから直接 upsert / オフ設定できる）。
DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "push_subs_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_update_own" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
-- 送信側（api/push-cron）は service_role で全行読むため追加ポリシー不要。
```

> 設計判断: 購読 upsert を**クライアントが直接 Supabase に書く**（`/api/push-subscribe` を省ける）か、**API 経由**にするか。前者は RLS で本人限定が効くので安全かつコード少。ただし VAPID 公開鍵をクライアントに置く必要はどちらでも同じ。**MVP はクライアント直 upsert を推奨**（`useBookMemos` 等と同じ supabase クライアント直叩き流儀に揃う）。送信のみ API（service_role）。

### 3.2 送信 API `/api/push-cron.js`（雛形方針）
- `api/claude.js` / `api/revenuecat-webhook.js` の `getServiceSupabase()` を踏襲。
- **Cron 認証**: Vercel Cron は `Authorization: Bearer <CRON_SECRET>` を付けられる（または `x-vercel-cron` ヘッダ検証）。共有シークレット不一致は 401。外部からの叩き込み防止。
- ロジック: `push_subscriptions` を `enabled=true` で取得 → ユーザーごとにメモ選定 → `web-push` で送信 → `410 Gone`/`404` が返った endpoint は DELETE（失効処理）→ `last_sent_at` 更新。
- **冪等性/重複防止**: `last_sent_at` を見て「直近 N 日以内に送ったユーザーはスキップ」。Cron 多重発火でも二重送信しない。
- **コスト**: web-push 自体は無料（自社サーバー→プッシュサービス）。Claude を使わないので AI 原価ガード（≤45円/人）にも無関係。**この施策は原価ほぼゼロでリテンションを上げる**＝KGI 的に極めて費用対効果が高い。

### 3.3 「○ヶ月前のあなたのメモ」選定ロジック — 既存資産の再利用

- **`Review.jsx` の `randomMemo` 選定**: クライアント専用（React の `useMemo`）なのでサーバーでは直接呼べないが、**選定思想（`allNotes` を時系列マージ → ランダム1件 → `recallFraming()` で「N ヶ月前のあなたのメモ」コピー）はそのまま移植**する。`recallFraming` / `relativeJa` の文言ロジックは **`src/lib/recall.js` のような共有モジュールに切り出して**、Review とサーバー（push-cron）両方から使うのが理想（DRY）。
- **`ai.js` の `gatherKnowledge(userId)`**: これは **Supabase から book_memos + books 派生フィールドを集めて統一 memo shape にする純データ関数**。`supabase` クライアント（anon）依存なので**サーバーでは service_role クライアントを渡す形に一般化**すれば再利用できる。push-cron では「そのユーザーの全ノートを集める」部分にこれを流用し、`memoPriority` ではなく**「適度に古い（例: 30〜180日前）かつ未送信」を優先する選定**に差し替える（想起＝忘れた頃が肝なので、最新メモは外す）。
- **選定ポリシー（MVP）**: ①ユーザーのノートのうち作成 14 日以上前 ②可能なら 1〜6 ヶ月前を優先 ③直近で同じメモを送っていない ④メモが3件未満のユーザーは送らない（コールドスタート配慮・空通知防止）。
- **ディープリンク**: 通知 payload に `url: '/?recall=<memoId>'` を入れ、起動時に App.jsx が `recall` クエリを読んで Review タブ＋該当メモを開く（または該当本の詳細）。**1タップで該当メモへ**を満たす。

### 3.4 Vercel Cron（`vercel.json` に `crons` 追加）
```jsonc
// vercel.json に追記（雛形）。週1配信なら:
"crons": [
  { "path": "/api/push-cron", "schedule": "0 23 * * 1" }  // UTC 23:00 月曜 = JST 朝8時 火曜
]
```
- Vercel Cron は **UTC 固定・最小粒度は分**。個々のユーザーのローカル時刻に厳密配信したい場合は「1日数回 Cron を回し、各回で `preferred_hour` × `tz_offset_min` が一致するユーザーだけ送る」方式に拡張（MVP では全員 JST 朝固定で割り切る）。
- Hobby プランは Cron 本数/頻度に制限あり。**本番は Pro 前提**（既にデプロイ運用は Pro 想定）。

---

## 4. 思想適合 — 通知 UX 設計（控えめ・反通知疲れ）

- **完全オプトイン**: デフォルト OFF。設定でユーザーが明示的にオンにした時だけ。
- **低頻度デフォルト**: 「週1」を初期値に。最大でも「週2」。毎日は**出さない**（読書は低頻度行動・通知疲れは競合の弱点でありこちらの差別化点）。
- **頻度設定 UI（最小案）**: `AccountSettings.jsx`（`src/components/AccountSettings.jsx`、設定モーダル内）に1セクション追加:
  - 🔔 「想起の通知」トグル（オン/オフ）
  - オン時のみ: ラジオ「週1（おすすめ）/ 週2 / オフ」+ 時間帯ざっくり選択（朝/昼/夜の3択 → `preferred_hour` にマップ）。
  - iOS で standalone でない場合: トグルの代わりに「ホーム画面に追加すると通知を受け取れます」案内 + 追加手順。
  - 文言は静かに: 「忘れた頃に、過去のあなたの気づきがそっと戻ってきます」程度。煽らない・数値で追い立てない。
- **通知本文も控えめ**: タイトル「💭 N ヶ月前のあなたのメモ」、本文はメモ冒頭の1〜2行（`recallFraming` の世界観そのまま）。バッジ数や「○日連続」等のゲーミフィケーション要素は**入れない**。
- **HelpModal 同期（CLAUDE.md ルール1）**: 機能追加時は `src/lib/helpContent.js` に通知設定の説明を追記し `lastUpdated` 更新（実装フェーズで対応）。

---

## 5. 最小試作（MVP）段階的実装計画

> 各ステップに「今コードで書ける / 元帥の環境設定が要る」を明記。コードは env ブロック中でも全部書ける。

### Phase P0 — クライアント購読 + SW ハンドラ（コードのみ・今書ける）
1. `public/sw.js` に `push` / `notificationclick` / `pushsubscriptionchange` ハンドラを追記（`SW_VERSION` を `v53` に bump）。既存 fetch/cache ロジックは無改変。
2. `src/lib/push.js`（新規）: 機能検出（`'PushManager' in window` / iOS standalone / 16.4+）、`urlBase64ToUint8Array`、`requestPermissionAndSubscribe()`、`unsubscribe()`、Supabase への購読 upsert（RLS で本人限定）。registration は `swUpdate.js` の `registrationRef` を再利用（getter を1つ追加）。
3. `src/lib/recall.js`（新規・任意リファクタ）: `Review.jsx` の `recallFraming`/`relativeJa`/`randomMemo` 選定の純ロジックを切り出し、Review とサーバーで共有。
4. `AccountSettings.jsx` に「🔔 想起の通知」セクション追加（トグル + 頻度 + iOS A2HS 案内）。
5. `App.jsx` に `?recall=<memoId>` ディープリンク受信 → Review＋該当メモを開く処理。
6. `helpContent.js` 同期 + `npm run build` 確認（push 解放後）。

### Phase P1 — 配信サーバー（コードのみ・今書ける）
7. `supabase_push_subscriptions.sql`（§3.1）を追加。CLAUDE.md の SQL 表にも1行追記。
8. `api/push-cron.js`（新規）: service_role 取得 → 購読取得 → メモ選定（`gatherKnowledge` をサーバー版に一般化して流用）→ `web-push` 送信 → 410/404 失効処理 → `last_sent_at` 更新 → Cron シークレット検証。
9. `vercel.json` に `crons` 追記（§3.4）。`package.json` に `web-push` を deps 追加（コードに import を書くだけ。インストールは元帥）。

### Phase P2 — 元帥の環境設定（ローンチ前）
10. `npx web-push generate-vapid-keys` で VAPID 鍵生成。
11. Vercel/Supabase に env 設定: `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `CRON_SECRET`。`SUPABASE_SERVICE_ROLE_KEY` は既存流用。
12. Supabase SQL Editor で `supabase_push_subscriptions.sql` 実行。
13. `npm i web-push`。
14. Vercel に push（B2/B3 解放後）→ Cron 自動登録。
15. 実機検証: iOS（A2HS した PWA）/ Android / Desktop で許可→購読→Cron 手動トリガ→通知受信→タップでメモ表示、を1巡。

### Phase P3 — ネイティブ移行時（7月以降・任意）
16. Capacitor 化後は Capacitor Push（APNs/FCM）に購読層を差し替え。**`api/push-cron` の選定・配信トリガはそのまま流用**（送信先 token と送信ライブラリだけ変わる）。Web Push は PWA ユーザー向けに併存も可。

---

## 6. リスク・落とし穴

| リスク | 内容 | 緩和策 |
|---|---|---|
| **iOS の A2HS 壁** | ホーム画面追加していない iOS ユーザーは購読不可。許可率が下がる。 | 設定 UI で「追加すると通知が使える」を丁寧に案内。Android/Desktop は素直に効くので、まずそこで価値実証。 |
| **許可率の低さ** | 無闇に許可を求めると拒否され二度と頼めない（`denied` は永続）。 | **オンボーディングで即出さない**。ユーザーがメモを数件貯めて価値を感じた後、設定から能動的にオンにする導線に限定。プレ許可（ソフトプロンプト）で価値説明→OK の時だけ OS ダイアログ。 |
| **通知疲れ** | 高頻度は競合の弱点＝Orime の思想に反する。 | デフォルト週1・最大週2・毎日無し。本文も静か。簡単にオフ。 |
| **購読の失効** | endpoint ローテーション/アンインストールで死ぬ。送り続けると無駄。 | `pushsubscriptionchange` で再登録。送信時 410/404 を即 DELETE。`last_sent_at` で健全性監視。 |
| **空通知/コールドスタート** | メモ 0〜2 件のユーザーに送ると無価値。 | 選定で「3件未満は送らない・14日以上前のメモのみ」。 |
| **Cron の時刻精度** | Vercel Cron は UTC・分粒度、OS 都合で配信は前後する。 | 想起は「忘れた頃」が肝なので分単位精度は不要。MVP は JST 朝固定で割り切り。 |
| **多重送信** | Cron 再実行/重複購読で複数通知。 | `last_sent_at` ガード + `UNIQUE(user_id, endpoint)`。 |
| **プライバシー** | 通知本文にメモ抜粋が出る＝ロック画面に読書内容が見える。 | 設定でオンにした本人の端末のみ。PostHog 等にはメモ本文を送らない既存方針を踏襲（通知 payload はプッシュサービス経由だが E2E 的に endpoint 限定）。気にする層向けに「本文を出さず件名だけ」オプションを将来用意。 |
| **ネイティブとの二重実装** | 7月 Capacitor 化で Web Push が無駄になる懸念。 | 配信トリガ（Cron + 選定）は共通資産。購読/送信層だけ差し替えなので無駄にならない。Web Push は PWA 利用者に併存可。 |

---

## 7. 「今コードで書ける部分」 vs 「元帥の環境設定が要る部分」

| 今コードで書ける（env ブロック中でも可） | 元帥の環境設定が必要 |
|---|---|
| `public/sw.js` の push/notificationclick/pushsubscriptionchange ハンドラ | VAPID 鍵生成（`web-push generate-vapid-keys`） |
| `src/lib/push.js`（購読/解除/機能検出） | Vercel/Supabase env（`VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `CRON_SECRET`） |
| `src/lib/recall.js`（選定ロジック共有化） | `supabase_push_subscriptions.sql` の Supabase 実行 |
| `AccountSettings.jsx` の通知設定 UI | `npm i web-push`（deps インストール） |
| `App.jsx` の `?recall=` ディープリンク | Vercel への push/deploy（B2/B3 解放）→ Cron 自動登録 |
| `supabase_push_subscriptions.sql`（ファイル作成） | 実機での許可→受信検証（特に iOS A2HS） |
| `api/push-cron.js`（送信ロジック・import web-push） | |
| `vercel.json` の `crons` 追記 | |
| `helpContent.js` 同期 | |

---

## 8. 推奨ネクストアクション

1. **本計画を CEO 承認 → Phase P0/P1 のコード雛形を実装**（env 非依存・追加的・低リスク。`company/product-improvement-backlog.md` の運用ルールに合致）。
2. コードはローカルコミットで積む（B2/B3 解放まで）。`npm run build` が通ることを確認（push ハンドラは SW 内なのでビルドに影響なし）。
3. 元帥に **Phase P2 の環境設定（VAPID 鍵・env・SQL・`npm i`・Cron）** を1枚のチェックリストで依頼。
4. 解放後、Android/Desktop で先行検証 → iOS（A2HS）で確認 → 週1配信を小さく開始 → PostHog（導入後）で「通知経由の想起再訪」を計測し、頻度を実データで調整。

> この施策は **AI 原価ゼロ・追加月額コストほぼゼロで、NSM（週次想起 WAU）を直接押し上げる**。`company/board.md` の北極星指標と完全に一致し、`kgi-roadmap.md` の「課金後オンボーディング完走＋想起リマインド通知＝初月チャーン最重要施策」を技術的に実現する。
