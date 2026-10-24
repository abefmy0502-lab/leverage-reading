// vercel.json の source は Vercel（path-to-regexp v6）の書き方。( ) の中に ( ) を入れると
// 「Capturing groups are not allowed」でビルドが止まる（2026-10-22 に 5 回デプロイが落ちた）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const conf = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const maxDepth = (src) => { let d = 0, m = 0; for (const ch of src) { if (ch === '(') m = Math.max(m, ++d); else if (ch === ')') d--; } return m; };

describe('vercel.json の source', () => {
  for (const kind of ['headers', 'rewrites', 'redirects']) {
    for (const r of conf[kind] || []) {
      it(`${kind}: ${r.source} は ( ) を入れ子にしない`, () => {
        expect(r.source.startsWith('/')).toBe(true);
        expect(maxDepth(r.source)).toBeLessThanOrEqual(1);
      });
    }
  }
});
