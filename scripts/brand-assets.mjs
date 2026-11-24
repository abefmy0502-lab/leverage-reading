#!/usr/bin/env node
// 🎨 orime のロゴの素材を 1 つの SVG から全部つくる（2026-11-24 オーナー「ロゴを変えたい」＝折り重なる 2 本の帯・まん中のひし形の余白・小文字の orime。同日 3 案目で点をなくした）。
//
//   元: public/brand/orime-mark-source.svg（記号だけの画像を色ごとに描き起こした形・viewBox 1536×1024・4 枚目＝記号の正）と
//       public/brand/orime-logo-source.svg（記号＋文字の画像・ここからは文字だけを使い、色は記号の濃い茶にそろえる）
//   node scripts/brand-assets.mjs  → 下の一覧を書き直す（コミットする）
//
//   public/brand/orime-mark.svg・orime-wordmark.svg・orime-lockup.svg（横組み）・*-dark.svg（暗い地の色）＝画面は src/components/BrandLogo.jsx
//   public/icons/icon-1024.png・icon-1024-appstore.png・icon-512.png・icon-192.png・maskable-512.png・mark-96.png・mark-96-dark.png
//   public/apple-touch-icon.png・favicon-32.png・favicon-16.png・logo-lockup.png（縦組み・地は透明＝写真で共有の画像のロゴ）・og-image.png
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png・Splash.imageset（明るい・暗い）
//
//   決まり: サービス名はロゴ・アプリ名・文中のすべてで小文字の「orime」（2026-11-24 オーナー「全部小文字に統一したい」）。
//   暗い地では 明るい茶→#c98a5c・濃い茶→#9a5a35・文字→#efe6da（暗い地の上で 3:1 以上）。
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const pathsOf = (file) => [...readFileSync(P(file), 'utf8').matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);
// 記号は記号だけの画像（4 枚目）から、文字は記号＋文字の画像（3 枚目）から（2026-11-24）
const markPaths = pathsOf('public/brand/orime-mark-source.svg');
const wordPaths = pathsOf('public/brand/orime-logo-source.svg');

const LIGHT = '#a35f38';
const DARK = '#663a21';
const WORD_SRC = ['#a6643b', '#744023']; // 文字の元の色（どちらも DARK にそろえる）
const BG = '#fcf8ef'; // ロゴの地（オーナーの画像の地）
const APP_BG_LIGHT = '#f7f5f1'; // アプリの明るい地（起動画面）
const APP_BG_DARK = '#1b1a18'; // アプリの暗い地
const ON_DARK = { [LIGHT]: '#c98a5c', [DARK]: '#9a5a35' };
const WORD_ON_DARK = '#efe6da';

// 描き起こした形の中の、記号と文字の範囲（scripts で測った値・余白なし）
const MARK = { x: 416, y: 264, w: 705, h: 472 }; // orime-mark-source.svg の中
const WORD = { x: 749, y: 326, w: 729, h: 194 }; // orime-logo-source.svg の中
// 横組みの並び（3 枚目の画像の比＝記号の高さ 263 に文字の高さ 194・文字は上から 18・間 62）
const LOCK = { markH: 263, wordTop: 18, gap: 62 };
// 縦組みの並び（2026-11-24 の 5 枚目＝縦組みの画像の比: 文字の幅＝記号の幅の 1.1 倍・間＝記号の幅の 8%）
const STACK = { word: 1.1, gap: 0.08 };

const recolor = (s, map) => Object.entries(map).reduce((t, [a, b]) => t.split(`fill="${a}"`).join(`fill="${b}"`), s);
const wordColor = (c) => Object.fromEntries(WORD_SRC.map((k) => [k, c]));
const inner = (paths, box, map) => `viewBox="${box.x} ${box.y} ${box.w} ${box.h}">${recolor(paths.join(''), map)}`;
const markSvg = (map = {}) => `<svg xmlns="http://www.w3.org/2000/svg" ${inner(markPaths, MARK, map)}</svg>`;
const wordSvg = (color = DARK) => `<svg xmlns="http://www.w3.org/2000/svg" ${inner(wordPaths, WORD, wordColor(color))}</svg>`;
const lockupSvg = (markMap = {}, wcolor = DARK) => {
  const mw = (MARK.w * LOCK.markH) / MARK.h;
  const wx = mw + LOCK.gap;
  const W = Math.ceil(wx + WORD.w);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${LOCK.markH}">`
    + `<svg x="0" y="0" width="${mw.toFixed(1)}" height="${LOCK.markH}" ${inner(markPaths, MARK, markMap)}</svg>`
    + `<svg x="${wx.toFixed(1)}" y="${LOCK.wordTop}" width="${WORD.w}" height="${WORD.h}" ${inner(wordPaths, WORD, wordColor(wcolor))}</svg></svg>`;
};
const lockupDarkSvg = () => lockupSvg(ON_DARK, WORD_ON_DARK);

const png = (svg, width) => sharp(Buffer.from(svg), { density: 600 }).resize({ width }).png().toBuffer();

async function onSquare(size, markW, bg, map = {}) {
  const mark = await png(markSvg(map), markW);
  const { height } = await sharp(mark).metadata();
  return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
    .composite([{ input: mark, left: Math.round((size - markW) / 2), top: Math.round((size - height) / 2) }]);
}

async function main() {
  mkdirSync(P('public/brand'), { recursive: true });
  writeFileSync(P('public/brand/orime-mark.svg'), markSvg());
  writeFileSync(P('public/brand/orime-mark-dark.svg'), markSvg(ON_DARK));
  writeFileSync(P('public/brand/orime-wordmark.svg'), wordSvg());
  writeFileSync(P('public/brand/orime-wordmark-dark.svg'), wordSvg(WORD_ON_DARK));
  writeFileSync(P('public/brand/orime-lockup.svg'), lockupSvg());
  writeFileSync(P('public/brand/orime-lockup-dark.svg'), lockupDarkSvg());

  // アプリのアイコン（地はロゴの地・記号は幅の 59%・透明なし）
  const icon = await (await onSquare(1024, 600, BG)).png().toBuffer();
  const flat = (b) => sharp(b).flatten({ background: BG }).removeAlpha();
  await flat(icon).toFile(P('public/icons/icon-1024.png'));
  await flat(icon).toFile(P('public/icons/icon-1024-appstore.png'));
  await flat(icon).toFile(P('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  for (const [w, f] of [[512, 'public/icons/icon-512.png'], [192, 'public/icons/icon-192.png'], [180, 'public/apple-touch-icon.png'], [32, 'public/favicon-32.png'], [16, 'public/favicon-16.png']]) {
    await sharp(icon).resize(w, w).png().toFile(P(f));
  }
  // maskable は安全域（真ん中の 80%）の中に記号（幅の 50%）
  await (await onSquare(512, 256, BG)).png().toFile(P('public/icons/maskable-512.png'));

  // 画面の左上の印（地は透明・暗い画面用もつくる）
  for (const [f, map] of [['public/icons/mark-96.png', {}], ['public/icons/mark-96-dark.png', ON_DARK]]) {
    const m = await png(markSvg(map), 88);
    const { height } = await sharp(m).metadata();
    await sharp({ create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: m, left: 4, top: Math.round((96 - height) / 2) }]).png().toFile(P(f));
  }

  // 縦組み（上に記号・下に文字・地は透明）＝写真で共有の画像のロゴ（lib/shareCard.js が透明な行で上下を切り分ける）
  {
    const mw = 520;
    const ww = Math.round(mw * STACK.word);
    const W = ww;
    const mark = await png(markSvg(), mw);
    const word = await png(wordSvg(), ww);
    const mh = (await sharp(mark).metadata()).height;
    const wh = (await sharp(word).metadata()).height;
    const gap = Math.round(mw * STACK.gap);
    await sharp({ create: { width: W, height: mh + gap + wh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: mark, left: Math.round((W - mw) / 2), top: 0 }, { input: word, left: 0, top: mh + gap }])
      .png().toFile(P('public/logo-lockup.png'));
  }

  // SNS に貼られたときの絵（1200×630・横組みを真ん中に）
  {
    const lock = await png(lockupSvg(), 760);
    const lh = (await sharp(lock).metadata()).height;
    await sharp({ create: { width: 1200, height: 630, channels: 3, background: BG } })
      .composite([{ input: lock, left: 220, top: Math.round((630 - lh) / 2) }]).png().toFile(P('public/og-image.png'));
  }

  // iPhone の起動画面（2732 四方・縦の画面では左右が切れるので幅 900 の中に収める）
  for (const [f, bg, map, wmap] of [
    ['splash-2732x2732.png', APP_BG_LIGHT, {}, DARK],
    ['splash-2732x2732-dark.png', APP_BG_DARK, ON_DARK, WORD_ON_DARK],
  ]) {
    const mw = 560;
    const ww = Math.round(mw * STACK.word);
    const mark = await png(markSvg(map), mw);
    const word = await png(wordSvg(wmap), ww);
    const mh = (await sharp(mark).metadata()).height;
    const wh = (await sharp(word).metadata()).height;
    const gap = Math.round(mw * STACK.gap);
    const top = Math.round((2732 - (mh + gap + wh)) / 2);
    const out = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: bg } })
      .composite([{ input: mark, left: Math.round((2732 - mw) / 2), top }, { input: word, left: Math.round((2732 - ww) / 2), top: top + mh + gap }])
      .png().toBuffer();
    const dir = 'ios/App/App/Assets.xcassets/Splash.imageset';
    writeFileSync(P(dir, f), out);
    if (f === 'splash-2732x2732.png') {
      writeFileSync(P(dir, 'splash-2732x2732-1.png'), out);
      writeFileSync(P(dir, 'splash-2732x2732-2.png'), out);
    }
  }
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
