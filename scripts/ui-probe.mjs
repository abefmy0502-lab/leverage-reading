#!/usr/bin/env node
// 🔍 画面の偵察（2026-10-31・.claude/skills/webapp-testing）: URL を開き、必要なら押してから、
//   いま見えている 押せるもの（button・a・summary）・入力欄・ダイアログの文言を並べる。撮ることもできる。
//
//   node scripts/ui-probe.mjs 'http://localhost:5173/?demo=fewmemos'
//   node scripts/ui-probe.mjs 'http://localhost:5173/' --click 'button:has-text("すべての本")' --click '.lvg-page button:has-text("LIFE SHIFT")' --shot ui-shots/_probe/x.png
//   オプション: --dark（暗い画面）・--wait <ms>（押したあとの待ち・既定 700）・--clear（localStorage を消して読み直す）
//
// 記憶のセレクタで押す前に、ここで今の文言を確かめる（文言は変わる）。
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--') && /^https?:/.test(a));
if (!url) { console.error('使い方: node scripts/ui-probe.mjs <URL> [--click <セレクタ>]... [--shot <パス>] [--dark] [--wait <ms>] [--clear]'); process.exit(2); }
const clicks = [];
let shot = null;
let wait = 700;
let dark = false;
let clear = false;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--click') clicks.push(args[++i]);
  else if (args[i] === '--shot') shot = args[++i];
  else if (args[i] === '--wait') wait = Number(args[++i]) || wait;
  else if (args[i] === '--dark') dark = true;
  else if (args[i] === '--clear') clear = true;
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2 });
const p = await ctx.newPage();
try {
  await p.goto(url, { waitUntil: 'networkidle' });
  if (clear) {
    await p.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ } });
    await p.goto(url, { waitUntil: 'networkidle' });
  }
  await p.waitForTimeout(wait);
  for (const sel of clicks) {
    try { await p.click(sel, { timeout: 8000 }); console.log(`✓ 押した: ${sel}`); }
    catch (e) { console.log(`✗ 押せない: ${sel}（${String(e).split('\n')[0]}）`); }
    await p.waitForTimeout(wait);
  }
  const texts = async (sel) => (await p.locator(sel).allInnerTexts()).map((t) => t.trim().replace(/\s*\n\s*/g, '｜')).filter(Boolean);
  const dialog = await texts('[role=dialog] h2, [role=dialog] h3');
  console.log('\n■ 見出し:', (await texts('h1:visible, h2:visible, h3:visible')).slice(0, 20).join(' / '));
  if (dialog.length) console.log('■ ダイアログ:', dialog.join(' / '));
  console.log('■ 押せるもの (button):', (await texts('button:visible')).slice(0, 60).join(' / '));
  const links = await texts('a:visible');
  if (links.length) console.log('■ リンク:', links.slice(0, 30).join(' / '));
  const sums = await texts('summary:visible');
  if (sums.length) console.log('■ 畳む見出し:', sums.join(' / '));
  const inputs = await p.locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => `${e.tagName.toLowerCase()}#${e.id || ''}[${e.placeholder || e.getAttribute('aria-label') || ''}]`));
  if (inputs.length) console.log('■ 入力欄:', inputs.join(' / '));
  if (shot) { await p.screenshot({ path: shot }); console.log(`📸 ${shot}`); }
} finally {
  await b.close();
}
