import { describe, it, expect } from 'vitest';
import { displayTitle } from './bookTitle';

describe('displayTitle', () => {
  it('並列書名と副題を外す', () => {
    expect(displayTitle('イシューからはじめよ ＝ ISSUE DRIVEN+ : 知的生産の「シンプルな本質」')).toBe('イシューからはじめよ');
    expect(displayTitle('嫌われる勇気：自己啓発の源流「アドラー」の教え')).toBe('嫌われる勇気');
    expect(displayTitle('考え方 — 人生・仕事の結果が変わる')).toBe('考え方');
  });
  it('区切りの無い書名・空白だけの副題はそのまま', () => {
    expect(displayTitle('エッセンシャル思考 最少の時間で成果を最大にする')).toBe('エッセンシャル思考 最少の時間で成果を最大にする');
    expect(displayTitle('LIFE SHIFT')).toBe('LIFE SHIFT');
    expect(displayTitle('7=3の法則')).toBe('7=3の法則');
    expect(displayTitle('A：B')).toBe('A：B');
    expect(displayTitle('Re：ゼロから始める異世界生活')).toBe('Re：ゼロから始める異世界生活');
    expect(displayTitle('Dr.：外科医の記録')).toBe('Dr.：外科医の記録');
    expect(displayTitle('')).toBe('');
  });
});
