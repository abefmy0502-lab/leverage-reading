#!/usr/bin/env node
// 🤖 自動のセッションから Orime の MCP（運営の道具）を呼ぶ（2026-11-08・docs/mcp.md §7）。
//
//   node scripts/ops-mcp.mjs <道具の名前> '<JSON の引数>'
//   例: node scripts/ops-mcp.mjs ops_tasks '{"action":"claim"}'
//       node scripts/ops-mcp.mjs ops_post '{"action":"flush"}'
//
// 鍵は送らない: Authorization には仮の値を入れ、作業環境のネットワークのシークレット（ホスト orime.vercel.app・Authorization: Bearer <接続キー>）が
// 本物に差し替える（claude.ai の環境の設定で入れる・このリポジトリには置かない）。手元で使うときは ORIME_MCP_TOKEN を入れる。
// curl を使うのは、作業環境の HTTPS の経路（HTTPS_PROXY）を素直に通るため。出力は structuredContent（JSON）だけを標準出力に。
import { execFileSync } from 'node:child_process';

const [tool, rawArgs] = process.argv.slice(2);
if (!tool) { console.error('使い方: node scripts/ops-mcp.mjs <tool> \'<json>\''); process.exit(2); }
let args = {};
if (rawArgs) { try { args = JSON.parse(rawArgs); } catch { console.error('引数は JSON で'); process.exit(2); } }
const url = process.env.ORIME_MCP_URL || 'https://orime.vercel.app/api/mcp';
const token = process.env.ORIME_MCP_TOKEN || 'orime_mcp_proxy-injects-the-real-key';
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } });
let out;
try {
  out = execFileSync('curl', ['-sS', '--max-time', '60', '-X', 'POST', url, '-H', `Authorization: Bearer ${token}`, '-H', 'Content-Type: application/json', '-H', 'Accept: application/json, text/event-stream', '--data-binary', body], { encoding: 'utf8' });
} catch (e) {
  console.error('MCP に届きませんでした: ' + (e?.message || e)); process.exit(1);
}
let res;
try { res = JSON.parse(out); } catch {
  // SSE で返ったときは data: の行を拾う
  const line = out.split('\n').find((l) => l.startsWith('data:'));
  try { res = JSON.parse(line ? line.slice(5) : out); } catch { console.error('読めない答え: ' + out.slice(0, 300)); process.exit(1); }
}
if (res.error) { console.error('エラー: ' + JSON.stringify(res.error)); process.exit(1); }
const r = res.result || {};
const text = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
if (r.isError) { console.error(text || 'tool error'); process.exit(1); }
console.error(text);
console.log(JSON.stringify(r.structuredContent ?? {}, null, 2));
