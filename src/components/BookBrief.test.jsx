// 📖 この本で学べること（BookBrief.jsx・2026-10-08）: 作る前は副ボタン・作ったら中身・材料が無ければ決まった 1 行。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BookBrief, { BRIEF_MAKE_LABEL } from './BookBrief';
import BookAbout from './BookAbout';
import { BRIEF_NO_MATERIAL_TEXT } from '../lib/bookBrief';

const text = (html) => html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, '').replace(/⁠/g, '').replace(/ |&nbsp;/g, ' ');
const BRIEF = '## 概要\n長く生きる時代は段階を組み替える。\n\n## 学べること\n- 見えない資産\n- 学び直し\n\n## 仮説の例\n- 書き出せば選択肢が見えるのでは';
const INFO = { description: '寿命が延びる時代の人生設計を考える本。', toc: ['序章 100年ライフ'], source: 'openbd', tocSource: 'openbd', pages: 0, pubdate: '' };

describe('BookBrief', () => {
  it('カードの中: まだ無ければ副ボタンと 1 回の目安', () => {
    const html = renderToStaticMarkup(<BookBrief variant="inCard" material costLine="1 回 約 2 トークン・今月の残り 30 トークン" onMake={() => {}} />);
    expect(text(html)).toContain(BRIEF_MAKE_LABEL);
    expect(text(html)).toContain('1 回 約 2 トークン');
  });

  it('材料が無ければボタンを出さず「この本の紹介が見つからないため作れません。」', () => {
    const html = renderToStaticMarkup(<BookBrief variant="inCard" material={false} onMake={() => {}} />);
    expect(text(html)).toContain(BRIEF_NO_MATERIAL_TEXT);
    expect(html).not.toContain('<button');
    const fold = renderToStaticMarkup(<BookBrief variant="fold" material={false} onMake={() => {}} />);
    expect(text(fold)).toContain(BRIEF_NO_MATERIAL_TEXT);
  });

  it('作っている途中は「作成中…」と骨組み（目安の行は出さない）', () => {
    const html = renderToStaticMarkup(<BookBrief variant="inCard" material making costLine="1 回 約 2 トークン" onMake={() => {}} />);
    expect(text(html)).toContain('作成中…');
    expect(html).toContain('ai-skeleton');
    expect(text(html)).not.toContain('1 回 約 2 トークン');
  });

  it('作ったら中身（概要・学べること・仮説の例・どこから作ったか・作り直す）', () => {
    const html = renderToStaticMarkup(<BookBrief variant="inCard" text={BRIEF} material info={INFO} onMake={() => {}} />);
    const t = text(html);
    for (const w of ['この本で学べること', '概要', '学べること', '見えない資産', '仮説の例', '紹介文と目次から AI がまとめました', '作り直す']) expect(t).toContain(w);
    expect(t).not.toContain(BRIEF_MAKE_LABEL);
  });

  it('仮説の例は、押せるときだけボタン（入っている例は ✓ の読み上げ）', () => {
    const plain = renderToStaticMarkup(<BookBrief variant="section" text={BRIEF} onPickHypothesis={undefined} />);
    expect(plain).not.toContain('仮説に入れる');
    expect(text(plain)).not.toContain('仮説の例'); // 押せない section は短く（概要と学べることだけ）
    const pick = renderToStaticMarkup(<BookBrief variant="fold" text={BRIEF} onPickHypothesis={() => {}} pickedHypotheses="" />);
    expect(pick).toContain('（仮説に入れる）');
    const picked = renderToStaticMarkup(<BookBrief variant="fold" text={BRIEF} onPickHypothesis={() => {}} pickedHypotheses="書き出せば選択肢が見えるのでは" />);
    expect(picked).toContain('（仮説に入っています）');
  });

  it('編集画面の畳み: ふだんは閉じる・作った直後は開いたまま', () => {
    expect(renderToStaticMarkup(<BookBrief variant="fold" text={BRIEF} />)).not.toMatch(/<details[^>]* open/);
    expect(renderToStaticMarkup(<BookBrief variant="fold" text={BRIEF} defaultOpen />)).toMatch(/<details[^>]* open/);
  });

  it('作れなかったときは、ボタンの下に理由と「もう一度作る」', () => {
    const html = renderToStaticMarkup(<BookBrief variant="make" material error="作れませんでした。" costLine="1 回 約 2 トークン" onMake={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('もう一度作る');
    expect(text(html)).toContain('作れませんでした。');
  });

  it('作り直しに失敗したら、中身は残したまま添え書きの下に理由の 1 行', () => {
    const html = renderToStaticMarkup(<BookBrief variant="fold" text={BRIEF} info={INFO} defaultOpen error="作り直せませんでした。前の内容のままです。" onMake={() => {}} />);
    expect(html).toContain('role="alert"');
    const t = text(html);
    expect(t).toContain('見えない資産');
    expect(t.indexOf('作り直せませんでした')).toBeGreaterThan(t.indexOf('AI がまとめました'));
  });

  it('紹介を読み込んでいる間は押せないボタン（「作成中…」とは言わない）', () => {
    const html = renderToStaticMarkup(<BookBrief variant="make" material={false} infoLoading onMake={() => {}} />);
    expect(html).toContain('disabled');
    expect(text(html)).toContain(BRIEF_MAKE_LABEL);
    expect(text(html)).not.toContain('作成中');
  });

  it('作ったあとの積読の畳み: 見出し＋右に「概要・学べること」・ふだんは閉じる', () => {
    const html = renderToStaticMarkup(<BookBrief variant="fold" text={BRIEF} info={INFO} />);
    expect(text(html)).toContain('概要・学べること・仮説');
    expect(html).not.toMatch(/<details[^>]* open/);
  });

  it('「この本について」のカードの中、目次の上に入る', () => {
    const html = renderToStaticMarkup(<BookAbout info={INFO} variant="card" briefSlot={<BookBrief variant="inCard" material onMake={() => {}} />} />);
    expect(html.indexOf(BRIEF_MAKE_LABEL)).toBeGreaterThan(html.indexOf('寿命が延びる'));
    expect(html.indexOf(BRIEF_MAKE_LABEL)).toBeLessThan(html.indexOf('目次'));
  });
});
