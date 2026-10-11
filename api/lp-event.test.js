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

describe('ヒーローの表示方式（variant）の一覧が、api と SQL の CHECK とアプリでそろっている（2026-10-11・illust を足した）', () => {
  it('lp_events と lp_waitlist', async () => {
    const { LP_VARIANTS } = await import('./lp-event.js');
    const { LP_VARIANTS: WL } = await import('./lp-waitlist.js');
    expect([...WL].sort()).toEqual([...LP_VARIANTS].sort());
    for (const [file, table] of [['../supabase_lp_events.sql', 'lp_events'], ['../supabase_lp_waitlist.sql', 'lp_waitlist']]) {
      const sql = readFileSync(new URL(file, import.meta.url), 'utf8');
      const m = sql.match(new RegExp(`add constraint ${table}_variant_check check \\(variant in \\(([^)]*)\\)\\);`));
      expect(m, table).not.toBeNull();
      expect([...m[1].matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]).sort()).toEqual([...LP_VARIANTS].sort());
    }
    const track = readFileSync(new URL('../src/lib/lpTrack.js', import.meta.url), 'utf8');
    LP_VARIANTS.forEach((v) => expect(track).toContain(`'${v}'`));
  });
});
