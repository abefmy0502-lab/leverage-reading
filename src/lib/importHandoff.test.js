import { describe, it, expect } from 'vitest';
import { importHandoffText } from './importHandoff';

describe('引越しの「パソコンで続ける」（2026-11-27）', () => {
  it('3 つのアプリの手順と 2 つのコード、iPhone へ戻す方法を 1 つの文に', () => {
    const t = importHandoffText({ bookmeter: 'javascript:BM', kindle: 'javascript:KD' });
    expect(t).toContain('ブクログ');
    expect(t).toContain('javascript:BM');
    expect(t).toContain('javascript:KD');
    expect(t).toContain('read.amazon.co.jp/notebook');
    expect(t).toContain('ファイルを選ぶ');
    expect(t).toContain('My Clippings.txt');
    expect(t).not.toMatch(/Orime|ORIME/);
  });
});
