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
  it('関数が無い DB では not_ready', async () => {
    const r = await requestFollow('k7mna2pqrs', { client: client(null, { code: 'PGRST202', message: 'Could not find the function' }) });
    expect(r).toBe('not_ready');
  });
});
