# LP の計測 — どの導線がダウンロードにつながるかを数字で決める

LP（https://orime.vercel.app の紹介ページ）には、3 種類の計測が入っています。

| 何を | どこで見る | 必要な準備（1 回だけ） |
|---|---|---|
| ① 閲覧数・参照元・端末・国 | Vercel → orime → **Analytics** | Vercel の Analytics タブで「Enable」を押す（Hobby は無料枠内） |
| ② ボタンが押された場所・相談の流れ（4 枚）・節ごとの到達・読み進めた深さ・ヒーローの表示（イラスト ↔ 写真）・創業メンバー価格 | Supabase → SQL Editor（下の集計例） | `supabase_lp_events.sql` を SQL Editor で 1 回実行 |
| ③ **実際のダウンロード数**（どのボタンから入手されたか） | App Store Connect → App 分析 → **キャンペーン** | provider token を Vercel の `VITE_APP_STORE_PT` に入れる（下記） |
| ④ **公開のお知らせの登録**（公開前の成果・2026-10-05） | Supabase → SQL Editor（`lp_waitlist`） | `supabase_lp_waitlist.sql` を 1 回実行 |

> ⚠️ `supabase_lp_events.sql` は 2026-10-05 に**流し直す**こと。最初の版のイベントの一覧（CHECK）に `flow_*`・`section_view`・`offer_badge` が無く、2026-10-02 からのこれらの記録は保存されていなかった。流し直すと、下の新しいイベントも入る。

どれも個人を特定しません（Cookie なし・IP や入力文は保存しない。プライバシーポリシー第 9 条③）。

## ③ App Store のキャンペーン（ダウンロード数そのもの）

1. App Store Connect → 「App 分析」→「キャンペーン」→「キャンペーンリンクを生成」を開く。
2. 出てくるリンクの中の `pt=数字` の数字が provider token。
3. Vercel の Environment Variables に `VITE_APP_STORE_PT` = その数字（Production）を入れて、公開し直す。

これで LP のボタンは押した場所ごとに `ct=lp_hero_illust`（ヒーロー・イラストを見た人）のようなキャンペーン名付きで App Store に飛びます。
App Store Connect では、キャンペーン名ごとに「ページ閲覧数・App 入手数」が見られます（反映は翌日以降）。

キャンペーン名の読み方: `lp_<押した場所>_<ヒーローの表示>`

- 押した場所: `header`（上の帯）/ `hero`（最初の画面）/ `sticky`（スマホの下に固定）/ `start`（「メモがゼロでも、初日から」の節）/ `pricing`（料金）/ `final`（最後）/ `qr`（PC の QR コード）/ `hero_badge`・`final_badge`（公式バッジ・`VITE_APP_STORE_BADGE` があるときだけ）。`offer`（創業メンバー価格の節）は 2026-10-05 に料金の中の帯になり、ボタンは無くなった。`demo` は 2026-10-02 に無くなった
- ヒーローの表示: `illust`（オーナーの本番のイラスト）↔ `photo`（1 冊に相談した答えの実際の画面）を、スマホも PC も半々に振り分けて端末に覚える（`orime-lp-hero-v2`・2026-10-11 に本番の絵が届いたので既定で A/B）。`VITE_LP_ILLUST=off` で全員 `photo`（そのとき `?hero=illust` は開発中・お試しだけ）・`VITE_LP_HERO_AB=off` で全員 `illust`。`?hero=illust` / `?hero=photo` で固定して確認できる。`3d` は A/B から外し `?hero=3d` のときだけ。記録の variant は実際に見せた形。2026-10-05〜10-10 の記録は `3d` / `photo`（広い画面だけ半々）。`illust` を記録するには `supabase_lp_events.sql` と `supabase_lp_waitlist.sql` を**流し直す**（variant の CHECK に `illust` を足した）

### ③-2 入口ごとのキャンペーン名（ct）の一覧（2026-10-08・マーケ戦略 §6-4）

LP だけでなく、**共有の画像・note・発信者・Web のアプリ**からの入手も、同じ「App 分析 → キャンペーン」で入口ごとに数える。
決まりと作り方は `src/lib/storeCampaign.js`（名前は英小文字・数字・_ だけ・40 字まで。`VITE_APP_STORE_PT` が無いと ct は付けない）。

| 入口 | キャンペーン名 | どこで付く | 備考 |
|---|---|---|---|
| LP のボタン | `lp_<場所>_<illust\|photo>`（`?hero=3d` のときは `3d`） | 自動（`lpTrack.js` の `storeUrlFor`） | 上の一覧 |
| 写真で共有（記録） | `share_record` / 今月は `share_month_record`・今年（12 月）は `share_year_record` | 自動（共有シートに添える文の URL・`ShareSheet.jsx`） | 画像そのものには URL を入れない（ロゴだけ）。App Store の URL が無い間は紹介ページの URL のまま |
| 写真で共有（数字） | `share_stats` / `share_month_stats` / `share_year_stats` | 同上 | |
| 写真で共有（一文） | `share_quote` / `share_month_quote` / `share_year_quote` | 同上 | |
| Web のアプリの有料プランの画面 | `web_paywall` | 自動（`Paywall.jsx`） | Web は紹介と入手の案内だけ |
| Web のアプリの「アプリでご利用ください」 | `web_gate` | 自動（`App.jsx`） | |
| note の記事 | `note_<記事>`（例 `note_launch`・`note_why_orime`） | 手で作る（下） | 記事ごとに 1 つ |
| 発信者・読書会 | `partner_<名前>`（例 `partner_nekomachi`） | 手で作る（下） | オファーコードと一緒に渡す。投稿には「PR」を最初に（戦略 §5-5） |

**リンクの作り方**（note・発信者）: App Store の URL と provider token を入れて、スクリプトで作る。

```sh
VITE_APP_STORE_URL=https://apps.apple.com/jp/app/orime/id… VITE_APP_STORE_PT=123456 \
  node scripts/store-link.mjs note launch
# → キャンペーン名: note_launch
#   https://apps.apple.com/jp/app/orime/id…?pt=123456&ct=note_launch&mt=8
VITE_APP_STORE_URL=… VITE_APP_STORE_PT=… node scripts/store-link.mjs partner nekomachi
```

- App Store の URL が決まる前（予約注文の前）に配るリンクは、紹介ページ `https://orime.vercel.app/?utm_source=note&utm_campaign=<記事>` の形にする（LP の記録 `lp_events` の `utm_*` で数える）。
- 名前は日本語にしない（英小文字・数字・_ に直す・日本語だけの名前は種類だけ＝`note` になる）。
- 毎週の見方: App Store Connect →「App 分析」→「キャンペーン」→ キャンペーン名ごとの「App 入手数」。§7 の ③（週のインストール・入口別）。

## ④ 公開のお知らせ（公開前の形＝`VITE_LP_PRELAUNCH=on` のときだけ）

**2026-10-11 から、LP の既定は公開済みの形**（オーナー「ローンチしている前提の内容にして」）。どのビルドでも「無料プランで始める」（ヒーロー・0 日目・料金・最後・下の固定の帯・PC のヘッダーと QR）を出す。行き先は `VITE_APP_STORE_URL` があればアプリのページ（`VITE_APP_STORE_PT` があれば `ct=lp_<場所>_<illust|photo>` 付き）、**無ければ日本の App Store での「Orime」の検索**（`https://apps.apple.com/jp/search?term=Orime`・`src/pages/lpCopy.js` の `APP_STORE_SEARCH_URL`＝この間はボタンごとの入手数は数えられないので、公開したら URL を入れる）。`lp_view` の props は `live`（URL があるか）と `pre`（公開前の形か）。

公開前の形に戻すときだけ `VITE_LP_PRELAUNCH=on` を入れる。そのときは押せないボタンを出さずに「公開の日にメールで知らせる」（メール 1 欄＋送る）を出す（ヒーロー・初日から・料金・最後の 4 か所。1 か所で送ると全部が「公開の日にお知らせします。」になる）・公開予定の行（`VITE_LAUNCH_LABEL`）と FAQ「いつから使えますか？」も出る・下の固定の帯とヘッダーのボタンは出さない。開発中は `?prelaunch=1` で見られる。
保存は `api/lp-waitlist.js` → `lp_waitlist`（同じメールは 1 行・IP は保存しない）。同じ IP からは 1 分 5 回（インスタンスの中）と 1 日 5 回（DB の `lp_waitlist_rate`＝IP の代わりに日付つきのハッシュだけ・2026-10-11）まで。Do Not Track の端末からも送れる（本人がボタンを押して送るもので、閲覧の記録ではない）。

- 使い道は**公開のお知らせだけ**。公開から 3 か月以内に全部消す（プライバシーポリシーと同じ約束・欄の下にも書いてある）
- **送るメール（特定電子メール法）**: 送るのは公開の日の 1 通だけ。本文に**送信者の名前（Orime・運営 阿部文哉）と連絡先（問い合わせのメールアドレス）**、「LP で公開のお知らせを希望された方に送っています」を必ず書く。送ったら `update lp_waitlist set notified_at = now() where notified_at is null;`
- **送る前の確認（2026-10-11 リリース前点検）**: □ 送るのは公開の日の **1 通だけ**（2 通目・宣伝は送らない） □ 本文に**送信者の名前**（Orime・運営 阿部文哉） □ **連絡先**（問い合わせのメールアドレス） □ **配信停止の方法**（「今後の連絡が不要な方は、このメールに返信してください。登録を消します」など・頼まれたら `delete from lp_waitlist where email = lower('…');`） □ 「LP で公開のお知らせを希望された方に送っています」 □ 宛先は BCC か 1 通ずつ（ほかの人のアドレスを見せない）
- 予約注文を開いたら、予約のページの URL を `VITE_APP_STORE_URL` に入れて公開し直す（入口が「無料プランで始める」に変わる）

```sql
-- 登録の数（流入元・ヒーローの表示ごと）
select coalesce(utm_source, '(direct)') as source, variant, count(*) from lp_waitlist group by 1, 2 order by 3 desc;

-- 訪問 → 登録の割合（記録は Do Not Track の人を数えないので、割合は目安）
select count(distinct session_id) filter (where event = 'lp_view') as visits,
       count(distinct session_id) filter (where event = 'waitlist_submit' and (props->>'ok')::boolean) as joined,
       count(*) filter (where event = 'waitlist_submit' and not (props->>'ok')::boolean) as failed
from lp_events where created_at > now() - interval '14 days';

-- どこの入口から登録したか（props.loc: hero / start / pricing / final）
select props->>'loc' as loc, count(*) from lp_events
where event = 'waitlist_submit' and (props->>'ok')::boolean group by 1 order by 2 desc;
```

## ② 集計例（Supabase SQL Editor）

```sql
-- 直近 14 日: ヒーローの表示ごとに、訪問 → ボタンを押した割合
with v as (
  select session_id, variant from lp_events
  where event = 'lp_view' and created_at > now() - interval '14 days'
),
c as (
  select distinct session_id from lp_events
  where event = 'cta_click' and created_at > now() - interval '14 days'
)
select v.variant,
       count(*) as visits,
       count(c.session_id) as clicked,
       round(100.0 * count(c.session_id) / nullif(count(*), 0), 1) as click_rate_pct
from v left join c using (session_id)
group by v.variant order by v.variant;

-- 押された場所の内訳
select props->>'loc' as loc, count(*) from lp_events
where event = 'cta_click' and created_at > now() - interval '14 days'
group by 1 order by 2 desc;

-- 対話の流れ（4 枚・LpFlow.jsx・2026-10-11 から 一行を残す → 本に相談する → 本の語り口で聞き返す → 本とページ）:
--   見た人の割合と、手順を押した／もう一度見た人のボタン押下率
--   flow_view（画面に入った・1 回。props.still=true は動きを減らす設定で自動で進まなかった人）
--   flow_step（手順を押した・props.i=0..3）／ flow_replay（もう一度見る）
with v as (select distinct session_id from lp_events where event = 'lp_view' and created_at > now() - interval '14 days'),
f as (select distinct session_id from lp_events where event = 'flow_view'),
t as (select distinct session_id from lp_events where event in ('flow_step', 'flow_replay')),
c as (select distinct session_id from lp_events where event = 'cta_click')
select count(*) as visits,
       count(f.session_id) as saw_flow,
       count(t.session_id) as touched_flow,
       round(100.0 * count(*) filter (where t.session_id is not null and c.session_id is not null)
             / nullif(count(t.session_id), 0), 1) as click_rate_if_touched_pct,
       round(100.0 * count(*) filter (where t.session_id is null and c.session_id is not null)
             / nullif(count(*) - count(t.session_id), 0), 1) as click_rate_if_not_touched_pct
from v left join f using (session_id) left join t using (session_id) left join c using (session_id);

-- 節ごとの到達（section_view・節が 4 割見えたら 1 回）
--   2026-10-11 から: flow（受け身から対話へ）/ pillars（続けられて、成果が見える）/ action / focus / share / fields（柱 ②〜⑤ の 1 つずつ）
--     / start / offer（料金の中の帯・期間中）/ pricing / faq / final
--   （2026-10-05〜10-10 は flow / vs-chatgpt / action / grow / start / share / privacy …・2026-10-02〜10-04 は compare＝比較表。いまは無い）
select props->>'s' as section, count(distinct session_id) from lp_events
where event = 'section_view' and created_at > now() - interval '14 days'
group by 1 order by 2 desc;

-- 創業メンバー価格（期間中）: 出していた訪問（lp_view の props.offer=true）・印を押した・節から App Store へ
select count(distinct session_id) filter (where event = 'lp_view' and (props->>'offer')::boolean) as visits_with_offer,
       count(distinct session_id) filter (where event = 'offer_badge') as badge_clicked,
       count(*) filter (where event = 'cta_click' and props->>'loc' = 'offer') as offer_cta_clicks
from lp_events where created_at > now() - interval '30 days';

-- （2026-10-02 まで）旧「試しに、相談してみる」は demo_pick / demo_ask / demo_add。過去の行を読むときだけ。

-- どこまで読まれたか
select props->>'pct' as depth, count(distinct session_id) from lp_events
where event = 'scroll_depth' and created_at > now() - interval '14 days'
group by 1 order by 1::int;

-- 開かれた FAQ（申し込みの手前で気になっていること）。2026-10-05 から props.q に問いの頭 40 字（並びが変わっても読める）
select coalesce(props->>'q', props->>'i') as faq, count(*) from lp_events where event = 'faq_open' group by 1 order by 2 desc;

-- ヒーローの「15 秒で、対話の流れを見る」（2026-10-10 までは「相談の流れを見る」）・ログイン（2026-10-11 に LP から外した＝以後は記録されない）・フッターのリンク（props.to: terms / privacy / sct / mail）
select event, props->>'to' as to, count(*) from lp_events
where event in ('hero_secondary', 'login_click', 'footer_link') and created_at > now() - interval '14 days'
group by 1, 2 order by 3 desc;

-- 3D が出せなかった端末の割合
select (props->>'ok')::boolean as ok, count(*) from lp_events where event = 'hero_3d' group by 1;

-- 流入元（utm / 参照元）ごとの訪問とボタン押下
select coalesce(utm_source, ref_host, '(direct)') as source,
       count(distinct session_id) filter (where event = 'lp_view') as visits,
       count(distinct session_id) filter (where event = 'cta_click') as clicked
from lp_events where created_at > now() - interval '30 days'
group by 1 order by 2 desc;
```

## 判断の目安

- イラストと写真は、**各 300 訪問**くらい集まるまでは結論を出さない（それ未満は偶然の差が大きい）。最終判断は ③ の App 入手数で（公開前は ④ の登録数で）。スマホと PC は分けても見る（`device`）。

### ヒーローのイラスト（2026-10-11 にオーナーの本番の絵を入れた）
- 置き場所: `public/lp/hero-illust-light-<390|780|1560>.webp`（横長 4:3・暗い画面では角丸の絵のカード＝`--separator` の細い線・少し暗く。`hero-illust-dark-<390|780|1560>.webp` を置けば暗い画面ではそちらを出す）。差し替えは同じ名前で 3 つ置き直して公開し直す（3 つそろっていないビルドは予備の SVG＝`src/pages/LpIllust.jsx`）。
- 書き出し: 元の PNG から sharp で webp（品質 90 前後・1560 が 100〜200KB）・横幅 390 / 780 / 1560 px・4:3（1560×1170）。例: `node -e "const s=require('sharp');[[390,90],[780,90],[1560,92]].forEach(([w,q])=>s('元.png').resize(w,w*3/4).webp({quality:q}).toFile('public/lp/hero-illust-light-'+w+'.webp'))"`
- 読み上げの文は `ILLUST_LABEL`（「スマホで本に相談すると、本棚の本が答えてくれる様子のイラスト」）。絵の意味が変わったら、その文も直す。

### 節のイラスト（2026-10-11 オーナー「実際の画面だけでなく、イメージ図・イラストで伝えたい」）
置いて**公開し直す**と替わる（`src/pages/LpArt.jsx`・ビルドのときに `vite.config.js` が `public/lp` を見て、3 つの幅がそろった絵の一覧を焼き込む＝開いた画面で画像を探しに行かない・無ければ今の形のまま）。どれも明るい版だけ・幅 390 / 780 / 1560 の 3 つ・ヒーローと同じ sharp の手順（品質 90 前後）。暗い画面では角丸の絵のカード（`--separator` の細い線・少し暗く）で出す。暗い画面用の版（`<name>-dark-<390|780|1560>.webp`）を置けば、暗い画面ではそちらを出す（ヒーローも `hero-illust-dark-*`）。

| ファイル名（`public/lp/`） | 比 | 置く場所 | 無いとき |
|---|---|---|---|
| `illust-dialogue-light-<390\|780\|1560>.webp` | 4:3（1560×1170） | 「一方通行の読書から、会話する読書へ。」の見出しの下・2 枚のカードの上（2026-10-12 にオーナーの絵を入れた・あるとカードの簡単な図は出さない） | 何も出さない |
| `illust-action-light-…` | 1:1（1560×1560） | 柱「行動に移す」（明日の一歩） | 行動の画面写真 |
| `illust-focus-light-…` | 1:1 | 柱「習慣にする」（集中モード） | 集中モードの画面写真 |
| `illust-share-light-…` | 1:1 | 柱「発信する」（写真で共有） | 共有の画像の見本（絵に替わると「共有の画像は見本の写真で…」の注記も消える） |
| `illust-fields-light-…` | 1:1 | 柱「読書の偏りに気づく」（分野） | 記録の分野の画面写真 |
| `illust-advisor-light-…` | 1:1 | 柱「次の一冊を選ぶ」（AI 選書） | AI 選書のおすすめの画面写真 |
| `illust-start-light-…` | 4:3 | 「メモがなくても、今日から始められます。」の頭 | 何も出さない |

- 例（1:1）: `node -e "const s=require('sharp');[[390,90],[780,90],[1560,92]].forEach(([w,q])=>s('元.png').resize(w,w).webp({quality:q}).toFile('public/lp/illust-action-light-'+w+'.webp'))"`（4:3 は `resize(w, w*3/4)`）
- 対話の 4 コマ（実際の画面）と見本・語り口の注記は、絵が届いても「一方通行の読書から、会話する読書へ。」の節に残す（証拠）。読み上げの文は `Landing.jsx`（柱は `PILLARS` の `artAlt`）。絵の中身が変わったら合わせて直す。
- 結論が出たら、同じ枠でヒーローの文言（「読んだ本が、あなたの相談相手になる。」↔「読むほど、あなただけの相談相手が育つ。」）を比べる（lp-copy の案 A ↔ 案 B）。
- 相談の流れの手順を押した人の押下率が押さない人より明らかに高ければ、流れの説明（手順の名前）をヒーローに近づける。section_view で比較・共有・学習のどこで離れているかを見る。
- よく開かれる FAQ の内容は、ヒーローのボタン近くの一言に昇格させる。
- SNS や note のリンクには `?utm_source=x&utm_campaign=launch` のように付けると、流入元ごとに比べられる。
