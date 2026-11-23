import { describe, it, expect, vi } from 'vitest';
import { humanizeError, isSystemError, withTimeout, unexpectedError, NETWORK_ERROR } from './authErrors';

describe('authErrors: 失敗の文は操作ごと（2026-11-23）', () => {
  const odd = { status: 418, code: 'teapot' };
  it('分からない失敗は、操作の名前で見出しを分ける', () => {
    expect(humanizeError(odd, 'signin')).toMatch(/^ログインできませんでした。/);
    expect(humanizeError(odd, 'signup')).toMatch(/^登録できませんでした。/);
    expect(humanizeError(odd, 'reset')).toMatch(/^メールを送れませんでした。/);
    expect(humanizeError(odd, 'resend')).toMatch(/^メールを送れませんでした。/);
    expect(humanizeError(odd, 'guest')).toMatch(/^始められませんでした。/);
    expect(humanizeError(odd)).toMatch(/^ログインできませんでした。/);
  });
  it('通信・サーバー・打ち切りは ErrorMessage の面で出す（入力の誤りは出さない）', () => {
    for (const op of ['signin', 'signup', 'reset', 'guest']) {
      expect(isSystemError(humanizeError(odd, op))).toBe(true);
      expect(isSystemError(humanizeError({ code: 'auth_timeout' }, op))).toBe(true);
      expect(isSystemError(unexpectedError(op))).toBe(true);
    }
    expect(isSystemError(NETWORK_ERROR)).toBe(true);
    expect(isSystemError(humanizeError({ message: 'Invalid login credentials' }))).toBe(false);
    expect(isSystemError('')).toBe(false);
  });
  it('打ち切りの文は操作の名前と「応答がありませんでした」', () => {
    expect(humanizeError({ code: 'auth_timeout' }, 'guest')).toBe('始められませんでした。応答がありませんでした。通信状況を確認して、もう一度お試しください。');
  });
});

describe('withTimeout', () => {
  it('間に合えばそのまま・間に合わなければ auth_timeout', async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 30000);
    vi.advanceTimersByTime(30000);
    await expect(p).rejects.toMatchObject({ code: 'auth_timeout' });
    vi.useRealTimers();
  });
});
