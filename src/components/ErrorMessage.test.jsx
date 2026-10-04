// ErrorMessage の説明の折り返し（2026-10-04 ui-critic）: 文節の切れ目（<wbr>）だけで折り返し、
// 句読点ごとの inline-block の塊は使わない。U+00A0（数字＋助数詞など）はつないだまま。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ErrorMessage from './ErrorMessage';
import { withPhraseBreaks } from './TightBubble';

describe('ErrorMessage の説明', () => {
  it('文節の切れ目に <wbr> を入れ、inline-block の塊にしない', () => {
    const html = renderToStaticMarkup(<ErrorMessage title="t" description="条件を変えて、もう一度探してください。" />);
    expect(html).not.toContain('inline-block');
    expect(html).toContain('<wbr/>');
    expect(html.replace(/<wbr\/>/g, '')).toContain('条件を変えて、もう一度探してください。');
  });
});

describe('withPhraseBreaks と U+00A0', () => {
  it('折り返さない空きの前後には切れ目を入れない', () => {
    const html = renderToStaticMarkup(<p>{withPhraseBreaks('多くても週に 1 回、メモを 1 件だけ送ります。')}</p>);
    expect(html).not.toMatch(/1 <wbr\/>|<wbr\/> /);
    expect(html).toContain('1 回');
  });
});

describe('決まった言い回しと題', () => {
  it('「もう一度」の間で割らない', () => {
    const html = renderToStaticMarkup(<p>{withPhraseBreaks('少し時間をおいて、もう一度お試しください。')}</p>);
    expect(html).toContain('もう一度');
  });
  it('題も文節の切れ目を入れる', () => {
    const html = renderToStaticMarkup(<ErrorMessage title="実在する本が見つかりませんでした" />);
    expect(html.match(/error-message-title">([^]*?)<\/p>/)[1]).toContain('<wbr/>');
  });
});
