// api/push-cron.js — 🎯 行動の期限の通知（2026-09-29）と、思い出しの通知との分け方を確かめる。
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

// ── 偽の Supabase（呼ばれたことを記録）と web-push ─────────────────────
const db = {};
const calls = [];
function resetDb() {
  Object.assign(db, {
    subs: [],
    actions: [],
    memos: [],
    missingDeadlineColumn: false,
  });
  calls.length = 0;
}

function query(table) {
  const st = { table, op: 'select', cols: '', filters: [], patch: null };
  const q = {
    select(cols) { if (st.op !== 'update') st.cols = cols || ''; else st.returning = true; return q; },
    update(patch) { st.op = 'update'; st.patch = patch; return q; },
    delete() { st.op = 'delete'; return q; },
    eq(k, v) { st.filters.push(['eq', k, v]); return q; },
    in(k, v) { st.filters.push(['in', k, v]); return q; },
    gte(k, v) { st.filters.push(['gte', k, v]); return q; },
    lt(k, v) { st.filters.push(['lt', k, v]); return q; },
    or(expr) { st.filters.push(['or', expr]); return q; },
    order() { return q; },
    limit() { return q; },
    then(res, rej) { return Promise.resolve(run(st)).then(res, rej); },
  };
  return q;
}
const f = (st, op, k) => st.filters.find((x) => x[0] === op && x[1] === k)?.[2];
function run(st) {
  calls.push(st);
  if (st.table === 'push_subscriptions' && st.op === 'select') {
    if (db.missingDeadlineColumn && st.cols.includes('last_deadline_sent_on')) {
      return { data: null, error: { message: 'column push_subscriptions.last_deadline_sent_on does not exist' } };
    }
    return { data: db.subs.filter((s) => s.enabled !== false).map((s) => ({ ...s })), error: null };
  }
  if (st.table === 'push_subscriptions' && st.op === 'update') {
    const row = db.subs.find((s) => s.id === f(st, 'eq', 'id'));
    if (!row) return { data: [], error: null };
    const or = st.filters.find((x) => x[0] === 'or');
    if (or) {
      const today = /lt\.(\d{4}-\d{2}-\d{2})/.exec(or[1])[1];
      if (row.last_deadline_sent_on && row.last_deadline_sent_on >= today) return { data: [], error: null };
    }
    Object.assign(row, st.patch);
    return { data: [{ id: row.id }], error: null };
  }
  if (st.table === 'actions') {
    const ids = f(st, 'in', 'user_id') || [];
    const from = f(st, 'gte', 'deadline');
    const until = f(st, 'lt', 'deadline');
    return {
      data: db.actions.filter((a) => ids.includes(a.user_id) && !a.done && a.deadline >= from && a.deadline < until),
      error: null,
    };
  }
  if (st.table === 'book_memos' && st.op === 'select') {
    return { data: db.memos.filter((m) => m.user_id === f(st, 'eq', 'user_id')), error: null };
  }
  return { data: [], error: null };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (t) => query(t) }),
}));
const sentPushes = [];
vi.mock('web-push', () => ({
  default: {
    setVapidDetails() {},
    sendNotification: async (sub, payload) => { sentPushes.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); },
  },
}));

let mod;
const NOW = Date.parse('2026-09-29T23:10:00Z'); // 日本時間 9/30 8:10
const realNow = Date.now.bind(Date);
beforeAll(async () => {
  process.env.CRON_SECRET = 'cron';
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  vi.spyOn(Date, 'now').mockImplementation(() => NOW);
  mod = await import('./push-cron.js');
});
afterAll(() => { Date.now = realNow; });
beforeEach(() => { resetDb(); sentPushes.length = 0; });

const U1 = 'user-1';
const webSub = (over = {}) => ({
  id: 'sub-1', user_id: U1, endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a',
  frequency: 'weekly', enabled: true, platform: 'web', apns_token: null,
  preferred_hour: 8, tz_offset_min: 540,
  last_sent_at: new Date(NOW - 2 * 86400000).toISOString(), // 思い出しの通知は 2 日前に送った
  last_deadline_sent_on: null,
  ...over,
});
const action = (over = {}) => ({ id: `a-${Math.random()}`, user_id: U1, text: '部下に近況を聞く', deadline: '2026-09-30', done: false, priority: 'medium', created_at: '2026-09-20T00:00:00Z', ...over });

function mockRes() {
  const res = { statusCode: 200, body: null, status(c) { res.statusCode = c; return res; }, json(b) { res.body = b; return res; } };
  return res;
}
const cronReq = () => ({ method: 'GET', headers: { authorization: 'Bearer cron' } });

describe('localClock（端末のローカルの日付と時）', () => {
  it('日本時間（+540）: UTC 9/29 23:10 → 9/30 の 8 時', () => {
    expect(mod.localClock(NOW, 540)).toEqual({ date: '2026-09-30', hour: 8 });
  });
  it('ニューヨーク（-240）: 9/29 の 19 時', () => {
    expect(mod.localClock(NOW, -240)).toEqual({ date: '2026-09-29', hour: 19 });
  });
  it('値が無い・おかしいときは日本時間とみなす', () => {
    expect(mod.localClock(NOW, null)).toEqual({ date: '2026-09-30', hour: 8 });
    expect(mod.localClock(NOW, 99999)).toEqual({ date: '2026-09-30', hour: 8 });
  });
});

describe('sendWindowOpen（送ってよい時刻か）', () => {
  it('毎日 1 回の Cron: 5〜21 時なら送る（preferred_hour は見ない）', () => {
    expect(mod.sendWindowOpen({ localHour: 4, preferredHour: 8 })).toBe(false);
    expect(mod.sendWindowOpen({ localHour: 7, preferredHour: 8 })).toBe(true);
    expect(mod.sendWindowOpen({ localHour: 21, preferredHour: 8 })).toBe(true);
    expect(mod.sendWindowOpen({ localHour: 22, preferredHour: 8 })).toBe(false);
  });
  it('1 時間ごとの Cron: preferred_hour を過ぎてから', () => {
    expect(mod.sendWindowOpen({ localHour: 8, preferredHour: 9, hourly: true })).toBe(false);
    expect(mod.sendWindowOpen({ localHour: 9, preferredHour: 9, hourly: true })).toBe(true);
    expect(mod.sendWindowOpen({ localHour: 8, preferredHour: null, hourly: true })).toBe(true); // 既定 8 時
  });
});

describe('pickDeadlineActions / deadlineMessage', () => {
  it('今日が期限で未完了の行動だけ（完了・別の日・繰り返しの次回分は除く）、優先度の高い順', () => {
    const list = [
      action({ id: 'done', done: true }),
      action({ id: 'tomorrow', deadline: '2026-10-01' }),
      action({ id: 'yesterday', deadline: '2026-09-29' }),
      action({ id: 'future-repeat', scheduled_for: '2026-10-07T00:00:00Z' }),
      action({ id: 'low', priority: 'low', text: '低い' }),
      action({ id: 'high', priority: 'high', text: '高い', created_at: '2026-09-25T00:00:00Z' }),
      action({ id: 'ts', deadline: '2026-09-30T00:00:00+09:00', text: '時刻つき' }),
    ];
    expect(mod.pickDeadlineActions(list, { localDate: '2026-09-30', now: NOW }).map((a) => a.id)).toEqual(['high', 'ts', 'low']);
  });
  it('1 件: その行動を本文に', () => {
    expect(mod.deadlineMessage([action()])).toEqual({ title: '🎯 今日が期限の行動があります', body: '部下に近況を聞く' });
  });
  it('2 件以上: 1 通にまとめる（件数＋1 件目 ほか）', () => {
    expect(mod.deadlineMessage([action({ text: '企画書を出す' }), action()]))
      .toEqual({ title: '🎯 今日が期限の行動が 2 件あります', body: '企画書を出す ほか' });
  });
  it('0 件: 送らない', () => {
    expect(mod.deadlineMessage([])).toBeNull();
  });
});

describe('思い出しの通知で選ぶメモ（2026-10-04）', () => {
  const old = (id, extra = {}) => ({ id, text: `メモ${id}`, createdAt: new Date(NOW - 100 * 86400000).toISOString(), ...extra });
  it('AI が書いたもの（AI まとめ）は送らない', () => {
    expect(mod.pickRecallMemo([old('ai', { sourceType: 'ai_summary' })], { now: NOW })).toBeNull();
    expect(mod.pickRecallMemo([old('ai', { kind: 'ai_summary' })], { now: NOW })).toBeNull();
    for (let seed = 0; seed < 10; seed += 1) {
      expect(mod.pickRecallMemo([old('ai', { sourceType: 'ai_summary' }), old('mine')], { now: NOW, seed })?.id).toBe('mine');
    }
  });
  it('夜に答えたメモも、端末の翌朝には出る（思い出した日の 0 時から数える）', () => {
    // 端末（JST）の 10/3 21:30 に答えた（recall_count 0 ＝ 1 日後）→ 10/4 8:00 JST には出る
    const answered = Date.UTC(2026, 9, 3, 12, 30);
    const morning = Date.UTC(2026, 9, 3, 23, 0);
    const n = old('n', { lastRecalledAt: new Date(answered).toISOString(), recallCount: 0 });
    expect(mod.pickRecallMemo([n], { now: morning, tzOffsetMin: 540 })?.id).toBe('n');
    expect(mod.pickRecallMemo([n], { now: Date.UTC(2026, 9, 3, 14, 0), tzOffsetMin: 540 })).toBeNull();
  });
});

describe('思い出しの通知は 3 日目ごろから・押すとそのメモへ（2026-10-10）', () => {
  const at = (id, days, extra = {}) => ({ id, text: `メモ${id}`, createdAt: new Date(NOW - days * 86400000).toISOString(), ...extra });
  it('通知は作ってから 2 日たったメモから出す（アプリのカードの既定 14 日は変えない）', () => {
    expect(mod.PUSH_RECALL_MIN_AGE_DAYS).toBe(2);
    expect(mod.pickRecallMemo([at('young', 1.5)], { now: NOW, minAgeDays: mod.PUSH_RECALL_MIN_AGE_DAYS })).toBeNull();
    expect(mod.pickRecallMemo([at('ok', 2.1)], { now: NOW, minAgeDays: mod.PUSH_RECALL_MIN_AGE_DAYS })?.id).toBe('ok');
    expect(mod.pickRecallMemo([at('ok', 2.1)], { now: NOW })).toBeNull(); // 既定は 14 日のまま
  });
  it('行き先: 本のメモ → 本とメモ／この本のまとめ → 本／本の無いメモ → 今までどおり', () => {
    expect(mod.recallUrl({ id: 'm1', bookId: 'b1', isMemoRow: true })).toBe('/?book=b1&memo=m1&push=recall');
    expect(mod.recallUrl({ id: 'summary-b1', bookId: 'b1', isMemoRow: false })).toBe('/?book=b1&push=recall');
    expect(mod.recallUrl({ id: 'm2', bookId: null, isMemoRow: true })).toBe('/?recall=m2&push=recall');
  });
  it('始めて 3 日目の人にも届き、押すとそのメモへ（週に 1 回のガードはそのまま）', async () => {
    db.subs = [webSub({ last_sent_at: null })];
    db.memos = Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, book_id: 'b1', user_id: U1, text: `メモ ${i}`, created_at: new Date(NOW - 2.5 * 86400000).toISOString() }));
    const res = mockRes();
    await mod.default(cronReq(), res);
    expect(res.body.sent).toBe(1);
    expect(sentPushes[0].tag).toBe('orime-recall');
    expect(sentPushes[0].url).toMatch(/^\/\?book=b1&memo=m[0-2]&push=recall$/);
    expect(db.subs[0].last_sent_at).toBe(new Date(NOW).toISOString());
  });
  it('書いたばかり（2 日たっていない）のメモだけなら送らない', async () => {
    db.subs = [webSub({ last_sent_at: null })];
    db.memos = Array.from({ length: 3 }, (_, i) => ({ id: `m${i}`, book_id: 'b1', user_id: U1, text: `メモ ${i}`, created_at: new Date(NOW - 1 * 86400000).toISOString() }));
    const res = mockRes();
    await mod.default(cronReq(), res);
    expect(res.body.sent).toBe(0);
  });
});

describe('ガード（思い出しの通知と期限の通知は別々）', () => {
  it('思い出しの通知は 6.5 日たつまで送らない（毎日の Cron でも多くても週に 1 回）', () => {
    expect(mod.recallDue(new Date(NOW - 6 * 86400000).toISOString(), NOW)).toBe(false);
    expect(mod.recallDue(new Date(NOW - 7 * 86400000 + 3600000).toISOString(), NOW)).toBe(true); // Cron の時刻の揺れ（-1 時間）でも 7 日目は送る
    expect(mod.recallDue(null, NOW)).toBe(true);
    expect(mod.recallDue('broken', NOW)).toBe(true);
  });
  it('期限の通知は、その端末のローカルの今日に 1 回だけ', () => {
    expect(mod.deadlineAlreadySent(null, '2026-09-30')).toBe(false);
    expect(mod.deadlineAlreadySent('2026-09-29', '2026-09-30')).toBe(false);
    expect(mod.deadlineAlreadySent('2026-09-30', '2026-09-30')).toBe(true);
  });
});

describe('handler（Cron の 1 回の実行）', () => {
  it('期限の行動が 2 件 → 1 通にまとめて送り、振り返り → 行動へ。今日の分を記録する（思い出しの通知は 2 日前なので送らない）', async () => {
    db.subs = [webSub()];
    db.actions = [action({ text: '企画書を出す', priority: 'high' }), action(), action({ user_id: 'other' })];
    const res = mockRes();
    await mod.default(cronReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.deadline_sent).toBe(1);
    expect(res.body.sent).toBe(0);
    expect(sentPushes).toHaveLength(1);
    expect(sentPushes[0]).toMatchObject({
      title: '🎯 今日が期限の行動が 2 件あります', body: '企画書を出す ほか', url: '/?tab=review&sub=action&push=action_deadline', tag: 'orime-action-deadline',
    });
    expect(db.subs[0].last_deadline_sent_on).toBe('2026-09-30');
    expect(db.subs[0].last_sent_at).toBe(new Date(NOW - 2 * 86400000).toISOString()); // 思い出しのガードは触らない
  });
  it('同じ日にもう一度走っても、二度は送らない', async () => {
    db.subs = [webSub({ last_deadline_sent_on: '2026-09-30' })];
    db.actions = [action()];
    const res = mockRes();
    await mod.default(cronReq(), res);
    expect(sentPushes).toHaveLength(0);
    expect(res.body.deadline_sent).toBe(0);
  });
  it('思い出しの通知の日でも、期限の通知は別に送る（どちらかがもう片方を止めない）', async () => {
    db.subs = [webSub({ last_sent_at: null })];
    db.actions = [action()];
    db.memos = Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, user_id: U1, text: `メモ ${i}`, created_at: '2026-06-01T00:00:00Z' }));
    const res = mockRes();
    await mod.default(cronReq(), res);
    expect(sentPushes.map((p) => p.tag).sort()).toEqual(['orime-action-deadline', 'orime-recall']);
    expect(res.body.sent).toBe(1);
    expect(res.body.deadline_sent).toBe(1);
  });
  it('通知をオフ（frequency=off）にした端末には送らない', async () => {
    db.subs = [webSub({ frequency: 'off' })];
    db.actions = [action()];
    await mod.default(cronReq(), mockRes());
    expect(sentPushes).toHaveLength(0);
  });
  it('期限の行動が無い日は何も送らない（完了済み・別の日だけ）', async () => {
    db.subs = [webSub()];
    db.actions = [action({ done: true }), action({ deadline: '2026-10-01' })];
    await mod.default(cronReq(), mockRes());
    expect(sentPushes).toHaveLength(0);
    expect(db.subs[0].last_deadline_sent_on).toBeNull();
  });
  it('端末のローカル時刻が夜中（5 時前）なら送らない', async () => {
    db.subs = [webSub({ tz_offset_min: 60 })]; // UTC+1: 9/30 0:10
    db.actions = [action()];
    await mod.default(cronReq(), mockRes());
    expect(sentPushes).toHaveLength(0);
  });
  it('last_deadline_sent_on の列が無い DB: 期限の通知だけ送らず、思い出しの通知は送る（fail-safe）', async () => {
    db.missingDeadlineColumn = true;
    db.subs = [webSub({ last_sent_at: null })];
    db.actions = [action()];
    db.memos = Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, user_id: U1, text: `メモ ${i}`, created_at: '2026-06-01T00:00:00Z' }));
    const res = mockRes();
    await mod.default(cronReq(), res);
    expect(sentPushes.map((p) => p.tag)).toEqual(['orime-recall']);
    expect(res.body.deadline_sent).toBe(0);
  });
});
