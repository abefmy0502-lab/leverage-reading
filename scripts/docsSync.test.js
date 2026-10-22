// 📚 文書の同期を機械で確かめる（2026-10-22・開発のレバレッジ）。
// 人が忘れやすい「足したのに書いていない」を CI で止める。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');

describe('文書の同期', () => {
  it('ルートの supabase_*.sql は全部 CLAUDE.md の表にある', () => {
    const files = readdirSync(ROOT).filter((f) => /^supabase_.*\.sql$/.test(f) && f !== 'supabase_all_in_order.sql');
    const missing = files.filter((f) => !claudeMd.includes(`\`${f}\``));
    expect(missing, 'CLAUDE.md の「SQL マイグレーション」の表に 1 行足す').toEqual([]);
  });
  it('.claude/skills の SKILL.md は name と description を持つ', () => {
    const dir = join(ROOT, '.claude', 'skills');
    if (!existsSync(dir)) return;
    for (const d of readdirSync(dir)) {
      const f = join(dir, d, 'SKILL.md');
      expect(existsSync(f), `${d}/SKILL.md が無い`).toBe(true);
      const head = readFileSync(f, 'utf8').slice(0, 600);
      expect(head, `${d}: frontmatter の name`).toMatch(/^---\n[\s\S]*?name:\s*\S+/);
      expect(head, `${d}: frontmatter の description`).toMatch(/description:\s*\S+/);
    }
  });
  it('npm の scripts に書いた mkt:* は docs/ai-marketing-automation.md に出てくる', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const doc = readFileSync(join(ROOT, 'docs', 'ai-marketing-automation.md'), 'utf8');
    const missing = Object.keys(pkg.scripts).filter((k) => k.startsWith('mkt:') && !doc.includes(`npm run ${k}`));
    expect(missing, '手順書に使い方を 1 行足す').toEqual([]);
  });
});
