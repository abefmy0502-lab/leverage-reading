import { describe, it, expect } from 'vitest';
import { completedActionMessage } from './actionMessages';

describe('completedActionMessage', () => {
  it('ふつうの行動', () => {
    expect(completedActionMessage({ text: 'a' })).toBe('行動を完了しました');
    expect(completedActionMessage(null)).toBe('行動を完了しました');
  });
  it('繰り返しの行動は次回を添える（知らせは 1 つ）', () => {
    expect(completedActionMessage({ recurrence: 'weekly' })).toBe('完了。次回は来週');
    expect(completedActionMessage({ recurrence: 'monthly' })).toBe('完了。次回は来月');
  });
});
