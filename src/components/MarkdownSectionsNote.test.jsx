// 読書計画シートの「目次が手に入らないため、章の名前は挙げていません。」は注記（13/--text-3）として見せる。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownSections from './MarkdownSections';
import { PLAN_NO_TOC_LINE } from '../lib/prompts';

describe('MarkdownSections の注記', () => {
  it('目次が無い旨の決まった 1 行は注記の見た目・ほかの本文は明朝のまま', () => {
    const html = renderToStaticMarkup(
      <MarkdownSections flat text={`## 📍 重点的に読む箇所（20%）\n${PLAN_NO_TOC_LINE}\n本文の段落です。\n- 箇条`} />,
    );
    expect(html).toMatch(new RegExp(`<p style="[^"]*font-size:var\\(--text-meta\\)[^"]*color:var\\(--text-3\\)[^"]*">${PLAN_NO_TOC_LINE}</p>`));
    const body = html.split(PLAN_NO_TOC_LINE)[1] || '';
    expect(body).toMatch(/<p style="[^"]*font-family:var\(--font-read\)/);
    expect(body.replace(/<[^>]+>/g, '')).toContain('本文の段落です。');
  });
});
