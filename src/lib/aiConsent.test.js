// 🤝 AI に送る前の同意（lib/aiConsent.js）の決まり。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const session = { access_token: 't', user: { id: 'u1', user_metadata: {} } };
const updateUser = vi.fn(async ({ data }) => {
  session.user = { ...session.user, user_metadata: { ...session.user.user_metadata, ...data } };
  return { data: { user: session.user }, error: null };
});
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session } }), updateUser: (...a) => updateUser(...a) } },
}));

import {
  normalizeAiConsent, isAiConsentCurrent, needsAiConsent, resolveAiConsent, makeAiConsentRecord,
  isConsentExemptPurpose, ensureAiConsent, requestAiConsent, grantAiConsent, withdrawAiConsent, readAiConsent,
  checkAiConsentForSend, AI_CONSENT_REQUEST_EVENT, AI_CONSENT_VERSION, __resetAiConsentForTest,
} from './aiConsent';

const V1 = { version: 1, at: '2026-10-01T00:00:00.000Z' };

describe('同意が要るか（純粋関数）', () => {
  it('読めない記録は null', () => {
    expect(normalizeAiConsent(null)).toBe(null);
    expect(normalizeAiConsent({ version: 1 })).toBe(null);
    expect(normalizeAiConsent({ version: 0, at: V1.at })).toBe(null);
    expect(normalizeAiConsent({ version: '1', at: V1.at })).toEqual(V1);
    expect(normalizeAiConsent({ version: 1, at: 'きのう' })).toBe(null);
  });

  it('いまの版に同意していれば要らない・まだなら要る', () => {
    expect(needsAiConsent({ purpose: 'consult', record: V1, version: 1 })).toBe(false);
    expect(needsAiConsent({ purpose: 'consult', record: null, version: 1 })).toBe(true);
    expect(needsAiConsent({ purpose: 'ocr', record: undefined, version: 1 })).toBe(true);
  });

  it('送り先が変わって版を上げたら、同意した人にももう一度聞く', () => {
    expect(isAiConsentCurrent(V1, 1)).toBe(true);
    expect(isAiConsentCurrent(V1, 2)).toBe(false);
    expect(needsAiConsent({ purpose: 'consult', record: V1, version: 2 })).toBe(true);
    expect(needsAiConsent({ purpose: 'consult', record: { version: 2, at: V1.at }, version: 2 })).toBe(false);
  });

  it('用途の無い呼び出しも聞く（安全な側）・運営の参謀だけ聞かない', () => {
    expect(needsAiConsent({ purpose: undefined, record: null })).toBe(true);
    expect(isConsentExemptPurpose('ops_advise')).toBe(true);
    expect(needsAiConsent({ purpose: 'ops_advise', record: null })).toBe(false);
  });

  it('信じる順: この起動中 ＞ user_metadata（null の取り消しも含む）＞ 端末', () => {
    expect(resolveAiConsent({ override: null, metadata: { ai_consent: V1 }, local: V1 })).toBe(null);
    expect(resolveAiConsent({ override: V1, metadata: { ai_consent: null }, local: null })).toEqual(V1);
    // 別の端末で取り消した（user_metadata が null）なら、この端末の控えが残っていても聞き直す
    expect(resolveAiConsent({ metadata: { ai_consent: null }, local: V1 })).toBe(null);
    expect(resolveAiConsent({ metadata: { ai_consent: V1 }, local: null })).toEqual(V1);
    // user_metadata に書けなかった（キーが無い）ときは端末の控え
    expect(resolveAiConsent({ metadata: { display_name: 'さとう' }, local: V1 })).toEqual(V1);
    expect(resolveAiConsent({})).toBe(null);
  });

  it('記録は { version, at }（いまの版）', () => {
    const r = makeAiConsentRecord(new Date('2026-10-01T03:00:00Z'));
    expect(r).toEqual({ version: AI_CONSENT_VERSION, at: '2026-10-01T03:00:00.000Z' });
  });
});

describe('シートで聞く・同意する・取り消す', () => {
  let store;
  beforeEach(() => {
    __resetAiConsentForTest();
    session.user = { id: 'u1', user_metadata: {} };
    updateUser.mockClear();
    store = new Map();
    const target = new EventTarget();
    globalThis.window = Object.assign(target, {
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
    });
  });
  afterEach(() => { delete globalThis.window; });

  const answerWith = (ok) => {
    const seen = [];
    window.addEventListener(AI_CONSENT_REQUEST_EVENT, (e) => {
      seen.push(e.detail.purpose);
      e.detail.handled = true;
      queueMicrotask(() => e.detail.resolve(ok));
    });
    return seen;
  };

  it('受け手がいない（ログイン前など）ときは送らない側', async () => {
    expect(await requestAiConsent({ purpose: 'consult' })).toBe(false);
    expect(await ensureAiConsent('consult')).toBe(false);
  });

  it('「今はやめる」なら false・何も保存しない', async () => {
    const seen = answerWith(false);
    expect(await ensureAiConsent('ocr')).toBe(false);
    expect(seen).toEqual(['ocr']);
    expect(await readAiConsent()).toBe(null);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('同時に聞かれてもシートは 1 枚・答えは同じ', async () => {
    const seen = answerWith(true);
    const [a, b] = await Promise.all([requestAiConsent({ purpose: 'consult' }), requestAiConsent({ purpose: 'ocr' })]);
    expect([a, b]).toEqual([true, true]);
    expect(seen).toEqual(['consult']);
  });

  it('同意すると user_metadata と端末に { version, at } を残し、次からは聞かない', async () => {
    const r = await grantAiConsent(new Date('2026-10-01T03:00:00Z'));
    expect(updateUser).toHaveBeenCalledWith({ data: { ai_consent: r } });
    expect(session.user.user_metadata.ai_consent).toEqual(r);
    expect(JSON.parse(store.get('orime-ai-consent:u1'))).toEqual(r);
    const seen = answerWith(false);
    expect(await ensureAiConsent('consult')).toBe(true);
    expect(seen).toEqual([]);
    expect(await checkAiConsentForSend('consult')).toEqual({ ok: true, version: AI_CONSENT_VERSION });
  });

  it('取り消すと user_metadata を null にして端末の控えも消し、次に AI を使うときにまた聞く', async () => {
    await grantAiConsent();
    expect(await withdrawAiConsent()).toBe(true);
    expect(session.user.user_metadata.ai_consent).toBe(null);
    expect(store.has('orime-ai-consent:u1')).toBe(false);
    const seen = answerWith(false);
    expect(await ensureAiConsent('consult')).toBe(false);
    expect(seen).toEqual(['consult']);
  });

  it('取り消しをアカウントに書けなかったら、同意のまま（取り消したつもりで残らない）', async () => {
    await grantAiConsent();
    updateUser.mockImplementationOnce(async () => ({ data: null, error: { message: 'offline' } }));
    expect(await withdrawAiConsent()).toBe(false);
    expect(isAiConsentCurrent(await readAiConsent())).toBe(true);
  });

  it('前の版に同意した人は、版を上げた今はもう一度聞かれる', async () => {
    session.user.user_metadata = { ai_consent: { version: AI_CONSENT_VERSION - 1, at: V1.at } };
    const seen = answerWith(true);
    expect(await ensureAiConsent('consult')).toBe(true);
    expect(seen).toEqual(['consult']);
  });

  it('運営の参謀は聞かない', async () => {
    const seen = answerWith(false);
    expect(await ensureAiConsent('ops_advise')).toBe(true);
    expect(seen).toEqual([]);
  });
});
