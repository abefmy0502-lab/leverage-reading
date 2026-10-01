// 🤝 同意のシートの「送り先」が、サーバーの振り分け（api/_aiRouting.js）と同じかを確かめる。
import { describe, it, expect } from 'vitest';
import { ROUTES, PURPOSES } from '../../api/_aiRouting.js';
import {
  AI_FEATURES, AI_PURPOSE_PROVIDER, AI_PROVIDER_NAMES, AI_CONSENT_EXEMPT_PURPOSES, AI_FALLBACK_PROVIDER,
  AI_CONSENT_VERSION, providersFor, featureForPurpose, processorSignature,
} from './aiProcessors';

// 版ごとの「会社と用途の組み合わせ」。送り先を変えたら、AI_CONSENT_VERSION を上げてここに足す
// （同意した人にも、次に AI を使うときにもう一度確かめるため）。
const CONSENT_SIGNATURES = {
  1: 'advisor_interview:openai,book_advisor:anthropic,cards_to_summary:gemini,condense:gemini,consult:anthropic,ocr:gemini,setup_sheet:openai,setup_sheet_edit:openai|fallback:anthropic',
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
    expect(providersFor(featureForPurpose('advisor_interview'))).toEqual(['Anthropic', 'OpenAI']);
    expect(providersFor(featureForPurpose('setup_sheet_edit'))).toEqual(['OpenAI']);
    expect(providersFor(featureForPurpose('ocr'))).toEqual(['Google']);
    expect(featureForPurpose('ops_advise')).toBe(null);
    expect(Object.keys(AI_PROVIDER_NAMES).sort()).toEqual(['anthropic', 'gemini', 'openai']);
  });

  it('送り先を変えたら版を上げる（いまの版の組み合わせと同じ）', () => {
    expect(CONSENT_SIGNATURES[AI_CONSENT_VERSION], `AI_CONSENT_VERSION ${AI_CONSENT_VERSION} の組み合わせを CONSENT_SIGNATURES に足す`).toBe(processorSignature());
  });

  it('送るものの説明は短く（シートで 1 行に収まる・390 幅で 13pt）', () => {
    for (const f of AI_FEATURES) expect([...f.sends].length, f.name).toBeLessThanOrEqual(22);
  });
});
