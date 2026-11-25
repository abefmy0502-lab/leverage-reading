import { describe, it, expect } from 'vitest';
import { releaseDateOf, pickAuthorBooks, authorBooksServer } from './_authorBooks.js';

const raw = (title, salesDate, isbn, author = '稲盛和夫') => ({ title, author, isbn, salesDate, publisherName: '見本社' });

describe('お気に入りの著者の本（2026-11-25）', () => {
  it('発売日を日付に（旬・月だけも）', () => {
    expect(releaseDateOf('2026年12月18日')).toBe('2026-12-18');
    expect(releaseDateOf('2026年12月上旬')).toBe('2026-12-10');
    expect(releaseDateOf('2026年12月中旬頃')).toBe('2026-12-20');
    expect(releaseDateOf('2026年02月')).toBe('2026-02-28');
    expect(releaseDateOf('')).toBe('');
  });
  it('新しい順・著者が合う本だけ・前の版がある作品は reissue', () => {
    const items = [
      { title: '生き方', author: '稲盛和夫', isbn: '9784763195543', pubdate: '2004年08月', cover: '' },
      { title: '生き方 (文庫)', author: '稲盛和夫', isbn: '9784763199999', pubdate: '2026年11月中旬', cover: '' },
      { title: '新しい本', author: '稲盛和夫', isbn: '9784000000001', pubdate: '2026年12月18日', cover: '' },
      { title: '別の人の本', author: '山田太郎', isbn: '9784000000002', pubdate: '2026年12月20日', cover: '' },
    ];
    const out = pickAuthorBooks('稲盛和夫', items);
    expect(out.map((b) => b.title)).toEqual(['新しい本', '生き方 (文庫)', '生き方']);
    expect(out[0].reissue).toBe(false);
    expect(out[1].reissue).toBe(true);
    expect(out[0].release).toBe('2026-12-18');
  });
  it('楽天を著者・発売日の新しい順で引く', async () => {
    let url = '';
    const rakutenGetImpl = async (u) => { url = u; return { status: 200, body: JSON.stringify({ Items: [{ Item: raw('考え方', '2017年03月', '9784478028346') }] }) }; };
    const r = await authorBooksServer('稲盛和夫', { env: { RAKUTEN_APPLICATION_ID: 'x', RAKUTEN_ACCESS_KEY: 'y' }, rakutenGetImpl });
    expect(r.ok).toBe(true);
    expect(r.books[0].title).toBe('考え方');
    expect(decodeURIComponent(url)).toContain('author=稲盛和夫');
    expect(url).toContain('sort=-releaseDate');
  });
  it('鍵が無ければ ok=false（端末は前に覚えた本のまま）', async () => {
    const r = await authorBooksServer('稲盛和夫', { env: {} });
    expect(r.ok).toBe(false);
  });
});

describe('本番の結果から（2026-11-25・稲盛和夫）', () => {
  const it0 = (o) => ({ subtitle: '', publisher: 'P', cover: '', ...o });
  const items = [
    it0({ title: '稲盛和夫研究 第5号', author: '稲盛和夫研究会', pubdate: '2026年08月20日頃', isbn: '9784814006649' }),
    it0({ title: '稲盛和夫「生き方」「心。」人生哲学の集大成 2冊セット', author: '稲盛和夫', pubdate: '2026年06月中旬', isbn: '2100015033661' }),
    it0({ title: '経営のこころ 会社を伸ばすリーダーシップ', author: '稲盛和夫、稲盛ライブラリー', pubdate: '2026年06月03日頃', isbn: '9784569905778' }),
    it0({ title: '新版 生き方', author: '稲盛和夫', pubdate: '2026年03月11日頃', isbn: '9784763142894' }),
    it0({ title: '稲盛和夫の実学 新装版', author: '稲盛和夫', pubdate: '2025年10月03日頃', isbn: '9784296125715' }),
    it0({ title: '経営', author: '稲盛ライブラリー+ダイヤモンド社「稲盛和夫経営講演選集」共同チーム', pubdate: '2023年11月09日頃', isbn: '9784478118474' }),
    it0({ title: '経営のこころ 会社を伸ばすリーダーシップ', author: '稲盛和夫、稲盛ライブラリー', pubdate: '2021年12月20日頃', isbn: '9784569851075' }),
    it0({ title: '誰にも負けない努力', author: '稲盛和夫、稲盛ライブラリー', pubdate: '2024年06月05日頃', isbn: '9784569904153' }),
  ];
  const out = pickAuthorBooks('稲盛和夫', items);
  const by = (isbn) => out.find((b) => b.isbn === isbn);
  it('別の著者（研究会・共同チーム）とセット商品は出さない', () => {
    expect(by('9784814006649')).toBeUndefined();
    expect(by('9784478118474')).toBeUndefined();
    expect(by('2100015033661')).toBeUndefined();
  });
  it('新版・新装版・前の版がある本は新しい作品ではない', () => {
    expect(by('9784763142894').reissue).toBe(true);
    expect(by('9784296125715').reissue).toBe(true);
    expect(by('9784569905778').reissue).toBe(true);
    expect(by('9784569904153').reissue).toBe(false);
  });
  it('号の違う本は前の号があっても新しい本', () => {
    const r = pickAuthorBooks('稲盛和夫研究会', [
      it0({ title: '稲盛和夫研究 第5号', author: '稲盛和夫研究会', pubdate: '2026年08月20日頃', isbn: '9784814006649' }),
      it0({ title: '稲盛和夫研究 第4号', author: '稲盛和夫研究会', pubdate: '2025年06月05日頃', isbn: '9784814006083' }),
    ]);
    expect(r.every((b) => !b.reissue)).toBe(true);
  });
});
