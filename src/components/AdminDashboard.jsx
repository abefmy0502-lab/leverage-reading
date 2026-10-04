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
// supabase_admin_ops.sql / supabase_admin_launch_kpis.sql）。RPC 側で is_app_admin() ゲート済み。
// 概況タブのいちばん上は「ローンチの 4 つの数字」（admin/LaunchKpiCard.jsx・docs/launch-kpis.md）。

import { useState, useEffect, useCallback, useRef } from 'react';
import { FOUNDING_PRICE_YEN } from '../lib/foundingOffer';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  X, RefreshCw, Target, ListChecks, Ticket, Users, CreditCard, Cpu, Inbox,
  BarChart3, TrendingUp, Check, Flag, Pencil, Activity, Calculator,
  Brain, Send, Rocket, Megaphone, AlertTriangle, PenLine,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { opsAdvise } from '../lib/ai';
import { C, btnPrimary, btnGhost } from '../styles/ui';
import Spinner from './Spinner';
import TodayCard from './admin/TodayCard';
import LaunchKpiCard from './admin/LaunchKpiCard';
import { DATE_HINT } from '../lib/dateHint';
import { todayLocal } from '../lib/dates';
import {
  evaluateRules, SALES_MILESTONES, SHIP_CHECKLIST, MIN_N, weekStartISO, monthlyMilestoneNeed,
} from '../lib/playbook';

// 💰 コストモデル（粗利の概算用）。ここは"目安"。
const MONTHLY_PRICE_JPY = 1480;     // 月額プランの税込価格（実価格）
// 創業メンバー価格（年額の初回価格 1 年目 ¥9,800・period_type 'intro'）の月あたり（MRR の概算用・2026-10-02）。
const FOUNDING_MONTHLY_JPY = Math.round(FOUNDING_PRICE_YEN / 12);
// App 内課金（App Store / Google Play）の手数料。Apple 小規模事業者プログラム
// （年間売上 100万USD 未満）適用で 15%。Stripe(Web) は別物だが現状 App 決済が前提。
const PAYMENT_FEE_RATE = 0.15;
const AI_COST_PER_CALL_JPY = 4;     // AIコールあたりの概算原価（ローンチ後に実測で調整）

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000, background: C.pageBg,
  overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  paddingBottom: 'calc(var(--space-10) + env(safe-area-inset-bottom))',
};
const header = {
  position: 'sticky', top: 0, zIndex: 2,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: 'calc(var(--space-2) + env(safe-area-inset-top)) var(--space-2) var(--space-2) var(--space-4)',
  background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  borderBottom: '1px solid var(--separator)',
};
const iconBtn = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 44, height: 44, borderRadius: 'var(--radius)', border: 'none',
  background: 'transparent', color: C.ink2, cursor: 'pointer',
};
const wrap = { maxWidth: 760, margin: '0 auto', padding: 'var(--space-4)' };
const sectionTitle = {
  display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  fontSize: 'var(--text-meta)', fontWeight: 600, color: C.ink, margin: 'var(--space-8) 0 var(--space-3)',
  letterSpacing: '0.01em',
};
const card = {
  background: C.card, border: `1px solid ${C.hairline}`,
  borderRadius: 'var(--radius)', padding: 'var(--space-4)',
};
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)' };
const inp = {
  width: '100%', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-body)', boxSizing: 'border-box',
  border: `1px solid ${C.hairlineStrong}`, borderRadius: 'var(--radius)', background: 'var(--surface)',
  color: C.ink, fontFamily: 'inherit',
};

const METRIC_LABEL = { gross_profit: '月次粗利（概算）', mrr: 'MRR（月次売上）', paid_users: '有料会員数', users: '総ユーザー数' };
// 🏢 常駐する4部門。各アクションを担当部門に割り当てて「誰の仕事か」を明確にする。
const DEPT = { CEO: '経営', MKT: 'マーケ営業', ENG: '開発', FIN: '経理' };
const DEPT_ORDER = ['経営', 'マーケ営業', '開発', '経理'];
const PRI_LABEL = { 1: '高', 2: '中', 3: '低' };
const PRI_COLOR = { 1: C.critical, 2: C.brand, 3: C.ink3 };
const CATEGORY_LABEL = { bug: '不具合', feature: '要望', ui: 'UI', question: '質問', thanks: '感謝', other: 'その他' };
const FB_STATUS_LABEL = { open: '未対応', in_progress: '対応中', resolved: '解決', wont_fix: '却下' };
const TICKET_STATUS_LABEL = { open: '未着手', in_progress: '対応中', done: '完了', wont_fix: '却下' };
const KIND_LABEL = { bug: 'バグ', feature: '要望', task: 'タスク' };

// ローカル一意 ID（チャットメッセージの React key 用・履歴の uuid と衝突しない）。
let _uidCounter = 0;
function uid() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* fall through */ }
  _uidCounter += 1;
  return `local-${_uidCounter}-${Date.now()}`;
}

function fmtGoal(metric, v) {
  const n = Math.max(0, Math.round(v));
  // mrr / gross_profit は金額（円）、paid_users / users は人数。
  return (metric === 'mrr' || metric === 'gross_profit') ? `¥${n.toLocaleString()}` : `${n.toLocaleString()}人`;
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
      out.push(<p key={i} style={{ margin: '14px 0 6px', fontSize: 'var(--text-meta)', fontWeight: 700, color: C.brand }}>{boldify(line.slice(4))}</p>);
    } else if (line.startsWith('## ')) {
      out.push(<p key={i} style={{ margin: '16px 0 6px', fontSize: 'var(--text-meta)', fontWeight: 700, color: C.ink, letterSpacing: '0.01em' }}>{boldify(line.slice(3))}</p>);
    } else if (/^[-・]\s/.test(line)) {
      out.push(<p key={i} style={{ margin: '3px 0 3px 4px', fontSize: 'var(--text-meta)', color: C.ink2, lineHeight: 1.6 }}>{boldify(line.replace(/^[-・]\s/, '• '))}</p>);
    } else {
      out.push(<p key={i} style={{ margin: '3px 0', fontSize: 'var(--text-meta)', color: C.ink2, lineHeight: 1.7 }}>{boldify(line)}</p>);
    }
  });
  return <div>{out}</div>;
}

function Stat({ label, value, sub }) {
  return (
    <div style={card}>
      <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 'var(--text-title)', fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>{value}</p>
      {sub != null && <p style={{ margin: '4px 0 0', fontSize: 'var(--text-caption)', color: C.ink3 }}>{sub}</p>}
    </div>
  );
}

function BarList({ data }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p style={{ fontSize: 'var(--text-caption)', color: C.ink3, margin: 0 }}>データなし</p>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: '0 0 38%', fontSize: 'var(--text-caption)', color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
          <span style={{ flex: 1, height: 8, background: C.soft, borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(v / max) * 100}%`, background: C.brand, borderRadius: 'var(--radius-full)' }} />
          </span>
          <span style={{ flex: '0 0 auto', fontSize: 'var(--text-caption)', fontWeight: 700, color: C.ink, minWidth: 32, textAlign: 'right' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function MiniBars({ series }) {
  if (!series || series.length === 0) return <p style={{ fontSize: 'var(--text-caption)', color: C.ink3, margin: 0 }}>データなし</p>;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 'var(--text-caption)', color: C.ink3 }}>
        <span>{series[0]?.d}</span><span>{series[series.length - 1]?.d}</span>
      </div>
    </div>
  );
}


export default function AdminDashboard({ onClose }) {
  const trapRef = useFocusTrap(true); // ♿ Tab をダッシュボード内に閉じ込める
  // 上に貼りつく題の行の高さ（タブの行をその下に貼りつける＝半分隠れない・2026-10-04 ui-critic）。
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const measure = () => setHeaderH(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
  // 🚀 ローンチの 4 つの数字（supabase_admin_launch_kpis.sql）。missing = RPC が無い。
  const [launchKpis, setLaunchKpis] = useState(null);
  const [launchKpisMissing, setLaunchKpisMissing] = useState(false);
  // LTV/CAC 試算の前提（端末ローカルに保存）。月の集客費・想定継続月数。
  const [mktSpend, setMktSpend] = useState(() => { try { return localStorage.getItem('orime-ops-mkt-spend') || ''; } catch { return ''; } });
  const [lifeMonths, setLifeMonths] = useState(() => { try { return localStorage.getItem('orime-ops-life-months') || '12'; } catch { return '12'; } });
  const [fbFilter, setFbFilter] = useState('open');
  const [editingGoal, setEditingGoal] = useState(false);
  const [gMetric, setGMetric] = useState('mrr');
  const [gTarget, setGTarget] = useState('');
  const [gDeadline, setGDeadline] = useState('');
  // 🧠 AI 参謀（作戦会議）の対話。
  const [advisorMsgs, setAdvisorMsgs] = useState([]);
  const [advisorInput, setAdvisorInput] = useState('');
  const [advisorBusy, setAdvisorBusy] = useState(false);
  // タブ（概況 / 営業 / アクション / 参謀）。
  const [activeTab, setActiveTab] = useState('overview');

  // 🚀 運用フェーズ（配信前/配信中）。手動切替・不可逆（自動昇格は誤検知するため禁止）。
  const [phase, setPhase] = useState(() => { try { return localStorage.getItem('orime-ops-phase') || 'prelaunch'; } catch { return 'prelaunch'; } });
  const [launchDate, setLaunchDate] = useState(() => { try { return localStorage.getItem('orime-ops-launch-date') || ''; } catch { return ''; } });
  const [shipChecks, setShipChecks] = useState(() => { try { return JSON.parse(localStorage.getItem('orime-ops-ship-checks') || '{}'); } catch { return {}; } });
  const toggleShipCheck = (id) => {
    setShipChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem('orime-ops-ship-checks', JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  };
  const goLive = () => {
    // 不可逆の切替なので確認を挟む。配信日は未入力なら今日。
    if (!window.confirm('配信中モードに切り替えますか？（KPI計器と判定ルールが有効になります。元に戻す想定はありません）')) return;
    const d = launchDate || todayLocal();
    setLaunchDate(d); setPhase('live');
    try { localStorage.setItem('orime-ops-phase', 'live'); localStorage.setItem('orime-ops-launch-date', d); } catch { /* quota */ }
  };

  // ── 📣 営業ウィークリー入力（installs/note PV 等は外部数値のため手入力）──
  const SALES_FIELDS = [
    ['new_paid', '新規課金', '人'],
    ['installs', 'インストール', '件'],
    ['lp_clicks', 'LPクリック', '回'],
    ['note_pv', 'note PV', ''],
    ['x_profile_clicks', 'Xプロフクリック', '回'],
  ];
  const [salesRows, setSalesRows] = useState([]);           // 直近の週次実績（新しい順）
  const [salesForm, setSalesForm] = useState({});           // 今週の入力
  const [salesSaving, setSalesSaving] = useState(false);
  const [salesMissing, setSalesMissing] = useState(false);  // テーブル未適用
  const [salesLoaded, setSalesLoaded] = useState(false);

  const loadSales = async () => {
    try {
      const { data, error } = await supabase
        .from('ops_sales_metrics')
        .select('*')
        .order('week_start', { ascending: false })
        .limit(12);
      if (error) throw error;
      setSalesMissing(false);
      const rows = data || [];
      setSalesRows(rows);
      const cur = rows.find((r) => r.week_start === weekStartISO());
      if (cur) {
        const f = {};
        SALES_FIELDS.forEach(([k]) => { f[k] = cur[k] ?? ''; });
        f.memo = cur.memo || '';
        setSalesForm(f);
      }
    } catch (e) {
      // 42P01 = relation does not exist（マイグレーション未適用）
      if (e?.code === '42P01' || /does not exist/i.test(e?.message || '')) setSalesMissing(true);
    } finally {
      setSalesLoaded(true);
    }
  };
  // TodayCard の判定にも使うためマウント時に読み込む。
  useEffect(() => { loadSales(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const saveSalesWeek = async () => {
    if (salesSaving) return;
    setSalesSaving(true);
    try {
      const row = { week_start: weekStartISO(), updated_at: new Date().toISOString() };
      SALES_FIELDS.forEach(([k]) => {
        const v = parseInt(salesForm[k], 10);
        row[k] = Number.isFinite(v) && v >= 0 ? v : null;
      });
      row.memo = (salesForm.memo || '').slice(0, 500) || null;
      const { error } = await supabase
        .from('ops_sales_metrics')
        .upsert(row, { onConflict: 'user_id,week_start' });
      if (error) throw error;
      await loadSales();
    } catch { /* RLS/未適用時は下の案内カードが出ている */ }
    setSalesSaving(false);
  };


  // 🗓 タスク（手動追加のみ）。
  const [dailyTasks, setDailyTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [taskAdding, setTaskAdding] = useState(false);

  const [warn, setWarn] = useState('');

  const load = useCallback(async (d) => {
    setLoading(true); setErr(''); setWarn('');
    // 各 RPC を独立に扱い、1つ失敗しても他は表示する（graceful degradation）。
    const [ov, se, us, au, rv, fb, gl, tk, gr, lk] = await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.rpc('admin_active_series', { p_days: d }),
      supabase.rpc('admin_feature_usage', { p_days: d }),
      supabase.rpc('admin_ai_usage', { p_months: 6 }),
      supabase.rpc('admin_revenue'),
      supabase.rpc('admin_feedback', { p_status: null }),
      supabase.rpc('admin_get_goal'),
      supabase.rpc('admin_tickets'),
      supabase.rpc('admin_growth'),
      supabase.rpc('admin_launch_kpis', { p_weeks: 8 }),
    ]);
    const all = [ov, se, us, au, rv, fb, gl, tk, gr, lk];

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
    // jsonb numeric は文字列で届くことがあるため target を数値に正規化。
    setGoal(gl.error || !gl.data ? null : { ...gl.data, target: Number(gl.data.target) || 0 });
    setTickets(tk.error ? [] : (tk.data || []));
    setGrowth(gr.error ? null : (gr.data || null));
    setLaunchKpis(lk.error ? null : (lk.data || null));
    setLaunchKpisMissing(!!lk.error);
    if (!gl.error && gl.data) { setGMetric(gl.data.metric); setGTarget(String(gl.data.target || '')); setGDeadline(gl.data.deadline || ''); }

    // 部分的に失敗したものを警告として可視化（原因切り分け用に実メッセージを出す）。
    const opsFailed = gl.error || tk.error;
    const metricFails = [ov, se, us, au, rv, fb].filter((r) => r.error);
    const notes = [];
    if (opsFailed) notes.push('目標・チケットが読めません → supabase_admin_ops.sql を適用してください');
    if (gr.error) notes.push('成長・継続率が読めません → supabase_admin_growth.sql を適用してください');
    if (lk.error) notes.push('ローンチの 4 つの数字が読めません → supabase_admin_launch_kpis.sql を適用してください');
    if (metricFails.length) notes.push(`一部メトリクスが読めません（${metricFails[0].error?.message || '不明'}）`);
    setWarn(notes.join(' / '));
    setLoading(false);
  }, []);

  useEffect(() => { load(days); }, [load, days]);
  useEffect(() => {
    // IME 変換中の Esc はガード（変換キャンセルで参謀チャットの下書きを失わない）。
    const onKey = (e) => { if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) onClose?.(); };
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

  // 🗓 日次タスクを復元（今日以降を優先・自分の行のみ）。
  const loadTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('ops_tasks')
        .select('id, due_date, dept, title, done')
        .order('due_date', { ascending: true })
        .limit(300);
      if (!error && Array.isArray(data)) setDailyTasks(data);
    } catch { /* 未適用 DB は空 */ }
  }, []);
  useEffect(() => { loadTasks(); }, [loadTasks]);

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

  // 💰 売上・粗利の概算。MRR = 有料会員 × 月額（創業メンバー価格の人は ¥9,800 ÷ 12）。粗利 = MRR − 決済手数料 − AI原価。
  //   founding は admin_revenue の内訳（supabase_admin_members_tasks.sql・未適用の古い定義なら 0＝従来どおり）。
  const foundingPaid = Math.min(revenue?.founding || 0, revenue?.active || 0);
  const mrr = ((revenue?.active || 0) - foundingPaid) * MONTHLY_PRICE_JPY + foundingPaid * FOUNDING_MONTHLY_JPY;
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

  // 📕 if-then ルールの一括評価（playbook.js が正典。営業タブ・TodayCard が共用）。
  const rulesEval = (!loading && !err)
    ? evaluateRules({ phase, weekly: salesRows, paid: revenue?.active || 0, events: usage?.events || {} })
    : [];
  const salesAlerts = rulesEval.filter((r) => r.state === 'fired');
  const rulesPending = rulesEval.filter((r) => r.state === 'insufficient');
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

  // 🧠 現状サマリー（参謀に毎回渡す）。判定保留の指標は値でなく「保留」と伝え、
  // AI が薄いデータから誤った提案を導かないようにする。
  const stateLine = [
    `フェーズ=${phase === 'prelaunch' ? '配信前' : '配信中'}`,
    `総ユーザー${overview?.users_total ?? 0}人`,
    `有料${revenue?.active ?? 0}人`,
    `MRR¥${mrr.toLocaleString()}`,
    `月粗利¥${grossProfit.toLocaleString()}`,
    goal ? `目標=${METRIC_LABEL[goal.metric]}¥${(goal.target || 0).toLocaleString()}(締切${goal.deadline || '未設定'})` : '目標=未設定',
    salesAlerts.length ? `発火中の警告=${salesAlerts.map((r) => r.text).join('；')}` : '発火中の警告なし',
    rulesPending.length ? `判定保留(分母不足・値からの推測禁止)=${rulesPending.map((r) => r.id).join(',')}` : '',
  ].filter(Boolean).join(' / ');

  // 🧠 作戦会議: 元帥の発言を送り、参謀の応答を得て、両方を保存する。
  const sendAdvisor = async () => {
    const text = advisorInput.trim();
    if (!text || advisorBusy) return;
    setAdvisorBusy(true);
    setAdvisorInput('');
    const userMsg = { role: 'user', content: text, id: uid() };
    const next = [...advisorMsgs, userMsg];
    setAdvisorMsgs(next);
    // ユーザー発言を保存（fire-and-forget）。
    supabase.from('ops_advisor_messages').insert({ role: 'user', content: text }).then(() => {});
    try {
      const reply = await opsAdvise({ messages: next, stateLine });
      if (reply) {
        setAdvisorMsgs((cur) => [...cur, { role: 'assistant', content: reply, id: uid() }]);
        supabase.from('ops_advisor_messages').insert({ role: 'assistant', content: reply }).then(() => {});
      } else {
        setAdvisorMsgs((cur) => [...cur, { role: 'assistant', content: '（応答に失敗しました。少し時間をおいて再度お試しください）', id: uid() }]);
      }
    } catch {
      setAdvisorMsgs((cur) => [...cur, { role: 'assistant', content: '（応答に失敗しました）', id: uid() }]);
    } finally {
      setAdvisorBusy(false);
    }
  };

  // 🗓 タスクは手動追加のみ（AI 30日生成は廃止 — 台本と司令が正典。タスクは例外事項の置き場）。
  const addTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || taskAdding) return;
    setTaskAdding(true);
    try {
      const { error } = await supabase.from('ops_tasks')
        .insert({ due_date: todayLocal(), dept: '経営', title: title.slice(0, 200) });
      if (!error) { setNewTaskTitle(''); await loadTasks(); }
    } finally { setTaskAdding(false); }
  };
  const toggleTask = async (t) => {
    setDailyTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    const { error } = await supabase.from('ops_tasks').update({ done: !t.done }).eq('id', t.id);
    if (error) loadTasks();
  };

  return (
    <div ref={trapRef} style={overlay} role="dialog" aria-modal="true" aria-label="運営ダッシュボード">
      <div ref={headerRef} style={header}>
        {/* 題の行はアプリの上の行と同じ組み立て（文字 17/600・左右 16・トークン・2026-10-04 ui-critic）。 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
          <BarChart3 size="1.2em" strokeWidth={1.75} color={C.ink} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: C.ink }}>運営の操縦席</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button type="button" style={iconBtn} onClick={() => load(days)} aria-label="再読み込み" disabled={loading}>
            <RefreshCw size={18} strokeWidth={1.75} />
          </button>
          <button type="button" style={iconBtn} onClick={onClose} aria-label="閉じる"><X size={20} strokeWidth={1.75} /></button>
        </div>
      </div>

      <div style={wrap}>
        {loading && <div style={{ padding: 'var(--space-16) 0' }}><Spinner /></div>}
        {!loading && err && <div style={{ ...card, marginTop: 'var(--space-4)', color: 'var(--error)', fontSize: 'var(--text-meta)', lineHeight: 1.7 }}>{err}</div>}
        {!loading && !err && warn && (
          <div style={{ ...card, marginTop: 'var(--space-4)', marginBottom: 'var(--space-1)', color: 'var(--text)', background: 'var(--warning-soft)', border: 'none', fontSize: 'var(--text-meta)', lineHeight: 1.7 }}>{warn}</div>
        )}

        {!loading && !err && (
          <>
            {/* 🎯 今日の一手 — 開いた瞬間に今日の最重要アクションが決まる1枚（常設） */}
            <TodayCard phase={phase} launchDate={launchDate} weekly={salesRows} rules={rulesEval} shipChecks={shipChecks} />

            {/* タブ: 概況 / 営業 / アクション / 参謀 */}
            {/* 題の行の下に貼りつける（top＝題の行の高さ）。名前は文字だけ・高さ 44・600・トークン（2026-10-04 ui-critic）。
                選んでいるタブはアプリの切り替え（.sub-tabs）と同じ --accent-soft の面＋--accent の文字。 */}
            <div role="tablist" aria-label="運営ダッシュボードの表示" style={{ display: 'flex', gap: 'var(--space-2)', position: 'sticky', top: headerH, padding: 'var(--space-2) 0 var(--space-3)', background: 'var(--bg)', zIndex: 1 }}>
              {[['overview', '概況'], ['sales', '営業'], ['action', 'アクション'], ['advisor', '参謀']].map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={activeTab === k} onClick={() => setActiveTab(k)}
                  style={{ flex: 1, minHeight: 44, padding: '0 var(--space-1)', borderRadius: 'var(--radius)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                    border: 'none',
                    background: activeTab === k ? 'var(--accent-soft)' : 'transparent', color: activeTab === k ? 'var(--accent)' : 'var(--text-2)' }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ═══ 概況タブ（前半: 目標） ═══ */}
            {activeTab === 'overview' && (<>
            {/* ── 🚀 ローンチの 4 つの数字（2026-10-02 オーナー承認・いちばん上） ── */}
            <LaunchKpiCard data={launchKpis} missing={launchKpisMissing} />

            {/* ── 🎯 目標 ── */}
            <p style={sectionTitle}><Target size={15} strokeWidth={2} /> 目標</p>
            <div style={card}>
              {editingGoal || !goal ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(METRIC_LABEL).map(([k, label]) => (
                      <button key={k} type="button" onClick={() => setGMetric(k)}
                        style={{ padding: '8px 12px', borderRadius: 'var(--radius)', fontSize: 'var(--text-caption)', fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${gMetric === k ? 'transparent' : C.hairlineStrong}`,
                          background: gMetric === k ? C.brand : 'transparent', color: gMetric === k ? C.brandInk : C.ink2 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>目標値{gMetric === 'mrr' ? '（円）' : '（人）'}</label>
                      <input type="number" inputMode="numeric" value={gTarget} onChange={(e) => setGTarget(e.target.value)} placeholder={gMetric === 'mrr' ? '300000' : '300'} style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>締切（任意）</label>
                      <input type="date" value={gDeadline} data-empty={gDeadline ? undefined : DATE_HINT} onChange={(e) => setGDeadline(e.target.value)} style={inp} />
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
                      <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>{METRIC_LABEL[goal.metric]}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 'var(--text-title)', fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
                        {fmtGoal(goal.metric, goalCurrent)} <span style={{ fontSize: 'var(--text-meta)', color: C.ink3, fontWeight: 600 }}>/ {fmtGoal(goal.metric, goal.target)}</span>
                      </p>
                    </div>
                    <button type="button" onClick={() => setEditingGoal(true)} style={iconBtn} aria-label="目標を編集"><Pencil size={16} /></button>
                  </div>
                  <div style={{ height: 8, background: C.soft, borderRadius: 'var(--radius-full)', overflow: 'hidden', margin: '12px 0 8px' }}>
                    <div style={{ height: '100%', width: `${goalProgress * 100}%`, background: C.brand, borderRadius: 'var(--radius-full)' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: C.ink2 }}>
                    達成 {Math.round(goalProgress * 100)}%
                    {daysLeft != null && <> ・ 締切まで {daysLeft > 0 ? `${daysLeft}日` : '超過'}</>}
                    {requiredPerWeek > 0 && <> ・ <strong style={{ color: C.brand }}>週 {fmtGoal(goal.metric, requiredPerWeek)} 必要</strong></>}
                    {goalGap === 0 && <strong style={{ color: 'var(--success)' }}> ・ 達成</strong>}
                  </p>
                </>
              )}
            </div>

            </>)}

            {/* ═══ 参謀タブ（作戦会議 ＋ ロードマップ） ═══ */}
            {/* ═══ 📣 営業タブ — 週次KPI・マイルストーン・警告（戦略のダッシュボード化） ═══ */}
            {activeTab === 'sales' && (<>
              <p style={sectionTitle}><Megaphone size="1em" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} /> マイルストーン進捗</p>
              <div style={card}>
                {(() => {
                  const active = revenue?.active ?? null;
                  const now = new Date(); const ymKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const cur = SALES_MILESTONES.find(([k]) => k >= ymKey) || SALES_MILESTONES[SALES_MILESTONES.length - 1];
                  // 有料が MIN_N.pace 未満の間は % を出さない（1人動くだけで大きく振れて誤誘導するため実数のみ）。
                  const pace = active != null && cur && active >= MIN_N.pace ? Math.round((active / cur[1]) * 100) : null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 'var(--text-meta)', color: C.ink }}>
                        現在の有料会員: <b style={{ fontSize: 'var(--text-heading)' }}>{active ?? '—'}</b> 人
                        　/　直近目標（{cur[0]}）: <b>{cur[1]}</b> 人
                        {pace != null && <span style={{ marginLeft: 8, fontWeight: 700, color: pace >= 80 ? 'var(--success)' : pace >= 40 ? 'var(--warning)' : 'var(--error)' }}>ペース {pace}%</span>}
                        {pace == null && active != null && cur && <span style={{ marginLeft: 8, fontSize: 'var(--text-caption)', color: C.ink3 }}>（あと {Math.max(0, cur[1] - active)}人。% は有料{MIN_N.pace}人から表示）</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {SALES_MILESTONES.map(([k, v]) => (
                          <span key={k} style={{ fontSize: 'var(--text-caption)', padding: '3px 8px', borderRadius: 'var(--radius-full)', border: `1px solid ${C.hairlineStrong}`, color: active != null && active >= v ? 'var(--success)' : C.ink2, background: active != null && active >= v ? 'var(--success-soft)' : 'transparent', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                            {k}: {v}人{active != null && active >= v ? <Check size="1em" strokeWidth={2.5} aria-label="達成" /> : null}
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: 'var(--text-caption)', color: C.ink3, margin: '4px 0 0' }}>目標線は company/sales-strategy-2026-2027.md §5。改訂したらコードの SALES_MILESTONES も更新。</p>
                    </div>
                  );
                })()}
              </div>

              {salesMissing ? (
                <div style={{ ...card, background: 'var(--warning-soft)', border: 'none' }}>
                  <p style={{ fontSize: 'var(--text-caption)', color: C.ink2, margin: 0, lineHeight: 1.7 }}>
                    週次トラッキングは未セットアップです。Supabase SQL Editor で <b>supabase_ops_sales_metrics.sql</b> を実行すると、このタブで週次KPIの記録と警告判定ができるようになります。
                  </p>
                </div>
              ) : (<>
                {salesAlerts.length > 0 && (
                  <>
                    <p style={sectionTitle}><AlertTriangle size="1em" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} /> 判断ルールに該当</p>
                    {salesAlerts.map((a) => (
                      <div key={a.id} style={{ ...card, border: 'none', background: a.id.startsWith('gate_') ? 'var(--success-soft)' : 'var(--error-soft)' }}>
                        <p style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: a.id.startsWith('gate_') ? 'var(--success)' : 'var(--error)', margin: '0 0 var(--space-1)' }}>{a.text}</p>
                        <p style={{ fontSize: 'var(--text-caption)', color: C.ink2, margin: 0, lineHeight: 1.6 }}>→ {a.action}</p>
                      </div>
                    ))}
                  </>
                )}

                {rulesPending.length > 0 && (
                  <p style={{ fontSize: 'var(--text-caption)', color: C.ink3, margin: '10px 2px 0', lineHeight: 1.6 }}>
                    ⏳ 判定保留 {rulesPending.length} 件（分母不足・収集中）: {rulesPending.map((r) => r.text).join(' / ')}
                  </p>
                )}

                <p style={sectionTitle}><PenLine size="1em" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} /> 今週の数字（週の起点: {weekStartISO()}）</p>
                <div style={card}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {SALES_FIELDS.map(([k, label]) => (
                      <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-caption)', color: C.ink2 }}>
                        {label}
                        <input type="number" inputMode="numeric" min={0} max={9999999} value={salesForm[k] ?? ''} onChange={(e) => setSalesForm((f) => ({ ...f, [k]: e.target.value }))} style={inp} placeholder="—" />
                      </label>
                    ))}
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-caption)', color: C.ink2 }}>
                      メモ（任意）
                      <input type="text" maxLength={500} value={salesForm.memo ?? ''} onChange={(e) => setSalesForm((f) => ({ ...f, memo: e.target.value }))} style={inp} placeholder="気づき一言" />
                    </label>
                  </div>
                  <button type="button" onClick={saveSalesWeek} disabled={salesSaving} style={{ ...btnPrimary, minHeight: 44, marginTop: 12, opacity: salesSaving ? 0.6 : 1 }}>
                    {salesSaving ? '保存中…' : '今週の数字を保存'}
                  </button>
                  <p style={{ fontSize: 'var(--text-caption)', color: C.ink3, margin: '8px 0 0', lineHeight: 1.6 }}>
                    出どころ: 新規課金=下の売上欄 / インストール=App Store Connect / LPクリック=note・XのUTM / note PV=noteダッシュボード / Xプロフクリック=Xアナリティクス。日曜の週次レビュー（20分）で入力。
                  </p>
                </div>

                {salesRows.length > 0 && (
                  <>
                    <p style={sectionTitle}><TrendingUp size="1em" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} /> 直近8週</p>
                    <div style={{ ...card, overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-caption)', width: '100%', minWidth: 560 }}>
                        <thead>
                          <tr style={{ color: C.ink2, textAlign: 'right' }}>
                            <th style={{ textAlign: 'left', padding: '4px 6px' }}>週</th>
                            {SALES_FIELDS.map(([k, label]) => <th key={k} style={{ padding: '4px 6px', fontWeight: 600 }}>{label}</th>)}
                            <th style={{ padding: '4px 6px', fontWeight: 600 }}>note CTR</th>
                            <th style={{ padding: '4px 6px', fontWeight: 600 }}>課金率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesRows.slice(0, 8).map((r) => {
                            const ctr = r.note_pv > 0 && r.lp_clicks != null ? `${(100 * r.lp_clicks / r.note_pv).toFixed(1)}%` : '—';
                            const cvr = r.installs > 0 && r.new_paid != null ? `${(100 * r.new_paid / r.installs).toFixed(1)}%` : '—';
                            return (
                              <tr key={r.week_start} style={{ color: C.ink, textAlign: 'right', borderTop: `1px solid ${C.hairline}` }}>
                                <td style={{ textAlign: 'left', padding: '5px 6px', whiteSpace: 'nowrap' }}>{String(r.week_start).slice(5)}〜</td>
                                {SALES_FIELDS.map(([k]) => <td key={k} style={{ padding: '5px 6px' }}>{r[k] ?? '—'}</td>)}
                                <td style={{ padding: '5px 6px' }}>{ctr}</td>
                                <td style={{ padding: '5px 6px' }}>{cvr}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>)}
            </>)}

            {activeTab === 'advisor' && (<>
            {/* ── 🧠 作戦会議（AI参謀との対話） ── */}
            <p style={sectionTitle}><Brain size={15} strokeWidth={2} /> 作戦会議（AI参謀）</p>
            <div style={card}>
              <p style={{ margin: '0 0 12px', fontSize: 'var(--text-caption)', color: C.ink2, lineHeight: 1.7 }}>
                経営・マーケ営業・開発・経理の4頭脳に相談できます。現状の数字とこれまでの文脈を踏まえ、対話で打ち手を一緒に作ります（会話は保存されます）。
              </p>
              {advisorMsgs.length > 0 && (
                <div role="log" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {advisorMsgs.map((m) => (
                    <div key={m.id || m.created_at} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '88%', padding: '10px 12px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-meta)', lineHeight: 1.7,
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
                  {advisorBusy && <p aria-live="polite" style={{ fontSize: 'var(--text-caption)', color: C.ink3, margin: 0 }}>参謀が検討中…</p>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={advisorInput}
                  onChange={(e) => setAdvisorInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendAdvisor(); } }}
                  placeholder="例：最初の10人をどう集める？ / 価格は¥1,480で妥当？ / 来月の優先順位は？"
                  rows={2}
                  style={{ ...inp, resize: 'vertical', minHeight: 44, lineHeight: 1.6, flex: 1 }}
                />
                <button type="button" onClick={sendAdvisor} disabled={advisorBusy || !advisorInput.trim()}
                  aria-label="送信"
                  style={{ flex: '0 0 auto', width: 48, height: 48, borderRadius: 'var(--radius)', border: 'none', background: C.brand, color: C.brandInk, cursor: advisorBusy || !advisorInput.trim() ? 'default' : 'pointer', opacity: advisorBusy || !advisorInput.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={18} />
                </button>
              </div>
            </div>

            </>)}

            {/* ═══ アクションタブ（タスク ＋ チケット ＋ 受信箱） ═══ */}
            {activeTab === 'action' && (<>
            {/* ── 🗓 タスク（手動追加のみ。日々の背骨は「今日の台本」が担う） ── */}
            <p style={sectionTitle}><ListChecks size={15} strokeWidth={2} /> タスク（例外事項の置き場）</p>
            <div style={card}>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.6 }}>
                毎日のルーチンは上の「今日の台本」が正典。ここには台本に無い単発の用事だけを置く。
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: dailyTasks.length ? 12 : 0 }}>
                <input type="text" value={newTaskTitle} maxLength={200}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTask(); } }}
                  placeholder="例: 審査リジェクトの返信を書く" style={{ ...inp, flex: 1 }} />
                <button type="button" onClick={addTask} disabled={taskAdding || !newTaskTitle.trim()}
                  style={{ ...btnPrimary, width: 'auto', minHeight: 44, padding: '0 16px', opacity: (taskAdding || !newTaskTitle.trim()) ? 0.5 : 1 }}>追加</button>
              </div>
              {(() => {
                const todayStr = todayLocal();
                const upcoming = dailyTasks.filter((t) => t.due_date >= todayStr || !t.done).slice(0, 60);
                if (upcoming.length === 0) return null;
                return upcoming.map((t) => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0' }}>
                    <button type="button" onClick={() => toggleTask(t)} aria-label={t.done ? '未完了に戻す' : '完了'}
                      style={{ flex: '0 0 auto', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 44, minHeight: 44, margin: 'calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-3))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: t.done ? 'var(--success)' : C.hairlineStrong }}>
                      {t.done ? <Check size={18} /> : <span style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${C.hairlineStrong}`, borderRadius: 'var(--radius)' }} />}
                    </button>
                    <span style={{ flex: 1, fontSize: 'var(--text-meta)', color: t.done ? C.ink3 : C.ink, textDecoration: t.done ? 'line-through' : 'none', lineHeight: 1.5 }}>{t.title}</span>
                    <span style={{ flex: '0 0 auto', fontSize: 'var(--text-caption)', color: C.ink3, marginTop: 2 }}>{t.due_date}</span>
                  </div>
                ));
              })()}
            </div>

            {/* ── 🎫 チケット ── */}
            <p style={sectionTitle}>
              <Ticket size={15} strokeWidth={2} /> チケット
              {openTickets.length > 0 && <span style={{ marginLeft: 4, fontSize: 'var(--text-caption)', fontWeight: 700, color: C.brandInk, background: C.brand, borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>未完 {openTickets.length}</span>}
            </p>
            {tickets.length === 0 ? (
              <div style={{ ...card, color: C.ink3, fontSize: 'var(--text-meta)' }}>チケットはまだありません。下の「問い合わせ」からバグ/要望をチケット化できます。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tickets.map((t) => (
                  <div key={t.id} style={{ ...card, opacity: (t.status === 'done' || t.status === 'wont_fix') ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700 }}>{KIND_LABEL[t.kind] || t.kind}</span>
                      <Flag size={12} color={PRI_COLOR[t.priority]} aria-label={`優先度${PRI_LABEL[t.priority]}`} />
                      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: t.status === 'open' ? C.critical : C.ink3 }}>{TICKET_STATUS_LABEL[t.status] || t.status}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: C.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.title}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {t.status !== 'in_progress' && t.status !== 'done' && <button type="button" onClick={() => updateTicket(t.id, { status: 'in_progress' })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-caption)' }}>対応中</button>}
                      {t.status !== 'done' && <button type="button" onClick={() => updateTicket(t.id, { status: 'done' })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-caption)' }}>完了</button>}
                      <button type="button" onClick={() => updateTicket(t.id, { priority: t.priority === 1 ? 2 : 1 })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-caption)' }}>{t.priority === 1 ? '優先度↓' : '優先度↑'}</button>
                      {t.status !== 'wont_fix' && t.status !== 'done' && <button type="button" onClick={() => updateTicket(t.id, { status: 'wont_fix' })} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-caption)', color: C.ink3 }}>却下</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            </>)}

            {/* ═══ 概況タブ（後半: 配信前=出荷チェックリスト / 配信中=KPI計器） ═══ */}
            {activeTab === 'overview' && phase === 'prelaunch' && (<>
            {/* ── 🚢 出荷チェックリスト（配信前の主役。チェックはこの端末に保存） ── */}
            <p style={sectionTitle}><Rocket size={15} strokeWidth={2} /> 出荷チェックリスト
              <span style={{ fontWeight: 600, color: C.ink3, fontSize: 'var(--text-caption)' }}>　残り {SHIP_CHECKLIST.filter((c) => !shipChecks[c.id]).length} 件</span>
            </p>
            <div style={card}>
              {SHIP_CHECKLIST.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0' }}>
                  <button type="button" onClick={() => toggleShipCheck(c.id)} aria-label={shipChecks[c.id] ? '未完了に戻す' : '完了'}
                    style={{ flex: '0 0 auto', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 44, minHeight: 44, margin: 'calc(-1 * var(--space-3)) 0 calc(-1 * var(--space-3)) calc(-1 * var(--space-3))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: shipChecks[c.id] ? 'var(--success)' : C.hairlineStrong }}>
                    {shipChecks[c.id] ? <Check size={18} /> : <span style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${C.hairlineStrong}`, borderRadius: 'var(--radius)' }} />}
                  </button>
                  <span style={{ flex: 1, fontSize: 'var(--text-meta)', color: shipChecks[c.id] ? C.ink3 : C.ink, textDecoration: shipChecks[c.id] ? 'line-through' : 'none', lineHeight: 1.55 }}>{c.title}</span>
                </div>
              ))}
            </div>

            {/* ── 🔌 計測配線チェック（KPI の土台。イベントが 1 件でも入れば ✅） ── */}
            <p style={sectionTitle}><Activity size={15} strokeWidth={2} /> 計測配線チェック</p>
            <div style={card}>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.6 }}>
                TestFlight / 実機で操作して、各イベントが届くか確認する（直近{days}日の実カウント）。
              </p>
              {['app_open', 'signup_source', 'book_added', 'memo_added', 'paywall_viewed', 'checkout_started', 'checkout_completed', 'recall_shown', 'push_enabled'].map((ev) => {
                const n = usage?.events?.[ev] || 0;
                return (
                  <div key={ev} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 'var(--text-caption)' }}>
                    <span style={{ color: C.ink, fontFamily: 'ui-monospace, monospace' }}>{ev}</span>
                    <span style={{ fontWeight: 700, color: n > 0 ? 'var(--success)' : C.ink3, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>{n > 0 ? <><Check size="1em" strokeWidth={2.5} aria-label="届いた" />{n}</> : '0件'}</span>
                  </div>
                );
              })}
            </div>

            {/* ── 🚀 配信開始の切替 ── */}
            <div style={{ ...card, marginTop: 18 }}>
              <p style={{ margin: '0 0 8px', fontSize: 'var(--text-caption)', fontWeight: 700, color: C.ink, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}><Rocket size="1em" strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />App Store 配信を開始したら</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <label style={{ fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>配信日</label>
                  <input type="date" value={launchDate} data-empty={launchDate ? undefined : DATE_HINT} onChange={(e) => setLaunchDate(e.target.value)} style={inp} />
                </div>
                <button type="button" onClick={goLive} style={{ ...btnPrimary, width: 'auto', minHeight: 44 }}>配信中モードに切替</button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.6 }}>切り替えると KPI 計器と if-then 判定が有効になり、W1〜W4 ローンチスプリントが今日の一手に反映されます。</p>
            </div>
            </>)}

            {activeTab === 'overview' && phase === 'live' && (<>
            {/* ── 期間トグル ＋ メトリクス ── */}
            <p style={sectionTitle}><Users size={15} strokeWidth={2} /> アクティブ人数</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[7, 30, 90].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius)', fontSize: 'var(--text-caption)', fontWeight: 700, cursor: 'pointer',
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
              <p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>日次アクティブ（直近{days}日）</p>
              <MiniBars series={series} />
            </div>

            <p style={sectionTitle}><CreditCard size={15} strokeWidth={2} /> 会員・売上</p>
            {/* 会員内訳: 有料(課金中・無料期間除く) / 無料期間(トライアル) / 解約(累計) */}
            <div style={grid3}>
              <Stat label="有料会員" value={revenue?.active ?? 0} sub="課金中（無料期間除く）" />
              <Stat label="無料期間" value={revenue?.trial ?? 0} sub="トライアル中" />
              <Stat label="解約（累計）" value={revenue?.canceled ?? 0} sub="会員数に含めない" />
            </div>
            <div style={{ ...grid2, marginTop: 10 }}>
              <Stat label="MRR（概算）" value={`¥${mrr.toLocaleString()}`} sub={foundingPaid > 0
                ? `有料 ${(revenue?.active ?? 0) - foundingPaid}人 × ¥${MONTHLY_PRICE_JPY.toLocaleString()}＋創業 ${foundingPaid}人 × ¥${FOUNDING_MONTHLY_JPY.toLocaleString()}`
                : `有料 ${revenue?.active ?? 0}人 × ¥${MONTHLY_PRICE_JPY.toLocaleString()}`} />
              <Stat label="30日内に更新期限" value={revenue?.expiring_30d ?? 0} sub="要フォロー" />
            </div>
            <div style={{ ...card, marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>月次粗利（概算）</p>
              <p style={{ margin: '6px 0 0', fontSize: 'var(--text-title)', fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>¥{grossProfit.toLocaleString()}</p>
              <p style={{ margin: '6px 0 0', fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.6 }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-caption)', marginBottom: 4 }}>
                        <span style={{ color: C.ink, fontWeight: 600 }}>{s.label}</span>
                        <span style={{ color: C.ink2 }}>
                          <strong style={{ color: C.ink }}>{s.n}</strong>
                          {stepConv != null && <span style={{ color: C.ink3, marginLeft: 6 }}>（前段比 {stepConv}%）</span>}
                        </span>
                      </div>
                      <div style={{ height: 8, background: C.soft, borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(2, (s.n / top) * 100)}%`, background: C.brand, borderRadius: 'var(--radius-full)' }} />
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
              <p style={{ margin: '8px 2px 0', fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.6 }}>※ 利用データが貯まると自動で算出されます（登録から日数が経った人が対象）。</p>
            )}

            <p style={sectionTitle}><Calculator size={15} strokeWidth={2} /> ユニットエコノミクス（LTV / CAC）</p>
            <div style={card}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={{ fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>今月の集客費用（円）</label>
                  <input type="number" inputMode="numeric" value={mktSpend}
                    onChange={(e) => { setMktSpend(e.target.value); try { localStorage.setItem('orime-ops-mkt-spend', e.target.value); } catch { /* ignore */ } }}
                    placeholder="例：30000" style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label style={{ fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>想定継続月数</label>
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
              <p style={{ margin: '10px 2px 0', fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.7 }}>
                {paybackMonths != null ? `回収期間 約${paybackMonths.toFixed(1)}ヶ月。` : ''}
                LTV:CAC ≥ 3 / 回収 ≤ 12ヶ月 が健全の目安。集客費は手入力（この端末に保存）。粗利ベースの概算です。
              </p>
            </div>

            <p style={sectionTitle}><Cpu size={15} strokeWidth={2} /> AIコスト / API消費</p>
            <div style={card}>
              {ai.length === 0 ? <p style={{ fontSize: 'var(--text-caption)', color: C.ink3, margin: 0 }}>まだ利用がありません。</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ai.map((m) => (
                    <div key={m.month} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 'var(--text-caption)', color: C.ink, fontWeight: 600 }}>{m.month}</span>
                      <span style={{ fontSize: 'var(--text-caption)', color: C.ink2 }}><strong style={{ color: C.ink }}>{m.calls.toLocaleString()}</strong> コール / {m.users}人</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p style={sectionTitle}><TrendingUp size={15} strokeWidth={2} /> 機能別の利用状況（直近{days}日）</p>
            <div style={card}>
              <p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>イベント別</p>
              <BarList data={usage?.events} />
            </div>
            <div style={{ ...grid2, marginTop: 10 }}>
              <div style={card}><p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>AI 機能</p><BarList data={usage?.ai_features} /></div>
              <div style={card}><p style={{ margin: '0 0 10px', fontSize: 'var(--text-caption)', color: C.ink2, fontWeight: 600 }}>本の追加経路</p><BarList data={usage?.book_via} /></div>
            </div>

            </>)}

            {/* ═══ アクションタブ（後半: 問い合わせ受信箱） ═══ */}
            {activeTab === 'action' && (<>
            {/* ── 📩 問い合わせ受信箱 ── */}
            <p style={sectionTitle}>
              <Inbox size={15} strokeWidth={2} /> 問い合わせ・フィードバック
              {overview?.feedback_open > 0 && <span style={{ marginLeft: 4, fontSize: 'var(--text-caption)', fontWeight: 700, color: C.brandInk, background: C.brand, borderRadius: 'var(--radius-full)', padding: '1px 8px' }}>未対応 {overview.feedback_open}</span>}
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['open', '未対応'], ['in_progress', '対応中'], ['resolved', '解決'], ['all', 'すべて']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setFbFilter(k)}
                  style={{ padding: '6px 12px', borderRadius: 'var(--radius-full)', fontSize: 'var(--text-caption)', fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${fbFilter === k ? 'transparent' : C.hairlineStrong}`,
                    background: fbFilter === k ? C.brand : 'transparent', color: fbFilter === k ? C.brandInk : C.ink2 }}>{label}</button>
              ))}
            </div>
            {shownFeedback.length === 0 ? (
              <div style={{ ...card, color: C.ink3, fontSize: 'var(--text-meta)' }}>該当する問い合わせはありません。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shownFeedback.map((f) => (
                  <div key={f.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: C.ink2, background: C.soft, borderRadius: 'var(--radius)', padding: '2px 8px' }}>{CATEGORY_LABEL[f.category] || f.category}</span>
                      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 700, color: f.status === 'open' ? C.critical : C.ink3 }}>{FB_STATUS_LABEL[f.status] || f.status}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 'var(--text-caption)', color: C.ink3 }}>{String(f.created_at).slice(0, 10)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.content}</p>
                    {(f.name || f.email) && <p style={{ margin: '8px 0 0', fontSize: 'var(--text-caption)', color: C.ink3 }}>{f.name || '（匿名）'}{f.email ? ` · ${f.email}` : ''}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => ticketize(f.id)} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-caption)', color: C.brand, fontWeight: 700 }}>チケット化</button>
                      {f.status !== 'in_progress' && <button type="button" onClick={() => triageFb(f.id, 'in_progress')} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-caption)' }}>対応中</button>}
                      {f.status !== 'resolved' && <button type="button" onClick={() => triageFb(f.id, 'resolved')} style={{ ...btnGhost, flex: '0 1 auto', minHeight: 44, padding: '0 var(--space-3)', fontSize: 'var(--text-caption)' }}>解決</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>)}
          </>
        )}
      </div>
    </div>
  );
}
