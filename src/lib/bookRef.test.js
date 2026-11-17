import { describe, it, expect, beforeEach } from 'vitest';
import { refTerm, pickRef, loadBookRef, refForPrompt, clearBookRefCache } from './bookRef';
import { PROMPTS as prompts } from './prompts';

const row = { isbn: '9784000000001', title: 'マインドセット「やればできる！」の研究', author: '著', difficulty: 2, prereq: '', rec_points: 8, endorsers: ['甲', '乙'], ext_summary: '書評の 要約' };

describe('読書準備に使う書評の参考', () => {
  beforeEach(() => clearBookRefCache());
  it('書名から検索の言葉（副題の前まで・20 字まで）', () => {
    expect(refTerm('イシューからはじめよ ― 知的生産の「シンプルな本質」')).toBe('イシューからはじめよ');
    expect(refTerm('あ')).toBe('');
  });
  it('ISBN が合う本だけ・ISBN が無ければ書名がほぼ同じ本', () => {
    const list = [{ isbn: '9784000000009', title: 'ちがう本', difficulty: 1, endorsers: [] }, { isbn: '9784000000001', title: 'マインドセット', difficulty: 2, prereq: '', endorsers: ['甲'], extSummary: 'x' }];
    expect(pickRef(list, { isbn: '978-4-00-000000-1' })).toMatchObject({ difficulty: 2 });
    expect(pickRef(list, { isbn: '9784999999999', title: 'マインドセット' })).toBeNull();
    expect(pickRef(list, { title: 'マインドセット' })).toMatchObject({ difficulty: 2 });
  });
  it('検索して 1 冊を選ぶ・つながらなければ null', async () => {
    const rpc = async () => ({ data: [row], error: null });
    const ref = await loadBookRef({ isbn: '9784000000001', title: 'マインドセット' }, { rpc });
    expect(ref).toMatchObject({ difficulty: 2, endorsers: ['甲', '乙'], extSummary: '書評の 要約' });
    const bad = async () => ({ data: null, error: { code: 'x' } });
    expect(await loadBookRef({ isbn: '9784000000002', title: '別の本' }, { rpc: bad })).toBeNull();
  });
  it('AI に渡す塊は 難しさ・前提・推薦の人数・要約（名前は渡さない）', () => {
    const t = refForPrompt({ difficulty: 3, prereq: '会計の基礎', endorsers: ['甲', '乙'], recPoints: 9, extSummary: '要約\n本文' });
    expect(t).toContain('難しさ: 上級（前提: 会計の基礎）');
    expect(t).toContain('すすめた人: 2 人');
    expect(t).not.toContain('甲');
    expect(t).toContain('写さない');
    expect(refForPrompt(null)).toBe('');
  });
  it('この本で学べること・読書計画シートの指示文に入る（無ければ入らない）', () => {
    expect(prompts.bookBrief.user({ title: '本', ref: '- 難しさ: 入門' })).toContain('書評の参考');
    expect(prompts.bookBrief.user({ title: '本' })).not.toContain('===== 書評の参考');
    expect(prompts.setupSheet.user({ title: '本', ref: '- 難しさ: 上級' })).toContain('- 難しさ: 上級');
  });
});
