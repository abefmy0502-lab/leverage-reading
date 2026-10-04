// 1 行に 2 冊を混ぜた関連書籍の行（「『A』関連 または『B』- 著者」）は本のカードにしない（2026-10-04 オーナー報告）。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownSections from './MarkdownSections';

const SHEET = [
  '## 📚 関連書籍',
  '### 1. 『夢をかなえるゾウ』- 水野敬也',
  '小さな目標の立て方を物語で学べる。',
  '### 2. 『SMALL ACTIONS, BIG RESULTS』関連 または『やめる習慣』 - 古川武士',
  '何を続け、何をやめるかを判断する視点が得られる。',
].join('\n');

describe('MarkdownSections の関連書籍', () => {
  it('きれいな行はカード・2 冊を混ぜた行は説明ごと出さない', () => {
    const html = renderToStaticMarkup(<MarkdownSections flat text={SHEET} onAddRelatedBook={() => {}} />);
    const plain = html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, ' ');
    expect(plain).toContain('夢をかなえるゾウ');
    expect(plain).toContain('小さな目標の立て方');
    expect(plain).not.toContain('SMALL ACTIONS');
    expect(plain).not.toContain('やめる習慣');
    expect(plain).not.toContain('何を続け');
  });
});
