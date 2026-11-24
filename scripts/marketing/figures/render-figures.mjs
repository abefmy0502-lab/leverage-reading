// 🖼 図を PNG に書き出す（`npm run mkt:figures` → marketing-out/figures/<name>.png）。
//   一部だけ: `npm run mkt:figures -- launch-flow note06-header`
//   確かめるだけ: `npm run mkt:figures -- --check`
// 中身は figures.mjs。色は src/styles/tokens.css の明るい画面の値、文字は Noto Sans JP / Noto Serif JP（Google Fonts＝Mac でもクラウドでも同じ形）。
// 右下に必ず orime のロゴ（public/icons/icon-512.png）と「orime」。

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIGURES, SIZES, checkFigure } from './figures.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'marketing-out/figures');

const C = { bg: '#f7f5f1', surface: '#fffefb', text: '#2b2825', text2: '#5f5a53', line: '#d9d3c9', accent: '#8a4b2a', accentSoft: '#f3e7df', accentInk: '#fffefb' };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dataUri = (p) => `data:image/png;base64,${readFileSync(p).toString('base64')}`;
const LOGO = dataUri(join(ROOT, 'public/icons/icon-512.png'));
const LOCKUP = dataUri(join(ROOT, 'public/logo-lockup.png'));

function artSrc(art) {
  if (!art) return '';
  if (/^https?:\/\//.test(art)) return art;
  const p = isAbsolute(art) ? art : join(ROOT, 'public', art);
  return dataUri(p);
}

function body(fig, s) {
  const k = s.width / 1600; // 大きさの係数
  const px = (n) => `${Math.round(n * k)}px`;
  const art = fig.art ? `<img class="art" src="${artSrc(fig.art)}" alt="">` : '';
  switch (fig.type) {
    case 'compare':
      return `
        ${fig.title ? `<h1 class="title">${esc(fig.title)}</h1>` : ''}
        <div class="cmp">
          <div class="col before"><div class="lab">${esc(fig.before.label)}</div><div class="big">${esc(fig.before.text)}</div>${fig.before.sub ? `<div class="sub">${esc(fig.before.sub)}</div>` : ''}</div>
          <svg class="arrow" viewBox="0 0 60 40" width="${px(72)}"><path d="M4 20 H50 M36 6 L52 20 L36 34" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="col after"><div class="lab">${esc(fig.after.label)}</div><div class="big">${esc(fig.after.text)}</div>${fig.after.sub ? `<div class="sub">${esc(fig.after.sub)}</div>` : ''}</div>
        </div>${art}`;
    case 'flow':
      return `
        <h1 class="title">${esc(fig.title)}</h1>
        <div class="flow">${fig.steps.map((st, i) => `
          ${i ? `<svg class="arrow" viewBox="0 0 40 40" width="${px(44)}"><path d="M6 20 H32 M22 10 L33 20 L22 30" fill="none" stroke="${C.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
          <div class="step"><div class="num">${i + 1}</div><div class="head">${esc(st.head)}</div><div class="sub">${esc(st.text)}</div></div>`).join('')}
        </div>${art}`;
    case 'brand':
      return `<div class="brandrow"><img class="lockup" src="${LOCKUP}" alt=""><div class="brandtext"><div class="qt">${esc(fig.text)}</div>${fig.sub ? `<div class="qs">${esc(fig.sub)}</div>` : ''}</div></div>`;
    case 'quote':
      return `<div class="quote"><div class="qt">${esc(fig.text)}</div>${fig.sub ? `<div class="qs">${esc(fig.sub)}</div>` : ''}</div>${art}`;
    case 'points':
      return `
        <h1 class="title">${esc(fig.title)}</h1>
        <ul class="pts">${fig.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>${art}`;
    default:
      return '';
  }
}

export function html(fig) {
  const s = SIZES[fig.size];
  const k = s.width / 1600;
  const px = (n) => `${Math.round(n * k)}px`;
  const footer = fig.footer ?? '読んだ本と、会話しよう。';
  const header = fig.size === 'xheader';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700&family=Noto+Serif+JP:wght@400;600&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${s.width}px;height:${s.height}px}
body{background:${C.bg};color:${C.text};font-family:"Noto Sans JP",sans-serif;padding:${px(88)} ${px(104)} ${px(128)};display:flex;flex-direction:column;justify-content:center;gap:${px(48)};position:relative;word-break:keep-all;overflow-wrap:anywhere;line-break:strict}
.title{font-family:"Noto Serif JP",serif;font-weight:600;font-size:${px(64)};line-height:1.35;letter-spacing:.02em}
.cmp{display:flex;align-items:stretch;gap:${px(32)}}
.cmp .arrow{align-self:center;flex:none}
.col{flex:1;border-radius:${px(24)};padding:${px(44)} ${px(48)};display:flex;flex-direction:column;gap:${px(16)}}
.before{background:${C.surface};border:${px(3)} solid ${C.line}}
.after{background:${C.accentSoft};border:${px(3)} solid ${C.accent}}
.lab{font-size:${px(30)};font-weight:600;color:${C.text2}}
.after .lab{color:${C.accent}}
.big{font-family:"Noto Serif JP",serif;font-size:${px(54)};font-weight:600;line-height:1.4}
.before .big{color:${C.text2}}
.sub{font-size:${px(30)};line-height:1.6;color:${C.text2}}
.flow{display:flex;align-items:stretch;gap:${px(20)}}
.flow .arrow{align-self:center;flex:none}
.step{flex:1;background:${C.surface};border:${px(3)} solid ${C.line};border-radius:${px(24)};padding:${px(40)} ${px(36)};display:flex;flex-direction:column;gap:${px(14)}}
.num{width:${px(56)};height:${px(56)};border-radius:50%;background:${C.accent};color:${C.accentInk};font-weight:700;font-size:${px(30)};display:flex;align-items:center;justify-content:center}
.head{font-family:"Noto Serif JP",serif;font-weight:600;font-size:${px(48)};line-height:1.35}
.quote{display:flex;flex-direction:column;gap:${px(28)};padding-left:${px(40)};border-left:${px(8)} solid ${C.accent}}
.qt{font-family:"Noto Serif JP",serif;font-weight:600;font-size:${px(96)};line-height:1.3;letter-spacing:.03em}
.qs{font-size:${px(40)};color:${C.text2};line-height:1.5}
.pts{list-style:none;display:flex;flex-direction:column;gap:${px(22)}}
.pts li{font-size:${px(44)};line-height:1.45;padding-left:${px(44)};position:relative}
.pts li::before{content:"";position:absolute;left:0;top:.55em;width:${px(18)};height:${px(18)};border-radius:50%;background:${C.accent}}
.art{position:absolute;right:${px(104)};top:${px(88)};height:${px(300)};border-radius:${px(24)}}
.foot{position:absolute;left:${px(104)};right:${px(104)};bottom:${px(52)};display:flex;align-items:center;justify-content:space-between;color:${C.text2};font-size:${px(28)}}
.brand{display:flex;align-items:center;gap:${px(14)};color:${C.text};font-family:"Noto Serif JP",serif;font-weight:600;font-size:${px(36)}}
.brand img{width:${px(56)};height:${px(56)};border-radius:${px(13)}}
${header ? `body{padding:0 ${px(150)} 0 ${px(520)};align-items:flex-end;justify-content:center;gap:0}.quote{border-left:none;padding-left:0;align-items:flex-end;text-align:right;gap:${px(20)}}.qt{font-size:${px(84)};white-space:nowrap}.qs{font-size:${px(40)};white-space:nowrap}.foot{display:none}` : ''}
${fig.size === 'noteprofile' ? `body{padding:0;align-items:center;justify-content:center}.foot{display:none}.brandrow{display:flex;align-items:center;gap:${px(48)}}.lockup{height:${px(212)};mix-blend-mode:multiply}.brandtext{display:flex;flex-direction:column;gap:${px(10)};padding-left:${px(32)};border-left:${px(2)} solid ${C.line}}.qt{font-family:"Noto Serif JP",serif;font-weight:600;font-size:${px(45)};line-height:1.35;white-space:nowrap}.qs{font-size:${px(30)};color:${C.text2};white-space:nowrap}` : fig.type === 'brand' ? `body{padding:0;align-items:center;justify-content:center}.foot{display:none}.brandrow{display:flex;align-items:center;gap:${px(64)};${header ? `margin-left:${px(250)}` : ''}}.lockup{height:${px(header ? 270 : 400)};mix-blend-mode:multiply}.brandtext{display:flex;flex-direction:column;gap:${px(18)};padding-left:${px(56)};border-left:${px(4)} solid ${C.line}}.qt{font-family:"Noto Serif JP",serif;font-weight:600;font-size:${px(header ? 60 : 64)};line-height:1.35;white-space:nowrap}.qs{font-size:${px(header ? 30 : 32)};color:${C.text2};white-space:nowrap}` : ''}</style></head><body>
${body(fig, s)}
<div class="foot"><span>${esc(footer)}</span><span class="brand"><img src="${LOGO}" alt="">orime</span></div>
</body></html>`;
}

// 文字は Google Fonts から読むので、プロキシのある環境（クラウド）ではプロキシを通す。
function browserOptions() {
  const proxy = process.env.HTTPS_PROXY ? (() => {
    const u = new URL(process.env.HTTPS_PROXY);
    return { proxy: { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } };
  })() : {};
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE, ...proxy };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium', ...proxy };
  return { channel: 'chrome', ...proxy };
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const names = args.filter((a) => !a.startsWith('--'));
  const list = names.length ? FIGURES.filter((f) => names.includes(f.name)) : FIGURES;
  let bad = 0;
  for (const f of list) {
    const errs = checkFigure(f);
    if (errs.length) { bad++; console.error(`✗ ${f.name}\n  ${errs.join('\n  ')}`); }
  }
  if (bad) process.exit(1);
  if (check) { console.log(`✓ ${list.length} 枚とも問題なし`); return; }

  const { chromium } = await import('playwright-core');
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(browserOptions());
  try {
    for (const f of list) {
      const s = SIZES[f.size];
      const page = await browser.newPage({ viewport: s, deviceScaleFactor: 1 });
      await page.setContent(html(f), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const file = join(OUT, `${f.name}.png`);
      writeFileSync(file, await page.screenshot({ type: 'png' }));
      await page.close();
      console.log(`→ ${file}`);
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
