// 📖 「この本について」の表示（BookAbout.jsx）: 見つからない本では何も出さない・読み込み中は同じ形の骨組み。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BookAbout, { glueForDisplay } from './BookAbout';

const text = (html) => html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, '').replace(/\u2060/g, '');
const INFO = {
  description: '寿命が延びる時代の人生設計を考える本。',
  toc: ['序章 100年ライフ', '第1章 長い生涯'],
  source: 'openbd', tocSource: 'openbd', pages: 400, pubdate: '2016-10-21',
};

describe('BookAbout', () => {
  it('紹介も目次も無い本では何も描かない（カード・畳む見出しとも）', () => {
    for (const variant of ['card', 'fold']) {
      expect(renderToStaticMarkup(<BookAbout info={null} variant={variant} />)).toBe('');
      expect(renderToStaticMarkup(<BookAbout info={{ description: '', toc: [] }} variant={variant} />)).toBe('');
    }
  });

  it('読み込み中のカードは見出しと骨組み（読書中の畳む見出しは何も出さない）', () => {
    const html = renderToStaticMarkup(<BookAbout info={null} loading variant="card" />);
    expect(html).toContain('aria-busy="true"');
    expect(text(html)).toContain('この本について');
    expect(renderToStaticMarkup(<BookAbout info={null} loading variant="fold" />)).toBe('');
  });

  it('カード: 紹介文・取得元・目次（畳む・項目数）', () => {
    const html = renderToStaticMarkup(<BookAbout info={INFO} variant="card" />);
    const t = text(html);
    expect(t).toContain('この本について');
    expect(t).toContain('寿命が延びる時代の人生設計を考える本。');
    expect(t).toContain('出版社の内容紹介より · 400 ページ · 2016年10月');
    expect(html).toContain('<details');
    expect(t).toContain('目次');
    expect(t).toContain('2 項目');
    expect(t).toContain('序章 100年ライフ');
  });

  it('目次だけの本: 紹介文は出さず目次の畳みだけ', () => {
    const html = renderToStaticMarkup(<BookAbout info={{ ...INFO, description: '', source: '' }} variant="card" />);
    expect(text(html)).not.toContain('寿命が延びる');
    expect(text(html)).toContain('2 項目');
  });

  it('紹介文と目次の取得元が違えば、目次の下にその名前', () => {
    const html = renderToStaticMarkup(<BookAbout info={{ ...INFO, tocSource: 'rakuten' }} variant="card" />);
    expect(text(html)).toContain('目次は楽天ブックスの商品説明より');
  });

  it('畳む見出し（読書中）: 見出しの右に中身の一覧', () => {
    const t = text(renderToStaticMarkup(<BookAbout info={INFO} variant="fold" />));
    expect(t).toContain('この本について');
    expect(t).toContain('紹介・目次');
  });

  it('数と助数詞・カタカナの中黒の途中では折れない（結合文字・隣の <wbr> は外す）', () => {
    expect(glueForDisplay('の3つの')).toBe('の3\u2060つの');
    expect(glueForDisplay('自分のリ・クリエーション')).toBe('自分のリ\u2060・\u2060クリエーション');
    expect(glueForDisplay('LIFE SHIFT 2')).toBe('LIFE SHIFT 2');
    // 数の前は決まった字のときだけ結ぶ（読点・助詞の後ろでは折れてよい）
    expect(glueForDisplay('と、1対1の')).toBe('と、1\u2060対\u20601\u2060の');
    expect(glueForDisplay('第3章')).toBe('第\u20603\u2060章');
    const html = renderToStaticMarkup(<BookAbout info={{ ...INFO, description: '寿命が延び、多くの人が100年生きる時代には、3つのステージで考える。', toc: ['第8章 新しい時間の使い方——自分のリ・クリエーションへ'] }} variant="fold" />);
    expect(html).not.toMatch(/\u2060<wbr\s*\/?>|<wbr\s*\/?>\u2060/);
    expect(html).toContain('3\u2060つ');
    expect(html).toContain('リ\u2060・\u2060ク');
  });

  it('畳む見出しの中の紹介文は改行ごとに段落（3 行で切るカードは 1 つのまとまり）', () => {
    const info = { ...INFO, description: '一段落目。\n二段落目。\n\n三段落目。' };
    const fold = renderToStaticMarkup(<BookAbout info={info} variant="fold" />);
    expect((fold.match(/<p[^>]*font-read[^>]*>/g) || []).length).toBe(3);
    const card = renderToStaticMarkup(<BookAbout info={info} variant="card" />);
    expect((card.match(/<p[^>]*font-read[^>]*>/g) || []).length).toBe(1);
  });
});
