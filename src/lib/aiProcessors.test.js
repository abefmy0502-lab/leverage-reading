// 🤝 同意のシートの「送り先」が、サーバーの振り分け（api/_aiRouting.js）と同じかを確かめる。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES, PURPOSES, JEV_ROUTES, JEV_PURPOSES, JEV_CONSENT_VERSION, JEV_PROVIDER } from '../../api/_aiRouting.js';
import {
  AI_FEATURES, AI_PURPOSE_PROVIDER, AI_PROVIDER_NAMES, AI_CONSENT_EXEMPT_PURPOSES, AI_FALLBACK_PROVIDER,
  AI_CONSENT_VERSION, AI_JEV_ON, providersFor, featureForPurpose, processorSignature, buildAiProcessors, JEV_PURPOSE_FEATURE,
} from './aiProcessors';

// 版ごとの「会社と用途の組み合わせ」。送り先を変えたら、AI_CONSENT_VERSION を上げてここに足す
// （同意した人にも、次に AI を使うときにもう一度確かめるため）。
const CONSENT_SIGNATURES = {
  1: 'advisor_interview:gemini,book_advisor:anthropic,cards_to_summary:gemini,condense:gemini,consult:anthropic,ocr:gemini,setup_sheet:gemini,setup_sheet_edit:gemini|fallback:anthropic',
  // 2 = 1 ＋ TypeSafe AI（Jev・VITE_AI_JEV=on のときだけ・2026-10-02）
  2: 'advisor_interview:gemini,book_advisor:anthropic,cards_to_summary:gemini,condense:gemini,consult:anthropic,intent:typesafe,memo_filing:typesafe,memo_relevance:typesafe,ocr:gemini,setup_sheet:gemini,setup_sheet_edit:gemini|fallback:anthropic',
};

describe('送り先は api/_aiRouting.js の既定と同じ', () => {
  it('同意の要る用途はすべて、どれかの機能に 1 回だけ入っている', () => {
    const needs = PURPOSES.filter((p) => !AI_CONSENT_EXEMPT_PURPOSES.includes(p));
    const listed = AI_FEATURES.flatMap((f) => f.purposes);
    expect([...listed].sort()).toEqual([...needs].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('用途ごとの会社が ROUTES.primary の会社と同じ', () => {
    for (const p of Object.keys(AI_PURPOSE_PROVIDER)) {
      expect(ROUTES[p], `${p} は ROUTES にある`).toBeTruthy();
      expect(AI_PURPOSE_PROVIDER[p], p).toBe(ROUTES[p].primary.split(':')[0]);
    }
    expect(Object.keys(AI_PURPOSE_PROVIDER).sort()).toEqual(AI_FEATURES.flatMap((f) => f.purposes).sort());
  });

  it('失敗したときの代わりは Claude（ROUTES の claude はどれも Anthropic のモデル）', () => {
    expect(AI_FALLBACK_PROVIDER).toBe('anthropic');
    for (const p of PURPOSES) expect(ROUTES[p].claude, p).toMatch(/^claude-/);
  });

  it('画面に出す会社名', () => {
    expect(providersFor(featureForPurpose('consult'))).toEqual(['Anthropic']);
    expect(providersFor(featureForPurpose('advisor_interview'))).toEqual(['Anthropic', 'Google']);
    expect(providersFor(featureForPurpose('setup_sheet_edit'))).toEqual(['Google']);
    expect(providersFor(featureForPurpose('ocr'))).toEqual(['Google']);
    expect(featureForPurpose('ops_advise')).toBe(null);
    expect(Object.keys(AI_PROVIDER_NAMES).sort()).toEqual(['anthropic', 'gemini', 'openai', 'typesafe']);
  });

  it('送り先を変えたら版を上げる（いまの版の組み合わせと同じ）', () => {
    expect(CONSENT_SIGNATURES[AI_CONSENT_VERSION], `AI_CONSENT_VERSION ${AI_CONSENT_VERSION} の組み合わせを CONSENT_SIGNATURES に足す`).toBe(processorSignature());
  });

  it('VITE_AI_JEV が無ければ（既定）Jev は入らず版 1', () => {
    expect(AI_JEV_ON).toBe(false);
    expect(AI_CONSENT_VERSION).toBe(1);
    expect(Object.values(AI_PURPOSE_PROVIDER)).not.toContain('typesafe');
    expect(AI_FEATURES.map((f) => f.id)).not.toContain('tag_suggest');
  });
});

describe('🧭 Jev を入れたとき（VITE_AI_JEV=on）', () => {
  const on = buildAiProcessors({ jev: true });
  const off = buildAiProcessors({ jev: false });

  it('版はサーバーの JEV_CONSENT_VERSION（2）と同じ・止めたときは 1', () => {
    expect(on.version).toBe(JEV_CONSENT_VERSION);
    expect(off.version).toBe(1);
    expect(CONSENT_SIGNATURES[on.version]).toBe(processorSignature(on.purposeProvider));
    expect(CONSENT_SIGNATURES[off.version]).toBe(processorSignature(off.purposeProvider));
  });

  it('Jev の用途はすべて api/_aiRouting.js の JEV_ROUTES の会社・機能と同じ', () => {
    expect(Object.keys(JEV_PURPOSE_FEATURE).sort()).toEqual([...JEV_PURPOSES].sort());
    for (const p of JEV_PURPOSES) {
      expect(on.purposeProvider[p], p).toBe(JEV_PROVIDER);
      expect(JEV_ROUTES[p].primary.split(':')[0]).toBe(JEV_PROVIDER);
      expect(featureForPurpose(p, on.features)?.id, p).toBe(JEV_ROUTES[p].feature);
    }
  });

  it('同意の要る用途はすべて、どれかの機能に 1 回だけ入っている（文を書く用途＋Jev の用途）', () => {
    const needs = [...PURPOSES.filter((p) => !AI_CONSENT_EXEMPT_PURPOSES.includes(p)), ...JEV_PURPOSES];
    const listed = on.features.flatMap((f) => f.purposes);
    expect([...listed].sort()).toEqual([...needs].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('画面に出す会社名: 相談は Anthropic・TypeSafe AI、タグの提案は TypeSafe AI だけ', () => {
    expect(providersFor(featureForPurpose('consult', on.features), on.purposeProvider)).toEqual(['Anthropic', 'TypeSafe AI']);
    expect(providersFor(featureForPurpose('memo_filing', on.features), on.purposeProvider)).toEqual(['TypeSafe AI']);
    expect(on.features.find((f) => f.id === 'tag_suggest').sends.length).toBeLessThanOrEqual(44);
    // 止めているときの表は変わらない
    expect(providersFor(featureForPurpose('consult', off.features), off.purposeProvider)).toEqual(['Anthropic']);
  });

  it('VITE_AI_JEV=on で読み込むと、版 2・TypeSafe AI が入る（同意した人にも、次に AI を使うときに聞き直す）', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_AI_JEV', 'on');
    try {
      const m = await import('./aiProcessors');
      expect(m.AI_JEV_ON).toBe(true);
      expect(m.AI_CONSENT_VERSION).toBe(2);
      expect(m.AI_FEATURES.map((f) => f.id)).toContain('tag_suggest');
      const consent = await import('./aiConsent');
      expect(consent.isAiConsentCurrent({ version: 1, at: '2026-10-01T00:00:00.000Z' })).toBe(false);
      expect(consent.isAiConsentCurrent({ version: 2, at: '2026-10-02T00:00:00.000Z' })).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it('送るものの説明は短く（シートで 2 行まで・390 幅で 13pt は 1 行 約 22 字）', () => {
    for (const f of AI_FEATURES) expect([...f.sends].length, f.name).toBeLessThanOrEqual(44);
  });

  it('相談の量の説明は lib/ai.js の上限（約 9,000 字）と同じ', () => {
    const src = readFileSync(join(__dirname, 'ai.js'), 'utf8');
    const total = Number((src.match(/const CONSULT_TOTAL_CHARS = (\d+)/) || [])[1]);
    expect(total).toBeGreaterThan(0);
    expect(featureForPurpose('consult').sends).toContain(`約 ${total.toLocaleString('en-US')} 字`);
  });
});
