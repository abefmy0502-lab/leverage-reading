import { describe, it, expect } from 'vitest';
import { cleanProgress, progressLabel, progressSpoken, hasProgress, isArchived } from './readingProgress';

describe('どこまで読んだか（2026-11-26）', () => {
  it('ページ: 総ページより先は総ページに・0 や負は記録なし', () => {
    expect(cleanProgress({ current: 120, total: 320 })).toEqual({ unit: 'page', current: 120, total: 320 });
    expect(cleanProgress({ current: 400, total: 320 }).current).toBe(320);
    expect(cleanProgress({ current: 0, total: 320 }).current).toBeNull();
    expect(cleanProgress({ current: 'abc', total: '' })).toEqual({ unit: 'page', current: null, total: null });
  });
  it('％: 0〜100・総ページは持たない', () => {
    expect(cleanProgress({ unit: 'percent', current: 45, total: 300 })).toEqual({ unit: 'percent', current: 45, total: null });
    expect(cleanProgress({ unit: 'percent', current: 150 }).current).toBe(100);
  });
  it('表示と読み上げ', () => {
    expect(progressLabel({ current: 120, total: 320 })).toBe('p.120 / 320');
    expect(progressLabel({ current: 120 })).toBe('p.120');
    expect(progressLabel({ unit: 'percent', current: 45 })).toBe('45％');
    expect(progressLabel({ total: 320 })).toBe('');
    expect(progressSpoken({ current: 120, total: 320 })).toBe('320 ページのうち 120 ページまで');
    expect(hasProgress({ total: 320 })).toBe(false);
    expect(hasProgress({ unit: 'percent', current: 0 })).toBe(true);
  });
  it('アーカイブの印', () => {
    expect(isArchived({ archivedAt: '2026-11-26T00:00:00Z' })).toBe(true);
    expect(isArchived({ archivedAt: null })).toBe(false);
  });
});

describe('空の欄は 0％ にしない（2026-11-27）', () => {
  it('％で空・null は記録なし', async () => {
    const { cleanProgress, hasProgress } = await import('./readingProgress');
    expect(cleanProgress({ unit: 'percent', current: '' }).current).toBe(null);
    expect(cleanProgress({ unit: 'percent', current: null }).current).toBe(null);
    expect(hasProgress({ unit: 'percent', current: null })).toBe(false);
    expect(cleanProgress({ unit: 'percent', current: '0' }).current).toBe(0);
  });
});
