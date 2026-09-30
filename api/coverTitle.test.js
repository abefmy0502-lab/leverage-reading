import { describe, it, expect } from 'vitest';
import { coreTitle } from './cover.js';

describe('coreTitle', () => {
  it('和書は最初の空白・記号で切る', () => {
    expect(coreTitle('プレイングマネジャー 「残業ゼロ」の仕事術')).toBe('プレイングマネジャー');
    expect(coreTitle('イシューからはじめよ：知的生産の「シンプルな本質」')).toBe('イシューからはじめよ');
  });
  it('英語の書名は空白で切らない（副題の区切りでだけ切る）', () => {
    expect(coreTitle('The Lean Startup')).toBe('The Lean Startup');
    expect(coreTitle('Atomic Habits: An Easy & Proven Way')).toBe('Atomic Habits');
    expect(coreTitle('Deep Work - Rules for Focused Success')).toBe('Deep Work');
    expect(coreTitle('Self-Reliance')).toBe('Self-Reliance');
  });
});
