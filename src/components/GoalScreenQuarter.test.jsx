import { describe, it, expect } from 'vitest';
import { nowQuarterTitle } from './GoalScreen';

describe('nowQuarterTitle（いまの 3 か月の見出し）', () => {
  it('3 か月の区切りは実際の月を添える（年をまたいでも）', () => {
    expect(nowQuarterTitle({ startYm: '2026-11', months: 3 })).toBe('いまの 3 か月（11月〜1月）');
    expect(nowQuarterTitle({ startYm: '2026-04', months: 3 })).toBe('いまの 3 か月（4月〜6月）');
  });
  it('年の区切り・分からないときは「いまの 3 か月」だけ（同じことを 2 回言わない）', () => {
    expect(nowQuarterTitle({ startYm: '2027-11', months: 12 })).toBe('いまの 3 か月');
    expect(nowQuarterTitle(undefined)).toBe('いまの 3 か月');
  });
});
