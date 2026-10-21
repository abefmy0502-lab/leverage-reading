import { describe, it, expect, vi } from 'vitest';
import { BRAIN_SYSTEM } from '../src/lib/brainSystem.js';
import { refreshConsultWarm, isWarmableSystem, warmBody, warmModels, WARM_MIN_AGE_S, WARM_MAX_AGE_S } from './_consultWarm.js';

const env = { ANTHROPIC_API_KEY: 'k' };
const adminWith = (claimed) => ({ rpc: vi.fn(async () => ({ data: claimed, error: null })) });
const okFetch = () => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ usage: { input_tokens: 2, cache_read_input_tokens: 6800, output_tokens: 1 } }) }));

describe('相談の指示文のキャッシュを延ばす', () => {
  it('送るのはアプリと同じ指示文だけ・1 時間の印・出力 1 トークン', () => {
    const b = warmBody();
    expect(b.max_tokens).toBe(1);
    expect(b.system).toHaveLength(1);
    expect(b.system[0].text).toBe(BRAIN_SYSTEM);
    expect(b.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(JSON.stringify(b.messages)).toBe('[{"role":"user","content":"."}]');
  });
  it('アプリの相談の指示文と同じときだけ「温まった」と数える', () => {
    expect(isWarmableSystem([{ type: 'text', text: BRAIN_SYSTEM, cache_control: { type: 'ephemeral' } }])).toBe(true);
    expect(isWarmableSystem([{ type: 'text', text: BRAIN_SYSTEM + ' ' }])).toBe(false);
    expect(isWarmableSystem(BRAIN_SYSTEM)).toBe(false);
  });
  it('延ばすモデルは相談の行き先（既定は Haiku 4.5 だけ）', () => {
    expect(warmModels({})).toEqual(['claude-haiku-4-5']);
  });
  it('40〜57 分のときだけ取れたら呼ぶ', async () => {
    const admin = adminWith(true);
    const fetchImpl = okFetch();
    const out = await refreshConsultWarm({ admin, env, fetchImpl });
    expect(out.refreshed).toBe(true);
    expect(admin.rpc).toHaveBeenCalledWith('claim_ai_cache_refresh', { p_key: 'consult', p_min_age: WARM_MIN_AGE_S, p_max_age: WARM_MAX_AGE_S });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.model).toBe('claude-haiku-4-5');
    expect(sent.system[0].text).toBe(BRAIN_SYSTEM);
  });
  it('冷えている・温まったばかり・表が無いときは呼ばない', async () => {
    const fetchImpl = okFetch();
    expect((await refreshConsultWarm({ admin: adminWith(false), env, fetchImpl })).reason).toBe('not_due');
    const broken = { rpc: vi.fn(async () => ({ data: null, error: { message: 'function does not exist' } })) };
    expect((await refreshConsultWarm({ admin: broken, env, fetchImpl })).refreshed).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('スイッチで止める・5 分のキャッシュにしたときは何もしない', async () => {
    const admin = adminWith(true);
    expect((await refreshConsultWarm({ admin, env: { ...env, AI_CONSULT_WARM: 'off' } })).reason).toBe('off');
    expect((await refreshConsultWarm({ admin, env: { ...env, AI_CONSULT_SYSTEM_TTL: '5m' } })).reason).toBe('ttl');
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
