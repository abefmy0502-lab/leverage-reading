import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BOOKMETER_BOOKMARKLET, BOOKMETER_BOOKMARKLET_SOURCE } from './bookmeterBookmarklet';
import { parseImportText } from './importers';

describe('読書メーターの全ページを 1 つのファイルに（2026-11-25）', () => {
  it('1 行の javascript: で、文法が正しい', () => {
    expect(BOOKMETER_BOOKMARKLET.startsWith('javascript:')).toBe(true);
    expect(BOOKMETER_BOOKMARKLET).not.toMatch(/\n/);
    // eslint-disable-next-line no-new-func
    expect(() => new Function(decodeURIComponent(BOOKMETER_BOOKMARKLET.slice('javascript:'.length)))).not.toThrow();
    expect(BOOKMETER_BOOKMARKLET_SOURCE).toMatch(/setTimeout\(s,800\)/); // 1 ページずつ間をあける
  });
  it('保存するファイルの形を、今の読み取りがそのまま読める（棚・感想）', () => {
    const page = readFileSync('scripts/fixtures/bookmeter-read.html', 'utf8');
    const items = page.match(/<li[^>]*class="[^"]*group__book[\s\S]*?<\/li>\s*(?=<li[^>]*class="[^"]*group__book|<\/ul>)/g) || [];
    expect(items.length).toBeGreaterThan(0);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>読んだ本 - 読書メーター</title><link rel="canonical" href="https://bookmeter.com/users/1/books/read"></head><body><ul class="book-list__group">${items.join('')}</ul></body></html>`;
    const r = parseImportText('bookmeter-read.html', html);
    expect(r.source).toBe('bookmeter');
    expect(r.books.length).toBe(items.length);
    expect(r.books.every((b) => b.status === 'done')).toBe(true);
  });
});
