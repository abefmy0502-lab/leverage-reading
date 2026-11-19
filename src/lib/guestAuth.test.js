import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { auth: {} }, isDemo: false, isSupabaseConfigured: true }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

const { isGuestUser, linkErrorMessage } = await import('./guestAuth');
const { withTimeout } = await import('./appleAuth');

describe('登録せずに始める（2026-11-19・App 審査 5.1.1(v)）', () => {
  it('匿名のアカウントだけを「登録していない」とみなす', () => {
    expect(isGuestUser({ id: 'a', is_anonymous: true })).toBe(true);
    expect(isGuestUser({ id: 'a', is_anonymous: false, email: 'x@example.com' })).toBe(false);
    expect(isGuestUser({ id: 'a' })).toBe(false);
    expect(isGuestUser(null)).toBe(false);
  });
  it('つなぐときのエラーを利用者の言葉に', () => {
    expect(linkErrorMessage({ code: 'identity_already_exists' })).toContain('この Apple ID は、もう別のアカウント');
    expect(linkErrorMessage({ code: 'email_exists' })).toContain('このメールアドレスは、もう別のアカウント');
    expect(linkErrorMessage({ message: 'Manual linking is disabled' })).toContain('いまはアカウントをつなげません');
    expect(linkErrorMessage({ code: 'apple_session_timeout' })).toContain('終わりませんでした');
    expect(linkErrorMessage({ message: 'something else' })).toBe(null);
  });
});

describe('Apple でサインインの待ちの上限（2026-11-19・App 審査 2.1(a)）', () => {
  it('時間内に終われば答えを返し、終わらなければ code つきのエラー', async () => {
    await expect(withTimeout(Promise.resolve(7), 50, 'x')).resolves.toBe(7);
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 1000, 'apple_authorize_timeout');
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toMatchObject({ code: 'apple_authorize_timeout' });
    vi.useRealTimers();
  });
});
