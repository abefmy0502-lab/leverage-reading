// TodayCard — 操縦席の最上部に常設する「今日の一手」1枚。
// 開いた瞬間 10 秒で今日の最重要アクションが決まることが唯一の仕事。
// 判定は src/lib/playbook.js の純関数（todayAction）。ここは表示のみ。
import { useMemo } from 'react';
import { Target, Wrench, Rocket, Ban, ScrollText } from 'lucide-react';
import { C } from '../../styles/ui';
import { todayAction, replyTermOf } from '../../lib/playbook';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export default function TodayCard({ phase, launchDate, weekly, rules, shipChecks }) {
  const today = useMemo(() => new Date(), []);
  const act = useMemo(
    () => todayAction({ today, phase, launchDate, weekly, rules, shipChecks }),
    [today, phase, launchDate, weekly, rules, shipChecks],
  );
  const dateLabel = `${today.getMonth() + 1}/${today.getDate()}（${DOW[today.getDay()]}）`;
  const isWeekday = today.getDay() >= 1 && today.getDay() <= 5;

  // 見た目はトークンだけ（色の直書き・絵文字をやめた・2026-10-04 ui-critic）。状態は --success / --warning の面と文字。
  const icon = { size: '1em', strokeWidth: 2, 'aria-hidden': 'true', style: { flexShrink: 0 } };
  const prelaunch = phase === 'prelaunch';
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.hairlineStrong}`,
      borderRadius: 'var(--radius)', padding: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-caption)', fontWeight: 700, color: C.ink }}><Target {...icon} />今日の一手</span>
        <span style={{ fontSize: 'var(--text-caption)', color: C.ink3 }}>{dateLabel}</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-caption)', fontWeight: 600, padding: '0 var(--space-2)', minHeight: 24, borderRadius: 'var(--radius-full)',
          background: prelaunch ? 'var(--warning-soft)' : 'var(--success-soft)',
          color: prelaunch ? 'var(--warning)' : 'var(--success)' }}>
          {prelaunch ? <><Wrench {...icon} />配信前</> : <><Rocket {...icon} />配信中</>}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>
        {act.headline}
        {act.mins != null && <span style={{ fontSize: 'var(--text-caption)', color: C.ink3, fontWeight: 600 }}>（{act.mins}分）</span>}
      </p>
      <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-caption)', color: C.ink3, lineHeight: 1.6 }}>{act.why}</p>

      {act.vetoes.length > 0 && (
        <p style={{ margin: 'var(--space-2) 0 0', display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)', fontSize: 'var(--text-caption)', color: 'var(--error)', lineHeight: 1.6 }}>
          <Ban {...icon} style={{ flexShrink: 0, alignSelf: 'center' }} /><span>いま触らない: {act.vetoes.join(' / ')}</span>
        </p>
      )}

      {/* 今日の台本（曜日固定ルーチン）。司令とは別に常時表示 — これが週6.5hの背骨。 */}
      <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: `1px solid ${C.hairline}` }}>
        <p style={{ margin: '0 0 var(--space-1)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-1)', fontSize: 'var(--text-caption)', fontWeight: 700, color: C.ink2 }}>
          <ScrollText {...icon} />今日の台本{isWeekday && <span style={{ fontWeight: 600, color: C.ink3 }}>　検索語:「{replyTermOf(today)}」</span>}
        </p>
        {act.script.map((s, i) => (
          <p key={i} style={{ margin: 'var(--space-1) 0', fontSize: 'var(--text-caption)', color: C.ink2, lineHeight: 1.6 }}>
            <span style={{ display: 'inline-block', minWidth: '3.5em', fontWeight: 700, color: C.ink }}>{s.time}</span>
            {s.title}<span style={{ color: C.ink3 }}>（{s.mins}分）</span>
          </p>
        ))}
      </div>
    </div>
  );
}
