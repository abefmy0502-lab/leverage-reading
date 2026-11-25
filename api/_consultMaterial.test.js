import { describe, it, expect } from 'vitest';
import { stripBookSummaries } from './_consultMaterial.js';

describe('stripBookSummaries', () => {
  it('読んだ本の紹介の塊を外す', () => {
    const t = 'A\n===== EARLY_SHELF_START =====\n『考え方』紹介: …\n===== EARLY_SHELF_END =====\nB';
    expect(stripBookSummaries(t)).toBe('A\nB');
  });
  it('AI が作った本のまとめの行を外し、ほかのメモは残す', () => {
    const t = '【本: 考え方 / 著者: 稲盛和夫 / p.12】朝に決める\n【本: 考え方 / 著者: 稲盛和夫 / 種別: AI 解析（著者の意図・主な主張）】著者は…\n二行目\n【本: 7つの習慣 / 種別: 仮説】終わりから';
    const out = stripBookSummaries(t);
    expect(out).toContain('朝に決める');
    expect(out).toContain('終わりから');
    expect(out).not.toContain('著者は…');
    expect(out).not.toContain('二行目');
  });
  it('読書計画シートの行も外す', () => {
    const t = '【本: イシューからはじめよ / 種別: 読書計画シート】## 📖 この本の概要 世の中で…\n【本: イシューからはじめよ / p.3】自分のメモ';
    const out = stripBookSummaries(t);
    expect(out).not.toContain('この本の概要');
    expect(out).toContain('自分のメモ');
  });
  it('どちらも無ければそのまま', () => {
    expect(stripBookSummaries('ふつうの相談')).toBe('ふつうの相談');
  });
});

describe('選書理由の中の AI の「この本の核心」', () => {
  it('その行だけを外し、本人の理由は残す', () => {
    const t = '【本: 考え方 / 種別: 選書理由】チームの迷いを減らしたい\nこの本の核心: 人生の結果は考え方で決まる\n【本: 考え方 / 種別: 仮説】決める基準を1つにする';
    const out = stripBookSummaries(t);
    expect(out).not.toContain('この本の核心');
    expect(out).toContain('チームの迷いを減らしたい');
    expect(out).toContain('決める基準を1つにする');
  });
});
