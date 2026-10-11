// 📗 読了の 3 つの問い・読む前に書いたこと（DoneReflection.jsx）の表示。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DoneQuestions, BeforeAfter } from './DoneReflection';
import { DONE_QUESTIONS } from '../lib/doneReflection';

const text = (html) => html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, '').replace(/⁠/g, '').replace(/ |&nbsp;/g, ' ');

describe('DoneQuestions', () => {
  it('問いが無ければ何も描かない', () => {
    expect(renderToStaticMarkup(<DoneQuestions questions={[]} />)).toBe('');
  });
  it('問いを押せる行で並べ、閉じるボタンがある', () => {
    const html = renderToStaticMarkup(<DoneQuestions questions={DONE_QUESTIONS} onPick={() => {}} onDismiss={() => {}} />);
    expect(text(html)).toContain('読み終えて、ひとこと');
    DONE_QUESTIONS.forEach((q) => expect(text(html)).toContain(q.text));
    expect(html).toContain('aria-label="読み終えての問いを閉じる"');
  });
});

describe('BeforeAfter', () => {
  it('書いたことが無ければ何も描かない', () => {
    expect(renderToStaticMarkup(<BeforeAfter items={[]} memos={[]} />)).toBe('');
  });
  it('読む前に書いたこと → 読んで残したメモ → 答えは見つかった？', () => {
    const html = text(renderToStaticMarkup(
      <BeforeAfter
        items={[{ key: 'purpose', label: 'この本から得たいこと', text: '成果を測りたい' }]}
        memos={[{ id: 'm1', text: '数字で測る', pageNumber: 12 }]}
        onFoundAnswer={() => {}}
      />,
    ));
    const order = ['読む前に書いたこと', 'この本から得たいこと', '成果を測りたい', '読んで残したメモ', 'p.12', '数字で測る', '答えは見つかった？'].map((t) => html.indexOf(t));
    order.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
