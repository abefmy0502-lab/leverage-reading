// 📖 「この本について」の表示（BookAbout.jsx）: 見つからない本では何も出さない・読み込み中は同じ形の骨組み。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BookAbout from './BookAbout';

const text = (html) => html.replace(/<wbr\s*\/?>/g, '').replace(/<[^>]+>/g, '');
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
});
