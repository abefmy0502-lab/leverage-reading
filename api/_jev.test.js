// 🧭 Jev の呼び出し口（api/_jev.js）: 送る形・読む形・失敗したら null・分けて同時に送る・原価。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { jevDecide, jevConfig, jevAvailable, readAnswer, splitQuestions, JEV_DEFAULT_ENDPOINT } from './_jev.js';
import { jevCostMjpy, costFromUsage, priceFor, PRICES } from './_aiCost.js';

const ON = { JEV_ENABLED: 'true', JEV_API_KEY: 'k-test' };
const noul = (instructions = 'ok?') => ({ type: 'noul', instructions, criteria: { true: 'yes', false: 'no' } });
const okRes = (data) => ({ ok: true, status: 200, json: async () => data });

afterEach(() => vi.restoreAllMocks());

describe('設定', () => {
  it('既定: 送り先・モデル・1.5 秒・1 回 6 問', () => {
    const c = jevConfig(ON);
    expect(c).toMatchObject({ enabled: true, endpoint: JEV_DEFAULT_ENDPOINT, model: 'jev-1.13.0', timeoutMs: 1500, maxQuestions: 6 });
  });
  it('スイッチが無い・鍵が無いと使わない', () => {
    expect(jevAvailable({})).toBe(false);
    expect(jevAvailable({ JEV_ENABLED: 'true' })).toBe(false);
    expect(jevAvailable({ JEV_API_KEY: 'k' })).toBe(false);
    expect(jevAvailable(ON)).toBe(true);
  });
  it('https でない送り先は使わない・時間の上限は 5 秒まで', () => {
    expect(jevConfig({ ...ON, JEV_ENDPOINT: 'http://evil.example' }).endpoint).toBe(JEV_DEFAULT_ENDPOINT);
    expect(jevConfig({ ...ON, JEV_ENDPOINT: 'https://openrouter.ai/api/v1/systemone' }).endpoint).toBe('https://openrouter.ai/api/v1/systemone');
    expect(jevConfig({ ...ON, JEV_TIMEOUT_MS: '60000' }).timeoutMs).toBe(5000);
  });
});

describe('答えを読む（資料の形と、その揺れ）', () => {
  it('noul: noul / probability / value / 数だけ / probabilities.true', () => {
    expect(readAnswer({ type: 'noul', noul: 0.87 }, 'noul')).toEqual({ type: 'noul', p: 0.87 });
    expect(readAnswer({ probability: 0.2 }, 'noul').p).toBe(0.2);
    expect(readAnswer({ value: '0.4' }, 'noul').p).toBe(0.4);
    expect(readAnswer(0.9, 'noul').p).toBe(0.9);
    expect(readAnswer({ probabilities: { true: 0.7, false: 0.3 } }, 'noul').p).toBe(0.7);
    expect(readAnswer({ noul: 1.4 }, 'noul').p).toBe(1); // 0〜1 に収める
    expect(readAnswer({ noul: true }, 'noul')).toBe(null); // はい/いいえだけでは確率にならない
    expect(readAnswer({}, 'noul')).toBe(null);
  });
  it('choice: 選んだもの・確信・確率（choice が無ければ確率のいちばん高いもの）', () => {
    expect(readAnswer({ type: 'choice', choice: 'billing', confidence: 0.8, probabilities: { billing: 0.8, sales: 0.2 } }, 'choice'))
      .toEqual({ type: 'choice', choice: 'billing', confidence: 0.8, probabilities: { billing: 0.8, sales: 0.2 } });
    expect(readAnswer({ probabilities: { a: 0.1, b: 0.6, c: 0.3 } }, 'choice')).toMatchObject({ choice: 'b', confidence: 0.6 });
    expect(readAnswer({ confidence: 0.5 }, 'choice')).toBe(null);
  });
  it('score', () => {
    expect(readAnswer({ type: 'score', score: 1.43, confidence: 0.35, probabilities: { 0: 0, 1: 0.57, 2: 0.43 } }, 'score'))
      .toMatchObject({ score: 1.43, confidence: 0.35 });
    expect(readAnswer({ score: 'x' }, 'score')).toBe(null);
  });
});

describe('送る・受ける', () => {
  it('Bearer で POST し、{ model, state, questions } を送る。答え・入力のトークン・原価を返す', async () => {
    const fetchImpl = vi.fn(async () => okRes({ model: 'jev-1.13.0', answers: { a1: { type: 'noul', noul: 0.8 } }, usage: { input_tokens: 1000, output_tokens: 0 } }));
    const r = await jevDecide([{ state: 'こんにちは', questions: { a1: noul() } }], { env: ON, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(JEV_DEFAULT_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer k-test');
    expect(JSON.parse(init.body)).toEqual({ model: 'jev-1.13.0', state: 'こんにちは', questions: { a1: noul() } });
    expect(r.answers).toEqual({ a1: { type: 'noul', p: 0.8 } });
    expect(r.inputTokens).toBe(1000);
    expect(r.costMjpy).toBe(jevCostMjpy({ inputTokens: 1000 }));
    expect(r.calls).toBe(1);
  });

  it('answers が無く、上の階層に答えが並ぶ形も読む', async () => {
    const fetchImpl = vi.fn(async () => okRes({ a1: { noul: 0.3 } }));
    const r = await jevDecide([{ state: 's', questions: { a1: noul() } }], { env: ON, fetchImpl });
    expect(r.answers.a1.p).toBe(0.3);
    expect(r.inputTokens).toBeGreaterThan(0); // usage が無ければ文字数から見積もる
  });

  it('問いが多ければ 6 問ずつに分けて同時に送り、答えを合わせる', async () => {
    const questions = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`m${i}`, noul()]));
    const fetchImpl = vi.fn(async (_u, init) => {
      const qs = JSON.parse(init.body).questions;
      return okRes({ answers: Object.fromEntries(Object.keys(qs).map((k) => [k, { noul: 0.5 }])), usage: { input_tokens: 10 } });
    });
    const r = await jevDecide([{ state: 's', questions }], { env: ON, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(Object.keys(r.answers)).toHaveLength(14);
    expect(r.inputTokens).toBe(30);
    expect(splitQuestions('s', questions, 6).map((x) => Object.keys(x.questions).length)).toEqual([6, 6, 2]);
  });
});

describe('失敗したら null（呼び出し側はこれまでの決め方で続ける）', () => {
  const req = [{ state: 's', questions: { a1: noul() } }];
  it('スイッチ・鍵が無いときは送らない', async () => {
    const fetchImpl = vi.fn();
    expect(await jevDecide(req, { env: {}, fetchImpl })).toBe(null);
    expect(await jevDecide(req, { env: { JEV_ENABLED: 'true' }, fetchImpl })).toBe(null);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('HTTP の失敗・読めない答え・投げた例外', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await jevDecide(req, { env: ON, fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) })).toBe(null);
    expect(await jevDecide(req, { env: ON, fetchImpl: async () => okRes({ answers: { other: { noul: 1 } } }) })).toBe(null);
    expect(await jevDecide(req, { env: ON, fetchImpl: async () => { throw new Error('net'); } })).toBe(null);
  });
  it('時間切れ（既定 1.5 秒・ここでは 30ms）', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = (_u, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    const t0 = Date.now();
    expect(await jevDecide(req, { env: { ...ON, JEV_TIMEOUT_MS: '30' }, fetchImpl })).toBe(null);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it('分けた 1 つでも失敗したら全体を null（一部の答えで並びを偏らせない）', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const questions = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`m${i}`, noul()]));
    let n = 0;
    const fetchImpl = async (_u, init) => {
      n += 1;
      if (n === 2) return { ok: false, status: 500, json: async () => ({}) };
      const qs = JSON.parse(init.body).questions;
      return okRes({ answers: Object.fromEntries(Object.keys(qs).map((k) => [k, { noul: 0.5 }])) });
    };
    expect(await jevDecide([{ state: 's', questions }], { env: ON, fetchImpl })).toBe(null);
  });
  it('問いの名前・種類が決まりの外なら送らない', async () => {
    const fetchImpl = vi.fn();
    expect(await jevDecide([{ state: 's', questions: { 'Bad Id': noul() } }], { env: ON, fetchImpl })).toBe(null);
    expect(await jevDecide([{ state: 's', questions: { a: { type: 'text', instructions: 'x' } } }], { env: ON, fetchImpl })).toBe(null);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('原価（$0.042 / 100 万入力トークン・出力は無料）', () => {
  it('単価の表に入っていて、版つき・OpenRouter の名前でも同じ単価', () => {
    expect(PRICES['jev-1.13']).toMatchObject({ in: 0.042, out: 0 });
    expect(priceFor('jev-1.13.0')).toBe(PRICES['jev-1.13']);
    expect(priceFor('typesafe/jev-1.13')).toBe(PRICES['jev-1.13']);
  });
  it('100 万トークン ＝ $0.042 × 160 円 × 1.1（消費税）≈ ¥7.4。出力は数えない', () => {
    expect(jevCostMjpy({ inputTokens: 1_000_000 })).toBe(Math.ceil(0.042 * 160 * 1.1 * 1000));
    expect(costFromUsage('jev-1.13.0', { input_tokens: 1_000_000, output_tokens: 5_000_000 })).toBe(Math.ceil(0.042 * 160 * 1.1 * 1000));
    // 相談 1 回の関係するメモの判断（約 8,000 トークン）は ¥0.1 未満
    expect(jevCostMjpy({ inputTokens: 8000 })).toBeLessThan(100);
  });
  it('入力のトークンが分からなければ文字数 × 1.2', () => {
    expect(jevCostMjpy({ chars: 1000 })).toBe(jevCostMjpy({ inputTokens: 1200 }));
  });
  it('ほかのモデルの単価は変わらない（日付つきの版の数え方も同じ）', () => {
    expect(priceFor('claude-haiku-4-5-20251001')).toBe(PRICES['claude-haiku-4-5']);
    expect(priceFor('gpt-5-mini-2025-08-07')).toBe(PRICES['gpt-5-mini']);
  });
});
