import { describe, it, expect } from 'vitest';
import { toMessage, fieldRequiredMessage } from './errors';

describe('toMessage', () => {
  it('returns the fallback for null', () => {
    expect(toMessage(null, 'fb')).toBe('fb');
  });
  it('passes through string errors', () => {
    expect(toMessage('plain message')).toBe('plain message');
  });
  it('humanizes auth (401/403)', () => {
    expect(toMessage({ status: 401 })).toMatch(/ログイン/);
    expect(toMessage({ status: 403 })).toMatch(/ログイン/);
  });
  it('humanizes rate limit', () => {
    expect(toMessage({ status: 429 })).toMatch(/リクエスト|混み合/);
  });
  it('gives AI-specific copy for rate-limited AI calls', () => {
    expect(toMessage({ status: 429, url: 'https://x/api/claude' })).toMatch(/AI/);
  });
  it('humanizes unique violation (23505)', () => {
    expect(toMessage({ code: '23505' })).toMatch(/すでに存在/);
  });
  it('humanizes RLS denial (42501)', () => {
    expect(toMessage({ code: '42501' })).toMatch(/権限/);
  });
  it('humanizes 5xx', () => {
    expect(toMessage({ status: 503 })).toMatch(/サーバー/);
  });
  it('humanizes timeout / abort', () => {
    expect(toMessage({ name: 'AbortError' })).toMatch(/時間/);
  });
});

describe('fieldRequiredMessage', () => {
  it('builds a required-field message', () => {
    expect(fieldRequiredMessage('タイトル')).toBe('タイトルを入力してください。');
  });
});
