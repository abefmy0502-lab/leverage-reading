#!/usr/bin/env node
// 🖼 写真で共有の「共有される画像そのもの」（canvas の出力）を、重ね方 × 形 × 地 で書き出す（2026-10-05）。
//
// 画面のスクショ（ui-shots.mjs）では小さくて見えない、画像の中のロゴ・文字・幕を 1080 幅で確かめるため。
// お試しモードのアプリを開き、その中で src/lib/shareCard.js の drawShareCard をそのまま呼ぶ（書体・色のトークンも本物）。
//
// 使い方:
//   1. 別ターミナルで  npm run demo
//   2. node scripts/share-images.mjs [出力先]   （既定 ui-shots/share-after/images）
//   UI_SHOTS_URL（既定 http://localhost:5173）・PW_EXE はui-shots.mjs と同じ。
//
// 書き出すもの: <重ね方>-<形>-<地>.<jpg|png>（写真は JPEG・ほかは PNG＝実際に共有する種類）と、
//   ロゴの確かめ用（logo-*: 記録の項目を全部隠した明るい写真・言葉をいちばん下へ置いた 1 枚 など）。

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.env.UI_SHOTS_URL || 'http://localhost:5173';
const outDir = process.argv[2] || join('ui-shots', 'share-after', 'images');
mkdirSync(outDir, { recursive: true });

const photos = Object.fromEntries(['', '-bright', '-dark'].map((s) => [
  s.replace('-', '') || 'normal',
  `data:image/jpeg;base64,${readFileSync(`scripts/fixtures/share-photo${s}.jpg`).toString('base64')}`,
]));

const exe = process.env.PW_EXE || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const results = await page.evaluate(async ({ photos }) => {
  const card = await import('/src/lib/shareCard.js');
  const ov = await import('/src/lib/shareOverlay.js');
  const toFile = async (url, name) => new File([await (await fetch(url)).blob()], name, { type: 'image/jpeg' });
  const photo = {};
  for (const [k, url] of Object.entries(photos)) photo[k] = await card.loadPhotoFile(await toFile(url, `${k}.jpg`));
  // 見本の表紙（緑の装丁・書名入り）。data: の画像なので canvas は汚れない。
  const c = document.createElement('canvas');
  c.width = 300; c.height = 440;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 300, 440);
  g.addColorStop(0, '#2f6b4f'); g.addColorStop(1, '#173d2c');
  x.fillStyle = g; x.fillRect(0, 0, 300, 440);
  x.fillStyle = '#f4efe6'; x.font = '600 30px serif'; x.fillText('1兆ドル', 28, 80); x.fillText('コーチ', 28, 120);
  x.fillStyle = '#df8e17'; x.fillRect(28, 380, 120, 6);
  const cover = await card.prepareCover({ cover: c.toDataURL('image/png') });
  const book = { id: 'b1', title: '1兆ドルコーチ', author: 'エリック・シュミット', status: 'done', doneDate: '2026-09-28', startDate: '2026-09-02', actions: [{ done: true }, { done: true }, { done: false }] };
  const memos = Array.from({ length: 24 }, (_, i) => ({ id: `m${i}`, text: i === 0 ? 'チームの勝利が最優先。個人の手柄より、チームが勝つための判断をする。' : `メモ ${i}`, pageNumber: 64 }));
  const record = ov.bookRecord(book, memos, new Date(2026, 9, 5));
  const fonts = await card.prepareFonts(`${record.title}${record.sub}${memos[0].text}読み終えた日メモ実行した行動`);
  const logo = await card.prepareLogo();
  const base = {
    record, stamp: '2026.10.5', line: memos[0].text, page: 64, title: book.title, author: book.author, totalPages: 280, seedKey: 'm0',
    cover, covers: [], fonts, logo, view: { panX: 0, panY: 0, zoom: 1 }, textPos: 'bottom', hidden: [], phrase: null,
  };
  const grounds = [
    ['photo', { style: 'photo', photo: photo.normal }],
    ['photo-bright', { style: 'photo', photo: photo.bright }],
    ['photo-dark', { style: 'photo', photo: photo.dark }],
    ['paper', { style: 'paper' }],
    ['night', { style: 'night' }],
    ['cover', { style: 'cover' }],
    ['sticker', { style: 'sticker' }],
  ];
  const jobs = [];
  for (const layout of ['record', 'stats', 'quote']) {
    for (const format of ['post', 'story']) {
      for (const [gName, g] of grounds) jobs.push({ name: `${layout}-${format}-${gName}`, opts: { ...base, layout, format, ...g, line: layout === 'record' ? ov.quoteText(base.line, 'record') : base.line } });
    }
  }
  // ロゴの確かめ用: 記録の項目を全部隠した明るい写真（ロゴだけ）・以前に「ロゴを隠す」を選んだ人・言葉をいちばん下へ動かした 1 枚。
  const allHidden = [...ov.SHARE_ITEM_KEYS];
  jobs.push({ name: 'logo-bright-all-hidden-post', opts: { ...base, layout: 'record', format: 'post', style: 'photo', photo: photo.bright, hidden: allHidden } });
  jobs.push({ name: 'logo-bright-all-hidden-story', opts: { ...base, layout: 'stats', format: 'story', style: 'photo', photo: photo.bright, hidden: allHidden } });
  jobs.push({ name: 'logo-old-hidden-setting', opts: { ...base, layout: 'record', format: 'post', style: 'photo', photo: photo.normal, hidden: ['logo', 'stamp'] } });
  jobs.push({ name: 'logo-phrase-at-bottom', opts: { ...base, layout: 'quote', format: 'post', style: 'photo', photo: photo.bright, phrase: { text: '問いの質が、答えの質を決める。', style: 'band', x: 0.3, y: 1, scale: 1.8 } } });
  jobs.push({ name: 'logo-no-stamp-paper', opts: { ...base, layout: 'stats', format: 'post', style: 'paper', hidden: ['stamp'] } });
  const out = [];
  for (const j of jobs) {
    const cv = document.createElement('canvas');
    const t0 = performance.now();
    card.drawShareCard(cv, j.opts);
    const drawMs = performance.now() - t0;
    const t1 = performance.now();
    const blob = await card.canvasToBlob(cv, { style: j.opts.style });
    const encodeMs = performance.now() - t1;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    out.push({ name: j.name, type: blob.type, w: cv.width, h: cv.height, b64: btoa(bin), drawMs: Math.round(drawMs), encodeMs: Math.round(encodeMs) });
  }
  return out;
}, { photos });

for (const r of results) {
  const ext = r.type === 'image/jpeg' ? 'jpg' : 'png';
  const file = join(outDir, `${r.name}.${ext}`);
  const bytes = Buffer.from(r.b64, 'base64');
  writeFileSync(file, bytes);
  console.log(`✓ ${file}  ${r.w}×${r.h}  ${(bytes.length / 1024).toFixed(0)}KB  描く ${r.drawMs}ms・画像にする ${r.encodeMs}ms`);
}
await browser.close();
