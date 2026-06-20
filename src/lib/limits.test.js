import { describe, it, expect } from 'vitest';
import {
  clamp,
  validatePassword,
  validateImageFile,
  MAX_IMAGE_BYTES,
} from './limits';

describe('clamp', () => {
  it('returns the string unchanged when within bounds', () => {
    expect(clamp('hello', 10)).toBe('hello');
  });
  it('truncates to max characters', () => {
    expect(clamp('hello world', 5)).toBe('hello');
  });
  it('passes through non-strings untouched', () => {
    expect(clamp(null, 5)).toBe(null);
    expect(clamp(undefined, 5)).toBe(undefined);
    expect(clamp(42, 5)).toBe(42);
  });
});

describe('validatePassword', () => {
  it('accepts a strong password', () => {
    expect(validatePassword('abcd1234XY')).toBeNull();
  });
  it('rejects non-strings', () => {
    expect(validatePassword(undefined)).toMatch(/入力/);
  });
  it('rejects passwords shorter than 8 chars', () => {
    expect(validatePassword('ab12')).toMatch(/8 文字/);
  });
  it('requires a letter', () => {
    expect(validatePassword('12345678')).toMatch(/英字/);
  });
  it('requires a digit', () => {
    expect(validatePassword('abcdefgh')).toMatch(/数字/);
  });
  it('rejects well-known weak passwords (case-insensitive)', () => {
    expect(validatePassword('Password1')).toMatch(/推測/);
    expect(validatePassword('abc12345')).toMatch(/推測/);
  });
});

describe('validateImageFile', () => {
  it('returns null for a valid JPEG', () => {
    expect(validateImageFile({ size: 1000, type: 'image/jpeg', name: 'a.jpg' })).toBeNull();
  });
  it('returns null when there is no file', () => {
    expect(validateImageFile(null)).toBeNull();
  });
  it('rejects files over the 10MB cap', () => {
    expect(validateImageFile({ size: MAX_IMAGE_BYTES + 1, type: 'image/png', name: 'big.png' }))
      .toMatch(/大きすぎ/);
  });
  it('rejects disallowed MIME types', () => {
    expect(validateImageFile({ size: 1000, type: 'image/gif', name: 'a.gif' }))
      .toMatch(/JPEG/);
  });
  it('rejects disallowed extensions even when MIME is missing', () => {
    expect(validateImageFile({ size: 1000, type: '', name: 'a.svg' }))
      .toMatch(/JPEG/);
  });
  it('allows files with no extension (MIME governs)', () => {
    expect(validateImageFile({ size: 1000, type: 'image/webp', name: 'noext' })).toBeNull();
  });
  it('allows files with valid extension but missing MIME', () => {
    expect(validateImageFile({ size: 1000, type: '', name: 'photo.png' })).toBeNull();
  });
  it('rejects files where neither MIME nor extension identifies an allowed image', () => {
    expect(validateImageFile({ size: 1000, type: '', name: 'mystery' })).toMatch(/判別/);
  });
});
