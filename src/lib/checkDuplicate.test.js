import { describe, it, expect } from 'vitest';
import { findDuplicateBook, findImportDuplicate, stripEditionPrefix } from './checkDuplicate';

describe('findImportDuplicate（取り込みだけのゆるい判定・2026-09-29）', () => {
  const shelf = [
    { id: 'e', title: 'エッセンシャル思考', author: 'グレッグ・マキューン' },
    { id: 'h', title: '7つの習慣', author: 'スティーブン・R・コヴィー' },
    { id: 's', title: 'サピエンス全史 上', author: 'ユヴァル・ノア・ハラリ' },
  ];
  it('副題つきの書名・同じ著者は同じ本', () => {
    const cand = { title: 'エッセンシャル思考 最少の時間で成果を最大にする', author: 'グレッグ・マキューン' };
    expect(findDuplicateBook(shelf, cand)).toBeNull(); // 手で追加するときの判定は変えない
    expect(findImportDuplicate(shelf, cand)?.id).toBe('e');
    expect(findImportDuplicate(shelf, { title: 'エッセンシャル思考：最少の時間で成果を最大にする', author: 'グレッグ マキューン' })?.id).toBe('e');
    expect(findImportDuplicate(shelf, { title: 'エッセンシャル思考（かんき出版）', author: 'グレッグ・マキューン' })?.id).toBe('e');
    expect(findImportDuplicate(shelf, { title: 'エッセンシャル思考―最少の時間で', author: 'グレッグ・マキューン' })?.id).toBe('e');
  });
  it('著者に訳者などが並んでいても、片方がもう片方を含めば同じ本', () => {
    expect(findImportDuplicate(shelf, { title: '7つの習慣 人格主義の回復', author: 'コヴィー, 訳者' })?.id).toBe('h');
    expect(findImportDuplicate(shelf, { title: '7つの習慣', author: 'スティーブン・R・コヴィー, フランクリン・コヴィー・ジャパン' })?.id).toBe('h');
  });
  it('著者が違う・著者が無い・書名が続きの語の途中・巻が違うときは別の本', () => {
    expect(findImportDuplicate(shelf, { title: 'エッセンシャル思考 最少の時間で成果を最大にする', author: '別の人' })).toBeNull();
    expect(findImportDuplicate(shelf, { title: 'エッセンシャル思考 最少の時間で成果を最大にする', author: '' })).toBeNull();
    expect(findImportDuplicate(shelf, { title: 'エッセンシャル思考法', author: 'グレッグ・マキューン' })).toBeNull();
    expect(findImportDuplicate(shelf, { title: '7つの習慣 2', author: 'コヴィー' })).toBeNull();
    expect(findImportDuplicate([{ id: 'x', title: 'サピエンス全史', author: 'ハラリ' }], { title: 'サピエンス全史 下', author: 'ユヴァル・ノア・ハラリ' })).toBeNull();
  });
  it('書名の頭の「完訳」「新訳」「新版」「改訂版」「決定版」は外して比べる（2026-09-30）', () => {
    expect(findImportDuplicate(shelf, { title: '完訳 7つの習慣', author: 'コヴィー' })?.id).toBe('h');
    expect(findImportDuplicate(shelf, { title: '完訳 7つの習慣 人格主義の回復', author: 'コヴィー' })?.id).toBe('h');
    expect(findImportDuplicate(shelf, { title: '【新版】エッセンシャル思考', author: 'グレッグ・マキューン' })?.id).toBe('e');
    expect(findImportDuplicate(shelf, { title: '改訂版 エッセンシャル思考', author: 'グレッグ・マキューン' })?.id).toBe('e');
    expect(findImportDuplicate([{ id: 'n', title: '新訳 君主論', author: 'マキアヴェリ' }], { title: '決定版 君主論', author: 'マキアヴェリ' })?.id).toBe('n');
    // 途中の「新版」は外さない・版の頭を外しても著者が違えば別の本
    expect(stripEditionPrefix('経済学 新版')).toBe('経済学 新版');
    expect(findImportDuplicate(shelf, { title: '完訳 7つの習慣', author: '別の人' })).toBeNull();
    // 版の頭だけの書名は外さない
    expect(stripEditionPrefix('新版')).toBe('新版');
  });
  it('ISBN や書名＋著者の一致はこれまでどおり', () => {
    expect(findImportDuplicate([{ id: 'i', title: 'A', author: 'x', isbn: '9784478025819' }], { title: 'B', author: 'y', isbn: '4478025819' })?.id).toBe('i');
    expect(findImportDuplicate(shelf, { title: 'エッセンシャル思考', author: '' })?.id).toBe('e');
  });
});
