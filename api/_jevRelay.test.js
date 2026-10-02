// 🧭 アプリ → Jev の中継（api/_jevRelay.js）と、問いの組み立て（api/_jevTasks.js）・行き先の決まり（api/_aiRouting.js）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleJevRelay, jevMonthlyLimit, jevPeriodKey, __resetJevRateForTest } from './_jevRelay.js';
import {
  readRelevanceInput, relevanceRequests, relevanceResult, readFilingInput, filingRequests, filingResult,
  readIntentInput, intentRequests, intentResult, cleanJevText, RELEVANCE_MAX_MEMOS,
} from './_jevTasks.js';
import { resolveJevRoute, JEV_ROUTES, JEV_PURPOSES, JEV_CONSENT_VERSION, isJevPurpose, ROUTES, PURPOSES } from './_aiRouting.js';

const ENV = { JEV_ENABLED: 'true', JEV_API_KEY: 'k', JEV_TASK_MEMO_RELEVANCE: 'on', JEV_TASK_INTENT: 'on' };
const memos = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, text: `メモ${i}の本文。部下に任せると動く。`, book: '1兆ドルコーチ' }));

beforeEach(() => { __resetJevRateForTest(); vi.spyOn(console, 'info').mockImplementation(() => {}); });

describe('行き先の決まり（resolveJevRoute）', () => {
  const ok = (extra = {}) => resolveJevRoute({ purpose: 'memo_relevance', tier: 'paid', consentVersion: 2, env: ENV, ...extra });
  it('スイッチ・鍵・用途のスイッチ・プラン・同意の版がそろったときだけ', () => {
    expect(ok()).toEqual({ ok: true });
    expect(ok({ env: { ...ENV, JEV_ENABLED: '' } })).toEqual({ ok: false, reason: 'off' });
    expect(ok({ env: { ...ENV, JEV_API_KEY: '' } })).toEqual({ ok: false, reason: 'off' });
    expect(ok({ env: { ...ENV, JEV_TASK_MEMO_RELEVANCE: '' } })).toEqual({ ok: false, reason: 'task_off' });
    expect(ok({ consentVersion: 1 })).toEqual({ ok: false, reason: 'consent' });
    expect(ok({ consentVersion: null })).toEqual({ ok: false, reason: 'consent' });
    expect(resolveJevRoute({ purpose: 'consult', tier: 'paid', consentVersion: 2, env: ENV })).toEqual({ ok: false, reason: 'unknown' });
  });
  it('相談の中の判断（memo_relevance / intent）は無料プランも。合いそうなタグ（memo_filing）は中継しない', () => {
    expect(ok({ tier: 'free' }).ok).toBe(true);
    expect(resolveJevRoute({ purpose: 'intent', tier: 'free', consentVersion: 2, env: ENV }).ok).toBe(true);
    expect(resolveJevRoute({ purpose: 'memo_filing', tier: 'paid', consentVersion: 2, env: ENV })).toEqual({ ok: false, reason: 'unknown' });
    expect(JEV_PURPOSES).toEqual(['memo_relevance', 'intent']);
  });
  it('Jev の用途は文を書く用途（ROUTES）と重ならない・Claude に切り替えない', () => {
    for (const p of JEV_PURPOSES) {
      expect(ROUTES[p]).toBeUndefined();
      expect(PURPOSES.includes(p)).toBe(false);
      expect(JEV_ROUTES[p].primary).toMatch(/^typesafe:jev-/);
      expect(isJevPurpose(p)).toBe(true);
    }
    expect(isJevPurpose('toString')).toBe(false);
    expect(JEV_CONSENT_VERSION).toBe(2);
  });
});

describe('材料を整える（アプリから届くのは材料だけ・問いの文はサーバーが作る）', () => {
  it('制御文字を外し、角かっこを全角に（ほかのメモの印になりすまさない）', () => {
    expect(cleanJevText('a\u0000b [m3] c\u202e', 100)).toBe('ab ［m3］ c');
    expect(cleanJevText('あ'.repeat(500), 10)).toBe('あ'.repeat(10));
  });
  it('relevance: 30 件まで・id は m0〜m99 だけ・同じ id は 1 回・本文は 160 字まで', () => {
    const r = readRelevanceInput({ question: '部下が動かない', memos: [...memos(40), { id: '1234-uuid', text: 'x' }, { id: 'm1', text: '重複' }] });
    expect(r.memos).toHaveLength(RELEVANCE_MAX_MEMOS);
    expect(r.memos.every((m) => /^m\d+$/.test(m.id))).toBe(true);
    expect(readRelevanceInput({ question: '', memos: memos(2) })).toBe(null);
    expect(readRelevanceInput({ question: 'q', memos: [] })).toBe(null);
    expect(readRelevanceInput({ question: 'q', memos: [{ id: 'm0', text: 'い'.repeat(500) }] }).memos[0].text).toHaveLength(160);
  });
  it('relevance の問い: 6 件ずつの回に分け、その回の state にはその回のメモだけ', () => {
    const input = readRelevanceInput({ question: '部下が動かない', memos: memos(14) });
    const reqs = relevanceRequests(input, { maxQuestions: 6 });
    expect(reqs).toHaveLength(3);
    expect(Object.keys(reqs[0].questions)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5']);
    expect(reqs[0].state).toContain('[m5]');
    expect(reqs[0].state).not.toContain('[m6]');
    expect(reqs[2].state).toContain('部下が動かない');
    expect(reqs[0].questions.m0).toMatchObject({ type: 'noul', criteria: { true: expect.any(String), false: expect.any(String) } });
    const answers = Object.fromEntries(input.memos.map((m, i) => [m.id, { type: 'noul', p: i / 20 }]));
    expect(relevanceResult(answers, input).scores.m10).toBe(0.5);
    expect(relevanceResult({}, input)).toBe(null);
  });
  it('filing: タグは 20 個まで・重ならない・答えは送った順の確率', () => {
    const input = readFilingInput({ memo: '任せることが育てること', book: '1兆ドルコーチ', tags: ['マネジメント', 'マネジメント', '習慣', '', 'x'.repeat(50)] });
    expect(input.tags).toEqual(['マネジメント', '習慣', 'x'.repeat(30)]);
    const [req] = filingRequests(input);
    expect(Object.keys(req.questions)).toEqual(['t0', 't1', 't2']);
    expect(req.state).toContain('任せることが育てること');
    expect(filingResult({ t0: { type: 'noul', p: 0.9 }, t1: { type: 'noul', p: 0.1 }, t2: { type: 'noul', p: 0.2 } }, input)).toEqual({ probs: [0.9, 0.1, 0.2] });
    expect(readFilingInput({ memo: 'x', tags: [] })).toBe(null);
  });
  it('intent: 4 つから 1 つを選ぶ', () => {
    const input = readIntentInput({ question: 'チームの話はどの本だっけ' });
    const [req] = intentRequests(input);
    expect(Object.keys(req.questions.intent.criteria)).toEqual(['lookup', 'consult', 'decide_action', 'other']);
    expect(intentResult({ intent: { type: 'choice', choice: 'lookup', confidence: 0.9 } })).toMatchObject({ intent: 'lookup', confidence: 0.9 });
    expect(intentResult({ intent: { type: 'choice', choice: 'weird' } })).toBe(null);
  });
});

describe('中継（handleJevRelay）', () => {
  const okFetch = vi.fn(async (_u, init) => {
    const qs = JSON.parse(init.body).questions;
    return { ok: true, status: 200, json: async () => ({ answers: Object.fromEntries(Object.keys(qs).map((k, i) => [k, { noul: i % 2 ? 0.9 : 0.1 }])), usage: { input_tokens: 500 } }) };
  });
  const deps = () => ({ reserveCall: vi.fn(async () => ({ allowed: true, reserved: true })), addCost: vi.fn(async () => {}) });
  const run = (extra = {}) => handleJevRelay({
    body: { purpose: 'memo_relevance', jev: { question: '部下が動かない', memos: memos(4) } },
    tier: 'paid', consentVersion: 2, userId: 'u1', monthKey: '2026-10', env: ENV, fetchImpl: okFetch, deps: deps(), ...extra,
  });

  it('使えるときは { jev: { result } }・原価を jev-YYYY-MM の行に足す', async () => {
    const d = deps();
    const out = await run({ deps: d });
    expect(out.status).toBe(200);
    expect(out.body.jev.result.scores).toEqual({ m0: 0.1, m1: 0.9, m2: 0.1, m3: 0.9 });
    expect(d.reserveCall).toHaveBeenCalledWith('jev-2026-10', 600);
    expect(d.addCost).toHaveBeenCalledWith('jev-2026-10', expect.any(Number));
    expect(jevPeriodKey('2026-10')).toBe('jev-2026-10');
  });

  it('使えないときはいつも 200 の { jev: null, reason }（有料プランの画面・トークンの案内を出さない）', async () => {
    const cases = [
      [{ env: {} }, 'off'],
      [{ consentVersion: 1 }, 'consent'],
      [{ body: { purpose: 'memo_filing', jev: { memo: 'x', tags: ['a'] } } }, 'unknown'],
      [{ body: { purpose: 'memo_relevance', jev: { question: '', memos: [] } } }, 'bad_input'],
    ];
    for (const [extra, reason] of cases) {
      const d = deps();
      // eslint-disable-next-line no-await-in-loop
      const out = await run({ ...extra, deps: d });
      expect(out).toEqual({ status: 200, body: { jev: null, reason } });
      expect(d.reserveCall).not.toHaveBeenCalled();
    }
  });

  it('数えられない（RPC が無い）・月の上限 → 送らない', async () => {
    const f = vi.fn();
    expect((await run({ fetchImpl: f, deps: { reserveCall: async () => ({ allowed: true, reserved: false }), addCost: vi.fn() } })).body.reason).toBe('uncounted');
    expect((await run({ fetchImpl: f, deps: { reserveCall: async () => ({ allowed: false, reserved: true }), addCost: vi.fn() } })).body.reason).toBe('limit');
    expect((await run({ fetchImpl: f, deps: { reserveCall: async () => { throw new Error('db'); }, addCost: vi.fn() } })).body.reason).toBe('uncounted');
    expect(f).not.toHaveBeenCalled();
    expect(jevMonthlyLimit({ JEV_MONTHLY_CALL_LIMIT: '50' })).toBe(50);
  });

  it('Jev が失敗したら { jev: null, reason: upstream }', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await run({ fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) });
    expect(out.body).toEqual({ jev: null, reason: 'upstream' });
  });

  it('分間の上限（既定 20 回）を超えたら送らない', async () => {
    let last;
    for (let i = 0; i < 21; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      last = await run({ env: { ...ENV, JEV_RATE_PER_MIN: '20' } });
    }
    expect(last.body.reason).toBe('rate');
  });

  it('ログに材料の中身を書かない', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await run();
    const logged = info.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).not.toContain('部下');
    expect(logged).not.toContain('メモ');
  });
});
