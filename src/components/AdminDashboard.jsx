// 🛰️ AdminDashboard — 運営の「管制塔」。管理者だけが開ける1枚。
//
// アクティブ人数 / 売上・課金 / AI コスト・API 消費 / 機能別の利用状況 /
// 問い合わせ受信箱（フィードバック）を一本化して表示する。
//
// データは supabase の SECURITY DEFINER RPC（supabase_admin_metrics.sql）から
// 取得する。RPC 側で is_app_admin() ゲートがかかっているため、非管理者が叩いて
// もエラーになるだけ（クライアント側でも入口を出さない二重防御）。
//
// グラフは依存追加を避けるため CSS バーのみ（軽量・GPU 不要）。

import { useState, useEffect, useCallback } from 'react';
import {
  X, RefreshCw, Users, CreditCard, Cpu, Inbox, BarChart3, TrendingUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { C, btnGhost } from '../styles/ui';
import Spinner from './Spinner';

// 月額の概算 MRR 表示用（真実は Stripe 側。あくまで目安）。
const MONTHLY_PRICE_JPY = 990;

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

function Stat({ label, value, sub }) {
  return (
    <div style={card}>
      <p style={{ margin: 0, fontSize: 11, color: C.ink2, fontWeight: 600 }}>{label}</p>
      <p style={{ margin: '6px 0 0', fontSize: 26, fontWeight: 700, color: C.ink, lineHeight: 1.1 }}>
        {value}
      </p>
      {sub != null && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.ink3 }}>{sub}</p>}
    </div>
  );
}

// 横棒リスト（イベント名 → 件数）。最大値で正規化して幅を出す。
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

// 日次推移のミニ縦棒グラフ（アクティブ人数）。
function MiniBars({ series }) {
  if (!series || series.length === 0) return <p style={{ fontSize: 12, color: C.ink3, margin: 0 }}>データなし</p>;
  const max = Math.max(...series.map((d) => d.active), 1);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90 }}>
        {series.map((d) => (
          <div key={d.d} title={`${d.d}: ${d.active}人 / 新規本${d.new_books}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ width: '100%', height: `${(d.active / max) * 100}%`, minHeight: d.active > 0 ? 3 : 0, background: C.brand, borderRadius: '3px 3px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: C.ink3 }}>
        <span>{series[0]?.d}</span>
        <span>{series[series.length - 1]?.d}</span>
      </div>
    </div>
  );
}

const CATEGORY_LABEL = {
  bug: '不具合', feature: '要望', ui: 'UI', question: '質問', thanks: '感謝', other: 'その他',
};
const STATUS_LABEL = {
  open: '未対応', in_progress: '対応中', resolved: '解決', wont_fix: '却下',
};

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
  const [fbFilter, setFbFilter] = useState('open');

  const load = useCallback(async (d) => {
    setLoading(true);
    setErr('');
    try {
      const [ov, se, us, au, rv, fb] = await Promise.all([
        supabase.rpc('admin_overview'),
        supabase.rpc('admin_active_series', { p_days: d }),
        supabase.rpc('admin_feature_usage', { p_days: d }),
        supabase.rpc('admin_ai_usage', { p_months: 6 }),
        supabase.rpc('admin_revenue'),
        supabase.rpc('admin_feedback', { p_status: null }),
      ]);
      const firstErr = [ov, se, us, au, rv, fb].find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
      setOverview(ov.data || null);
      setSeries(se.data || []);
      setUsage(us.data || null);
      setAi(au.data || []);
      setRevenue(rv.data || null);
      setFeedback(fb.data || []);
    } catch (e) {
      setErr(e?.message === 'not authorized'
        ? 'この画面は管理者のみが閲覧できます。'
        : '読み込みに失敗しました。SQL（supabase_admin_metrics.sql）が適用済みかご確認ください。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const triage = async (id, status) => {
    // 楽観的 UI: 即反映 → 失敗なら再読込で戻す。
    setFeedback((list) => list.map((f) => (f.id === id ? { ...f, status } : f)));
    const { error } = await supabase.rpc('admin_feedback_update', { p_id: id, p_status: status, p_note: null });
    if (error) load(days);
  };

  const shownFeedback = feedback.filter((f) => (fbFilter === 'all' ? true : f.status === fbFilter));
  const mrr = revenue ? (revenue.active || 0) * MONTHLY_PRICE_JPY : 0;

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="運営ダッシュボード">
      <div style={header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={20} strokeWidth={1.75} color={C.ink} />
          <span style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>運営ダッシュボード</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button type="button" style={iconBtn} onClick={() => load(days)} aria-label="再読み込み" disabled={loading}>
            <RefreshCw size={18} strokeWidth={1.75} />
          </button>
          <button type="button" style={iconBtn} onClick={onClose} aria-label="閉じる">
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div style={wrap}>
        {loading && <div style={{ padding: '60px 0' }}><Spinner /></div>}

        {!loading && err && (
          <div style={{ ...card, marginTop: 20, color: C.critical, fontSize: 13, lineHeight: 1.7 }}>{err}</div>
        )}

        {!loading && !err && (
          <>
            {/* 期間トグル */}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {[7, 30, 90].map((d) => (
                <button key={d} type="button" onClick={() => setDays(d)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${days === d ? 'transparent' : C.hairlineStrong}`,
                    background: days === d ? C.brand : 'transparent',
                    color: days === d ? C.brandInk : C.ink2,
                  }}>
                  {d}日
                </button>
              ))}
            </div>

            {/* ── アクティブ人数 ── */}
            <p style={sectionTitle}><Users size={15} strokeWidth={2} /> アクティブ人数</p>
            <div style={grid3}>
              <Stat label="DAU（24h）" value={overview?.dau ?? 0} />
              <Stat label="WAU（7日）" value={overview?.wau ?? 0} />
              <Stat label="MAU（30日）" value={overview?.mau ?? 0} />
            </div>
            <div style={{ ...grid2, marginTop: 10 }}>
              <Stat label="総ユーザー" value={overview?.users_total ?? 0} sub={`新規 +${overview?.new_users_30d ?? 0}（30日）`} />
              <Stat label="新規（7日）" value={`+${overview?.new_users_7d ?? 0}`} />
            </div>
            <div style={{ ...card, marginTop: 10 }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>日次アクティブ（直近{days}日）</p>
              <MiniBars series={series} />
            </div>

            {/* ── 売上・課金 ── */}
            <p style={sectionTitle}><CreditCard size={15} strokeWidth={2} /> 売上・課金</p>
            <div style={grid3}>
              <Stat label="有料会員" value={revenue?.active ?? 0} />
              <Stat label="MRR（概算）" value={`¥${mrr.toLocaleString()}`} sub="× ¥990/月 の目安" />
              <Stat label="30日内に期限" value={revenue?.expiring_30d ?? 0} sub="要更新" />
            </div>
            {revenue && Object.keys(revenue.by_status || {}).length > 0 && (
              <div style={{ ...card, marginTop: 10 }}>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>ステータス内訳</p>
                <BarList data={revenue.by_status} />
              </div>
            )}

            {/* ── AI コスト / API 消費 ── */}
            <p style={sectionTitle}><Cpu size={15} strokeWidth={2} /> AI コスト / API 消費</p>
            <div style={card}>
              {ai.length === 0 ? (
                <p style={{ fontSize: 12, color: C.ink3, margin: 0 }}>まだ利用がありません。</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ai.map((m) => (
                    <div key={m.month} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 12, color: C.ink, fontWeight: 600 }}>{m.month}</span>
                      <span style={{ fontSize: 12, color: C.ink2 }}>
                        <strong style={{ color: C.ink }}>{m.calls.toLocaleString()}</strong> コール / {m.users}人
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 機能別の利用状況 ── */}
            <p style={sectionTitle}><TrendingUp size={15} strokeWidth={2} /> 機能別の利用状況（直近{days}日）</p>
            <div style={{ ...card }}>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>イベント別</p>
              <BarList data={usage?.events} />
            </div>
            <div style={{ ...grid2, marginTop: 10 }}>
              <div style={card}>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>AI 機能の内訳</p>
                <BarList data={usage?.ai_features} />
              </div>
              <div style={card}>
                <p style={{ margin: '0 0 10px', fontSize: 11, color: C.ink2, fontWeight: 600 }}>本の追加経路</p>
                <BarList data={usage?.book_via} />
              </div>
            </div>

            {/* ── 問い合わせ受信箱 ── */}
            <p style={sectionTitle}>
              <Inbox size={15} strokeWidth={2} /> 問い合わせ・フィードバック
              {overview?.feedback_open > 0 && (
                <span style={{ marginLeft: 4, fontSize: 11, fontWeight: 700, color: C.brandInk, background: C.brand, borderRadius: 99, padding: '1px 8px' }}>
                  未対応 {overview.feedback_open}
                </span>
              )}
            </p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[['open', '未対応'], ['in_progress', '対応中'], ['resolved', '解決'], ['all', 'すべて']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setFbFilter(k)}
                  style={{
                    padding: '6px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${fbFilter === k ? 'transparent' : C.hairlineStrong}`,
                    background: fbFilter === k ? C.brand : 'transparent',
                    color: fbFilter === k ? C.brandInk : C.ink2,
                  }}>
                  {label}
                </button>
              ))}
            </div>
            {shownFeedback.length === 0 ? (
              <div style={{ ...card, color: C.ink3, fontSize: 13 }}>該当する問い合わせはありません。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shownFeedback.map((f) => (
                  <div key={f.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.ink2, background: C.soft, borderRadius: 6, padding: '2px 8px' }}>
                        {CATEGORY_LABEL[f.category] || f.category}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: f.status === 'open' ? C.critical : C.ink3 }}>
                        {STATUS_LABEL[f.status] || f.status}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: C.ink3 }}>
                        {String(f.created_at).slice(0, 10)}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: C.ink, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.content}</p>
                    {(f.name || f.email) && (
                      <p style={{ margin: '8px 0 0', fontSize: 11, color: C.ink3 }}>
                        {f.name || '（匿名）'}{f.email ? ` · ${f.email}` : ''}
                      </p>
                    )}
                    {f.admin_note && (
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: C.ink2, fontStyle: 'italic' }}>📝 {f.admin_note}</p>
                    )}
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {f.status !== 'in_progress' && (
                        <button type="button" onClick={() => triage(f.id, 'in_progress')}
                          style={{ ...btnGhost, flex: 1, minHeight: 36, padding: '8px', fontSize: 12 }}>対応中</button>
                      )}
                      {f.status !== 'resolved' && (
                        <button type="button" onClick={() => triage(f.id, 'resolved')}
                          style={{ ...btnGhost, flex: 1, minHeight: 36, padding: '8px', fontSize: 12 }}>解決</button>
                      )}
                      {f.status !== 'wont_fix' && (
                        <button type="button" onClick={() => triage(f.id, 'wont_fix')}
                          style={{ ...btnGhost, flex: 1, minHeight: 36, padding: '8px', fontSize: 12, color: C.ink3 }}>却下</button>
                      )}
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
