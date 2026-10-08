// 写真で共有の見た目の決まり（2026-10-08・オーナー「おしゃれな意識高い人間が使いたくなるように」）。
import { describe, it, expect } from 'vitest';
import { formatAuthors, splitAuthors, fmtDotDate, bookRecord } from './shareOverlay';
import { filmTone, filmGrain, FILM } from './shareCardLayout';

describe('著者の書き方（複数なら「最初の著者 ほか」）', () => {
  it('区切り（、, / &）と、漢字の名前どうしの「・」で分ける', () => {
    expect(formatAuthors('岸見一郎・古賀史健')).toBe('岸見一郎 ほか');
    expect(formatAuthors('ジョナサン・ローゼンバーグ、アラン・イーグル')).toBe('ジョナサン・ローゼンバーグ ほか');
    expect(formatAuthors('Daniel Kahneman / Amos Tversky')).toBe('Daniel Kahneman ほか');
    expect(formatAuthors('A & B')).toBe('A ほか');
  });
  it('カタカナの名前の中の「・」では切らない・役割は外す', () => {
    expect(formatAuthors('エリック・シュミット')).toBe('エリック・シュミット');
    expect(formatAuthors('D・カーネギー')).toBe('D・カーネギー');
    expect(formatAuthors('安宅和人（著）')).toBe('安宅和人');
    expect(splitAuthors('')).toEqual([]);
  });
  it('本の記録の 2 行目にも使う', () => {
    expect(bookRecord({ title: 'X', author: '岸見一郎・古賀史健', status: 'done' }, []).sub).toBe('岸見一郎 ほか');
  });
});

describe('日付は「9.28」の点の書き方（右下の 2026.10.9 とそろえる）', () => {
  const now = new Date(2026, 9, 9);
  it('今年は月.日・去年は年.月.日', () => {
    expect(fmtDotDate('2026-09-28', now)).toBe('9.28');
    expect(fmtDotDate('2025-12-31', now)).toBe('2025.12.31');
    expect(fmtDotDate('', now)).toBe('');
  });
});

describe('フィルム（写真の色を端末の中で整える）', () => {
  const px = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);
  it('彩度を落とし、黒を持ち上げ、温かくする', () => {
    const red = filmTone(px(255, 0, 0), 1, 1);
    expect(red[0]).toBeLessThan(255);
    expect(red[1]).toBeGreaterThan(0); // 彩度が落ちて緑が入る
    const black = filmTone(px(0, 0, 0), 1, 1, { ...FILM, grain: 0 });
    expect(black[1]).toBeGreaterThanOrEqual(FILM.lift); // 黒が持ち上がる
    const gray = filmTone(px(128, 128, 128), 1, 1, { ...FILM, grain: 0 });
    expect(gray[0]).toBeGreaterThan(gray[2]); // 温かい（赤 > 青）
  });
  it('四隅はわずかに暗い', () => {
    const w = 5;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4).fill(200);
    filmTone(data, w, h, { ...FILM, grain: 0 });
    const at = (x, y) => data[(y * w + x) * 4 + 1];
    expect(at(0, 0)).toBeLessThan(at(2, 2));
  });
});

describe('フィルムは写真と見分けられる強さ（第 4 回）', () => {
  it('彩度は 0.65 以下・黒の持ち上げは 28 前後・粒がある', () => {
    expect(FILM.saturation).toBeLessThanOrEqual(0.65);
    expect(FILM.lift).toBeGreaterThanOrEqual(26);
    expect(FILM.grain).toBeGreaterThan(0);
  });
  it('粒は位置で決まる（同じ写真は同じ粒）・幅は -0.5〜0.5', () => {
    expect(filmGrain(10, 20)).toBe(filmGrain(10, 20));
    const vals = Array.from({ length: 200 }, (_, i) => filmGrain(i, i * 3));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...vals)).toBeLessThan(0.5);
    expect(new Set(vals.map((v) => v.toFixed(2))).size).toBeGreaterThan(20);
  });
  it('鮮やかな色は目に見えて落ち着く（赤と緑の差が 3 割以上縮む）', () => {
    const d = filmTone(new Uint8ClampedArray([220, 60, 40, 255]), 1, 1, { ...FILM, grain: 0 });
    expect(d[0] - d[1]).toBeLessThan((220 - 60) * 0.7);
  });
});
