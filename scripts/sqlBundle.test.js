import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ORDER, EXCLUDED, BUNDLE, buildBundle, listSqlFiles } from './sql-bundle.mjs';

describe('Supabase の SQL のまとめ（supabase_all_in_order.sql）', () => {
  it('すべての supabase_*.sql が、まとめるか外すかのどちらかに入っている', () => {
    const listed = new Set([...ORDER.map(([f]) => f), ...Object.keys(EXCLUDED)]);
    const missing = listSqlFiles().filter((f) => !listed.has(f));
    expect(missing).toEqual([]);
    expect(ORDER.length).toBe(new Set(ORDER.map(([f]) => f)).size);
  });

  it('まとめたファイルが最新（古ければ node scripts/sql-bundle.mjs）', () => {
    expect(readFileSync(BUNDLE, 'utf8')).toBe(buildBundle());
  });

  it('依存の順: 表を作るファイルが、それを使うファイルより先', () => {
    const pos = (f) => ORDER.findIndex(([x]) => x === f);
    const before = [
      ['supabase_ai_usage.sql', 'supabase_ai_cost.sql'],
      ['supabase_ai_cost.sql', 'supabase_ai_token_credits.sql'],
      ['supabase_push_subscriptions.sql', 'supabase_push_deadline.sql'],
      ['supabase_subscription_events.sql', 'supabase_admin_launch_kpis.sql'],
      ['supabase_analytics_events.sql', 'supabase_security_hardening.sql'],
      ['supabase_admin_metrics.sql', 'supabase_admin_exclude_admins.sql'],
      ['supabase_admin_exclude_admins.sql', 'supabase_admin_members_tasks.sql'],
      ['supabase_reading_sessions.sql', 'supabase_admin_launch_kpis.sql'],
      ['supabase_feedback.sql', 'supabase_admin_metrics.sql'],
    ];
    for (const [a, b] of before) expect(pos(a)).toBeLessThan(pos(b));
  });

  it('流し直して利用者の行を消す文が、まとめの中で生きていない', () => {
    const live = buildBundle().split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
    expect(live).not.toMatch(/^\s*delete\s+from\s+public\.(actions|books|book_memos)\b/im);
    expect(live).not.toMatch(/^\s*truncate\b/im);
  });
});

describe('前からある表に足りない列を足す', () => {
  it('列ごとの ADD COLUMN IF NOT EXISTS と UNIQUE の索引を作る（NOT NULL は DEFAULT があるときだけ）', async () => {
    const { columnBackfill } = await import('./sql-bundle.mjs');
    const lines = columnBackfill('public.t', `
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id), -- 持ち主
      enabled boolean NOT NULL DEFAULT true,
      kind text CHECK (kind in ('a','b')),
      UNIQUE (user_id, kind)`);
    expect(lines).toEqual([
      'ALTER TABLE public.t ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();',
      'ALTER TABLE public.t ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);',
      'ALTER TABLE public.t ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;',
      "ALTER TABLE public.t ADD COLUMN IF NOT EXISTS kind text CHECK (kind in ('a','b'));",
      "DO $bundle_uq$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS t_user_id_kind_bundle_uq ON public.t (user_id, kind); EXCEPTION WHEN unique_violation THEN RAISE NOTICE 't_user_id_kind_bundle_uq: 重なった行があるので一意の索引を作れませんでした（重なりを整理してから流し直してください）'; END $bundle_uq$;",
    ]);
    // 重なった行があっても、まとめ全体を止めない（unique_violation を受け止めて知らせだけ）
    expect(lines[4]).toMatch(/EXCEPTION WHEN unique_violation THEN RAISE NOTICE/);
  });
});
