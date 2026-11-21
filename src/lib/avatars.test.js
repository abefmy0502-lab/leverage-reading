import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AVATARS, cleanAvatarId, avatarInitial, avatarBackground, avatarById } from './avatars';
import { normalizeProfile } from './profile';

describe('自分のアイコン（2026-11-21）', () => {
  it('決まった 10 個・id は重ならない・色は代用表紙の 6 組', () => {
    expect(AVATARS).toHaveLength(10);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(10);
    for (const a of AVATARS) expect(a.color >= 1 && a.color <= 6).toBe(true);
  });
  it('SQL の CHECK と同じ一覧', () => {
    const sql = readFileSync(new URL('../../supabase_profiles.sql', import.meta.url), 'utf8');
    for (const a of AVATARS) expect(sql).toContain(`'${a.id}'`);
  });
  it('知らない id は外す・プロフィールにも通る', () => {
    expect(cleanAvatarId('dragon')).toBe('');
    expect(cleanAvatarId('cat')).toBe('cat');
    expect(normalizeProfile({ avatar: 'dragon' }).avatar).toBe('');
    expect(normalizeProfile({ avatar: 'moon' }).avatar).toBe('moon');
  });
  it('選んでいなければ 1 字か空', () => {
    expect(avatarInitial('ふみ')).toBe('ふ');
    expect(avatarInitial('fumi')).toBe('F');
    expect(avatarInitial('')).toBe('');
    expect(avatarBackground(null)).toBe('var(--fill)');
    expect(avatarBackground(avatarById('book'))).toContain('--cover-1a');
  });
});
