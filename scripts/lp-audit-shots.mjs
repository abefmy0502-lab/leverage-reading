// LP を区切って撮る（点検用・2026-11-23）。node scripts/lp-audit-shots.mjs <出力のフォルダ> [URL]
import { createRequire } from 'module';
import fs from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'ui-shots/lp0';
const url = process.argv[3] || 'http://localhost:5173/lp?hero=talk';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [w, h, scheme] of [[390, 844, 'light'], [390, 844, 'dark'], [1280, 860, 'light']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1 });
  await p.goto(url); await p.waitForTimeout(2500);
  // 動きの演出は止めて全部見せる（.lp-reveal だけ・本文へスキップの隠しは触らない）
  await p.addStyleTag({ content: '*{transition:none!important;animation:none!important} .lp-motion .lp-reveal,.lp-motion .lp-hero-quote{opacity:1!important;transform:none!important}' });
  const total = await p.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  // 上の固定ヘッダー（52）と下の固定の帯（約 72）で隠れる分だけ重ねて進む（ui-critic: 区切りの間が写っていなかった）
  const step = w < 768 ? h - 52 - 72 - 16 : h - 52 - 16;
  for (let y = 0; y < total; y += step) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(350);
    await p.screenshot({ path: `${out}/${w}-${scheme}-${String(i).padStart(2, '0')}.png` });
    i += 1;
    if (i > 30) break;
  }
  console.log(w, scheme, 'segments', i, 'height', total);
  await p.close();
}
await b.close();
