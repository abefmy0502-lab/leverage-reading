import { describe, it, expect } from 'vitest';
import { parseAnswer } from './MyBookBrain';

const sample = [
  '【結論】',
  '結論の一文です。',
  '',
  '【参照した本のメモ】',
  '- 『A』のメモ：「一」',
  '',
  '【あなたの状況に合わせた解釈】',
  '解釈です。',
  '',
  '【明日からできる 1 つの行動】',
  '明日の朝、10 分で書き出す。',
  '',
  '（お試しモードの応答です）',
  '',
  '（参照: 3/10 件、内訳: カード 3 / まとめ 0 / 学び 0）',
].join('\n');

describe('parseAnswer', () => {
  it('結論・根拠・解釈・一歩に分ける', () => {
    const p = parseAnswer(sample);
    expect(p.conclusion).toBe('結論の一文です。');
    expect(p.refs).toContain('『A』');
    expect(p.interp).toBe('解釈です。');
    expect(p.action).toBe('明日の朝、10 分で書き出す。');
    expect(p.actionLabel).toBe('明日からできる一歩');
  });
  it('一歩の後ろの補足は note に回し、内部向けの参照件数は出さない', () => {
    const p = parseAnswer(sample);
    expect(p.note).toContain('お試しモード');
    expect(p.note).not.toContain('参照: 3/10');
    expect(p.action).not.toContain('参照');
  });
  it('「心に残るもの」の見出しはそのままラベルにする', () => {
    const p = parseAnswer('【結論】\nx\n\n【心に残るもの】\n一節');
    expect(p.action).toBe('一節');
    expect(p.actionLabel).toBe('心に残るもの');
  });
  it('見出しが無ければ null', () => {
    expect(parseAnswer('回答を生成できませんでした。')).toBeNull();
  });
});

// 🎯 行動は会話で決める（2026-09-30）: 最初の答えは【あなたに聞きたいこと】で終わる。
describe('parseAnswer（あなたに聞きたいこと）', () => {
  const ask = [
    '【結論】',
    '結論です。',
    '',
    '【参照した本のメモ】',
    '- 『A』のメモ：「一」',
    '',
    '【あなたの状況に合わせた解釈】',
    '解釈です。',
    '',
    '【あなたに聞きたいこと】',
    '報告が遅れるのは、どんな場面が多いですか？',
    '・会議の前',
    '・急ぎの仕事のとき',
    '',
    '（お試しモードの応答です）',
  ].join('\n');
  it('問いと候補に分け、行動は無い', () => {
    const p = parseAnswer(ask);
    expect(p.question).toBe('報告が遅れるのは、どんな場面が多いですか？');
    expect(p.replies).toEqual(['会議の前', '急ぎの仕事のとき']);
    expect(p.action).toBe('');
    expect(p.interp).toBe('解釈です。');
  });
  it('候補の後ろの段落は note へ（問いにも候補にも混ぜない）', () => {
    expect(parseAnswer(ask).note).toBe('（お試しモードの応答です）');
  });
  it('書いている途中（候補がまだ）は問いだけ', () => {
    const p = parseAnswer('【結論】\nx\n\n【あなたに聞きたいこと】\n報告が遅れるのは');
    expect(p.question).toBe('報告が遅れるのは');
    expect(p.replies).toEqual([]);
  });
  it('前の形の答え（一歩つき）は question が空で action のまま（行動に追加を出せる）', () => {
    const p = parseAnswer('【結論】\nx\n\n【明日からできる 1 つの行動】\n始業前の 10 分で書き出す。');
    expect(p.question).toBe('');
    expect(p.replies).toEqual([]);
    expect(p.action).toBe('始業前の 10 分で書き出す。');
  });
  it('問いも行動も無い答え（続きの返事への答え）も読める。「— 」の注記は note へ', () => {
    const p = parseAnswer('【結論】\nx\n\n【あなたの状況に合わせた解釈】\ny\n\n— （お試しモードの応答です）');
    expect(p.question).toBe('');
    expect(p.action).toBe('');
    expect(p.interp).toBe('y');
    expect(p.note).toBe('（お試しモードの応答です）');
  });
});

describe('本を探す問いの答え（問いも行動も無い）', () => {
  it('結論と参照だけでも組み立てる（問い・行動は空）', () => {
    const a = parseAnswer(['【結論】', '『エッセンシャル思考』のメモに書いていました。', '', '【参照した本のメモ】', '- 『エッセンシャル思考』p.64 のメモ：「断る余地が生まれる」'].join('\n'));
    expect(a.conclusion).toBe('『エッセンシャル思考』のメモに書いていました。');
    expect(a.refs).toContain('断る余地');
    expect(a.question).toBe('');
    expect(a.replies).toEqual([]);
    expect(a.action).toBe('');
  });
});
