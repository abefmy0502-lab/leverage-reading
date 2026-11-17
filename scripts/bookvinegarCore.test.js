import { describe, it, expect } from 'vitest';
import { parsePostSitemap, postSitemapUrls, recentPosts, bookFromPage, toAddBooks, chunks } from './bookvinegarCore.js';

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
