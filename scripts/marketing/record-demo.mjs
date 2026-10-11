#!/usr/bin/env node
// 🎬 お試しモードのアプリを、台本どおりに操作して縦動画（9:16・1080×1920）に録る。
//
// 使い方:
//   1. 別ターミナルで  npm run demo              （http://localhost:5173）
//   2. npm run mkt:record                        → 台本（scenarios.mjs）を全部録る
//      npm run mkt:record -- consult-answer       → 名前で絞る
//      npm run mkt:record -- --file my.json       → JSON の台本（同じ形の配列）を足す
//      npm run mkt:record -- --plain              → 字幕と題を焼き込まない（CapCut で付けるとき・「画面は見本です。…」の注記は残す）
//      npm run mkt:record -- --theme dark         → 暗い画面で録る
//      npm run mkt:record -- --no-finish          → mp4 に仕上げない（raw.webm と meta.json だけ）
//   環境変数: MKT_BASE_URL（既定 UI_SHOTS_URL か http://localhost:5173）・PW_EXE（ui-shots.mjs と同じ）・MKT_OUT（出力先）
//
// 仕組み: 1080×1920 の「舞台」のページの中に、iPhone 幅（390×693）のアプリを iframe で置いて 2.1 倍に拡大する
//   （アプリは 390 幅のまま動くので見た目は本物と同じ・文字はくっきり）。上の帯に字幕、最初の 2 秒は題、下にロゴ。
//   お試しモードの注記「（お試しモードの応答です…）」は録画の間だけ隠し、実在の著者名（scenarios.mjs の AUTHOR_REDACT）と
//   台本の redact を置きかえる。画面の下には、いつも小さく「画面は見本です。…」（notes.mjs の SAMPLE_NOTE・--plain でも出す）。
//   色と書体は src/styles/tokens.css のトークンをそのまま読む。押した場所には丸い印。
//   Playwright の recordVideo で舞台ごと録り、finish-video.mjs が頭を切って mp4 にする。
// 出力: marketing-out/videos/<日付>/<名前>/ に raw.webm・meta.json・final.mp4・captions.srt・cover.jpg（git 管理外）。

import { mkdirSync, renameSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { SCENARIOS, redactPairs, AUTHOR_REDACT } from './scenarios.mjs';
import { SAMPLE_NOTE } from './notes.mjs';
import { marksToCues } from './srt.mjs';
import { finishVideo } from './finish-video.mjs';

const BASE = (process.env.MKT_BASE_URL || process.env.UI_SHOTS_URL || 'http://localhost:5173').replace(/\/$/, '');
const W = 1080;
const H = 1920;
const PHONE = { w: 390, h: 693, scale: 2.1, top: 330 };
const TITLE_SEC = 2;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const optValues = new Set(['--file', '--theme', '--out'].map((n) => opt(n)).filter(Boolean));
const names = args.filter((a) => !a.startsWith('--') && !optValues.has(a));
const plain = flag('--plain');
const theme = opt('--theme') === 'dark' ? 'dark' : null;
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const outRoot = opt('--out') || process.env.MKT_OUT || join('marketing-out', 'videos', today);

let scenarios = [...SCENARIOS];
if (opt('--file')) scenarios = [...scenarios, ...JSON.parse(readFileSync(opt('--file'), 'utf8'))];
const targets = names.length ? scenarios.filter((s) => names.includes(s.name)) : scenarios;
if (!targets.length) {
  console.error(`台本が見つかりません。使える名前: ${scenarios.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 舞台のページ。色・書体・余白は tokens.css のトークン（直書きしない）。大きさだけは 1080 幅の動画に合わせた数。
function stageHtml(appUrl) {
  const left = (W - PHONE.w * PHONE.scale) / 2;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="/src/styles/tokens.css">
<style>
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); color: var(--text); font-family: var(--font-ui); }
  #band { position: absolute; left: 64px; right: 64px; top: 48px; height: 250px; display: flex; align-items: center; justify-content: center; text-align: center; }
  #cap, #title { margin: 0; white-space: pre-line; word-break: keep-all; line-break: strict; text-wrap: balance; transition: opacity 200ms; }
  #cap { font-size: 56px; line-height: 1.4; font-weight: 700; }
  #title { position: absolute; font-size: 68px; line-height: 1.32; font-weight: 700; color: var(--accent); opacity: 0; }
  body.show-title #title { opacity: 1; }
  body.show-title #cap { opacity: 0; }
  #ph { position: absolute; left: ${left}px; top: ${PHONE.top}px; width: ${PHONE.w}px; height: ${PHONE.h}px; border: 0;
        transform: scale(${PHONE.scale}); transform-origin: 0 0; border-radius: var(--radius-md); box-shadow: var(--shadow-3);
        background: var(--bg); opacity: 0; transition: opacity 300ms; }
  body.ready #ph { opacity: 1; }
  #logo { position: absolute; left: 0; right: 0; bottom: 64px; height: 64px; display: flex; justify-content: center; }
  #logo img { height: 64px; }
  /* 画面は見本だと示す注記（景品表示法の優良誤認・2026-10-11）。最初から最後まで、--plain でも出す */
  #sample { position: absolute; left: 48px; right: 48px; bottom: 16px; margin: 0; text-align: center; font-size: 30px; line-height: 1.3;
            color: var(--text-2); word-break: keep-all; line-break: strict; }
  .tap { position: absolute; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%; background: var(--accent);
         opacity: 0.35; pointer-events: none; animation: tap 650ms ease-out forwards; }
  @keyframes tap { from { transform: scale(0.4); opacity: 0.45; } to { transform: scale(1.3); opacity: 0; } }
  body.plain #band, body.plain #logo { display: none; }
</style></head>
<body class="${plain ? 'plain' : ''}">
  <div id="band"><p id="cap"></p><p id="title"></p></div>
  <iframe id="ph" src="${escapeHtml(appUrl)}" title="Orime"></iframe>
  <div id="logo"><img src="/logo-lockup.png" alt="Orime"></div>
  <p id="sample">${escapeHtml(SAMPLE_NOTE)}</p>
</body></html>`;
}

// アプリの中（iframe）で動かす小さな script: お試しモードの注記を隠し、実在の名前を置きかえる。
// 置きかえは 3 か所に効かせる（録画の間だけ・アプリのコードは変えない・2026-10-11）:
//   - 画面の文字（文節で span に割られても効くように、隣り合う文字のノードをつないで探す）
//   - 表紙の絵（data:image/svg+xml の <img>・canvas に描く Image も）
//   - canvas の文字（写真で共有の画像の中の著者名）
// React が文字を書き直しても MutationObserver がもう一度当てる。
function cleanScreen({ pairs, mediaPairs }) {
  if (window.top === window) return; // 舞台のページでは何もしない
  const NOTE = /お試しモードの応答/;
  const apply = (str, list) => { let out = str; for (const [from, to] of list) out = out.split(from).join(to); return out; };
  const hasAny = (str, list) => list.some(([from]) => str.includes(from));

  // canvas の文字
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    for (const k of ['fillText', 'strokeText', 'measureText']) {
      const orig = C.prototype[k];
      if (typeof orig !== 'function') continue;
      C.prototype[k] = function patched(text, ...rest) { return orig.call(this, typeof text === 'string' ? apply(text, mediaPairs) : text, ...rest); };
    }
  }
  // 表紙の絵（SVG の data URI）
  const fixSrc = (v) => {
    if (typeof v !== 'string' || !v.startsWith('data:image/svg+xml')) return v;
    const comma = v.indexOf(',');
    const head = v.slice(0, comma + 1);
    if (/;base64,$/.test(head)) return v;
    try {
      const body = decodeURIComponent(v.slice(comma + 1));
      return hasAny(body, mediaPairs) ? head + encodeURIComponent(apply(body, mediaPairs)) : v;
    } catch { return v; }
  };
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { ...desc, set(v) { desc.set.call(this, fixSrc(v)); } });
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function patched(name, value) {
    return setAttr.call(this, name, this instanceof HTMLImageElement && String(name).toLowerCase() === 'src' ? fixSrc(value) : value);
  };

  // 画面の文字。目に見えない文字（U+2060・U+200B）は飛ばしてつなぎ、名前が 2 つのノードにまたがっても置きかえる。
  const INVISIBLE = /[⁠​]/;
  const fix = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      if (!v) continue;
      if (v.includes('お試し')) {
        // 文節で span に割られていることがあるので、注記の全文を含むいちばん内側の要素まで上る。
        let el = n.parentElement;
        while (el && el !== document.body && !NOTE.test(el.textContent || '')) el = el.parentElement;
        if (el && el !== document.body && (el.textContent || '').length < 300) { el.style.display = 'none'; continue; }
      }
      nodes.push(n);
    }
    // 1 つのノードの中で済むものを先に
    for (const n of nodes) { const out = apply(n.nodeValue, pairs); if (out !== n.nodeValue) n.nodeValue = out; }
    // ノードをまたぐもの
    const map = []; // つないだ文字 → [ノード, その中の位置]
    let joined = '';
    for (const n of nodes) {
      const v = n.nodeValue;
      for (let k = 0; k < v.length; k += 1) { if (!INVISIBLE.test(v[k])) { joined += v[k]; map.push([n, k]); } }
    }
    const edits = []; // [ノード, 位置, 消す長さ, 入れる文字]
    for (const [from, to] of pairs) {
      for (let at = joined.indexOf(from); at >= 0; at = joined.indexOf(from, at + from.length)) {
        const first = map[at];
        const last = map[at + from.length - 1];
        if (first[0] === last[0]) continue; // 1 つのノードの中のもの（上で済んでいる）
        // 最初のノードには置きかえの文字、残りのノードからは名前の部分を消す
        const perNode = new Map();
        for (let k = at; k < at + from.length; k += 1) {
          const [n, pos] = map[k];
          const r = perNode.get(n) || { start: pos, end: pos };
          r.end = pos; perNode.set(n, r);
        }
        let firstDone = false;
        for (const [n, r] of perNode) { edits.push([n, r.start, r.end - r.start + 1, firstDone ? '' : to]); firstDone = true; }
        for (let k = at; k < at + from.length; k += 1) joined = joined.slice(0, k) + '\u0000' + joined.slice(k + 1);
      }
    }
    // 後ろから当てる（同じノードの中の位置がずれないように）
    edits.sort((a, b) => b[1] - a[1]);
    for (const [n, start, len, text] of edits) n.nodeValue = n.nodeValue.slice(0, start) + text + n.nodeValue.slice(start + len);
  };
  const start = () => {
    fix();
    new MutationObserver(() => fix()).observe(document.body, { subtree: true, childList: true, characterData: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
}

async function recordOne(browser, s) {
  const dir = join(outRoot, s.name);
  mkdirSync(dir, { recursive: true });
  const videoDir = join(dir, '.video');
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: true, locale: 'ja-JP',
    colorScheme: (theme || s.theme) === 'dark' ? 'dark' : 'light',
    recordVideo: { dir: videoDir, size: { width: W, height: H } },
  });
  await ctx.route(`${BASE}/__mkt-stage`, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: stageHtml(BASE + (s.url || '/')) }));
  const { text: pairs, media: mediaPairs } = redactPairs(s.redact);
  await ctx.addInitScript(cleanScreen, { pairs, mediaPairs });
  const page = await ctx.newPage();
  // fastForward を使う台本だけ、ページの時計を差し替える（集中モードの 30 分を一瞬で進める）。
  if ((s.steps || []).some((x) => x.fastForward)) await page.clock.install();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const app = page.frameLocator('#ph');
  const marks = [];
  const cuts = []; // 仕上げで切る区間（いまは空。読み込みが重いと録画と時計がずれるので、待ち時間は切らずに fastForward などで作らない）
  const say = async (text) => {
    marks.push({ at: now(), text: text || null });
    await page.evaluate((t) => { document.getElementById('cap').textContent = t || ''; }, text || '');
  };
  const tapMark = async (locator) => {
    const box = await locator.boundingBox().catch(() => null);
    if (!box) return;
    await page.evaluate(({ x, y }) => {
      const d = document.createElement('div');
      d.className = 'tap'; d.style.left = `${x}px`; d.style.top = `${y}px`;
      document.body.appendChild(d); setTimeout(() => d.remove(), 800);
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  };

  let trimStart = 0;
  let failed = null;
  try {
    await page.goto(`${BASE}/__mkt-stage`, { waitUntil: 'load' });
    await app.locator('nav').first().waitFor({ state: 'visible', timeout: 60000 });
    await app.locator('[data-splash]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.evaluate((title) => {
      document.getElementById('title').textContent = title;
      document.body.classList.add('ready', 'show-title');
    }, s.title || '');
    await page.waitForTimeout(350);
    trimStart = Math.max(0, now() - 0.05);
    await page.waitForTimeout(TITLE_SEC * 1000);
    await page.evaluate(() => document.body.classList.remove('show-title'));

    for (const [i, step] of (s.steps || []).entries()) {
      try {
        if ('say' in step) await say(step.say);
        if (step.goto) {
          // 裏で 2 つめの画面を読み込み、出来上がってから差し替える（読み込み中の白い画面を映さない）。
          await page.evaluate((url) => {
            const old = document.getElementById('ph');
            const next = old.cloneNode(false);
            next.id = 'ph-next'; next.src = url; next.style.opacity = '0';
            old.after(next);
          }, BASE + step.goto);
          const next = page.frameLocator('#ph-next');
          await next.locator(step.waitFor || 'nav').first().waitFor({ state: 'visible', timeout: step.timeout || 60000 });
          await page.waitForTimeout(500);
          await page.evaluate(() => {
            const old = document.getElementById('ph');
            const next = document.getElementById('ph-next');
            old.remove(); next.id = 'ph'; next.style.opacity = '';
          });
        }
        if (step.fastForward) await page.clock.fastForward(step.fastForward);
        if (step.waitFor) await app.locator(step.waitFor).first().waitFor({ state: 'visible', timeout: step.timeout || 20000 });
        if (step.tap) {
          const loc = app.locator(step.tap).first();
          await loc.waitFor({ state: 'visible', timeout: step.timeout || 10000 });
          await loc.scrollIntoViewIfNeeded();
          await tapMark(loc);
          await page.waitForTimeout(180);
          await loc.click();
        }
        if (step.fill) await app.locator(step.fill[0]).first().fill(step.fill[1]);
        if (step.type) {
          const loc = app.locator(step.type[0]).first();
          await tapMark(loc);
          await loc.click();
          await loc.pressSequentially(step.type[1], { delay: step.delay || 70 });
        }
        if (step.upload) await app.locator(step.upload[0]).first().setInputFiles(step.upload[1], { timeout: step.timeout || 3000 });
        if (step.scrollTo) {
          await app.locator(step.scrollTo).first().evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), step.block || 'center');
          await page.waitForTimeout(600);
        }
        if (step.scrollBy) {
          await app.locator('body').evaluate((body, dy) => {
            const boxes = [...body.querySelectorAll('*')].filter((el) => {
              const oy = getComputedStyle(el).overflowY;
              return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 10 && el.clientHeight > 200;
            });
            const box = boxes.sort((a, b) => b.clientHeight - a.clientHeight)[0] || document.scrollingElement;
            box.scrollBy({ top: dy, behavior: 'smooth' });
          }, step.scrollBy);
          await page.waitForTimeout(600);
        }
        if (step.eval) await app.locator('body').evaluate((_, code) => (0, eval)(code), step.eval);
        await page.waitForTimeout(step.hold ?? 700);
      } catch (e) {
        if (step.optional) continue;
        throw new Error(`段 ${i + 1}（${JSON.stringify(step).slice(0, 80)}）: ${e.message.split('\n')[0]}`);
      }
    }
    await page.waitForTimeout(400);
  } catch (e) {
    failed = e.message;
  }
  const end = now();
  const video = page.video();
  await ctx.close();
  const raw = join(dir, 'raw.webm');
  renameSync(await video.path(), raw);
  rmSync(videoDir, { recursive: true, force: true });
  const meta = {
    name: s.name, title: s.title || '', titleSec: TITLE_SEC, url: s.url || '/', plain, theme: theme || s.theme || 'light',
    trimStart, duration: end, cues: marksToCues(marks, end), cuts,
    sampleNote: SAMPLE_NOTE, redacted: Object.keys(AUTHOR_REDACT).length,
    recordedAt: new Date().toISOString(), base: BASE, failed, pageErrors: errors.slice(0, 5),
  };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { dir, failed, errors };
}

mkdirSync(outRoot, { recursive: true });
const browser = await chromium.launch(browserOptions());
let bad = 0;
for (const s of targets) {
  const { dir, failed, errors } = await recordOne(browser, s);
  if (failed) {
    bad += 1;
    console.error(`✗ ${s.name}: ${failed}（途中までの録画は ${join(dir, 'raw.webm')}）`);
    continue;
  }
  let note = '';
  if (!flag('--no-finish')) {
    const out = await finishVideo(dir).catch((e) => { note = `  ⚠️ ${e.message}`; return null; });
    if (out) note = `  → ${resolve(out)}`;
  }
  console.log(`✓ ${s.name}  ${join(dir, 'raw.webm')}${note}${errors.length ? `  ⚠️ ${errors[0]}` : ''}`);
}
await browser.close();
if (bad) process.exit(1);
