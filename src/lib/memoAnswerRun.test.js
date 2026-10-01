import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// AI を呼ぶ入口をすべて見張る（呼ばれたら失敗）。
vi.mock('./ai', () => ({
  streamMyBookBrain: vi.fn(() => { throw new Error('AI called'); }),
  callClaude: vi.fn(() => { throw new Error('AI called'); }),
}));
vi.mock('./streamClaude', () => ({
  streamClaude: vi.fn(() => { throw new Error('AI called'); }),
}));

import { runMemoAnswer } from './memoAnswerRun';
import * as ai from './ai';
import * as sc from './streamClaude';

const here = dirname(fileURLToPath(import.meta.url));

describe('メモが答える相談は AI を呼ばない（トークンを使わない）', () => {
  let fetchSpy;
  beforeEach(() => {
    fetchSpy = vi.fn(() => Promise.reject(new Error('network used')));
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('メモを読んで一節を返すだけで、/api/claude にも AI の関数にも触れない', async () => {
    const loadMemos = vi.fn(async () => ({ rows: [{ id: 'm1', book_id: 'b1', text: '報告は結論から先に話す。', created_at: '2026-09-01' }], error: null }));
    const r = await runMemoAnswer({ question: '上司への報告がうまくいかない', books: [{ id: 'b1', title: '本' }], loadMemos });
    expect(r.status).toBe('ready');
    expect(r.groups[0].hits[0].memoId).toBe('m1');
    expect(loadMemos).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.streamMyBookBrain).not.toHaveBeenCalled();
    expect(ai.callClaude).not.toHaveBeenCalled();
    expect(sc.streamClaude).not.toHaveBeenCalled();
  });

  it('メモを読めなかったときは error（AI に頼らない）', async () => {
    const r = await runMemoAnswer({ question: '報告', books: [], loadMemos: async () => ({ rows: null, error: new Error('x') }) });
    expect(r).toEqual({ status: 'error' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.streamMyBookBrain).not.toHaveBeenCalled();
  });

  it('メモが答える相談のモジュールは AI の入口を import しない', () => {
    for (const f of ['memoAnswer.js', 'memoAnswerRun.js', 'memoLinks.js']) {
      // コメント（「/api/claude は呼ばない」などの説明）は除いて、コードだけを見る
      const src = readFileSync(join(here, f), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      expect(src).not.toMatch(/from ['"]\.\/(ai|streamClaude|prompts)['"]/);
      expect(src).not.toMatch(/api\/claude|fetch\(/);
    }
  });

  it('本を探す問い（「『…』みたいなことを書いた本はどれ？」）は、探す言葉でメモから本と一節を返す（AI なし・2026-10-01）', async () => {
    const { lookupTerm } = await import('./consultHelpers');
    const q = '『部下に任せる』みたいなことを書いた本はどれ？';
    const loadMemos = vi.fn(async () => ({ rows: [
      { id: 'm1', book_id: 'b1', text: '部下に任せるときは、終わった状態を先に決める。', page_number: 64, created_at: '2026-05-27' },
      { id: 'm2', book_id: 'b2', text: '朝の時間を使って本を読む。', created_at: '2026-06-01' },
    ], error: null }));
    const r = await runMemoAnswer({ question: lookupTerm(q) || q, books: [{ id: 'b1', title: 'マネジャーの教科書' }, { id: 'b2', title: '朝の本' }], loadMemos });
    expect(r.status).toBe('ready');
    expect(r.groups.map((g) => g.bookId)).toEqual(['b1']);
    expect(r.groups[0].hits[0]).toMatchObject({ memoId: 'm1', page: 64 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(ai.streamMyBookBrain).not.toHaveBeenCalled();
    expect(sc.streamClaude).not.toHaveBeenCalled();
  });

  it('相談の画面は、本を探す問いをまずメモから探し、見つからないときだけ AI へ', () => {
    const src = readFileSync(join(here, '../components/MyBookBrain.jsx'), 'utf8');
    const ask = src.slice(src.indexOf('const ask = async'));
    const local = ask.indexOf('isBookLookup(q) && !opts.skipUserInsert && await lookupFromMemos(q, opts)) return;');
    const stream = ask.indexOf('await streamMyBookBrain(');
    expect(local).toBeGreaterThan(-1);
    expect(stream).toBeGreaterThan(local);
    // 探すのは runMemoAnswer（AI の入口ではない）
    const fn = src.slice(src.indexOf('const lookupFromMemos = async'), src.indexOf('const askFromMemos = '));
    expect(fn).toContain('runMemoAnswer(');
    expect(fn).not.toMatch(/streamMyBookBrain|streamClaude|callClaude/);
  });

  it('相談の画面は、無料のトークンを使い切ったら AI より先にメモの答えへ分ける', () => {
    const src = readFileSync(join(here, '../components/MyBookBrain.jsx'), 'utf8');
    const ask = src.slice(src.indexOf('const ask = async'));
    const branch = ask.indexOf('if (freeUsedUp) { askFromMemos(');
    const stream = ask.indexOf('await streamMyBookBrain(');
    expect(branch).toBeGreaterThan(-1);
    expect(stream).toBeGreaterThan(branch);
  });
});
