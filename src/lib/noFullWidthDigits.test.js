// 🔢 画面の文に全角の数字を使わない（2026-11-25 オーナー「全角数字を使わないで、半角の数字を使って」）。
//   照合のための正規表現（[0-9０-９] など）と、全角を半角に直す処理の行は対象外。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/components', 'src/pages', 'src/lib', 'api'];
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f) && !/\.test\.js$/.test(f)) files.push(p); } };
ROOTS.forEach(walk);
const FW = /[０-９]/;
const ALLOWED = /[0-9]０-９|０-９|0xFEE0|0xfee0/;

describe('画面の文に全角の数字を使わない', () => {
  it('src と api の文（正規表現・変換の行を除く）に全角の数字が無い', () => {
    const bad = [];
    for (const p of files) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (FW.test(line) && !ALLOWED.test(line) && !/^\s*(\/\/|\*)/.test(line)) bad.push(`${p}:${i + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(bad).toEqual([]);
  });
});

describe('保存は数字の幅だけの違いならデータベースの表記のまま（2026-11-26）', () => {
  it('「７つの習慣」で入っている本は、書名を変えなければそのまま・書き換えたら半角', async () => {
    const { keepDbSpelling } = await import('../hooks/useBooks');
    expect(keepDbSpelling('7つの習慣', '７つの習慣')).toBe('７つの習慣');
    expect(keepDbSpelling('7つの習慣 完訳', '７つの習慣')).toBe('7つの習慣 完訳');
    expect(keepDbSpelling('７つの習慣', '')).toBe('7つの習慣');
  });
});
