import { describe, it, expect } from 'vitest';
import { scrubText } from './sentry';

describe('Sentry に送る文字の洗い方（2026-10-22 監査）', () => {
  it('メール・URL の識別子・REST の id を落とす', () => {
    expect(scrubText('user@example.com が /?recall=abc123&book=xyz を開いた')).toBe('[email] が /?recall=[redacted]&book=[redacted] を開いた');
    expect(scrubText('https://x.supabase.co/rest/v1/book_memos?book_id=eq.123e4567-e89b-12d3-a456-426614174000&select=*')).toBe('https://x.supabase.co/rest/v1/book_memos?book_id=eq.[id]&select=*');
    expect(scrubText(null)).toBe('');
  });
});
