import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeNoteLinks, noteGuideUrl, isNoteUrl, loadNoteLinks, _resetNoteLinksForTest } from './noteLinks';
import { buildLlmsTxt, GUIDE_TITLES } from '../../scripts/llmsTxt.mjs';
import { HELP_CONTENT } from './helpContent';

describe('note の説明書のリンク', () => {
  beforeEach(() => _resetNoteLinksForTest());

  it('note.com の https だけを通す', () => {
    expect(isNoteUrl('https://note.com/orime_app')).toBe(true);
    expect(isNoteUrl('https://note.com/orime_app/n/n12ab34')).toBe(true);
    expect(isNoteUrl('http://note.com/orime_app')).toBe(false);
    expect(isNoteUrl('https://evil.example/note.com/x')).toBe(false);
    expect(isNoteUrl('javascript:alert(1)')).toBe(false);
    const l = normalizeNoteLinks({ home: 'https://note.com/a', guides: { myBookBrain: 'https://note.com/a/n/n1', bad: 'https://x.com', 'a b': 'https://note.com/a/n/n2' } });
    expect(l).toEqual({ home: 'https://note.com/a', guides: { myBookBrain: 'https://note.com/a/n/n1' } });
  });

  it('その画面の記事が無ければ note のトップ・どちらも無ければ出さない', () => {
    const l = { home: 'https://note.com/a', guides: { myBookBrain: 'https://note.com/a/n/n1' } };
    expect(noteGuideUrl(l, 'myBookBrain')).toBe('https://note.com/a/n/n1');
    expect(noteGuideUrl(l, 'review')).toBe('https://note.com/a');
    expect(noteGuideUrl(normalizeNoteLinks({}), 'review')).toBe('');
  });

  it('読めなければ空（落ちない）', async () => {
    const l = await loadNoteLinks({ fetchImpl: async () => { throw new Error('offline'); } });
    expect(l.home).toBe('');
  });

  it('JSON を読んで形を確かめる', async () => {
    const l = await loadNoteLinks({ fetchImpl: async () => ({ ok: true, json: async () => ({ home: 'https://note.com/a', guides: {} }) }) });
    expect(l.home).toBe('https://note.com/a');
  });

  it('llms.txt: 記事が無ければ note の節を出さず、あれば機能ごとに並べる', () => {
    const none = buildLlmsTxt({ site: 'https://orime.vercel.app', note: { home: '', guides: {} } });
    expect(none).toContain('# orime');
    expect(none).not.toContain('note.com');
    const some = buildLlmsTxt({ site: 'https://orime.vercel.app', note: { home: 'https://note.com/a', guides: { myBookBrain: 'https://note.com/a/n/n1' } } });
    expect(some).toContain('[使い方の説明書（note）](https://note.com/a)');
    expect(some).toContain('[相談（自分のメモから答える AI）](https://note.com/a/n/n1)');
    expect(/[０-９]/.test(some)).toBe(false);
  });

  it('記事の見出しはヘルプの画面のキーと同じ', () => {
    Object.keys(GUIDE_TITLES).forEach((k) => expect(HELP_CONTENT[k], k).toBeTruthy());
  });
});
