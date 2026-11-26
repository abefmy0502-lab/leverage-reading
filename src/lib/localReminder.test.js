import { describe, it, expect, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false } }));
import { planReminders, REMINDER_IDS, REMINDER_HOUR, isLocalReminderCapable } from './localReminder';

const NOW = Date.parse('2026-11-26T03:00:00Z');
const DAY = 86400000;
const memo = (id, days, extra = {}) => ({ id, bookId: 'b', text: `メモ ${id} の本文`, createdAt: new Date(NOW - days * DAY).toISOString(), ...extra });

describe('端末の中だけの思い出しの通知（2026-11-26）', () => {
  it('Web・お試しでは使わない', () => {
    expect(isLocalReminderCapable()).toBe(false);
  });
  it('3・10・24 日後の夜 20 時に、違うメモを 1 通ずつ（間は 7 日以上＝週 1 回まで）', () => {
    const plan = planReminders({ now: NOW, memos: [memo('a', 40), memo('b', 20), memo('c', 5)] });
    expect(plan.map((p) => p.id)).toEqual(REMINDER_IDS);
    const days = plan.map((p) => Math.round((p.at - NOW) / DAY));
    expect(days[1] - days[0]).toBeGreaterThanOrEqual(7);
    expect(days[2] - days[1]).toBeGreaterThanOrEqual(7);
    plan.forEach((p) => expect(new Date(p.at).getHours()).toBe(REMINDER_HOUR));
    expect(new Set(plan.map((p) => p.body)).size).toBe(3);
    expect(plan[0].title).toBe('前に書いたメモ');
  });
  it('AI のまとめは出さない・メモが無く読み始めていない人は本棚で待っている本を 1 通だけ・何も無ければ置かない', () => {
    expect(planReminders({ now: NOW, memos: [memo('ai', 30, { sourceType: 'ai_summary' })], books: [] })).toEqual([]);
    const p = planReminders({ now: NOW, memos: [], books: [{ id: 'w', title: '最初の 1 冊', status: 'want' }] });
    expect(p).toHaveLength(1);
    expect(p[0].body).toBe('『最初の 1 冊』');
    expect(planReminders({ now: NOW, memos: [], books: [{ id: 'r', title: 'x', status: 'reading' }] })).toEqual([]);
  });
});
