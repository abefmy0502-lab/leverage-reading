import { describe, it, expect } from 'vitest';
import { bookFromSheetPrompt, pickSameBook, refBlockText, insertRef, addBookRef, toIsbn13, REF_MARK } from './_bookRefRelay.js';
import { PROMPTS } from '../src/lib/prompts.js';

const sheet = (extra = {}) => PROMPTS.setupSheet.user({ title: '確率思考の戦略論 どうすれば売上は増えるのか', author: '森岡毅、今西聖貴', purpose: '売上', ...extra });
const diamond = { isbn: '9784478115282', title: '確率思考の戦略論', subtitle: 'どうすれば売上は増えるのか', author: '森岡毅、今西聖貴', difficulty: 2, prereq: '基本的なマーケティング用語の知識' };

function fakeDb(rows, ext, mine = []) {
  const q = (table) => {
    const rowsOf = () => (table === 'books' ? mine : rows);
    const api = {
      select: () => api, ilike: () => api, in: () => api, eq: () => api,
      limit: async () => ({ data: rowsOf(), error: null }),
      maybeSingle: async () => ({ data: table === 'advisor_book_ext' ? ext : null, error: null }),
    };
    return api;
  };
  return { from: q };
}

describe('読書計画シートに書評の参考をサーバーで足す', () => {
  it('指示文から書名と著者を読む', () => {
    expect(bookFromSheetPrompt(sheet())).toEqual({ title: '確率思考の戦略論 どうすれば売上は増えるのか', author: '森岡毅、今西聖貴' });
    expect(bookFromSheetPrompt(sheet({ author: '' })).author).toBe('');
  });
  it('書名がまるごと同じ本だけ（別の版は選ばない）', () => {
    expect(pickSameBook([diamond], { title: '確率思考の戦略論 どうすれば売上は増えるのか', author: '森岡毅' })).toBe(diamond);
    expect(pickSameBook([diamond], { title: '確率思考の戦略論 USJでも実証された数学マーケティングの力', author: '森岡毅' })).toBeNull();
    expect(pickSameBook([diamond], { title: '確率思考の戦略論 どうすれば売上は増えるのか', author: '別の人' })).toBeNull();
  });
  it('塊は 難しさ・前提・人数・要約・使い方（推薦者の名前は入れない）', () => {
    const t = refBlockText(diamond, { endorsers: [{ name: '甲' }, { name: '乙' }], summary: '書評の\n要約' });
    expect(t).toContain(REF_MARK);
    expect(t).toContain('難しさ: 中級（前提: 基本的なマーケティング用語の知識）');
    expect(t).toContain('すすめた人: 2 人');
    expect(t).toContain('書評の 要約');
    expect(t).not.toContain('甲');
    expect(refBlockText({}, null)).toBe('');
  });
  it('出力の形の指示の前に差し込む・2 回は入れない', () => {
    const s = sheet();
    const out = insertRef(s, refBlockText(diamond, null));
    expect(out.indexOf(REF_MARK)).toBeLessThan(out.indexOf('次のフォーマットで出力してください'));
    expect(insertRef(out, refBlockText(diamond, null))).toBe(out);
  });
  it('中継: 読書計画シートだけ・付いていれば何もしない', async () => {
    const db = fakeDb([diamond], { endorsers: [], summary: 'よう約' });
    const msgs = [{ role: 'user', content: sheet() }];
    const out = await addBookRef({ db, purpose: 'setup_sheet', messages: msgs });
    expect(out[0].content).toContain('前提: 基本的なマーケティング用語の知識');
    expect(await addBookRef({ db, purpose: 'book_brief', messages: msgs })).toBe(msgs);
    const already = [{ role: 'user', content: sheet({ ref: '- 難しさ: 中級' }) }];
    expect(await addBookRef({ db, purpose: 'setup_sheet', messages: already })).toBe(already);
  });
  it('探せない・遅いときは何もしない', async () => {
    const slow = { from: () => ({ select() { return this; }, ilike() { return this; }, in() { return this; }, limit: () => new Promise(() => {}) }) };
    const msgs = [{ role: 'user', content: sheet({ title: '遅い本' }) }];
    expect(await addBookRef({ db: slow, purpose: 'setup_sheet', messages: msgs, timeoutMs: 20 })).toBe(msgs);
    expect(await addBookRef({ db: null, purpose: 'setup_sheet', messages: msgs })).toBe(msgs);
  });
  it('本人の本棚の同じ書名の本の ISBN で探す（書名の副題の持ち方が違っても同じ本）', async () => {
    const msgs = [{ role: 'user', content: PROMPTS.setupSheet.user({ title: '確率思考の戦略論', author: '森岡毅、今西聖貴' }) }];
    const db = fakeDb([diamond], null, [{ isbn: '978-4-478-11528-2', title: '確率思考の戦略論' }]);
    const out = await addBookRef({ db, userId: 'u1', purpose: 'setup_sheet', messages: msgs });
    expect(out[0].content).toContain('前提: 基本的なマーケティング用語の知識');
    // 本棚の本が別の版（ISBN が違う）なら、書名が同じでも足さない
    const otherEdition = fakeDb([], null, [{ isbn: '4041041171', title: '確率思考の戦略論' }]);
    expect(await addBookRef({ db: otherEdition, userId: 'u2', purpose: 'setup_sheet', messages: msgs })).toBe(msgs);
  });
  it('ISBN を 13 桁に', () => {
    expect(toIsbn13('4087370089')).toBe('9784087370089');
    expect(toIsbn13('978-4-478-11528-2')).toBe('9784478115282');
    expect(toIsbn13('abc')).toBe('');
  });
});
