import { describe, it, expect } from 'vitest';
import { parsePostSitemap, postSitemapUrls, recentPosts, bookFromPage, extFromPage, textOf, toAddBooks, chunks } from './bookvinegarCore.js';

describe('bookvinegar の事実だけを読む', () => {
  it('サイトマップから本の記事と更新日', () => {
    const xml = `<urlset><url><loc><![CDATA[https://bookvinegar.jp/22335/]]></loc><lastmod><![CDATA[2026-11-15T13:48:42+00:00]]></lastmod></url>
      <url><loc><![CDATA[https://bookvinegar.jp/news/1/]]></loc><lastmod><![CDATA[2026-11-15T00:00:00+00:00]]></lastmod></url>
      <url><loc>https://bookvinegar.jp/130/</loc><lastmod>2020-01-01T00:00:00+00:00</lastmod></url></urlset>`;
    expect(parsePostSitemap(xml)).toEqual([
      { loc: 'https://bookvinegar.jp/22335/', lastmod: '2026-11-15T13:48:42+00:00' },
      { loc: 'https://bookvinegar.jp/130/', lastmod: '2020-01-01T00:00:00+00:00' },
    ]);
    const index = '<sitemap><loc><![CDATA[https://bookvinegar.jp/post-sitemap.xml]]></loc></sitemap><sitemap><loc><![CDATA[https://bookvinegar.jp/post-sitemap2.xml]]></loc></sitemap><sitemap><loc><![CDATA[https://bookvinegar.jp/authors-sitemap.xml]]></loc></sitemap>';
    expect(postSitemapUrls(index)).toEqual(['https://bookvinegar.jp/post-sitemap.xml', 'https://bookvinegar.jp/post-sitemap2.xml']);
  });
  it('直近の日数だけ・同じ記事は 1 つ', () => {
    const now = Date.parse('2026-11-17T00:00:00Z');
    const posts = [{ loc: 'a', lastmod: '2026-11-10T00:00:00Z' }, { loc: 'a', lastmod: '2026-11-10T00:00:00Z' }, { loc: 'b', lastmod: '2026-09-01T00:00:00Z' }, { loc: 'c', lastmod: '' }];
    expect(recentPosts(posts, { days: 35, now }).map((p) => p.loc)).toEqual(['a']);
  });
  it('構造化データから ISBN・書名・著者だけ（本文は見ない）', () => {
    const ld = { '@context': 'https://schema.org', '@type': 'Review', name: '書評', description: '要約の文章', itemReviewed: { '@type': 'Book', name: ' マインドセット ', author: [{ '@type': 'Person', name: 'キャロル・S・ドゥエック' }], isbn: '4794221789' } };
    const html = `<p>本文</p><script type="application/ld+json">{"@type":"Article"}</script><script type="application/ld+json">${JSON.stringify(ld)}</script>`;
    expect(bookFromPage(html)).toEqual({ isbn: '4794221789', title: 'マインドセット', author: 'キャロル・S・ドゥエック' });
    expect(bookFromPage('<html>no data</html>')).toBeNull();
    expect(JSON.stringify(bookFromPage(html))).not.toContain('要約');
  });
  it('待ち行列に送る形・同じ本は 1 つ・200 冊ずつ', () => {
    const list = toAddBooks([{ isbn: '4794221789', title: 'A', author: 'x' }, { isbn: '4794221789', title: 'A', author: 'x' }, { isbn: '', title: 'B', author: 'y' }, null]);
    expect(list).toEqual([{ isbn: '4794221789', title: 'A', author: 'x' }, { title: 'B', author: 'y' }]);
    expect(chunks(Array.from({ length: 450 }), 200).map((c) => c.length)).toEqual([200, 200, 50]);
  });
});

describe('推薦の事実と要約（書評データ）', () => {
  const ld = { '@type': 'Review', itemReviewed: { '@type': 'Book', name: '本', author: [{ name: '著者' }], isbn: '4815647100', genre: ['自己啓発', '読書術・ノート術'] } };
  const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>
    <div class="p-recommend-point"><i></i>推薦ポイント 2P </div>
    <ul><li><span class="bv-recl__name">落合陽一<small>筑波大学 学長補佐</small></span></li><li><span class="bv-recl__name">日本経済新聞</span></li></ul>
    <div class="entry-content"><h3>見出し</h3><p>本文の&amp;一段落。</p><ul><li>項目</li></ul></div><div class="bv-related">関連</div>`;
  it('推薦ポイント・推薦者（名前と肩書き）・テーマ・要約の本文', () => {
    expect(extFromPage(html, 'https://bookvinegar.jp/1/')).toEqual({
      isbn: '4815647100', url: 'https://bookvinegar.jp/1/', points: 2,
      endorsers: [{ name: '落合陽一', note: '筑波大学 学長補佐' }, { name: '日本経済新聞', note: '' }],
      tags: ['自己啓発', '読書術・ノート術'],
      summary: '見出し\n本文の&一段落。\n項目',
    });
    expect(extFromPage('<p>no</p>')).toBeNull();
    expect(textOf('<p>a<br>b</p>')).toBe('a\nb');
  });
});

