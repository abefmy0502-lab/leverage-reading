import { describe, it, expect } from 'vitest';
import { checkCopy, checkShape, recentReleaseLines, buildPrompt } from './weekly-drafts.mjs';
import { SCENARIOS } from './scenarios.mjs';

describe('weekly-drafts', () => {
  it('使わない言い方を見つける（決まりを説明している行は除く）', () => {
    const hits = checkCopy('著者と話せるアプリ\n必ず読書が変わる\n「著者と話せる」とは言わない');
    expect(hits.map((h) => h.line)).toEqual([1, 2]);
    expect(checkCopy('読んだ本と、会話しよう。本の語り口で答えます。')).toEqual([]);
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

describe('checkShape（投稿の形・2026-11-10）', () => {
  const kit = (posts) => posts.map(([h, body]) => `### ${h}\n\`\`\`\n${body}\n\`\`\``).join('\n\n');
  it('1 行目が製品名・機能の知らせから始まる投稿に注意を出す（読む人の話から始まれば通す）', () => {
    const hits = checkShape(kit([
      ['X01 月', 'Orime の答えの材料は、自分の一行だけ。\n\n読んだ本と話す。'],
      ['X02 火', '記録に「分野」を入れました。\n\n仕事の本ばかりでした。'],
      ['X03 水', '「読書メモなんて残してない」が普通だと思う。だから入口を 4 つ作りました。\n\nその日から相談できます。'],
      ['X04 木', '記録の「分野」を見たら、仕事の本が 8 割でした。\n\n歴史は 0 冊。'],
    ]));
    expect(hits.map((h) => h.word.slice(0, 6))).toEqual(['Orime ', '記録に「分野']);
  });
  it('X は重み 280 まで（日本語 141 字で超える）・Threads は問いで終わるものが半分未満だと注意', () => {
    const long = 'あ'.repeat(141);
    const hits = checkShape(kit([['X01', long], ['T01', 'こんにちは。'], ['T02', 'こんにちは。'], ['T03', 'こんにちは。'], ['T04', 'どう思いますか？']]));
    expect(hits.some((h) => /重み 282/.test(h.word))).toBe(true);
    expect(hits.some((h) => /Threads 1\/4/.test(h.word))).toBe(true);
  });
  it('AI っぽい文の定型に注意を出す', () => {
    const hits = checkShape(kit([['X01', '読書メモを残すことが重要です。\n\nいかがでしたか。']]));
    expect(hits.some((h) => /重要です/.test(h.word))).toBe(true);
    expect(checkShape(kit([['X01', '2 年前の一行に助けられた。\n\np.40 のメモでした。']]))).toEqual([]);
  });
  it('同じ締めの決まり文句が 3 回で注意・2 回なら出さない', () => {
    const two = kit([['X01', 'きょうの本。\n\n読んで終わりにしない。'], ['X02', 'きのうの本。\n\n読んで終わりにしない。']]);
    expect(checkShape(two)).toEqual([]);
    const three = kit([['X01', 'きょう。\n\n読んで終わりにしない。'], ['X02', 'きのう。\n\n読んで終わりにしない。'], ['X03', 'おととい。\n\n読んで終わりにしない。']]);
    expect(checkShape(three).some((h) => h.word === '読んで終わりにしない')).toBe(true);
  });
});
