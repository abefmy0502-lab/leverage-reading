// 🧪 はじめての相談の答えのあとの 7 日間無料（実験・2026-10-08）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const updateUser = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })));
vi.mock('./supabase', () => ({ supabase: { auth: { updateUser } } }));

import {
  firstAnswerTrialGroup,
  isFirstAnswerTrialMoment,
  canOfferFirstAnswerTrial,
  holdGrownNudge,
  firstAnswerTrialText,
  isFirstAnswerTrialDone,
  markFirstAnswerTrialDone,
  FIRST_ANSWER_TRIAL_KEY,
  FIRST_ANSWER_TRIAL_META,
} from './firstAnswerTrial';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  updateUser.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('firstAnswerTrialGroup（振り分け）', () => {
  it('同じユーザー ID はいつも同じ組', () => {
    const id = '7b1e2c9a-0000-4000-8000-000000000001';
    const g = firstAnswerTrialGroup(id);
    expect(['show', 'hold']).toContain(g);
    for (let i = 0; i < 5; i += 1) expect(firstAnswerTrialGroup(id)).toBe(g);
  });
  it('ユーザー ID が無ければ振り分けない', () => {
    expect(firstAnswerTrialGroup('')).toBe(null);
    expect(firstAnswerTrialGroup(null)).toBe(null);
    expect(firstAnswerTrialGroup(undefined)).toBe(null);
  });
  it('おおよそ半分ずつに分かれる（UUID 4,000 件で 45〜55%）', () => {
    let show = 0;
    const N = 4000;
    for (let i = 0; i < N; i += 1) {
      const hex = i.toString(16).padStart(12, '0');
      if (firstAnswerTrialGroup(`a3f0c2d4-5e6f-4a7b-8c9d-${hex}`) === 'show') show += 1;
    }
    expect(show / N).toBeGreaterThan(0.45);
    expect(show / N).toBeLessThan(0.55);
  });
});

describe('isFirstAnswerTrialMoment（出せる答えか）', () => {
  const ok = { isFirst: true, memoCount: 3 };
  it('はじめての相談で、メモを使って答えたときだけ', () => {
    expect(isFirstAnswerTrialMoment(ok)).toBe(true);
    expect(isFirstAnswerTrialMoment({ ...ok, isFirst: false })).toBe(false);
    expect(isFirstAnswerTrialMoment({ ...ok, memoCount: 0 })).toBe(false);
  });
  it('関係するメモが無かった答え・根拠を確かめられなかった答え・中止した答えには出さない', () => {
    expect(isFirstAnswerTrialMoment({ ...ok, refunded: true })).toBe(false);
    expect(isFirstAnswerTrialMoment({ ...ok, grounded: false })).toBe(false);
    expect(isFirstAnswerTrialMoment({ ...ok, aborted: true })).toBe(false);
  });
});

describe('canOfferFirstAnswerTrial（出せる人か）', () => {
  const ok = { plan: 'free', offer: '7 日間無料' };
  it('無料プランで 7 日間無料を使える人だけ', () => {
    expect(canOfferFirstAnswerTrial(ok)).toBe(true);
    for (const plan of ['trial', 'paid', 'admin', null]) expect(canOfferFirstAnswerTrial({ ...ok, plan })).toBe(false);
    expect(canOfferFirstAnswerTrial({ ...ok, offer: '' })).toBe(false);
    expect(canOfferFirstAnswerTrial({ ...ok, hadPlan: true })).toBe(false);
  });
  it('一度出した・閉じた人、③ を閉じた・この画面で見た人には出さない', () => {
    expect(canOfferFirstAnswerTrial({ ...ok, done: true })).toBe(false);
    expect(canOfferFirstAnswerTrial({ ...ok, otherNudge: true })).toBe(false);
  });
});

describe('holdGrownNudge（③ と重ねない）', () => {
  it('見せる組で、まだ相談していない間だけ ③ を止める', () => {
    expect(holdGrownNudge({ group: 'show', consulted: false })).toBe(true);
    expect(holdGrownNudge({ group: 'show', consulted: true })).toBe(false);
    expect(holdGrownNudge({ group: 'hold', consulted: false })).toBe(false);
    expect(holdGrownNudge({ group: null, consulted: false })).toBe(false);
  });
});

describe('文と印', () => {
  it('1 行の文', () => {
    expect(firstAnswerTrialText('7 日間無料')).toBe('この相談相手と、7 日間無料でもっと話す');
    expect(firstAnswerTrialText('')).toBe('この相談相手と、7 日間無料でもっと話す');
  });
  it('出したら端末に覚える（アカウントには書かない）', () => {
    expect(isFirstAnswerTrialDone(null)).toBe(false);
    markFirstAnswerTrialDone('shown');
    expect(localStorage.getItem(FIRST_ANSWER_TRIAL_KEY)).toBe('shown');
    expect(isFirstAnswerTrialDone(null)).toBe(true);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it('閉じたら端末とアカウントの両方に覚える', () => {
    markFirstAnswerTrialDone('dismiss');
    expect(localStorage.getItem(FIRST_ANSWER_TRIAL_KEY)).toBe('dismiss');
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser.mock.calls[0][0].data[FIRST_ANSWER_TRIAL_META].action).toBe('dismiss');
  });
  it('端末の印が無くても、アカウントに印があれば出さない（端末を変えたとき）', () => {
    expect(isFirstAnswerTrialDone({ user_metadata: { [FIRST_ANSWER_TRIAL_META]: { action: 'tap' } } })).toBe(true);
    expect(isFirstAnswerTrialDone({ user_metadata: {} })).toBe(false);
  });
});
