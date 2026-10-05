// 🖼 一文カード（シェア画像）の決めごと（純関数）のテスト。canvas は使わない。
// 文字の幅は「1 字＝大きさ」の等幅で測る（改行位置の決まり方だけを確かめる）。

import { describe, it, expect } from 'vitest';
import {
  clampLine, segmentPhrases, wrapBalanced, wrapCost, hasOrphan, fitQuote, orderLineCandidates,
  buildShareText, shareFilename, coverTone, contrastRatio, photoPlacement, panView, zoomView,
  scrimAlpha, brightLuminance, coverProxyPath, seedFrom, mulberry32, underlineStroke, tabPosition, FORMATS,
  darkLuminance, logoInkOnPhoto, coverWashAlpha, relativeLuminance,
} from './shareCardLayout.js';

const mono = (size = 1) => (s) => Array.from(s).length * size;

describe('clampLine', () => {
  it('120 字までならそのまま（空白は整える）', () => {
    expect(clampLine('  読むほど、  相談相手が育つ。 ')).toEqual({ text: '読むほど、 相談相手が育つ。', trimmed: false });
  });
  it('長いときは後ろ半分の文の切れ目で止める', () => {
    const s = `${'あ'.repeat(80)}。${'い'.repeat(60)}`;
    const r = clampLine(s);
    expect(r.trimmed).toBe(true);
    expect(r.text).toBe(`${'あ'.repeat(80)}。`);
  });
  it('切れ目が無ければ 119 字＋「…」', () => {
    const r = clampLine('う'.repeat(200));
    expect(Array.from(r.text)).toHaveLength(120);
    expect(r.text.endsWith('…')).toBe(true);
  });
  it('連続した改行は 1 つに', () => {
    expect(clampLine('一行目\n\n\n二行目').text).toBe('一行目\n二行目');
  });
});

describe('segmentPhrases（改行してよい位置）', () => {
  it('つなげると元の文に戻る', () => {
    const s = '答えを出す前に「本当に答えるべき問い（イシュー）」かを確かめる。';
    expect(segmentPhrases(s).join('')).toBe(s);
  });
  it('助詞のあとで区切る・複合語（取り組む・読み終える）は割らない', () => {
    const p = segmentPhrases('問いに取り組んでいる。そして読み終えたら');
    expect(p).toContain('問いに');
    expect(p.some((x) => x.startsWith('取り組ん'))).toBe(true);
    expect(p).toContain('読み終えたら');
  });
  it('句読点・閉じ括弧・小さいかなを行頭にしない', () => {
    for (const ph of segmentPhrases('「全部やる」はできない。やらないことを決める、ちょっとした工夫')) {
      expect(/^[、。」』）ぁぃぅぇぉっゃゅょー]/.test(ph)).toBe(false);
    }
  });
  it('英単語・数字は途中で割らない', () => {
    expect(segmentPhrases('毎週3件、KPIを見る')).toEqual(['毎週3件、', 'KPIを', '見る']);
    expect(segmentPhrases('LIFE SHIFTを読む').join('|')).not.toMatch(/LIF\|E/);
  });
  it('閉じ括弧のすぐ後ろのひらがなは括弧から離さない', () => {
    expect(segmentPhrases('本当に解くべき問い（イシュー）かを確かめる').join('|')).not.toMatch(/）\|か/);
    expect(segmentPhrases('『嫌われる勇気』を読む').join('|')).not.toMatch(/』\|を/);
  });
});

describe('wrapBalanced', () => {
  it('行の長さをそろえ、最後の行が 1〜2 字だけにならない', () => {
    const lines = wrapBalanced('「全部やる」はできない。やらないことを決めることが、いちばん大事な仕事。', 14, mono());
    expect(lines.join('')).toBe('「全部やる」はできない。やらないことを決めることが、いちばん大事な仕事。');
    expect(hasOrphan(lines)).toBe(false);
    for (const l of lines) expect(Array.from(l).length).toBeLessThanOrEqual(14);
  });
  it('1 行に入らない長いまとまりは文字で割る', () => {
    const lines = wrapBalanced('ああああああああああああああああ', 5, mono());
    expect(lines.every((l) => Array.from(l).length <= 5)).toBe(true);
  });
  it('明示の改行は段落として残す', () => {
    expect(wrapBalanced('一行目\n二行目', 20, mono())).toEqual(['一行目', '二行目']);
  });
});

describe('fitQuote', () => {
  it('枠に収まるいちばん大きな大きさを選ぶ', () => {
    const r = fitQuote('読むほど、自分だけの相談相手が育つ。', {
      maxWidth: 400, maxHeight: 200, sizes: [80, 60, 40, 20], lineHeight: 1.5, measureAt: (size) => mono(size),
    });
    expect(r.lines.length * r.lineHeight).toBeLessThanOrEqual(200);
    expect(r.size).toBe(40);
  });
  it('どれも収まらなければいちばん小さい大きさ', () => {
    const r = fitQuote('あ'.repeat(120), { maxWidth: 100, maxHeight: 10, sizes: [40, 20], lineHeight: 1.5, measureAt: (size) => mono(size) });
    expect(r.size).toBe(20);
  });
});

describe('orderLineCandidates', () => {
  const memos = [
    { id: 'a', text: '古いページなし', createdAt: '2026-01-01' },
    { id: 'b', text: 'ページ 10', pageNumber: 10, createdAt: '2026-02-01' },
    { id: 'c', text: '新しいページなし', createdAt: '2026-03-01' },
    { id: 'd', text: 'ページ 99', pageNumber: 99, createdAt: '2026-03-02' },
    { id: 'e', text: '   ', pageNumber: 5, createdAt: '2026-04-01' },
  ];
  it('本文の無いメモは除き、ページつき → 新しい順', () => {
    expect(orderLineCandidates(memos).map((m) => m.id)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('メモの「…」から開いたメモを先頭に', () => {
    expect(orderLineCandidates(memos, 'a').map((m) => m.id)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('buildShareText / shareFilename', () => {
  it('『書名』より＋一文＋#Orime＋URL（数字・日付は入れない）', () => {
    expect(buildShareText({ title: 'イシューからはじめよ', line: '問いを確かめる。', siteUrl: 'https://orime.vercel.app' }))
      .toBe('『イシューからはじめよ』より\n問いを確かめる。\n#Orime\nhttps://orime.vercel.app');
  });
  it('ファイル名に書名を入れない', () => {
    const name = shareFilename({ format: 'post', style: 'night', now: new Date(2026, 8, 27, 9, 5) });
    expect(name).toBe('orime-post-night-20260927-0905.png');
  });
});

describe('coverTone', () => {
  it('白い文字と 7:1 以上の落ち着いた色', () => {
    const tone = coverTone([[250, 240, 220], [31, 95, 91], [31, 95, 91], [255, 255, 255]]);
    expect(contrastRatio(tone, [255, 255, 255])).toBeGreaterThanOrEqual(7);
  });
  it('画素が無ければ null', () => {
    expect(coverTone([])).toBeNull();
  });
});

describe('写真の位置', () => {
  const dims = { pw: 1600, ph: 1200, W: 1080, H: 1920 };
  it('枠いっぱいに敷く（隙間ができない）', () => {
    const p = photoPlacement(dims);
    expect(p.w).toBeGreaterThanOrEqual(1080);
    expect(p.h).toBeGreaterThanOrEqual(1920);
    expect(p.x).toBeLessThanOrEqual(0);
    expect(p.x + p.w).toBeGreaterThanOrEqual(1080);
  });
  it('ずらしても枠からはみ出さない（端で止まる）', () => {
    let v = { panX: 0, panY: 0, zoom: 1 };
    v = panView(v, 99999, 99999, dims);
    expect(v.panX).toBe(1);
    expect(v.panY).toBe(0); // 縦には余りが無いので動かない
    const p = photoPlacement({ ...dims, ...v });
    expect(p.x).toBeLessThanOrEqual(0);
  });
  it('拡大は 1〜4 倍', () => {
    expect(zoomView({ zoom: 1 }, 0.1).zoom).toBe(1);
    expect(zoomView({ zoom: 3 }, 10).zoom).toBe(4);
  });
});

describe('scrimAlpha / brightLuminance', () => {
  it('明るい写真ほど幕が濃い（0.3〜0.82）', () => {
    expect(scrimAlpha(0)).toBe(0.3);
    expect(scrimAlpha(0.9)).toBeGreaterThan(scrimAlpha(0.4));
    expect(scrimAlpha(1)).toBeLessThanOrEqual(0.82);
  });
  it('幕をかけた後の明るさが白い文字と 4.5:1 以上になる濃さ（上限に届かない範囲）', () => {
    const L = 0.5;
    const a = scrimAlpha(L);
    const after = L * (1 - a);
    expect(1.05 / (after + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
  it('明るい画素寄りの輝度', () => {
    expect(brightLuminance([[0, 0, 0], [255, 255, 255]])).toBeCloseTo(1, 2);
    expect(brightLuminance([])).toBe(0);
  });
});

describe('ロゴの色（写真の上にロゴしか無いとき）・表紙の色の地の濃さ（2026-10-05）', () => {
  it('暗い画素寄りの輝度', () => {
    expect(darkLuminance([[0, 0, 0], [255, 255, 255]])).toBe(0);
    expect(darkLuminance([[255, 255, 255]])).toBeCloseTo(1, 2);
    expect(darkLuminance([])).toBe(0);
  });
  it('明るい写真は元の色（焦げ茶の文字と 4.5:1 以上）・ほかは白＋幕', () => {
    expect(logoInkOnPhoto({ bright: 1, dark: 0.9 })).toEqual({ logo: 'color', scrim: 0 });
    // 焦げ茶（#2b2825）と、元の色を選ぶいちばん暗い写真のコントラスト
    const ink = relativeLuminance([43, 40, 37]);
    expect((0.3 + 0.05) / (ink + 0.05)).toBeGreaterThanOrEqual(4.5);
    const mixed = logoInkOnPhoto({ bright: 0.9, dark: 0.1 });
    expect(mixed.logo).toBe('white');
    expect(mixed.scrim).toBe(scrimAlpha(0.9));
    expect(logoInkOnPhoto({ bright: 0.05, dark: 0 })).toEqual({ logo: 'white', scrim: 0.3 });
  });
  it('ぼかした表紙に重ねる色の濃さ: 白い文字と 4.5:1 以上（明るい表紙ほど濃く・最低 0.55）', () => {
    const bg = 0.08;
    for (const img of [0, 0.2, 0.5, 0.8, 1]) {
      const a = coverWashAlpha(img, bg);
      expect(a).toBeGreaterThanOrEqual(0.55);
      expect(a).toBeLessThanOrEqual(1);
      const after = a * bg + (1 - a) * img; // 線形に混ぜた明るさ（sRGB で混ぜる実際はこれより暗い）
      expect(1.05 / (after + 0.05), `img=${img}`).toBeGreaterThanOrEqual(4.5 - 1e-6);
    }
    expect(coverWashAlpha(1, bg)).toBeGreaterThan(coverWashAlpha(0.5, bg));
  });
});

describe('coverProxyPath', () => {
  it('外部の表紙は自前の中継へ（http は https に）', () => {
    expect(coverProxyPath('http://books.google.com/books/content?id=x&img=1')).toEqual({
      direct: false,
      src: `/api/cover-image?url=${encodeURIComponent('https://books.google.com/books/content?id=x&img=1')}`,
    });
  });
  it('data: / 同じサイトはそのまま・変な URL は null', () => {
    expect(coverProxyPath('data:image/svg+xml,<svg/>').direct).toBe(true);
    expect(coverProxyPath('/icons/a.png').direct).toBe(true);
    expect(coverProxyPath('https://orime.vercel.app/x.png', 'https://orime.vercel.app').direct).toBe(true);
    expect(coverProxyPath('javascript:alert(1)')).toBeNull();
    expect(coverProxyPath('')).toBeNull();
  });
});

describe('傍線（メモごとに決まる手描きの線）', () => {
  it('同じメモは同じ線・違うメモは違う線', () => {
    const a1 = underlineStroke({ x0: 100, x1: 800, y: 500, weight: 14, seed: seedFrom('memo-1|一文') });
    const a2 = underlineStroke({ x0: 100, x1: 800, y: 500, weight: 14, seed: seedFrom('memo-1|一文') });
    const b = underlineStroke({ x0: 100, x1: 800, y: 500, weight: 14, seed: seedFrom('memo-2|一文') });
    expect(a1).toEqual(a2);
    expect(a1.top).not.toEqual(b.top);
  });
  it('両端は細く、少しはみ出す（線の幅は太さの範囲に収まる）', () => {
    const s = underlineStroke({ x0: 100, x1: 800, y: 500, weight: 14, seed: 42 });
    expect(s.top[0][0]).toBeLessThan(100);
    expect(s.top[s.top.length - 1][0]).toBeGreaterThan(800);
    expect(s.capStart[2]).toBeLessThan(14 / 2);
    const mid = Math.floor(s.top.length / 2);
    const widthMid = s.bottom[s.bottom.length - 1 - mid][1] - s.top[mid][1];
    expect(widthMid).toBeGreaterThan(14 * 0.5);
    expect(widthMid).toBeLessThanOrEqual(14 * 1.01);
  });
  it('乱数は種で決まる', () => {
    const r1 = mulberry32(7); const r2 = mulberry32(7);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe('tabPosition（付箋の高さ）', () => {
  it('ページ / 総ページ（上 0・下 1）', () => {
    expect(tabPosition(1, 240)).toBe(0);
    expect(tabPosition(240, 240)).toBe(1);
    expect(tabPosition(120, 240)).toBeCloseTo(119 / 239, 5);
  });
  it('総ページが分からなければ、分かっている最大のページ か ページ＋50', () => {
    expect(tabPosition(100, null, 300)).toBeCloseTo(99 / 299, 5);
    expect(tabPosition(100, null, 0)).toBeCloseTo(99 / 149, 5);
  });
  it('ページの無いメモは付箋を出さない', () => {
    expect(tabPosition(null, 240)).toBeNull();
    expect(tabPosition(0, 240)).toBeNull();
  });
});

describe('FORMATS', () => {
  it('幅はどれも 1080（ストーリー 9:16・投稿 4:5・正方形 1:1）', () => {
    expect(FORMATS.story).toEqual({ w: 1080, h: 1920 });
    expect(FORMATS.post).toEqual({ w: 1080, h: 1350 });
    expect(FORMATS.square).toEqual({ w: 1080, h: 1080 });
  });
});

describe('改行の選び方（文の切れ目・短い行・ぶら下がり）', () => {
  const t = '分析の前にストーリーラインと絵コンテを作る。どんなグラフがあれば結論を言えるかを先に考える。';
  it('幅に余裕があれば「。」の直後で改行し、次の文の書き出しを行末にぶら下げない', () => {
    const lines = wrapBalanced(t, 15, mono());
    expect(lines.join('')).toBe(t);
    expect(lines.some((l) => l.endsWith('作る。'))).toBe(true);
    expect(lines.some((l) => /。どんな$/.test(l))).toBe(false);
  });
  it('1 行目が「分析の前に」だけになる大きさは避け、少し小さくして「作る。」の後ろで改行する', () => {
    // ストーリー・紙の枠（幅 856・一文に使える高さ 724）に近い条件。
    const r = fitQuote(t, {
      maxWidth: 856, maxHeight: 724, sizes: [92, 84, 76, 70, 64, 60, 56, 52, 48, 44], lineHeight: 1.62, measureAt: (size) => mono(size),
    });
    expect(r.lines.join('')).toBe(t);
    expect(r.lines[0]).not.toBe('分析の前に');
    expect(r.lines.some((l) => l.endsWith('作る。'))).toBe(true);
    expect(r.lines.some((l) => /。.+$/.test(l))).toBe(false);
    expect(r.lines.length * r.lineHeight).toBeLessThanOrEqual(724);
  });
  it('wrapCost: 文の切れ目で改行した組み方のほうが小さい', () => {
    const good = ['分析の前にストーリーラインと', '絵コンテを作る。', 'どんなグラフがあれば結論を', '言えるかを先に考える。'];
    const bad = ['分析の前に', 'ストーリーラインと', '絵コンテを作る。どんな', 'グラフがあれば結論を', '言えるかを先に考える。'];
    expect(wrapCost(good, mono())).toBeLessThan(wrapCost(bad, mono()));
  });
});

describe('fitQuote（短い一文）', () => {
  it('少し小さくすれば 1 行に入る短い一文は、1 行で組む', () => {
    const measureAt = (size) => (t) => Array.from(t).length * size;
    const text = 'チームの勝利が最優先。'; // 11 字
    const r = fitQuote(text, { maxWidth: 900, maxHeight: 1000, sizes: [96, 88, 80, 72], measureAt });
    expect(r.lines).toEqual([text]);
    expect(r.size).toBe(80);
  });
});
