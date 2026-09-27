import { describe, it, expect } from 'vitest';
import { pickPerspectiveBooks } from './ai';

const book = (id, title) => ({ id, title, author: `${title}の著者`, rating: 0 });
const memo = (b, text, extra = {}) => ({ book_id: b.id, book: b, text, tags: [], source_type: null, created_at: '2026-01-01T00:00:00Z', ...extra });

const A = book('a', '嫌われる勇気');
const B = book('b', 'エッセンシャル思考');
const C = book('c', 'イシューからはじめよ');
const D = book('d', '人を動かす');
const E = book('e', '数値化の鬼');

describe('pickPerspectiveBooks', () => {
  it('質問に近いメモの多い本から並べ、同じなら メモの数 → 新しさ', () => {
    const pool = [
      memo(A, '相手の評価は相手の課題'),
      memo(B, '評価を気にせず、やらないことを決める'),
      memo(B, '評価より大事な一点に集中'),
      memo(C, '本当に答えるべき問い'),
      memo(C, '評価の前に問いを立てる', { created_at: '2026-03-01T00:00:00Z' }),
    ];
    const out = pickPerspectiveBooks('人の評価が気になる', pool, { minBooks: 1 });
    expect(out.map((b) => b.title)).toEqual(['エッセンシャル思考', 'イシューからはじめよ', '嫌われる勇気']);
    expect(out[0].related).toBe(2);
    expect(out[0].memos[0].text).toContain('評価');
  });

  it('最大 4 冊まで', () => {
    const pool = [A, B, C, D, E].map((b) => memo(b, `営業の成果 ${b.title}`));
    expect(pickPerspectiveBooks('営業の成果が落ちた', pool)).toHaveLength(4);
  });

  it('近いメモのある本が少なければ、メモの多い本で 3 冊まで埋める', () => {
    const pool = [
      memo(A, '評価は相手の課題'),
      memo(D, '名前を呼ぶ'), memo(D, '質問で動いてもらう'),
      memo(E, '行動を数で決める', { created_at: '2026-05-01T00:00:00Z' }),
      memo(C, '問いを立てる', { created_at: '2025-05-01T00:00:00Z' }),
    ];
    const out = pickPerspectiveBooks('評価が気になる', pool);
    expect(out.map((b) => b.title)).toEqual(['嫌われる勇気', '人を動かす', '数値化の鬼']);
    expect(out[1].related).toBe(0);
  });

  it('カード式メモが 1 件も無い本・学びログ・読書準備だけの行は使わない', () => {
    const pool = [
      memo(A, '評価は相手の課題'),
      memo(B, '評価を気にしない本にしたい', { source_type: 'invest_purpose' }),
      memo(C, '評価のまとめ', { source_type: 'summary' }),
      { book_id: null, book: null, source_type: 'personal', text: '評価が気になる日もある', tags: [] },
    ];
    const out = pickPerspectiveBooks('評価が気になる', pool);
    expect(out.map((b) => b.bookId)).toEqual(['a']);
  });

  it('まとめメモはカード式のある本の材料には入る', () => {
    const pool = [memo(A, '評価は相手の課題'), memo(A, '貢献感があれば十分', { source_type: 'summary' })];
    const [a] = pickPerspectiveBooks('評価', pool);
    expect(a.memos).toHaveLength(2);
  });

  it('材料の字数は冊数で分けた上限まで（1 冊に最低 1 件）', () => {
    const long = 'あ'.repeat(900);
    const pool = [
      ...Array.from({ length: 10 }, () => memo(A, `評価 ${long}`)),
      ...Array.from({ length: 10 }, () => memo(B, `評価 ${long}`)),
    ];
    const out = pickPerspectiveBooks('評価', pool, { budget: 3000 });
    out.forEach((b) => {
      const chars = b.memos.reduce((n, m) => n + m.text.length + 40, 0);
      expect(b.memos.length).toBeGreaterThanOrEqual(1);
      expect(chars).toBeLessThanOrEqual(1500);
    });
  });

  it('空の入力は空配列', () => {
    expect(pickPerspectiveBooks('評価', [])).toEqual([]);
    expect(pickPerspectiveBooks('評価', null)).toEqual([]);
  });
});
