import { describe, it, expect } from 'vitest';
import { parseSrt, spokenText } from './voice.mjs';

describe('声（ナレーション）', () => {
  it('SRT を秒の時刻と文に分ける', () => {
    const cues = parseSrt('1\n00:00:02,500 --> 00:00:04,000\n家の本棚、\n全部入れるのは大変\n\n2\n00:00:04,000 --> 00:00:06,250\n本棚の写真から\n');
    expect(cues).toEqual([
      { start: 2.5, end: 4, text: '家の本棚、全部入れるのは大変' },
      { start: 4, end: 6.25, text: '本棚の写真から' },
    ]);
  });
  it('読み上げ用に、矢印・改行を区切りに・数と言葉を読みがなに', () => {
    expect(spokenText('本棚の記録、3 冊で止まっていた\n↓\n1 枚撮って、\nまとめて本棚へ')).toBe('ほんだなの記録、さんさつで止まっていた。いちまい撮って、まとめてほんだなへ');
    expect(spokenText('App Store で「orime」')).toBe('アップストア で「オリメ」');
  });
});
