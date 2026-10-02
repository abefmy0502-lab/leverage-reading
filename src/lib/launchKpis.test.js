import { describe, it, expect } from 'vitest';
import {
  LAUNCH_KPIS, MIN_DEN, defaultTargets, mergeTargets, loadTargets, saveTargets, TARGETS_KEY,
  pctOf, kpiState, weekLabel, normalizeLaunchKpis, cellText, launchActions,
} from './launchKpis';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};

describe('目標', () => {
  it('既定はオーナーの決めた値（相談 50・メモ 30・D30 25・有料 40）', () => {
    expect(defaultTargets()).toEqual({ first_consult: 50, memos10: 30, d30: 25, trial_paid: 40 });
    expect(LAUNCH_KPIS.map((k) => k.key)).toEqual(['first_consult', 'memos10', 'd30', 'trial_paid']);
  });
  it('保存した値をまぜる（範囲外・壊れた値は既定）', () => {
    expect(mergeTargets({ first_consult: 60, memos10: 0, d30: 'x', trial_paid: 140 }))
      .toEqual({ first_consult: 60, memos10: 1, d30: 25, trial_paid: 100 });
    expect(mergeTargets(null)).toEqual(defaultTargets());
  });
  it('端末に保存して読み戻す・読めなくても既定', () => {
    const s = memStorage();
    saveTargets({ first_consult: 55 }, s);
    expect(JSON.parse(s._m.get(TARGETS_KEY)).first_consult).toBe(55);
    expect(loadTargets(s).first_consult).toBe(55);
    expect(loadTargets({ getItem: () => { throw new Error('blocked'); } })).toEqual(defaultTargets());
    expect(loadTargets({ getItem: () => '{broken' })).toEqual(defaultTargets());
  });
});

describe('割合と状態', () => {
  it('pctOf: 分母 0 は null・四捨五入', () => {
    expect(pctOf(0, 0)).toBe(null);
    expect(pctOf(1, 3)).toBe(33);
    expect(pctOf('2', '3')).toBe(67);
  });
  it('kpiState: データなし / 参考 / 目標以上 / 未満', () => {
    expect(kpiState(null, 0, 50)).toBe('nodata');
    expect(kpiState(80, MIN_DEN - 1, 50)).toBe('few');
    expect(kpiState(50, MIN_DEN, 50)).toBe('ok');
    expect(kpiState(49, 40, 50)).toBe('below');
  });
  it('weekLabel', () => {
    expect(weekLabel('2026-11-02')).toBe('11/2');
    expect(weekLabel('')).toBe('');
  });
});

const sample = {
  generated_at: '2026-12-20T00:00:00Z',
  sources: { trial_history: true, trial_rows: 40, trial_starts: 25 },
  totals: {
    first_consult: { num: 30, den: 50, pending: 4, from: '2026-11-19', to: '2026-12-19' },
    memos10: { num: 9, den: 40, pending: 10, from: '2026-11-13', to: '2026-12-13' },
    d30: { num: 3, den: 8, pending: 60, from: '2026-10-14', to: '2026-11-13' },
    trial_paid: { num: 8, den: 20, pending: 5, from: '2026-11-12', to: '2026-12-12' },
  },
  cohorts: [
    { week: '2026-12-14', signups: 12, first_consult: { num: 5, den: 8, pending: 4 }, memos10: { num: 0, den: 0, pending: 12 }, d30: { num: 0, den: 0, pending: 12 }, trial_paid: { started: 2, num: 0, den: 0, pending: 2 } },
    { week: '2026-12-07', signups: 0, first_consult: { num: 0, den: 0, pending: 0 }, memos10: { num: 0, den: 0, pending: 0 }, d30: { num: 0, den: 0, pending: 0 }, trial_paid: { started: 0, num: 0, den: 0, pending: 0 } },
  ],
};

describe('normalizeLaunchKpis', () => {
  it('合計を割合・状態つきに', () => {
    const r = normalizeLaunchKpis(sample);
    const by = Object.fromEntries(r.totals.map((t) => [t.key, t]));
    expect(by.first_consult).toMatchObject({ pct: 60, target: 50, state: 'ok', from: '2026-11-19', to: '2026-12-19' });
    expect(by.memos10).toMatchObject({ pct: 23, state: 'below' });
    expect(by.d30).toMatchObject({ pct: 38, state: 'few' });
    expect(by.trial_paid).toMatchObject({ pct: 40, state: 'ok', noTrialHistory: false });
    expect(r.trialHasData).toBe(true);
  });
  it('週ごとのマス', () => {
    const r = normalizeLaunchKpis(sample);
    expect(r.cohorts[0]).toMatchObject({ week: '2026-12-14', label: '12/14', signups: 12 });
    expect(r.cohorts[0].cells.first_consult).toMatchObject({ num: 5, den: 8, pct: 63 });
    expect(cellText(r.cohorts[0].cells.first_consult)).toEqual({ main: '63%', sub: '5/8' });
    expect(cellText(r.cohorts[0].cells.memos10)).toEqual({ main: '待ち', sub: '12 人' });
    expect(cellText(r.cohorts[1].cells.d30)).toEqual({ main: '—', sub: '' });
    expect(r.cohorts[0].cells.trial_paid.started).toBe(2);
  });
  it('契約の履歴が無い（表が無い／記録 0 件）→ ④ はデータなし', () => {
    const noTable = normalizeLaunchKpis({ ...sample, sources: { trial_history: false } });
    const t1 = noTable.totals.find((t) => t.key === 'trial_paid');
    expect(t1).toMatchObject({ state: 'nodata', pct: null, den: 0, noTrialHistory: true });
    expect(cellText(noTable.cohorts[0].cells.trial_paid).main).toBe('—');
    const empty = normalizeLaunchKpis({ ...sample, sources: { trial_history: true, trial_starts: 0 } });
    expect(empty.totals.find((t) => t.key === 'trial_paid')).toMatchObject({ state: 'nodata', noTrialHistory: false });
  });
  it('目標を変えると状態も変わる', () => {
    const r = normalizeLaunchKpis(sample, { ...defaultTargets(), first_consult: 70 });
    expect(r.totals[0].state).toBe('below');
  });
  it('空・壊れた返り値でも落ちない', () => {
    expect(normalizeLaunchKpis(null)).toBe(null);
    const r = normalizeLaunchKpis({});
    expect(r.totals.every((t) => t.state === 'nodata')).toBe(true);
    expect(r.cohorts).toEqual([]);
  });
});

describe('launchActions', () => {
  it('目標に届かない数字だけ（参考・データなしは出さない）', () => {
    const r = normalizeLaunchKpis(sample);
    const a = launchActions(r.totals);
    expect(a.map((x) => x.key)).toEqual(['memos10']);
    expect(a[0].action).toMatch(/取り込み/);
  });
});
