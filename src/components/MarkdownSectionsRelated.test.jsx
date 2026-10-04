// 1 行に 2 冊を混ぜた関連書籍の行（「『A』関連 または『B』- 著者」）は本のカードにしない（2026-10-04 オーナー報告）。
// 『』の無い番号つきの行（「1. 7つの習慣 - コヴィー」）も、書誌で確かめて『』の行に直すまではカードにしない（同日）。
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

const plainOf = (html) => html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, ' ');

describe('MarkdownSections の関連書籍', () => {
  it('きれいな行はカード・2 冊を混ぜた行は説明ごと出さない', () => {
    const html = renderToStaticMarkup(<MarkdownSections flat text={SHEET} onAddRelatedBook={() => {}} />);
    const plain = plainOf(html);
    expect(plain).toContain('夢をかなえるゾウ');
    expect(plain).toContain('小さな目標の立て方');
    expect(plain).not.toContain('SMALL ACTIONS');
    expect(plain).not.toContain('やめる習慣');
    expect(plain).not.toContain('何を続け');
  });

  it('カードが 1 枚も出ない関連書籍の節（全部が崩れた行・確かめていない『』なしの行）は、見出しも Amazon の注記も出さない', () => {
    const text = [
      '## 🎯 読み方の戦略', '- 目的に合わせて読む', '',
      '## 📚 関連書籍',
      '### 1. 『SMALL ACTIONS, BIG RESULTS』関連 または『やめる習慣』 - 古川武士',
      '何を続けるか。',
      '### 2. 7つの習慣 - スティーブン・R・コヴィー',
      '主体性。',
    ].join('\n');
    const html = renderToStaticMarkup(<MarkdownSections flat text={text} onAddRelatedBook={() => {}} />);
    const plain = plainOf(html);
    expect(plain).toContain('目的に合わせて読む');
    expect(plain).not.toContain('関連書籍');
    expect(plain).not.toContain('Amazon');
    expect(plain).not.toContain('アソシエイト');
    // 関連書籍しか無ければ何も描かない
    const only = renderToStaticMarkup(<MarkdownSections flat text={'## 📚 関連書籍\n### 1. 7つの習慣 - コヴィー'} onAddRelatedBook={() => {}} />);
    expect(only).toBe('');
  });

  it('hideRelatedBooks（以前の AI 解析・まとめ＝書誌で確かめていない）: 本を挙げる節を出さない・ほかの節はそのまま', () => {
    const text = ['## 🧭 この本の核心', '寿命が延びる。', '', '## 📚 関連書籍', '### 1. 『架空の本』- 架空花子', '説明。'].join('\n');
    const html = renderToStaticMarkup(<MarkdownSections flat text={text} hideRelatedBooks />);
    const plain = plainOf(html);
    expect(plain).toContain('寿命が延びる。');
    expect(plain).not.toContain('関連書籍');
    expect(plain).not.toContain('架空の本');
    expect(renderToStaticMarkup(<MarkdownSections flat text={'## 📚 関連書籍\n### 1. 『架空の本』'} hideRelatedBooks />)).toBe('');
  });

  it('『』の無い本の行はカードにしない（「読みたいに追加」を出さない）・本ではない見出しはそのまま', () => {
    const text = [
      '## 📚 関連書籍',
      '### 1. 7つの習慣 - スティーブン・R・コヴィー',
      '主体性の考え方を補える。',
      '### 2. 『GRIT やり抜く力』- アンジェラ・ダックワース',
      '粘り強さ。',
      '### 読む順番',
      'まず実践の本から。',
    ].join('\n');
    const html = renderToStaticMarkup(<MarkdownSections flat text={text} onAddRelatedBook={() => {}} />);
    const plain = plainOf(html);
    expect(plain).not.toContain('7つの習慣');
    expect(plain).not.toContain('主体性の考え方');
    expect(html).not.toContain('『7つの習慣』を読みたいに追加');
    expect(html).toContain('『GRIT やり抜く力』を読みたいに追加');
    expect(plain).toContain('読む順番');
    expect(plain).toContain('まず実践の本から。');
  });
});
