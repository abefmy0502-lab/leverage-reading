import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {}, isSupabaseConfigured: false, isDemo: false }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../lib/ai', () => ({ invalidateKnowledgeCache: () => {} }));

const { transformMemo, memoDeleteFailMessage } = await import('./useBookMemos');

describe('メモの形（2026-11-26）', () => {
  it('思い出しの進み具合も持つ（削除を元に戻したときに 0 に戻さない）', () => {
    const m = transformMemo({ id: 'm1', book_id: 'b1', text: 'x', recall_count: 3, last_recalled_at: '2026-11-01T00:00:00Z' });
    expect(m.recallCount).toBe(3);
    expect(m.lastRecalledAt).toBe('2026-11-01T00:00:00Z');
  });
  it('列が無い DB では null / 0', () => {
    const m = transformMemo({ id: 'm1', book_id: 'b1' });
    expect(m.recallCount).toBe(0);
    expect(m.lastRecalledAt).toBeNull();
  });
});

describe('メモを消せなかったときの 1 行（2026-11-26）', () => {
  const origNavigator = globalThis.navigator;
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: origNavigator, configurable: true, writable: true });
  });
  const setOnline = (onLine) => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine }, configurable: true, writable: true });
  };
  it('何ができなかったかで始まる', () => {
    setOnline(true);
    expect(memoDeleteFailMessage(new Error('boom'))).toBe('メモを削除できませんでした。');
  });
  it('理由があれば後ろに添える', () => {
    setOnline(true);
    expect(memoDeleteFailMessage('通信が切れました。')).toBe('メモを削除できませんでした。通信が切れました。');
  });
  it('オフラインは「保存」と言わない', () => {
    setOnline(false);
    const msg = memoDeleteFailMessage(new Error('x'));
    expect(msg.startsWith('メモを削除できませんでした。オフラインです。')).toBe(true);
    expect(msg).not.toContain('保存');
  });
});
