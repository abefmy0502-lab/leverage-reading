import { describe, it, expect, vi } from 'vitest';
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false } }));
import { planReminders, planDeadlineReminders, REMINDER_IDS, DEADLINE_IDS, REMINDER_HOUR, DEADLINE_HOUR, isLocalReminderCapable } from './localReminder';

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
    const titled = planReminders({ now: NOW, memos: [memo('a', 40)], books: [{ id: 'b', title: 'イシューからはじめよ', status: 'done' }] });
    expect(titled[0].title).toBe('『イシューからはじめよ』のメモ');
  });
  it('AI のまとめは出さない・メモが無く読み始めていない人は本棚で待っている本を 1 通だけ・何も無ければ置かない', () => {
    expect(planReminders({ now: NOW, memos: [memo('ai', 30, { sourceType: 'ai_summary' })], books: [] })).toEqual([]);
    const p = planReminders({ now: NOW, memos: [], books: [{ id: 'w', title: '最初の 1 冊', status: 'want' }] });
    expect(p).toHaveLength(1);
    expect(p[0].body).toBe('『最初の 1 冊』');
    expect(planReminders({ now: NOW, memos: [], books: [{ id: 'r', title: 'x', status: 'reading' }] })).toEqual([]);
  });
});

describe('行動の期限の日の朝の通知（2026-11-27）', () => {
  const ymd = (d) => { const x = new Date(NOW + d * DAY); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  it('期限の日の朝 8 時に 1 通・同じ日はまとめる・終わった行動と過ぎた期限は出さない・近い 3 日まで', () => {
    const books = [
      { id: 'a', title: 'A', actions: [{ text: '1on1 で質問から入る', deadline: ymd(1), done: false }, { text: '朝 15 分読む', deadline: ymd(1), done: false }, { text: '済んだ', deadline: ymd(2), done: true }, { text: '昔', deadline: ymd(-2), done: false }] },
      { id: 'b', title: 'B', actions: [{ text: 'x', deadline: ymd(3) }, { text: 'y', deadline: ymd(4) }, { text: 'z', deadline: ymd(5) }, { text: '遠い', deadline: ymd(20) }] },
      { id: 'c', title: 'C', archivedAt: '2026-11-01', actions: [{ text: 'しまった本', deadline: ymd(1) }] },
    ];
    const plan = planDeadlineReminders({ now: NOW, books });
    expect(plan.map((p) => p.id)).toEqual(DEADLINE_IDS);
    expect(plan[0].title).toBe('今日が期限の行動');
    expect(plan[0].body).toBe('「1on1 で質問から入る」 ほか 1 件');
    expect(plan[1].body).toBe('「x」');
    plan.forEach((p) => expect(new Date(p.at).getHours()).toBe(DEADLINE_HOUR));
  });
  it('繰り返しの次の回で、まだ画面に出ていない行動には置かない（2026-11-28）', () => {
    const later = new Date(NOW + 5 * DAY).toISOString();
    const books = [{ id: 'a', title: 'A', actions: [{ text: '来週の分', deadline: ymd(6), scheduledFor: later }, { text: '今の分', deadline: ymd(2) }] }];
    expect(planDeadlineReminders({ now: NOW, books }).map((p) => p.body)).toEqual(['「今の分」']);
  });
  it('期限の無い行動・行動が無い本では何も置かない', () => {
    expect(planDeadlineReminders({ now: NOW, books: [{ id: 'a', actions: [{ text: 'x' }] }, { id: 'b' }] })).toEqual([]);
  });
});

