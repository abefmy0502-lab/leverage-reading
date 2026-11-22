import { describe, it, expect } from 'vitest';
import { emailProblem } from './LpWaitlist.jsx';

describe('emailProblem（メールの形のどこが違うか）', () => {
  it.each([
    ['', '入れてください'],
    ['you＠example.com', '全角'],
    ['you@example．com', '全角'],
    ['you @example.com', '空白'],
    ['youexample.com', '「@」が入っていません'],
    ['you@@example.com', '2 つ以上'],
    ['@example.com', '前が空いています'],
    ['you@', '後ろが空いています'],
    ['you@example', '「.com」などが足りません'],
    ['you@example.c', '「.com」などが足りません'],
    ['ｙｏｕ@example.com', '全角の文字'],
    ['you@gmail.co', 'gmail.com'],
    ['you@gmial.com', 'gmail.com'],
  ])('%s', (v, want) => expect(emailProblem(v)).toContain(want));
  it.each(['you@example.com', ' a.b+c@mail.example.co.jp ', 'you@example.co'])('正しい形は空: %s', (v) => expect(emailProblem(v)).toBe(''));
});
