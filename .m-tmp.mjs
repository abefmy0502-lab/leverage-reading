import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ja-JP' });
const p = await ctx.newPage();
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.locator('button:has-text("すべての本")').first().click(); await p.waitForTimeout(800);
await p.locator('.lvg-page button:has-text("1兆ドルコーチ")').first().click(); await p.waitForTimeout(800);
await p.locator('button:has-text("メモを書く")').first().click(); await p.waitForTimeout(900);
const r = await p.evaluate(() => {
  const ta = document.querySelector('textarea[aria-label="メモ本文"]');
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('ページ・写真'));
  const a = ta.getBoundingClientRect(), c = btn.getBoundingClientRect(), w = ta.parentElement.getBoundingClientRect();
  return { taBottom: a.bottom, wrapBottom: w.bottom, btnTop: c.top, btnH: c.height, mt: getComputedStyle(btn.parentElement).marginTop, pad: getComputedStyle(btn).padding };
});
console.log(r);
await b.close();
