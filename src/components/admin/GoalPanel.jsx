// 🎯 GoalPanel — 運営ダッシュボードの最初の画面「2027 年中に有料ユーザー 1,000 人」（2026-10-11 オーナー決定）。
// 上から: 1 目標の進み具合 → 2 毎週の流れ → 3 いちばん弱い段階と今週やること → 4 季節と更新の予定 → 5 毎週の見直し。
// 計算は src/lib/goal1000.js（純粋な関数・テストつき）。ここは表示と入力だけ。
// 集計は supabase_admin_goal.sql（admin_goal_weekly・admin_goal_plan・ops_weekly_reviews）。読み方は docs/goal-1000.md。
// 見た目は今の運営ダッシュボードにそろえる（トークンだけ・色の直書きなし）。
import { useMemo, useState } from 'react';
import { Target, Pencil, AlertTriangle, Table2, Stethoscope, CalendarDays, ClipboardCheck, Check, Plus } from 'lucide-react';
import { C, btnPrimary, btnPrimaryOff, btnGhost } from '../../styles/ui';
import { MIN_DEN } from '../../lib/launchKpis';
import {
  goalStatus, forecastBasisText, monthEndPlan, normalizeWeeks, funnelRows, evaluateStages, pickWeakest,
  stageValueText, seasonView, foundingView, FOUNDING_PREP_TEXT, reviewNumbers, reviewLine, weekStartJst, pctText,
} from '../../lib/goal1000';

const card = { background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const sectionTitle = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  fontSize: 'var(--text-meta)', fontWeight: 600, color: C.ink, margin: 'var(--space-8) 0 var(--space-3)',
};
const caption = { margin: 0, fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600, lineHeight: 1.5 };
const note = { margin: 0, fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.6 };
const big = { margin: 0, fontSize: 'var(--text-title)', fontWeight: 700, color: C.ink, lineHeight: 1.15 };
const inp = {
  width: '100%', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-body)', boxSizing: 'border-box',
  border: `1px solid ${C.hairlineStrong}`, borderRadius: 'var(--radius)', background: 'var(--surface)', color: C.ink, fontFamily: 'inherit',
};
const smallBtn = { ...btnGhost, width: 'auto', flex: '0 0 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-sub)' };
const icon = { size: '1em', strokeWidth: 2, 'aria-hidden': 'true', style: { flexShrink: 0 } };

const LEVEL = {
  ok: { label: '予定どおり', color: 'var(--success)', bg: 'var(--success-soft)' },
  behind: { label: '遅れ', color: 'var(--warning)', bg: 'var(--warning-soft)' },
  critical: { label: '大きな遅れ', color: 'var(--error)', bg: 'var(--error-soft)' },
  prelaunch: { label: '公開前', color: C.ink2, bg: 'var(--fill)' },
};
const STATE = {
  ok: { label: '目標以上', color: 'var(--success)' },
  below: { label: '目標未満', color: 'var(--warning)' },
  few: { label: '参考', color: C.ink3 },
  nodata: { label: 'データなし', color: C.ink3 },
};
const VARIANT_LABEL = { illust: 'イラスト', photo: '写真', '3d': '3D', none: '不明' };

const n0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString());
const signed = (v) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${Math.round(v * 10) / 10}`);
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

function Missing({ file, what }) {
  return (
    <div style={{ ...card, background: 'var(--warning-soft)', border: 'none' }}>
      <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: C.ink2, lineHeight: 1.7 }}>
        {what}は SQL を流すと出ます（<b>{file}</b>）。
      </p>
    </div>
  );
}

// ── 1. 目標の進み具合 ─────────────────────────────────────────────────────────
function PlanEditor({ plan, onSave, onCancel, canSave }) {
  const [target, setTarget] = useState(String(plan.target));
  const [deadline, setDeadline] = useState(plan.deadline);
  const [launch, setLaunch] = useState(plan.launch);
  const [ms, setMs] = useState(() => plan.milestones.filter((m) => m.d < plan.deadline).map((m) => ({ d: m.d, n: String(m.n) })));
  const save = () => {
    const t = parseInt(target, 10);
    if (!Number.isFinite(t) || t <= 0 || !deadline) return;
    const milestones = ms.map((m) => ({ d: m.d, n: parseInt(m.n, 10) })).filter((m) => m.d && Number.isFinite(m.n) && m.n >= 0);
    onSave({ target: t, deadline, launch: launch || plan.launch, milestones });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10em, 1fr))', gap: 'var(--space-2)' }}>
        <label style={caption}>有料ユーザー（人）
          <input type="number" inputMode="numeric" min={1} value={target} onChange={(e) => setTarget(e.target.value)} style={inp} />
        </label>
        <label style={caption}>期限
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={inp} />
        </label>
        <label style={caption}>公開日
          <input type="date" value={launch} onChange={(e) => setLaunch(e.target.value)} style={inp} />
        </label>
      </div>
      <p style={caption}>道しるべ（その日の終わりの有料ユーザー）</p>
      {ms.map((m, i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <input type="date" value={m.d} aria-label={`道しるべ ${i + 1} の日`} onChange={(e) => setMs((list) => list.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)))} style={{ ...inp, flex: 1 }} />
          <input type="number" inputMode="numeric" min={0} value={m.n} aria-label={`道しるべ ${i + 1} の人数`} onChange={(e) => setMs((list) => list.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} style={{ ...inp, flex: 1 }} />
        </div>
      ))}
      <p style={note}>期限の日はいつも目標の人数です。道しるべの間は日ごとにならします。</p>
      {!canSave && <p style={{ ...note, color: 'var(--warning)' }}>保存には supabase_admin_goal.sql が要ります（いまは既定の値で計算しています）。</p>}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button type="button" onClick={save} disabled={!canSave} style={{ ...(canSave ? btnPrimary : btnPrimaryOff), minHeight: 44 }}>目標を保存</button>
        <button type="button" onClick={onCancel} style={{ ...btnGhost, minHeight: 44 }}>キャンセル</button>
      </div>
    </div>
  );
}

function GoalProgress({ s, plan, planMissing, onSavePlan, todayIso }) {
  const [editing, setEditing] = useState(false);
  const lv = LEVEL[s.level];
  const pctDone = Math.min(1, s.current / Math.max(1, s.target));
  const pctPlan = Math.min(1, s.planned / Math.max(1, s.target));
  const months = useMemo(() => monthEndPlan(plan), [plan]);
  const ms = plan.milestones;
  return (
    <section aria-labelledby="goal-title">
      <p style={{ ...sectionTitle, marginTop: 'var(--space-4)' }}>
        <Target {...icon} /><span id="goal-title" style={{ flex: 1 }}>有料ユーザー {plan.target.toLocaleString()} 人（{plan.deadline} まで）</span>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label="目標と道しるべを変える"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 'none', background: 'transparent', color: C.ink2, borderRadius: 'var(--radius)', cursor: 'pointer' }}>
            <Pencil size="1.1em" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </p>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {editing ? (
          <PlanEditor plan={plan} canSave={!planMissing}
            onCancel={() => setEditing(false)}
            onSave={async (p) => { const ok = await onSavePlan(p); if (ok !== false) setEditing(false); }} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div>
                <p style={caption}>今の有料ユーザー（7 日間無料を除く）</p>
                <p style={big}>{s.current.toLocaleString()} <span style={{ fontSize: 'var(--text-meta)', color: C.ink3, fontWeight: 600 }}>/ {s.target.toLocaleString()} 人</span></p>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 32, padding: '0 var(--space-3)', borderRadius: 'var(--radius-full)', background: lv.bg, color: lv.color, fontSize: 'var(--text-sub)', fontWeight: 700 }}>
                {s.level === 'critical' && <AlertTriangle {...icon} />}
                {s.level === 'ok' ? `予定どおり（+${s.ahead}）` : s.level === 'prelaunch' ? '公開前' : `${lv.label} ${s.behind} 人`}
              </span>
            </div>
            {/* 棒: 塗り＝今・縦線＝今日あるべき数 */}
            <div style={{ position: 'relative', height: 8, background: C.soft, borderRadius: 'var(--radius-full)' }} aria-hidden="true">
              <div style={{ height: '100%', width: `${pctDone * 100}%`, background: C.brand, borderRadius: 'var(--radius-full)' }} />
              {s.planned > 0 && <div style={{ position: 'absolute', top: -4, bottom: -4, left: `calc(${pctPlan * 100}% - 1px)`, width: 2, background: C.ink }} />}
            </div>
            <p style={note}>今日（{md(todayIso)}）あるべき数 <b style={{ color: C.ink }}>{s.planned.toLocaleString()} 人</b>（縦の線）・期限まで {s.daysLeft} 日</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
              <div>
                <p style={caption}>必要な速さ</p>
                <p style={{ ...big, fontSize: 'var(--text-heading)', color: s.paceShort ? 'var(--warning)' : C.ink }}>週 +{s.requiredPerWeek}</p>
                <p style={note}>純増（新規 − 解約）</p>
              </div>
              <div>
                <p style={caption}>直近の純増</p>
                <p style={{ ...big, fontSize: 'var(--text-heading)' }}>週 {signed(s.net4)}</p>
                <p style={note}>4 週の平均{s.net8 != null ? `（8 週 ${signed(s.net8)}）` : ''}</p>
              </div>
              <div>
                <p style={caption}>期限の見込み</p>
                <p style={{ ...big, fontSize: 'var(--text-heading)', color: s.forecastShort ? 'var(--warning)' : C.ink }}>{s.forecast == null ? '—' : `${s.forecast.toLocaleString()} 人`}</p>
                <p style={note}>{s.forecast == null ? '' : s.forecastShort ? `目標まで ${(s.target - s.forecast).toLocaleString()} 人足りない` : '目標に届く'}</p>
              </div>
            </div>
            <p style={note}>{forecastBasisText(s)}</p>

            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {ms.map((m) => {
                const passed = todayIso > m.d;
                const hit = s.current >= m.n;
                return (
                  <span key={m.d} style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-caption)', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-full)', border: `1px solid ${C.hairlineStrong}`, color: hit ? 'var(--success)' : passed ? 'var(--error)' : C.ink2, background: hit ? 'var(--success-soft)' : 'transparent' }}>
                    {m.d.slice(0, 7)}: {m.n.toLocaleString()}人{hit && <Check size="1em" strokeWidth={2.5} aria-label="達成" />}
                  </span>
                );
              })}
            </div>
            <details>
              <summary style={{ ...note, cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>月末ごとのあるべき数</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--space-1) var(--space-2)' }}>
                {months.map((m) => <span key={m.month} style={{ fontSize: 'var(--text-caption)', color: C.ink2 }}>{m.month}　<b style={{ color: C.ink }}>{m.n}</b></span>)}
              </div>
            </details>
            {planMissing && <p style={note}>目標と道しるべは既定の値（master plan §10-2）です。画面で変えるには supabase_admin_goal.sql を流してください。</p>}
          </>
        )}
      </div>
    </section>
  );
}

// ── 2. 毎週の流れ ────────────────────────────────────────────────────────────
function FunnelTable({ rows, variants, sources, salesMissing }) {
  const th = { padding: 'var(--space-2)', fontSize: 'var(--text-caption)', fontWeight: 600, color: C.ink2, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.hairline}` };
  const td = { padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--text-caption)', color: C.ink, textAlign: 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.hairline}` };
  const lab = { ...td, textAlign: 'left', color: C.ink2, fontWeight: 600, position: 'sticky', left: 0, background: C.card, zIndex: 1 };
  const noEv = !sources?.subscription_events;
  const lines = [
    ['LP の訪問', (r) => n0(r.lpViews)],
    ...variants.map((v) => [`　${VARIANT_LABEL[v] || v}（訪問 / 押下）`, (r) => (r.lpViews == null ? '—' : `${n0(r.lpViewsBy[v] || 0)} / ${n0(r.lpClicksBy[v] || 0)}`)]),
    ['LP のボタンの押下', (r) => n0(r.lpClicks)],
    ['ストアのページ表示（手入力）', (r) => n0(r.storeViews)],
    ['インストール（手入力）', (r) => n0(r.installs)],
    ['新規登録', (r) => n0(r.signups)],
    ['初日に相談', (r) => (r.firstConsult?.den ? pctText(r.firstConsult.num, r.firstConsult.den) : '待ち')],
    ['7 日でメモ 10 件', (r) => (r.memos10?.den ? pctText(r.memos10.num, r.memos10.den) : '待ち')],
    ['7 日間無料の開始', (r) => (r.trialStarts == null ? '—' : `${r.trialStarts}${r.signups ? `（${pctText(r.trialStarts, r.signups)}）` : ''}`)],
    ['7 日間無料 → 有料', (r) => (!r.trialPaid ? '—' : r.trialPaid.den ? `${pctText(r.trialPaid.num, r.trialPaid.den)}（${r.trialPaid.num}/${r.trialPaid.den}）` : (r.trialPaid.pending ? '待ち' : '—'))],
    ['新規の有料（月額 / 年額）', (r) => (r.newPaid == null ? '—' : `${r.newPaid}（${r.newPaidMonthly} / ${r.newPaidAnnual ?? 0}）`)],
    ['解約', (r) => n0(r.churned)],
    ['純増', (r) => (r.net == null ? '—' : signed(r.net))],
    ['有料に占める年額', (r) => (r.annualShare == null ? '—' : `${Math.round(r.annualShare * 100)}%`)],
  ];
  return (
    // isolation: 左に貼りつく行の名前を、この箱の中だけで重ねる（上に貼りつくタブより前に出さない）。
    <div style={{ ...card, padding: 'var(--space-3) 0 0', isolation: 'isolate' }}>
      <p style={{ ...note, padding: '0 var(--space-3) var(--space-2)' }}>
        週（日本時間の月曜はじまり）ごと。左が新しい週（いちばん左は途中）。初日に相談・メモ 10 件は「登録した週」の人。
        {noEv && ' 7 日間無料・有料・解約は supabase_subscription_events.sql を流すと数え始めます。'}
        {!sources?.lp_events && ' LP の数は supabase_lp_events.sql を流すと出ます。'}
        {salesMissing ? ' 手入力の行は supabase_ops_sales_metrics.sql を流すと入れられます。' : ' 手入力の行は「営業」タブで週ごとに入れます。'}
      </p>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, ...lab, color: C.ink2 }}>週</th>
              {rows.map((r) => <th key={r.week} scope="col" style={th}>{md(r.week)}〜</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, fn]) => (
              <tr key={label}>
                <th scope="row" style={lab}>{label}</th>
                {rows.map((r) => <td key={r.week} style={td}>{fn(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 3. いちばん弱い段階 ──────────────────────────────────────────────────────
function Diagnosis({ stages, weakest, status, onAddTask, chosen, setChosen }) {
  const [busy, setBusy] = useState('');
  const add = async (a) => {
    if (busy || chosen[a.id]) return;
    setBusy(a.id);
    const ok = await onAddTask(a);
    setBusy('');
    if (ok) setChosen((c) => ({ ...c, [a.id]: a.title }));
  };
  return (
    <section aria-labelledby="diag-title">
      <p style={sectionTitle}><Stethoscope {...icon} /><span id="diag-title">いちばん弱い段階と、今週やること</span></p>
      {status.level === 'critical' && (
        <div role="alert" style={{ ...card, border: 'none', background: 'var(--error-soft)', marginBottom: 'var(--space-2)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 700, color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AlertTriangle {...icon} />予定より {status.behind} 人遅れています（あるべき数の {Math.round((status.ratio || 0) * 100)}%）
          </p>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-caption)', color: C.ink, lineHeight: 1.6 }}>
            今週は下の段階 1 つに絞って手を打ち、必要な速さ（週 +{status.requiredPerWeek}）と直近の純増（週 {signed(status.net4)}）の差を毎週の見直しで追ってください。
          </p>
        </div>
      )}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {weakest ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 700, color: C.ink }}>{weakest.no} {weakest.label}</p>
            <p style={note}>{stageValueText(weakest)} ・ 目標 {weakest.target}（目標の {Math.round(weakest.ratio * 100)}%）</p>
            {weakest.actions.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ flex: 1, fontSize: 'var(--text-meta)', color: C.ink, lineHeight: 1.5 }}>{a.title}<span style={{ color: C.ink3 }}>（{a.dept}）</span></span>
                <button type="button" onClick={() => add(a)} disabled={!!chosen[a.id] || busy === a.id}
                  style={{ ...smallBtn, color: chosen[a.id] ? 'var(--success)' : C.brand, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  {chosen[a.id] ? <><Check {...icon} />入れました</> : <><Plus {...icon} />タスクに</>}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: C.ink2, lineHeight: 1.6 }}>
            目標を下回っている段階はありません（データの無い段階・分母が {MIN_DEN} 人未満の段階は選びません）。
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.hairline}`, paddingTop: 'var(--space-2)' }}>
          {stages.map((st) => (
            <div key={st.key} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', padding: 'var(--space-1) 0', fontSize: 'var(--text-caption)' }}>
              <span style={{ flex: '0 0 auto', color: C.ink2, fontWeight: 600 }}>{st.no}</span>
              <span style={{ flex: 1, color: C.ink, minWidth: 0 }}>{st.label}<span style={{ color: C.ink3 }}>　{stageValueText(st)}</span></span>
              <span style={{ flex: '0 0 auto', color: STATE[st.state].color, fontWeight: 600 }}>{STATE[st.state].label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 4. 季節と更新の予定 ──────────────────────────────────────────────────────
function Seasons({ seasons, founding }) {
  const fState = { later: '', prep: '準備の時期', now: '更新中', past: '終わった' }[founding.state];
  return (
    <section aria-labelledby="season-title">
      <p style={sectionTitle}><CalendarDays {...icon} /><span id="season-title">季節と更新の予定</span></p>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {seasons.map((s) => (
          <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: C.ink, fontWeight: 600 }}>
              {s.label}
              <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-caption)', fontWeight: 600, color: s.state === 'later' ? C.ink3 : 'var(--warning)' }}>
                {s.state === 'now' ? '今' : `あと ${s.daysUntil} 日`}
              </span>
            </p>
            <p style={note}>{s.state === 'later' ? '準備: ' : '今やる: '}{s.prep}</p>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: C.ink, fontWeight: 600 }}>
            創業メンバーの年額の更新 {founding.count.toLocaleString()} 人
            <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-caption)', fontWeight: 600, color: founding.state === 'later' ? C.ink3 : 'var(--warning)' }}>
              {founding.state === 'later' ? `あと ${founding.daysUntil} 日` : fState}
            </span>
          </p>
          <p style={note}>
            更新日 {founding.from}〜{founding.to}{founding.guessed ? '（まだ記録が無いので、創業メンバー価格の期間の 1 年後を目安に）' : ''}・準備は {founding.prepFrom} から
          </p>
          <p style={note}>{FOUNDING_PREP_TEXT}</p>
        </div>
      </div>
    </section>
  );
}

// ── 5. 毎週の見直し ──────────────────────────────────────────────────────────
function WeeklyReview({ todayIso, status, weakest, chosen, reviews, reviewsMissing, onSaveReview }) {
  const wk = weekStartJst(todayIso);
  const mine = reviews.find((r) => String(r.week_start) === wk);
  const [memo, setMemo] = useState(mine?.memo || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const numbers = reviewNumbers(status, weakest);
  const actions = Object.values(chosen);
  const save = async () => {
    if (saving) return;
    setSaving(true); setMsg('');
    const ok = await onSaveReview({ week_start: wk, numbers, actions, weakest: weakest?.key || null, memo: memo.trim().slice(0, 1000) || null });
    setSaving(false);
    setMsg(ok ? '記録しました。' : '記録できませんでした。');
  };
  return (
    <section aria-labelledby="review-title" id="goal-weekly-review">
      <p style={sectionTitle}><ClipboardCheck {...icon} /><span id="review-title">毎週の見直し（{md(wk)} の週）</span></p>
      {reviewsMissing ? <Missing file="supabase_admin_goal.sql" what="毎週の見直しの記録" /> : (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: C.ink, lineHeight: 1.6 }}>{reviewLine(numbers)}</p>
          <p style={note}>選んだ打ち手: {actions.length ? actions.join(' / ') : 'まだありません（上の「タスクに」で選ぶ）'}</p>
          <label style={caption}>メモ（任意）
            <textarea value={memo} maxLength={1000} rows={2} onChange={(e) => setMemo(e.target.value)} placeholder="例: 7 日間無料の実験は A が勝ち。来週から全員に" style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={saving} style={{ ...(saving ? btnPrimaryOff : btnPrimary), width: 'auto', minHeight: 44, padding: '0 var(--space-4)' }}>
              {saving ? '記録中…' : mine ? '今週の見直しを記録し直す' : '今週の見直しを記録'}
            </button>
            {msg && <span role="status" style={{ fontSize: 'var(--text-caption)', color: C.ink2 }}>{msg}</span>}
          </div>
          {reviews.length > 0 && (
            <div style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <p style={caption}>これまでの見直し</p>
              {reviews.slice(0, 12).map((r) => (
                <div key={r.week_start} style={{ fontSize: 'var(--text-caption)', lineHeight: 1.6 }}>
                  <b style={{ color: C.ink }}>{md(String(r.week_start))}〜</b>
                  <span style={{ color: C.ink2 }}>　{reviewLine(r.numbers)}</span>
                  {Array.isArray(r.actions) && r.actions.length > 0 && <span style={{ display: 'block', color: C.ink3 }}>打ち手: {r.actions.join(' / ')}</span>}
                  {r.memo && <span style={{ display: 'block', color: C.ink3 }}>メモ: {r.memo}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// props:
//   todayIso, plan（normalizePlan）, planMissing, onSavePlan(plan) → Promise<bool>
//   weekly（admin_goal_weekly の返り値）, weeklyMissing, launchKpis（admin_launch_kpis）, targets（ローンチの目標 %）
//   salesRows（ops_sales_metrics）, salesMissing, paidNow, annualNow
//   reviews, reviewsMissing, onSaveReview(row) → Promise<bool>, onAddTask(action) → Promise<bool>
export default function GoalPanel({
  todayIso, plan, planMissing, onSavePlan, weekly, weeklyMissing, launchKpis, targets,
  salesRows, salesMissing, paidNow, annualNow, reviews, reviewsMissing, onSaveReview, onAddTask,
}) {
  const [chosen, setChosen] = useState({});
  const weeks = useMemo(() => normalizeWeeks(weekly?.rows), [weekly]);
  const status = useMemo(() => goalStatus({ plan, current: paidNow, todayIso, weeks, annualNow }), [plan, paidNow, todayIso, weeks, annualNow]);
  const rows = useMemo(() => funnelRows(weeks, launchKpis?.cohorts, salesRows), [weeks, launchKpis, salesRows]);
  const variants = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => { Object.keys(r.lpViewsBy || {}).forEach((k) => set.add(k)); Object.keys(r.lpClicksBy || {}).forEach((k) => set.add(k)); });
    return [...set].sort();
  }, [rows]);
  const stages = useMemo(() => evaluateStages({
    rows, todayIso, launchTotals: launchKpis?.totals, targets, shareUsers: weekly?.share_users_28d ?? null, paid: paidNow,
  }), [rows, todayIso, launchKpis, targets, weekly, paidNow]);
  const weakest = pickWeakest(stages);
  const seasons = useMemo(() => seasonView(todayIso), [todayIso]);
  const founding = useMemo(() => foundingView(weekly?.founding, todayIso), [weekly, todayIso]);

  return (
    <>
      <GoalProgress s={status} plan={plan} planMissing={planMissing} onSavePlan={onSavePlan} todayIso={todayIso} />

      <p style={sectionTitle}><Table2 {...icon} /><span id="funnel-title">毎週の流れ（直近 12 週）</span></p>
      {weeklyMissing ? <Missing file="supabase_admin_goal.sql" what="週ごとの流れ（LP → 登録 → 7 日間無料 → 有料 → 解約）" />
        : <FunnelTable rows={rows} variants={variants} sources={weekly?.sources} salesMissing={salesMissing} />}

      <Diagnosis stages={stages} weakest={weakest} status={status} onAddTask={onAddTask} chosen={chosen} setChosen={setChosen} />
      <Seasons seasons={seasons} founding={founding} />
      <WeeklyReview key={reviews.find((r) => String(r.week_start) === weekStartJst(todayIso))?.id || 'new'}
        todayIso={todayIso} status={status} weakest={weakest} chosen={chosen}
        reviews={reviews} reviewsMissing={reviewsMissing} onSaveReview={onSaveReview} />
    </>
  );
}
