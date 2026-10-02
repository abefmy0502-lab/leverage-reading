// 🧭 相談の「関係するメモ」を Jev に選んでもらう（lib/consultRelevance.js・lib/ai.js の jevRelatedMemos）。
// 芯（キャッシュする塊）は Jev があってもなくても同じ・Jev が使えなければ今までの選び方・送るのは一節だけ。
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {}, isSupabaseConfigured: false }));

import { relevanceCandidates, relevanceInput, relatedFromScores, JEV_RELEVANCE_CANDIDATES } from './consultRelevance';
import { selectConsultMemos, jevRelatedMemos, pickRelatedMemos } from './ai';

const NOW = Date.UTC(2026, 9, 2, 3, 0, 0);
const mk = (i, text, { book = `b${i % 6}`, days = i } = {}) => ({
  id: `id-${i}`,
  book_id: book,
  source_type: 'card',
  text,
  tags: [],
  created_at: new Date(NOW - days * 86400000).toISOString(),
  book: { id: book, title: `本${book}`, rating: 3 },
});
const filler = (i) => mk(i, `メモ${i}。${'読んだことを書き留めた。'.repeat(20)}`);
const pool = [
  mk(1, '部下に任せると、人は自分で考えて動き出す。任せる勇気を持つ。'),
  mk(2, '会議は目的を先に決める。'),
  mk(3, '人は信頼されると期待に応えようとする。'), // 「部下」「任せ」の語は無いが、意味は近い
  mk(4, '朝の習慣が一日を決める。'),
  ...Array.from({ length: 40 }, (_, k) => filler(10 + k)),
];

describe('候補・送る材料・答えの読み方', () => {
  it('候補: 語片が重なるメモ → 重要度の高いメモで 30 件まで（重ならない）', () => {
    const lexical = [pool[0], pool[1]];
    const c = relevanceCandidates({ lexical, byPriority: [pool[1], ...pool.slice(2)] });
    expect(c[0]).toBe(pool[0]);
    expect(c[1]).toBe(pool[1]);
    expect(c).toHaveLength(JEV_RELEVANCE_CANDIDATES);
    expect(new Set(c).size).toBe(c.length);
  });
  it('材料: m0〜 の番号・一節は 160 字まで・メモの DB の id は送らない', () => {
    const input = relevanceInput('部下が動かない', [pool[0], pool[10]]);
    expect(input.memos.map((m) => m.id)).toEqual(['m0', 'm1']);
    expect(input.memos[1].text.length).toBeLessThanOrEqual(160);
    expect(JSON.stringify(input)).not.toContain('id-1');
    expect(input.memos[0].book).toBe('本b1');
  });
  it('答え: 0.5 以上を確率の高い順に。1 件でも欠けていたら null', () => {
    const cands = [pool[0], pool[1], pool[2]];
    expect(relatedFromScores(cands, { m0: 0.7, m1: 0.1, m2: 0.9 })).toEqual([pool[2], pool[0]]);
    expect(relatedFromScores(cands, { m0: 0.7, m1: 0.1 })).toBe(null);
    expect(relatedFromScores(cands, null)).toBe(null);
    expect(relatedFromScores(cands, { m0: 0.1, m1: 0.1, m2: 0.2 })).toEqual([]);
  });
});

describe('selectConsultMemos に外から関係するメモを渡す', () => {
  it('芯（キャッシュする塊）は同じ・関係するメモだけが変わる', () => {
    const base = selectConsultMemos('部下に任せる', pool, { now: NOW });
    const withJev = selectConsultMemos('部下に任せる', pool, { now: NOW, related: [pool[2], pool[0]] });
    expect(withJev.core).toEqual(base.core);
    expect(withJev.related).toEqual([pool[2], pool[0]]);
  });
  it('渡した一覧が空なら関係するメモは無し（Jev が「どれも役に立たない」と決めた）・null なら今までの選び方', () => {
    expect(selectConsultMemos('部下に任せる', pool, { now: NOW, related: [] }).related).toEqual([]);
    expect(selectConsultMemos('部下に任せる', pool, { now: NOW, related: null }).related)
      .toEqual(selectConsultMemos('部下に任せる', pool, { now: NOW }).related);
  });
  it('本棚に無いメモは使わない・12 件まで', () => {
    const outsider = mk(999, 'どこにも無いメモ');
    const r = selectConsultMemos('部下', pool, { now: NOW, related: [outsider, ...pool.slice(0, 20)] });
    expect(r.related).not.toContain(outsider);
    expect(r.related.length).toBeLessThanOrEqual(12);
  });
});

describe('jevRelatedMemos', () => {
  it('使えないとき（スイッチが切れている）は送らず null', async () => {
    const ask = vi.fn();
    expect(await jevRelatedMemos('部下', pool, { now: NOW, ask })).toBe(null);
    expect(ask).not.toHaveBeenCalled();
  });
  it('使えるときは候補を送り、確率の高い順の関係するメモを返す（語の重ならないメモも拾える）', async () => {
    const ask = vi.fn(async (purpose, input) => {
      expect(purpose).toBe('memo_relevance');
      const scores = {};
      input.memos.forEach((m) => { scores[m.id] = /信頼|任せ/.test(m.text) ? 0.9 : 0.05; });
      return { scores };
    });
    const r = await jevRelatedMemos('部下に任せるのが苦手', pool, { now: NOW, ask, enabled: true });
    expect(r).toContain(pool[0]);
    expect(r).toContain(pool[2]);
    expect(pickRelatedMemos('部下に任せるのが苦手', pool, { now: NOW })).not.toContain(pool[2]);
    expect(ask.mock.calls[0][1].memos.length).toBeLessThanOrEqual(30);
  });
  it('Jev が null・投げた → null（今までの選び方）', async () => {
    expect(await jevRelatedMemos('部下', pool, { now: NOW, ask: async () => null, enabled: true })).toBe(null);
    expect(await jevRelatedMemos('部下', pool, { now: NOW, ask: async () => { throw new Error('x'); }, enabled: true })).toBe(null);
  });
});
