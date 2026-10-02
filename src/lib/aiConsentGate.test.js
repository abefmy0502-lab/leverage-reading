// 🤝 AI に送る道はすべて同意の関所を通る（App Review 5.1.2(i)・lib/aiConsent.js）。
//   1. 送る直前の関所: callClaude（postClaude）と streamClaude は、送る前に checkAiConsentForSend を呼び、
//      やめたら fetch しない。同意の版をヘッダーに付ける。
//   2. AI の関数（写真から書き起こし・凝縮・まとめ）は自分の用途で関所を通る。
//   3. /api/claude に送るのは lib/ai.js と lib/streamClaude.js だけ・呼び出しはどれも用途（purpose）を付ける・
//      各機能の入口（押したとき）でも ensureAiConsent を呼ぶ（ソースを読んで確かめる）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1', user_metadata: {} } } } }) } },
}));
vi.mock('./aiConsent', async (orig) => {
  const real = await orig();
  return { ...real, checkAiConsentForSend: vi.fn() };
});
vi.mock('./analytics', () => ({ track: vi.fn() }));
vi.mock('./freeTrial', () => ({
  isPaywallError: () => false, requestPaywall: vi.fn(), paywallReasonFor: () => 'feature', notifyAiUsed: vi.fn(),
}));

import { callClaude, extractTextFromImage, condenseMemo, summarizeCards, opsAdvise, isAiNoticeString } from './ai';
import { streamClaude } from './streamClaude';
import { checkAiConsentForSend, AI_CONSENT_DECLINED_TEXT } from './aiConsent';
import { PURPOSES } from '../../api/_aiRouting.js';

const okJson = (text) => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }] }) });
const sse = (text) => {
  const enc = new TextEncoder();
  const frames = [
    `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n`,
    `data: ${JSON.stringify({ type: 'message_stop' })}\n`,
  ];
  let i = 0;
  return { ok: true, status: 200, body: { getReader: () => ({ read: async () => (i < frames.length ? { done: false, value: enc.encode(frames[i++]) } : { done: true }) }) } };
};

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn(async () => okJson('ok'));
  globalThis.fetch = fetchMock;
  checkAiConsentForSend.mockReset();
});

describe('送る直前の関所', () => {
  it('callClaude: やめたら送らず、案内の文を返す（エラーの見た目にしない）', async () => {
    checkAiConsentForSend.mockResolvedValue({ ok: false, version: null });
    const r = await callClaude('sys', 'hi', { purpose: 'condense' });
    expect(r).toBe(AI_CONSENT_DECLINED_TEXT);
    expect(isAiNoticeString(r)).toBe(true);
    expect(checkAiConsentForSend).toHaveBeenCalledWith('condense');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('callClaude: 同意済みなら送り、同意の版をヘッダーに付ける', async () => {
    checkAiConsentForSend.mockResolvedValue({ ok: true, version: 1 });
    const r = await callClaude('sys', 'hi', { purpose: 'setup_sheet' });
    expect(r).toBe('ok');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Orime-Ai-Consent']).toBe('1');
    expect(JSON.parse(init.body).purpose).toBe('setup_sheet');
  });

  it('streamClaude: やめたら送らず、consentDeclined の印つきで止まる', async () => {
    checkAiConsentForSend.mockResolvedValue({ ok: false, version: null });
    const onError = vi.fn();
    await expect(streamClaude({ messages: [], purpose: 'consult', onError })).rejects.toMatchObject({ consentDeclined: true, notice: true });
    expect(checkAiConsentForSend).toHaveBeenCalledWith('consult');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('streamClaude: 同意済みなら送り、同意の版をヘッダーに付ける', async () => {
    checkAiConsentForSend.mockResolvedValue({ ok: true, version: 1 });
    fetchMock.mockResolvedValueOnce(sse('こたえ'));
    const text = await streamClaude({ messages: [{ role: 'user', content: 'q' }], purpose: 'book_advisor' });
    expect(text).toBe('こたえ');
    expect(fetchMock.mock.calls[0][1].headers['X-Orime-Ai-Consent']).toBe('1');
  });
});

describe('AI の関数は自分の用途で関所を通る（やめたら送らない）', () => {
  beforeEach(() => { checkAiConsentForSend.mockResolvedValue({ ok: false, version: null }); });

  it('写真から書き起こし → ocr（やめたら案内として止まる）', async () => {
    await expect(extractTextFromImage({ base64: 'AAAA' })).rejects.toMatchObject({ notice: true });
    expect(checkAiConsentForSend).toHaveBeenCalledWith('ocr');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('凝縮 → condense', async () => {
    await expect(condenseMemo({ text: 'あ'.repeat(80) })).rejects.toMatchObject({ notice: true });
    expect(checkAiConsentForSend).toHaveBeenCalledWith('condense');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('メモからまとめ → cards_to_summary', async () => {
    await expect(summarizeCards({ title: '本', cards: ['い'.repeat(30), 'ろ'.repeat(30)] })).rejects.toMatchObject({ notice: true });
    expect(checkAiConsentForSend).toHaveBeenCalledWith('cards_to_summary');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('運営の参謀も関所を通る（ops_advise は聞かない側の用途として渡す）', async () => {
    await opsAdvise({ messages: [{ role: 'user', content: 'どうする？' }] });
    expect(checkAiConsentForSend).toHaveBeenCalledWith('ops_advise');
  });
});

// ── ソースを読んで確かめる ─────────────────────────────────────
const SRC = join(__dirname, '..');
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'demo') walk(p, out); continue; }
    if (/\.(js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ p: p.slice(SRC.length + 1), s: readFileSync(p, 'utf8') }));

describe('AI に送る道は関所の 2 か所だけ', () => {
  it('/api/claude に fetch するのは lib/ai.js と lib/streamClaude.js（と Jev の lib/jev.js）だけ', () => {
    const senders = files.filter(({ s }) => /fetch\(\s*apiUrl\(\s*['"]\/api\/claude['"]/.test(s) || /fetch\(\s*['"`][^'"`]*\/api\/claude/.test(s)).map(({ p }) => p).sort();
    expect(senders).toEqual(['lib/ai.js', 'lib/jev.js', 'lib/streamClaude.js']);
  });

  it('どれも送る前に関所を通る（Jev はシートを出さず、版 2 の同意が無ければ送らない）', () => {
    const gates = { 'lib/ai.js': 'checkAiConsentForSend(', 'lib/streamClaude.js': 'checkAiConsentForSend(', 'lib/jev.js': 'await jevConsentOk(' };
    for (const [p, g] of Object.entries(gates)) {
      const s = files.find((f) => f.p === p).s;
      const gate = s.indexOf(g);
      const send = s.search(/fetch\(\s*apiUrl\(\s*['"]\/api\/claude/);
      expect(gate, `${p} に関所がある`).toBeGreaterThan(0);
      expect(gate, `${p} の関所は fetch より前`).toBeLessThan(send);
    }
  });

  it('callClaude / streamClaude の呼び出しはどれも用途（purpose）を付ける（シートが何の機能か分かるように）', () => {
    const missing = [];
    for (const { p, s } of files) {
      const re = /(?:await\s+|=>\s*)(callClaude|streamClaude)\(/g;
      let m;
      while ((m = re.exec(s))) {
        // 呼び出しの括弧の終わりまで（ネストを数える）
        let depth = 0; let i = m.index + m[0].length - 1; const start = i;
        for (; i < s.length; i += 1) { if (s[i] === '(') depth += 1; else if (s[i] === ')') { depth -= 1; if (depth === 0) break; } }
        const call = s.slice(start, i + 1);
        if (!/purpose\s*:/.test(call)) missing.push(`${p}: ${call.slice(0, 60).replace(/\s+/g, ' ')}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('各機能の入口（押したとき）でも ensureAiConsent を呼ぶ', () => {
    const entries = {
      'components/MyBookBrain.jsx': ['consult'],
      'components/BookAdvisor.jsx': ['advisor_interview'],
      'App.jsx': ['setup_sheet', 'setup_sheet_edit'],
      'components/QuickMemoSheet.jsx': ['condense'],
      'components/BookMemoEditor.jsx': ['condense'],
      'components/BookMemoList.jsx': ['cards_to_summary'],
      'components/PhotoToTextButton.jsx': ['ocr'],
    };
    for (const [p, purposes] of Object.entries(entries)) {
      const s = files.find((f) => f.p === p)?.s || '';
      for (const purpose of purposes) expect(s.includes(`ensureAiConsent('${purpose}')`), `${p} → ${purpose}`).toBe(true);
    }
    // 同意の要る用途は、どれかの入口で聞いている（book_advisor は AI 選書の聞き返しのあとにだけ動く）
    const asked = new Set(Object.values(entries).flat());
    for (const p of PURPOSES) {
      if (p === 'ops_advise' || p === 'book_advisor') continue;
      expect(asked.has(p), `${p} の入口`).toBe(true);
    }
  });
});
