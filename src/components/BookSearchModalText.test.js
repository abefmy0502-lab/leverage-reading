// 本の検索の 0 件の文（BookSearchModal.jsx の notFoundText・2026-10-11）。
import { describe, it, expect } from 'vitest';
import { notFoundText } from './BookSearchModal';

describe('notFoundText', () => {
  it('ISBN で探して 0 件なら「ISBN で探して」と言わない', () => {
    const t = notFoundText('978-4-86276-085-2');
    expect(`${t.title}。${t.description}`).toBe('この ISBN の本が見つかりませんでした。書名で探すか、手動で入力してください。');
  });
  it('書名で探して 0 件なら、書名を短くするか ISBN で', () => {
    expect(notFoundText('考え方').description).toContain('ISBN');
  });
});
