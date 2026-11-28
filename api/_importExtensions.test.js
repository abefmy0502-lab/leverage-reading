// サーバー（Vercel の関数）は Node の ESM で読むので、相対の import に .js が無いと関数ごと動かない
//   （src/lib/rakutenLink.js の './amazonLink' で /api/cover が 500 になり、表紙・本の検索・公開のページが止まった・2026-11-28）。
//   api/ から辿れるすべてのファイルの相対の import が .js / .json で終わることを確かめる。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RE = /(?:import|export)[^'"]*?from\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function collect() {
  const seen = new Set();
  const bad = [];
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    let src;
    try { src = fs.readFileSync(file, 'utf8'); } catch { bad.push(`見つからない: ${file}`); return; }
    for (const m of src.matchAll(RE)) {
      const rel = m[1] || m[2];
      if (!/\.(m?js|json)$/.test(rel)) { bad.push(`${path.relative(process.cwd(), file)} → ${rel}`); continue; }
      walk(path.resolve(path.dirname(file), rel));
    }
  };
  const dir = path.resolve(process.cwd(), 'api');
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.js') && !f.includes('.test.')) walk(path.join(dir, f));
  return { bad, count: seen.size };
}

describe('サーバーの import', () => {
  it('api/ から辿れる相対の import はすべて拡張子つき', () => {
    const { bad, count } = collect();
    expect(count).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  });
});
