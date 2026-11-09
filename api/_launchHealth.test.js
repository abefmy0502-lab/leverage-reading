// 🚀 公開の準備の SQL の確かめ方（api/_launchHealth.js の probeSql）。
//   2026-11-09: id 列の無い表（subscriptions / app_admins …）が「ない」になっていた＝列が無い文を表が無いと読んでいた。
import { describe, it, expect } from 'vitest';
import { probeSql, envHealth } from './_launchHealth.js';

const clientWith = (error) => ({
  from: () => ({ select: () => ({ limit: async () => ({ error }) }) }),
  rpc: async () => ({ error }),
});

describe('probeSql（表）', () => {
  it('読めれば ある', async () => {
    expect(await probeSql(clientWith(null), { table: 'subscriptions' })).toBe(true);
  });
  it('表が無い（42P01・PGRST205・relation … does not exist）は ない', async () => {
    expect(await probeSql(clientWith({ code: '42P01', message: 'relation "public.x" does not exist' }), { table: 'x' })).toBe(false);
    expect(await probeSql(clientWith({ code: 'PGRST205', message: "Could not find the table 'public.x' in the schema cache" }), { table: 'x' })).toBe(false);
    expect(await probeSql(clientWith({ code: '', message: 'relation "x" does not exist' }), { table: 'x' })).toBe(false);
  });
  it('id 列の無い表（主キーが別の名前）は ある', async () => {
    const err = { code: '42703', message: 'column subscriptions.id does not exist' };
    expect(await probeSql(clientWith(err), { table: 'subscriptions' })).toBe(true);
    const err2 = { code: 'PGRST204', message: "Could not find the 'id' column of 'app_admins' in the schema cache" };
    expect(await probeSql(clientWith(err2), { table: 'app_admins' })).toBe(true);
    const err3 = { code: '', message: 'column app_admins.id does not exist' };
    expect(await probeSql(clientWith(err3), { table: 'app_admins' })).toBe(true);
  });
  it('確かめたい列が無いときは ない', async () => {
    const err = { code: '42703', message: 'column ai_usage.cost_mjpy does not exist' };
    expect(await probeSql(clientWith(err), { table: 'ai_usage', column: 'cost_mjpy' })).toBe(false);
  });
  it('権限などほかの失敗は、列を確かめないなら ある', async () => {
    const err = { code: '42501', message: 'permission denied for table subscriptions' };
    expect(await probeSql(clientWith(err), { table: 'subscriptions' })).toBe(true);
    expect(await probeSql(clientWith(err), { table: 'ai_usage', column: 'cost_mjpy' })).toBe(false);
  });
});

describe('probeSql（関数）', () => {
  it('関数が無い（42883・PGRST202）は ない・引数で失敗しただけなら ある', async () => {
    expect(await probeSql(clientWith({ code: 'PGRST202', message: 'Could not find the function public.admin_profit' }), { rpc: 'admin_profit', args: {} })).toBe(false);
    expect(await probeSql(clientWith({ code: '23502', message: 'null value in column "user_id" violates not-null constraint' }), { rpc: 'reserve_ai_cost', args: {} })).toBe(true);
    // 表の文を関数の有無に読まない
    expect(await probeSql(clientWith({ code: '42P01', message: 'relation "ops_goals" does not exist' }), { rpc: 'admin_goal_plan', args: {} })).toBe(true);
  });
});

describe('envHealth', () => {
  it('全部そろって true・旗は形まで見る', () => {
    const env = { VITE_FOUNDING_OFFER: 'on', VITE_FOUNDING_OFFER_END: '2026-12-16', RAKUTEN_APPLICATION_ID: 'a', RAKUTEN_ACCESS_KEY: 'b' };
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      const h = envHealth(env);
      expect(h.rakuten).toBe(false);
      expect(h.founding_offer).toBe(true);
    } finally {
      for (const k of Object.keys(env)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    }
  });
});
