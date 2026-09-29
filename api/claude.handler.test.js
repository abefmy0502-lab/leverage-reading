// api/claude.js のハンドラを、偽の Supabase / Anthropic でひと通り動かして、お金まわりの流れを確かめる。
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const UID = '11111111-1111-4111-8111-111111111111';

// 偽の DB の状態と、起きたことの記録（順番つき）
const db = {};
const log = [];
function resetDb() {
  Object.assign(db, {
    sub: { status: 'active', period_type: 'normal', current_period_end: new Date(Date.now() + 20 * 86400000).toISOString() },
    lots: [],
    charged: 0,
    costTotal: 0, // この行の cost_mjpy
    rpcArgs: {},
    refunds: 0, // 'refund-YYYY-MM' 行の calls
  });
  log.length = 0;
}

const later = (v) => new Promise((r) => setTimeout(() => r(v), 5)); // DB の往復（応答より遅れて終わる）

function query(table) {
  const q = {
    select() { return q; }, eq() { return q; }, gt() { return q; }, in() { return q; }, order() { return q; },
    maybeSingle() {
      if (table === 'app_admins') return later({ data: null, error: null });
      if (table === 'subscriptions') return later({ data: db.sub, error: null });
      if (table === 'ai_usage') return later({ data: { lot_tokens: db.charged }, error: null });
      return later({ data: null, error: null });
    },
    then(res, rej) {
      if (table === 'ai_token_lots') return later({ data: db.lots, error: null }).then(res, rej);
      return later({ data: [], error: null }).then(res, rej);
    },
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) },
    from: (t) => query(t),
    rpc: async (name, args) => {
      db.rpcArgs[name] = args;
      await later();
      log.push(`rpc:${name}`);
      if (name === 'check_ai_rate_limit') return { data: true, error: null };
      if (name === 'reserve_ai_cost') {
        if (db.costTotal + args.p_amount > args.p_budget) return { data: -1, error: null };
        db.costTotal += args.p_amount;
        return { data: db.costTotal, error: null };
      }
      if (name === 'adjust_ai_cost') { db.costTotal = Math.max(0, db.costTotal + args.p_delta); return { data: db.costTotal, error: null }; }
      if (name === 'reserve_ai_usage') {
        if (String(args.p_period_month).startsWith('refund-')) {
          if (db.refunds >= args.p_limit) return { data: -1, error: null };
          db.refunds += 1;
          return { data: db.refunds, error: null };
        }
        return { data: 1, error: null };
      }
      return { data: 0, error: null };
    },
  }),
}));

function mockRes() {
  const res = {
    statusCode: 200, headers: {}, body: null, chunks: [],
    status(c) { res.statusCode = c; return res; },
    setHeader(k, v) { res.headers[k] = v; },
    json(b) { res.body = b; log.push('respond'); return res; },
    write(c) { res.chunks.push(c); },
    end() { log.push('respond'); },
    flushHeaders() {},
    on() {},
  };
  return res;
}
const req = (body) => ({ method: 'POST', headers: { authorization: 'Bearer t' }, body, on() {} });

let handler;
beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = 'k';
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  ({ default: handler } = await import('./claude.js'));
});
// 前のテストの取り残された往復が次のテストの記録に混ざらないよう、少し待ってから始める。
// あわせて時計を 1 分ずつ進める（ハンドラの「1 分に 10 回」のレート制限に、テストの数で当たらないように）。
const realNow = Date.now.bind(Date);
let clockOffset = 0;
beforeAll(() => { vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset); });
beforeEach(async () => { await new Promise((r) => setTimeout(r, 30)); clockOffset += 61_000; resetDb(); });
afterEach(() => vi.unstubAllGlobals());

const usage = { input_tokens: 3000, output_tokens: 400 };
function stubJson() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], usage }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })));
}
function stubStream() {
  const sse = [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 3000, output_tokens: 1 } } })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 400 } })}\n\n`,
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join('');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })));
}

describe('精算は応答を返す前に終える（応答のあとの後処理は Vercel で止められることがある）', () => {
  it('ふつうの応答: 予約の最大額を実額に戻してから返す', async () => {
    stubJson();
    const res = mockRes();
    await handler(req({ messages: [{ role: 'user', content: 'こんにちは' }], max_tokens: 1000 }), res);
    expect(res.statusCode).toBe(200);
    expect(log.indexOf('rpc:adjust_ai_cost')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('rpc:adjust_ai_cost')).toBeLessThan(log.indexOf('respond'));
  });
  it('ストリーム: 実額に戻してから閉じる', async () => {
    stubStream();
    const res = mockRes();
    await handler(req({ messages: [{ role: 'user', content: 'こんにちは' }], max_tokens: 1000, stream: true }), res);
    expect(log.indexOf('rpc:adjust_ai_cost')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('rpc:adjust_ai_cost')).toBeLessThan(log.indexOf('respond'));
  });
  it('Anthropic が失敗: 予約をまるごと戻してから返す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{}}', { status: 529, headers: { 'content-type': 'application/json' } })));
    const res = mockRes();
    await handler(req({ messages: [{ role: 'user', content: 'x' }], max_tokens: 1000 }), res);
    expect(res.statusCode).toBe(529);
    expect(db.costTotal).toBe(0);
    expect(log.indexOf('rpc:release_ai_usage')).toBeLessThan(log.indexOf('respond'));
  });
});

describe('回数の上限がトークンより先に尽きない', () => {
  it('有料（800）＋追加 1,000: reserve_ai_usage の上限は 1,800 回まで広がる', async () => {
    stubJson();
    db.lots = [{ id: 'l1', tokens_left: 1000, expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), purchased_at: new Date().toISOString() }];
    await handler(req({ messages: [{ role: 'user', content: 'x' }], max_tokens: 500 }), mockRes());
    expect(db.rpcArgs.reserve_ai_usage.p_limit).toBe(1800);
  });
});

describe('最後の 1 回のはみ出し（追加分なし）も精算に記録する', () => {
  it('799 トークン使った人の最後の 1 回 → settle_token_overflow が呼ばれる', async () => {
    stubJson();
    db.costTotal = 799 * 300 - 10;
    await handler(req({ messages: [{ role: 'user', content: 'x' }], max_tokens: 500 }), mockRes());
    expect(log).toContain('rpc:settle_token_overflow');
    expect(log.indexOf('rpc:settle_token_overflow')).toBeLessThan(log.indexOf('respond'));
  });
  it('月の分の内側なら呼ばない', async () => {
    stubJson();
    db.costTotal = 100 * 300;
    await handler(req({ messages: [{ role: 'user', content: 'x' }], max_tokens: 500 }), mockRes());
    expect(log).not.toContain('rpc:settle_token_overflow');
  });
});

// 🙏 関係するメモが無かった相談は、トークンを返す（2026-09-29）
const NO_INFO_TEXT = '【結論】\nあなたの読書記録には、このトピックに関する情報がまだありません。\n\n【明日からできる 1 つの行動】\n今週末に書店で、投資の入門書を 1 冊手に取る。\n\nREFS_START\nREFS_END';
const REAL_TEXT = '【結論】\n部下の話を最後まで聞くのが近道です。\n\n【参照した本のメモ】\n- 『人を動かす』(p.45) より: 相手の関心に目を向ける\n\nREFS_START\n- 📚 カーネギー『人を動かす』p.45\nREFS_END';

function stubConsultStream(text, stopReason = 'end_turn') {
  const deltas = [];
  for (let i = 0; i < text.length; i += 20) {
    deltas.push(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 20) } })}\n\n`);
  }
  const sse = [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 3000, output_tokens: 1 } } })}\n\n`,
    ...deltas,
    `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 120 } })}\n\n`,
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ].join('');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })));
}
function stubConsultJson(text, stopReason = 'end_turn') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    content: [{ type: 'text', text }], stop_reason: stopReason, usage: { input_tokens: 3000, output_tokens: 120 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })));
}
const written = (res) => res.chunks.map((c) => Buffer.from(c).toString('utf8')).join('');
const consultReq = (extra = {}) => req({ messages: [{ role: 'user', content: '投資について' }], max_tokens: 1600, purpose: 'consult', ...extra });

describe('関係するメモが無かった相談の払い戻し', () => {
  it('ストリーム: 予約をまるごと戻し（原価 0）、回数も返し、答えの最後に印のフレームを 1 つ送る', async () => {
    stubConsultStream(NO_INFO_TEXT);
    const res = mockRes();
    await handler(consultReq({ stream: true }), res);
    expect(db.costTotal).toBe(0);
    expect(log).toContain('rpc:release_ai_usage');
    expect(db.refunds).toBe(1);
    const out = written(res);
    expect(out).toContain('event: orime_token_refund');
    expect(out.indexOf('orime_token_refund')).toBeGreaterThan(out.indexOf('message_stop'));
    const frame = out.slice(out.indexOf('data: {"type":"orime_token_refund"')).split('\n')[0].slice(6);
    expect(JSON.parse(frame)).toMatchObject({ type: 'orime_token_refund', reason: 'no_info' });
    expect(log.indexOf('rpc:adjust_ai_cost')).toBeLessThan(log.indexOf('respond'));
  });
  it('ストリーム: ふつうの答えは払い戻さない（実額で精算・印なし）', async () => {
    stubConsultStream(REAL_TEXT);
    const res = mockRes();
    await handler(consultReq({ stream: true }), res);
    expect(db.costTotal).toBeGreaterThan(0);
    expect(db.refunds).toBe(0);
    expect(written(res)).not.toContain('orime_token_refund');
    expect(log).not.toContain('rpc:release_ai_usage');
  });
  it('ストリーム: 出力の上限で途中で切れた（max_tokens）答えは払い戻さない', async () => {
    stubConsultStream(NO_INFO_TEXT, 'max_tokens');
    const res = mockRes();
    await handler(consultReq({ stream: true }), res);
    expect(db.costTotal).toBeGreaterThan(0);
    expect(written(res)).not.toContain('orime_token_refund');
  });
  it('ストリームでない: ヘッダー X-Orime-Token-Refund と JSON の orime_token_refund で知らせる', async () => {
    stubConsultJson(NO_INFO_TEXT);
    const res = mockRes();
    await handler(consultReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Orime-Token-Refund']).toBe('no_info');
    expect(res.body.orime_token_refund).toMatchObject({ reason: 'no_info' });
    expect(res.body.orime_token_refund.tokens).toBeGreaterThan(0);
    expect(db.costTotal).toBe(0);
  });
  it('相談以外（purpose なし）は、決まり文句の答えでも払い戻さない', async () => {
    stubConsultJson(NO_INFO_TEXT);
    const res = mockRes();
    await handler(req({ messages: [{ role: 'user', content: 'x' }], max_tokens: 1600 }), res);
    expect(res.headers['X-Orime-Token-Refund']).toBeUndefined();
    expect(db.costTotal).toBeGreaterThan(0);
    expect(db.refunds).toBe(0);
  });
  it('1 か月の払い戻しの上限（既定 10 回）に達したら返さない', async () => {
    stubConsultStream(NO_INFO_TEXT);
    db.refunds = 10;
    const res = mockRes();
    await handler(consultReq({ stream: true }), res);
    expect(db.costTotal).toBeGreaterThan(0);
    expect(written(res)).not.toContain('orime_token_refund');
    expect(log).not.toContain('rpc:release_ai_usage');
  });
  it('月の分を超えていても、払い戻した 1 回は追加分から差し引かない（settle_token_overflow を呼ばない）', async () => {
    stubConsultStream(NO_INFO_TEXT);
    db.costTotal = 799 * 300 - 10;
    db.lots = [{ id: 'l1', tokens_left: 300, expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), purchased_at: new Date().toISOString() }];
    await handler(consultReq({ stream: true }), mockRes());
    expect(db.costTotal).toBe(799 * 300 - 10);
    expect(log).not.toContain('rpc:settle_token_overflow');
  });
});
