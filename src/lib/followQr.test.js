import { describe, it, expect } from 'vitest';
import { followLink, qrPath, scanResult } from './followQr';
import { SITE_URL } from './legalLinks';

describe('followLink', () => {
  it('ID からフォローのリンク', () => {
    expect(followLink('abcde12345')).toBe(`${SITE_URL}/?follow=abcde12345`);
  });
  it('形の違う ID は空', () => {
    expect(followLink('')).toBe('');
    expect(followLink('ABC')).toBe('');
  });
});

describe('qrPath', () => {
  it('マスの数と道を返す', () => {
    const q = qrPath(`${SITE_URL}/?follow=abcde12345`);
    expect(q.size).toBeGreaterThanOrEqual(21);
    expect(q.d.startsWith('M')).toBe(true);
  });
  it('文字が無ければ null', () => {
    expect(qrPath('')).toBe(null);
  });
});

describe('scanResult', () => {
  it('フォローのリンク・公開のページは follow', () => {
    expect(scanResult(`${SITE_URL}/?follow=abcde12345`)).toEqual({ kind: 'follow', id: 'abcde12345' });
    expect(scanResult('https://orime.vercel.app/u/abcde12345')).toEqual({ kind: 'follow', id: 'abcde12345' });
    expect(scanResult('https://orime.vercel.app/u/abcde12345/b/xyz')).toEqual({ kind: 'follow', id: 'abcde12345' });
  });
  it('自分の QR は self', () => {
    expect(scanResult(`${SITE_URL}/?follow=abcde12345`, 'abcde12345')).toEqual({ kind: 'self' });
  });
  it('ほかの QR・ID だけの文字は other', () => {
    expect(scanResult('https://example.com/')).toEqual({ kind: 'other' });
    expect(scanResult('abcde12345')).toEqual({ kind: 'other' });
    expect(scanResult('')).toEqual({ kind: 'other' });
  });
});
