// 📚 AI 選書の推薦カードを整える（lib/advisorRecs.js・2026-10-04）。
import { describe, it, expect, vi } from 'vitest';
import { normalizeAdvisorRec, normalizeAdvisorRecs, resolveMixedRec, focusText, emptyReasonOf } from './advisorRecs';

describe('normalizeAdvisorRec', () => {
  it('書名の『』を外し、AI が付けた表紙・ISBN を捨てる', () => {
    const r = normalizeAdvisorRec({ title: '『時間術大全』', author: ' ジェイク・ナップ ', cover: 'https://x/y.jpg', isbn: '9780000000000', why: 'w' });
    expect(r).toEqual({ title: '時間術大全', author: 'ジェイク・ナップ', why: 'w' });
  });

  it('確かめた（_verify: ok）保存済みのカードは表紙・ISBN を残す', () => {
    const r = normalizeAdvisorRec({ title: '時間術大全', author: 'a', cover: 'c', isbn: 'i', _verify: 'ok' });
    expect(r).toMatchObject({ cover: 'c', isbn: 'i', _verify: 'ok' });
  });

  it('2 冊を混ぜた書名には _alts（確かめる順）を付け、確かめた結果は捨てる', () => {
    const r = normalizeAdvisorRec({ title: '7つの習慣 または やめる習慣', author: 'コヴィー', _verify: 'unknown' });
    expect(r._alts).toEqual(['7つの習慣 または やめる習慣', '7つの習慣', 'やめる習慣']);
    expect(r._verify).toBeUndefined();
    // 2 回かけても候補を落とさない
    expect(normalizeAdvisorRec(r)._alts).toEqual(r._alts);
  });

  it('書名の無いものは捨てる', () => {
    expect(normalizeAdvisorRecs([{ title: '' }, null, { author: 'x' }, { title: 'A' }])).toEqual([{ title: 'A', author: '' }]);
  });
});

describe('resolveMixedRec', () => {
  const rec = normalizeAdvisorRec({ title: '7つの習慣 または やめる習慣', author: 'スティーブン・R・コヴィー' });

  it('見つかった最初の 1 冊のカードにする', async () => {
    const verify = vi.fn(async ({ title }) => (title === '7つの習慣' ? { exists: true, isbn: '978' } : { exists: false }));
    const { rec: out, v } = await resolveMixedRec(rec, verify);
    expect(out.title).toBe('7つの習慣');
    expect(out._alts).toBeUndefined();
    expect(v).toMatchObject({ exists: true, isbn: '978' });
    expect(verify).toHaveBeenCalledWith({ title: '7つの習慣 または やめる習慣', author: 'スティーブン・R・コヴィー' });
  });

  it('どれも見つからない／確かめられない → _mixed（画面に出さない）', async () => {
    const none = await resolveMixedRec(rec, async () => ({ exists: false }));
    expect(none.rec._mixed).toBe(true);
    expect(none.v.exists).toBe(false);
    const down = await resolveMixedRec(rec, async () => { throw new Error('net'); });
    expect(down.rec._mixed).toBe(true);
    expect(down.v.exists).toBeNull();
  });
});

describe('focusText', () => {
  it('章・部・ページの番号を書いた注目ポイントは出さない', () => {
    expect(focusText('第3章')).toBe('');
    expect(focusText('第2部のルール1〜2')).toBe('');
    expect(focusText('Chapter 4 の後半')).toBe('');
    expect(focusText('p.120 あたり')).toBe('');
    expect(focusText('5章の事例')).toBe('');
  });
  it('テーマ・場面はそのまま', () => {
    expect(focusText('毎日 1 つ「ハイライト」を決める考え方')).toBe('毎日 1 つ「ハイライト」を決める考え方');
    expect(focusText('')).toBe('');
  });
});

describe('emptyReasonOf', () => {
  it('カードがあれば null・全部「無い」なら none・確かめられないものがあれば unknown', () => {
    expect(emptyReasonOf([{ title: 'A' }], [false])).toBeNull();
    expect(emptyReasonOf([], [false, false])).toBe('none');
    expect(emptyReasonOf([], [false, null])).toBe('unknown');
    expect(emptyReasonOf([], [])).toBe('unknown');
  });
});
