import { describe, it, expect } from 'vitest';
import { overlapCandidates, parseOverlap, overlapMemoText, searchOverlapRows, whereOf, OVERLAP_TAG } from './overlap';

const rows = [
  { id: 'm1', book_id: 'b1', text: '人は何かを受け取ると、お返しをしたくなる。返報性の原理。先に価値を渡すと関係が進む。', source_type: 'book' },
  { id: 'p1', book_id: null, text: '営業で、商談の前に先に価値を渡す資料を送ったら、関係が進んで具体的な相談になった。', source_type: 'personal' },
  { id: 'm2', book_id: 'b2', text: '睡眠は最初の 90 分が大事。', source_type: 'book' },
  { id: 'o1', book_id: null, text: '重なり：A × B\n先に価値を渡すと関係が進む。', source_type: 'personal', tags: [OVERLAP_TAG] },
  { id: 'ai', book_id: 'b3', text: '先に価値を渡すと関係が進む、と本は言う。', source_type: 'ai_summary' },
];

describe('重なり（2026-11-25）', () => {
  it('本のメモに、本以外の学びが重なる相手として出る（重なりの答えと AI のまとめは出さない）', () => {
    const c = overlapCandidates({ source: rows[0], rows });
    expect(c.map((x) => x.memo.id)).toEqual(['p1']);
    expect(c[0].memo.book_id).toBeNull();
  });
  it('学びからも、本のメモが出る', () => {
    const c = overlapCandidates({ source: { id: 'p1', text: rows[1].text, bookId: null }, rows });
    expect(c.map((x) => x.memo.id)).toEqual(['m1']);
  });
  it('AI の答えの 3 行を読む（問いは「？」で終える・違いが無ければ空）', () => {
    expect(parseOverlap('共通: 先に渡すと関係が進む\n違い: 見つかりませんでした\n問い: 次の商談で何を先に渡せる')).toEqual({ common: '先に渡すと関係が進む', diff: '', question: '次の商談で何を先に渡せる？' });
    expect(parseOverlap('**共通**：A\n- 問い：B?')).toEqual({ common: 'A', diff: '', question: 'B？' });
    expect(parseOverlap('うまく書けませんでした')).toBeNull();
  });
  it('保存する文の頭に、重ねた 2 つ', () => {
    expect(overlapMemoText({ answer: ' 先に渡す ', aWhere: '『影響力の武器』のメモ', bWhere: 'あなたの学び' })).toBe('重なり：『影響力の武器』のメモ × あなたの学び\n先に渡す');
    expect(overlapMemoText({ answer: '  ', aWhere: 'a', bWhere: 'b' })).toBe('');
  });
  it('自分で選ぶ一覧は言葉と書名で絞る', () => {
    const books = new Map([['b2', { title: '最高の睡眠' }]]);
    expect(searchOverlapRows({ rows, query: '睡眠', excludeId: 'm1', bookById: books }).map((r) => r.id)).toEqual(['m2']);
    expect(whereOf(rows[1], books)).toBe('あなたの学び');
    expect(whereOf(rows[2], books)).toBe('『最高の睡眠』のメモ');
  });
});
