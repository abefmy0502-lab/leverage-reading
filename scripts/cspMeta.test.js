// scripts/cspMeta.mjs: iOS アプリ用の CSP の meta（vercel.json と同じ許可の範囲＋サイトの絶対 URL）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cspForMeta } from './cspMeta.mjs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const header = vercel.headers.flatMap((h) => h.headers || []).find((h) => h.key === 'Content-Security-Policy').value;
const dir = (csp, name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) || '';

describe('cspForMeta', () => {
  const meta = cspForMeta(header, 'https://orime.vercel.app/');
  it('connect-src と img-src にサイトの絶対 URL を足す（iOS から /api に届くように）', () => {
    expect(dir(meta, 'connect-src').split(/\s+/)).toContain('https://orime.vercel.app');
    expect(dir(meta, 'img-src').split(/\s+/)).toContain('https://orime.vercel.app');
  });
  it('ほかの許可はヘッダーと同じ・meta で効かない frame-ancestors は外す', () => {
    expect(meta).not.toMatch(/frame-ancestors/);
    for (const name of ['default-src', 'script-src', 'style-src', 'font-src', 'object-src', 'base-uri', 'form-action']) {
      expect(dir(meta, name)).toBe(dir(header, name));
    }
    expect(dir(meta, 'connect-src').startsWith(dir(header, 'connect-src'))).toBe(true);
  });
  it('同じ URL を 2 回足さない', () => {
    expect(cspForMeta(meta, 'https://orime.vercel.app')).toBe(meta);
  });
});
