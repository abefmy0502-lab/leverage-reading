// 🖼 共有の画像を描く（drawShareCard）のテスト。ロゴは必ず入る（2026-10-05 オーナー裁定）ことを、
// 重ね方（記録・数字・一文）× 地（写真・紙・夜・表紙の色・透明）× 形（投稿・ストーリー）× 隠した項目 × 言葉 の
// すべての組み合わせで確かめる。canvas は無いので、呼ばれた描画を記録するだけの偽の canvas で描く。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drawShareCard } from './shareCard.js';
import { SHARE_ITEM_KEYS, LOGO_RULES, bookRecord, logoBox } from './shareOverlay.js';
import { shareImageType, shareFilename } from './shareCardLayout.js';

// 呼ばれた描画（drawImage・fillText…）を記録する 2D の文脈。文字の幅は「字数 × 文字の大きさ」。
// profile（0〜1 の高さ → 相対輝度）があれば、getImageData はその行の明るさの灰色を返す（写真の明るさの分布）。
function fakeCanvas(w = 1, h = 1, { bright = true, profile = null } = {}) {
  const calls = [];
  const state = { font: '16px sans-serif', globalAlpha: 1 };
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
      if (k === 'getImageData') {
        return (x, y, gw, gh) => {
          const data = new Uint8ClampedArray(Math.max(1, gw * gh) * 4).fill(bright ? 255 : 0);
          if (profile) {
            for (let r = 0; r < gh; r += 1) {
              const v = Math.round(toSrgb(profile((y + r + 0.5) / Math.max(1, canvas.height))) * 255);
              for (let c = 0; c < gw; c += 1) { const i = (r * gw + c) * 4; data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255; }
            }
          }
          return { data };
        };
      }
      if (k === 'createLinearGradient') return (x0, y0, x1, y1) => { const g = { y0, y1, stops: [] }; g.addColorStop = (o, c) => g.stops.push([o, c]); return g; };
      if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: k, args, font: state.font, fillStyle: state.fillStyle, globalAlpha: state.globalAlpha }); };
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
let photoProfile = null;
let savedDocument;
beforeAll(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: () => fakeCanvas(1, 1, { bright: photoBright, profile: photoProfile }), documentElement: {} };
});

// sRGB の値 ↔ 相対輝度（灰色）。
function toSrgb(L) { return L <= 0.0031308 ? 12.92 * L : 1.055 * L ** (1 / 2.4) - 0.055; }
function toLinear(s) { return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
// '#2b2825' / 'rgba(14, 12, 10, 0.5)' / 'rgb(…)' → [r, g, b, a]（0〜1）
function parseColor(c) {
  const s = String(c || '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).concat(1);
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
  }
  return null;
}
const lumOf = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const over = (top, [r, g, b], alpha = 1) => {
  const a = top[3] * alpha;
  return [top[0] * a + r * (1 - a), top[1] * a + g * (1 - a), top[2] * a + b * (1 - a)];
};
// 縦のグラデーションの、高さ y の色（止めの間は線形）。
function gradientAt(g, y) {
  const span = g.y1 - g.y0 || 1;
  const f = (y - g.y0) / span;
  const stops = [...g.stops].sort((p, q) => p[0] - q[0]).map(([o, c]) => [o, parseColor(c)]);
  if (f <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    if (f <= stops[i][0]) {
      const [o0, c0] = stops[i - 1];
      const [o1, c1] = stops[i];
      const t = o1 === o0 ? 1 : (f - o0) / (o1 - o0);
      return c0.map((v, j) => v + (c1[j] - v) * t);
    }
  }
  return stops[stops.length - 1][1];
}
// 描いたあとの、画像いっぱいの帯（写真＋幕）の高さ y の色。index より前の fillRect（画像いっぱい）だけを重ねる。
function backgroundAt(calls, index, y, H, profile) {
  let c = [toSrgb(profile(y / H)), toSrgb(profile(y / H)), toSrgb(profile(y / H))];
  for (let i = 0; i < index; i += 1) {
    const k = calls[i];
    if (k.op !== 'fillRect' || k.args[2] < 1000) continue;
    const fill = typeof k.fillStyle === 'object' && k.fillStyle?.stops ? gradientAt(k.fillStyle, y) : parseColor(k.fillStyle);
    if (fill) c = over(fill, c, k.globalAlpha ?? 1);
  }
  return c;
}
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
  const layouts = ['record', 'stats', 'quote', 'magazine'];
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
              // 紙は元の色・夜・表紙の色・透明は白。写真はロゴの帯の明るさで決める（この偽の写真は真っ白＝元の色）
              expect(words[0].args[0].tag, label).toBe(style === 'paper' || style === 'photo' ? 'color-word' : 'white-word');
              n += 1;
            }
          }
        }
      }
    }
    expect(n).toBe(4 * 5 * 2 * 4 * 2);
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

describe('明るい写真では墨の文字・暗い写真では白い文字（第 3 回）', () => {
  it('真っ白な写真: 記録・数字・一文とも墨の文字（書名・ロゴも）', () => {
    for (const layout of ['record', 'stats', 'quote']) {
      photoBright = true;
      const c = fakeCanvas();
      drawShareCard(c, opts({ layout, style: 'photo' }));
      const title = c.calls.find((x) => x.op === 'fillText' && String(x.args[0]).includes('イシューからはじめよ'));
      expect(title?.fillStyle, layout).toBe('#2b2825');
      expect(c.calls.find((x) => x.op === 'drawImage' && isLogoWord(x.args[0])).args[0].tag).toBe('color-word');
    }
  });
  it('真っ黒な写真: 白い文字＋白いロゴ', () => {
    for (const layout of ['record', 'stats', 'quote']) {
      photoBright = false;
      const c = fakeCanvas();
      drawShareCard(c, opts({ layout, style: 'photo' }));
      const title = c.calls.find((x) => x.op === 'fillText' && String(x.args[0]).includes('イシューからはじめよ'));
      expect(title?.fillStyle, layout).toBe('#ffffff');
      expect(c.calls.find((x) => x.op === 'drawImage' && isLogoWord(x.args[0])).args[0].tag).toBe('white-word');
      photoBright = true;
    }
  });
});

describe('描いたあとの重なりで、写真の上の文字は 4.5:1 以上（第 4 回）', () => {
  // 写真の明るさの分布（上 0 → 下 1 の高さ → 相対輝度）。
  const PROFILES = {
    // 明るい写真（白い机）
    bright: () => 0.9,
    // 中くらいの写真: 空は明るく、まとまりのあたりは中くらい、ロゴのあたり（机の下のほう）は暗い
    //（墨の文字に切り替わったまとまりの下の行が、ロゴの黒い幕と重なっていた形）
    medium: (f) => (f < 0.35 ? 0.75 : f < 0.78 ? 0.6 : 0.1),
    // 中くらいの写真の逆: まとまりのあたりが暗く、下が明るい
    mediumInv: (f) => (f < 0.5 ? 0.2 : 0.7),
    // 暗い写真（夜の部屋）
    dark: () => 0.03,
  };
  const ACCENT = '#df8e17';
  for (const [name, profile] of Object.entries(PROFILES)) {
    for (const layout of ['record', 'stats', 'quote', 'magazine']) {
      for (const format of ['story', 'post']) {
        it(`${name} × ${layout} × ${format}`, () => {
          photoProfile = profile;
          try {
            const c = fakeCanvas();
            const r = drawShareCard(c, opts({ layout, format, style: 'photo' }));
            const texts = c.calls.map((k, i) => ({ k, i })).filter(({ k }) => k.op === 'fillText' && String(k.args[0]).trim() && k.fillStyle !== ACCENT);
            expect(texts.length).toBeGreaterThan(3);
            for (const { k, i } of texts) {
              const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(k.font)[1]);
              const baseline = k.args[2];
              const ink = parseColor(k.fillStyle);
              // 文字の箱（上は大きさの 0.8・下は 0.2）の中の何か所かで、いちばん悪いコントラスト
              for (const y of [baseline - size * 0.8, baseline - size * 0.4, baseline, baseline + size * 0.2]) {
                const bg = backgroundAt(c.calls, i, y, r.height, profile);
                const fg = over(ink, bg);
                const lb = lumOf(bg);
                const lf = lumOf(fg);
                const ratio = (Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05);
                expect(ratio, `${name} ${layout} ${format} 「${k.args[0]}」 y=${Math.round(y)} ink=${k.fillStyle} bg=${lb.toFixed(3)}`).toBeGreaterThanOrEqual(4.5);
              }
            }
          } finally {
            photoProfile = null;
          }
        });
      }
    }
  }
});

describe('数字の重ね方', () => {
  it('数字は 3 つとも同じ大きさ（列ごとに縮めない）', () => {
    const canvas = fakeCanvas();
    drawShareCard(canvas, opts({ layout: 'stats', style: 'paper', format: 'story' }));
    const bigs = canvas.calls.filter((c) => c.op === 'fillText' && /^600 /.test(c.font) && /^[0-9]/.test(c.args[0]));
    // 数字は 600（2026-10-08）
    expect(bigs.length).toBeGreaterThanOrEqual(RECORD.stats.length);
    const sizes = new Set(bigs.map((c) => c.font));
    expect(sizes.size).toBe(1);
  });
  it('単位は数字の墨の右端の 2 右に置く（「1件」に空きを作らない）', () => {
    for (const layout of ['record', 'stats']) {
      const canvas = fakeCanvas();
      drawShareCard(canvas, opts({ layout, style: 'paper', record: { ...RECORD, stats: [{ key: 'memos', label: 'メモ', value: '1件' }] } }));
      const texts = canvas.calls.filter((c) => c.op === 'fillText');
      const i = texts.findIndex((c) => c.args[0] === '1' && /^600 /.test(c.font));
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

describe('編集デザイン（2026-10-08 オーナー「おしゃれな感じの写真が出せるように」）', () => {
  // 橙の飾り（傍線・付箋・見出しの点）をやめた: 描いた形にも文字にも橙を使わない（ロゴは画像なので別）。
  it('どの重ね方・地でも、橙の飾りを描かない', () => {
    const accent = /#df8e17|223,\s*142,\s*23/i;
    for (const layout of ['record', 'stats', 'quote', 'magazine']) {
      for (const style of ['photo', 'paper', 'night', 'cover', 'sticker']) {
        for (const format of ['post', 'story']) {
          const canvas = fakeCanvas();
          drawShareCard(canvas, opts({ layout, style, format, kicker: '2026' }));
          const orange = canvas.calls.filter((c) => ['fill', 'fillRect', 'fillText'].includes(c.op) && accent.test(String(c.fillStyle || '')));
          expect(orange.map((c) => c.op), `${layout} ${style} ${format}`).toEqual([]);
        }
      }
    }
  });
  it('複数の著者は … で切らずに「最初の著者 ほか」', () => {
    const many = { ...BOOK, author: 'ジョナサン・ローゼンバーグ、アラン・イーグル、エリック・シュミット' };
    for (const layout of ['record', 'stats', 'quote']) {
      const canvas = fakeCanvas();
      drawShareCard(canvas, opts({ layout, style: 'paper', format: 'post', record: bookRecord(many, [], new Date(2026, 9, 5)), author: many.author }));
      const texts = canvas.calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
      expect(texts.join('|'), layout).toContain('ほか');
      expect(texts.some((t) => t.includes('…')), layout).toBe(false);
    }
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

describe('雑誌（2026-10-09）', () => {
  const LINE = '正解を探すんじゃなくて、自分の問いを持ち続けること。答えはひとつじゃない。むしろ、問いを持ち続けることのほうが、人生を豊かにしてくれる。';
  const mag = (over = {}) => opts({ layout: 'magazine', line: LINE, stamp: '2026.10.09 FRI', ...over });
  const texts = (c) => c.calls.filter((k) => k.op === 'fillText').map((k) => String(k.args[0]));

  it('数字の帯（読書の記録・件数・横線の欄）を描かない', () => {
    for (const style of ['photo', 'paper', 'night', 'cover', 'sticker']) {
      for (const format of ['post', 'story']) {
        const c = fakeCanvas();
        drawShareCard(c, mag({ style, format }));
        const t = texts(c).join('|');
        expect(t, `${style} ${format}`).not.toMatch(/読書の記録|件|実行した行動|メモ/);
        expect(t).toContain('「');
        expect(t).toContain('2026.10.09 FRI');
      }
    }
  });
  it('ロゴは右上（上のほう・右の余白の内側）', () => {
    for (const format of ['post', 'story']) {
      const c = fakeCanvas();
      const r = drawShareCard(c, mag({ format, style: 'paper' }));
      const [, x, y, w, h] = c.calls.find((k) => k.op === 'drawImage' && isLogoWord(k.args[0])).args;
      expect(y + h).toBeLessThan(r.height / 3);
      expect(x).toBeGreaterThan(r.width / 2);
      expect(r.width - (x + w)).toBeGreaterThanOrEqual(LOGO_RULES.minMargin - 0.5);
    }
  });
  it('日付は小さく、隠せる（ロゴの場所は変わらない）・書名と著者を隠すと本のカードごと出さない', () => {
    const on = fakeCanvas();
    drawShareCard(on, mag());
    const stamp = on.calls.find((k) => k.op === 'fillText' && k.args[0] === '2026.10.09 FRI');
    const headSize = Math.max(...on.calls.filter((k) => k.op === 'fillText' && /^(300|400) /.test(k.font)).map((k) => parseFloat(/(\d+)px/.exec(k.font)[1])));
    expect(parseFloat(/(\d+)px/.exec(stamp.font)[1])).toBeLessThan(headSize / 2);
    const off = fakeCanvas();
    drawShareCard(off, mag({ hidden: ['stamp'] }));
    expect(texts(off)).not.toContain('2026.10.09 FRI');
    const logoAt = (c) => c.calls.find((k) => k.op === 'drawImage' && isLogoWord(k.args[0])).args.slice(1);
    expect(logoAt(off)).toEqual(logoAt(on));
    expect(on.calls.some((k) => k.op === 'drawImage' && k.args[0]?.tag === 'cover')).toBe(true);
    const noBook = fakeCanvas();
    drawShareCard(noBook, mag({ hidden: ['title', 'author'] }));
    expect(noBook.calls.some((k) => k.op === 'drawImage' && k.args[0]?.tag === 'cover')).toBe(false);
    expect(texts(noBook)).not.toContain(BOOK.title);
  });
  it('一文が無ければ作らない・共有の文には画像に入れた一文を返す', () => {
    expect(() => drawShareCard(fakeCanvas(), mag({ line: '' }))).toThrow();
    expect(drawShareCard(fakeCanvas(), mag()).line).toBe(LINE);
  });
  it('下の行の短い数の欄（あとで足す読書時間の場所）は、渡したときだけ描く', () => {
    const c = fakeCanvas();
    drawShareCard(c, mag({ note: { label: '読書', value: '1h 32m' } }));
    expect(texts(c)).toContain('読書 1h 32m');
    expect(texts(c)).toContain('YOUR BOOKS, YOUR ADVISOR.');
  });
});
