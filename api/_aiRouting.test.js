import { describe, it, expect, vi } from 'vitest';
import { resolveRoute, parseRouteSpec, routeEnvName, isRetired, ROUTES, PURPOSES } from './_aiRouting.js';
import { PRICES } from './_aiCost.js';

const KEYS = { OPENAI_API_KEY: 'o', GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' };
const NOW = Date.parse('2026-10-01T00:00:00Z');
const r = (purpose, env = KEYS, extra = {}) => resolveRoute({ purpose, requestedModel: 'claude-haiku-4-5', env, now: NOW, ...extra });

describe('用途ごとの行き先（既定）', () => {
  it('相談は Claude Haiku 4.5（無料プランも）', () => {
    expect(r('consult')).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    expect(r('consult', KEYS, { free: true })).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5', reason: 'free' });
  });
  it('AI 選書の推薦は Claude Sonnet 5.5（失敗したら Sonnet 5）', () => {
    expect(r('book_advisor')).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
  });
  it('ヒアリング・読書計画シート・運営の相談は gpt-5-mini、失敗したら Haiku', () => {
    for (const p of ['advisor_interview', 'setup_sheet', 'setup_sheet_edit', 'ops_advise']) {
      expect(r(p)).toMatchObject({ provider: 'openai', model: 'gpt-5-mini', claudeModel: 'claude-haiku-4-5' });
    }
  });
  it('凝縮・まとめ・写真の書き起こしは gemini-3.1-flash-lite、失敗したら Haiku', () => {
    for (const p of ['condense', 'cards_to_summary', 'ocr']) {
      expect(r(p)).toMatchObject({ provider: 'gemini', model: 'gemini-3.1-flash-lite', claudeModel: 'claude-haiku-4-5' });
    }
  });
  it('用途が無い（出し直す前のアプリ）・知らない用途は、アプリが指定した Claude のまま', () => {
    expect(r(undefined)).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5', reason: 'legacy' });
    expect(resolveRoute({ requestedModel: 'claude-sonnet-5', env: KEYS })).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5' });
    expect(r('toString')).toMatchObject({ provider: 'anthropic', reason: 'legacy' });
    expect(resolveRoute({ purpose: 'x', requestedModel: 'claude-opus-5-5', env: KEYS }).model).toBe('claude-haiku-4-5');
  });
  it('表のモデルはすべて単価が分かる', () => {
    for (const p of PURPOSES) {
      const spec = parseRouteSpec(ROUTES[p].primary);
      expect(spec).not.toBeNull();
      expect(PRICES[spec.model]).toBeTruthy();
      expect(PRICES[ROUTES[p].claude]).toBeTruthy();
    }
  });
});

describe('鍵・提供終了・緊急スイッチ', () => {
  it('鍵が無ければ Claude', () => {
    expect(r('setup_sheet', { ANTHROPIC_API_KEY: 'a' })).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5', reason: 'no_key' });
    expect(r('ocr', { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o' })).toMatchObject({ provider: 'anthropic', reason: 'no_key' });
  });
  it('gpt-5-mini は 2026-12-11（日本時間）から呼ばずに Claude', () => {
    expect(isRetired('gpt-5-mini', Date.parse('2026-12-10T14:59:00Z'))).toBe(false);
    expect(isRetired('gpt-5-mini', Date.parse('2026-12-10T15:00:00Z'))).toBe(true);
    expect(r('setup_sheet', KEYS, { now: Date.parse('2026-12-11T00:00:00Z') })).toMatchObject({ provider: 'anthropic', reason: 'retired' });
    expect(isRetired('gemini-3.1-flash-lite', Date.parse('2030-01-01'))).toBe(false);
  });
  it('AI_ROUTING=off で、すべて今までの Claude', () => {
    const env = { ...KEYS, AI_ROUTING: 'off' };
    expect(r('ocr', env)).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5', reason: 'off' });
    expect(r('book_advisor', env)).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5' });
  });
});

describe('env での差し替え（AI_ROUTE_<用途>）', () => {
  it('名前', () => {
    expect(routeEnvName('setup_sheet')).toBe('AI_ROUTE_SETUP_SHEET');
  });
  it('読めるもの・読めないもの', () => {
    expect(parseRouteSpec('openai:gpt-5.4-mini')).toEqual({ provider: 'openai', model: 'gpt-5.4-mini' });
    expect(parseRouteSpec('anthropic:claude-haiku-4-5')).toEqual({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    expect(parseRouteSpec('openai:gpt-5.5')).toBeNull(); // 単価の分からないモデル
    expect(parseRouteSpec('openai:claude-haiku-4-5')).toBeNull(); // 会社とモデルが合わない
    expect(parseRouteSpec('anthropic:claude-opus-5-5')).toBeNull(); // 許可リストの外
    expect(parseRouteSpec('gemini')).toBeNull();
  });
  it('差し替えが効く', () => {
    expect(r('ocr', { ...KEYS, AI_ROUTE_OCR: 'openai:gpt-5.4-mini' })).toMatchObject({ provider: 'openai', model: 'gpt-5.4-mini' });
    expect(r('setup_sheet', { ...KEYS, AI_ROUTE_SETUP_SHEET: 'anthropic:claude-haiku-4-5' })).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    expect(r('condense', { ...KEYS, AI_ROUTE_CONDENSE: 'openai:gpt-5-mini' })).toMatchObject({ provider: 'openai', model: 'gpt-5-mini' });
  });
  it('相談と AI 選書は Claude 以外に差し替えない', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(r('consult', { ...KEYS, AI_ROUTE_CONSULT: 'gemini:gemini-3.1-flash-lite' })).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5' });
    expect(r('consult', { ...KEYS, AI_ROUTE_CONSULT: 'openai:gpt-5-mini' })).toMatchObject({ provider: 'anthropic' });
    expect(r('book_advisor', { ...KEYS, AI_ROUTE_BOOK_ADVISOR: 'openai:gpt-5-mini' })).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(r('book_advisor', { ...KEYS, AI_ROUTE_BOOK_ADVISOR: 'anthropic:claude-sonnet-5' })).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('相談の AI_CONSULT_MODEL（Claude だけ）は今までどおり効く。無料プランには効かない', () => {
    expect(r('consult', { ...KEYS, AI_CONSULT_MODEL: 'claude-sonnet-5' })).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5' });
    expect(r('consult', { ...KEYS, AI_CONSULT_MODEL: 'gpt-5-mini' })).toMatchObject({ model: 'claude-haiku-4-5' });
    expect(r('consult', { ...KEYS, AI_CONSULT_MODEL: 'claude-sonnet-5' }, { free: true }).model).toBe('claude-haiku-4-5');
  });
  it('おかしな値は無視して既定（ログには値を書かない）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(r('ocr', { ...KEYS, AI_ROUTE_OCR: 'openai:gpt-4o' })).toMatchObject({ provider: 'gemini', model: 'gemini-3.1-flash-lite' });
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('gpt-4o');
    warn.mockRestore();
  });
});
