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

// 🧭 用途ごとの行き先（2026-10-01・api/_aiRouting.js / api/_providers.js）。本物の API は呼ばない。
describe('用途ごとに会社とモデルを選ぶ（失敗したら Claude で 1 回だけやり直す）', () => {
  let cost;
  beforeAll(async () => { cost = await import('./_aiCost.js'); });
  // 読書計画シートは 2026-10-01 から Gemini が既定。ここでは OpenAI の経路を確かめるため env で OpenAI に向ける。
  beforeEach(() => { process.env.OPENAI_API_KEY = 'sk-test'; process.env.GEMINI_API_KEY = 'g-test'; process.env.AI_ROUTE_SETUP_SHEET = 'openai:gpt-5-mini'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; delete process.env.GEMINI_API_KEY; delete process.env.AI_ROUTE_SETUP_SHEET; });

  const openAiSse = (text) => [
    { model: 'gpt-5-mini-2025-08-07', choices: [{ delta: { content: text } }] },
    { model: 'gpt-5-mini-2025-08-07', choices: [{ delta: {}, finish_reason: 'stop' }] },
    { model: 'gpt-5-mini-2025-08-07', choices: [], usage: { prompt_tokens: 3500, completion_tokens: 1300 } },
  ].map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
  const anthropicJson = () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'claude' }], stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 400 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const sheetReq = (extra = {}) => req({ messages: [{ role: 'user', content: '読書計画シート' }], max_tokens: 1600, model: 'claude-haiku-4-5', purpose: 'setup_sheet', ...extra });

  it('読書計画シート（ストリーム）→ OpenAI。アプリには Anthropic の形の SSE、原価は gpt-5-mini の単価で精算', async () => {
    const fetchMock = vi.fn(async () => new Response(openAiSse('## 🎯 読み方の戦略'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(sheetReq({ stream: true }), res);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    const out = written(res);
    expect(out).toContain('"type":"text_delta","text":"## 🎯 読み方の戦略"');
    expect(out).toContain('"type":"message_stop"');
    expect(db.costTotal).toBe(cost.costFromUsage('gpt-5-mini', { input_tokens: 3500, output_tokens: 1300 }));
    expect(log.indexOf('rpc:adjust_ai_cost')).toBeLessThan(log.indexOf('respond'));
  });

  it('予約は、やり直しの Claude の見積もりも見込んで高いほう', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(openAiSse('x'), { status: 200, headers: { 'content-type': 'text/event-stream' } })));
    await handler(sheetReq({ stream: true }), mockRes());
    // キャッシュの印が無い文字は、ふつうの入力の単価で見積もる（2026-10-01）
    const est = cost.estimateCost('claude-haiku-4-5', { textChars: '読書計画シート'.length, images: 0, maxTokens: 1600, segments: { w1h: 0, w5m: 0 } });
    expect(db.rpcArgs.reserve_ai_cost.p_amount).toBe(est.total);
  });

  it('OpenAI が 500 → Claude（Haiku）でやり直す。ログに中身は書かない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async (url) => (String(url).includes('openai')
      ? new Response('{"error":{"message":"boom"}}', { status: 500 })
      : anthropicJson()));
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(sheetReq(), res);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('claude-haiku-4-5');
    expect(res.statusCode).toBe(200);
    expect(res.body.content[0].text).toBe('claude');
    expect(db.costTotal).toBe(cost.costFromUsage('claude-haiku-4-5', { input_tokens: 3000, output_tokens: 400 }));
    const logged = warn.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('openai:gpt-5-mini failed (status 500)');
    expect(logged).not.toContain('読書計画シート');
    expect(logged).not.toContain('boom');
    warn.mockRestore();
  });

  it('鍵が無ければ、はじめから Claude（OpenAI は呼ばない）', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = vi.fn(async () => anthropicJson());
    vi.stubGlobal('fetch', fetchMock);
    await handler(sheetReq(), mockRes());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('写真の書き起こし（ストリームでない）→ Gemini。答えは Anthropic の JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '書き起こした一節' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 350 },
      modelVersion: 'gemini-3.1-flash-lite',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(req({
      model: 'claude-haiku-4-5', purpose: 'ocr', max_tokens: 1024,
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: '書き起こして' }] }],
    }), res);
    expect(String(fetchMock.mock.calls[0][0])).toContain('generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent');
    expect(res.body).toMatchObject({ content: [{ type: 'text', text: '書き起こした一節' }], stop_reason: 'end_turn' });
    expect(db.costTotal).toBe(cost.costFromUsage('gemini-3.1-flash-lite', { input_tokens: 2000, output_tokens: 350 }));
  });

  it('相談は鍵があっても Claude だけ', async () => {
    const fetchMock = vi.fn(async () => anthropicJson());
    vi.stubGlobal('fetch', fetchMock);
    await handler(consultReq(), mockRes());
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('claude-haiku-4-5');
  });

  it('AI 選書の推薦は Claude Sonnet 5.5（考えない設定は between_tools）', async () => {
    const fetchMock = vi.fn(async () => anthropicJson());
    vi.stubGlobal('fetch', fetchMock);
    await handler(req({ messages: [{ role: 'user', content: '営業の本' }], max_tokens: 3000, model: 'claude-sonnet-5', purpose: 'book_advisor' }), mockRes());
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'claude-sonnet-5-5', thinking: { type: 'between_tools' } });
  });

  it('用途が無い（出し直す前のアプリ）は、アプリが指定した Claude のまま', async () => {
    const fetchMock = vi.fn(async () => anthropicJson());
    vi.stubGlobal('fetch', fetchMock);
    await handler(req({ messages: [{ role: 'user', content: 'x' }], max_tokens: 500, model: 'claude-sonnet-5' }), mockRes());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'claude-sonnet-5', thinking: { type: 'disabled' } });
  });

  it('無料プランは相談以外を今までどおり 402（用途を付けても）', async () => {
    db.sub = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = mockRes();
    await handler(sheetReq(), res);
    expect(res.statusCode).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// 💴 相談のプロンプトキャッシュ（2026-10-01・docs/ai-routing.md §7）。
describe('相談のキャッシュ（指示文は 1 時間・メモ一覧は 5 分）と、その原価', () => {
  let cost;
  beforeAll(async () => { cost = await import('./_aiCost.js'); });
  afterEach(() => { delete process.env.AI_CONSULT_SYSTEM_TTL; });
  const SYSTEM = '指示文'.repeat(1500);
  const MEMOS = 'メモ一覧'.repeat(1200);
  const TAIL = '質問と歩み'.repeat(200);
  const cachedConsult = (extra = {}) => req({
    purpose: 'consult', max_tokens: 1200,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [
      { type: 'text', text: MEMOS, cache_control: { type: 'ephemeral', ttl: '1h' } }, // メッセージの印の ttl は中継が外す（5 分）
      { type: 'text', text: TAIL },
    ] }],
    ...extra,
  });
  const usage = {
    input_tokens: 1000, cache_creation_input_tokens: 9000, cache_read_input_tokens: 0, output_tokens: 500,
    cache_creation: { ephemeral_5m_input_tokens: 4000, ephemeral_1h_input_tokens: 5000 },
  };
  const stubJson = (u = usage) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '【結論】\n答え' }], stop_reason: 'end_turn', usage: u, model: 'claude-haiku-4-5' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('相談の指示文の印は 1 時間・メモ一覧の印は 5 分（ttl を外す）で送る', async () => {
    const fetchMock = stubJson();
    await handler(cachedConsult(), mockRes());
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(sent.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sent.messages[0].content[1].cache_control).toBeUndefined();
  });

  it('AI_CONSULT_SYSTEM_TTL=5m なら今までどおり 5 分', async () => {
    process.env.AI_CONSULT_SYSTEM_TTL = '5m';
    const fetchMock = stubJson();
    await handler(cachedConsult(), mockRes());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('相談以外（用途なし）の指示文は 5 分のまま', async () => {
    const fetchMock = stubJson();
    await handler(cachedConsult({ purpose: undefined, model: 'claude-haiku-4-5' }), mockRes());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('予約: 指示文は 1 時間の書き込み・メモ一覧は 5 分の書き込み・後ろはふつうの入力の単価（全部を書き込みで数えない）', async () => {
    stubJson();
    await handler(cachedConsult(), mockRes());
    const textChars = SYSTEM.length + MEMOS.length + TAIL.length;
    const est = cost.estimateCost('claude-haiku-4-5', { textChars, images: 0, maxTokens: 1200, segments: { w1h: SYSTEM.length, w5m: MEMOS.length } });
    expect(db.rpcArgs.reserve_ai_cost.p_amount).toBe(est.total);
    const legacy = cost.estimateCost('claude-haiku-4-5', { textChars, images: 0, maxTokens: 1200 });
    expect(est.total).not.toBe(legacy.total);
  });

  it('精算: 1 時間・5 分の書き込みと読み出しを、それぞれの単価で数える', async () => {
    stubJson();
    await handler(cachedConsult(), mockRes());
    expect(db.costTotal).toBe(cost.costFromUsage('claude-haiku-4-5', usage));
    // 続きの相談（頭は読み出し＝0.1 倍）は、最初の 1 回よりずっと安い
    const warm = { input_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: 9000, output_tokens: 500 };
    expect(cost.costFromUsage('claude-haiku-4-5', warm)).toBeLessThan(cost.costFromUsage('claude-haiku-4-5', usage) / 2);
  });
});
