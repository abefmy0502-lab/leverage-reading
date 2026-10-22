#!/usr/bin/env node
// 🪝 Claude Code の PostToolUse（Edit / Write）の後に、触ったファイルに応じて「忘れやすい次の一手」を 1 行返す（2026-10-22）。
// 何も止めない・何も書き換えない。標準入力の JSON（tool_input.file_path）を読み、該当があれば stdout に出すだけ。
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let p = '';
  try { p = String(JSON.parse(raw || '{}')?.tool_input?.file_path || ''); } catch { /* 読めなければ黙る */ }
  const rel = p.replace(/^.*?leverage-reading\//, '');
  const notes = [];
  if (/^supabase_.*\.sql$/.test(rel)) notes.push('SQL を触った → `node scripts/sql-bundle.mjs` でまとめを作り直し、CLAUDE.md の表に 1 行（scripts/sqlBundle.test.js・docsSync.test.js が確かめる）。');
  if (/^src\/components\/.*\.jsx$/.test(rel)) notes.push('画面を触った → `npm run ui:shots -- after <画面名>` で明暗を撮り、ui-critic で 16/20 以上。構成を変えたら SPEC.md、部品を変えたら DESIGN.md。');
  if (/^src\/lib\/(prompts|brainSystem|ai)\.js$/.test(rel) || /^api\/_aiRouting\.js$/.test(rel)) notes.push('AI の指示文・行き先を触った → docs/ai-routing.md と aiProcessors.js（同意の送り先）がずれていないか。`npx vitest run src/lib/aiConsentGate.test.js src/lib/aiProcessors.test.js`。');
  if (/^src\/(components|App\.jsx|hooks)/.test(rel) && !/\.test\./.test(rel)) notes.push('利用者に見える変更なら helpContent.js（ルール 1）と releaseNotes.js（ルール 5・ワクワクしない項目は quiet: true）。');
  if (/^src\/lib\/releaseNotes\.js$/.test(rel)) notes.push('`npx vitest run src/lib/releaseNotes.test.js`（GLOSSARY の言葉・60 字・技術用語なし）。');
  if (/^src\/pages\/(Landing|lpCopy)/.test(rel)) notes.push('LP を触った → `npm run ui:shots -- after lp`・言葉は `npm run mkt:drafts -- --check src/pages/lpCopy.js`・FAQ は 7 問まで。');
  if (notes.length) process.stdout.write(`[次の一手] ${notes.join(' / ')}\n`);
});
