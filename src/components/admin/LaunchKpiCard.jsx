// 🚀 LaunchKpiCard — 運営ダッシュボードの概況タブのいちばん上「ローンチの 4 つの数字」。
// 2026-10-02 オーナー承認: ローンチ（2026 年 11 月）はこの 4 つで判断する。
//   ① 初日に相談 ② 7 日でメモ 10 件 ③ 30 日後も使っている ④ 7 日間無料 → 有料
// 集計は RPC admin_launch_kpis（supabase_admin_launch_kpis.sql）、並べ方は lib/launchKpis.js、
// 定義と読み方・目標に届かないときの次の一手は docs/launch-kpis.md。
// 見た目は DESIGN.md のトークンだけ（余白・文字・色・角丸）。
import { useMemo, useState } from 'react';
import { Rocket, Pencil } from 'lucide-react';
import { btnPrimary, btnGhost, input } from '../../styles/ui';
import {
  LAUNCH_KPIS, MIN_DEN, loadTargets, saveTargets, normalizeLaunchKpis, cellText, launchActions, weekLabel,
} from '../../lib/launchKpis';

const card = {
  background: 'var(--surface)', border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)', padding: 'var(--space-4)',
};
const caption = { margin: 0, fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.4 };
const meta = { margin: 0, fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', lineHeight: 1.5, overflowWrap: 'anywhere' };

const STATE_LABEL = { ok: '目標以上', below: '目標未満', few: '参考', nodata: 'データなし' };
const STATE_COLOR = { ok: 'var(--success)', below: 'var(--warning)', few: 'var(--text-3)', nodata: 'var(--text-3)' };

function rangeLabel(from, to) {
  if (!from || !to) return '';
  return `${weekLabel(from)}〜${weekLabel(to)}`;
}

function Tile({ t }) {
  const isTrial = t.key === 'trial_paid';
  const who = isTrial ? '無料期間の開始' : '登録';
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', minWidth: 0 }}>
      <p style={caption}>{t.label}</p>
      <p style={{ margin: 0, fontSize: 'var(--text-title)', fontWeight: 700, color: t.state === 'nodata' ? 'var(--text-3)' : 'var(--text)', lineHeight: 1.2 }}>
        {t.pct == null ? '—' : `${t.pct}%`}
      </p>
      <p style={{ ...meta, display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)' }}>
        <span style={{ color: STATE_COLOR[t.state], fontWeight: 600, whiteSpace: 'nowrap' }}>
          {t.state === 'few' ? `参考（${t.den} 人）` : STATE_LABEL[t.state]}
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>目標 {t.target}%</span>
      </p>
      {t.den > 0 && <p style={meta}>{t.num} / {t.den} 人{t.pending > 0 ? `・待ち ${t.pending}` : ''}</p>}
      {t.den === 0 && t.pending > 0 && <p style={meta}>判定待ち {t.pending} 人</p>}
      {t.den > 0 && rangeLabel(t.from, t.to) && <p style={meta}>{who} {rangeLabel(t.from, t.to)}</p>}
      {isTrial && t.state === 'nodata' && (
        <p style={meta}>
          {t.noTrialHistory
            ? '契約の履歴（supabase_subscription_events.sql）を入れると数え始めます'
            : '7 日間無料を始めた記録がまだありません'}
        </p>
      )}
    </div>
  );
}

function TargetEditor({ targets, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({ ...targets }));
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
        {LAUNCH_KPIS.map((k) => (
          <label key={k.key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <span style={caption}>{k.short}（%）</span>
            <input
              type="number" inputMode="numeric" min={1} max={100} value={draft[k.key] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [k.key]: e.target.value }))}
              aria-label={`${k.label}の目標（%）`}
              style={input}
            />
          </label>
        ))}
      </div>
      <p style={meta}>目標はこの端末に保存します。既定: 相談 50・メモ 30・30 日後 25・有料 40。</p>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button type="button" onClick={() => onSave(draft)} style={btnPrimary}>目標を保存</button>
        <button type="button" onClick={onCancel} style={btnGhost}>キャンセル</button>
      </div>
    </div>
  );
}

function WeeklyTable({ cohorts }) {
  const th = { padding: 'var(--space-2) var(--space-1)', fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-2)', textAlign: 'right', verticalAlign: 'bottom', lineHeight: 1.3, borderBottom: '1px solid var(--separator)' };
  const td = { padding: 'var(--space-2) var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap', verticalAlign: 'top', borderBottom: '1px solid var(--separator)' };
  return (
    <div style={{ ...card, padding: 'var(--space-3) 0 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <p id="launch-kpi-table-note" style={{ ...meta, padding: '0 var(--space-3)' }}>
        登録した週（月曜はじまり）ごと。上は割合、下は 当てはまった人 / 判定できた人。「待ち」はまだ日数がたっていない人。
      </p>
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table aria-describedby="launch-kpi-table-note" style={{ borderCollapse: 'collapse', width: '100%', minWidth: 340 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...th, textAlign: 'left', paddingLeft: 'var(--space-3)' }}>週</th>
            <th scope="col" style={{ ...th, whiteSpace: 'nowrap' }}>登録</th>
            {LAUNCH_KPIS.map((k, i) => (
              <th key={k.key} scope="col" aria-label={k.short} style={{ ...th, whiteSpace: 'nowrap', ...(i === LAUNCH_KPIS.length - 1 ? { paddingRight: 'var(--space-3)' } : {}) }}>
                {k.col[0]}{k.col[1] && <><br />{k.col[1]}</>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c, ri) => {
            // いちばん下の行は線を引かない（カードの枠と二重にしない）。
            const rowTd = ri === cohorts.length - 1 ? { ...td, borderBottom: 'none' } : td;
            return (
            <tr key={c.week}>
              <th scope="row" style={{ ...rowTd, textAlign: 'left', fontWeight: 600, paddingLeft: 'var(--space-3)' }}>{c.label} 週</th>
              <td style={rowTd}>{c.signups}</td>
              {LAUNCH_KPIS.map((k, i) => {
                const cell = c.cells[k.key];
                const text = cellText(cell);
                const last = i === LAUNCH_KPIS.length - 1;
                return (
                  <td key={k.key} style={last ? { ...rowTd, paddingRight: 'var(--space-3)' } : rowTd}>
                    <span style={{ display: 'block', fontWeight: cell.den > 0 ? 600 : 400, color: cell.den > 0 ? 'var(--text)' : 'var(--text-3)' }}>{text.main}</span>
                    {text.sub && <span style={{ display: 'block', color: 'var(--text-3)' }}>{text.sub}</span>}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

// data: RPC の返り値（null なら未取得）。missing: RPC が無い（SQL 未適用）。
export default function LaunchKpiCard({ data, missing = false }) {
  const [targets, setTargets] = useState(() => loadTargets());
  const [editing, setEditing] = useState(false);
  const view = useMemo(() => normalizeLaunchKpis(data, targets), [data, targets]);
  const actions = view ? launchActions(view.totals) : [];

  return (
    <section aria-labelledby="launch-kpi-title" style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 44 }}>
        <Rocket size={18} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <h2 id="launch-kpi-title" style={{ margin: 0, flex: 1, fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
          ローンチの 4 つの数字
        </h2>
        {view && !editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label="目標を変える"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, border: 'none', background: 'transparent', color: 'var(--text-2)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
            <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>

      {missing && (
        <div style={{ ...card, background: 'var(--warning-soft)', borderColor: 'var(--separator)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 }}>
            まだ数えられません。Supabase の SQL Editor で <b>supabase_admin_launch_kpis.sql</b> を実行してください（7 日間無料 → 有料 は <b>supabase_subscription_events.sql</b> も）。
          </p>
        </div>
      )}

      {view && (
        <>
          <p style={meta}>直近 30 日に結果が決まった人で数えます（数字ごとに待つ日数が違うので登録日の範囲がずれます）。分母が {MIN_DEN} 人未満は参考。</p>
          {editing ? (
            <TargetEditor
              targets={targets}
              onSave={(d) => { setTargets(saveTargets(d)); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-3)' }}>
              {view.totals.map((t) => <Tile key={t.key} t={t} />)}
            </div>
          )}

          {actions.length > 0 && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <p style={{ ...caption, color: 'var(--warning)' }}>目標に届いていない数字の次の一手</p>
              {actions.map((a) => (
                <p key={a.key} style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.5 }}>
                  <b style={{ fontWeight: 600 }}>{a.label} {a.pct}%（目標 {a.target}%）</b> → {a.action}
                </p>
              ))}
            </div>
          )}

          {view.cohorts.length > 0 && <WeeklyTable cohorts={view.cohorts} />}
        </>
      )}
    </section>
  );
}
