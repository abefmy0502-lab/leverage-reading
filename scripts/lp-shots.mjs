#!/usr/bin/env node
// 📸 LP（src/pages/Landing.jsx）に載せるアプリ画面の写真を撮り直す。
//
// お試しモード（サンプルのメモ入り・Supabase/AI 不要）で実際のアプリを開き、
// iPhone 相当（390×844 @2x）で明暗の両方を撮って、public/lp/<名前>-<light|dark>-<390|780>.webp に書き出す。
// アプリの画面を変えたら、これを流して LP の写真を今の画面にそろえる。
//
// 使い方:
//   1. 別ターミナルで  npm run demo            （http://localhost:5173）
//   2. npm run lp:shots                       → LP に載せる全部（answer・flow-*・share）
//      npm run lp:shots -- answer recall      → 絞って撮る
// 撮る画面: answer（相談の答え・ヒーロー）/ sources（根拠の本）/ memo（メモを書くシート）/
//           action（行動）/ recall（思い出しカード）/ search（メモの言葉で本を探す）/
//           flow-worry・flow-memo・flow-ask・flow-action（LP の「悩みから、明日の一歩まで」の 4 コマ・2026-10-02）/
//           share（写真で共有の画像そのもの＝明暗なし・public/lp/share-card-<540|1080>.webp）

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.UI_SHOTS_URL || 'http://localhost:5173';
const OUT = 'public/lp';
const only = process.argv.slice(2);
const nav = (n) => `nav button[aria-label="${n}"]`;

// お試しモードの注記（「お試しモードの応答です」）は LP の写真に写さない。
const hideDemoNote = (p) => p.evaluate(() => {
  // 注記を含むいちばん内側の要素だけを隠す（中に改行や span があっても見つける）。
  document.querySelectorAll('p,div,span').forEach((el) => {
    if (!/お試しモード/.test(el.textContent)) return;
    if ([...el.children].some((c) => /お試しモード/.test(c.textContent))) return;
    el.style.display = 'none';
  });
});
// 画面ごとの開く URL（既定は /）。flow-worry は答えをゆっくり書く設定（?ai=slow）で、書きはじめを撮る。
const SHOT_URL = { 'flow-worry': '/?ai=slow' };
const ask = async (p) => {
  await p.locator(nav('相談')).click(); await p.waitForTimeout(800);
  await p.locator('textarea[aria-label="相談したいこと"]').fill('部下が報告をくれなくて困っています');
  await p.locator('button[aria-label="送信"]').click();
  await p.waitForTimeout(7000);
  await hideDemoNote(p);
};

// 相談の会話の場所を下端まで送る（答えの最後＝「あなたに聞きたいこと」と入力欄の上のチップを見せる）。
const chatToBottom = (p) => p.evaluate(() => {
  const el = document.querySelector('.chat-scroll');
  if (el) el.scrollTop = el.scrollHeight;
});

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
      // 「別のメモを見る」は思い出しカードの「…」の中（2026-09-27〜）。
      await p.locator('button[aria-haspopup="menu"]').first().click(); await p.waitForTimeout(400);
      await p.locator('[role="menuitem"]:has-text("別のメモを見る"), button:has-text("別のメモを見る")').first().click(); await p.waitForTimeout(900);
    }
  },
  // ── LP「悩みから、明日の一歩まで」の 4 コマ（2026-10-02）──
  // 1. 困っていることを書いて送る（答えを書きはじめたところ）
  'flow-worry': async (p) => {
    await p.locator(nav('相談')).click(); await p.waitForTimeout(800);
    await p.locator('textarea[aria-label="相談したいこと"]').fill('部下が報告をくれなくて困っています');
    await p.locator('button[aria-label="送信"]').click();
    await p.waitForTimeout(Number(process.env.FLOW_WORRY_MS || 2500));
  },
  // 2. あなたのメモの一節が返ってくる（根拠を開いたところ）
  'flow-memo': async (p) => {
    await ask(p);
    await p.locator('summary:has-text("根拠を見る")').first().click(); await p.waitForTimeout(600);
    await hideDemoNote(p);
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^参照したメモ/.test(e.textContent.trim()));
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      const sc = el.closest('.chat-scroll');
      if (sc) sc.scrollTop -= 64;
    });
  },
  // 3. 状況を 1 つ聞き返す（答えの最後の「あなたに聞きたいこと」と、答えの候補のチップ）
  'flow-ask': async (p) => {
    await ask(p);
    await chatToBottom(p);
    await p.waitForTimeout(400);
    await hideDemoNote(p);
  },
  // 4. やることを 1 つ決める（「会議の前」と答えて「行動を決める」）
  'flow-action': async (p) => {
    await ask(p);
    await p.locator('[aria-label="続けて聞く"] button >> nth=0').click();
    await p.locator('[aria-label="続けて聞く"] button:has-text("行動を決める")').waitFor({ timeout: 15000 });
    await p.locator('[aria-label="続けて聞く"] button:has-text("行動を決める")').click();
    await p.locator('[aria-label="相談への答え"]:not([aria-busy]) button:has-text("行動に追加")').waitFor({ timeout: 15000 });
    await p.waitForTimeout(800);
    await hideDemoNote(p);
  },
  // メモの言葉で本を探す（すべての本の検索・2026-09-30）
  search: async (p) => {
    await p.locator('button:has-text("すべての本")').first().click(); await p.waitForTimeout(800);
    await p.locator('button[aria-label="本を検索"]').click(); await p.waitForTimeout(300);
    await p.locator('input[aria-label^="本を検索（"]').fill('チーム'); await p.waitForTimeout(1200);
    await p.locator('input[aria-label^="本を検索（"]').blur();
  },
};
// メモのシートは下半分だけを切り出す（背後のぼかしたホームを見せない）。値は @2x の px。
const CROP_TOP = { memo: 846 };

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

// 📷 写真で共有の画像そのもの（シートが描いた canvas をそのまま書き出す・写真は scripts/fixtures の見本のイラスト）。
async function shootShareCard(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP', colorScheme: 'light',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.locator('h1').first().click().catch(() => {});
    await page.locator('input[data-share-camera]').setInputFiles('scripts/fixtures/share-photo.jpg');
    await page.waitForTimeout(2500);
    for (const w of [540, 1080]) {
      const data = await page.evaluate(async (w) => {
        const src = [...document.querySelectorAll('[role=dialog] canvas')].sort((a, b) => b.width - a.width)[0];
        if (!src) return null;
        const c = document.createElement('canvas');
        c.width = w; c.height = Math.round(src.height * w / src.width);
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, c.width, c.height);
        return c.toDataURL('image/webp', 0.82).split(',')[1];
      }, w);
      if (!data) throw new Error('共有の画像が見つかりません');
      writeFileSync(`${OUT}/share-card-${w}.webp`, Buffer.from(data, 'base64'));
    }
    console.log('✓ share');
    return 0;
  } catch (e) {
    console.error(`✗ share: ${e.message.split('\n')[0]}`);
    return 1;
  } finally {
    await ctx.close();
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(browserOptions());
const encoder = await browser.newPage();
let failed = 0;
if (!only.length || only.includes('share')) failed += await shootShareCard(browser);
// 2026-10-02 の作り直しで LP に載せなくなった画面（ストアの画像などで使うときは名前を指定して撮る）。
const EXTRA = new Set(['sources', 'memo', 'action', 'recall', 'search']);
for (const [name, steps] of Object.entries(SHOTS)) {
  if (only.length ? !only.includes(name) : EXTRA.has(name)) continue;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      locale: 'ja-JP', colorScheme: scheme,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${SHOT_URL[name] || '/'}`, { waitUntil: 'networkidle' });
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
