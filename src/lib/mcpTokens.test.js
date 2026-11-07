import { describe, it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { generateToken, hashToken, connectUrl, claudeCodeCommand, jsonConfigSnippet, cleanKeyName, lastUsedLabel, TOKEN_PREFIX, MCP_ENDPOINT } from './mcpTokens';
import { looksLikeToken, sha256Hex } from '../../api/_mcp.js';

if (!globalThis.crypto?.subtle) globalThis.crypto = webcrypto;

describe('接続キー（端末側）', () => {
  it('作ったキーはサーバーが受け付ける形・ハッシュはサーバーと同じ', async () => {
    const t = generateToken();
    expect(t.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(looksLikeToken(t)).toBe(true);
    expect(await hashToken(t)).toBe(sha256Hex(t));
    expect(generateToken()).not.toBe(t);
  });
  it('つなぐ先の URL と Claude Code のコマンド', () => {
    const t = `${TOKEN_PREFIX}abc`;
    expect(connectUrl(t)).toMatch(/^https:\/\/.+\/mcp\/orime_mcp_abc$/);
    expect(claudeCodeCommand(t)).toContain(`--header "Authorization: Bearer ${t}"`);
    expect(claudeCodeCommand(t)).toContain(MCP_ENDPOINT);
    expect(JSON.parse(jsonConfigSnippet(t)).mcpServers.orime.url).toBe(MCP_ENDPOINT);
  });
  it('名前は制御文字を除き 60 字まで・最後に使った日の言い方', () => {
    expect(cleanKeyName(' Claude\u0000 ')).toBe('Claude');
    expect(cleanKeyName('あ'.repeat(80))).toHaveLength(60);
    const now = Date.parse('2026-11-07T12:00:00+09:00');
    expect(lastUsedLabel(null)).toBe('まだ使っていません');
    expect(lastUsedLabel('2026-11-07T03:00:00+09:00', now)).toBe('今日使いました');
    expect(lastUsedLabel('2026-11-06T03:00:00+09:00', now)).toBe('昨日使いました');
    expect(lastUsedLabel('2026-11-01T03:00:00+09:00', now)).toBe('6 日前に使いました');
  });
});
