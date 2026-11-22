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

import { mkdirSync, renameSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { SCENARIOS, redactPairs, AUTHOR_REDACT, openingTitle } from './scenarios.mjs';
import { ART } from './explainer/art.mjs';
import { SAFE, layoutProblems, glueSpaces, PHRASE_BREAK_CSS } from './safeZone.mjs';
import { SAMPLE_NOTE } from './notes.mjs';
import { END_LINE, END_STORE } from './explainer/reels.mjs';
import { voiceLength, readIndex } from './voiceCache.mjs';
import { marksToCues } from './srt.mjs';
import { finishVideo } from './finish-video.mjs';

const BASE = (process.env.MKT_BASE_URL || process.env.UI_SHOTS_URL || 'http://localhost:5173').replace(/\/$/, '');
const W = 1080;
const H = 1920;
// 2026-11-22 オーナー「縦いっぱいに使いすぎ」: 字の帯と画面は安全な範囲（safeZone.mjs）の中だけ
const BAND = { top: SAFE.top, h: 170 };
const PHONE = { w: 390, h: 693, scale: 1.36, top: 440 };
const SAMPLE_TOP = PHONE.top + PHONE.h * PHONE.scale + 10;
const PROBLEM = { w: 680, top: 520 };
const TITLE_SEC = 2;
const END_SEC = 2.6; // 最後の Orime のロゴのカード（2026-11-22 オーナー「動画の最後には Orime のロゴも」・--plain でも出す）

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
  // Playwright の Chromium があればそれで撮る（Mac の Google Chrome だと、台本によって録画が 0 バイトになった・2026-11-22）
  try { if (existsSync(chromium.executablePath())) return {}; } catch { /* 入っていない */ }
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
  #band { position: absolute; left: ${SAFE.left}px; right: ${W - SAFE.right}px; top: ${BAND.top}px; height: ${BAND.h}px; display: flex; align-items: center; justify-content: center; text-align: center; }
  #cap, #title { margin: 0; white-space: pre-line; ${PHRASE_BREAK_CSS} text-wrap: balance; transition: opacity 200ms; }
  #title { transition: opacity 700ms ease-out; }
  #cap { font-size: 56px; line-height: 1.4; font-weight: 700; }
  #title { position: absolute; font-size: 64px; line-height: 1.3; font-weight: 700; color: var(--accent); opacity: 0; }
  #cap, #title { max-width: 100%; }
  /* 冒頭の困っていることの 1 枚（線が描かれていく・2026-11-22） */
  #problem { position: absolute; left: ${(W - PROBLEM.w) / 2}px; top: ${PROBLEM.top}px; width: ${PROBLEM.w}px; overflow: visible; opacity: 0; pointer-events: none; transition: opacity 500ms ease-out; }
  body.show-problem #problem { opacity: 1; }
  #problem .d { fill: none; stroke: var(--text); stroke-width: var(--sw); stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1 1; stroke-dashoffset: 1; }
  #problem .d.card { fill: var(--bg); }
  #problem .d.dash, #problem .d.faded { stroke: var(--text-3); }
  #problem .f, #problem .t { opacity: 0; }
  #problem .t { fill: var(--text); font-weight: 700; }
  body.show-problem #problem .d { animation: draw var(--dur) ease-out var(--delay) forwards; }
  body.show-problem #problem .f, body.show-problem #problem .t { animation: appear 400ms ease-out var(--after) forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  @keyframes appear { to { opacity: 1; } }
  body.show-title #title { opacity: 1; }
  body:not(.show-title) #title { transition-duration: 150ms; } /* 消えるときは早く（字幕と重ねない） */
  body.show-title #cap { opacity: 0; }
  #ph { position: absolute; left: ${left}px; top: ${PHONE.top}px; width: ${PHONE.w}px; height: ${PHONE.h}px; border: 0;
        transform: scale(${PHONE.scale}); transform-origin: 0 0; border-radius: var(--radius-md); box-shadow: var(--shadow-3);
        background: var(--bg); opacity: 0; transition: opacity 700ms ease-out; }
  body.ready #ph { opacity: 1; }
  /* 画面は見本だと示す注記（景品表示法の優良誤認・2026-10-11）。最初から最後まで、--plain でも出す */
  #sample { position: absolute; left: ${SAFE.left}px; right: ${W - SAFE.right}px; top: ${SAMPLE_TOP}px; margin: 0; text-align: center; font-size: 26px; line-height: 1.3;
            color: var(--text-2); ${PHRASE_BREAK_CSS} }
  .tap { position: absolute; width: 96px; height: 96px; margin: -48px 0 0 -48px; border-radius: 50%; background: var(--accent);
         opacity: 0.35; pointer-events: none; animation: tap 650ms ease-out forwards; }
  @keyframes tap { from { transform: scale(0.4); opacity: 0.45; } to { transform: scale(1.3); opacity: 0; } }
  body.plain #band { display: none; }
  #endcard { position: absolute; inset: 0; background: var(--bg); display: flex; flex-direction: column; align-items: center; justify-content: center;
             gap: 40px; opacity: 0; transition: opacity 300ms; pointer-events: none; }
  #endcard img { height: 180px; }
  #endcard .end-line { font-size: 64px; font-weight: 700; color: var(--text); }
  #endcard .end-store { font-size: 44px; font-weight: 600; color: var(--accent); }
  body.show-end #endcard { opacity: 1; }
</style></head>
<body class="${plain ? 'plain' : ''}">
  <div id="band"><p id="cap"></p><p id="title"></p></div>
  <iframe id="ph" src="${escapeHtml(appUrl)}" title="Orime"></iframe>
  <svg id="problem" aria-hidden="true"></svg>
  <p id="sample">${escapeHtml(SAMPLE_NOTE)}</p>
  <div id="endcard"><img src="/logo-lockup.png" alt="Orime"><div class="end-line">${escapeHtml(END_LINE)}</div><div class="end-store">${escapeHtml(END_STORE)}</div></div>
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
  // 声の作り置き（mkt:voice -- --prepare）があれば、前の声が読み終わるまで次の字幕に進まない（声と字幕をそろえる）。
  const vIdx = readIndex();
  let voiceUntil = 0;
  const waitVoice = async () => { const w = voiceUntil - now(); if (w > 0) await page.waitForTimeout(w * 1000); };
  const say = async (text) => {
    await waitVoice();
    // 声が無いときも、字幕を読み切れるだけの間を取る（1 字 0.1 秒の目安）。
    const vl = voiceLength(text, vIdx) || (text ? String(text).length * 0.1 : 0);
    if (vl) voiceUntil = now() + vl + 0.35;
    marks.push({ at: now(), text: text || null });
    await page.evaluate((t) => { document.getElementById('cap').textContent = t || ''; }, glueSpaces(text));
    await fitBand('cap');
    if (text) { await page.waitForTimeout(250); await checkLayout(`「${String(text).slice(0, 12)}」`); }
  };
  // 字は帯の中に収まるまで小さくする（収まらない・重なる・はみ出すと、この動画は書き出さない）
  const layoutIssues = [];
  const fitBand = (id) => page.evaluate((elId) => {
    const el = document.getElementById(elId);
    const band = document.getElementById('band');
    let fs = elId === 'title' ? 64 : 56;
    el.style.fontSize = `${fs}px`;
    while ((el.scrollHeight > band.clientHeight || el.scrollWidth > band.clientWidth) && fs > 32) { fs -= 2; el.style.fontSize = `${fs}px`; }
  }, id);
  const checkLayout = async (where) => {
    if (plain) return;
    const found = await page.evaluate(layoutProblems, { selector: '#cap, #title, #ph, #sample, #problem', safe: SAFE });
    for (const f of found) layoutIssues.push(`${where}: ${f}`);
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
  let endAt = null;
  let failed = null;
  try {
    await page.goto(`${BASE}/__mkt-stage`, { waitUntil: 'load' });
    await app.locator('nav').first().waitFor({ state: 'visible', timeout: 60000 });
    await app.locator('[data-splash]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(600);
    // 急に始めない（2026-11-22 オーナー）: 地の色だけの所から、題がゆっくり出て、そのあと画面が出る。
    // 困っていることの絵（s.problem）がある台本は、冒頭は題（困っていること）と大きな線の絵だけ。intro の段を読み終えてから画面を出す。
    const title = openingTitle(s);
    await page.evaluate((t) => { document.getElementById('title').textContent = t; }, glueSpaces(title));
    await fitBand('title');
    if (s.problem) {
      const a = ART[s.problem];
      if (!a) throw new Error(`絵が見つかりません: ${s.problem}`);
      await page.evaluate(({ svg, viewBox, sw }) => {
        const el = document.getElementById('problem');
        el.setAttribute('viewBox', viewBox);
        el.style.setProperty('--sw', sw);
        el.innerHTML = svg;
        const lines = [...el.querySelectorAll('.d')];
        const dur = 1.8; const each = (dur / Math.max(1, lines.length)) * 1.6;
        lines.forEach((ln, k) => {
          ln.style.setProperty('--delay', `${0.4 + (dur - each) * (lines.length > 1 ? k / (lines.length - 1) : 0)}s`);
          ln.style.setProperty('--dur', `${each}s`);
        });
        el.style.setProperty('--after', `${0.4 + dur * 0.85}s`);
      }, { svg: a.svg, viewBox: a.viewBox, sw: ((7 * Number(a.viewBox.split(' ')[2])) / PROBLEM.w).toFixed(2) });
    }
    await page.waitForTimeout(200);
    trimStart = Math.max(0, now() - 0.05);
    await page.evaluate((withProblem) => document.body.classList.add('show-title', ...(withProblem ? ['show-problem'] : [])), !!s.problem);
    await page.waitForTimeout(900);
    if (!s.problem) await page.evaluate(() => document.body.classList.add('ready'));
    await checkLayout('題');
    // 題の声（0.3 秒から読む）が終わるまで題を出しておく
    await page.waitForTimeout(Math.max(TITLE_SEC + (s.problem ? 1.2 : 0), voiceLength(title, vIdx) - 0.3) * 1000);
    await page.evaluate(() => document.body.classList.remove('show-title'));
    await page.waitForTimeout(250); // 題が消えきってから字幕
    let shown = !s.problem;

    for (const [i, step] of (s.steps || []).entries()) {
      if (!shown && !step.intro) {
        await waitVoice();
        await page.evaluate(() => { document.body.classList.remove('show-problem'); document.body.classList.add('ready'); });
        await page.waitForTimeout(700);
        shown = true;
      }
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
    // 最後に Orime のロゴのカード（ロゴ・「読んだ本と、会話できる。」・App Store）。声は「読んだ本と、会話できる。」を読む。
    await waitVoice();
    await page.evaluate(() => document.body.classList.add('show-end'));
    endAt = now();
    await page.waitForTimeout(Math.max(END_SEC, voiceLength(END_LINE, vIdx) + 1.0) * 1000);
  } catch (e) {
    failed = e.message;
  }
  if (!failed && layoutIssues.length) failed = `配置を直してください（安全な範囲 上 ${SAFE.top}・下 ${SAFE.bottom}）\n    ${[...new Set(layoutIssues)].join('\n    ')}`;
  const end = now();
  const video = page.video();
  await ctx.close();
  const raw = join(dir, 'raw.webm');
  renameSync(await video.path(), raw);
  rmSync(videoDir, { recursive: true, force: true });
  const meta = {
    name: s.name, title: openingTitle(s), titleSec: TITLE_SEC, url: s.url || '/', plain, theme: theme || s.theme || 'light',
    trimStart, duration: end, cues: marksToCues(marks, end), cuts, endAt, endLine: END_LINE,
    sampleNote: SAMPLE_NOTE, redacted: Object.keys(AUTHOR_REDACT).length,
    recordedAt: new Date().toISOString(), base: BASE, failed, pageErrors: errors.slice(0, 5),
  };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { dir, failed, errors };
}

mkdirSync(outRoot, { recursive: true });
// 録画が空になる（Mac が眠った・ブラウザが詰まった）・途中で止まる、は 3 回まで撮り直す。
// 配置の決まり（はみ出し・重なり）で止まったときは撮り直さない（台本を直すしかない）。
const TRIES = 3;
let browser = await chromium.launch(browserOptions());
const badNames = [];
for (const s of targets) {
  let last = '';
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    if (attempt > 1) {
      console.log(`  ↻ ${s.name}: 撮り直します（${attempt}/${TRIES}）`);
      await browser.close().catch(() => {});
      browser = await chromium.launch(browserOptions());
    }
    const { dir, failed, errors } = await recordOne(browser, s);
    if (failed) {
      last = `${failed}（途中までの録画は ${join(dir, 'raw.webm')}）`;
      if (/配置を直してください/.test(failed)) break;
      continue;
    }
    const raw = join(dir, 'raw.webm');
    if (!existsSync(raw) || statSync(raw).size < 20000) { last = '録画が空でした'; continue; }
    if (flag('--no-finish')) { last = ''; console.log(`✓ ${s.name}  ${raw}`); break; }
    let why = '';
    const out = await finishVideo(dir).catch((e) => { why = e.message; return null; });
    if (!out) { last = `仕上げに失敗しました: ${why}`; continue; }
    last = '';
    console.log(`✓ ${s.name}  → ${resolve(out)}${errors.length ? `  ⚠️ ${errors[0]}` : ''}`);
    break;
  }
  if (last) { badNames.push(s.name); console.error(`✗ ${s.name}: ${last}`); }
}
await browser.close();
if (badNames.length) {
  console.error(`\n✗ 撮れなかった動画: ${badNames.join('・')}`);
  process.exit(1);
}
