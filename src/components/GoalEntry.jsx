// 🧭 振り返り › 行動 のいちばん上の 1 行（2026-11-15 オーナー決定「置き場所は 振り返り › 行動 のいちばん上」）。
//   いちばん近い目標（1 年後 → 3 年後 → 5 年後）と、いまの区切りで取り組むこと。押すと目標の画面（GoalScreen）。
import { ChevronRight } from 'lucide-react';
import './goals.css';
import { useGoals } from '../hooks/useGoals';
import { GOAL_HORIZONS, ALL_GOALS_KEY, fmtGoalDeadlineNow, allGoalsSet } from '../lib/goals';
import { currentPhaseIndex, overdueGoals } from '../lib/goalRoadmap';
import { appNow } from '../lib/appNow';
import { withPhraseBreaks } from './TightBubble';

export default function GoalEntry({ onOpen }) {
  const { goals, roadmaps, loaded, seeded } = useGoals();
  if (!loaded && !seeded) return null;
  // いちばん近い、まだ期限の来ていない目標（全部過ぎていればいちばん近い目標・2026-11-17 長く使ったとき）。
  const passed = new Set(overdueGoals(goals, appNow()).map((o) => o.key));
  const h = GOAL_HORIZONS.find((x) => goals[x.key]?.text && !passed.has(x.key)) || GOAL_HORIZONS.find((x) => goals[x.key]?.text);
  if (!h) {
    return (
      <button type="button" className="goal-entry" onClick={() => onOpen?.({ view: 'goals' })}>
        <span className="goal-entry-body">
          <span className="goal-entry-text" style={{ marginTop: 0 }}>{withPhraseBreaks('1 年後・3 年後・5 年後の目標を書く')}</span>
          <span className="goal-entry-next">{withPhraseBreaks('目標から、読む本と読む順番を決めます')}</span>
        </span>
        <ChevronRight className="goal-entry-chev" size="1.1em" aria-hidden="true" />
      </button>
    );
  }
  const g = goals[h.key];
  // ロードマップは 3 つの目標をつなぐ 1 本（2026-11-16）。
  const rec = roadmaps[ALL_GOALS_KEY];
  const rm = rec?.roadmap;
  const now = appNow();
  const phase = rm ? rm.phases?.[currentPhaseIndex(ALL_GOALS_KEY, rec.goalAt || g.at, now)] : null;
  const overdue = overdueGoals(goals, now).length > 0;
  const next = overdue
    ? '期限が過ぎた目標があります。書き直しましょう'
    : rm
    ? (phase?.focus ? `いま：${phase.focus}` : 'ロードマップを見る')
    : allGoalsSet(goals) ? 'ロードマップをつくる' : '3 つの目標を書くと、ロードマップをつくれます';
  return (
    <button type="button" className="goal-entry" onClick={() => onOpen?.({ view: rm && !overdue ? 'roadmap' : 'goals', horizon: rm && !overdue ? ALL_GOALS_KEY : null })}>
      <span className="goal-entry-body">
        <span className="goal-entry-label"><span style={{ whiteSpace: 'nowrap' }}>{`${h.label}の目標`}</span>{' · '}<span style={{ whiteSpace: 'nowrap' }}>{fmtGoalDeadlineNow(g.at, h.years, now)}</span></span>
        <span className="goal-entry-text">{withPhraseBreaks(g.text)}</span>
        <span className="goal-entry-next">{withPhraseBreaks(next)}</span>
      </span>
      <ChevronRight className="goal-entry-chev" size="1.1em" aria-hidden="true" />
    </button>
  );
}
