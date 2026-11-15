// 🧭 目標（1・3・5 年後）とロードマップを読む（lib/goals.js・lib/goalRoadmap.js）。
//   行動リストの上の 1 行と、目標の画面が使う。書いたら GOALS_CHANGED_EVENT / ROADMAPS_CHANGED_EVENT で全部が読み直す。
import { useCallback, useEffect, useState } from 'react';
import { readGoals, normalizeGoals, GOALS_CHANGED_EVENT } from '../lib/goals';
import { loadRoadmaps, ROADMAPS_CHANGED_EVENT } from '../lib/goalRoadmap';
import { readAppPurpose } from '../lib/appPurpose';

export function useGoals() {
  const [goals, setGoals] = useState(() => normalizeGoals(null));
  const [roadmaps, setRoadmaps] = useState({});
  const [purpose, setPurpose] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [g, r, p] = await Promise.all([
      readGoals().catch(() => normalizeGoals(null)),
      loadRoadmaps().catch(() => ({})),
      readAppPurpose().catch(() => null),
    ]);
    setGoals(g);
    setRoadmaps(r || {});
    setPurpose(p);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
    const onGoals = (e) => { if (e?.detail?.goals) setGoals(normalizeGoals(e.detail.goals)); };
    const onRoadmaps = () => { loadRoadmaps().then((r) => setRoadmaps(r || {})).catch(() => {}); };
    window.addEventListener(GOALS_CHANGED_EVENT, onGoals);
    window.addEventListener(ROADMAPS_CHANGED_EVENT, onRoadmaps);
    return () => {
      window.removeEventListener(GOALS_CHANGED_EVENT, onGoals);
      window.removeEventListener(ROADMAPS_CHANGED_EVENT, onRoadmaps);
    };
  }, [reload]);

  return { goals, roadmaps, purpose, loaded, reload };
}

export default useGoals;
