import { describe, it, expect } from 'vitest';
import { autoLevel, readerLevel, levelBlock, levelNote, LEVEL_DONE_STEPS } from './readerLevel';
import { searchCatalog, candidatesBlock } from './advisorCandidates';

const done = (n) => Array.from({ length: n }, () => ({ status: 'done' }));

describe('読書の慣れ', () => {
  it('読了の冊数から自動で（5 冊未満＝入門・20 冊未満＝中級・それ以上＝上級）', () => {
    expect(LEVEL_DONE_STEPS).toEqual([5, 20]);
    expect(autoLevel([...done(4), { status: 'reading' }])).toEqual({ level: 1, done: 4 });
    expect(autoLevel(done(5)).level).toBe(2);
    expect(autoLevel(done(20)).level).toBe(3);
    expect(autoLevel(null)).toEqual({ level: 1, done: 0 });
  });
  it('本人が選んだらそちら・おまかせなら自動', () => {
    expect(readerLevel(done(30), 'easy')).toMatchObject({ level: 1, chosen: true });
    expect(readerLevel(done(0), 'hard')).toMatchObject({ level: 3, chosen: true });
    expect(readerLevel(done(8), 'auto')).toMatchObject({ level: 2, chosen: false, done: 8 });
    expect(readerLevel(done(8), 'xx')).toMatchObject({ pref: 'auto' });
  });
  it('画面の案内はチップと同じ言葉・読了 0 冊ははじめての方向け', () => {
    expect(levelNote({ level: 2, done: 7, chosen: false })).toBe('読了 7 冊から「ふつう」の本を中心に探します');
    expect(levelNote({ level: 1, done: 0, chosen: false })).toBe('はじめての方向けに、やさしめの本を中心に探します');
    expect(levelNote({ level: 3, done: 0, chosen: true })).toBe('「難しめ」の本を中心に探します');
  });
  it('AI に渡す 1 段', () => {
    expect(levelBlock({ level: 1, done: 2, chosen: false })).toContain('入門（本棚の読了 2 冊から見立てた）');
    expect(levelBlock({ level: 3, done: 2, chosen: true })).toContain('「難しめ」');
  });
});

describe('候補に難しさと書評サイトの推薦', () => {
  const row = { isbn: '9784000000001', title: '本', author: '著', summary: '概要', for_whom: ['悩む人'], difficulty: 3, prereq: '会計の基礎', rec_points: 12, endorsers: ['甲', '乙', '丙', '丁'], ext_summary: '書評の  要約' };
  it('慣れを渡して引く・前の形の関数（引数 3 つ）なら外して引き直す', async () => {
    const calls = [];
    const rpc = async (name, args) => { calls.push(args); return 'p_level' in args ? { data: null, error: { code: 'PGRST202' } } : { data: [row], error: null }; };
    const list = await searchCatalog(['会計'], { rpc, level: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[0].p_level).toBe(1);
    expect(list[0]).toMatchObject({ difficulty: 3, prereq: '会計の基礎', recPoints: 12, endorsers: ['甲', '乙', '丙', '丁'], extSummary: '書評の  要約' });
  });
  it('AI に渡す候補の塊に難しさ・前提・推薦者・書評の要約（写さない注意）', () => {
    const text = candidatesBlock([{ key: 'C1', title: '本', author: '著', summary: '概要', forWhom: [], difficulty: 3, prereq: '会計の基礎', recPoints: 12, endorsers: ['甲', '乙', '丙', '丁'], extSummary: '書評の  要約' }]);
    expect(text).toContain('難しさ: 上級（前提: 会計の基礎）');
    expect(text).toContain('推薦: 甲・乙・丙 ほか（12P）');
    expect(text).toContain('書評サイトの要約（参考・写さない）: 書評の 要約');
  });
});

describe('候補に売れ方と賞・年間ベストの印（2026-11-18）', () => {
  it('引いた本の売れ方と印を読む・知らない売れ方と前の本番（列なし）は空', async () => {
    const rows = [
      { isbn: '9784000000001', title: '本', author: '著', trend: 'steady', marks: ['読者が選ぶビジネス書グランプリ 2026 総合グランプリ', 'TOPPOINT 大賞 2026 上半期', 'C', 'D'] },
      { isbn: '9784000000002', title: '本 2', author: '著', trend: 'hot' },
    ];
    const list = await searchCatalog(['習慣'], { rpc: async () => ({ data: rows, error: null }) });
    expect(list[0]).toMatchObject({ trend: 'steady', marks: ['読者が選ぶビジネス書グランプリ 2026 総合グランプリ', 'TOPPOINT 大賞 2026 上半期', 'C'] });
    expect(list[1]).toMatchObject({ trend: '', marks: [] });
  });
  it('AI に渡す候補の塊に「売れ方」「受賞」の行（無ければ出さない）', () => {
    const text = candidatesBlock([
      { key: 'C1', title: '本', author: '著', trend: 'new', marks: ['読者が選ぶビジネス書グランプリ 2026 総合グランプリ'] },
      { key: 'C2', title: '本 2', author: '著', trend: '', marks: [] },
    ]);
    expect(text).toContain('売れ方: 出て 1 年以内で、いま分野の売上上位');
    expect(text).toContain('受賞: 読者が選ぶビジネス書グランプリ 2026 総合グランプリ');
    expect(text.match(/売れ方:/g)).toHaveLength(1);
    expect(text.match(/受賞:/g)).toHaveLength(1);
  });
});
