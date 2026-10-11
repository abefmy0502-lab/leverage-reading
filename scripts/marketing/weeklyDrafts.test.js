import { describe, it, expect } from 'vitest';
import { checkCopy, recentReleaseLines, buildPrompt } from './weekly-drafts.mjs';
import { SCENARIOS } from './scenarios.mjs';

describe('weekly-drafts', () => {
  it('使わない言い方を見つける（決まりを説明している行は除く）', () => {
    const hits = checkCopy('著者と話せるアプリ\n必ず読書が変わる\n「著者と話せる」とは言わない');
    expect(hits.map((h) => h.line)).toEqual([1, 2]);
    expect(checkCopy('読んだ本と、対話しよう。本の語り口で答えます。')).toEqual([]);
  });

  it('その週の「新しくなったこと」だけを拾う', () => {
    const releases = [
      { id: '2026-10-11', date: '2026-10-11', items: [{ where: '相談', what: 'A', after: 'a。', intent: 'x。' }] },
      { id: '2026-09-01', date: '2026-09-01', items: [{ where: 'ホーム', what: 'B', after: 'b。', intent: 'y。' }] },
    ];
    const lines = recentReleaseLines(releases, '2026-10-12', 7);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('相談：A');
  });

  it('台本はどれも名前・題・柱があり、名前は重ならない', () => {
    const names = SCENARIOS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SCENARIOS) {
      expect(s.name).toMatch(/^[a-z0-9-]+$/);
      expect(s.title).toBeTruthy();
      expect(s.pillar).toBeTruthy();
      expect(checkCopy(`${s.title}\n${s.steps.map((x) => x.say || '').join('\n')}`)).toEqual([]);
    }
  });

  it('プロンプトに守ることと今週の動画が入る', () => {
    const p = buildPrompt({ today: '2026-10-11', releaseLines: [], scenarios: SCENARIOS, plan: '', guard: '', playbook: '', xSample: '', videoSample: '' });
    expect(p.system).toContain('「著者と話せる」');
    expect(p.user).toContain('consult-book');
  });
});
