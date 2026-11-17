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
    // 読み込み元（capacitor://localhost）だけは *-src の後ろに足す（iOS 27・2026-11-17）。ほかはヘッダーと同じ。
    for (const name of ['default-src', 'script-src', 'style-src', 'font-src']) {
      expect(dir(meta, name)).toBe(`${dir(header, name)} capacitor://localhost`);
    }
    for (const name of ['object-src', 'base-uri', 'form-action']) {
      expect(dir(meta, name)).toBe(dir(header, name));
    }
    expect(dir(meta, 'connect-src').startsWith(dir(header, 'connect-src'))).toBe(true);
  });
  it('同じ URL を 2 回足さない', () => {
    expect(cspForMeta(meta, 'https://orime.vercel.app')).toBe(meta);
  });
});

describe('iOS 27 の WKWebView（2026-11-17）', () => {
  it('読み込み元の capacitor://localhost を *-src に足し、upgrade-insecure-requests は外す', async () => {
    const { cspForMeta } = await import('./cspMeta.mjs');
    const out = cspForMeta("default-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; upgrade-insecure-requests", 'https://orime.vercel.app');
    expect(out).toContain("script-src 'self' capacitor://localhost");
    expect(out).toContain("default-src 'self' capacitor://localhost");
    expect(out).toContain('img-src');
    expect(out).not.toContain('upgrade-insecure-requests');
    expect(out).not.toContain('frame-ancestors');
  });
});
