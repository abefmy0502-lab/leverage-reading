// JSX で使っている部品（大文字で始まるタグ）が、そのファイルで import か定義されているかを確かめる。
// ビルド（vite/esbuild）は未定義の部品を通してしまい、画面を開いた瞬間に落ちる
// （2026-09-26: 相談の「学びを書く」が ArrowLeft の import 漏れで落ちた再発防止）。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.jsx')) out.push(p);
  }
  return out;
}

function missingComponents(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const tags = new Set([...code.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>.]/g)].map((m) => m[1]));
  const defined = new Set();
  for (const m of code.matchAll(/import\s+([^;]+?)\s+from/g)) {
    for (const n of m[1].matchAll(/\bas\s+([A-Za-z0-9_]+)/g)) defined.add(n[1]);
    for (const n of m[1].matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) defined.add(n[1]);
  }
  for (const m of code.matchAll(/(?:function|const|let|class)\s+([A-Z][A-Za-z0-9_]*)/g)) defined.add(m[1]);
  // 引数・分割代入で受け取った部品（{ icon: Icon } / ({ Icon }) など）
  for (const m of code.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b\s*[,}):=]/g)) defined.add(m[1]);
  return [...tags].filter((t) => !defined.has(t) && t !== 'Fragment');
}

describe('JSX の部品はすべて import か定義されている', () => {
  const files = walk(join(process.cwd(), 'src'));
  it.each(files.map((f) => [f.replace(process.cwd() + '/', ''), f]))('%s', (_name, file) => {
    expect(missingComponents(readFileSync(file, 'utf8'))).toEqual([]);
  });
  it('import 漏れを検出できる', () => {
    expect(missingComponents("import { X } from 'y';\nconst A = () => <ArrowLeft />;")).toEqual(['ArrowLeft']);
  });
});
