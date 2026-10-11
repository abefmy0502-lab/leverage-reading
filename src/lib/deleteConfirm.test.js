import { describe, it, expect } from 'vitest';
import { deleteConfirmTarget, deleteConfirmMatches, isAppleAccount } from './deleteConfirm';

describe('退会の確認で入れる言葉', () => {
  it('ふだんはメールアドレス（大文字・空白は区別しない）', () => {
    const t = deleteConfirmTarget({ email: 'Me@Example.com', app_metadata: { provider: 'email' } });
    expect(t).toEqual({ byWord: false, expected: 'Me@Example.com' });
    expect(deleteConfirmMatches(' me@example.com ', t)).toBe(true);
    expect(deleteConfirmMatches('削除', t)).toBe(false);
  });
  it('Apple でサインイン・メールを非公開・メールなしは「削除」', () => {
    expect(deleteConfirmTarget({ email: 'a@b.jp', app_metadata: { provider: 'apple' } }).expected).toBe('削除');
    expect(deleteConfirmTarget({ email: 'a@b.jp', app_metadata: { provider: 'email', providers: ['email', 'apple'] } }).byWord).toBe(true);
    expect(deleteConfirmTarget({ email: 'x1y2@privaterelay.appleid.com', app_metadata: {} }).expected).toBe('削除');
    expect(deleteConfirmTarget({ email: '' }).expected).toBe('削除');
    expect(deleteConfirmMatches(' 削除 ', deleteConfirmTarget({ email: '' }))).toBe(true);
    expect(isAppleAccount(null)).toBe(false);
  });
});
