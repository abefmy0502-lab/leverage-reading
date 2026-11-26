import { describe, it, expect } from 'vitest';
import { buildKnowledgeMap, orderAroundRing, orderByField, ringPositions, hubPositions, edgeWidth } from './knowledgeMap';
import { nodeCoverWidth, growthOrder, strongestEdge, linkedIds, starField, growthLabel, pairConsultQuestion } from './knowledgeMap';

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
  it('つながりが無くても、読書中・読了の本は点にする（同じ分野は隣どうし・内側に分野の点・メモの数といちばん新しいメモ）', () => {
    const shelf = [
      { id: 'r1', title: 'A', status: 'done', tags: ['経営戦略'], doneDate: '2026-10-01' },
      { id: 'r2', title: 'B', status: 'reading', tags: ['思考法・問題解決'], startDate: '2026-11-01' },
      { id: 'r3', title: 'C', status: 'done', tags: ['経営戦略'], doneDate: '2026-09-01' },
      { id: 'w1', title: '読みたい', status: 'want', tags: ['経営戦略'] },
    ];
    const memoRows = [m('n1', 'r1', '朝の時間を使って本を読む。'), m('n0', 'r1', 'もっと古いメモ')];
    const map = buildKnowledgeMap({ rows: memoRows, books: shelf });
    expect(map.edges).toEqual([]);
    expect(map.nodes.map((n) => n.book.id)).not.toContain('w1');
    expect(map.nodes).toHaveLength(3);
    // 同じ分野（経営戦略）の 2 冊が隣り合い、点線で結ばれる
    const ids = map.nodes.map((n) => n.book.id);
    expect(Math.abs(ids.indexOf('r1') - ids.indexOf('r3'))).toBe(1);
    // 2 冊以上の分野だけが内側の点になる
    expect(map.hubs).toEqual([{ name: '経営戦略', bookIds: expect.arrayContaining(['r1', 'r3']) }]);
    // 分野の点は、その分野の本の方向の内側
    const pos = new Map([['r1', { x: 0.5, y: 0.1 }], ['r3', { x: 0.9, y: 0.5 }]]);
    const [h] = hubPositions([{ name: '経営戦略', bookIds: ['r1', 'r3'] }], pos);
    expect(h.x).toBeGreaterThan(0.5);
    expect(h.y).toBeLessThan(0.5);
    expect(Math.hypot(h.x - 0.5, h.y - 0.5)).toBeCloseTo(0.17);
    const r1 = map.nodes.find((n) => n.book.id === 'r1');
    expect(r1.memoCount).toBe(2);
    expect(r1.latest.id).toBe('n1');
    expect(map.nodes.find((n) => n.book.id === 'r2').latest).toBeNull();
  });
  it('1 冊だけでも出す（真ん中に）・本が無ければ空', () => {
    const one = buildKnowledgeMap({ rows: [], books: [{ id: 'x', status: 'reading' }] });
    expect(one.nodes).toHaveLength(1);
    expect(ringPositions(1)[0]).toEqual({ x: 0.5, y: 0.5 });
    expect(buildKnowledgeMap({ rows: [], books: [] }).nodes).toEqual([]);
  });
  it('分野ごとのまとまり（多い分野から・分野の無い本は最後）', () => {
    const f = { a: ['X'], b: ['Y'], c: ['X'], d: [] };
    expect(orderByField(['a', 'b', 'c', 'd'], [], (id) => f[id])).toEqual(['a', 'c', 'b', 'd']);
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

describe('知識の地図の作り直し（2026-11-26）', () => {
  const node = (id, at, memoCount = 0) => ({ book: { id, title: `本${id}` }, at, memoCount });
  it('表紙はメモの多い本ほど少し大きい（上限あり）', () => {
    expect(nodeCoverWidth(0)).toBe(24);
    expect(nodeCoverWidth(3)).toBe(36);
    expect(nodeCoverWidth(100)).toBe(44);
  });
  it('育った順は日付の古い順・日付の無い本は最後', () => {
    expect(growthOrder([node('a', 300), node('b', 0), node('c', 100)])).toEqual(['c', 'a', 'b']);
  });
  it('いちばん強い重なりとつながる本', () => {
    const edges = [{ a: 'a', b: 'b', weight: 1 }, { a: 'b', b: 'c', weight: 3 }];
    expect(strongestEdge(edges)).toEqual(edges[1]);
    expect(strongestEdge([])).toBeNull();
    expect([...linkedIds(edges, 'b')].sort()).toEqual(['a', 'c']);
  });
  it('星は毎回同じ位置・地図の中', () => {
    const s = starField(10, 3);
    expect(starField(10, 3)).toEqual(s);
    expect(s.every((p) => p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100)).toBe(true);
  });
  it('日付の書き方と 2 冊の相談の下書き', () => {
    expect(growthLabel(0)).toBe('');
    expect(growthLabel(new Date(2025, 9, 3).getTime())).toBe('2025.10');
    expect(pairConsultQuestion({ title: 'A' }, { title: 'B' })).toBe('『A』と『B』のメモを重ねると、いまの自分にどんなことが言えますか？');
  });
});
