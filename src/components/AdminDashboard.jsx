// 🎛️ AdminDashboard — 運営の操縦席（Founder Cockpit）。管理者専用。
//
// 単なる数字表示ではなく「いつ何をすべきか」を指示する操縦席:
//   1. 🎯 目標     — 売上/利用目標 ＋ 締切。現在地との差分から達成ペースを逆算。
//   2. 📋 今やるべきこと — 指標から自動生成される優先アクション（ファネル別）。
//      数字が動くと指示も軌道修正される（再読込のたびに再計算）。
//   3. 🎫 チケット — 顧客フィードバックから起票したバグ/要望＋手動タスクの作業ボード。
//   4. 📊 メトリクス — アクティブ/売上/AIコスト/機能別の利用状況。
//   5. 📩 問い合わせ受信箱 — フィードバックをさばく（ワンタップでチケット化）。
//
// データは supabase の SECURITY DEFINER RPC（supabase_admin_metrics.sql /
// supabase_admin_ops.sql）。RPC 側で is_app_admin() ゲート済み。

import { useState, useEffect, useCallback } from 'react';
import {
  X, RefreshCw, Target, ListChecks, Ticket, Users, CreditCard, Cpu, Inbox,
  BarChart3, TrendingUp, Check, Flag, Pencil, Route, Activity, Calculator,
  Brain, Send,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateOpsRoadmap, opsAdvise } from '../lib/ai';
import { C, btnPrimary, btnGhost } from '../styles/ui';
import Spinner from './Spinner';

// 💰 コストモデル（粗利の概算用）。ここは"目安"。
const MONTHLY_PRICE_JPY = 1480;     // 月額プランの税込価格（実価格）
// App 内課金（App Store / Google Play）の手数料。Apple 小規模事業者プログラム
// （年間売上 100万USD 未満）適用で 15%。Stripe(Web) は別物だが現状 App 決済が前提。
const PAYMENT_FEE_RATE = 0.15;
const AI_COST_PER_CALL_JPY = 4;     // AIコールあたりの概算原価（ローンチ後に実測で調整）

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000, background: C.pageBg,
  overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  paddingBottom: 'calc(40px + env(safe-area-inset-bottom))',
};
const header = {
  position: 'sticky', top: 0, zIndex: 2,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: 'calc(14px + env(safe-area-inset-top)) 18px 14px',
  background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  borderBottom: `1px solid ${C.hairline}`,
};
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 40, height: 40, borderRadius: 12, border: 'none',
  background: 'transparent', color: C.ink2, cursor: 'pointer',
};
const wrap = { maxWidth: 760, margin: '0 auto', padding: '18px' };
const sectionTitle = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 13, fontWeight: 700, color: C.ink, margin: '28px 0 12px',
  letterSpacing: '0.01em',
};
const card = {
  background: C.card, border: `1px solid ${C.hairline}`,
  borderRadius: 16, padding: 16,
};
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 };
const inp = {
  width: '100%', padding: '10px 12px', fontSize: 16, boxSizing: 'border-box',
  border: `1px solid ${C.hairlineStrong}`, borderRadius: 10, background: '#fff',
  color: C.ink, fontFamily: 'inherit',
};

const METRIC_LABEL = { gross_profit: '月次粗利（概算）', mrr: 'MRR（月次売上）', paid_users: '有料会員数', users: '総ユーザー数' };
const STAGE = { ACQ: '集客', ACT: '定着', REV: '収益化', RET: '継続', QUAL: '品質' };
const STAGE_COLOR = {
  集客: C.accent || C.brand, 定着: '#6b8e6b', 収益化: C.brand, 継続: '#b08a3e', 品質: C.critical,
};
// 🏢 常駐する4部門。各アクションを担当部門に割り当てて「誰の仕事か」を明確にする。
const DEPT = { CEO: '経営', MKT: 'マーケ営業', ENG: '開発', FIN: '経理' };
const DEPT_COLOR = { 経営: C.brand, マーケ営業: '#b08a3e', 開発: '#5a7d9a', 経理: '#6b8e6b' };
const DEPT_ORDER = ['経営', 'マーケ営業', '開発', '経理'];
const PRI_LABEL = { 1: '高', 2: '中', 3: '低' };
const PRI_COLOR = { 1: C.critical, 2: C.brand, 3: C.ink3 };
const CATEGORY_LABEL = { bug: '不具合', feature: '要望', ui: 'UI', question: '質問', thanks: '感謝', other: 'その他' };
const FB_STATUS_LABEL = { open: '未対応', in_progress: '対応中', resolved: '解決', wont_fix: '却下' };
const TICKET_STATUS_LABEL = { open: '未着手', in_progress: '対応中', done: '完了', wont_fix: '却下' };
const KIND_LABEL = { bug: '🐛 バグ', feature: '✨ 要望', task: '📌 タスク' };

function fmtGoal(metric, v) {
  const n = Math.max(0, Math.round(v));
  return metric === 'mrr' ? `¥${n.toLocaleString()}` : `${n.toLocaleString()}人`;
}

// AI ロードマップ用の軽量 Markdown レンダラ（## 見出し / ### 月 / - 箇条書き / **太字**）。
function boldify(s) {
  const parts = String(s).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**')
    ? <strong key={i} style={{ color: C.ink }}>{p.slice(2, -2)}</strong>
    : <span key={i}>{p}</span>));
}
function RoadmapMarkdown({ text }) {
  const lines = String(text || '').split('\n');
  const out = [];
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { out.push(<div key={i} style={{ height: 6 }} />); return; }
    if (line.startsWith('### ')) {
      out.push(<p key={i} style={{ margin: '14px 0 6px', fontSize: 14, fontWeight: 700, color: C.brand }}>{boldify(line.slice(4))}</p>);
    } else if (line.startsWith('## ')) {
      out.push(<p key={i} style={{ margin: '16px 0 6px', fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: '0.01em' }}>{boldify(line.slice(3))}</p>);
    } else if (/^[-・]\s/.test(line)) {
      out.push(<p key={i} style={{ margin: '3px 0 3px 4px', fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>{boldify(line.replace(/^[-・]\s/, '• '))}</p>);
    } else {
      out.push(<p key={i} style={{ margin: '3px 0', fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>{boldify(line)}</p>);
    }
  });
  return <div>{out}</div>;
}

function Stat({ label, value, sub }) {
  return (
    <div style={card}>
      <p style={{ margin: 0, fontSize: 11, color: C.ink2, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{value}</p>
      {sub != null && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.ink3 }}>{sub}</p>}
    </div>
  );
}

function BarList({ data }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p style={{ fontSize: 12, color: C.ink3, margin: 0 }}>データなし</p>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: '0 0 38%', fontSize: 12, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
          <span style={{ flex: 1, height: 8, background: C.soft, borderRadius: 99, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(v / max) * 100}%`, background: C.brand, borderRadius: 99 }} />
          </span>
          <span style={{ flex: '0 0 auto', fontSize: 12, fontWeight: 700, color: C.ink, minWidth: 32, textAlign: 'right' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function MiniBars({ series }) {
  if (!series || series.length === 0) return <p style={{ fontSize: 12, color: C.ink3, margin: 0 }}>データなし</p>;
  const max = Math.max(...series.map((d) => d.active), 1);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
        {series.map((d) => (
          <div key={d.d} title={`${d.d}: ${d.active}人 / 新規本${d.new_books}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ width: '100%', height: `${(d.active / max) * 100}%`, minHeight: d.active > 0 ? 3 : 0, background: C.brand, borderRadius: '3px 3px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: C.ink3 }}>
        <span>{series[0]?.d}</span><span>{series[series.length - 1]?.d}</span>
      </div>
    </div>
  );
}

// 指標から「今やるべきこと」を自動生成（ファネル別・優先度順）。
// 数字が動くと結果が変わる＝軌道修正される。
function buildActions({ overview, revenue, usage, ai, tickets, goal, gap, requiredPerWeek, mrr, grossProfit }) {
  const a = [];
  const ev = usage?.events || {};
  const users = overview?.users_total || 0;
  const paid = revenue?.active || 0;

  // 経営: 目標ペース
  if (goal && gap > 0 && requiredPerWeek > 0) {
    a.push({ dept: DEPT.CEO, stage: STAGE.REV, pri: 1, title: `目標まであと${fmtGoal(goal.metric, gap)} — 週 ${fmtGoal(goal.metric, requiredPerWeek)} ペースが必要`, why: `${METRIC_LABEL[goal.metric]}の達成ペース` });
  }
  // 経営: 目標未設定
  if (!goal) a.push({ dept: DEPT.CEO, stage: STAGE.REV, pri: 1, title: '売上/粗利の目標を設定する', why: '目標が未設定（達成ペースを逆算できない）' });

  // 開発: 未解決バグ
  const openBugs = (tickets || []).filter((t) => t.kind === 'bug' && (t.status === 'open' || t.status === 'in_progress'));
  if (openBugs.length) a.push({ dept: DEPT.ENG, stage: STAGE.QUAL, pri: 1, title: `バグを ${openBugs.length} 件修正する`, why: '未解決のバグチケット' });

  // マーケ営業: 有料0
  if (paid === 0 && users > 0) a.push({ dept: DEPT.MKT, stage: STAGE.REV, pri: 1, title: '最初の有料会員を獲得する', why: '登録はあるが有料会員が0人' });
  // マーケ営業: ペイウォール転換率
  const pv = ev.paywall_viewed || 0; const cc = ev.checkout_completed || 0;
  if (pv >= 10 && cc / pv < 0.05) {
    a.push({ dept: DEPT.MKT, stage: STAGE.REV, pri: 1, title: 'ペイウォールの訴求・価格を見直す', why: `表示${pv}回中 課金${cc}件（転換率 ${(cc / pv * 100).toFixed(1)}%）` });
  }
  // マーケ営業: 今週の新規0 / そもそも0人
  if (users === 0) a.push({ dept: DEPT.MKT, stage: STAGE.ACQ, pri: 1, title: '最初のユーザーを集める（告知・LP公開・SNS）', why: 'まだ登録ユーザーが0人' });
  else if ((overview?.new_users_7d || 0) === 0) a.push({ dept: DEPT.MKT, stage: STAGE.ACQ, pri: 1, title: '集客に着手（LP / SNS / 紹介）', why: '今週の新規ユーザーが0人' });

  // 開発/経営: 未対応FB
  if ((overview?.feedback_open || 0) > 0) {
    a.push({ dept: DEPT.ENG, stage: STAGE.QUAL, pri: 2, title: `未対応の問い合わせ ${overview.feedback_open} 件をさばく（チケット化）`, why: 'open のフィードバック' });
  }
  // マーケ営業: 解約リスク
  if ((revenue?.expiring_30d || 0) > 0) {
    a.push({ dept: DEPT.MKT, stage: STAGE.RET, pri: 2, title: `更新期限が近い有料会員 ${revenue.expiring_30d} 人をフォロー`, why: '30日以内に期限' });
  }
  // 開発: 粘着
  const dau = overview?.dau || 0; const mau = overview?.mau || 0;
  if (mau >= 10 && dau / mau < 0.1) {
    a.push({ dept: DEPT.ENG, stage: STAGE.RET, pri: 2, title: '毎日使われる仕掛けを強化（想起通知など）', why: `DAU/MAU ${(dau / mau * 100).toFixed(0)}%（粘着が弱い）` });
  }
  // 開発: 定着（1人あたり本）
  if (users >= 5) {
    const bpu = (overview?.books_total || 0) / users;
    if (bpu < 2) a.push({ dept: DEPT.ENG, stage: STAGE.ACT, pri: 2, title: 'オンボーディングを改善（最初の1冊登録まで）', why: `1人あたり本 ${bpu.toFixed(1)}冊` });
  }
  // 経理: 粗利率（売上はあるのに薄利）
  if (mrr > 0) {
    const margin = grossProfit / mrr;
    if (margin < 0.5) a.push({ dept: DEPT.FIN, stage: STAGE.QUAL, pri: 2, title: '粗利率が低い — 価格 or AI原価を見直す', why: `粗利率 ${(margin * 100).toFixed(0)}%（App手数料15%＋AI原価が重い）` });
  }
  // 経理: AIコスト（1人あたり）
  const calls = ai && ai[0] ? ai[0].calls : 0;
  const aiUsers = ai && ai[0] ? ai[0].users : 0;
  if (aiUsers > 0) {
    const costPerUser = (calls * AI_COST_PER_CALL_JPY) / aiUsers;
    if (costPerUser > 45) a.push({ dept: DEPT.FIN, stage: STAGE.QUAL, pri: 2, title: 'AI原価/人 が高い — 原価ガード（月次上限）を見直す', why: `今月のAI原価 約¥${Math.round(costPerUser)}/人（目安 ¥45 超）` });
  } else if (calls > 1000) {
    a.push({ dept: DEPT.FIN, stage: STAGE.QUAL, pri: 3, title: 'AIコストを点検（原価ガード）', why: `今月のAIコール ${calls}回` });
  }

  return a.sort((x, y) => x.pri - y.pri);
}

export default function AdminDashboard({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState(null);
  const [series, setSeries] = useState([]);
  const [usage, setUsage] = useState(null);
  const [ai, setAi] = useState([]);
  const [revenue, setRevenue] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [goal, setGoal] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [growth, setGrowth] = useState(null);
  // LTV/CAC 試算の前提（端末ローカルに保存）。月の集客費・想定継続月数。
  const [mktSpend, setMktSpend] = useState(() => { try { return localStorage.getItem('orime-ops-mkt-spend') || ''; } catch { return ''; } });
  const [lifeMonths, setLifeMonths] = useState(() => { try { return localStorage.getItem('orime-ops-life-months') || '12'; } catch { return '12'; } });
  const [fbFilter, setFbFilter] = useState('open');
  const [editingGoal, setEditingGoal] = useState(false);
  const [gMetric, setGMetric] = useState('mrr');
  const [gTarget, setGTarget] = useState('');
  const [gDeadline, setGDeadline] = useState('');
  const [roadmap, setRoadmap] = useState('');
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapErr, setRoadmapErr] = useState('');
  // 🧠 AI 参謀（作戦会議）の対話。
  const [advisorMsgs, setAdvisorMsgs] = useState([]);
  const [advisorInput, setAdvisorInput] = useState('');
  const [advisorBusy, setAdvisorBusy] = useState(false);

  const [warn, setWarn] = useState('');

  const load = useCallback(async (d) => {
    setLoading(true); setErr(''); setWarn('');
    // 各 RPC を独立に扱い、1つ失敗しても他は表示する（graceful degradation）。
    const [ov, se, us, au, rv, fb, gl, tk, gr] = await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.rpc('admin_active_series', { p_days: d }),
      supabase.rpc('admin_feature_usage', { p_days: d }),
      supabase.rpc('admin_ai_usage', { p_months: 6 }),
      supabase.rpc('admin_revenue'),
      supabase.rpc('admin_feedback', { p_status: null }),
      supabase.rpc('admin_get_goal'),
      supabase.rpc('admin_tickets'),
      supabase.rpc('admin_growth'),
    ]);
    const all = [ov, se, us, au, rv, fb, gl, tk];

    // 'not authorized' が出るなら管理者でない（全面エラー）。
    if (all.some((r) => r.error?.message === 'not authorized')) {
      setErr('この画面は管理者のみが閲覧できます。');
      setLoading(false);
      return;
    }
    // 全部失敗 = metrics SQL 未適用の可能性が高い。
    if (all.every((r) => r.error)) {
      setErr(`読み込みに失敗しました（supabase_admin_metrics.sql が未適用かも）。詳細: ${ov.error?.message || ''}`);
      setLoading(false);
      return;
    }

    setOverview(ov.error ? null : (ov.data || null));
    setSeries(se.error ? [] : (se.data || []));
    setUsage(us.error ? null : (us.data || null));
    setAi(au.error ? [] : (au.data || []));
    setRevenue(rv.error ? null : (rv.data || null));
    setFeedback(fb.error ? [] : (fb.data || []));
    setGoal(gl.error ? null : (gl.data || null));
    setTickets(tk.error ? [] : (tk.data || []));
    setGrowth(gr.error ? null : (gr.data || null));
    if (!gl.error && gl.data) { setGMetric(gl.data.metric); setGTarget(String(gl.data.target || '')); setGDeadline(gl.data.deadline || ''); }

    // 部分的に失敗したものを警告として可視化（原因切り分け用に実メッセージを出す）。
    const opsFailed = gl.error || tk.error;
    const metricFails = [ov, se, us, au, rv, fb].filter((r) => r.error);
    const notes = [];
    if (opsFailed) notes.push('🎯目標・🎫チケットが読めません → supabase_admin_ops.sql を適用してください');
    if (gr.error) notes.push('📈成長・継続率が読めません → supabase_admin_growth.sql を適用してください');
    if (metricFails.length) notes.push(`一部メトリクスが読めません（${metricFails[0].error?.message || '不明'}）`);
    setWarn(notes.join(' / '));
    setLoading(false);
  }, []);

  useEffect(() => { load(days); }, [load, days]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 🧠 作戦会議の履歴を復元（自分の行のみ・時系列）。
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('ops_advisor_messages')
          .select('id, role, content, created_at')
          .order('created_at', { ascending: true })
          .limit(200);
        if (alive && !error && Array.isArray(data)) setAdvisorMsgs(data);
      } catch { /* 未適用 DB 等は空のまま */ }
    })();
    return () => { alive = false; };
  }, []);

  // 保存済みロードマップを localStorage から復元（目標が変わったら破棄）。
  const goalSig = goal ? `${goal.metric}:${goal.target}:${goal.deadline}` : '';
  useEffect(() => {
    try {
      const raw = localStorage.getItem('orime-ops-roadmap');
      if (raw) {
        const o = JSON.parse(raw);
        if (o && o.sig === goalSig && o.text) { setRoadmap(o.text); return; }
      }
    } catch { /* ignore */ }
    setRoadmap('');
  }, [goalSig]);

  const saveGoal = async () => {
    const t = parseFloat(gTarget);
    if (!Number.isFinite(t) || t <= 0) return;
    await supabase.rpc('admin_set_goal', { p_metric: gMetric, p_target: t, p_deadline: gDeadline || null });
    setEditingGoal(false);
    load(days);
  };

  const triageFb = async (id, status) => {
    setFeedback((list) => list.map((f) => (f.id === id ? { ...f, status } : f)));
    const { error } = await supabase.rpc('admin_feedback_update', { p_id: id, p_status: status, p_note: null });
    if (error) load(days);
  };
  const ticketize = async (fbId) => {
    const { error } = await supabase.rpc('admin_ticket_from_feedback', { p_feedback_id: fbId });
    load(days);
    if (error) setErr('チケット化に失敗しました。');
  };
  const updateTicket = async (id, patch) => {
    setTickets((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.rpc('admin_ticket_update', { p_id: id, p_status: patch.status ?? null, p_priority: patch.priority ?? null });
    if (error) load(days);
  };

  // 💰 売上・粗利の概算。MRR = 有料会員 × 月額。粗利 = MRR − 決済手数料 − AI原価。
  const mrr = (revenue?.active || 0) * MONTHLY_PRICE_JPY;
  const aiCallsThisMonth = ai && ai[0] ? ai[0].calls : 0;
  const aiCostThisMonth = aiCallsThisMonth * AI_COST_PER_CALL_JPY;
  const grossProfit = Math.max(0, Math.round(mrr - mrr * PAYMENT_FEE_RATE - aiCostThisMonth));

  // 目標の現在地・ペース計算。
  const goalCurrent = goal
    ? (goal.metric === 'mrr' ? mrr
      : goal.metric === 'gross_profit' ? grossProfit
        : goal.metric === 'paid_users' ? (revenue?.active || 0)
          : (overview?.users_total || 0))
    : 0;
  const goalGap = goal ? Math.max(0, (goal.target || 0) - goalCurrent) : 0;
  const goalProgress = goal && goal.target > 0 ? Math.min(1, goalCurrent / goal.target) : 0;
  let daysLeft = null; let requiredPerWeek = 0;
  if (goal?.deadline) {
    const ms = new Date(goal.deadline).getTime() - Date.now();
    daysLeft = Math.ceil(ms / 86400000);
    if (daysLeft > 0 && goalGap > 0) requiredPerWeek = Math.ceil(goalGap / (daysLeft / 7));
  }

  const actions = (!loading && !err)
    ? buildActions({ overview, revenue, usage, ai, tickets, goal, gap: goalGap, requiredPerWeek, mrr, grossProfit })
    : [];
  // 部門ごとの担当件数（常駐ロスター表示用）。
  const deptCounts = DEPT_ORDER.reduce((m, d) => ({ ...m, [d]: actions.filter((x) => x.dept === d).length }), {});
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
  const shownFeedback = feedback.filter((f) => (fbFilter === 'all' ? true : f.status === fbFilter));

  // 📈 ファネル（登録→課金到達→課金→継続）。
  const ev2 = usage?.events || {};
  const paidActive = revenue?.active || 0;
  const funnel = [
    { label: '登録ユーザー', n: overview?.users_total || 0 },
    { label: 'ペイウォール到達', n: ev2.paywall_viewed || 0 },
    { label: '課金完了', n: ev2.checkout_completed || 0 },
    { label: '継続中(有料)', n: paidActive },
  ];
  // 🔁 継続率（N日後も残っている率）。
  const ret = growth?.retention;
  const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null);
  const retD1 = ret ? pct(ret.d1_num, ret.d1_den) : null;
  const retD7 = ret ? pct(ret.d7_num, ret.d7_den) : null;
  const retD30 = ret ? pct(ret.d30_num, ret.d30_den) : null;
  // 💹 ユニットエコノミクス。
  const gpPerUser = paidActive > 0 ? grossProfit / paidActive : 0;     // 粗利/人・月
  const lm = Math.max(1, parseInt(lifeMonths, 10) || 12);
  const ltv = Math.round(gpPerUser * lm);                              // LTV（粗利ベース）
  const spend = Math.max(0, parseFloat(mktSpend) || 0);
  const newPaidThisMonth = growth?.paid_new_this_month || 0;
  const cac = newPaidThisMonth > 0 ? Math.round(spend / newPaidThisMonth) : null;
  const ltvCac = cac && cac > 0 ? (ltv / cac) : null;
  const paybackMonths = (cac && gpPerUser > 0) ? (cac / gpPerUser) : null;

  // 🧠 現状サマリー（参謀に毎回渡す）。
  const stateLine = [
    `総ユーザー${overview?.users_total ?? 0}人`,
    `有料${revenue?.active ?? 0}人`,
    `MRR¥${mrr.toLocaleString()}`,
    `月粗利¥${grossProfit.toLocaleString()}`,
    goal ? `目標=${METRIC_LABEL[goal.metric]}¥${(goal.target || 0).toLocaleString()}(締切${goal.deadline || '未設定'})` : '目標=未設定',
  ].join(' / ');

  // 🧠 作戦会議: 元帥の発言を送り、参謀の応答を得て、両方を保存する。
  const sendAdvisor = async () => {
    const text = advisorInput.trim();
    if (!text || advisorBusy) return;
    setAdvisorBusy(true);
    setAdvisorInput('');
    const userMsg = { role: 'user', content: text, id: `local-${advisorMsgs.length}` };
    const next = [...advisorMsgs, userMsg];
    setAdvisorMsgs(next);
    // ユーザー発言を保存（fire-and-forget）。
    supabase.from('ops_advisor_messages').insert({ role: 'user', content: text }).then(() => {});
    try {
      const reply = await opsAdvise({ messages: next, stateLine });
      if (reply) {
        setAdvisorMsgs((cur) => [...cur, { role: 'assistant', content: reply, id: `local-a-${cur.length}` }]);
        supabase.from('ops_advisor_messages').insert({ role: 'assistant', content: reply }).then(() => {});
      } else {
        setAdvisorMsgs((cur) => [...cur, { role: 'assistant', content: '（応答に失敗しました。少し時間をおいて再度お試しください）', id: `err-${cur.length}` }]);
      }
    } catch {
      setAdvisorMsgs((cur) => [...cur, { role: 'assistant', content: '（応答に失敗しました）', id: `err-${cur.length}` }]);
    } finally {
      setAdvisorBusy(false);
    }
  };

  // 🗺 AI にロードマップを引いてもらう（年の目標→月別の人数/売上/施策）。
  const makeRoadmap = async () => {
    if (!goal || roadmapLoading) return;
    setRoadmapLoading(true); setRoadmapErr('');
    const monthsLeft = daysLeft != null ? Math.max(1, Math.round(daysLeft / 30)) : 12;
    try {
      const md = await generateOpsRoadmap({
        goalLabel: METRIC_LABEL[goal.metric], target: goal.target, deadline: goal.deadline || '',
        monthsLeft, price: MONTHLY_PRICE_JPY, feeRate: PAYMENT_FEE_RATE,
        currentPaid: revenue?.active || 0, currentUsers: overview?.users_total || 0, mrr, grossProfit,
      });
      if (md) {
        setRoadmap(md);
        try { localStorage.setItem('orime-ops-roadmap', JSON.stringify({ sig: goalSig, text: md })); } catch { /* ignore */ }
      } else {
        setRoadmapErr('ロードマップの生成に失敗しました。少し時間をおいて再度お試しください。');
      }
    } catch {
      setRoadmapErr('ロードマップの生成に失敗しました。');
    } finally {
      setRoadmapLoading(false);
    }
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="運営ダッシュボード">
      <div style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={20} strokeWidth={1.75} color={C.ink} />
          <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>運営の操縦席</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button type="button" style={iconBtn} onClick={() => load(days)} aria-label="再読み込み" disabled={loading}>
            <RefreshCw size={18} strokeWidth={1.75} />
          </button>
          <button type="button" style={iconBtn} onClick={onClose} aria-label="閉じる"><X size={20} strokeWidth={1.75} /></button>
        </div>
      </div>

      <div style={wrap}>
        {loading && <div style={{ padding: '60px 0' }}><Spinner /></div>}
        {!loading && err && <div style={{ ...card, marginTop: 20, color: C.critical, fontSize: 13, lineHeight: 1.7 }}>{err}</div>}
        {!loading && !err && warn && (
          <div style={{ ...card, marginTop: 16, marginBottom: 4, color: '#8a6d3b', background: '#fdf6e3', border: '1px solid #efe2c0', fontSize: 12, lineHeight: 1.7 }}>⚠️ {warn}</div>
        )}

        {!loading && !err && (
          <>
            {/* ── 🎯 目標 ── */}
            <p style={sectionTitle}><Target size={15} strokeWidth={2} /> 目標</p>
            <div style={card}>
              {editingGoal || !goal ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(METRIC_LABEL).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setGMetric(k)}
                        style={{ padding: '8px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${gMetric === k ? 'transparent' : C.hairlineStrong}`,
                          background: gMetric === k ? C.brand : 'transparent', color: gMetric === k ? C.brandInk : C.ink2 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: C.ink2, fontWeight: 600 }}>目標値{gMetric === 'mrr' ? '（円）' : '（人）'}</label>
                      <input type="number" inputMode="numeric" value={gTarget} onChange={(e) => setGTarget(e.target.value)} placeholder={gMetric === 'mrr' ? '300000' : '300'} style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: C.ink2, fontWeight: 600 }}>締切（任意）</label>
                      <input type="date" value={gDeadline} onChange={(e) => setGDeadline(e.target.value)} style={inp} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={saveGoal} style={{ ...btnPrimary, minHeight: 44 }}>目標を保存</button>
                    {goal && <button type="button" onClick={() => setEditingGoal(false)} style={{ ...btnGhost, minHeight: 44 }}>キャンセル</button>}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: C.ink2, fontWeight: 600 }}>{METRIC_LABEL[goal.metric]}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
                        {fmtGoal(goal.metric, goalCurrent)} <span style={{ fontSize: 14, color: C.ink3, fontWeight: 600 }}>/ {fmtGoal(goal.metric, goal.target)}</span>
                      </p>
                    </div>
                    <button type="button" onClick={() => setEditingGoal(true)} style={iconBtn} aria-label="目標を編集"><Pencil size={16} /></button>
                  </div>
                  <div style={{ height: 8, background: C.soft, borderRadius: 99, overflow: 'hidden', margin: '12px 0 8px' }}>
                    <div style={{ height: '100%', width: `${goalProgress * 100}%`, background: C.brand, borderRadius: 99 }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: C.ink2 }}>
                    達成 {Math.round(goalProgress * 100)}%
                    {daysLeft != null && <> ・ 締切まで {daysLeft > 0 ? `${daysLeft}日` : '超過'}</>}
                    {requiredPerWeek > 0 && <> ・ <strong style={{ color: C.brand }}>週 {fmtGoal(goal.metric, requiredPerWeek)} 必要</strong></>}
                    {goalGap === 0 && <strong style={{ color: '#6b8e6b' }}> ・ 達成！🎉</strong>}
                  </p>
                </>
              )}
            </div>

            {/* ── 🗺 ロードマップ（AIが年の目標から月別計画を引く） ── */}
            <p style={sectionTitle}><Route size={15} strokeWidth={2} /> ロードマップ</p>
            <div style={card}>
              {!goal ? (
                <p style={{ margin: 0, fontSize: 13, color: C.ink3, lineHeight: 1.7 }}>
                  まず上で目標を設定すると、AI が現状から逆算して「月別の目標人数・売上・やること（マーケ営業／システム）」のロードマップを引きます。
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" onClick={makeRoadmap} disabled={roadmapLoading} style={{ ...btnPrimary, width: 'auto', minHeight: 44, opacity: roadmapLoading ? 0.6 : 1 }}>
                      <Route size={16} aria-hidden="true" />
                      {roadmapLoading ? 'AIが作成中…' : (roadmap ? 'ロードマップを引き直す' : 'AIにロードマップを引いてもらう')}
                    </button>
                    <span style={{ fontSize: 11, color: C.ink3 }}>現状の人数・売上・粗利を踏まえて逆算します</span>
                  </div>
                  {roadmapErr && <p style={{ margin: '10px 0 0', fontSize: 12, color: C.critical }}>{roadmapErr}</p>}
                  {roadmap && (
                    <div style={{ marginTop: 14, borderTop: `1px solid ${C.hairline}`, paddingTop: 12 }}>
                      <RoadmapMarkdown text={roadmap} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── 🧠 作戦会議（AI参謀との対話） ── */}
            <p style={sectionTitle}><Brain size={15} strokeWidth={2} /> 作戦会議（AI参謀）</p>
            <div style={card}>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: C.ink2, lineHeight: 1.7 }}>
                経営・マーケ営業・開発・経理の4頭脳に相談できます。現状の数字とこれまでの文脈を踏まえ、対話で打ち手を一緒に作ります（会話は保存されます）。
              </p>
              {advisorMsgs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {advisorMsgs.map((m) => (
                    <div key={m.id || m.created_at} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '88%', padding: '10px 12px', borderRadius: 14, fontSize: 13, lineHeight: 1.7,
                        background: m.role === 'user' ? C.brand : C.soft,
                        color: m.role === 'user' ? C.brandInk : C.ink,
                        borderTopRightRadius: m.role === 'user' ? 4 : 14,
                        borderTopLeftRadius: m.role === 'user' ? 14 : 4,
                        whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal', wordBreak: 'break-word',
                      }}>
                        {m.role === 'assistant' ? <RoadmapMarkdown text={m.content} /> : m.content}
                      </div>
                    </div>
                  ))}
                  {advisorBusy && <p style={{ fontSize: 12, color: C.ink3, margin: 0 }}>参謀が検討中…</p>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={advisorInput}
                  onChange={(e) => setAdvisorInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendAdvisor(); } }}
                  placeholder="例: 最初の10人をどう集める？ / 価格は¥1,480で妥当？ / 来月の優先順位は？"
                  rows={2}
                  style={{ ...inp, resize: 'vertical', minHeight: 44, lineHeight: 1.6, flex: 1 }}
                />
                <button type="button" onClick={sendAdvisor} disabled={advisorBusy || !advisorInput.trim()}
                  aria-label="送信"
                  style={{ flex: '0 0 auto', width: 48, height: 48, borderRadius: 12, border: 'none', background: C.brand, color: C.brandInk, cursor: advisorBusy || !advisorInput.trim() ? 'default' : 'pointer', opacity: advisorBusy || !advisorInput.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={18} />
                </button>
              </div>
            </div>

            {/* ── 📋 今やるべきこと ── */}
            <p style={sectionTitle}><ListChecks size={15} strokeWidth={2} /> 今やるべきこと</p>
            {/* 🏢 常駐ロスター: 4部門が常に在席。各部門の担当アクション件数を表示。 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {DEPT_ORDER.map((d) => (
                <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#fff', background: DEPT_COLOR[d], borderRadius: 99, padding: '4px 10px', opacity: deptCounts[d] ? 1 : 0.45 }}>
                  {d}<span style={{ fontSize: 10, background: 'rgba(255,255,255,0.28)', borderRadius: 99, minWidth: 16, textAlign: 'center', padding: '0 4px' }}>{deptCounts[d]}</span>
                </span>
              ))}
            </div>
            {actions.length === 0 ? (
              <div style={{ ...card, color: '#6b8e6b', fontSize: 13, fontWeight: 600 }}>順調です。今すぐ手を打つべき指標はありません 👍</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actions.map((act, i) => (
                  <div key={i} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: DEPT_COLOR[act.dept] || C.brand, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>{act.dept}</span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: C.ink3 }}>{act.stage}</span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{act.title}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, color: C.ink3 }}>根拠: {act.why}</p>
                    </div>
                    <Flag size={14} color={PRI_COLOR[act.pri]} aria-label={`優先度${PRI_LABEL[act.pri]}`} style={{ flex: '0 0 auto', marginTop: 3 }} />
                  </div>
                ))}
              </div>
            )}

            {/* ── 🎫 チケット ── */}
            <p style={sectionTitle}>
              <Ticket size={15} strokeWidth={2} /> チケット
              {openTickets.length > 0 && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, color: C.brandInk, background: C.brand, borderRadius: 99, padding: '1px 8px' }}>未完 {openTickets.length}</span>}
            </p>
            {tickets.length === 0 ? (
              <div style={{ ...card, color: C.ink3, fontSize: 13 }}>チケットはまだありません。下の「問い合わせ」からバグ/要望をチケット化できます。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tickets.map((t) => (
                  <div key={t.id} style={{ ...card, opacity: (t.status === 'done' || t.status === 'wont_fix') ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{KIND_LABEL[t.kind] || t.kind}</span>
                      <Flag size={12} color={PRI_COLOR[t.priority]} aria-label={`優先度${PRI_LABEL[t.priority]}`} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: t.status === 'open' ? C.critical : C.ink3 }}>{TICKET_STATUS_LABEL[t.status] || t.status}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.title}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {t.status !== 'in_progress' && t.status !== 'done' && <button type="button" onClick={() => updateTicket(t.id, { status: 'in_progress' })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 34, padding: '7px 12px', fontSize: 12 }}>対応中</button>}
                      {t.status !== 'done' && <button type="button" onClick={() => updateTicket(t.id, { status: 'done' })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 34, padding: '7px 12px', fontSize: 12 }}>完了</button>}
                      <button type="button" onClick={() => updateTicket(t.id, { priority: t.priority === 1 ? 2 : 1 })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 34, padding: '7px 12px', fontSize: 12 }}>{t.priority === 1 ? '優先度↓' : '優先度↑'}</button>
                      {t.status !== 'wont_fix' && t.status !== 'done' && <button type="button" onClick={() => updateTicket(t.id, { status: 'wont_fix' })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 34, padding: '7px 12px', fontSize: 12, color: C.ink3 }}>却下</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 期間トグル ＋ メトリクス ── */}
            <p style={sectionTitle}><Users size={15} strokeWidth={2} /> アクティブ人数</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[7, 30, 90].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${days === d ? 'transparent' : C.hairlineStrong}`,
                    background: days === d ? C.brand : 'transparent', color: days === d ? C.brandInk : C.ink2 }}>{d}日</button>
              ))}
            </div>
            <div style={grid3}>
              <Stat label="DAU" value={overview?.dau ?? 0} />
              <Stat label="WAU" value={overview?.wau ?? 0} />
              <Stat label="MAU" value={overview?.mau ?? 0} />
            </div>
            <div style={{ ...grid2, marginTop: 10 }}>
              <Stat label="総ユーザー" value={overview?.users_total ?? 0} sub={`新規 +${overview?.new_users_30d ?? 0}（30日）`} />
              <Stat label="新規（7日）" value={`+${overview?.new_users_7d ?? 0}`} />
            </div>
            <div style={{ ...card, marginTop: 10 }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>日次アクティブ（直近{days}日）</p>
              <MiniBars series={series} />
            </div>

            <p style={sectionTitle}><CreditCard size={15} strokeWidth={2} /> 売上・粗利</p>
            <div style={grid3}>
              <Stat label="有料会員" value={revenue?.active ?? 0} />
              <Stat label="MRR（概算）" value={`¥${mrr.toLocaleString()}`} sub={`× ¥${MONTHLY_PRICE_JPY.toLocaleString()}/月`} />
              <Stat label="30日内に期限" value={revenue?.expiring_30d ?? 0} sub="要更新" />
            </div>
            <div style={{ ...card, marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 11, color: C.ink2, fontWeight: 600 }}>月次粗利（概算）</p>
              <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>¥{grossProfit.toLocaleString()}</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: C.ink3, lineHeight: 1.6 }}>
                売上 ¥{mrr.toLocaleString()} − App手数料({(PAYMENT_FEE_RATE * 100).toFixed(0)}%) ¥{Math.round(mrr * PAYMENT_FEE_RATE).toLocaleString()} − AI原価 ¥{aiCostThisMonth.toLocaleString()}（{aiCallsThisMonth}コール×¥{AI_COST_PER_CALL_JPY}）
                <br />※ App内課金（Apple小規模事業者プログラム 15%）想定の直接原価ベース。人件費・固定費は含みません。係数は実測で調整。
              </p>
            </div>

            {/* ── 📈 ファネル ＆ 継続率 ＆ ユニットエコノミクス ── */}
            <p style={sectionTitle}><Activity size={15} strokeWidth={2} /> ファネル（登録→課金→継続）</p>
            <div style={card}>
              {(() => {
                const top = funnel[0].n || 1;
                return funnel.map((s, i) => {
                  const prev = i > 0 ? (funnel[i - 1].n || 0) : null;
                  const stepConv = prev != null && prev > 0 ? Math.round((s.n / prev) * 100) : null;
                  return (
                    <div key={s.label} style={{ marginBottom: i < funnel.length - 1 ? 10 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: C.ink, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ color: C.ink2 }}>
                          <strong style={{ color: C.ink }}>{s.n}</strong>
                          {stepConv != null && <span style={{ color: C.ink3, marginLeft: 6 }}>（前段比 {stepConv}%）</span>}
                        </span>
                      </div>
                      <div style={{ height: 8, background: C.soft, borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(2, (s.n / top) * 100)}%`, background: C.brand, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <p style={sectionTitle}><Users size={15} strokeWidth={2} /> 継続率（N日後も残っている率）</p>
            <div style={grid3}>
              <Stat label="D1継続" value={retD1 != null ? `${retD1}%` : '—'} sub={ret ? `${ret.d1_num}/${ret.d1_den}人` : '蓄積中'} />
              <Stat label="D7継続" value={retD7 != null ? `${retD7}%` : '—'} sub={ret ? `${ret.d7_num}/${ret.d7_den}人` : '蓄積中'} />
              <Stat label="D30継続" value={retD30 != null ? `${retD30}%` : '—'} sub={ret ? `${ret.d30_num}/${ret.d30_den}人` : '蓄積中'} />
            </div>
            {(!ret || ret.d1_den === 0) && (
              <p style={{ margin: '8px 2px 0', fontSize: 11, color: C.ink3, lineHeight: 1.6 }}>※ 利用データが貯まると自動で算出されます（登録から日数が経った人が対象）。</p>
            )}

            <p style={sectionTitle}><Calculator size={15} strokeWidth={2} /> ユニットエコノミクス（LTV / CAC）</p>
            <div style={card}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={{ fontSize: 11, color: C.ink2, fontWeight: 600 }}>今月の集客費用（円）</label>
                  <input type="number" inputMode="numeric" value={mktSpend}
                    onChange={(e) => { setMktSpend(e.target.value); try { localStorage.setItem('orime-ops-mkt-spend', e.target.value); } catch { /* ignore */ } }}
                    placeholder="例: 30000" style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={{ fontSize: 11, color: C.ink2, fontWeight: 600 }}>想定継続月数</label>
                  <input type="number" inputMode="numeric" value={lifeMonths}
                    onChange={(e) => { setLifeMonths(e.target.value); try { localStorage.setItem('orime-ops-life-months', e.target.value); } catch { /* ignore */ } }}
                    placeholder="12" style={inp} />
                </div>
              </div>
              <div style={grid3}>
                <Stat label="LTV（粗利）" value={`¥${ltv.toLocaleString()}`} sub={`粗利¥${Math.round(gpPerUser).toLocaleString()}/人 × ${lm}ヶ月`} />
                <Stat label="CAC" value={cac != null ? `¥${cac.toLocaleString()}` : '—'} sub={newPaidThisMonth > 0 ? `今月有料${newPaidThisMonth}人` : '今月の有料0'} />
                <Stat label="LTV:CAC" value={ltvCac != null ? `${ltvCac.toFixed(1)}` : '—'} sub="目安 3以上" />
              </div>
              <p style={{ margin: '10px 2px 0', fontSize: 11, color: C.ink3, lineHeight: 1.7 }}>
                {paybackMonths != null ? `回収期間 約${paybackMonths.toFixed(1)}ヶ月。` : ''}
                LTV:CAC ≥ 3 / 回収 ≤ 12ヶ月 が健全の目安。集客費は手入力（この端末に保存）。粗利ベースの概算です。
              </p>
            </div>

            <p style={sectionTitle}><Cpu size={15} strokeWidth={2} /> AIコスト / API消費</p>
            <div style={card}>
              {ai.length === 0 ? <p style={{ fontSize: 12, color: C.ink3, margin: 0 }}>まだ利用がありません。</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ai.map((m) => (
                    <div key={m.month} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{m.month}</span>
                      <span style={{ fontSize: 12, color: C.ink2 }}><strong style={{ color: C.ink }}>{m.calls.toLocaleString()}</strong> コール / {m.users}人</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p style={sectionTitle}><TrendingUp size={15} strokeWidth={2} /> 機能別の利用状況（直近{days}日）</p>
            <div style={card}>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>イベント別</p>
              <BarList data={usage?.events} />
            </div>
            <div style={{ ...grid2, marginTop: 10 }}>
              <div style={card}><p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>AI 機能</p><BarList data={usage?.ai_features} /></div>
              <div style={card}><p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>本の追加経路</p><BarList data={usage?.book_via} /></div>
            </div>

            {/* ── 📩 問い合わせ受信箱 ── */}
            <p style={sectionTitle}>
              <Inbox size={15} strokeWidth={2} /> 問い合わせ・フィードバック
              {overview?.feedback_open > 0 && <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, color: C.brandInk, background: C.brand, borderRadius: 99, padding: '1px 8px' }}>未対応 {overview.feedback_open}</span>}
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['open', '未対応'], ['in_progress', '対応中'], ['resolved', '解決'], ['all', 'すべて']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setFbFilter(k)}
                  style={{ padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${fbFilter === k ? 'transparent' : C.hairlineStrong}`,
                    background: fbFilter === k ? C.brand : 'transparent', color: fbFilter === k ? C.brandInk : C.ink2 }}>{label}</button>
              ))}
            </div>
            {shownFeedback.length === 0 ? (
              <div style={{ ...card, color: C.ink3, fontSize: 13 }}>該当する問い合わせはありません。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shownFeedback.map((f) => (
                  <div key={f.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.ink2, background: C.soft, borderRadius: 6, padding: '2px 8px' }}>{CATEGORY_LABEL[f.category] || f.category}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: f.status === 'open' ? C.critical : C.ink3 }}>{FB_STATUS_LABEL[f.status] || f.status}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: C.ink3 }}>{String(f.created_at).slice(0, 10)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.content}</p>
                    {(f.name || f.email) && <p style={{ margin: '8px 0 0', fontSize: 11, color: C.ink3 }}>{f.name || '（匿名）'}{f.email ? ` · ${f.email}` : ''}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => ticketize(f.id)} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 34, padding: '7px 12px', fontSize: 12, color: C.brand, fontWeight: 700 }}>🎫 チケット化</button>
                      {f.status !== 'in_progress' && <button type="button" onClick={() => triageFb(f.id, 'in_progress')} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 34, padding: '7px 12px', fontSize: 12 }}>対応中</button>}
                      {f.status !== 'resolved' && <button type="button" onClick={() => triageFb(f.id, 'resolved')} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 34, padding: '7px 12px', fontSize: 12 }}>解決</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
