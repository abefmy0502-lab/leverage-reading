import { describe, it, expect } from 'vitest';
import { buildKnowledgeMap, orderAroundRing, ringPositions, edgeWidth } from './knowledgeMap';

const books = [
  { id: 'b1', title: '1兆ドルコーチ' },
  { id: 'b2', title: '人を動かす' },
  { id: 'b3', title: 'マネジャーの教科書' },
  { id: 'b4', title: '朝の本' },
];
const m = (id, book_id, text, extra = {}) => ({ id, book_id, text, created_at: '2026-11-01', ...extra });
const rows = [
  m('m1', 'b1', 'よいマネージャーは答えを与えない。命令ではなく質問で、部下に考えさせる。'),
  m('m2', 'b2', '人に動いてもらうには、命令ではなく質問で考えさせる。'),
  m('m3', 'b3', '部下に任せるときは命令ではなく質問で、考えさせる時間をとる。'),
  m('m4', 'b4', '朝の時間を使って本を読む。早起きの習慣をつける。'),
  m('m5', 'b1', '部下の話を最後まで聞いてから、質問で考えさせる。'),
];

describe('知識の地図（2026-11-26）', () => {
  it('似たことを書いたメモのある本どうしを線でつなぐ（関係のない本は点にしない）', () => {
    const map = buildKnowledgeMap({ rows, books });
    const ids = map.nodes.map((n) => n.book.id).sort();
    expect(ids).toEqual(['b1', 'b2', 'b3']);
    expect(map.edges.length).toBeGreaterThanOrEqual(2);
    for (const e of map.edges) {
      expect(e.a < e.b).toBe(true);
      expect(String(e.best.from.bookId)).toBe(e.a);
      expect(String(e.best.to.bookId)).toBe(e.b);
      expect(e.count).toBeGreaterThan(0);
    }
  });
  it('つながる本が 3 冊に満たなければ出さない', () => {
    const map = buildKnowledgeMap({ rows: rows.slice(0, 2), books });
    expect(map.nodes).toEqual([]);
    expect(map.edges).toEqual([]);
  });
  it('AI が書いたメモ・本棚に無い本のメモ・学び（本なし）は使わない', () => {
    const extra = [
      m('x1', 'b4', 'よいマネージャーは命令ではなく質問で部下に考えさせる。', { source_type: 'ai_summary' }),
      m('x2', 'zz', 'よいマネージャーは命令ではなく質問で部下に考えさせる。'),
      m('x3', null, 'よいマネージャーは命令ではなく質問で部下に考えさせる。'),
    ];
    const map = buildKnowledgeMap({ rows: [...rows, ...extra], books });
    expect(map.nodes.map((n) => n.book.id)).not.toContain('b4');
    expect(map.nodes.map((n) => n.book.id)).not.toContain('zz');
  });
  it('同じメモのタグでもつながる（文字が似ていなくても）・@ の印のタグは数えない・線にはそのタグのメモの組が付く', () => {
    const tagged = [
      m('t1', 'b1', '週に一度、部下と話す時間をとる', { tags: ['マネジメント'] }),
      m('t2', 'b4', '朝の会議は十五分で終える', { tags: ['マネジメント', '@重なり'] }),
      m('t3', 'b3', '会議の前に議題を共有する', { tags: ['マネジメント'] }),
    ];
    const map = buildKnowledgeMap({ rows: tagged, books });
    expect(map.nodes.map((n) => n.book.id).sort()).toEqual(['b1', 'b3', 'b4']);
    const e = map.edges.find((x) => x.a === 'b1' && x.b === 'b4');
    expect(e.tags).toEqual(['マネジメント']);
    expect(e.count).toBe(0);
    expect(String(e.best.from.bookId)).toBe('b1');
    expect(String(e.best.to.bookId)).toBe('b4');
  });
  it('円の並びは強くつながる本を隣に置く・位置は上から時計回り・線の太さは 1.5〜4', () => {
    const edges = [{ a: 'a', b: 'b', weight: 3 }, { a: 'b', b: 'c', weight: 2 }, { a: 'a', b: 'd', weight: 0.5 }];
    const order = orderAroundRing(['a', 'b', 'c', 'd'], edges);
    expect(order[0]).toBe('b');
    expect(order[1]).toBe('a');
    const pos = ringPositions(4);
    expect(pos[0].x).toBeCloseTo(0.5);
    expect(pos[0].y).toBeLessThan(0.5);
    expect(edgeWidth(1)).toBe(1.5);
    expect(edgeWidth(20)).toBe(4);
    expect(edgeWidth(0, 1)).toBe(1.5);
  });
});
