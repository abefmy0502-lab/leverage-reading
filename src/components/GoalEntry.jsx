// 🧭 振り返り › 行動 のいちばん上の 1 行（2026-11-15 オーナー決定「置き場所は 振り返り › 行動 のいちばん上」）。
//   いちばん近い目標（1 年後 → 3 年後 → 5 年後）と、いまの区切りで取り組むこと。押すと目標の画面（GoalScreen）。
import { ChevronRight } from 'lucide-react';
import './goals.css';
import { useGoals } from '../hooks/useGoals';
import { GOAL_HORIZONS, fmtGoalDeadline } from '../lib/goals';
import { currentPhaseIndex } from '../lib/goalRoadmap';
import { appNow } from '../lib/appNow';
import { withPhraseBreaks } from './TightBubble';

export default function GoalEntry({ onOpen }) {
  const { goals, roadmaps, loaded } = useGoals();
  if (!loaded) return null;
  const h = GOAL_HORIZONS.find((x) => goals[x.key]?.text);
  if (!h) {
    return (
      <button type="button" className="goal-entry" onClick={() => onOpen?.({ view: 'goals' })}>
        <span className="goal-entry-body">
          <p className="goal-entry-label">目標</p>
          <p className="goal-entry-text">{withPhraseBreaks('1 年後・3 年後・5 年後の目標を書く')}</p>
          <p className="goal-entry-next">{withPhraseBreaks('目標から、やることと読む本の順番を決めます')}</p>
        </span>
        <ChevronRight className="goal-entry-chev" size={20} aria-hidden="true" />
      </button>
    );
  }
  const g = goals[h.key];
  const rm = roadmaps[h.key]?.roadmap;
  const phase = rm ? rm.phases?.[currentPhaseIndex(h.key, roadmaps[h.key].goalAt || g.at, appNow())] : null;
  const next = rm ? (phase?.focus ? `いま：${phase.focus}` : 'ロードマップを見る') : '達成するには？を考える';
  return (
    <button type="button" className="goal-entry" onClick={() => onOpen?.({ view: rm ? 'roadmap' : 'goals', horizon: h.key })}>
      <span className="goal-entry-body">
        <p className="goal-entry-label">{`${h.label}の目標 · ${fmtGoalDeadline(g.at, h.years)}`}</p>
        <p className="goal-entry-text">{withPhraseBreaks(g.text)}</p>
        <p className="goal-entry-next">{withPhraseBreaks(next)}</p>
      </span>
      <ChevronRight className="goal-entry-chev" size={20} aria-hidden="true" />
    </button>
  );
}
