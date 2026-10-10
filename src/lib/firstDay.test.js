import { describe, it, expect, beforeEach } from 'vitest';
import {
  GROWTH_GOAL,
  growthLeft,
  growthMeterText,
  firstAnswerEvidence,
  rememberOnboardPath,
  getOnboardPath,
  takeOnboardPathDone,
  takeFirstConsult,
  takeMemosReached,
  grownLinePending,
  markGrownLineDone,
  rememberHomeMemoCount,
  lastHomeMemoCount,
  showGrowthPlaceholder,
  clearFirstDayDeviceData,
  HOME_MEMO_COUNT_KEY,
  FIRST_DAY_KEYS,
} from './firstDay';
import { TRIAL_NUDGE_MEMOS, shouldShowTrialNudge } from './trialNudge';

// vitest の環境に localStorage が無いときのための小さな代わり。
function installStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
  };
}

describe('相談相手が育つまでの一行（growthMeterText）', () => {
  it('1〜9 件のときだけ「あと N 件で相談相手が育ちます」', () => {
    expect(growthMeterText(1)).toBe('あと 9 件で相談相手が育ちます');
    expect(growthMeterText(3)).toBe('あと 7 件で相談相手が育ちます');
    expect(growthMeterText(9)).toBe('あと 1 件で相談相手が育ちます');
    expect(growthLeft(3)).toBe(7);
  });
  it('相談相手を絞っているときは「メモ全体で、」と言う（上の行の件数と食い違って見えないように）', () => {
    expect(growthMeterText(3, { overall: true })).toBe('メモ全体で、あと 7 件で相談相手が育ちます');
    expect(growthMeterText(12, { overall: true })).toBeNull();
  });
  it('0 件・10 件以上・分からないときは出さない', () => {
    expect(growthMeterText(0)).toBeNull();
    expect(growthMeterText(10)).toBeNull();
    expect(growthMeterText(43)).toBeNull();
    expect(growthMeterText(null)).toBeNull();
    expect(growthMeterText(undefined)).toBeNull();
    expect(growthMeterText(NaN)).toBeNull();
  });
  it('7 日間無料の案内（10 件から）と重ならない: メーターが出る件数では案内は出ない', () => {
    expect(GROWTH_GOAL).toBe(TRIAL_NUDGE_MEMOS);
    for (let n = 0; n <= 30; n += 1) {
      const meter = growthMeterText(n) != null;
      const nudge = shouldShowTrialNudge({ plan: 'free', memoCount: n, done: false, freeUsedUp: false, empty: true });
      expect(meter && nudge, `${n} 件`).toBe(false);
    }
  });
});

describe('はじめての相談の「あなたのメモ N 件から答えました」（firstAnswerEvidence）', () => {
  it('参照から数えた行があれば、そのまま（はじめてかどうかに関係なく）', () => {
    const ev = 'あなたのメモ 2 件から答えました';
    expect(firstAnswerEvidence({ evidence: ev, memoCount: 5, isFirst: true })).toBe(ev);
    expect(firstAnswerEvidence({ evidence: ev, memoCount: 5, isFirst: false })).toBe(ev);
  });
  it('はじめての相談は、参照から数えられなくても使ったメモの数で出す', () => {
    expect(firstAnswerEvidence({ evidence: null, memoCount: 3, isFirst: true })).toBe('あなたのメモ 3 件から答えました');
  });
  it('2 回目以降・関係するメモが無かった答え・メモ 0 件は出さない（盛らない）', () => {
    expect(firstAnswerEvidence({ evidence: null, memoCount: 3, isFirst: false })).toBeNull();
    expect(firstAnswerEvidence({ evidence: null, memoCount: 3, isFirst: true, refunded: true })).toBeNull();
    expect(firstAnswerEvidence({ evidence: null, memoCount: 0, isFirst: true })).toBeNull();
  });
  it('根拠を 1 件も渡したメモで確かめられなかった答え（grounded: false）には、はじめてでも出さない（2026-10-04）', () => {
    expect(firstAnswerEvidence({ evidence: null, memoCount: 16, isFirst: true, grounded: false })).toBeNull();
    expect(firstAnswerEvidence({ evidence: null, memoCount: 16, isFirst: true, grounded: true })).toBe('あなたのメモ 16 件から答えました');
  });
});

describe('計測の印（1 回だけ送る）', () => {
  beforeEach(() => installStorage());

  it('初回ガイドで選んだ道を覚え、その道を終えたとき 1 回だけ', () => {
    expect(getOnboardPath()).toBeNull();
    rememberOnboardPath('nope');
    expect(getOnboardPath()).toBeNull();
    rememberOnboardPath('ocr');
    expect(getOnboardPath()).toBe('ocr');
    expect(takeOnboardPathDone('import')).toBe(false); // 選んでいない道
    expect(takeOnboardPathDone('ocr')).toBe(true);
    expect(takeOnboardPathDone('ocr')).toBe(false);
  });

  it('はじめての相談は 1 回だけ', () => {
    expect(takeFirstConsult()).toBe(true);
    expect(takeFirstConsult()).toBe(false);
  });

  it('10 件より少ないのを見たあとで 10 件以上になったら 1 回だけ', () => {
    expect(takeMemosReached(3)).toBe(false);
    expect(takeMemosReached(9)).toBe(false);
    expect(takeMemosReached(10)).toBe(true);
    expect(takeMemosReached(12)).toBe(false);
  });

  it('10 件を越えたのを見たら、ホームの「育ちました」を押す／閉じるまで 1 回だけ', () => {
    expect(grownLinePending()).toBe(false);
    takeMemosReached(9);
    expect(grownLinePending()).toBe(false);
    takeMemosReached(10);
    expect(grownLinePending()).toBe(true);
    markGrownLineDone();
    expect(grownLinePending()).toBe(false);
  });

  it('前からのユーザーには「育ちました」を出さない', () => {
    takeMemosReached(40);
    expect(grownLinePending()).toBe(false);
  });

  it('はじめから 10 件以上（前からのユーザー）は送らない', () => {
    expect(takeMemosReached(40)).toBe(false);
    expect(takeMemosReached(3)).toBe(false); // あとで減っても数え直さない
    expect(takeMemosReached(11)).toBe(false);
  });

  it('分からない件数は数えない', () => {
    expect(takeMemosReached(null)).toBe(false);
    expect(takeMemosReached(NaN)).toBe(false);
    expect(takeMemosReached(10)).toBe(false); // 少ないのをまだ見ていない
  });
});

describe('ホームの数えている間の形（前回の件数を覚える・2026-10-02 ui-critic r2）', () => {
  beforeEach(() => installStorage());

  it('はじめて開いたとき（覚えていない）は形を出さない', () => {
    expect(lastHomeMemoCount()).toBeNull();
    expect(showGrowthPlaceholder(lastHomeMemoCount())).toBe(false);
  });

  it('前回 1〜9 件なら形を出す・0 件と 10 件以上は出さない', () => {
    rememberHomeMemoCount(3);
    expect(lastHomeMemoCount()).toBe(3);
    expect(showGrowthPlaceholder(lastHomeMemoCount())).toBe(true);
    rememberHomeMemoCount(0);
    expect(showGrowthPlaceholder(lastHomeMemoCount())).toBe(false);
    rememberHomeMemoCount(10);
    expect(showGrowthPlaceholder(lastHomeMemoCount())).toBe(false);
    rememberHomeMemoCount(42);
    expect(showGrowthPlaceholder(lastHomeMemoCount())).toBe(false);
  });

  it('分からない件数は覚えない（前の値のまま）', () => {
    rememberHomeMemoCount(5);
    rememberHomeMemoCount(null);
    rememberHomeMemoCount(NaN);
    rememberHomeMemoCount(-1);
    expect(lastHomeMemoCount()).toBe(5);
  });
});

describe('サインアウトで端末の印を消す（clearFirstDayDeviceData）', () => {
  beforeEach(() => installStorage());

  it('前回の件数と初日の印をすべて消す（ほかのキーは残す）', () => {
    rememberHomeMemoCount(4);
    rememberOnboardPath('import');
    takeOnboardPathDone('import');
    takeFirstConsult();
    takeMemosReached(3);
    localStorage.setItem('onboardingCompleted', 'true');
    clearFirstDayDeviceData();
    expect(localStorage.getItem(HOME_MEMO_COUNT_KEY)).toBeNull();
    for (const k of Object.values(FIRST_DAY_KEYS)) expect(localStorage.getItem(k), k).toBeNull();
    expect(localStorage.getItem('onboardingCompleted')).toBe('true');
    // 新しい人の「はじめての相談」はもう一度送れる
    expect(takeFirstConsult()).toBe(true);
  });
});
