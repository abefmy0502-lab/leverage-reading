// 🎯 Orime を入れた理由（lib/appPurpose.js）の決まり。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = { access_token: 't', user: { id: 'u1', user_metadata: {} } };
const updateUser = vi.fn(async ({ data }) => {
  session.user = { ...session.user, user_metadata: { ...session.user.user_metadata, ...data } };
  return { data: { user: session.user }, error: null };
});
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session } }), updateUser: (...a) => updateUser(...a) } },
}));

import { cleanPurposeText, normalizeAppPurpose, resolveAppPurpose, saveAppPurpose, readAppPurpose, APP_PURPOSE_MAX, __resetAppPurposeForTest } from './appPurpose';

const R = { text: '読書を習慣にしたい', at: '2026-10-18T00:00:00.000Z' };

describe('入れた理由', () => {
  beforeEach(() => {
    __resetAppPurposeForTest();
    session.user = { id: 'u1', user_metadata: {} };
    updateUser.mockClear();
    try { window.localStorage.clear(); } catch { /* ignore */ }
  });

  it('改行・空白をまとめ、80 字で切る', () => {
    expect(cleanPurposeText('  仕事に\n 生かしたい ')).toBe('仕事に 生かしたい');
    expect(cleanPurposeText('あ'.repeat(100))).toHaveLength(APP_PURPOSE_MAX);
    expect(cleanPurposeText(null)).toBe('');
  });

  it('読めない記録は null', () => {
    expect(normalizeAppPurpose({ text: '', at: R.at })).toBe(null);
    expect(normalizeAppPurpose({ text: 'x', at: 'きのう' })).toBe(null);
    expect(normalizeAppPurpose(R)).toEqual(R);
  });

  it('信じる順: この起動中 ＞ アカウント ＞ 端末', () => {
    const other = { text: '別の理由', at: R.at };
    expect(resolveAppPurpose({ override: R, metadata: { app_purpose: other }, local: other })).toEqual(R);
    expect(resolveAppPurpose({ metadata: { app_purpose: R }, local: other })).toEqual(R);
    expect(resolveAppPurpose({ metadata: {}, local: R })).toEqual(R);
  });

  it('書くとアカウントと端末に残る・空は書かない', async () => {
    expect(await saveAppPurpose('   ')).toBe(null);
    expect(updateUser).not.toHaveBeenCalled();
    const r = await saveAppPurpose('読書を習慣にしたい', new Date(R.at));
    expect(r).toEqual({ record: R, synced: true });
    expect(updateUser).toHaveBeenCalledWith({ data: { app_purpose: R } });
    __resetAppPurposeForTest();
    expect(await readAppPurpose()).toEqual(R);
  });

  it('別の人の端末の控えは読まない', async () => {
    await saveAppPurpose('読書を習慣にしたい');
    __resetAppPurposeForTest();
    session.user = { id: 'u2', user_metadata: {} };
    expect(await readAppPurpose()).toBe(null);
  });
});

import { applyPurposeStarter, purposeGuide } from '../components/AppPurposeField';
import { isPurposeSpecific, purposeStarterOf } from './appPurpose';
describe('具体的に書く', () => {
  it('書き出しだけ・短い言い切りでは進めない／続きが 10 字あれば進める', () => {
    expect(isPurposeSpecific('仕事で、')).toBe(false);
    expect(isPurposeSpecific('仕事に生かしたい')).toBe(false);
    expect(isPurposeSpecific('仕事で、来月から任されるチームのまとめ方を学びたい')).toBe(true);
    expect(isPurposeSpecific('転職に向けて、マーケティングの基礎を固めたい')).toBe(true);
  });
  it('どの書き出しで始まるか', () => {
    expect(purposeStarterOf('5 年後に、独立したい')?.text).toBe('5 年後に、');
    expect(purposeStarterOf('いま悩んでいる部下のこと')?.text).toBe('いま悩んでいる、');
    expect(purposeStarterOf('自分の言葉')).toBe(null);
  });
  it('チップは空か書き出しだけのときに置きかえ、続きがあれば変えない', () => {
    expect(applyPurposeStarter('', '仕事で、')).toBe('仕事で、');
    expect(applyPurposeStarter('毎日、', '仕事で、')).toBe('仕事で、');
    expect(applyPurposeStarter('毎日、通勤の 20 分', '仕事で、')).toBe('毎日、通勤の 20 分');
  });
  it('案内は空なら書き出しを、途中なら何を書けばよいかを例つきで', () => {
    expect(purposeGuide('').lead).toMatch(/^書き出しを選んで/);
    expect(purposeGuide('毎日、').example).toMatch(/^例：毎日、/);
    expect(purposeGuide('毎日、通勤').lead).toBe('あと 8 字で次へ進めます');
    expect(purposeGuide('毎日、通勤の 20 分で本を読む').lead).toBe('あとで設定から書き直せます');
  });
});

import { APP_PURPOSE_STARTERS } from './appPurpose';
describe('書き出しの例', () => {
  it('どの例もその書き出しで始まり、それだけで次へ進めるくらい具体的', () => {
    for (const s of APP_PURPOSE_STARTERS) {
      expect(s.example.startsWith(s.text)).toBe(true);
      expect(isPurposeSpecific(s.example)).toBe(true);
    }
  });
});

import { purposeConsultQuestion } from './appPurpose';
describe('入れた理由からはじめの相談', () => {
  it('理由を「」に入れて相談の形に・空なら空', () => {
    expect(purposeConsultQuestion('仕事で、3 年後にはチームを任されるリーダーになりたい。')).toBe('「仕事で、3 年後にはチームを任されるリーダーになりたい」と思っています。読んだ本から、いま何から始めるといい？');
    expect(purposeConsultQuestion('  ')).toBe('');
  });
});
