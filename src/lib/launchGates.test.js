import { describe, it, expect } from 'vitest';
import { GATES, GATE_GROUPS, evaluateGates, groupGates, gateHeadline } from './launchGates';
import { HEALTH_ENV_KEYS, HEALTH_SQL_KEYS } from '../../api/_launchHealthKeys.js';

describe('公開の準備（売上までの関門・2026-10-22）', () => {
  it('一覧のキーは api/launch-health.js が返すキーに全部ある', () => {
    for (const g of GATES) {
      for (const k of g.env || []) expect(HEALTH_ENV_KEYS, `${g.id}: env ${k}`).toContain(k);
      for (const k of g.sql || []) expect(HEALTH_SQL_KEYS, `${g.id}: sql ${k}`).toContain(k);
      expect(GATE_GROUPS.map((x) => x.id), `${g.id}: group`).toContain(g.group);
      expect(g.where, `${g.id}: where`).toBeTruthy();
    }
    expect(new Set(GATES.map((g) => g.id)).size).toBe(GATES.length);
  });
  it('全部 true なら ✓・1 つでも false なら まだ・無ければ null', () => {
    const env = Object.fromEntries(HEALTH_ENV_KEYS.map((k) => [k, true]));
    const sql = Object.fromEntries(HEALTH_SQL_KEYS.map((k) => [k, true]));
    const all = evaluateGates({ env, sql, admin: true });
    expect(all.every((r) => r.ok === true)).toBe(true);
    expect(gateHeadline(all)).toBe('売れる状態です');
    const one = evaluateGates({ env: { ...env, anthropic: false }, sql, admin: true });
    expect(one.find((r) => r.id === 'env_anthropic').ok).toBe(false);
    expect(gateHeadline(one)).toBe('売るまでに あと 1 つ');
    const notAdmin = evaluateGates({ env, sql, admin: false });
    expect(notAdmin.find((r) => r.id === 'sql_admin').ok).toBe(false);
    const none = evaluateGates(null);
    expect(none.every((r) => r.ok === null)).toBe(true);
    expect(gateHeadline(none)).toBe('確かめられませんでした');
  });
  it('グループごとに まだ の数を数える', () => {
    const env = Object.fromEntries(HEALTH_ENV_KEYS.map((k) => [k, false]));
    const sql = Object.fromEntries(HEALTH_SQL_KEYS.map((k) => [k, false]));
    const groups = groupGates(evaluateGates({ env, sql, admin: false }));
    expect(groups.map((g) => g.id)).toEqual(['sell', 'ios', 'measure', 'boost']);
    expect(groups.reduce((s, g) => s + g.pending, 0)).toBe(GATES.length);
  });
});
