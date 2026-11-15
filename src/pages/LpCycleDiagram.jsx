// 🔁 読書が回り続ける図（2026-11-15 オーナー「読む → 考えが整う → 行動する → 手応えがあって次の本を読む、を図で・
//   月一冊の費用の投資で、なりたい姿を叶えるためのレバレッジがかかる、みたいな」）。
// 輪（栗色の線と 4 つの矢印）の上下左右に段の名前、真ん中に「月 本 1 冊分で、回り続ける」。効果は言い切らない（ガードレール）。
import { BookOpen, MessageCircle, Footprints, Sparkles } from 'lucide-react';

const STEPS = [
  { pos: 'top', Icon: BookOpen, label: ['読む'] },
  { pos: 'right', Icon: MessageCircle, label: ['相談して', '考えが整う'] },
  { pos: 'bottom', Icon: Footprints, label: ['明日の一歩を', '試す'] },
  { pos: 'left', Icon: Sparkles, label: ['手応えが', '次の 1 冊へ'] },
];

// 輪の上の 4 つの矢印（時計回り・45°・135°・225°・315° の位置）
const R = 100;
const C = 130;
function arrowAt(deg) {
  const a = (deg * Math.PI) / 180;
  const x = C + R * Math.cos(a);
  const y = C + R * Math.sin(a);
  const rot = deg + 90; // 進む向き（時計回り）
  return { x, y, rot };
}

export default function LpCycleDiagram() {
  const arrows = [-45, 45, 135, 225].map(arrowAt);
  return (
    <figure className="lp-cycle" aria-label="読む、相談して考えが整う、明日の一歩を試す、手応えが次の 1 冊へ、の順に回り続ける図">
      <div className="lp-cycle-ring">
        <svg viewBox="0 0 260 260" aria-hidden="true" className="lp-cycle-svg">
          <circle cx={C} cy={C} r={R} fill="none" className="lp-cycle-line" />
          {arrows.map(({ x, y, rot }) => (
            <path key={rot} d="M -7 -7 L 2 0 L -7 7" transform={`translate(${x} ${y}) rotate(${rot})`} className="lp-cycle-arrow" />
          ))}
        </svg>
        <p className="lp-cycle-center"><span>回り続ける</span><span>読書</span></p>
        {STEPS.map(({ pos, Icon, label }) => (
          <div key={pos} className={`lp-cycle-step is-${pos}`}>
            <span className="lp-cycle-icon" aria-hidden="true"><Icon size="1em" strokeWidth={1.75} /></span>
            <span className="lp-cycle-label">{label.map((t) => <span key={t}>{t}</span>)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
