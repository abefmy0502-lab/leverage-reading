// 💰 今月の売上と推定の粗利（運営ダッシュボード › 概況・目標のすぐ下・2026-10-22 オーナー「現在の売り上げと推定の粗利」）。
//
// 数は supabase_admin_profit.sql の admin_profit()（人数・追加トークン・AI の実原価）と lib/adminProfit.js の計算。
// 見せ方: 大きな数は「推定の粗利」1 つ（--text-title・700＝運営の数字のカードと同じ）。その下に 売上 → 手取り → AI の原価 → 固定費 を
// 「名前（短く 1 行）→ 数（600・右揃え・等幅の数字）→ 内訳（13/--text-3・文節で折り返す）」の同じ形で 4 行。
// 固定費は手入力（端末に保存）。閉じる入口は「完了」1 つ。SQL が無い間は「流すと出ます」の 1 行、通信の失敗は ErrorMessage、
// 読み込み中は SkeletonBlock（ほかの区画と同じ形）。見た目は DESIGN のトークンだけ（2026-10-22 ui-critic の直し）。
import { useMemo, useState } from 'react';
import { Coins, Pencil } from 'lucide-react';
import { btnGhost, btnLink, input } from '../../styles/ui';
import { SkeletonBlock } from '../Skeleton';
import ErrorMessage from '../ErrorMessage';
import { withPhraseBreaks } from '../TightBubble';
import {
  estimateProfit, loadFixed, saveFixed, yen, monthLabel, monthShort,
  estimateSeries, renewalsYen, projectAt, purposeBreakdown,
  PRICE_MONTHLY_YEN, PRICE_ANNUAL_YEN, PRICE_FOUNDING_YEN, STORE_FEE_RATE, FIELDS_AI_YEN_PER_BOOK,
} from '../../lib/adminProfit';

const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const caption = { margin: 0, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.4 };
const sub = { margin: 0, fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word' };
const rowBox = { padding: 'var(--space-2) 0', borderTop: '1px solid var(--separator)' };
const rowHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-sub)', color: 'var(--text)', minHeight: 'calc(var(--text-sub) * 1.5)' };
const num = { fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
// 行の右の文字ボタン: 44 の押せる高さは保ち、行の高さは文字ぶんだけ（負の余白で吸収）。
const inlineLink = { ...btnLink, minWidth: 'var(--tap-min)', padding: '0 var(--space-2)', margin: 'calc((var(--tap-min) - var(--text-sub) * 1.5) / -2) 0 calc((var(--tap-min) - var(--text-sub) * 1.5) / -2) calc(-1 * var(--space-2))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)' };
const FIXED_LABELS = [['apple', 'Apple Developer'], ['supabase', 'Supabase'], ['vercel', 'Vercel'], ['other', 'そのほか']];

// 内訳の項目: 「・」で区切り、1 項目は途中で割らない（inline-block）。
function Parts({ items }) {
  const list = items.filter(Boolean);
  return list.map((t, i) => (
    <span key={t}>
      {i > 0 && '・'}
      <span style={{ display: 'inline-block' }}>{t}</span>
    </span>
  ));
}

function Row({ label, value, children }) {
  return (
    <div style={rowBox}>
      <div style={rowHead}>
        <span>{label}</span>
        <span style={num}>{value}</span>
      </div>
      {children && <p style={{ ...sub, marginTop: 'var(--space-1)' }}>{children}</p>}
    </div>
  );
}

const MILESTONES = [50, 200, 400, 650, 1000];
// 棒の角（ReadingTimeCard と同じ 3＝グラフの棒は角丸 12 の例外）。
const CHART_RADIUS = 3;
const yenSigned = (v) => (v < 0 ? `−${yen(-v)}` : yen(v));

// 月ごとの棒（薄い棒＝売上・濃い棒＝粗利。負の粗利は棒を出さず数だけ）。目盛りは無し・名前は 3 本に 1 つ。
function MonthBars({ items, valueOf, baseOf, ariaLabel, strong = () => false }) {
  const max = Math.max(1, ...items.map((x) => Math.max(baseOf ? baseOf(x) : 0, valueOf(x))));
  return (
    <div role="img" aria-label={ariaLabel} style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 'var(--space-1)', alignItems: 'end', height: 88 }}>
      {items.map((x, i) => {
        const v = Math.max(0, valueOf(x));
        const b = baseOf ? Math.max(0, baseOf(x)) : 0;
        return (
          <div key={x.month || i} style={{ display: 'grid', alignItems: 'end', height: '100%', position: 'relative' }}>
            {baseOf && <div style={{ gridArea: '1 / 1', height: `${(b / max) * 72}px`, background: 'var(--fill)', borderRadius: `${CHART_RADIUS}px ${CHART_RADIUS}px 0 0`, width: '100%', maxWidth: 24, justifySelf: 'center' }} />}
            <div style={{ gridArea: '1 / 1', height: `${(v / max) * 72}px`, background: strong(x) ? 'var(--accent)' : 'var(--text-3)', borderRadius: `${CHART_RADIUS}px ${CHART_RADIUS}px 0 0`, opacity: strong(x) ? 1 : 0.75, width: '100%', maxWidth: 24, justifySelf: 'center' }} />
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: -16, textAlign: 'center', fontSize: 'var(--text-caption)', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {(i === items.length - 1 || i % 3 === 0) ? monthShort(x.month) : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Block({ id, title, children }) {
  return (
    <div id={id} style={{ ...rowBox, paddingTop: 'var(--space-3)' }}>
      <p style={{ ...caption, marginBottom: 'var(--space-2)' }}>{title}</p>
      {children}
    </div>
  );
}

// 月ごとの推移（直近 12 か月・薄い棒＝売上・濃い棒＝粗利・今月は栗色）。
function SeriesBlock({ series }) {
  if (!series || series.length === 0) return null;
  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const diff = prev ? last.grossYen - prev.grossYen : null;
  return (
    <Block id="profit-series" title="月ごとの推移（薄い棒＝売上・濃い棒＝粗利）">
      <div style={{ paddingBottom: 'var(--space-4)' }}>
        <MonthBars items={series} valueOf={(x) => x.grossYen} baseOf={(x) => x.revenueYen} strong={(x) => x === last} ariaLabel={`直近 ${series.length} か月の売上と粗利`} />
      </div>
      <p style={sub}>
        <Parts items={[
          prev && `先月の粗利 ${yenSigned(prev.grossYen)}`,
          diff != null && `今月は${diff >= 0 ? '＋' : '−'}${yen(Math.abs(diff))}`,
          `今月の有料 ${last.paid.total} 人`,
          prev && prev.churned > 0 && `先月の解約 ${prev.churned} 人`,
          series.some((x) => x.unknown) && '契約の履歴が無い月は人数 0',
        ]} />
      </p>
    </Block>
  );
}

// 次の 12 か月の更新の入金（税込・ストアの請求額・月額は毎月・年額は更新の月に山）。
function RenewalsBlock({ renewals }) {
  if (!renewals || renewals.length === 0) return null;
  const peak = renewals.reduce((a, b) => (b.annualYen > (a?.annualYen || 0) ? b : a), null);
  const total = renewals.reduce((s, x) => s + x.totalYen, 0);
  return (
    <Block id="profit-renewals" title="更新の見込み（次の 12 か月・税込の請求額）">
      <div style={{ paddingBottom: 'var(--space-4)' }}>
        <MonthBars items={renewals} valueOf={(x) => x.totalYen} strong={(x) => x.annualCount > 0} ariaLabel="次の 12 か月の更新の見込み" />
      </div>
      <p style={sub}>
        <Parts items={[
          `12 か月で ${yen(total)}`,
          peak && peak.annualCount > 0 && `年額の更新がいちばん多いのは ${monthShort(peak.month)}（${peak.annualCount} 人・${yen(peak.annualYen)}）`,
          '月額は今の人数が毎月そのまま更新する前提',
        ]} />
      </p>
    </Block>
  );
}

// AI の使い道（用途ごとの実原価・多い順・細い棒）。
function PurposeBlock({ data }) {
  const rows = purposeBreakdown(data?.purpose_mjpy);
  if (rows.length === 0) return null;
  return (
    <Block id="profit-purpose" title="AI の原価の使い道（今月）">
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', fontSize: 'var(--text-meta)', color: 'var(--text)' }}>
              <span>{r.label}</span><span style={num}>{yen(r.yen)}<span style={{ color: 'var(--text-3)', fontWeight: 400 }}>（{Math.round(r.share * 100)}%）</span></span>
            </div>
            <div style={{ height: 4, background: 'var(--fill)', borderRadius: 'var(--radius-full)', marginTop: 4 }}>
              <div style={{ height: '100%', width: `${Math.max(2, r.share * 100)}%`, background: 'var(--text-3)', borderRadius: 'var(--radius-full)' }} />
            </div>
          </div>
        ))}
      </div>
    </Block>
  );
}

// 道しるべごとの粗利の見込み（今の 1 人あたりの手残り × 人数 − 固定費）。
function MilestoneBlock({ p, fixed }) {
  const cur = p.paid.total;
  return (
    <Block id="profit-milestones" title="有料の人数ごとの粗利の見込み（今の 1 人あたりの手残りで）">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
        {MILESTONES.map((n) => {
          const reached = cur >= n;
          return (
            <div key={n} style={{ textAlign: 'center', padding: 'var(--space-2) 0', borderRadius: 'var(--radius)', background: reached ? 'var(--accent-soft)' : 'var(--fill)' }}>
              <p style={{ margin: 0, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)' }}>{n.toLocaleString('ja-JP')} 人</p>
              <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{yenSigned(projectAt(n, p, fixed))}</p>
            </div>
          );
        })}
      </div>
      <p style={{ ...sub, marginTop: 'var(--space-2)' }}>
        <Parts items={[`今は ${cur} 人`, cur > 0 ? `1 人あたりの手残り ${yen(p.perPaidYen)}` : '有料 0 人のあいだは月額と年額が半々・AI 1 人 ¥79 で置く', '固定費は今の値']} />
      </p>
    </Block>
  );
}

// data: admin_profit() の返り値（null＝未取得）。missing: RPC が無い（SQL 未適用）。error: ほかの失敗（通信など）。onRetry: もう一度。
export default function ProfitCard({ data, missing = false, error = null, onRetry, series = null, renewals = null }) {
  const [fixed, setFixed] = useState(() => loadFixed());
  const [editing, setEditing] = useState(false);
  const p = useMemo(() => estimateProfit(data, fixed), [data, fixed]);
  const seriesEst = useMemo(() => (series ? estimateSeries(series, fixed) : null), [series, fixed]);
  const renewEst = useMemo(() => (renewals ? renewalsYen(renewals) : null), [renewals]);
  const onFixed = (k, v) => {
    const next = { ...fixed, [k]: Math.max(0, Math.round(Number(v) || 0)) };
    setFixed(next);
    saveFixed(next);
  };
  const apiYen = (Number(data?.ai_cost_mjpy) || 0) / 1000;
  const aiShare = p.netYen > 0 ? Math.round((p.aiYen / p.netYen) * 100) : null;
  let body;
  if (missing) {
    body = <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{withPhraseBreaks('supabase_admin_profit.sql を流すと出ます（人数・追加トークン・AI の実原価から計算します）。')}</p>;
  } else if (error) {
    body = <ErrorMessage title="売上を読み込めませんでした" description="通信状況を確認して、もう一度お試しください。" actions={onRetry ? [{ label: 'もう一度', onClick: onRetry }] : []} />;
  } else if (!data) {
    body = (
      <div aria-busy="true" aria-label="売上と粗利を読み込んでいます" style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <SkeletonBlock width="55%" height={12} />
        <SkeletonBlock width="45%" height={28} />
        {[3, 1, 2, 1].map((lines, i) => (
          <div key={i} style={{ ...rowBox, display: 'grid', gap: 'var(--space-1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><SkeletonBlock width="30%" height={18} /><SkeletonBlock width="26%" height={18} /></div>
            {Array.from({ length: lines }, (_, k) => <SkeletonBlock key={k} width={k === lines - 1 ? '70%' : '100%'} height={13} />)}
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <>
        <p style={caption}>推定の粗利（月あたり・人件費を除く）</p>
        <p style={{ margin: 'var(--space-1) 0 var(--space-3)', fontSize: 'var(--text-title)', fontWeight: 700, color: p.grossYen < 0 ? 'var(--warning)' : 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {p.grossYen < 0 ? `−${yen(-p.grossYen)}` : yen(p.grossYen)}
        </p>
        <Row label="売上" value={yen(p.revenueYen)}>
          <Parts items={[
            '税込',
            `月額 ${p.paid.monthly} 人 × ${yen(PRICE_MONTHLY_YEN)}`,
            `年額 ${p.paid.annual} 人 × ${yen(PRICE_ANNUAL_YEN)} ÷ 12`,
            p.paid.founding > 0 && `創業メンバー ${p.paid.founding} 人 × ${yen(PRICE_FOUNDING_YEN)} ÷ 12`,
            p.packs.count > 0 && `追加トークン ${p.packs.count} 件 ${yen(p.packs.yen)}`,
            p.paid.trial > 0 && `無料期間 ${p.paid.trial} 人は売上 0`,
          ]} />
        </Row>
        <Row label="手取り" value={yen(p.netYen)}>
          <Parts items={['税抜', `App Store の手数料 ${Math.round(STORE_FEE_RATE * 100)}% のあと`]} />
        </Row>
        <Row label="AI の原価" value={`−${yen(p.aiYen)}`}>
          <Parts items={[
            `相談などの実額 ${yen(apiYen)}`,
            Number(data?.fields_ai_calls) > 0 && `本の分野 ${data.fields_ai_calls} 冊 × ¥${FIELDS_AI_YEN_PER_BOOK}`,
            aiShare != null && `手取りの ${aiShare}%`,
            p.paid.total > 0 && `有料 1 人あたりの手残り ${yen(p.perPaidYen)}`,
          ]} />
        </Row>
        <div style={rowBox}>
          <div style={rowHead}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              固定費
              {!editing && (
                <button type="button" onClick={() => setEditing(true)} style={inlineLink}>
                  <Pencil size="1em" aria-hidden="true" />直す
                </button>
              )}
            </span>
            <span style={num}>−{yen(p.fixedYen)}</span>
          </div>
          {!editing && <p style={{ ...sub, marginTop: 'var(--space-1)' }}><Parts items={FIXED_LABELS.filter(([k]) => fixed[k] > 0).map(([k, l]) => `${l} ${yen(fixed[k])}`)} /></p>}
          {editing && (
            <div style={{ marginTop: 'var(--space-2)' }}>
              <p style={{ ...caption, marginBottom: 'var(--space-2)' }}>月あたり（円）</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
                {FIXED_LABELS.map(([k, label]) => (
                  <label key={k} style={{ display: 'grid', gap: 'var(--space-1)', minWidth: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {label}
                    <input type="number" inputMode="numeric" min="0" value={fixed[k]} onChange={(e) => onFixed(k, e.target.value)} style={{ ...input, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => setEditing(false)} style={{ ...btnGhost, width: '100%', marginTop: 'var(--space-3)' }}>完了</button>
            </div>
          )}
        </div>
        <SeriesBlock series={seriesEst} />
        <RenewalsBlock renewals={renewEst} />
        <PurposeBlock data={data} />
        <MilestoneBlock p={p} fixed={fixed} />
      </>
    );
  }
  return (
    <section aria-labelledby="profit-title" style={{ margin: 'var(--space-6) 0' }}>
      <p id="profit-title" style={{ ...caption, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <Coins size="1.2em" strokeWidth={2} aria-hidden="true" /> {monthLabel(data?.month)}の売上と推定の粗利
      </p>
      <div style={card}>{body}</div>
    </section>
  );
}
