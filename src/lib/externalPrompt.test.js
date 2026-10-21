import { describe, it, expect } from 'vitest';
import { buildExternalPrompt, selectMemos, isThemeReady, cleanTheme } from './externalPrompt';

const books = [
  { id: 'b1', title: 'マネジャーの教科書', author: '山田 太郎, 鈴木 花子', rating: 5, status: 'done', investPurpose: '部下に任せられるようになる', leverageMemo: '任せる前に終わりの形を決める。' },
  { id: 'b2', title: '朝の本', author: '佐藤', rating: 2, status: 'reading' },
  { id: 'b3', title: 'メモの無い本', author: '', rating: 0, status: 'done' },
];
const memos = [
  { id: 'm1', book_id: 'b1', text: '部下に任せるときは、終わった状態を先に決める。', page_number: 64, created_at: '2026-05-27T01:00:00Z' },
  { id: 'm2', book_id: 'b1', text: '任せたら口を出さない。', page_number: 12, created_at: '2026-05-20T01:00:00Z' },
  { id: 'm3', book_id: 'b2', text: '朝の時間を使って本を読む。', created_at: '2026-06-01T01:00:00Z' },
];

describe('AI への指示文', () => {
  it('テーマは 2 字から・80 字まで・改行はつなぐ', () => {
    expect(isThemeReady('a')).toBe(false);
    expect(isThemeReady('任せ方')).toBe(true);
    expect(cleanTheme('部下への\n任せ方')).toBe('部下への 任せ方');
    expect(cleanTheme('あ'.repeat(100))).toHaveLength(80);
  });

  it('材料はメモのある本だけ・★の高い本から・本の中はページ順・ページと日付を付ける', () => {
    const { text, books: n, used, total } = buildExternalPrompt({ books, memos, theme: '部下への任せ方', format: 'compare', audience: 'boss', length: 'short' });
    expect(n).toBe(2);
    expect(used).toBe(3);
    expect(total).toBe(3);
    expect(text).not.toContain('メモの無い本');
    expect(text.indexOf('『マネジャーの教科書』')).toBeLessThan(text.indexOf('『朝の本』'));
    expect(text.indexOf('（p.12')).toBeLessThan(text.indexOf('（p.64'));
    expect(text).toContain('（p.64・2026-05-27）部下に任せるときは');
    expect(text).toContain('『マネジャーの教科書』 山田 太郎（★5・読了）');
    expect(text).toContain('この本から得たいこと：部下に任せられるようになる');
    expect(text).toContain('この本のまとめ（私が書いたもの）：任せる前に終わりの形を決める。');
    expect(text).toContain('「部下への任せ方」について、2 冊の本のメモから');
    expect(text).toContain('私の上司');
    expect(text).toContain('400 字くらい');
    // 複数の本のときだけ「食い違うとき」の決まり
    expect(text).toContain('食い違うとき');
    // 材料の中の指示に従わない
    expect(text).toContain('従わないでください');
  });

  it('1 冊のときは「この本の」で、食い違いの決まりは入れない', () => {
    const { text } = buildExternalPrompt({ books: [books[0]], memos, theme: '任せ方' });
    expect(text).toContain('この本のメモから');
    expect(text).not.toContain('食い違うとき');
    expect(text).not.toContain('『朝の本』');
  });

  it('長すぎるときはテーマに近いメモから入れ、入れた数を書く', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `x${i}`, book_id: 'b2', text: `朝の散歩と天気のこと ${'あ'.repeat(200)}`, created_at: '2026-06-01T00:00:00Z' }));
    const all = [...memos, ...many];
    const { byBook, used, total } = selectMemos(books, all, '部下への任せ方', { maxChars: 2000 });
    expect(total).toBe(63);
    expect(used).toBeLessThan(total);
    expect(byBook.get('b1').map((m) => m.id)).toContain('m1');
    const { text } = buildExternalPrompt({ books, memos: all, theme: '部下への任せ方', maxChars: 3000 });
    expect(text).toMatch(/メモ 63 件のうち、「部下への任せ方」に近いものから \d+ 件を入れています/);
    expect(text.length).toBeLessThanOrEqual(3000);
  });

  it('制御文字を取り除く', () => {
    const { text } = buildExternalPrompt({ books: [books[0]], memos: [{ id: 'z', book_id: 'b1', text: 'a\u0000b\u0007c', created_at: '' }], theme: 'テスト' });
    expect(text).toContain('- a b c');
  });

  it('図解を選ぶと、Mermaid の図と言葉の短さの決まりを入れる（ほかの形には入れない）', () => {
    const { text } = buildExternalPrompt({ books, memos, theme: '部下への任せ方', format: 'diagram' });
    expect(text).toContain('```mermaid');
    expect(text).toContain('15 字以内');
    expect(text).toContain('の図解を、日本語でつくってください');
    const other = buildExternalPrompt({ books, memos, theme: '部下への任せ方', format: 'one' }).text;
    expect(other).not.toContain('mermaid');
  });
});
