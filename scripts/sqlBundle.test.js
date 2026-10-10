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
