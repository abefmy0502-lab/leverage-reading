// 🖼 共有の画像を描く（drawShareCard）のテスト。ロゴは必ず入る（2026-10-05 オーナー裁定）ことを、
// 重ね方（記録・数字・一文）× 地（写真・紙・夜・表紙の色・透明）× 形（投稿・ストーリー）× 隠した項目 × 言葉 の
// すべての組み合わせで確かめる。canvas は無いので、呼ばれた描画を記録するだけの偽の canvas で描く。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drawShareCard } from './shareCard.js';
import { SHARE_ITEM_KEYS, LOGO_RULES, bookRecord, logoBox } from './shareOverlay.js';
import { shareImageType, shareFilename } from './shareCardLayout.js';

// 呼ばれた描画（drawImage・fillText…）を記録する 2D の文脈。文字の幅は「字数 × 文字の大きさ」。
function fakeCanvas(w = 1, h = 1, { bright = true } = {}) {
  const calls = [];
  const state = { font: '16px sans-serif' };
  const canvas = { width: w, height: h, calls };
  const sizeOf = () => parseFloat(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] || 16);
  const ctx = new Proxy({}, {
    has: () => true,
    get(_, k) {
      if (k in state) return state[k];
      if (k === 'canvas') return canvas;
      if (k === 'measureText') {
        return (s) => {
          const size = sizeOf();
          const width = Array.from(String(s)).length * size;
          return { width, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width * 0.9 };
        };
      }
      // 明るい写真（真っ白）＝白いロゴがいちばん読みにくい場合
      if (k === 'getImageData') return (x, y, gw, gh) => ({ data: new Uint8ClampedArray(Math.max(1, gw * gh) * 4).fill(bright ? 255 : 0) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: k, args, font: state.font, fillStyle: state.fillStyle }); };
    },
    set(_, k, v) { state[k] = v; return true; },
  });
  canvas.getContext = () => ctx;
  return canvas;
}

// ロゴの部品（加工済みの印と文字）を見分けられる偽の画像。
const part = (tag, width, height) => ({ tag, width, height });
const LOGO = {
  color: { mark: part('color-mark', 120, 150), word: part('color-word', 330, 100) },
  white: { mark: part('white-mark', 120, 150), word: part('white-word', 330, 100) },
};
const isLogoWord = (img) => img && (img.tag === 'color-word' || img.tag === 'white-word');

// 写真の明るさ（document.createElement で作る作業用の canvas が読む画素）。既定は真っ白＝いちばん厳しい明るい写真。
let photoBright = true;
let savedDocument;
beforeAll(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas(1, 1, { bright: photoBright }), documentElement: {} };
});
afterAll(() => {
  globalThis.document = savedDocument;
});

const BOOK = { title: 'イシューからはじめよ', author: '安宅和人', status: 'done', doneDate: '2026-09-28', actions: [{ done: true }] };
const RECORD = bookRecord(BOOK, [{ text: 'a' }, { text: 'b' }], new Date(2026, 9, 5));
const PHOTO = { source: fakeCanvas(1600, 1200), width: 1600, height: 1200 };
const COVER_IMG = { tag: 'cover', naturalWidth: 300, naturalHeight: 450, width: 300, height: 450 };

function opts(over = {}) {
  return {
    layout: 'record',
    record: RECORD,
    stamp: '2026.10.5',
    line: '問いを見極めてから、答えを探す。',
    page: 64,
    title: BOOK.title,
    author: BOOK.author,
    totalPages: 240,
    seedKey: 'm1',
    cover: { image: COVER_IMG, tone: [70, 40, 30] },
    covers: [],
    fonts: { read: 'serif', ui: 'sans-serif' },
    logo: LOGO,
    style: 'paper',
    format: 'post',
    photo: PHOTO,
    view: { panX: 0, panY: 0, zoom: 1 },
    hidden: [],
    phrase: null,
    ...over,
  };
}

describe('ロゴは必ず入る（どの組み合わせでも）', () => {
  const layouts = ['record', 'stats', 'quote'];
  const styles = ['photo', 'paper', 'night', 'cover', 'sticker'];
  const formats = ['post', 'story'];
  const hiddenSets = [[], ['stamp'], ['logo'], [...SHARE_ITEM_KEYS, 'logo']];
  const phrases = [null, { text: 'いちばん下に置いた言葉', style: 'band', x: 0.2, y: 1, scale: 1.8 }];

  it('ロゴの文字を、決まりの大きさ以上・余白の内側・画像の中に描く', () => {
    let n = 0;
    for (const layout of layouts) {
      for (const style of styles) {
        for (const format of formats) {
          for (const hidden of hiddenSets) {
            for (const phrase of phrases) {
              const canvas = fakeCanvas();
              const r = drawShareCard(canvas, opts({ layout, style, format, hidden, phrase }));
              const label = `${layout} ${style} ${format} hidden=${hidden.join(',')} phrase=${!!phrase}`;
              const words = canvas.calls.filter((c) => c.op === 'drawImage' && isLogoWord(c.args[0]));
              expect(words.length, label).toBe(1);
              const [, x, y, w, h] = words[0].args;
              expect(h, label).toBeGreaterThanOrEqual(LOGO_RULES.minWordH);
              expect(x, label).toBeGreaterThanOrEqual(LOGO_RULES.minMargin);
              expect(x + w, label).toBeLessThanOrEqual(r.width);
              expect(y, label).toBeGreaterThanOrEqual(0);
              expect(y + h, label).toBeLessThanOrEqual(r.height);
              // 本の印も一緒に描く
              expect(canvas.calls.some((c) => c.op === 'drawImage' && /-mark$/.test(c.args[0]?.tag || '')), label).toBe(true);
              // 紙は元の色・ほかは白。写真の上にロゴしか無い（記録の項目を全部隠した）ときは、明るい写真なら元の色
              const logoOnly = style === 'photo' && layout !== 'quote' && hidden.length >= SHARE_ITEM_KEYS.length;
              expect(words[0].args[0].tag, label).toBe(style === 'paper' || logoOnly ? 'color-word' : 'white-word');
              n += 1;
            }
          }
        }
      }
    }
    expect(n).toBe(3 * 5 * 2 * 4 * 2);
  });

  it('今日の日付を隠しても、ロゴの場所は変わらない', () => {
    for (const layout of layouts) {
      for (const style of ['photo', 'paper']) {
        for (const format of formats) {
          const at = (hidden) => {
            const canvas = fakeCanvas();
            drawShareCard(canvas, opts({ layout, style, format, hidden }));
            return canvas.calls.find((c) => c.op === 'drawImage' && isLogoWord(c.args[0])).args.slice(1);
          };
          expect(at(['stamp']), `${layout} ${style} ${format}`).toEqual(at([]));
        }
      }
    }
  });

  it('記録・数字は、形ごとに決まったロゴの基線に描く（重ね方で動かない）', () => {
    for (const format of formats) {
      const b = logoBox(format);
      for (const layout of ['record', 'stats']) {
        const canvas = fakeCanvas();
        drawShareCard(canvas, opts({ layout, style: 'photo', format }));
        const [, , y, , h] = canvas.calls.find((c) => c.op === 'drawImage' && isLogoWord(c.args[0])).args;
        expect(y + h).toBeCloseTo(b.baseline);
      }
    }
  });

  it('ロゴの画像が読めないときは、文字の「Orime」で代わりに描く', () => {
    for (const layout of layouts) {
      for (const style of styles) {
        const canvas = fakeCanvas();
        drawShareCard(canvas, opts({ layout, style, logo: null, hidden: [...SHARE_ITEM_KEYS, 'logo'] }));
        const t = canvas.calls.find((c) => c.op === 'fillText' && c.args[0] === 'Orime');
        expect(t, `${layout} ${style}`).toBeTruthy();
        const size = parseFloat(/(\d+)px/.exec(t.font)[1]);
        expect(size).toBeGreaterThanOrEqual(LOGO_RULES.minWordH);
      }
    }
  });

  it('写真の上にロゴしか無いとき: 明るい写真は元の色のロゴ（幕なし）・暗い写真は白いロゴ＋下に幕', () => {
    for (const layout of ['record', 'stats']) {
      photoBright = true;
      const light = fakeCanvas();
      drawShareCard(light, opts({ layout, style: 'photo', hidden: [...SHARE_ITEM_KEYS] }));
      expect(light.calls.find((c) => c.op === 'drawImage' && isLogoWord(c.args[0])).args[0].tag).toBe('color-word');
      expect(light.calls.some((c) => c.op === 'fillRect')).toBe(false);
      photoBright = false;
      const dark = fakeCanvas();
      drawShareCard(dark, opts({ layout, style: 'photo', hidden: [...SHARE_ITEM_KEYS] }));
      expect(dark.calls.find((c) => c.op === 'drawImage' && isLogoWord(c.args[0])).args[0].tag).toBe('white-word');
      expect(dark.calls.some((c) => c.op === 'fillRect' && c.args[2] === 1080)).toBe(true);
      photoBright = true;
    }
  });
});

describe('数字の重ね方', () => {
  it('数字は 3 つとも同じ大きさ（列ごとに縮めない）', () => {
    const canvas = fakeCanvas();
    drawShareCard(canvas, opts({ layout: 'stats', style: 'paper', format: 'story' }));
    const bigs = canvas.calls.filter((c) => c.op === 'fillText' && /^700 /.test(c.font) && /^[0-9]/.test(c.args[0]));
    // 「10月5日」は 10 と 5 の 2 つに分けて描く（単位は小さく）
    expect(bigs.length).toBeGreaterThanOrEqual(RECORD.stats.length);
    const sizes = new Set(bigs.map((c) => c.font));
    expect(sizes.size).toBe(1);
  });
  it('単位は数字の墨の右端の 2 右に置く（「1件」に空きを作らない）', () => {
    for (const layout of ['record', 'stats']) {
      const canvas = fakeCanvas();
      drawShareCard(canvas, opts({ layout, style: 'paper', record: { ...RECORD, stats: [{ key: 'memos', label: 'メモ', value: '1件' }] } }));
      const texts = canvas.calls.filter((c) => c.op === 'fillText');
      const i = texts.findIndex((c) => c.args[0] === '1' && /^700 /.test(c.font));
      const big = texts[i];
      const unit = texts[i + 1];
      expect(unit.args[0]).toBe('件');
      const size = parseFloat(/(\d+)px/.exec(big.font)[1]);
      // 偽の書体の墨の右端＝送り幅の 0.9 倍
      expect(unit.args[1]).toBeCloseTo(big.args[1] + size * 0.9 + 2, 5);
    }
  });
  it('一文は入れない（共有の文にも入れない）', () => {
    const r = drawShareCard(fakeCanvas(), opts({ layout: 'stats', style: 'photo' }));
    expect(r.line).toBe('');
  });
});

describe('書き出す画像の種類', () => {
  it('写真は JPEG・紙や夜は PNG・透明は PNG（透明を残す）', () => {
    expect(shareImageType('photo')).toMatchObject({ type: 'image/jpeg', ext: 'jpg' });
    expect(shareImageType('photo').quality).toBeGreaterThanOrEqual(0.9);
    for (const s of ['paper', 'night', 'cover', 'sticker']) expect(shareImageType(s)).toMatchObject({ type: 'image/png', ext: 'png' });
    const now = new Date(2026, 9, 5, 9, 5);
    expect(shareFilename({ format: 'story', style: 'photo', now })).toBe('orime-story-photo-20261005-0905.jpg');
    expect(shareFilename({ format: 'sticker', style: 'sticker', now })).toBe('orime-sticker-20261005-0905.png');
  });
  it('幅はどれも 1080', () => {
    for (const layout of ['record', 'stats', 'quote']) {
      for (const style of ['photo', 'paper', 'sticker']) {
        for (const format of ['post', 'story']) {
          expect(drawShareCard(fakeCanvas(), opts({ layout, style, format })).width).toBe(1080);
        }
      }
    }
  });
});
