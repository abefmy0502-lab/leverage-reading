#!/usr/bin/env node
// 🎨 Orime のロゴの素材を 1 つの SVG から全部つくる（2026-11-24 オーナー「ロゴを変えたい」＝重なる 2 本の曲線・まん中のひし形の余白・浮かぶ点・小文字の orime）。
//
//   元: public/brand/orime-logo-source.svg（オーナーの画像を色ごとに描き起こした形・viewBox 1774×887・id="light"＝明るい茶／id="dark"＝濃い茶）
//   node scripts/brand-assets.mjs  → 下の一覧を書き直す（コミットする）
//
//   public/brand/orime-mark.svg・orime-wordmark.svg・orime-lockup.svg（横組み）・*-dark.svg（暗い地の色）＝画面は src/components/BrandLogo.jsx
//   public/icons/icon-1024.png・icon-1024-appstore.png・icon-512.png・icon-192.png・maskable-512.png・mark-96.png・mark-96-dark.png
//   public/apple-touch-icon.png・favicon-32.png・favicon-16.png・logo-lockup.png（縦組み・地は透明＝写真で共有の画像のロゴ）・og-image.png
//   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png・Splash.imageset（明るい・暗い）
//
//   決まり: ロゴの文字は小文字の「orime」、アプリ名・文中は「Orime」（2026-11-24）。
//   暗い地では 明るい茶→#c27a4e・濃い茶→#a0613b・文字→#efe6da（暗い地の上で 3:1 以上）。
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (...a) => path.join(ROOT, ...a);
const src = readFileSync(P('public/brand/orime-logo-source.svg'), 'utf8');
const paths = [...src.matchAll(/<path [^>]*\/>/g)].map((m) => m[0]);

const LIGHT = '#9f582e';
const DARK = '#753a19';
const BG = '#fcf8ef'; // ロゴの地（オーナーの画像の地）
const APP_BG_LIGHT = '#f7f5f1'; // アプリの明るい地（起動画面）
const APP_BG_DARK = '#1b1a18'; // アプリの暗い地
const ON_DARK = { [LIGHT]: '#c27a4e', [DARK]: '#a0613b' };
const WORD_ON_DARK = '#efe6da';

// 描き起こした形の中の、記号と文字の範囲（scripts で測った値・余白なし）
const MARK = { x: 338, y: 316, w: 299, h: 250 };
const WORD = { x: 718, y: 349, w: 717, h: 183 };

const recolor = (s, map) => Object.entries(map).reduce((t, [a, b]) => t.split(`fill="${a}"`).join(`fill="${b}"`), s);
const svgOf = (box, { pad = 0, map = {} } = {}) => {
  const vb = `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${recolor(paths.join(''), map)}</svg>`;
};
// 記号の SVG は記号の範囲だけ（文字の形は viewBox の外）。文字の SVG は文字の範囲だけ。
const markSvg = (map) => svgOf(MARK, { map });
const wordSvg = (map) => svgOf(WORD, { map });
const lockupSvg = (map) => svgOf({ x: MARK.x, y: MARK.y, w: WORD.x + WORD.w - MARK.x, h: MARK.h }, { map });
// 暗い地の横組み: 記号と文字は同じ濃い茶の形に入っているので、範囲で切り分けて別の色にする
const lockupDarkSvg = () => {
  const box = { x: MARK.x, y: MARK.y, w: WORD.x + WORD.w - MARK.x, h: MARK.h };
  const cut = (WORD.x + MARK.x + MARK.w) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">`
    + `<defs><clipPath id="m"><rect x="0" y="0" width="${cut}" height="887"/></clipPath><clipPath id="w"><rect x="${cut}" y="0" width="1774" height="887"/></clipPath></defs>`
    + `<g clip-path="url(#m)">${recolor(paths.join(''), ON_DARK)}</g>`
    + `<g clip-path="url(#w)">${recolor(paths.join(''), { [LIGHT]: WORD_ON_DARK, [DARK]: WORD_ON_DARK })}</g></svg>`;
};

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
  writeFileSync(P('public/brand/orime-wordmark-dark.svg'), wordSvg({ [LIGHT]: WORD_ON_DARK, [DARK]: WORD_ON_DARK }));
  writeFileSync(P('public/brand/orime-lockup.svg'), lockupSvg());
  writeFileSync(P('public/brand/orime-lockup-dark.svg'), lockupDarkSvg());

  // アプリのアイコン（地はロゴの地・記号は幅の 56%・透明なし）
  const icon = await (await onSquare(1024, 572, BG)).png().toBuffer();
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
    const W = 600;
    const mark = await png(markSvg(), 300);
    const word = await png(wordSvg(), 520);
    const mh = (await sharp(mark).metadata()).height;
    const wh = (await sharp(word).metadata()).height;
    const gap = 56;
    await sharp({ create: { width: W, height: mh + gap + wh, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: mark, left: (W - 300) / 2, top: 0 }, { input: word, left: (W - 520) / 2, top: mh + gap }])
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
    ['splash-2732x2732.png', APP_BG_LIGHT, {}, {}],
    ['splash-2732x2732-dark.png', APP_BG_DARK, ON_DARK, { [LIGHT]: WORD_ON_DARK, [DARK]: WORD_ON_DARK }],
  ]) {
    const mark = await png(markSvg(map), 520);
    const word = await png(wordSvg(wmap), 640);
    const mh = (await sharp(mark).metadata()).height;
    const wh = (await sharp(word).metadata()).height;
    const gap = 120;
    const top = Math.round((2732 - (mh + gap + wh)) / 2);
    const out = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: bg } })
      .composite([{ input: mark, left: (2732 - 520) / 2, top }, { input: word, left: (2732 - 640) / 2, top: top + mh + gap }])
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
