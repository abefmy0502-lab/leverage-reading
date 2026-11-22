// 🧭 LP「1 年後の自分から、逆算して読む。」の図（2026-11-15 オーナー「目標・ロードマップ・読書計画カレンダーの内容も LP に入れたい」）。
// 4 つの段（目標 → 達成するには？ → ロードマップ → 読書計画）を、LpTalkDiagram と同じ線の絵と短い言葉で 1 列に（同じ見た目＝landing.css の .lp-talk-diagram）。
// 強調は最後のアイコンの線だけ栗色。AI で描いた絵は使わない（2026-10-16）。
import { Flag, MessageCircleQuestion, Map as MapIcon, CalendarDays, ChevronRight } from 'lucide-react';

const STEPS = [
  { Icon: Flag, label: ['1・3・5 年後の', '目標'] },
  { Icon: MessageCircleQuestion, label: ['達成する', 'には？'] },
  { Icon: MapIcon, label: ['ロード', 'マップ'] },
  { Icon: CalendarDays, label: ['読む本の', 'カレンダー'] },
];

export default function LpGoalDiagram() {
  return (
    <ol className="lp-talk-diagram is-goal" aria-label="目標から読書計画まで: 1・3・5 年後の目標、達成するには？、ロードマップ、読む本のカレンダー">
      {STEPS.map(({ Icon, label }, i) => [
        i > 0 && <li key={`a${i}`} className="lp-talk-diagram-arrow" aria-hidden="true" role="presentation"><ChevronRight size="1em" /></li>,
        <li key={label.join('')} className={`lp-talk-diagram-node${i === STEPS.length - 1 ? ' is-last' : ''}`}>
          <Icon className="lp-talk-diagram-icon" size="1em" strokeWidth={1.5} aria-hidden="true" />
          <span className="lp-talk-diagram-label">{label.map((t) => <span key={t}>{t}</span>)}</span>
        </li>,
      ])}
    </ol>
  );
}
