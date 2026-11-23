// 2026-11-23 点検の直し: 行頭の開き括弧（halt）・AI 選書の目安の数と助数詞・トークンを使い切った案内の句点。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { haltLead } from './MyBookBrain';
import { spaceDurationUnits } from './BookAdvisor';
import TokensOutCard from './TokensOutCard';

const html = (node) => renderToStaticMarkup(<p>{node}</p>);
const text = (h) => h.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, '').replace(/⁠/g, '').replace(/ |&nbsp;/g, ' ');

describe('haltLead', () => {
  it('行頭の「『（ だけを halt の字にする（文の中の括弧はそのまま）', () => {
    const out = html(haltLead('「会議の前」の場面で『本』を読む'));
    expect(out).toContain('<span style="font-feature-settings:&quot;halt&quot;">「</span>会議の前」');
    expect(out.match(/halt/g)).toHaveLength(1);
  });
  it('括弧で始まらない文は変えない', () => {
    expect(haltLead('会議の前に')).toBe('会議の前に');
    const arr = ['会議', <b key="b">太字</b>];
    expect(haltLead(arr)).toBe(arr);
  });
  it('配列の頭・太字の中の頭も見る', () => {
    const out = html(haltLead([<strong key="s">『数値化の鬼』</strong>, 'のメモ']));
    expect(out).toContain('<strong><span style="font-feature-settings:&quot;halt&quot;">『</span>数値化の鬼』</strong>');
    expect(text(out)).toBe('『数値化の鬼』のメモ');
  });
});

describe('spaceDurationUnits', () => {
  it('数と助数詞の間に空きを入れ、ヶ月は「か月」に', () => {
    expect(spaceDurationUnits('2週間で読了、1ヶ月で実践')).toBe('2 週間で読了、1 か月で実践');
    expect(spaceDurationUnits('3週間で読了、2か月で実践')).toBe('3 週間で読了、2 か月で実践');
  });
  it('第2部・空きのある文はそのまま', () => {
    expect(spaceDurationUnits('第2部のルール')).toBe('第2部のルール');
    expect(spaceDurationUnits('2 週間で読了')).toBe('2 週間で読了');
  });
});

describe('TokensOutCard', () => {
  it('戻る日の文は相談でも AI 選書でも「。」で終わる', () => {
    const advisor = text(renderToStaticMarkup(<TokensOutCard plan="paid" tokenAllowance={800} />));
    const consult = text(renderToStaticMarkup(<TokensOutCard plan="paid" tokenAllowance={800} memoNote />));
    expect(advisor).toMatch(/800 トークンに戻ります。/);
    expect(consult).toMatch(/800 トークンに戻ります。それまでは/);
  });
});
