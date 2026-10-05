// api/lp-event.js: 受け付けるイベントの一覧が、supabase_lp_events.sql の CHECK と同じであること
// （2026-10-05: 最初の版の CHECK に flow_* などが無く、記録が黙って捨てられていた）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) }));
const { EVENTS } = await import('./lp-event.js');

describe('lp-event の EVENTS と SQL の CHECK', () => {
  it('同じ一覧', () => {
    const sql = readFileSync(new URL('../supabase_lp_events.sql', import.meta.url), 'utf8');
    const block = sql.match(/add constraint lp_events_event_check check \(event in \(([\s\S]*?)\)\);/);
    expect(block).not.toBeNull();
    const inSql = [...block[1].matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...EVENTS].sort());
  });
});
