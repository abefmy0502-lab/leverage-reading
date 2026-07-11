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
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  X, RefreshCw, Target, ListChecks, Ticket, Users, CreditCard, Cpu, Inbox,
  BarChart3, TrendingUp, Check, Flag, Pencil, Route, Activity, Calculator,
  Brain, Send,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { generateOpsRoadmap, opsAdvise, generateOpsTasks, consultSpecialist, integrateFloor } from '../lib/ai';
import { DEPARTMENTS, DEPT_META, AI_COMPANY, findMember } from '../lib/aiCompany';
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
  width: 44, height: 44, borderRadius: 12, border: 'none',
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
  const trapRef = useFocusTrap(true); // ♿ Tab をダッシュボード内に閉じ込める
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
  // 🏢 社員フロア（作戦司令室）。各社員の最新レポートは端末ローカルに保持。
  const [floorReports, setFloorReports] = useState(() => {
    try { return JSON.parse(localStorage.getItem('orime.floor.reports') || '{}'); } catch { return {}; }
  });
  const [floorBusy, setFloorBusy] = useState({}); // memberId -> bool
  // 二重コール防止の即時ガード。部門招集ループ中の dispatchMember は招集開始時
  // レンダーの floorBusy を閉包で読むため、state だけだと個別タップとの並行で
  // 同一社員に二重コール（AI 原価二重払い）の窓が開く。ref は常に最新。
  const floorBusyRef = useRef({});
  const [activeMemberId, setActiveMemberId] = useState(null);
  const [floorOrder, setFloorOrder] = useState('');
  // 🎖 CEO室 統合ブリーフ。
  const [integration, setIntegration] = useState(() => {
    try { return JSON.parse(localStorage.getItem('orime.floor.integration') || 'null'); } catch { return null; }
  });
  const [integrationBusy, setIntegrationBusy] = useState(false);
  // 部門一括招集の進捗（deptKey -> {done,total} / null）。
  const [deptProgress, setDeptProgress] = useState({});
  // 成果物→チケット化の状態（memberId -> 'done'）。
  const [ticketed, setTicketed] = useState({});
  // タブ（概況 / アクション / 参謀 / フロア）。
  const [activeTab, setActiveTab] = useState('overview');

  // ── 📣 営業ウィークリー（company/sales-strategy-2026-2027.md をダッシュボード化）──
  // 戦略の月次マイルストーン（継続課金者の目標）。文書を改訂したらここも更新する。
  const SALES_MILESTONES = [
    ['2026-07', 5], ['2026-08', 15], ['2026-09', 30], ['2026-10', 50], ['2026-11', 75], ['2026-12', 100],
    ['2027-03', 150], ['2027-06', 300], ['2027-09', 550], ['2027-12', 1000],
  ];
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

  // 今週の月曜日（ローカル）を YYYY-MM-DD で。週次レコードのキー。
  const weekStartISO = () => {
    const d = new Date();
    const day = d.getDay(); // 0=日
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

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
  useEffect(() => { if (activeTab === 'sales' && !salesLoaded) loadSales(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeTab]);

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

  // if-then 警告（戦略 §6 の判断ルールを実データで自動評価）。
  const salesAlerts = (() => {
    const rows = [...salesRows].sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)));
    const out = [];
    const ctr = (r) => (r?.note_pv > 0 && r?.lp_clicks != null ? r.lp_clicks / r.note_pv : null);
    const c0 = ctr(rows[0]); const c1 = ctr(rows[1]);
    if (c0 != null && c1 != null && c0 < 0.02 && c1 < 0.02) {
      out.push({ level: 'warn', text: `note→LP クリック率が2週連続 2% 未満（${(c0 * 100).toFixed(1)}% / ${(c1 * 100).toFixed(1)}%）`, action: 'CTA を記事末→中間にも追加し、文言を「悩み文脈」に書き換える' });
    }
    const last4 = rows.slice(0, 4);
    const sum = (arr, k) => arr.reduce((a, r) => a + (Number.isFinite(r?.[k]) ? r[k] : 0), 0);
    const inst4 = sum(last4, 'installs'); const paid4 = sum(last4, 'new_paid');
    if (inst4 >= 30 && paid4 / inst4 < 0.03) {
      out.push({ level: 'warn', text: `install→課金が直近4週で ${(100 * paid4 / inst4).toFixed(1)}%（基準 3%）`, action: 'ペイウォール手前の価値プレビューを改善。改善しなければ 7日間無料（Introductory Offer）の AB を検討' });
    }
    // 今月の月次目標（マイルストーン線形補間ではなく当月値）と新規ペース
    const ym = new Date(); const ymKey = `${ym.getFullYear()}-${String(ym.getMonth() + 1).padStart(2, '0')}`;
    const ms = SALES_MILESTONES.find(([k]) => k === ymKey);
    if (ms && last4.length >= 2) {
      const idx = SALES_MILESTONES.findIndex(([k]) => k === ymKey);
      const prevTarget = idx > 0 ? SALES_MILESTONES[idx - 1][1] : 0;
      const monthlyNeed = Math.max(0, ms[1] - prevTarget);
      if (monthlyNeed > 0 && paid4 < monthlyNeed * 0.5) {
        out.push({ level: 'warn', text: `新規課金が直近4週 ${paid4} 人 — 今月目標の増分 ${monthlyNeed} 人の 50% 未満`, action: '翌月は「比較記事」（最も課金に近い）を月2本に増やし、ストーリー記事を1回休む' });
      }
    }
    const pv4 = sum(rows.slice(0, 4), 'note_pv'); const pvPrev4 = sum(rows.slice(4, 8), 'note_pv');
    if (rows.length >= 8 && pvPrev4 > 0 && pv4 <= pvPrev4) {
      out.push({ level: 'info', text: `note PV が横ばい（直近4週 ${pv4} ≤ 前4週 ${pvPrev4}）`, action: 'SEO キーワードを再選定（検索ボリュームのある悩み語へ）。/note-shijo で競合調査' });
    }
    return out;
  })();

  // 🗓 日次タスク。
  const [dailyTasks, setDailyTasks] = useState([]);
  const [tasksBusy, setTasksBusy] = useState(false);
  const [tasksErr, setTasksErr] = useState('');

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
    const all = [ov, se, us, au, rv, fb, gl, tk, gr];

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

  // 🏢 作戦司令室の報告を Supabase から復元（AI企業の「記憶」・自分の行のみ）。
  // 各 member の最新行 = 現在の状態。未適用 DB では静かに localStorage のみで動く。
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('ops_floor_reports')
          .select('member_id, kind, status, body, created_at')
          .order('created_at', { ascending: false })
          .limit(300);
        if (!alive || error || !Array.isArray(data)) return;
        const latest = {};
        let integ = null;
        for (const r of data) {
          if (r.kind === 'integration') { if (!integ) integ = r; continue; }
          if (!latest[r.member_id]) latest[r.member_id] = r;
        }
        // クラウドの行がローカルより新しければ採用（新しい方が勝つ）。
        setFloorReports((prev) => {
          const next = { ...prev };
          for (const [id, r] of Object.entries(latest)) {
            const at = new Date(r.created_at).getTime();
            if (!next[id] || at > (next[id].at || 0)) next[id] = { status: r.status || '報告完了', body: r.body || '', at, ok: true };
          }
          try { localStorage.setItem('orime.floor.reports', JSON.stringify(next)); } catch { /* quota */ }
          return next;
        });
        if (integ) {
          setIntegration((prev) => {
            const at = new Date(integ.created_at).getTime();
            return (!prev || at > (prev.at || 0)) ? { body: integ.body || '', at, ok: true } : prev;
          });
        }
      } catch { /* テーブル未適用: localStorage のみ */ }
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

  // 🏢 社員フロア: 1 名の社員に成果物を出させる（1 タップ = AI 1 コール）。
  // 既にレポートがある社員のタップは「閲覧のみ」（無課金）。更新は明示ボタンで。
  const dispatchMember = async (member, order = '') => {
    if (!member || floorBusyRef.current[member.id]) return;
    floorBusyRef.current[member.id] = true;
    setFloorBusy((b) => ({ ...b, [member.id]: true }));
    try {
      const deptLabel = DEPT_META[member.dept]?.label || '';
      const res = await consultSpecialist({ member: { ...member, deptLabel }, stateLine, order });
      setFloorReports((prev) => {
        const entry = res
          ? { status: res.status || '報告完了', body: res.body || '', at: Date.now(), ok: true }
          : { status: '応答に失敗', body: prev[member.id]?.body || '', at: Date.now(), ok: false };
        const next = { ...prev, [member.id]: entry };
        try { localStorage.setItem('orime.floor.reports', JSON.stringify(next)); } catch { /* quota/private */ }
        return next;
      });
      // クラウドにも追記（記憶＋履歴・fire-and-forget・未適用 DB は静かに失敗）。
      if (res && res.body) {
        supabase.from('ops_floor_reports')
          .insert({ member_id: member.id, kind: 'report', status: res.status || null, body: res.body })
          .then(() => {}, () => {});
      }
    } finally {
      floorBusyRef.current[member.id] = false;
      setFloorBusy((b) => ({ ...b, [member.id]: false }));
    }
  };

  // フロアのカードをタップ: 未報告なら起動、報告済みなら閲覧（パネルを開くだけ）。
  const onMemberTap = (member) => {
    setActiveMemberId(member.id);
    if (!floorReports[member.id] && !floorBusy[member.id]) dispatchMember(member, floorOrder);
  };

  // 🏢 部門を一括招集（順次・レート制限に配慮）。進捗を deptProgress で表示。
  const dispatchDepartment = async (deptKey) => {
    const members = AI_COMPANY.filter((m) => m.dept === deptKey);
    if (!members.length || deptProgress[deptKey]) return;
    setDeptProgress((p) => ({ ...p, [deptKey]: { done: 0, total: members.length } }));
    try {
      for (let i = 0; i < members.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await dispatchMember(members[i], floorOrder);
        setDeptProgress((p) => ({ ...p, [deptKey]: { done: i + 1, total: members.length } }));
      }
    } finally {
      setDeptProgress((p) => { const n = { ...p }; delete n[deptKey]; return n; });
    }
  };

  // 🎖 CEO室: 各社員の報告を統合して「今日の意思決定」を1つに収束させる（1 コール）。
  const runIntegration = async () => {
    if (integrationBusy) return;
    const reports = AI_COMPANY
      .filter((m) => floorReports[m.id] && floorReports[m.id].body)
      .map((m) => ({ name: m.name, title: m.title, dept: DEPT_META[m.dept]?.label || '', status: floorReports[m.id].status, body: floorReports[m.id].body }));
    if (reports.length === 0) return;
    setIntegrationBusy(true);
    try {
      const body = await integrateFloor({ reports, stateLine, order: floorOrder });
      const entry = { body: body || '', at: Date.now(), ok: !!body, count: reports.length };
      setIntegration(entry);
      try { localStorage.setItem('orime.floor.integration', JSON.stringify(entry)); } catch { /* quota */ }
      if (body) {
        supabase.from('ops_floor_reports')
          .insert({ member_id: '__integration__', kind: 'integration', status: null, body })
          .then(() => {}, () => {});
      }
    } finally {
      setIntegrationBusy(false);
    }
  };

  // 🎫 成果物 → チケット化（既存の作業ボードへ流し込む＝実行に接続）。
  // RPC 応答待ちの間の再タップで重複チケットが作られないよう、発行前に
  // 'busy' を立てて disabled 条件に含める（in-flight ガード）。
  const ticketFromReport = async (member, rep) => {
    if (!rep || !rep.body || ticketed[member.id]) return;
    setTicketed((t) => ({ ...t, [member.id]: 'busy' }));
    const title = `[${DEPT_META[member.dept]?.label || ''}/${member.name}] ${rep.status || '成果物'}`.slice(0, 120);
    try {
      const { error } = await supabase.rpc('admin_ticket_create', {
        p_title: title, p_body: String(rep.body).slice(0, 4000), p_kind: 'task', p_priority: 2, p_source_feedback: null,
      });
      setTicketed((t) => ({ ...t, [member.id]: error ? undefined : 'done' }));
    } catch {
      // RPC 未適用等は静かに無視（busy は解除して再試行可能に）
      setTicketed((t) => ({ ...t, [member.id]: undefined }));
    }
  };

  // フロアの稼働状況サマリー（司令室ヘッダー表示用）。
  const floorReportedCount = AI_COMPANY.filter((m) => floorReports[m.id] && floorReports[m.id].body).length;
  const floorBusyCount = Object.values(floorBusy).filter(Boolean).length;
  // コスト概算は「当日の報告」だけを数える（過去日の復元分まで足すと、今日
  // 1 コールも使っていないのに費用が出て元帥の原価判断をミスリードする）。
  const _todayKey = new Date().toDateString();
  const floorTodayCount = AI_COMPANY.filter((m) => {
    const r = floorReports[m.id];
    return r && r.body && r.at && new Date(r.at).toDateString() === _todayKey;
  }).length;
  const floorCostJpy = (floorTodayCount + (integration && integration.ok && integration.at && new Date(integration.at).toDateString() === _todayKey ? 1 : 0)) * AI_COST_PER_CALL_JPY;

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

  // 🗓 日次タスクを AI に生成させる（現状を踏まえて軌道修正）。未完了の今日以降を
  //    入れ替える（過去・完了済みは残す）。
  const makeTasks = async () => {
    if (!goal || tasksBusy) return;
    setTasksBusy(true); setTasksErr('');
    try {
      const rows = await generateOpsTasks({
        goalLabel: METRIC_LABEL[goal.metric], target: goal.target, deadline: goal.deadline || '',
        currentUsers: overview?.users_total || 0, currentPaid: revenue?.active || 0, mrr, grossProfit,
      });
      if (rows && rows.length) {
        const todayStr = new Date().toISOString().slice(0, 10);
        // ⚠️ データ消失を防ぐため「先に挿入 → 成功したら旧タスクを削除」の順にする。
        //    旧タスク（今日以降・未完了）の id を控えてから新規挿入し、成功時のみ旧を消す。
        const { data: oldRows } = await supabase.from('ops_tasks')
          .select('id').gte('due_date', todayStr).eq('done', false);
        const ins = await supabase.from('ops_tasks')
          .insert(rows.map((r) => ({ due_date: r.due_date, dept: r.dept, title: r.title })));
        if (ins.error) { setTasksErr('タスクの保存に失敗しました。少し時間をおいて再度お試しください。'); return; }
        if (oldRows && oldRows.length) {
          await supabase.from('ops_tasks').delete().in('id', oldRows.map((r) => r.id));
        }
        await loadTasks();
      } else {
        setTasksErr('タスク生成に失敗しました。少し時間をおいて再度お試しください。');
      }
    } catch {
      setTasksErr('タスク生成に失敗しました。');
    } finally {
      setTasksBusy(false);
    }
  };
  const toggleTask = async (t) => {
    setDailyTasks((list) => list.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    const { error } = await supabase.from('ops_tasks').update({ done: !t.done }).eq('id', t.id);
    if (error) loadTasks();
  };

  return (
    <div ref={trapRef} style={overlay} role="dialog" aria-modal="true" aria-label="運営ダッシュボード">
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
            {/* タブ: 概況 / アクション / 参謀 */}
            <div style={{ display: 'flex', gap: 6, position: 'sticky', top: 0, padding: '10px 0 12px', background: C.pageBg, zIndex: 1 }}>
              {[['overview', '📊 概況'], ['sales', '📣 営業'], ['action', '🗓 アクション'], ['advisor', '🧠 参謀'], ['floor', '🏢 フロア']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setActiveTab(k)}
                  style={{ flex: 1, padding: '10px 2px', borderRadius: 12, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    border: `1px solid ${activeTab === k ? 'transparent' : C.hairlineStrong}`,
                    background: activeTab === k ? C.brand : 'transparent', color: activeTab === k ? C.brandInk : C.ink2 }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ═══ 概況タブ（前半: 目標） ═══ */}
            {activeTab === 'overview' && (<>
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

            </>)}

            {/* ═══ 参謀タブ（作戦会議 ＋ ロードマップ） ═══ */}
            {/* ═══ 📣 営業タブ — 週次KPI・マイルストーン・警告（戦略のダッシュボード化） ═══ */}
            {activeTab === 'sales' && (<>
              <p style={sectionTitle}>📣 マイルストーン進捗</p>
              <div style={card}>
                {(() => {
                  const active = revenue?.active ?? null;
                  const now = new Date(); const ymKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                  const cur = SALES_MILESTONES.find(([k]) => k >= ymKey) || SALES_MILESTONES[SALES_MILESTONES.length - 1];
                  const pace = active != null && cur ? Math.round((active / cur[1]) * 100) : null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ fontSize: 13, color: C.ink }}>
                        現在の有料会員: <b style={{ fontSize: 18 }}>{active ?? '—'}</b> 人
                        　/　直近目標（{cur[0]}）: <b>{cur[1]}</b> 人
                        {pace != null && <span style={{ marginLeft: 8, fontWeight: 700, color: pace >= 80 ? '#6b8e6b' : pace >= 40 ? '#a8842f' : '#b75050' }}>ペース {pace}%</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {SALES_MILESTONES.map(([k, v]) => (
                          <span key={k} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, border: `1px solid ${C.hairlineStrong}`, color: active != null && active >= v ? '#6b8e6b' : C.ink2, background: active != null && active >= v ? 'var(--c-positive-soft, #e2ecd8)' : 'transparent' }}>
                            {k}: {v}人{active != null && active >= v ? ' ✓' : ''}
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: 11, color: C.ink3, margin: '4px 0 0' }}>目標線は company/sales-strategy-2026-2027.md §5。改訂したらコードの SALES_MILESTONES も更新。</p>
                    </div>
                  );
                })()}
              </div>

              {salesMissing ? (
                <div style={{ ...card, borderColor: '#e0cabf' }}>
                  <p style={{ fontSize: 12, color: C.ink2, margin: 0, lineHeight: 1.7 }}>
                    週次トラッキングは未セットアップです。Supabase SQL Editor で <b>supabase_ops_sales_metrics.sql</b> を実行すると、このタブで週次KPIの記録と警告判定ができるようになります。
                  </p>
                </div>
              ) : (<>
                {salesAlerts.length > 0 && (
                  <>
                    <p style={sectionTitle}>⚠️ 判断ルールに該当</p>
                    {salesAlerts.map((a, i) => (
                      <div key={i} style={{ ...card, borderColor: a.level === 'warn' ? '#e0cabf' : C.hairlineStrong }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: a.level === 'warn' ? '#b75050' : C.ink, margin: '0 0 4px' }}>{a.text}</p>
                        <p style={{ fontSize: 12, color: C.ink2, margin: 0, lineHeight: 1.6 }}>→ {a.action}</p>
                      </div>
                    ))}
                  </>
                )}

                <p style={sectionTitle}>✍️ 今週の数字（週の起点: {weekStartISO()}）</p>
                <div style={card}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {SALES_FIELDS.map(([k, label]) => (
                      <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: C.ink2 }}>
                        {label}
                        <input type="number" inputMode="numeric" min={0} max={9999999} value={salesForm[k] ?? ''} onChange={(e) => setSalesForm((f) => ({ ...f, [k]: e.target.value }))} style={inp} placeholder="—" />
                      </label>
                    ))}
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: C.ink2 }}>
                      メモ（任意）
                      <input type="text" maxLength={500} value={salesForm.memo ?? ''} onChange={(e) => setSalesForm((f) => ({ ...f, memo: e.target.value }))} style={inp} placeholder="気づき一言" />
                    </label>
                  </div>
                  <button type="button" onClick={saveSalesWeek} disabled={salesSaving} style={{ ...btnPrimary, minHeight: 44, marginTop: 12, opacity: salesSaving ? 0.6 : 1 }}>
                    {salesSaving ? '保存中…' : '今週の数字を保存'}
                  </button>
                  <p style={{ fontSize: 11, color: C.ink3, margin: '8px 0 0', lineHeight: 1.6 }}>
                    出どころ: 新規課金=下の売上欄 / インストール=App Store Connect / LPクリック=note・XのUTM / note PV=noteダッシュボード / Xプロフクリック=Xアナリティクス。日曜の週次レビュー（20分）で入力。
                  </p>
                </div>

                {salesRows.length > 0 && (
                  <>
                    <p style={sectionTitle}>📈 直近8週</p>
                    <div style={{ ...card, overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%', minWidth: 560 }}>
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
                <div role="log" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
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
                  {advisorBusy && <p aria-live="polite" style={{ fontSize: 12, color: C.ink3, margin: 0 }}>参謀が検討中…</p>}
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
                  style={{ flex: '0 0 auto', width: 48, height: 48, borderRadius: 12, border: 'none', background: C.brand, color: C.brandInk, cursor: advisorBusy || !advisorInput.trim() ? 'default' : 'pointer', opacity: advisorBusy || !advisorInput.trim() ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={18} />
                </button>
              </div>
            </div>

            </>)}

            {/* ═══ 社員フロアタブ（作戦司令室 — 20名+顧問の AI 社員） ═══ */}
            {activeTab === 'floor' && (<>
            <p style={sectionTitle}>🏢 作戦司令室
              <span style={{ fontWeight: 600, color: C.ink3, fontSize: 11 }}>　{AI_COMPANY.length}名 ＋ 特別顧問団</span>
            </p>

            {/* ── 全社サマリー（稼働状況の一望） ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[
                ['稼働中', floorBusyCount, C.brand],
                ['報告済', `${floorReportedCount}/${AI_COMPANY.length}`, '#6b8e6b'],
                ['本日概算', `¥${floorCostJpy}`, C.ink2],
              ].map(([label, val, col]) => (
                <div key={label} style={{ flex: 1, background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: col, lineHeight: 1.1 }}>{val}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 10, color: C.ink3 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* ── 元帥の指示（招集する社員に共通で伝わる） ── */}
            <textarea
              value={floorOrder}
              onChange={(e) => setFloorOrder(e.target.value)}
              placeholder="任意: 招集する社員に共通で伝える指示（空なら各自が最重要の一手を選びます）例：来週の集客を具体化して"
              rows={2}
              maxLength={1000}
              style={{ ...inp, resize: 'vertical', minHeight: 44, lineHeight: 1.6, marginBottom: 14 }}
            />

            {/* ── 🎖 CEO室 統合ブリーフ（全社を1つの意思決定に収束） ── */}
            <div style={{ ...card, borderTop: `3px solid ${DEPT_META.ceo.accent}`, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: C.ink }}>🎖 CEO室 統合ブリーフ</p>
                <button type="button" onClick={runIntegration} disabled={integrationBusy || floorReportedCount === 0}
                  style={{ ...btnPrimary, minHeight: 44, padding: '0 14px', fontSize: 12, width: 'auto',
                    opacity: (integrationBusy || floorReportedCount === 0) ? 0.5 : 1, cursor: (integrationBusy || floorReportedCount === 0) ? 'default' : 'pointer' }}>
                  {integrationBusy ? '統合中…' : integration ? '再統合' : '全社を統合'}
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: C.ink2, lineHeight: 1.65 }}>
                各社員の報告を横断し、部門間の依存・矛盾を洗い出して「今日の意思決定」を1つに絞ります（AI 1コール）。
                {floorReportedCount === 0 && <span style={{ color: C.ink3 }}>　まず社員を招集して報告を集めてください。</span>}
              </p>
              {integration && integration.ok && integration.body && !integrationBusy && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.hairline}`, fontSize: 13, lineHeight: 1.75, color: C.ink }}>
                  <RoadmapMarkdown text={integration.body} />
                </div>
              )}
              {integration && !integration.ok && !integrationBusy && (
                <p style={{ fontSize: 12, color: C.critical, margin: '12px 0 0' }}>統合に失敗しました。少し時間をおいて「再統合」してください。</p>
              )}
            </div>

            {DEPARTMENTS.map((dept) => {
              const members = AI_COMPANY.filter((m) => m.dept === dept.key);
              if (!members.length) return null;
              const prog = deptProgress[dept.key];
              return (
                <div key={dept.key} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '0 0 8px' }}>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 12, fontWeight: 700, color: C.ink2 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: dept.accent }} />
                      {dept.label}
                    </p>
                    <button type="button" onClick={() => dispatchDepartment(dept.key)} disabled={!!prog}
                      style={{ border: `1px solid ${dept.accent}`, background: 'transparent', color: dept.accent, borderRadius: 99,
                        padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: prog ? 'default' : 'pointer', opacity: prog ? 0.6 : 1, whiteSpace: 'nowrap', minHeight: 44 }}>
                      {prog ? `招集中 ${prog.done}/${prog.total}` : `部門を招集（${members.length}コール）`}
                    </button>
                  </div>
                  <div style={grid2}>
                    {members.map((m) => {
                      const rep = floorReports[m.id];
                      const busy = floorBusy[m.id];
                      const state = busy ? 'busy' : rep ? (rep.ok ? 'done' : 'fail') : 'idle';
                      const dotColor = state === 'busy' ? dept.accent : state === 'done' ? '#6b8e6b' : state === 'fail' ? C.critical : C.hairlineStrong;
                      const statusText = busy ? '検討中…' : rep ? rep.status : '待機中';
                      const selected = activeMemberId === m.id;
                      return (
                        <button key={m.id} type="button" onClick={() => onMemberTap(m)}
                          style={{
                            textAlign: 'left', cursor: 'pointer', padding: 12, borderRadius: 12,
                            background: selected ? C.soft : C.card,
                            border: `1px solid ${selected ? dept.accent : C.hairline}`,
                            borderLeft: `3px solid ${dept.accent}`,
                            display: 'flex', flexDirection: 'column', gap: 4, minHeight: 76,
                          }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{m.name}</span>
                          <span style={{ fontSize: 10.5, color: C.ink3, lineHeight: 1.35 }}>{m.title}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 'auto', fontSize: 10.5, color: state === 'idle' ? C.ink3 : C.ink2 }}>
                            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, animation: busy ? 'pulse 1.2s infinite' : 'none' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{statusText}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* 選択中の社員の報告パネル */}
            {activeMemberId && (() => {
              const m = findMember(activeMemberId);
              const rep = floorReports[activeMemberId];
              const busy = floorBusy[activeMemberId];
              if (!m) return null;
              return (
                <div style={{ ...card, borderTop: `3px solid ${DEPT_META[m.dept]?.accent || C.brand}`, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink }}>{m.name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: C.ink3 }}>{m.title}・{DEPT_META[m.dept]?.label}</p>
                    </div>
                    <button type="button" onClick={() => setActiveMemberId(null)} style={iconBtn} aria-label="閉じる"><X size={18} /></button>
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: 11, color: C.ink2, lineHeight: 1.6, paddingBottom: 10, borderBottom: `1px solid ${C.hairline}` }}>
                    <strong style={{ color: C.ink }}>担当:</strong> {m.mandate}
                  </p>
                  {busy && <p style={{ fontSize: 12, color: C.ink3, margin: '12px 0 0' }}>{m.name} が検討中…</p>}
                  {!busy && rep && rep.body && (
                    <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.75, color: C.ink }}>
                      <RoadmapMarkdown text={rep.body} />
                    </div>
                  )}
                  {!busy && rep && !rep.ok && !rep.body && (
                    <p style={{ fontSize: 12, color: C.critical, margin: '12px 0 0' }}>応答に失敗しました。少し時間をおいて「更新」してください。</p>
                  )}
                  {!busy && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => dispatchMember(m, floorOrder)}
                        style={{ ...btnGhost, minHeight: 40, fontSize: 12, flex: 1, minWidth: 140 }}>
                        🔄 {rep ? '更新（AI 1コール）' : '報告を出す（AI 1コール）'}
                      </button>
                      {rep && rep.ok && rep.body && (
                        <button type="button" onClick={() => ticketFromReport(m, rep)} disabled={ticketed[m.id] === 'done'}
                          style={{ ...btnGhost, minHeight: 40, fontSize: 12, flex: 1, minWidth: 140,
                            opacity: ticketed[m.id] === 'done' ? 0.6 : 1, cursor: ticketed[m.id] === 'done' ? 'default' : 'pointer' }}>
                          {ticketed[m.id] === 'done' ? '✅ チケット化済み' : '🎫 チケット化'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            </>)}

            {/* ═══ アクションタブ（日次タスク ＋ 今やるべきこと ＋ チケット） ═══ */}
            {activeTab === 'action' && (<>
            {/* ── 🗓 日次タスク（今やるべきことの日次分解・約30日分） ── */}
            <p style={sectionTitle}><ListChecks size={15} strokeWidth={2} /> 日次タスク（約30日分）</p>
            <div style={card}>
              {!goal ? (
                <p style={{ margin: 0, fontSize: 13, color: C.ink3, lineHeight: 1.7 }}>「概況」タブで目標を設定すると、AI が今日から約30日分の日次タスクに分解します。</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: dailyTasks.length ? 12 : 0 }}>
                    <button type="button" onClick={makeTasks} disabled={tasksBusy} style={{ ...btnPrimary, width: 'auto', minHeight: 44, opacity: tasksBusy ? 0.6 : 1 }}>
                      <ListChecks size={16} aria-hidden="true" />
                      {tasksBusy ? 'AIが作成中…' : (dailyTasks.length ? '現状に合わせて引き直す' : 'AIに日次タスクを作ってもらう')}
                    </button>
                    <span style={{ fontSize: 11, color: C.ink3 }}>現状の人数・売上で軌道修正されます</span>
                  </div>
                  {tasksErr && <p style={{ margin: '0 0 8px', fontSize: 12, color: C.critical }}>{tasksErr}</p>}
                  {(() => {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    const upcoming = dailyTasks.filter((t) => t.due_date >= todayStr || !t.done).slice(0, 80);
                    const byDate = {};
                    upcoming.forEach((t) => { (byDate[t.due_date] = byDate[t.due_date] || []).push(t); });
                    const dates = Object.keys(byDate).sort();
                    if (dates.length === 0) return null;
                    return dates.map((d) => (
                      <div key={d} style={{ marginBottom: 12 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: d === todayStr ? C.brand : C.ink2 }}>
                          {d === todayStr ? `${d}（今日）` : d}
                        </p>
                        {byDate[d].map((t) => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0' }}>
                            <button type="button" onClick={() => toggleTask(t)} aria-label={t.done ? '未完了に戻す' : '完了'}
                              style={{ flex: '0 0 auto', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, minWidth: 44, minHeight: 36, margin: '-8px 0 -8px -12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: t.done ? '#6b8e6b' : C.hairlineStrong }}>
                              {t.done ? <Check size={18} /> : <span style={{ display: 'inline-block', width: 16, height: 16, border: `2px solid ${C.hairlineStrong}`, borderRadius: 5 }} />}
                            </button>
                            <span style={{ flex: '0 0 auto', fontSize: 10, fontWeight: 700, color: '#fff', background: DEPT_COLOR[t.dept] || C.brand, borderRadius: 6, padding: '2px 6px', marginTop: 1 }}>{t.dept}</span>
                            <span style={{ flex: 1, fontSize: 13, color: t.done ? C.ink3 : C.ink, textDecoration: t.done ? 'line-through' : 'none', lineHeight: 1.5 }}>{t.title}</span>
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </>
              )}
            </div>

            {/* ── 📋 今やるべきこと（指標シグナル・軌道修正のトリガー） ── */}
            <p style={sectionTitle}><Flag size={15} strokeWidth={2} /> シグナル（指標が示す注意点）</p>
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

            </>)}

            {/* ═══ 概況タブ（後半: KPI・ファネル・継続率・LTV・コスト） ═══ */}
            {activeTab === 'overview' && (<>
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

            <p style={sectionTitle}><CreditCard size={15} strokeWidth={2} /> 会員・売上</p>
            {/* 会員内訳: 有料(課金中・無料期間除く) / 無料期間(トライアル) / 解約(累計) */}
            <div style={grid3}>
              <Stat label="有料会員" value={revenue?.active ?? 0} sub="課金中（無料期間除く）" />
              <Stat label="無料期間" value={revenue?.trial ?? 0} sub="トライアル中" />
              <Stat label="解約（累計）" value={revenue?.canceled ?? 0} sub="会員数に含めない" />
            </div>
            <div style={{ ...grid2, marginTop: 10 }}>
              <Stat label="MRR（概算）" value={`¥${mrr.toLocaleString()}`} sub={`有料 ${revenue?.active ?? 0}人 × ¥${MONTHLY_PRICE_JPY.toLocaleString()}`} />
              <Stat label="30日内に更新期限" value={revenue?.expiring_30d ?? 0} sub="要フォロー" />
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
                    placeholder="例：30000" style={inp} />
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

            </>)}

            {/* ═══ アクションタブ（後半: 問い合わせ受信箱） ═══ */}
            {activeTab === 'action' && (<>
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
            </>)}
          </>
        )}
      </div>
    </div>
  );
}
