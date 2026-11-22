import { describe, it, expect } from 'vitest';
import { publicIdFrom, followResultMessage, loadFolloweeShelf, requestFollow } from './social';

describe('フォローの相手のリンク・ID（2026-11-21）', () => {
  it('リンク・本のページ・?follow=・ID のどれからでも取り出す', () => {
    expect(publicIdFrom('https://orime.vercel.app/u/k7mna2pqrs')).toBe('k7mna2pqrs');
    expect(publicIdFrom('https://orime.vercel.app/u/k7mna2pqrs/b/7b1e0000-0000-4000-8000-000000000001')).toBe('k7mna2pqrs');
    expect(publicIdFrom('https://orime.vercel.app/?follow=k7mna2pqrs')).toBe('k7mna2pqrs');
    expect(publicIdFrom('  K7MNA2PQRS ')).toBe('k7mna2pqrs');
  });
  it('名前や形の違う文字は ID にしない（名前では探さない）', () => {
    expect(publicIdFrom('さくら')).toBe('');
    expect(publicIdFrom('https://example.com/u/short')).toBe('');
    expect(publicIdFrom('')).toBe('');
  });
  it('申し込みの答えはどれも 1 文になる', () => {
    for (const r of ['pending', 'accepted', 'self', 'not_found', 'no_profile', 'anonymous', 'too_many', 'not_ready', 'x']) {
      expect(followResultMessage(r)).toMatch(/。$/);
    }
  });
});

describe('フォロー先の本棚の安全', () => {
  const client = (data, error = null) => ({ rpc: async () => ({ data, error }) });
  it('公開に向かないまとめ・連絡先のある書名は出さない', async () => {
    const s = await loadFolloweeShelf('k7mna2pqrs', {
      client: client({
        profile: { public_id: 'k7mna2pqrs', nickname: 'さくら', bio: 'mail me a@b.co' },
        books: [
          { id: '1', title: '考え方', status: 'done', rating: 4, summary: '連絡は test@example.com まで' },
          { id: '2', title: 'https://spam.example', status: 'want' },
          { id: '3', title: 'イシュー', status: 'reading', rating: 5, summary: 'ふつうのまとめ', cover: 'http://x' },
        ],
      }),
    });
    expect(s.profile.bio).toBe('');
    expect(s.books.map((b) => b.id)).toEqual(['1', '3']);
    expect(s.books[0].summary).toBe('');
    expect(s.books[1].rating).toBe(0); // 読了でなければ評価は出さない
    expect(s.books[1].cover).toBe(''); // https だけ
  });
  it('表紙は書店などの配信元のものだけ（自分で上げた表紙は人に見せない・App 審査 1.2）', async () => {
    const s = await loadFolloweeShelf('k7mna2pqrs', {
      client: client({
        profile: { public_id: 'k7mna2pqrs', nickname: 'さくら', fav_cover: 'https://tkrinnopfssdibgxuqzl.supabase.co/storage/v1/object/public/book-covers/u/x.jpg' },
        books: [
          { id: '1', title: '考え方', status: 'done', cover: 'https://thumbnail.image.rakuten.co.jp/a.jpg' },
          { id: '2', title: 'イシュー', status: 'done', cover: 'https://tkrinnopfssdibgxuqzl.supabase.co/storage/v1/object/public/book-covers/u/y.jpg' },
          { id: '3', title: '習慣', status: 'done', cover: 'https://evil.googleusercontent.com/z.jpg' },
        ],
      }),
    });
    expect(s.profile.favCover).toBe('');
    expect(s.books.map((b) => b.cover)).toEqual(['https://thumbnail.image.rakuten.co.jp/a.jpg', '', '']);
  });
  it('通報: 関数が受け付けたら ok・関数が失敗したら failed・関数が無ければ窓口へ', async () => {
    const { reportProfile, reportReasonText } = await import('./social');
    expect(await reportProfile('k7mna2pqrs', 'x', { client: client('ok') })).toBe('ok');
    expect(await reportProfile('k7mna2pqrs', 'x', { client: client(null, { code: '500', message: 'boom' }) })).toBe('failed');
    const sent = [];
    const r = await reportProfile('k7mna2pqrs', 'x', {
      client: client(null, { code: 'PGRST202', message: 'Could not find the function' }),
      fetchImpl: async (url, init) => { sent.push([url, init.body]); },
    });
    expect(r).toBe('ok');
    expect(sent[0][0]).toMatch(/\/api\/profile-report$/);
    expect(reportReasonText('sexual', '  画像が\n不快  ')).toBe('アプリから：性的・暴力的な内容／画像が 不快');
    expect(reportReasonText('nope')).toBe('アプリから：そのほか');
  });
  it('関数が無い DB では not_ready', async () => {
    const r = await requestFollow('k7mna2pqrs', { client: client(null, { code: 'PGRST202', message: 'Could not find the function' }) });
    expect(r).toBe('not_ready');
  });
});

describe('myIdShareText', () => {
  it('公開していればリンク・していなければ ID と入れる場所', async () => {
    const { myIdShareText } = await import('./social');
    expect(myIdShareText({})).toEqual({ text: '', url: '' });
    const pub = myIdShareText({ publicId: 'abcde12345', isPublic: true });
    expect(pub.url).toMatch(/\/u\/abcde12345$/);
    const priv = myIdShareText({ publicId: 'abcde12345', isPublic: false });
    expect(priv.url).toBe('');
    expect(priv.text).toContain('ID: abcde12345');
    expect(priv.text).toContain('フォローを申し込む');
  });
});

describe('summaryExcerpt', () => {
  it('文の終わりの改行は詰め、途中の改行は空白 1 つ・長ければ …', async () => {
    const { summaryExcerpt } = await import('./social');
    expect(summaryExcerpt('心を高める。\n考え方 × 熱意')).toBe('心を高める。考え方 × 熱意');
    expect(summaryExcerpt('影響の輪\n関心の輪')).toBe('影響の輪 関心の輪');
    expect(summaryExcerpt('あ'.repeat(100)).endsWith('…')).toBe(true);
    expect(summaryExcerpt('')).toBe('');
  });
});
