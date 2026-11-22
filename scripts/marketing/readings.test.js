import { describe, it, expect } from 'vitest';
import { toReading, unreadDigits, numKana } from './readings.mjs';
import { spokenText } from './voiceCache.mjs';
import { SCENARIOS, openingTitle } from './scenarios.mjs';
import { REELS, END_LINE, END_STORE } from './explainer/reels.mjs';
import { explainerLines } from './explainer/lines.mjs';

// 2026-11-22 オーナー「1 日がツイタチと読まれた。細かい読みミスは徹底して無くしたい・仕組み化して」
describe('声の読みがな', () => {
  it('数と単位は音の変わり方まで決める', () => {
    expect(toReading('1 日')).toBe('いちにち');
    expect(toReading('1 日 15 分')).toBe('いちにちじゅうごふん');
    expect(toReading('1 か月で 7 時間半')).toBe('いっかげつでななじかんはん');
    expect(toReading('3 冊')).toBe('さんさつ');
    expect(toReading('10 分')).toBe('じゅっぷん');
    expect(toReading('1 年後')).toBe('いちねんご');
    expect(toReading('1 つ')).toBe('ひとつ');
    expect(toReading('¥12,800')).toBe('いちまんにせんはっぴゃくえん');
    expect(numKana(3600)).toBe('さんぜんろっぴゃく');
  });
  it('読み違えやすい言葉は辞書で', () => {
    expect(toReading('積読')).toBe('つんどく');
    expect(toReading('① 1 年後の目標を書く')).toBe('ひとつめ、いちねんごの目標を書く');
    expect(toReading('②「達成するには？」に答える')).toBe('ふたつめ、「達成するには？」に答える');
    expect(toReading('何から読む')).toBe('なにから読む');
    expect(toReading('アプリ Orime')).toBe('アプリ オリメ');
  });
  it('台本の声の文に、読みが決まっていない数字が無い', () => {
    const texts = new Set([END_LINE, END_STORE]);
    for (const s of SCENARIOS) { texts.add(openingTitle(s)); for (const st of s.steps || []) if (st.say) texts.add(st.say); }
    for (const r of REELS) for (const l of explainerLines(r)) texts.add(l);
    const bad = [...texts].filter((t) => unreadDigits(spokenText(t)).length);
    expect(bad).toEqual([]);
  });
});
