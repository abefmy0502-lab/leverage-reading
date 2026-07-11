// 🎯 TodayCard — 操縦席の最上部に常設する「今日の一手」1枚。
// 開いた瞬間 10 秒で今日の最重要アクションが決まることが唯一の仕事。
// 判定は src/lib/playbook.js の純関数（todayAction）。ここは表示のみ。
import { useMemo } from 'react';
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

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.hairlineStrong}`, borderTop: `3px solid ${C.brand}`,
      borderRadius: 16, padding: 16, margin: '14px 0 4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.brand }}>🎯 今日の一手</span>
        <span style={{ fontSize: 11, color: C.ink3 }}>{dateLabel}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
          background: phase === 'prelaunch' ? '#fdf6e3' : 'var(--c-positive-soft, #e2ecd8)',
          color: phase === 'prelaunch' ? '#8a6d3b' : '#4c6b4c', border: `1px solid ${C.hairline}` }}>
          {phase === 'prelaunch' ? '🛠 配信前' : '🚀 配信中'}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>
        {act.headline}
        {act.mins != null && <span style={{ fontSize: 12, color: C.ink3, fontWeight: 600 }}>（{act.mins}分）</span>}
      </p>
      <p style={{ margin: '5px 0 0', fontSize: 11, color: C.ink3, lineHeight: 1.6 }}>{act.why}</p>

      {act.vetoes.length > 0 && (
        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#b75050', lineHeight: 1.6 }}>
          ⛔ いま触らない: {act.vetoes.join(' / ')}
        </p>
      )}

      {/* 今日の台本（曜日固定ルーチン）。司令とは別に常時表示 — これが週6.5hの背骨。 */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.hairline}` }}>
        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: C.ink2 }}>
          📜 今日の台本{isWeekday && <span style={{ fontWeight: 600, color: C.ink3 }}>　検索語:「{replyTermOf(today)}」</span>}
        </p>
        {act.script.map((s, i) => (
          <p key={i} style={{ margin: '3px 0', fontSize: 12, color: C.ink2, lineHeight: 1.6 }}>
            <span style={{ display: 'inline-block', minWidth: 42, fontWeight: 700, color: C.ink }}>{s.time}</span>
            {s.title}<span style={{ color: C.ink3 }}>（{s.mins}分）</span>
          </p>
        ))}
      </div>
    </div>
  );
}
