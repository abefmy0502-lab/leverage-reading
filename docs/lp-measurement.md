# LP の計測 — どの導線がダウンロードにつながるかを数字で決める

LP（https://orime.vercel.app の紹介ページ）には、3 種類の計測が入っています。

| 何を | どこで見る | 必要な準備（1 回だけ） |
|---|---|---|
| ① 閲覧数・参照元・端末・国 | Vercel → orime → **Analytics** | Vercel の Analytics タブで「Enable」を押す（Hobby は無料枠内） |
| ② ボタンが押された場所・相談の流れ（4 枚）・節ごとの到達・読み進めた深さ・3D ↔ 写真・創業メンバー価格 | Supabase → SQL Editor（下の集計例） | `supabase_lp_events.sql` を SQL Editor で 1 回実行 |
| ③ **実際のダウンロード数**（どのボタンから入手されたか） | App Store Connect → App 分析 → **キャンペーン** | provider token を Vercel の `VITE_APP_STORE_PT` に入れる（下記） |
| ④ **公開のお知らせの登録**（公開前の成果・2026-10-05） | Supabase → SQL Editor（`lp_waitlist`） | `supabase_lp_waitlist.sql` を 1 回実行 |

> ⚠️ `supabase_lp_events.sql` は 2026-10-05 に**流し直す**こと。最初の版のイベントの一覧（CHECK）に `flow_*`・`section_view`・`offer_badge` が無く、2026-10-02 からのこれらの記録は保存されていなかった。流し直すと、下の新しいイベントも入る。

どれも個人を特定しません（Cookie なし・IP や入力文は保存しない。プライバシーポリシー第 9 条③）。

## ③ App Store のキャンペーン（ダウンロード数そのもの）

1. App Store Connect → 「App 分析」→「キャンペーン」→「キャンペーンリンクを生成」を開く。
2. 出てくるリンクの中の `pt=数字` の数字が provider token。
3. Vercel の Environment Variables に `VITE_APP_STORE_PT` = その数字（Production）を入れて、公開し直す。

これで LP のボタンは押した場所ごとに `ct=lp_hero_3d`（ヒーロー・3D を見た人）のようなキャンペーン名付きで App Store に飛びます。
App Store Connect では、キャンペーン名ごとに「ページ閲覧数・App 入手数」が見られます（反映は翌日以降）。

キャンペーン名の読み方: `lp_<押した場所>_<ヒーローの表示>`

- 押した場所: `header`（上の帯）/ `hero`（最初の画面）/ `sticky`（スマホの下に固定）/ `start`（「メモがゼロでも、初日から」の節）/ `pricing`（料金）/ `final`（最後）/ `qr`（PC の QR コード）/ `hero_badge`・`final_badge`（公式バッジ・`VITE_APP_STORE_BADGE` があるときだけ）。`offer`（創業メンバー価格の節）は 2026-10-05 に料金の中の帯になり、ボタンは無くなった。`demo` は 2026-10-02 に無くなった
- ヒーローの表示: `3d` / `photo`（2026-10-05 から、広い画面・マウスの端末だけ半々に振り分け、スマホはいつも `photo`。`?hero=3d` / `?hero=photo` で固定して確認できる・`VITE_LP_HERO_AB=off` で全員 `photo`）

## ④ 公開のお知らせ（App Store の URL が無い間の入口）

LP は `VITE_APP_STORE_URL` が無い間、押せないボタンを出さずに「公開の日にメールで知らせる」（メール 1 欄＋送る）を出す（ヒーロー・初日から・料金・最後の 4 か所。1 か所で送ると全部が「公開の日にお知らせします。」になる）。
保存は `api/lp-waitlist.js` → `lp_waitlist`（同じメールは 1 行・IP は保存しない）。Do Not Track の端末からも送れる（本人がボタンを押して送るもので、閲覧の記録ではない）。

- 使い道は**公開のお知らせだけ**。公開から 3 か月以内に全部消す（プライバシーポリシーと同じ約束・欄の下にも書いてある）
- **送るメール（特定電子メール法）**: 送るのは公開の日の 1 通だけ。本文に**送信者の名前（Orime・運営 阿部文哉）と連絡先（問い合わせのメールアドレス）**、「LP で公開のお知らせを希望された方に送っています」を必ず書く。送ったら `update lp_waitlist set notified_at = now() where notified_at is null;`
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

-- 相談の流れ（4 枚・LpFlow.jsx）: 見た人の割合と、手順を押した／もう一度見た人のボタン押下率
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
--   2026-10-05 から: flow / vs-chatgpt / action / grow / start / share / privacy / offer（料金の中の帯・期間中）/ pricing / faq / final
--   （2026-10-02〜10-04 は compare＝比較表。いまは無い）
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

-- ヒーローの「15 秒で、相談の流れを見る」・ログイン・フッターのリンク（props.to: terms / privacy / sct / mail）
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

- 3D と写真は、**各 300 訪問**くらい集まるまでは結論を出さない（それ未満は偶然の差が大きい）。最終判断は ③ の App 入手数で（公開前は ④ の登録数で）。3D は広い画面だけなので、比べるのは `device = 'desktop'` の訪問だけ。
- 結論が出たら、同じ枠でヒーローの文言（「読んだ本が、あなたの相談相手になる。」↔「読むほど、あなただけの相談相手が育つ。」）を比べる（lp-copy の案 A ↔ 案 B）。
- 相談の流れの手順を押した人の押下率が押さない人より明らかに高ければ、流れの説明（手順の名前）をヒーローに近づける。section_view で比較・共有・学習のどこで離れているかを見る。
- よく開かれる FAQ の内容は、ヒーローのボタン近くの一言に昇格させる。
- SNS や note のリンクには `?utm_source=x&utm_campaign=launch` のように付けると、流入元ごとに比べられる。
