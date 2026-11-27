import { describe, it, expect } from 'vitest';
import { advisorExamplesFor, ADVISOR_EXAMPLES_NEW_READER } from './BookAdvisor';

describe('AI 選書の「たとえば」（2026-11-27）', () => {
  it('読了の本が無い人には、読む習慣の例を先に・3 つのまま', () => {
    expect(advisorExamplesFor([{ status: 'reading' }])[0]).toBe('本を読む習慣をつけたい。薄くて読みやすい 1 冊は？');
    expect(advisorExamplesFor([])).toBe(ADVISOR_EXAMPLES_NEW_READER);
    expect(advisorExamplesFor([{ status: 'done' }])[0]).toBe('人前で話すのが苦手。おすすめの本は？');
    expect(ADVISOR_EXAMPLES_NEW_READER).toHaveLength(3);
  });
});
