// ✍️ 共有の画像に入れる「言葉」の層の決めごと（整え方・大きさ・改行・安全な枠）のテスト。canvas は使わない。

import { describe, it, expect } from 'vitest';
import {
  cleanPhrase, newPhrase, phraseFrame, clampPhraseCenter, phraseDisplayText, phraseLayout, phrasePositionFrom,
  phraseColors, phraseCanInvert, clampScale, PHRASE_MAX, PHRASE_STYLES, PHRASE_SCALE_MAX, PHRASE_SCALE_MIN,
  stickerPhraseReserve, STICKER_PAD, PHRASE_STICKER_GAP,
} from './sharePhrase.js';
import { recordFrame } from './shareOverlay.js';

// 字数×大きさ（全角のおおよそ）。
const measureAt = (size) => (s) => Array.from(String(s)).length * size;
const FORMATS = { post: { W: 1080, H: 1350 }, story: { W: 1080, H: 1920 } };

describe('言葉を整える', () => {
  it('空白・改行を整え、80 字まで', () => {
    expect(cleanPhrase('  問いを  見極める \n\n\n 答えは後で ')).toBe('問いを 見極める\n答えは後で');
    expect(Array.from(cleanPhrase('あ'.repeat(200)))).toHaveLength(PHRASE_MAX);
    expect(cleanPhrase(null)).toBe('');
  });
  it('明朝の引用は「」で包む（括弧で始まる言葉はそのまま）・ほかの形は包まない', () => {
    expect(phraseDisplayText({ text: '問いを見極める', style: 'mincho' })).toBe('「問いを見極める」');
    expect(phraseDisplayText({ text: '『本』より', style: 'mincho' })).toBe('『本』より');
    expect(phraseDisplayText({ text: '問いを見極める', style: 'bold' })).toBe('問いを見極める');
    expect(phraseDisplayText({ text: '   ', style: 'mincho' })).toBe('');
  });
  it('最初は上のほうの中央・明朝の引用・倍率 1', () => {
    expect(newPhrase('やってみる')).toEqual({ text: 'やってみる', style: 'mincho', x: 0.5, y: 0.24, scale: 1, invert: false });
    expect(clampScale(9)).toBe(PHRASE_SCALE_MAX);
    expect(clampScale(0.1)).toBe(PHRASE_SCALE_MIN);
  });
});

describe('言葉を置いてよい範囲（4:5 と 9:16）', () => {
  it('記録と同じ安全な枠（ストーリーは上下 270・投稿は左右 80）', () => {
    for (const fmt of ['post', 'story']) {
      const f = recordFrame(fmt);
      const fr = phraseFrame({ ...FORMATS[fmt], format: fmt });
      expect(fr.left).toBe(f.margin);
      expect(fr.right).toBe(f.W - f.margin);
      expect(fr.top).toBe(f.safeTop);
      expect(fr.bottom).toBe(f.safeBottom);
    }
    expect(phraseFrame({ format: 'story', W: 1080, H: 1920 }).top).toBeGreaterThanOrEqual(250);
  });
  it('はみ出す置き方は枠の中へ寄せる', () => {
    const fr = { left: 80, right: 1000, top: 96, bottom: 1278 };
    expect(clampPhraseCenter({ cx: 0, cy: 0, w: 200, h: 100 }, fr)).toEqual({ cx: 180, cy: 146 });
    expect(clampPhraseCenter({ cx: 5000, cy: 5000, w: 200, h: 100 }, fr)).toEqual({ cx: 900, cy: 1228 });
    // 枠より大きい箱は枠の中央
    expect(clampPhraseCenter({ cx: 0, cy: 0, w: 2000, h: 100 }, fr).cx).toBe(540);
  });
});

describe('大きさ・改行・箱', () => {
  const inside = (lay) => {
    expect(lay.x0).toBeGreaterThanOrEqual(lay.frame.left - 0.5);
    expect(lay.x0 + lay.w).toBeLessThanOrEqual(lay.frame.right + 0.5);
    expect(lay.y0).toBeGreaterThanOrEqual(lay.frame.top - 0.5);
    expect(lay.y0 + lay.h).toBeLessThanOrEqual(lay.frame.bottom + 0.5);
  };

  it('どの形・どの大きさ・どの置き方でも、箱は安全な枠の中（4:5・9:16）', () => {
    const long = '問いを見極めてから、答えを出す。解の質より、問いの質が大事だと知った夏。'.repeat(3);
    for (const fmt of ['post', 'story']) {
      for (const style of PHRASE_STYLES) {
        for (const scale of [PHRASE_SCALE_MIN, 1, PHRASE_SCALE_MAX]) {
          for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5], [0.02, 0.98]]) {
            const lay = phraseLayout({ text: long, style, scale, x, y }, { ...FORMATS[fmt], format: fmt, measureAt });
            expect(lay).not.toBeNull();
            inside(lay);
            // 行は枠の幅に収まる
            for (const l of lay.lines) expect(measureAt(lay.size)(l)).toBeLessThanOrEqual(lay.frame.right - lay.frame.left);
          }
        }
      }
    }
  }, 30000);
  it('短い言葉は 1 行・大きくすると大きく', () => {
    const a = phraseLayout({ text: 'やってみる', style: 'bold', scale: 1 }, { ...FORMATS.post, format: 'post', measureAt });
    const b = phraseLayout({ text: 'やってみる', style: 'bold', scale: 1.5 }, { ...FORMATS.post, format: 'post', measureAt });
    expect(a.lines).toEqual(['やってみる']);
    expect(b.size).toBeGreaterThan(a.size);
  });
  it('長い言葉は文節の切れ目で折り返す（語の途中で割らない）', () => {
    const lay = phraseLayout({ text: '問いを見極めてから答えを出すことにした', style: 'bold', scale: 1.8 }, { ...FORMATS.post, format: 'post', measureAt });
    expect(lay.lines.length).toBeGreaterThan(1);
    expect(lay.lines.join('')).toBe('問いを見極めてから答えを出すことにした');
    // 「見極め／て」のように助詞の前では割らない
    for (const l of lay.lines) expect(/^[てをがにはのへとでもからまで]/.test(l)).toBe(false);
  });
  it('中央にそろえる言葉は行の長さもそろえる（最後の行だけ短くしない）', () => {
    const lay = phraseLayout({ text: '問いの質が、答えの質を決める。', style: 'mincho', scale: 1.4 }, { ...FORMATS.post, format: 'post', measureAt });
    expect(lay.lines.length).toBe(2);
    const w = lay.lines.map((l) => Array.from(l).length);
    expect(Math.min(...w) / Math.max(...w)).toBeGreaterThan(0.6);
  });
  it('読点の後ろで改行できるなら、そこで改行する', () => {
    const lay = phraseLayout({ text: '問いの質が、答えの質を決める。', style: 'bold', scale: 1.2 }, { ...FORMATS.post, format: 'post', measureAt });
    expect(lay.lines).toEqual(['問いの質が、', '答えの質を決める。']);
    const m = phraseLayout({ text: '問いの質が、答えの質を決める。', style: 'mincho', scale: 1.4 }, { ...FORMATS.post, format: 'post', measureAt });
    expect(m.lines).toEqual(['「問いの質が、', '答えの質を決める。」']);
  });
  it('帯は文字の周りに余白、明朝の引用は傍線のぶん下に余白', () => {
    const band = phraseLayout({ text: '読む', style: 'band' }, { ...FORMATS.post, format: 'post', measureAt });
    expect(band.padX).toBeGreaterThan(0);
    expect(band.w).toBe(measureAt(band.size)('読む') + band.padX * 2);
    const mincho = phraseLayout({ text: '読む', style: 'mincho' }, { ...FORMATS.post, format: 'post', measureAt });
    expect(mincho.underlineH).toBeGreaterThan(0);
    expect(mincho.h).toBe(mincho.lineHeight + mincho.underlineH);
  });
  it('透明: 言葉は上の言葉の場所だけ（記録・一文の塊に重ならない）', () => {
    for (const style of PHRASE_STYLES) {
      for (const scale of [PHRASE_SCALE_MIN, 1, PHRASE_SCALE_MAX]) {
        for (const [x, y] of [[0, 0], [1, 1], [0.5, 0.5], [0, 0.98]]) {
          const lay = phraseLayout({ text: '問いの質が、答えの質を決める。', style, scale, x, y }, { W: 1080, H: 900, sticker: true, measureAt });
          inside(lay);
          // 言葉の場所＝上 72 から言葉の高さまで。置き方に関係なく、その場所の真ん中
          expect(lay.frame).toEqual({ left: 72, right: 1008, top: 72, bottom: 72 + lay.h });
          expect(lay.cy).toBe(72 + lay.h / 2);
          // 記録の塊はその下（言葉の高さ＋56）から始まる＝言葉の箱の下より下
          const recordTop = STICKER_PAD + stickerPhraseReserve(lay.h);
          expect(lay.y0 + lay.h).toBeLessThanOrEqual(recordTop - PHRASE_STICKER_GAP + 0.5);
        }
      }
    }
    // 画像の高さが変わっても（記録の中身が変わっても）言葉の大きさは同じ
    const a = phraseLayout({ text: 'やってみる', style: 'bold' }, { W: 1080, H: 400, sticker: true, measureAt });
    const b = phraseLayout({ text: 'やってみる', style: 'bold' }, { W: 1080, H: 2000, sticker: true, measureAt });
    expect(a.size).toBe(b.size);
    expect(phraseFrame({ sticker: true, W: 1080, H: 900, phraseH: 120 })).toEqual({ left: 72, right: 1008, top: 72, bottom: 192 });
    expect(stickerPhraseReserve(0)).toBe(0);
    expect(stickerPhraseReserve(120)).toBe(120 + PHRASE_STICKER_GAP);
  });
  it('置き方（0〜1）へ戻すときも枠の中', () => {
    const lay = phraseLayout({ text: 'やってみる', style: 'bold' }, { ...FORMATS.story, format: 'story', measureAt });
    const pos = phrasePositionFrom({ cx: -500, cy: 99999 }, lay, FORMATS.story);
    const again = phraseLayout({ text: 'やってみる', style: 'bold', ...pos }, { ...FORMATS.story, format: 'story', measureAt });
    inside(again);
    expect(Math.abs(pos.y * 1920 - again.cy)).toBeLessThan(1);
  });
  it('言葉が空なら描かない', () => {
    expect(phraseLayout({ text: '' }, { ...FORMATS.post, measureAt })).toBeNull();
  });
});

describe('文字の色（自動・1 タップで入れ替え）', () => {
  it('写真・夜・表紙の色・透明は白、紙は墨', () => {
    for (const ground of ['photo', 'night', 'cover', 'sticker']) expect(phraseColors({ ground }).ink).toBe('light');
    expect(phraseColors({ ground: 'paper' }).ink).toBe('dark');
    expect(phraseColors({ ground: 'photo', invert: true }).ink).toBe('dark');
  });
  it('白抜きの帯はどの地でも暗い帯に白い文字・入れ替えで明るい帯に墨の文字', () => {
    expect(phraseColors({ ground: 'photo', style: 'band' })).toEqual({ ink: 'light', band: 'dark' });
    expect(phraseColors({ ground: 'paper', style: 'band' })).toEqual({ ink: 'light', band: 'dark' });
    expect(phraseColors({ ground: 'photo', style: 'band', invert: true })).toEqual({ ink: 'dark', band: 'light' });
  });
  it('入れ替えが効くのは写真の上の文字と帯だけ（紙・夜では読めなくなるので効かない）', () => {
    expect(phraseCanInvert({ ground: 'photo', style: 'bold' })).toBe(true);
    expect(phraseCanInvert({ ground: 'paper', style: 'bold' })).toBe(false);
    expect(phraseCanInvert({ ground: 'night', style: 'band' })).toBe(true);
    expect(phraseColors({ ground: 'paper', style: 'mincho', invert: true }).ink).toBe('dark');
    expect(phraseColors({ ground: 'night', style: 'mincho', invert: true }).ink).toBe('light');
  });
});
