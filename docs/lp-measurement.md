# LP の計測 — どの導線がダウンロードにつながるかを数字で決める

LP（https://orime.vercel.app の紹介ページ）には、3 種類の計測が入っています。

| 何を | どこで見る | 必要な準備（1 回だけ） |
|---|---|---|
| ① 閲覧数・参照元・端末・国 | Vercel → orime → **Analytics** | Vercel の Analytics タブで「Enable」を押す（Hobby は無料枠内） |
| ② ボタンが押された場所・相談の流れ（4 枚）・節ごとの到達・読み進めた深さ・3D ↔ 写真・創業メンバー価格 | Supabase → SQL Editor（下の集計例） | `supabase_lp_events.sql` を SQL Editor で 1 回実行 |
| ③ **実際のダウンロード数**（どのボタンから入手されたか） | App Store Connect → App 分析 → **キャンペーン** | provider token を Vercel の `VITE_APP_STORE_PT` に入れる（下記） |

どれも個人を特定しません（Cookie なし・IP や入力文は保存しない。プライバシーポリシー第 9 条③）。

## ③ App Store のキャンペーン（ダウンロード数そのもの）

1. App Store Connect → 「App 分析」→「キャンペーン」→「キャンペーンリンクを生成」を開く。
2. 出てくるリンクの中の `pt=数字` の数字が provider token。
3. Vercel の Environment Variables に `VITE_APP_STORE_PT` = その数字（Production）を入れて、公開し直す。

これで LP のボタンは押した場所ごとに `ct=lp_hero_3d`（ヒーロー・3D を見た人）のようなキャンペーン名付きで App Store に飛びます。
App Store Connect では、キャンペーン名ごとに「ページ閲覧数・App 入手数」が見られます（反映は翌日以降）。

キャンペーン名の読み方: `lp_<押した場所>_<ヒーローの表示>`

- 押した場所: `header`（上の帯）/ `hero`（最初の画面）/ `sticky`（スマホの下に固定）/ `offer`（創業メンバー価格の節・期間中だけ）/ `pricing`（料金）/ `final`（最後）/ `qr`（PC の QR コード）。`demo`（旧「試しに、相談してみる」のあと）は 2026-10-02 の作り直しで無くなった
- ヒーローの表示: `3d` / `photo`（訪問者を半々に振り分け。`?hero=3d` / `?hero=photo` で固定して確認できる）

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

-- 節ごとの到達（section_view・節が 4 割見えたら 1 回: flow / compare / share / privacy / offer / pricing）
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

-- 開かれた FAQ（申し込みの手前で気になっていること）
select props->>'i' as faq_index, count(*) from lp_events where event = 'faq_open' group by 1 order by 2 desc;

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

- 3D と写真は、**各 300 訪問**くらい集まるまでは結論を出さない（それ未満は偶然の差が大きい）。最終判断は ③ の App 入手数で。
- 相談の流れの手順を押した人の押下率が押さない人より明らかに高ければ、流れの説明（手順の名前）をヒーローに近づける。section_view で比較・共有・学習のどこで離れているかを見る。
- よく開かれる FAQ の内容は、ヒーローのボタン近くの一言に昇格させる。
- SNS や note のリンクには `?utm_source=x&utm_campaign=launch` のように付けると、流入元ごとに比べられる。
