import { describe, it, expect } from 'vitest';
import { srtTime, toSrt, marksToCues, keepSegments, mapTime, cutCues } from './srt.mjs';

describe('srt', () => {
  it('秒を SRT の時刻にする', () => {
    expect(srtTime(0)).toBe('00:00:00,000');
    expect(srtTime(1.25)).toBe('00:00:01,250');
    expect(srtTime(3723.5)).toBe('01:02:03,500');
    expect(srtTime(-2)).toBe('00:00:00,000');
  });

  it('出す/消すの記録から、重ならない字幕を作る', () => {
    const cues = marksToCues([{ at: 2, text: 'A' }, { at: 5, text: null }, { at: 6, text: 'B' }], 9);
    expect(cues).toEqual([{ start: 2, end: 5, text: 'A' }, { start: 6, end: 9, text: 'B' }]);
  });

  it('頭を切った分だけ前へずらし、0 秒より前は切る', () => {
    const srt = toSrt([{ start: 1, end: 4, text: '題' }, { start: 4, end: 6, text: '次' }], 2);
    expect(srt).toBe('1\n00:00:00,000 --> 00:00:02,000\n題\n\n2\n00:00:02,000 --> 00:00:04,000\n次\n');
  });

  it('長さの無い字幕は捨てる', () => {
    expect(toSrt([{ start: 1, end: 1, text: 'x' }])).toBe('');
  });
});

describe('cuts', () => {
  it('切る区間を除いて残す区間を作る', () => {
    expect(keepSegments(10, [[0, 2], [5, 7]])).toEqual([[2, 5], [7, 10]]);
    expect(keepSegments(10, [[6, 8], [5, 7], [12, 13]])).toEqual([[0, 5], [8, 10]]);
  });

  it('時刻と字幕を切ったあとに直す', () => {
    const seg = keepSegments(10, [[0, 2], [5, 7]]);
    expect(mapTime(3, seg)).toBe(1);
    expect(mapTime(6, seg)).toBe(3);
    expect(mapTime(8, seg)).toBe(4);
    expect(cutCues([{ start: 4, end: 8, text: 'a' }], seg)).toEqual([{ start: 2, end: 4, text: 'a' }]);
  });
});
