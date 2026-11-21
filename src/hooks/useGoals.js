// 🧭 目標（1・3・5 年後）とロードマップを読む（lib/goals.js・lib/goalRoadmap.js）。
//   行動リストの上の 1 行と、目標の画面が使う。書いたら GOALS_CHANGED_EVENT / ROADMAPS_CHANGED_EVENT で全部が読み直す。
import { useCallback, useEffect, useState } from 'react';
import { readGoals, normalizeGoals, goalsFor, GOALS_CHANGED_EVENT } from '../lib/goals';
import { loadRoadmaps, localRoadmaps, ROADMAPS_CHANGED_EVENT } from '../lib/goalRoadmap';
import { readAppPurpose } from '../lib/appPurpose';
import { useAuth } from './useAuth';

// seeded: 端末の控え（ログインの情報の目標・端末のロードマップ）で、通信を待たずに描ける（2026-11-21）。
//   振り返りの「行動」を開いて 0.6 秒後に目標の 1 行が差し込まれ、行動の一覧が押し下げられていた。
//   loaded は今までどおり読み終えたとき（入れた理由 purpose を使う画面はこちらを待つ）。
export function useGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState(() => (user?.id ? goalsFor(user) : normalizeGoals(null)));
  const [roadmaps, setRoadmaps] = useState(() => localRoadmaps(user?.id));
  const [purpose, setPurpose] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const seeded = !!user?.id;

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

  return { goals, roadmaps, purpose, loaded, seeded, reload };
}

export default useGoals;
