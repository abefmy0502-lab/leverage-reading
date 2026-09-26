#!/usr/bin/env node
// 📸 LP（src/pages/Landing.jsx）に載せるアプリ画面の写真を撮り直す。
//
// お試しモード（サンプルのメモ入り・Supabase/AI 不要）で実際のアプリを開き、
// iPhone 相当（390×844 @2x）で明暗の両方を撮って、public/lp/<名前>-<light|dark>-<390|780>.webp に書き出す。
// アプリの画面を変えたら、これを流して LP の写真を今の画面にそろえる。
//
// 使い方:
//   1. 別ターミナルで  npm run demo            （http://localhost:5173）
//   2. npm run lp:shots                       → 全部
//      npm run lp:shots -- answer recall      → 絞って撮る
// 撮る画面: answer（相談の答え・ヒーロー）/ sources（根拠の本）/ memo（メモを書くシート）/
//           action（行動）/ recall（思い出しカード）/ theme（テーマまとめ）

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.UI_SHOTS_URL || 'http://localhost:5173';
const OUT = 'public/lp';
const only = process.argv.slice(2);
const nav = (n) => `nav button[aria-label="${n}"]`;

// お試しモードの注記（「お試しモードの応答です」）は LP の写真に写さない。
const hideDemoNote = (p) => p.evaluate(() => {
  document.querySelectorAll('p,div,span').forEach((el) => {
    if (el.children.length === 0 && /お試しモード/.test(el.textContent)) el.style.display = 'none';
  });
});
const ask = async (p) => {
  await p.locator(nav('相談')).click(); await p.waitForTimeout(800);
  await p.locator('textarea[aria-label="相談したいこと"]').fill('部下が報告をくれなくて困っています');
  await p.locator('button[aria-label="送信"]').click();
  await p.waitForTimeout(7000);
  await hideDemoNote(p);
};

const SHOTS = {
  answer: async (p) => {
    await ask(p);
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === '部下が報告をくれなくて困っています');
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 10 && e.contains(el) && getComputedStyle(e).overflowY !== 'visible');
      if (sc) sc.scrollTop -= 12;
    });
  },
  sources: async (p) => {
    await ask(p);
    await p.locator('summary:has-text("根拠を見る")').first().click(); await p.waitForTimeout(600);
    await hideDemoNote(p);
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^もとになった本/.test(e.textContent.trim()));
      if (el) el.scrollIntoView({ block: 'center' });
    });
  },
  memo: async (p) => {
    await p.locator('button[aria-label$="にメモを書く"]').first().click(); await p.waitForTimeout(800);
    await p.keyboard.type('部下の話は、結論を急がずに最後まで聞く。', { delay: 5 });
  },
  action: async (p) => {
    await p.locator(nav('振り返り')).click(); await p.waitForTimeout(800);
    await p.locator('button[role=tab]:has-text("行動")').click();
  },
  recall: async (p) => {
    await p.locator(nav('振り返り')).click(); await p.waitForTimeout(800);
    await p.locator('button[role=tab]:has-text("メモ")').click(); await p.waitForTimeout(800);
    // 特定の読書術の本（書名）は LP の写真に出さない（2026-09 オーナー方針）。
    for (let i = 0; i < 8; i++) {
      const card = await p.evaluate(() => (document.body.innerText || '').split('月ごとのメモ')[0]);
      if (!/レバレッジ/.test(card)) break;
      await p.locator('button:has-text("別のメモを見る")').first().click(); await p.waitForTimeout(900);
    }
  },
  theme: async (p) => {
    await p.locator(nav('相談')).click(); await p.waitForTimeout(800);
    await p.locator('button[role=tab]:has-text("テーマまとめ")').click(); await p.waitForTimeout(800);
    await p.locator('button[aria-label^="テーマ「マネジメント」"]').first().click();
    await p.waitForTimeout(8000); await hideDemoNote(p);
  },
};
// メモのシートは下半分だけを切り出す（背後のぼかしたホームを見せない）。値は @2x の px。
const CROP_TOP = { memo: 846 };

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(browserOptions());
const encoder = await browser.newPage();
let failed = 0;
for (const [name, steps] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      locale: 'ja-JP', colorScheme: scheme,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await steps(page);
      await page.waitForTimeout(700);
      const b64 = (await page.screenshot()).toString('base64');
      for (const w of [390, 780]) {
        const data = await encoder.evaluate(async ({ b64, w, crop }) => {
          const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
          const sh = img.height - crop;
          const c = document.createElement('canvas');
          c.width = w; c.height = Math.round(sh * w / img.width);
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, crop, img.width, sh, 0, 0, c.width, c.height);
          return c.toDataURL('image/webp', 0.8).split(',')[1];
        }, { b64, w, crop: CROP_TOP[name] || 0 });
        writeFileSync(`${OUT}/${name}-${scheme}-${w}.webp`, Buffer.from(data, 'base64'));
      }
      console.log(`✓ ${name} (${scheme})`);
    } catch (e) {
      failed += 1;
      console.error(`✗ ${name} (${scheme}): ${e.message.split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();
if (failed) process.exit(1);
