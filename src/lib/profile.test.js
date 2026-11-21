import { describe, it, expect } from 'vitest';
import { normalizeProfile, hasProfile, newPublicId, favoriteChanged, addressName, saveProfile, loadProfile } from './profile';

describe('プロフィール（2026-11-21）', () => {
  it('長さ・表紙・ISBN を整える', () => {
    const p = normalizeProfile({ nickname: ' ふ\nみ ', favCover: 'http://x/a.jpg', favIsbn: '978-4-86276-085-2', favLine: 'あ'.repeat(100) });
    expect(p.nickname).toBe('ふ み');
    expect(p.favCover).toBe('');
    expect(p.favIsbn).toBe('9784862760852');
    expect([...p.favLine].length).toBe(80);
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
