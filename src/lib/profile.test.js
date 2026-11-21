import { describe, it, expect } from 'vitest';
import { normalizeProfile, hasProfile, newPublicId, favoriteChanged, addressName, saveProfile, loadProfile, PROFILE_LIMITS } from './profile';

describe('プロフィール（2026-11-21）', () => {
  it('長さ・表紙・ISBN を整える', () => {
    const p = normalizeProfile({ nickname: ' ふ\nみ ', favCover: 'http://x/a.jpg', favIsbn: '978-4-86276-085-2', favLine: 'あ'.repeat(300) });
    expect(p.nickname).toBe('ふ み');
    expect(p.favCover).toBe('');
    expect(p.favIsbn).toBe('9784862760852');
    expect([...p.favLine].length).toBe(PROFILE_LIMITS.line);
  });
  it('中身の有無・呼び方', () => {
    expect(hasProfile({})).toBe(false);
    expect(hasProfile({ favTitle: '考え方' })).toBe(true);
    expect(addressName({ nickname: 'ふみ' })).toBe('ふみさん');
    expect(addressName({ nickname: 'ふみさん' })).toBe('ふみさん');
    expect(addressName({})).toBe('');
  });
  it('公開の id は 10 字・見分けにくい字を使わない', () => {
    const id = newPublicId();
    expect(id).toMatch(/^[a-km-np-z2-9]{10}$/);
  });
  it('好きな本か 1 行が変わったときだけ本棚へ', () => {
    const a = { favTitle: '考え方', favLine: 'x' };
    expect(favoriteChanged({}, a)).toBe(true);
    expect(favoriteChanged(a, { ...a })).toBe(false);
    expect(favoriteChanged(a, { ...a, favLine: 'y' })).toBe(true);
    expect(favoriteChanged(a, { favTitle: '' })).toBe(false);
  });
  it('表が無ければ端末に控え、公開はしない', async () => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const r = await saveProfile('u1', { nickname: 'ふみ', isPublic: true }, { client: null });
    expect(r.stored).toBe('local');
    expect(r.profile.isPublic).toBe(false);
    const l = await loadProfile('u1', { client: null });
    expect(l.profile.nickname).toBe('ふみ');
  });
});

describe('公開の本棚・自己紹介（2026-11-21）', async () => {
  const { shelfShows, withShelfHidden } = await import('./profile');
  const id = '00000000-0000-4000-8000-000000000001';
  it('本棚も公開しているときだけ出し、外した本は出さない', () => {
    expect(shelfShows({ isPublic: true, shelfPublic: false }, id)).toBe(false);
    expect(shelfShows({ isPublic: false, shelfPublic: true }, id)).toBe(false);
    const p = { isPublic: true, shelfPublic: true, shelfHidden: [] };
    expect(shelfShows(p, id)).toBe(true);
    const hidden = withShelfHidden(p, id, true);
    expect(shelfShows(hidden, id)).toBe(false);
    expect(shelfShows(withShelfHidden(hidden, id, false), id)).toBe(true);
  });
  it('自己紹介は 160 字・改行は 1 つずつ・id でないものは外す', () => {
    const p = normalizeProfile({ bio: 'あ\n\n\nい' + 'う'.repeat(200), shelfHidden: ['x', id, id] });
    expect(p.bio.startsWith('あ\nい')).toBe(true);
    expect([...p.bio].length).toBe(160);
    expect(p.shelfHidden).toEqual([id]);
  });
});

describe('公開をやめたら本棚の公開もやめる', () => {
  it('公開がオフなら本棚の公開もオフとして扱う', () => {
    expect(normalizeProfile({ isPublic: false, shelfPublic: true }).shelfPublic).toBe(false);
    expect(normalizeProfile({ isPublic: true, shelfPublic: true }).shelfPublic).toBe(true);
  });
});
