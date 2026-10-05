#!/usr/bin/env node
// 📸 写真で共有の撮影用の見本の写真（明るい写真・暗い写真）を作る（ロゴ・文字が明るい写真でも暗い写真でも読めるかを撮るため）。
//   node scripts/fixtures/gen-share-photos.mjs → scripts/fixtures/share-photo-bright.jpg / share-photo-dark.jpg
// 作った写真はリポジトリに入れてあるので、ふだんは流さなくてよい（作り直すときだけ）。

import { writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const exe = process.env.PW_EXE || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : { channel: 'chrome' });
const page = await browser.newPage();
const out = await page.evaluate(() => {
  const mk = (draw) => {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 1600;
    draw(c.getContext('2d'), c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  };
  const book = (x, cx, cy, w, h, paper, line, rot) => {
    x.save();
    x.translate(cx, cy);
    x.rotate(rot);
    x.fillStyle = paper;
    x.fillRect(-w / 2, -h / 2, w, h);
    x.strokeStyle = line;
    x.lineWidth = 6;
    for (let i = 0; i < 14; i += 1) {
      const y = -h / 2 + 50 + i * ((h - 100) / 13);
      x.beginPath();
      x.moveTo(-w / 2 + 40, y);
      x.lineTo(-20, y);
      x.moveTo(20, y);
      x.lineTo(w / 2 - 40, y);
      x.stroke();
    }
    x.fillStyle = line;
    x.fillRect(-2, -h / 2, 4, h);
    x.restore();
  };
  // 明るい写真: 白い机の上の本（下のほうがいちばん明るい＝白いロゴがいちばん読みにくい）。
  const bright = mk((x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#e9eef2');
    g.addColorStop(0.45, '#f6f6f3');
    g.addColorStop(1, '#ffffff');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(180,170,150,0.25)';
    x.beginPath();
    x.ellipse(W * 0.5, H * 0.56, 420, 60, 0, 0, Math.PI * 2);
    x.fill();
    book(x, W * 0.5, H * 0.42, 700, 440, '#fbfaf7', '#ddd6c8', -0.06);
    x.fillStyle = '#f2ece2';
    x.beginPath();
    x.arc(W * 0.82, H * 0.62, 70, 0, Math.PI * 2);
    x.fill();
  });
  // 暗い写真: 夜の部屋・小さなランプの明かり。
  const dark = mk((x, W, H) => {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1220');
    g.addColorStop(1, '#05060a');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const l = x.createRadialGradient(W * 0.3, H * 0.35, 10, W * 0.3, H * 0.35, 520);
    l.addColorStop(0, 'rgba(255,196,120,0.55)');
    l.addColorStop(1, 'rgba(255,196,120,0)');
    x.fillStyle = l;
    x.fillRect(0, 0, W, H);
    book(x, W * 0.52, H * 0.5, 640, 400, '#3a3226', '#594c3a', 0.05);
  });
  return { bright, dark };
});
for (const [k, v] of Object.entries(out)) {
  const file = `scripts/fixtures/share-photo-${k}.jpg`;
  writeFileSync(file, Buffer.from(v.split(',')[1], 'base64'));
  console.log(`✓ ${file}`);
}
await browser.close();
