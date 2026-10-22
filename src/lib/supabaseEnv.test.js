import { describe, it, expect } from 'vitest';
import { cleanEnv, isHttpUrl } from './supabase';

describe('Supabase の環境変数の読み方（2026-10-22 本番が真っ暗になった件）', () => {
  it('前後の空白・改行・引用符を落とす', () => {
    expect(cleanEnv(' "https://abc.supabase.co"\n')).toBe('https://abc.supabase.co');
    expect(cleanEnv("'x'")).toBe('x');
    expect(cleanEnv(undefined)).toBe('');
  });
  it('URL の形だけ通す', () => {
    expect(isHttpUrl('https://abc.supabase.co')).toBe(true);
    expect(isHttpUrl('abc.supabase.co')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});
