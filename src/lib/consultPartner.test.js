import { describe, it, expect } from 'vitest';
import { consultPartner, partnerFromRefs, partnerFromScope, shelfBooks, bookPartnerLabel, SHELF_LABEL, SELF_LABEL } from './consultPartner';
import { QUOTE_PREFIX } from './evidenceCheck';

const BOOKS = [
  { id: 'b1', title: 'イシューからはじめよ', author: '安宅和人', cover: 'https://example.com/1.jpg', updated_at: '2026-09-01' },
  { id: 'b2', title: '1兆ドルコーチ', author: 'エリック・シュミット', cover: null, updated_at: '2026-09-20' },
  { id: 'b3', title: '数値化の鬼', author: '安藤広大', cover: 'https://example.com/3.jpg', updated_at: '2026-08-01' },
  { id: 'b4', title: '人を動かす', author: '', cover: null, updated_at: '2026-07-01' },
  { id: 'b5', title: 'エッセンシャル思考', author: 'グレッグ・マキューン', cover: 'https://example.com/5.jpg', updated_at: '2026-09-25' },
];

describe('consultPartner（相談相手のアイコン・2026-09-30）', () => {
  it('根拠が 1 冊なら、その本（著者『書名』）', () => {
    const p = consultPartner({ refs: ['🌱 あなたのメモ 2 件から答えました', '📚 安宅和人『イシューからはじめよ』p.25'], books: BOOKS });
    expect(p.kind).toBe('book');
    expect(p.books.map((b) => b.id)).toEqual(['b1']);
    expect(p.label).toBe('安宅和人『イシューからはじめよ』');
  });

  it('著者が無ければ『書名』だけ', () => {
    expect(bookPartnerLabel(BOOKS[3])).toBe('『人を動かす』');
  });

  it('根拠が数冊なら、グループ（著者が 2 人以上なら「◯◯ ほか N 人」）', () => {
    const p = consultPartner({ refs: ['📚 安宅和人『イシューからはじめよ』p.25', '📚 エリック・シュミット『1兆ドルコーチ』', '📖 安藤広大『数値化の鬼』まとめメモ'], books: BOOKS });
    expect(p.kind).toBe('group');
    expect(p.books.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    expect(p.label).toBe('安宅和人 ほか 2 人');
    expect(p.shelf).toBe(false);
  });

  it('著者が分からない（同じ）数冊は「N 冊の本」', () => {
    const p = partnerFromRefs(['📚 『人を動かす』', '📚 安宅和人『イシューからはじめよ』'], [BOOKS[3], { ...BOOKS[0] }]);
    expect(p.label).toBe('2 冊の本');
  });

  it('自分の学びだけなら、電球（自分の学び）', () => {
    const p = consultPartner({ refs: ['💡 自分の学び (2026-08-15 / 仕事)'], books: BOOKS });
    expect(p.kind).toBe('self');
    expect(p.label).toBe(SELF_LABEL);
  });

  it('本と自分の学びなら、グループに学びも入れる', () => {
    const p = consultPartner({ refs: ['📚 安宅和人『イシューからはじめよ』', '💡 自分の学び (2026-08-15)'], books: BOOKS });
    expect(p.kind).toBe('group');
    expect(p.self).toBe(true);
    expect(p.label).toBe('安宅和人『イシューからはじめよ』と自分の学び');
  });

  it('引用がどれもメモと一致しなかった本は外す', () => {
    const ng = `${QUOTE_PREFIX}${JSON.stringify({ k: 'r', t: '1兆ドルコーチ', s: 'ng' })}`;
    const p = consultPartner({ refs: [ng, '📚 安宅和人『イシューからはじめよ』', '📚 エリック・シュミット『1兆ドルコーチ』'], books: BOOKS });
    expect(p.kind).toBe('book');
    expect(p.books[0].id).toBe('b1');
  });

  it('根拠が取れない（書いている途中・失敗・関係するメモが無い）ときは相談相手から', () => {
    // すべての本 → 「あなたの本棚」（メモのある本の表紙を最大 4 つ・表紙のある本 → 新しい順）
    const shelf = consultPartner({ refs: [], scopeIds: [], books: BOOKS, memoBookIds: new Set(['b1', 'b2', 'b3', 'b5']) });
    expect(shelf.kind).toBe('group');
    expect(shelf.shelf).toBe(true);
    expect(shelf.label).toBe(SHELF_LABEL);
    expect(shelf.books.map((b) => b.id)).toEqual(['b5', 'b1', 'b3', 'b2']);
    // 1 冊に絞った
    const one = consultPartner({ refs: ['📚 安藤広大『数値化の鬼』'], scopeIds: ['b1'], books: BOOKS, useScope: true });
    expect(one.kind).toBe('book');
    expect(one.books[0].id).toBe('b1');
    // 選んだ数冊
    const some = partnerFromScope({ scopeIds: ['b1', 'b3'], books: BOOKS });
    expect(some.kind).toBe('group');
    expect(some.shelf).toBe(false);
    expect(some.label).toBe('安宅和人 ほか 1 人');
  });

  it('画面用の目印の行（🌱 🌿 🪙 🎯）は根拠に数えない', () => {
    expect(partnerFromRefs(['🌱 あなたのメモ 3 件から答えました', '🌿 前の相談から メモ +2 件', '🪙 関係するメモが無かったので', '🎯 2'], BOOKS)).toBeNull();
  });

  it('本棚にメモのある本が無ければ、表紙の無い「あなたの本棚」', () => {
    const p = partnerFromScope({ scopeIds: [], books: BOOKS, memoBookIds: new Set() });
    expect(p.kind).toBe('group');
    expect(p.books).toEqual([]);
    expect(shelfBooks([], null)).toEqual([]);
  });
});
