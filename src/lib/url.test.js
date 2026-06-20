import { describe, it, expect } from 'vitest';
import { ensureHttps } from './url';

describe('ensureHttps', () => {
  it('upgrades http:// to https://', () => {
    expect(ensureHttps('http://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
  });
  it('leaves https:// untouched', () => {
    expect(ensureHttps('https://example.com/x')).toBe('https://example.com/x');
  });
  it('leaves protocol-relative and other strings untouched', () => {
    expect(ensureHttps('//cdn.example.com/x')).toBe('//cdn.example.com/x');
    expect(ensureHttps('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  });
  it('passes through empty / non-strings', () => {
    expect(ensureHttps('')).toBe('');
    expect(ensureHttps(null)).toBe(null);
    expect(ensureHttps(undefined)).toBe(undefined);
  });
});
