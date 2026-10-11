import { describe, it, expect } from 'vitest';
import {
  GOAL_DEFAULT, normalizePlan, plannedAt, monthEndPlan, weekStartJst, isMondayIso, jstDateIso,
  normalizeWeeks, completedWeeks, monthlyChurnRate, forecastPaid, goalStatus, forecastBasisText,
  funnelRows, evaluateStages, pickWeakest, installGuideFor, seasonView, foundingView,
  reviewNumbers, reviewLine, needsReviewNudge, ASSUMED_MONTHLY_CHURN, STAGES,
} from './goal1000';

const plan = normalizePlan(null);

// 新しい週が先の、終わった週の行を作る（today は 2027-02-15 月曜）。
function weeksFrom(list, startMonday = '2027-02-08') {
  return normalizeWeeks(list.map((r, i) => {
    const d = new Date(Date.parse(`${startMonday}T00:00:00Z`) - i * 7 * 86400000).toISOString().slice(0, 10);
    return { week: d, ...r };
  }));
}

describe('道しるべ（今日あるべき数）', () => {
  it('公開日より前は 0・期限の後は目標', () => {
    expect(plannedAt(plan, '2026-10-11')).toBe(0);
    expect(plannedAt(plan, '2026-11-17')).toBe(0);
    expect(plannedAt(plan, '2026-12-31')).toBe(50);
    expect(plannedAt(plan, '2027-12-31')).toBe(1000);
    expect(plannedAt(plan, '2028-03-01')).toBe(1000);
  });
  it('道しるべの間は日ごとにならす（2027-02-14 は 12 月末 50 と 3 月末 200 の間）', () => {
    const v = plannedAt(plan, '2027-02-14');
    expect(v).toBe(Math.round(50 + 150 * (45 / 90)));
    expect(plannedAt(plan, '2027-06-30')).toBe(400);
  });
  it('月末ごとの表は公開の月から期限の月まで・最後は目標', () => {
    const t = monthEndPlan(plan);
    expect(t[0].month).toBe('2026-11');
    expect(t.find((m) => m.month === '2026-12').n).toBe(50);
    expect(t.find((m) => m.month === '2027-03').n).toBe(200);
    expect(t[t.length - 1]).toEqual({ month: '2027-12', n: 1000 });
    expect(t).toHaveLength(14);
  });
  it('保存された目標を読む（壊れた値は既定・別の指標は既定・期限の日は目標）', () => {
    const p = normalizePlan({ metric: 'paid_users', target: 1200, deadline: '2027-12-31', launch_date: '2026-11-20',
      milestones: [{ d: '2027-06-30', n: 500 }, { d: 'x', n: 3 }, { d: '2027-12-31', n: 900 }] });
    expect(p.target).toBe(1200);
    expect(p.launch).toBe('2026-11-20');
    expect(p.milestones).toEqual([{ d: '2027-06-30', n: 500 }, { d: '2027-12-31', n: 1200 }]);
    expect(normalizePlan({ metric: 'mrr', target: 300000 }).target).toBe(GOAL_DEFAULT.target);
  });
});

describe('日本時間の週', () => {
  it('月曜はじまり', () => {
    expect(weekStartJst('2027-02-15')).toBe('2027-02-15');
    expect(weekStartJst('2027-02-21')).toBe('2027-02-15');
    expect(isMondayIso('2027-02-15')).toBe(true);
    expect(isMondayIso('2027-02-16')).toBe(false);
  });
  it('UTC の夜は日本時間の翌日', () => {
    expect(jstDateIso(new Date('2027-02-14T16:00:00Z'))).toBe('2027-02-15');
  });
});

describe('ずれと必要な速さ', () => {
  const weeks = weeksFrom(Array.from({ length: 8 }, () => ({ new_paid: 12, new_paid_annual: 6, churned: 2, churned_annual: 0, paid_end: 120, paid_annual_end: 60 })),
    '2027-02-08');
  it('予定どおり（あるべき数以上）', () => {
    const s = goalStatus({ plan, current: 130, todayIso: '2027-02-15', weeks, annualNow: 65 });
    expect(s.planned).toBe(plannedAt(plan, '2027-02-15'));
    expect(s.level).toBe('ok');
    expect(s.behind).toBe(0);
    expect(s.ahead).toBe(130 - s.planned);
  });
  it('少しの遅れは behind・80% を下回ると critical', () => {
    const planned = plannedAt(plan, '2027-02-15');
    expect(goalStatus({ plan, current: planned - 3, todayIso: '2027-02-15', weeks }).level).toBe('behind');
    const s = goalStatus({ plan, current: Math.floor(planned * 0.7), todayIso: '2027-02-15', weeks });
    expect(s.level).toBe('critical');
    expect(s.behind).toBe(planned - Math.floor(planned * 0.7));
  });
  it('公開前は prelaunch', () => {
    expect(goalStatus({ plan, current: 0, todayIso: '2026-10-11' }).level).toBe('prelaunch');
  });
  it('必要な速さ＝残り ÷ 残りの週（切り上げ）', () => {
    const s = goalStatus({ plan, current: 130, todayIso: '2027-02-15', weeks });
    const weeksLeft = (Date.parse('2027-12-31') - Date.parse('2027-02-15')) / 86400000 / 7;
    expect(s.requiredPerWeek).toBe(Math.ceil(870 / weeksLeft));
    expect(s.net4).toBe(10);
    expect(s.paceShort).toBe(true);
  });
  it('目標に届いたら必要な速さは 0', () => {
    expect(goalStatus({ plan, current: 1000, todayIso: '2027-11-01' }).requiredPerWeek).toBe(0);
  });
  it('履歴が無ければ見込みは出さず、そう書く', () => {
    const s = goalStatus({ plan, current: 10, todayIso: '2027-01-10', weeks: [] });
    expect(s.forecast).toBeNull();
    expect(forecastBasisText(s)).toMatch(/契約の履歴/);
  });
});

describe('見込み', () => {
  it('解約が無ければ 今 ＋ 新規 × 週', () => {
    expect(forecastPaid({ current: 100, weeklyNew: 10, monthlyShare: 0.5, monthlyChurn: 0, weeksLeft: 10 })).toBe(200);
  });
  it('解約があると少なくなる・月額が多いほど少ない', () => {
    const a = forecastPaid({ current: 100, weeklyNew: 10, monthlyShare: 0.5, monthlyChurn: 0.08, weeksLeft: 40 });
    const b = forecastPaid({ current: 100, weeklyNew: 10, monthlyShare: 1, monthlyChurn: 0.08, weeksLeft: 40 });
    expect(a).toBeLessThan(500);
    expect(b).toBeLessThan(a);
  });
  it('月額の解約率: 月額の人が少ない間は 8% と置く', () => {
    const few = weeksFrom(Array.from({ length: 6 }, () => ({ new_paid: 3, churned: 1, churned_annual: 0, paid_end: 15, paid_annual_end: 5 })));
    expect(monthlyChurnRate(few)).toEqual({ rate: ASSUMED_MONTHLY_CHURN, assumed: true });
  });
  it('月額の解約率: 直近 4 週の月額の解約 ÷ 4 週前の月額の人 × 30/28', () => {
    const rows = weeksFrom(Array.from({ length: 6 }, () => ({ new_paid: 10, churned: 3, churned_annual: 1, paid_end: 200, paid_annual_end: 100 })));
    const r = monthlyChurnRate(rows);
    expect(r.assumed).toBe(false);
    expect(r.rate).toBeCloseTo((8 / 100) * (30 / 28), 6);
  });
  it('計算のしかたの 1 行に、数と期限が入る', () => {
    const weeks = weeksFrom(Array.from({ length: 8 }, () => ({ new_paid: 12, churned: 2, churned_annual: 0, paid_end: 120, paid_annual_end: 60 })));
    const s = goalStatus({ plan, current: 130, todayIso: '2027-02-15', weeks, annualNow: 65 });
    expect(s.forecast).toBeGreaterThan(130);
    expect(forecastBasisText(s)).toMatch(/毎週の新規 12 人/);
    expect(forecastBasisText(s)).toMatch(/2027-12-31/);
  });
  it('今週（途中）は平均に入れない', () => {
    const rows = normalizeWeeks([
      { week: '2027-02-15', new_paid: 0, churned: 0 },
      { week: '2027-02-08', new_paid: 10, churned: 0 },
    ]);
    expect(completedWeeks(rows, '2027-02-15').map((w) => w.week)).toEqual(['2027-02-08']);
    expect(goalStatus({ plan, current: 50, todayIso: '2027-02-15', weeks: rows }).net4).toBe(10);
  });
});

describe('いちばん弱い段階', () => {
  const base = { first_consult: { num: 53, den: 100 }, memos10: { num: 31, den: 100 }, trial_paid: { num: 42, den: 100 }, d30: { num: 27, den: 100 } };
  const rows = funnelRows(weeksFrom(Array.from({ length: 5 }, (_, i) => ({ lp_views: 1000 - i * 10, signups: 300, trial_starts: 33, new_paid: 10, churned: 1 }))),
    [], Array.from({ length: 5 }, (_, i) => ({ week_start: new Date(Date.parse('2027-02-08T00:00:00Z') - i * 7 * 86400000).toISOString().slice(0, 10), installs: 600, store_page_views: 1800 })));

  it('全部目標以上なら選ばない', () => {
    const st = evaluateStages({ rows, todayIso: '2027-02-15', launchTotals: base, shareUsers: 20, paid: 100 });
    expect(pickWeakest(st)).toBeNull();
    expect(st.map((s) => s.key)).toEqual(STAGES.map((s) => s.key));
  });
  it('目標との比がいちばん小さい段階を 1 つ', () => {
    const st = evaluateStages({ rows, todayIso: '2027-02-15', launchTotals: { ...base, memos10: { num: 24, den: 100 }, trial_paid: { num: 24, den: 100 } }, shareUsers: 20, paid: 100 });
    const w = pickWeakest(st);
    expect(w.key).toBe('trial_paid'); // 24/40=0.6 < 24/30=0.8
    expect(w.actions.length).toBeGreaterThanOrEqual(1);
    expect(w.actions.length).toBeLessThanOrEqual(3);
  });
  it('分母が少ない段階（参考）は選ばない', () => {
    const st = evaluateStages({ rows, todayIso: '2027-02-15', launchTotals: { ...base, d30: { num: 1, den: 8 } }, shareUsers: 20, paid: 100 });
    expect(st.find((s) => s.key === 'd30').state).toBe('few');
    expect(pickWeakest(st)).toBeNull();
  });
  it('インストールは月の目安 ÷ 週と比べる', () => {
    expect(installGuideFor('2027-02')).toBe(2000);
    expect(installGuideFor('2026-11')).toBe(1000);
    expect(installGuideFor('2028-01')).toBe(3500);
    const st = evaluateStages({ rows, todayIso: '2027-02-15', launchTotals: base, shareUsers: 20, paid: 100 });
    const inst = st.find((s) => s.key === 'install');
    expect(inst.state).toBe('ok');
    expect(inst.need).toBeCloseTo(2000 * 7 / 30, 6);
  });
  it('訪問が前の 3 週より減ると below・手入力が無ければデータなし', () => {
    const falling = rows.map((r, i) => ({ ...r, lpViews: 900 + i * 50 }));
    const st = evaluateStages({ rows: falling, todayIso: '2027-02-15', launchTotals: base });
    expect(st.find((s) => s.key === 'aware').state).toBe('below');
    expect(evaluateStages({ rows, todayIso: '2027-02-15', launchTotals: base }).find((s) => s.key === 'aware').state).toBe('ok');
    const st2 = evaluateStages({ rows: rows.map((r) => ({ ...r, installs: null, storeViews: null })), todayIso: '2027-02-15', launchTotals: base });
    expect(st2.find((s) => s.key === 'interest').state).toBe('nodata');
    expect(st2.find((s) => s.key === 'install').state).toBe('nodata');
  });
  it('同じ比なら前の段階', () => {
    const st = [
      { key: 'a', state: 'below', ratio: 0.5 },
      { key: 'b', state: 'below', ratio: 0.5 },
      { key: 'c', state: 'ok', ratio: 0.1 },
    ];
    expect(pickWeakest(st).key).toBe('a');
  });
});

describe('毎週の流れの表', () => {
  it('登録した週の相談・メモ、手入力のインストールを同じ週に並べる・年額の割合', () => {
    const w = normalizeWeeks([{ week: '2027-02-08', signups: 10, new_paid: 4, new_paid_annual: 1, churned: 1, churned_annual: 0, paid_end: 40, paid_annual_end: 10 }]);
    const r = funnelRows(w, [{ week: '2027-02-08', first_consult: { num: 5, den: 10 }, memos10: { num: 2, den: 10 } }], [{ week_start: '2027-02-08', installs: '30', store_page_views: null }]);
    expect(r[0].firstConsult).toEqual({ num: 5, den: 10 });
    expect(r[0].installs).toBe(30);
    expect(r[0].storeViews).toBeNull();
    expect(r[0].newPaidMonthly).toBe(3);
    expect(r[0].net).toBe(3);
    expect(r[0].annualShare).toBe(0.25);
  });
  it('契約の履歴が無い週は null のまま（0 と書かない）', () => {
    const r = normalizeWeeks([{ week: '2027-02-08', signups: 3, new_paid: null, churned: null }]);
    expect(r[0].net).toBeNull();
    expect(r[0].newPaidMonthly).toBeNull();
  });
});

describe('季節と創業メンバーの更新', () => {
  it('終わった山場は出さず、30 日以内は準備', () => {
    const v = seasonView('2026-12-10');
    expect(v[0]).toMatchObject({ id: 'y2026', state: 'now' });
    expect(v[1]).toMatchObject({ id: 'ny2027', state: 'prep', daysUntil: 22 });
    expect(seasonView('2027-02-15').map((s) => s.id)).toEqual(['sp2027', 'y2027']);
  });
  it('創業メンバーの更新まで・1 か月前から準備', () => {
    const f = { count: 42, renew_from: '2027-11-17', renew_to: '2027-12-16' };
    expect(foundingView(f, '2027-02-15')).toMatchObject({ count: 42, state: 'later', guessed: false });
    expect(foundingView(f, '2027-10-20').state).toBe('prep');
    expect(foundingView(f, '2027-11-20').state).toBe('now');
    expect(foundingView(f, '2027-02-15').daysUntil).toBe(275);
    expect(foundingView(null, '2026-10-11')).toMatchObject({ count: 0, guessed: true, from: '2027-11-17' });
  });
});

describe('毎週の見直し', () => {
  it('1 行にまとめる', () => {
    const weeks = weeksFrom(Array.from({ length: 4 }, () => ({ new_paid: 12, churned: 2, churned_annual: 0, paid_end: 120, paid_annual_end: 60 })));
    const s = goalStatus({ plan, current: 100, todayIso: '2027-02-15', weeks });
    const n = reviewNumbers(s, { key: 'memos10' });
    const line = reviewLine(n);
    expect(line).toMatch(/^有料 100/);
    expect(line).toMatch(/遅れ \d+/);
    expect(line).toMatch(/弱い段階 ⑤/);
    expect(reviewLine(null)).toBe('');
  });
  it('月曜に今週の記録が無いときだけ知らせる', () => {
    expect(needsReviewNudge('2027-02-15', [])).toBe(true);
    expect(needsReviewNudge('2027-02-15', [{ week_start: '2027-02-15' }])).toBe(false);
    expect(needsReviewNudge('2027-02-16', [])).toBe(false);
  });
});
