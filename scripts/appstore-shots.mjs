#!/usr/bin/env node
// 🏪 App Store のスクリーンショット（基本の 6 枚＋カスタムプロダクトページ 3 種×3 枚）を作る（2026-10-08）。
//
// 1. 撮る: お試しモード（サンプルのメモ入り・Supabase/AI 不要）でいまの画面を iPhone 6.9 インチ相当（440×902pt @3x・
//    上の 54pt は生成器が時計の行を描く）で撮り、ui-shots/appstore-raw/<名前>.png に置く（git 管理外）。
// 2. 重ねる: company/appstore-screenshots/index.html（背景・見出し・端末の枠）に流し込み、
//    6.9 インチ（1320×2868）と 6.5 インチ（1284×2778）の PNG を company/launch-2026-11/screenshots/ に書き出す。
//
// 使い方:
//   1. 別ターミナルで  npm run demo                        （http://localhost:5173）
//   2. node scripts/appstore-shots.mjs                      → 撮る＋重ねる（全部）
//      node scripts/appstore-shots.mjs raw answer sources   → 撮るだけ（名前で絞る）
//      node scripts/appstore-shots.mjs compose              → 重ねるだけ（撮った画面を使い回す）
//   URL を変えるときは UI_SHOTS_URL=http://localhost:5198
//
// 撮り方の決まり: どの URL にも &lpshot=1 を付ける（「部下が報告をくれない」の相談に、根拠が自分の学び＋2 冊の本の
//   答えを返す＝相手の名前が「2 冊の本と自分の学び」になり、実在の著者が話し手に見えない）。
//   お試しモードの注記（「お試しモードの応答です」）は写さない。価格はどの画像にも入れない。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.UI_SHOTS_URL || 'http://localhost:5173';
const RAW = 'ui-shots/appstore-raw';
const OUT = 'company/launch-2026-11/screenshots';
const GEN = 'company/appstore-screenshots/index.html';
const [mode = 'all', ...only] = process.argv.slice(2);
const nav = (n) => `nav button[aria-label="${n}"]`;
const Q = '部下が報告をくれなくて困っています';

const hideDemoNote = (p) => p.evaluate(() => {
  document.querySelectorAll('p,div,span').forEach((el) => {
    if (!/お試しモード/.test(el.textContent)) return;
    if ([...el.children].some((c) => /お試しモード/.test(c.textContent))) return;
    el.style.display = 'none';
  });
});
const ask = async (p) => {
  await p.locator(nav('相談')).click(); await p.waitForTimeout(800);
  await p.locator('textarea[aria-label="相談したいこと"]').fill(Q);
  await p.locator('button[aria-label="送信"]').click();
  await p.waitForTimeout(7000);
  await hideDemoNote(p);
};
const scrollToText = (p, re, offset = 0) => p.evaluate(({ src, offset }) => {
  const rx = new RegExp(src);
  const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && rx.test(e.textContent.trim()));
  if (!el) return;
  el.scrollIntoView({ block: 'start' });
  const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 10 && e.contains(el) && getComputedStyle(e).overflowY !== 'visible');
  if (sc) sc.scrollTop -= offset;
}, { src: re.source, offset });
const openBook = async (p, title) => {
  await p.locator('button:has-text("すべての本")').first().click(); await p.waitForTimeout(800);
  await p.locator(`.lvg-page button:has-text("${title}")`).first().click(); await p.waitForTimeout(1000);
};
const openImport = async (p) => {
  await p.locator('button[aria-label="アカウント設定を開く"]').click(); await p.waitForTimeout(600);
  await p.locator('button:has-text("ほかのアプリから取り込む")').click(); await p.waitForTimeout(600);
  await p.locator('[role=dialog] input[type=file]').first().setInputFiles('scripts/fixtures/booklog-store.csv'); await p.waitForTimeout(1500);
};
const openOcr = async (p) => {
  await openBook(p, '1兆ドルコーチ');
  await p.locator('button:has-text("メモを書く")').first().click(); await p.waitForTimeout(800);
  await p.locator('button:has-text("ページ・写真")').click(); await p.waitForTimeout(700);
};

// 撮る画面（名前 → 手順）。基本の 6 枚とカスタムプロダクトページで使う。
const SHOTS = {
  // 相談の答え（悩み → 結論。上に自分の相談）
  answer: async (p) => { await ask(p); await scrollToText(p, new RegExp(`^${Q}$`), 12); },
  // 根拠を見る（本とページ・参照したメモ）
  sources: async (p) => {
    await ask(p);
    await p.locator('summary:has-text("根拠を見る")').first().click(); await p.waitForTimeout(600);
    await hideDemoNote(p);
    await scrollToText(p, /^根拠を見る$/, 16);
  },
  // 話しながら行動を 1 つ決める（「行動に追加」まで）
  action: async (p) => {
    await ask(p);
    await p.locator('[aria-label="続けて聞く"] button >> nth=0').click();
    await p.locator('[aria-label="続けて聞く"] button:has-text("行動を決める")').waitFor({ timeout: 15000 });
    await p.locator('[aria-label="続けて聞く"] button:has-text("行動を決める")').click();
    await p.locator('[aria-label="相談への答え"]:not([aria-busy]) button:has-text("行動に追加")').waitFor({ timeout: 15000 });
    await p.waitForTimeout(800);
    await hideDemoNote(p);
  },
  // 振り返り › 行動（今日・今週の期限）
  'action-list': async (p) => {
    await p.locator(nav('振り返り')).click(); await p.waitForTimeout(800);
    await p.locator('button[role=tab]:has-text("行動")').click(); await p.waitForTimeout(600);
  },
  // ほかのアプリから取り込む（はじめの画面＝どのアプリから選べるか）
  'import-pick': async (p) => {
    await p.locator('button[aria-label="アカウント設定を開く"]').click(); await p.waitForTimeout(600);
    await p.locator('button:has-text("ほかのアプリから取り込む")').click(); await p.waitForTimeout(900);
  },
  // ほかのアプリから取り込む（確かめる画面・見本のブクログの書き出し＝scripts/fixtures/booklog-store.csv）
  import: async (p) => { await openImport(p); },
  // 取り込みが終わったところ
  'import-done': async (p) => {
    await openImport(p);
    await p.locator('[role=dialog] button:has-text("取り込む")').last().click(); await p.waitForTimeout(3500);
  },
  // メモを書くシート（「写真から書き起こす」のボタン）
  ocr: async (p) => { await openOcr(p); },
  // ページを撮って書き起こしたところ（本文に文字が入る）
  'ocr-done': async (p) => {
    await openOcr(p);
    await p.locator('input[data-ocr-input]').setInputFiles('scripts/fixtures/share-photo.jpg'); await p.waitForTimeout(3500);
  },
  // 写真で共有（撮った写真に書名・日付・メモの数・一文）
  share: async (p) => {
    await p.locator('h1').first().click().catch(() => {});
    await p.locator('input[data-share-camera]').setInputFiles('scripts/fixtures/share-photo.jpg'); await p.waitForTimeout(2800);
  },
  // 相談のはじめ（「あなたのメモ N 件から答えます」と相談の例）
  'consult-start': async (p) => { await p.locator(nav('相談')).click(); await p.waitForTimeout(1200); },
};

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

// 画面のいちばん上の色（生成器が時計の行をこの色で描く）。
const topColor = (p) => p.evaluate(() => {
  let el = document.elementFromPoint(220, 2);
  while (el) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
    el = el.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor || '#faf7f2';
});

async function shoot(browser) {
  mkdirSync(RAW, { recursive: true });
  const barsFile = `${RAW}/bars.json`;
  const bars = existsSync(barsFile) ? JSON.parse(readFileSync(barsFile, 'utf8')) : {};
  let failed = 0;
  for (const [name, steps] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(name)) continue;
    const ctx = await browser.newContext({
      viewport: { width: 440, height: 902 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      locale: 'ja-JP', colorScheme: 'light',
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/?lpshot=1`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await steps(page);
      await page.waitForTimeout(700);
      await hideDemoNote(page);
      await page.screenshot({ path: `${RAW}/${name}.png` });
      bars[name] = await topColor(page);
      console.log(`✓ raw ${name}`);
    } catch (e) {
      failed += 1;
      console.error(`✗ raw ${name}: ${e.message.split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
  writeFileSync(barsFile, JSON.stringify(bars, null, 2));
  return failed;
}

// 生成器の SETS（index.html）を、2 つの大きさで書き出す。
const SIZES = [{ key: '69', w: 1320, h: 2868 }, { key: '65', w: 1284, h: 2778 }];
async function compose(browser) {
  mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 3000 }, deviceScaleFactor: 1, locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.route(/cdnjs\.cloudflare\.com/, (r) => r.abort());
  // 時計の行の色（撮った画面のいちばん上の色）を生成器に渡す。
  const barsFile = `${RAW}/bars.json`;
  const bars = existsSync(barsFile) ? JSON.parse(readFileSync(barsFile, 'utf8')) : {};
  await page.addInitScript((b) => { window.__BARS = b; }, bars);
  const shotsDir = pathToFileURL(resolve(RAW)).href + '/';
  let failed = 0;
  for (const size of SIZES) {
    const url = `${pathToFileURL(resolve(GEN)).href}?render=1&set=all&size=${size.key}&shots=${encodeURIComponent(shotsDir)}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const frames = await page.locator('.frame').evaluateAll((els) => els.map((e) => e.dataset.out));
    for (let i = 0; i < frames.length; i++) {
      const name = frames[i];
      if (only.length && !only.some((o) => name.includes(o))) continue;
      const missing = await page.locator('.frame').nth(i).locator('.shot-empty').count();
      if (missing) { failed += 1; console.error(`✗ ${name}: 撮った画面がありません`); continue; }
      const file = `${OUT}/${name}-${size.key === '69' ? '6.9in-1320x2868' : '6.5in-1284x2778'}.png`;
      await page.locator('.frame').nth(i).screenshot({ path: file });
      console.log(`✓ ${file}`);
    }
  }
  await ctx.close();
  return failed;
}

const browser = await chromium.launch(browserOptions());
let failed = 0;
if (mode === 'all' || mode === 'raw') failed += await shoot(browser);
if (mode === 'all' || mode === 'compose') failed += await compose(browser);
await browser.close();
if (failed) process.exit(1);
