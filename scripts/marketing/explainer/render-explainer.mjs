#!/usr/bin/env node
// 🎬 動くイラストの縦の動画（explainer）を書き出す。アプリの画面は映さない回（新しい読書のあり方を伝える）。
//
// 使い方（お試しモードのサーバーは要らない）:
//   npm run mkt:explainer                       → 台本（reels.mjs）を全部
//   npm run mkt:explainer -- read-change-3      → 名前で絞る
//   npm run mkt:explainer -- --check            → 文だけ確かめる（使わない言い方）
//   npm run mkt:explainer -- --still 2.5        → その秒の 1 枚だけ（still-2.5.png・見た目の確認用）
//   npm run mkt:explainer -- --dark             → 暗い地で
//   環境変数: PW_EXE（ui-shots.mjs と同じ）・MKT_OUT（出力先）・UI_SHOTS_PROXY=1（書体を中継経由で読む・クラウドの作業環境用）
//
// 仕組み: 1080×1920 の舞台のページを作り、1/30 秒ずつ時刻を進めて撮った絵を ffmpeg に流す（録画ではないので、
//   どの端末で書き出しても同じ動き・途中で詰まらない）。色は src/styles/tokens.css のトークン、書体は Noto Sans JP の 900
//   （読めなければ端末の書体）。線の絵は art.mjs、動きは下の STAGE_JS。
// 出力: marketing-out/videos/<日付>/<名前>/ に final.mp4（H.264・30fps・無音の音声つき）・cover.jpg・post.txt（説明欄の下書き）。

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { REELS, END_LINE, END_STORE, reelTexts, reelDuration } from './reels.mjs';
import { ART } from './art.mjs';
import { checkCopy } from '../weekly-drafts.mjs';
import { findFfmpeg } from '../finish-video.mjs';

const W = 1080;
const H = 1920;
const FPS = 30;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const optValues = new Set(['--still', '--out'].map((n) => opt(n)).filter(Boolean));
const names = args.filter((a) => !a.startsWith('--') && !optValues.has(a));
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const outRoot = opt('--out') || process.env.MKT_OUT || join('marketing-out', 'videos', today);
const targets = names.length ? REELS.filter((r) => names.includes(r.name)) : REELS;
if (!targets.length) {
  console.error(`台本が見つかりません。使える名前: ${REELS.map((r) => r.name).join(', ')}`);
  process.exit(1);
}

// 文を確かめる（書き出しの前にも必ず）
let bad = 0;
for (const r of targets) {
  for (const hit of checkCopy(reelTexts(r).join('\n'))) {
    bad += 1;
    console.error(`  ✗ ${r.name}: 「${hit.word}」— ${hit.why}`);
  }
}
if (bad) process.exit(1);
if (args.includes('--check')) { console.log(`  ✓ ${targets.length} 本の文に、使わない言い方はありませんでした`); process.exit(0); }

// 画面に出る字（書体を先に読み込む用）
const document_text = (reel) => [...reelTexts(reel), END_LINE, END_STORE, ...Object.values(ART).map((a) => a.svg.replace(/<[^>]+>/g, ''))].join('') + '0123456789';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function itemHtml(it, i) {
  const at = it.at ?? 0;
  const pos = (x, y) => `left:${x ?? 64}px;top:${y}px;`;
  switch (it.type) {
    case 'tabs':
      return `<div class="tabs" data-at="0" data-anim="none">
        <span class="tabs-label">${esc(it.label)}</span>
        ${[1, 2, 3].map((n) => `<span class="tab${n === it.active ? ' on' : n < it.active ? ' done' : ''}">${n}</span>`).join('')}
      </div>`;
    case 'box':
      return `<div class="box" data-at="${at}" data-anim="wipe" style="${pos(it.x, it.y)}font-size:${it.size || 104}px">${esc(it.text)}</div>`;
    case 'text':
      return `<div class="line" data-at="${at}" data-anim="rise" style="${pos(it.x, it.y)}font-size:${it.size || 84}px">${esc(it.text)}</div>`;
    case 'sub':
      return `<div class="sub" data-at="${at}" data-anim="rise" style="top:${it.y}px">${esc(it.text)}</div>`;
    case 'art': {
      const a = ART[it.name];
      if (!a) throw new Error(`絵が見つかりません: ${it.name}`);
      // 線の太さは、どの大きさの絵でも画面で 7px（viewBox の単位に直す）
      const sw = (7 * Number(a.viewBox.split(' ')[2]) / it.w).toFixed(2);
      return `<svg class="art" data-at="${at}" data-dur="${it.dur || 1}" data-anim="draw" data-bob="${i % 2}" viewBox="${a.viewBox}"
        style="left:${it.x}px;top:${it.y}px;width:${it.w}px;--sw:${sw}">${a.svg}</svg>`;
    }
    case 'end':
      return `<div class="end" data-at="0" data-anim="fade">
        <img class="end-logo" src="${pathToFileURL(resolve('public/logo-lockup.png')).href}" alt="">
        <div class="end-line">${esc(END_LINE)}</div>
        <div class="end-store">${esc(END_STORE)}</div>
      </div>`;
    default:
      throw new Error(`知らない種類: ${it.type}`);
  }
}

// 時刻 t（秒）の絵にする。場面は切り替えの 0.18 秒で重ねる。
const STAGE_JS = `
const clamp = (v) => Math.max(0, Math.min(1, v));
const out3 = (p) => 1 - Math.pow(1 - p, 3);
const back = (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
window.seek = (t) => {
  for (const sc of document.querySelectorAll('.scene')) {
    const s = +sc.dataset.start, e = +sc.dataset.end, last = sc.dataset.last === '1';
    const lt = t - s;
    const vis = t >= s - 0.001 && (t < e || last);
    sc.style.display = vis ? 'block' : 'none';
    if (!vis) continue;
    sc.style.opacity = last ? 1 : clamp((e - t) / 0.18);
    for (const el of sc.querySelectorAll('[data-anim]')) {
      const at = +el.dataset.at, anim = el.dataset.anim;
      if (anim === 'none') continue;
      if (anim === 'wipe') {
        const p = out3(clamp((lt - at) / 0.4));
        el.style.clipPath = 'inset(0 ' + (100 - p * 100) + '% 0 0)';
        el.style.opacity = p > 0 ? 1 : 0;
      } else if (anim === 'rise') {
        const p = out3(clamp((lt - at) / 0.45));
        el.style.opacity = p;
        el.style.transform = 'translateY(' + (1 - p) * 36 + 'px)';
      } else if (anim === 'fade') {
        const p = out3(clamp((lt - at) / 0.6));
        el.style.opacity = p;
        el.style.transform = 'scale(' + (0.96 + 0.04 * p) + ')';
      } else if (anim === 'draw') {
        const dur = +el.dataset.dur;
        const lines = [...el.querySelectorAll('.d')];
        const each = dur / Math.max(1, lines.length) * 1.6;
        lines.forEach((ln, i) => {
          const st = at + (dur - each) * (lines.length > 1 ? i / (lines.length - 1) : 0);
          ln.style.strokeDashoffset = 1 - out3(clamp((lt - st) / each));
        });
        const after = clamp((lt - at - dur * 0.8) / 0.4);
        for (const f of el.querySelectorAll('.f, .t')) f.style.opacity = out3(after);
        // 描き終えたら、ゆっくり上下に揺れる（止まった絵にしない）
        const bob = lt > at + dur ? Math.sin((lt - at - dur) * 2.4 + (+el.dataset.bob) * 1.7) * 6 * clamp((lt - at - dur) / 0.5) : 0;
        el.style.transform = 'translateY(' + bob + 'px)';
        el.style.opacity = lt >= at ? 1 : 0;
      }
    }
  }
};
`;

function stageHtml(reel, dark) {
  let start = 0;
  const scenes = reel.scenes.map((s, i) => {
    const html = `<section class="scene" data-start="${start}" data-end="${start + s.sec}" data-last="${i === reel.scenes.length - 1 ? 1 : 0}">
      ${s.items.map(itemHtml).join('\n')}</section>`;
    start += s.sec;
    return html;
  });
  return `<!doctype html><html lang="ja"${dark ? ' data-theme="dark" data-dark-ready' : ''}><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(resolve('src/styles/tokens.css')).href}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=block">
<style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--surface); color: var(--text);
               font-family: "Noto Sans JP", var(--font-ui); font-weight: 900; }
  .scene { position: absolute; inset: 0; display: none; }
  .tabs { position: absolute; left: 40px; top: 250px; display: flex; gap: 10px; align-items: stretch; }
  .tabs-label { background: var(--text); color: var(--surface); font-size: 50px; line-height: 1; padding: 20px 24px; letter-spacing: 0.02em; }
  .tab { width: 84px; display: grid; place-items: center; font-size: 64px; line-height: 1; color: var(--text-3);
         background: var(--accent-soft); }
  .tab.on { background: var(--accent); color: var(--accent-ink); }
  .tab.done { opacity: 0.55; }
  .box { position: absolute; background: var(--text); color: var(--surface); line-height: 1.15; padding: 18px 32px 22px;
         letter-spacing: 0.02em; white-space: nowrap; transform: rotate(-0.6deg); }
  .line { position: absolute; line-height: 1.2; white-space: nowrap; letter-spacing: 0.01em; }
  .sub { position: absolute; left: 64px; right: 140px; font-size: 50px; line-height: 1.45; white-space: pre-line; color: var(--accent); font-weight: 700; }
  .art { position: absolute; overflow: visible; }
  .art .d { fill: none; stroke: var(--text); stroke-width: var(--sw); stroke-linecap: round; stroke-linejoin: round;
            stroke-dasharray: 1 1; stroke-dashoffset: 1; }
  .art .d.card { fill: var(--surface); }
  .art .d.dash { stroke: var(--text-3); }
  .art .d.faded { stroke: var(--text-3); }
  .art .f, .art .t { opacity: 0; }
  .art .t { fill: var(--text); font-family: "Noto Sans JP", var(--font-ui); font-weight: 900; }
  .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
         gap: 40px; padding-bottom: 320px; }
  .end-logo { width: 360px; }
  .end-line { font-size: 72px; color: var(--text); }
  .end-store { font-size: 44px; font-weight: 700; color: var(--text-2); }
</style></head><body>
${scenes.join('\n')}
<script>${STAGE_JS}</script>
</body></html>`;
}

function proxyOptions() {
  if (!process.env.UI_SHOTS_PROXY || !process.env.HTTPS_PROXY) return {};
  const u = new URL(process.env.HTTPS_PROXY);
  return { proxy: { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } };
}
function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE, ...proxyOptions() };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium', ...proxyOptions() };
  return { channel: 'chrome', ...proxyOptions() };
}

const ffmpeg = await findFfmpeg();
const still = opt('--still');
if (!ffmpeg && still == null) {
  console.error('ffmpeg が見つかりません（mac は brew install ffmpeg）。--still で 1 枚だけなら書き出せます。');
  process.exit(1);
}

const browser = await chromium.launch(browserOptions());
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ignoreHTTPSErrors: !!process.env.UI_SHOTS_PROXY });
try {
  for (const reel of targets) {
    const dir = join(outRoot, reel.name);
    mkdirSync(dir, { recursive: true });
    const htmlPath = resolve(dir, 'stage.html');
    writeFileSync(htmlPath, stageHtml(reel, args.includes('--dark')));
    const page = await context.newPage();
    await page.goto(pathToFileURL(htmlPath).href);
    // 場面は隠してあるので、書体は使う字を先に読み込んでおく（途中の場面から書体が変わらないように）
    const fontOk = await page.evaluate(async (text) => {
      try {
        const got = await Promise.all(['700', '900'].map((w) => document.fonts.load(`${w} 40px "Noto Sans JP"`, text)));
        return got.every((faces) => faces.length > 0);
      } catch { return false; }
    }, [...new Set(document_text(reel))].join(''));
    if (!fontOk) console.warn('  ⚠ Noto Sans JP を読めませんでした（端末の書体で書き出します）');

    if (still != null) {
      await page.evaluate((t) => window.seek(t), Number(still));
      await page.screenshot({ path: join(dir, `still-${still}.png`) });
      console.log(`  ✓ ${join(dir, `still-${still}.png`)}`);
      await page.close();
      continue;
    }

    const total = reelDuration(reel);
    const frames = Math.round(total * FPS);
    const out = join(dir, 'final.mp4');
    const ff = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
      '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, ng) => ff.on('close', (c) => (c === 0 ? ok() : ng(new Error(`ffmpeg が失敗しました（${c}）`)))));
    for (let i = 0; i < frames; i += 1) {
      await page.evaluate((t) => window.seek(t), i / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i === Math.round(2.4 * FPS)) writeFileSync(join(dir, 'cover.jpg'), buf);
    }
    ff.stdin.end();
    await done;
    writeFileSync(join(dir, 'post.txt'), `${reel.caption}\n\n${reel.hashtags.join(' ')}\n`);
    console.log(`  ✓ ${out}（${total.toFixed(1)} 秒）`);
    await page.close();
  }
} finally {
  await browser.close();
}
