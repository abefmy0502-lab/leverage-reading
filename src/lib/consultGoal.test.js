// 🏁 ゴールが見える相談（2026-10-08 オーナー「ひたすら質問が続いてゴールが見えない」）。
import { describe, it, expect } from 'vitest';
import { turnHint } from './ai';
import {
  ASK_LIMIT, answerAsks, countAsks, wantsMoreAsk, shouldDecide, askProgressText,
  nextStepChips, DECIDE_CHIP, DECIDE_REQUEST, wantsAction,
} from './consultHelpers';

const ASK = (q = '報告が遅れるのは、どんな場面が多いですか？') => [
  '【結論】', 'まず場面を絞りましょう。', '', '【あなたに聞きたいこと】', q, '・会議の前', '・急ぎのとき',
].join('\n');
const ACTION = ['【結論】', '会議の前に絞ります。', '', '【明日からできる 1 つの行動】', '始業前の 10 分で、部下に「いつまでに・何を」を伝える。'].join('\n');
const PLAIN = ['【結論】', 'もう一歩具体的にすると、場面を 1 つに決めることです。'].join('\n');

describe('answerAsks / countAsks（何回聞き返したか）', () => {
  it('問いのある答えは聞き返し・行動を決めた答えは違う', () => {
    expect(answerAsks(ASK())).toBe(true);
    expect(answerAsks(ACTION)).toBe(false);
    expect(answerAsks(PLAIN)).toBe(false);
  });
  it('聞き返しの回数を数え、行動を決めた答えで数え直す', () => {
    expect(countAsks([{ answer: ASK() }])).toBe(1);
    expect(countAsks([{ answer: ASK() }, { answer: ASK('相手は誰ですか？') }])).toBe(2);
    expect(countAsks([{ answer: ASK() }, { answer: ASK() }, { answer: ACTION }])).toBe(0);
    expect(countAsks([{ answer: ACTION }, { answer: ASK() }])).toBe(1);
    expect(countAsks([{ answer: ASK() }, { answer: PLAIN }])).toBe(1);
    expect(countAsks(null)).toBe(0);
  });
});

describe('shouldDecide / turnHint（聞き返しは最大 2 回）', () => {
  it('最初の答えは聞き返す（行動を求めても）', () => {
    expect(shouldDecide({ followUp: false, question: '何をすればいい？', asked: 0 })).toBe(false);
  });
  it('1 回目の返事のあとは、もう 1 つだけ聞いてよい（これが最後と念を押す）', () => {
    expect(shouldDecide({ followUp: true, question: '会議の前', asked: 1 })).toBe(false);
    const h = turnHint({ followUp: true, question: '会議の前', asked: 1 });
    expect(h.decide).toBe(false);
    expect(h.text).toContain('聞き返すのはこれが最後');
  });
  it(`${ASK_LIMIT} 回答えたら、次の答えは聞き返さずに結論＋行動`, () => {
    expect(shouldDecide({ followUp: true, question: '相手の反応', asked: 2 })).toBe(true);
    const h = turnHint({ followUp: true, question: '相手の反応', asked: 2 });
    expect(h.decide).toBe(true);
    expect(h.text).toContain('ACTION_REQUEST');
    expect(h.text).toContain('聞き返さず');
    expect(h.text).toContain('【明日からできる 1 つの行動】');
  });
  it('「もっと聞いて」と頼んだときだけ続けて聞く', () => {
    expect(wantsMoreAsk('もっと聞いて')).toBe(true);
    expect(wantsMoreAsk('もう少し質問して')).toBe(true);
    expect(wantsMoreAsk('会議の前')).toBe(false);
    expect(shouldDecide({ followUp: true, question: 'もっと聞いて', asked: 2 })).toBe(false);
    const h = turnHint({ followUp: true, question: 'もっと聞いて', asked: 2 });
    expect(h.decide).toBe(false);
    expect(h.text).toContain('【あなたに聞きたいこと】');
  });
  it('「ここで答えと行動を」は、1 回目の聞き返しのあとでも結論＋行動', () => {
    expect(wantsAction(DECIDE_REQUEST)).toBe(true);
    expect(shouldDecide({ followUp: true, question: DECIDE_REQUEST, asked: 1 })).toBe(true);
    expect(turnHint({ followUp: true, question: DECIDE_REQUEST, asked: 1 }).decide).toBe(true);
  });
  it('本を探す問いは聞き返しの数に関係なく本とメモだけ', () => {
    expect(shouldDecide({ followUp: true, question: '『断る』を書いた本はどれ？', asked: 3 })).toBe(false);
    expect(turnHint({ followUp: true, question: '『断る』を書いた本はどれ？', asked: 3 }).lookup).toBe(true);
  });
});

describe('askProgressText（いまどこにいるかの 1 行）', () => {
  it('1 回目の聞き返しは「あと 1 つ」・2 回目からは「次で」', () => {
    expect(askProgressText(1)).toBe('あと 1 つ聞いたら、答えと行動をまとめます');
    expect(askProgressText(2)).toBe('次で答えと行動をまとめます');
    expect(askProgressText(3)).toBe('次で答えと行動をまとめます');
  });
  it('聞き返していなければ出さない', () => {
    expect(askProgressText(0)).toBe('');
    expect(askProgressText(NaN)).toBe('');
  });
});

describe('チップ（いつでも終われる）', () => {
  it('最初の聞き返しから、候補のあとに「ここで答えと行動を」が 1 つだけ', () => {
    const c = nextStepChips({ replies: ['会議の前', '急ぎのとき'] });
    expect(c.map((x) => x.label)).toEqual(['会議の前', '急ぎのとき', DECIDE_CHIP]);
    expect(DECIDE_CHIP).toBe('ここで答えと行動を');
    expect(c.filter((x) => x.kind === 'decide')).toHaveLength(1);
  });
  it('行動を決めたあとは出さない', () => {
    expect(nextStepChips({ hasAction: true }).map((x) => x.kind)).not.toContain('decide');
  });
});
