// 🗺 「Orime に相談すると、こうなる。」の下の図（2026-11-15 オーナー「わかりやすいイラスト図を入れたい」）。
// 4 つの段（残した一行 → 本に聞く → 本が答える → 明日の一歩）を、線の絵（lucide・面なし・LP の FeatureTiles と同じ描き方）と短い言葉で 1 列に。
// 2026-11-21 から栗色は使わない（DESIGN §3-2・押せない飾りに栗色を使わない）。
// 下の会話の見本（LpTalkFlow）の流れと同じ順。AI で描いた絵は使わない（2026-10-16）。
import { NotebookPen, MessageCircle, BookOpen, Target, ChevronRight } from 'lucide-react';

const STEPS = [
  // 2 行に分ける所を決めておく（狭い画面で「明日の一／歩」と割れないように）
  { Icon: NotebookPen, label: ['残した', '一行'] },
  { Icon: MessageCircle, label: ['本に', '聞く'] },
  { Icon: BookOpen, label: ['本が', '答える'] },
  { Icon: Target, label: ['明日の', '一歩'] },
];

export default function LpTalkDiagram() {
  return (
    <ol className="lp-talk-diagram" aria-label="相談の流れ: 残した一行、本に聞く、本が答える、明日の一歩">
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
