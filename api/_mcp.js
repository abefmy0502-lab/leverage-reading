// 🔌 AI と連携（MCP）の本体（2026-11-07 オーナー「アプリと AI が繋がるようにしたい」）。
//
// Orime を MCP（Model Context Protocol）のサーバーにして、利用者が Claude・ChatGPT・Claude Code などの AI から
// 自分の本・メモ・行動を呼べるようにする。HTTP の入口は api/mcp.js。ここは HTTP に依存しない純粋な部分
//（JSON-RPC の振り分け・道具の一覧・道具の中身）で、テスト（api/_mcp.test.js）は偽の DB で動かす。
//
// 決まり:
//   - 読めるのは本人のものだけ（接続キーで本人を決め、すべての問い合わせに user_id を付ける・service_role で読む）。
//   - 書けるのは「メモを足す」「行動を足す」だけ（消す・直す・本の状態を変えるはアプリで）。
//   - 相談（AI の答え）はここから呼ばない＝Orime のトークンは使わない。AI 側が材料として読むだけ。
//   - 文字は制御文字を除き、長さを切る（src/lib/limits.js と同じ上限）。
//   - 返すのは AI が読みやすい文字（Markdown 風）。個人の id は本・メモの id だけ（利用者 id は返さない）。
import { createHash } from 'node:crypto';

export const PROTOCOL_VERSION = '2025-06-18';
export const SERVER_INFO = { name: 'orime', version: '1.0.0' };
export const TOKEN_PREFIX = 'orime_mcp_';
const MEMO_TEXT_MAX = 5000;
const ACTION_TEXT_MAX = 500;
const QUERY_MAX = 200;
const LIMIT_MAX = 50;
const STATUS_LABEL = { want: '読みたい', before: '積読', reading: '読書中', done: '読了' };
const STATUS_KEYS = Object.keys(STATUS_LABEL);

export function sha256Hex(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex');
}

export function looksLikeToken(t) {
  return typeof t === 'string' && t.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_-]{32,80}$/.test(t.slice(TOKEN_PREFIX.length));
}

function clean(text, max) {
  if (typeof text !== 'string') return '';
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/[​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, max);
}
function limitOf(v, dflt = 20) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return dflt;
  return Math.min(LIMIT_MAX, Math.floor(n));
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const dateOnly = (iso) => (typeof iso === 'string' ? iso.slice(0, 10) : '');

class ToolError extends Error {}

// ---------- 道具の一覧（AI に見せる説明は日本語＋英語の 1 行） ----------
export const TOOLS = [
  {
    name: 'list_books',
    description: '本棚の本を一覧する（状態・言葉で絞れる）。List the user\'s books in Orime, optionally filtered by status (want/before/reading/done) or a keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: STATUS_KEYS, description: 'want=読みたい / before=積読 / reading=読書中 / done=読了' },
        query: { type: 'string', description: '書名・著者に含まれる言葉' },
        limit: { type: 'integer', minimum: 1, maximum: LIMIT_MAX, default: 20 },
      },
    },
  },
  {
    name: 'get_book',
    description: '1 冊の本の詳細（読書準備・メモ・この本のまとめ・行動）を読む。Get one book with its memos, summary, reading plan and actions.',
    inputSchema: { type: 'object', properties: { book_id: { type: 'string', description: 'list_books で得た id' } }, required: ['book_id'] },
  },
  {
    name: 'search_memos',
    description: '自分のメモを言葉で探す（本を横断）。Search the user\'s own memos by keywords (space-separated words are ANDed).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '探す言葉（空白で区切ると全部を含むメモ）' },
        book_id: { type: 'string', description: 'この本の中だけで探す（任意）' },
        limit: { type: 'integer', minimum: 1, maximum: LIMIT_MAX, default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'recent_memos',
    description: '最近書いたメモを新しい順に読む。Read the most recent memos (newest first).',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: LIMIT_MAX, default: 20 }, days: { type: 'integer', minimum: 1, maximum: 3660, description: 'この日数以内（任意）' } } },
  },
  {
    name: 'list_actions',
    description: '行動（読んで決めたやること）を一覧する。List the user\'s actions (to-dos decided from reading), open ones by default.',
    inputSchema: { type: 'object', properties: { done: { type: 'boolean', description: 'true=完了した行動 / false（既定）=まだの行動' }, limit: { type: 'integer', minimum: 1, maximum: LIMIT_MAX, default: 30 } } },
  },
  {
    name: 'add_memo',
    description: '本にメモを足す（本の id が無ければ、本に紐づかない学びのメモ）。Add a memo to a book (or a personal learning memo without a book).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: `メモの本文（${MEMO_TEXT_MAX} 字まで）` },
        book_id: { type: 'string', description: '本の id（任意）' },
        page_number: { type: 'integer', minimum: 0, description: 'ページ番号（任意）' },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 10, description: 'メモのタグ（任意）' },
      },
      required: ['text'],
    },
  },
  {
    name: 'add_action',
    description: '本から決めた行動を足す。Add an action (to-do) tied to a book, with an optional deadline (YYYY-MM-DD).',
    inputSchema: {
      type: 'object',
      properties: {
        book_id: { type: 'string', description: '本の id' },
        text: { type: 'string', description: `行動（${ACTION_TEXT_MAX} 字まで）` },
        deadline: { type: 'string', description: '期限 YYYY-MM-DD（任意）' },
      },
      required: ['book_id', 'text'],
    },
  },
];

// ---------- DB（service_role・いつも user_id で絞る） ----------
async function run(q) {
  const { data, error } = await q;
  if (error) throw new ToolError(error.message || 'db error');
  return data || [];
}

function fieldsOf(row) {
  const tags = Array.isArray(row.book_tags) ? row.book_tags.map((t) => t?.tag_name).filter(Boolean) : [];
  return tags;
}

function bookLine(b) {
  const bits = [`- ${b.title || '（無題）'}`];
  if (b.author) bits.push(`／${b.author}`);
  const meta = [STATUS_LABEL[b.status] || b.status];
  if (b.rating) meta.push(`★${b.rating}`);
  if (b.done_date) meta.push(`読了 ${dateOnly(b.done_date)}`);
  else if (b.start_date) meta.push(`開始 ${dateOnly(b.start_date)}`);
  const f = fieldsOf(b);
  if (f.length) meta.push(`分野: ${f.join('・')}`);
  return `${bits.join('')}（${meta.join(' · ')}）\n  id: ${b.id}`;
}

function memoLine(m, bookTitle) {
  const head = [bookTitle ? `『${bookTitle}』` : '（本なし）', m.page_number != null ? `p.${m.page_number}` : '', dateOnly(m.created_at)].filter(Boolean).join(' · ');
  const tags = Array.isArray(m.tags) && m.tags.length ? `\n  タグ: ${m.tags.join('・')}` : '';
  return `- ${head}\n  ${String(m.text || '').trim().replace(/\n/g, '\n  ')}${tags}\n  memo_id: ${m.id}`;
}

async function ownBook(db, userId, bookId) {
  if (!isUuid(bookId)) throw new ToolError('book_id の形が違います（list_books の id を使ってください）');
  const rows = await run(db.from('books').select('id, title, author, status').eq('user_id', userId).eq('id', bookId).limit(1));
  if (!rows.length) throw new ToolError('その id の本は本棚にありません');
  return rows[0];
}

async function titleMap(db, userId, ids) {
  const uniq = [...new Set(ids.filter(isUuid))];
  if (!uniq.length) return new Map();
  const rows = await run(db.from('books').select('id, title').eq('user_id', userId).in('id', uniq));
  return new Map(rows.map((r) => [r.id, r.title]));
}

const handlers = {
  async list_books({ status, query, limit }, { db, userId }) {
    let q = db.from('books').select('id, title, author, status, rating, start_date, done_date, book_tags(tag_name)').eq('user_id', userId).order('updated_at', { ascending: false }).limit(limitOf(limit, 20));
    if (status && STATUS_KEYS.includes(status)) q = q.eq('status', status);
    const word = clean(query, QUERY_MAX);
    if (word) q = q.or(`title.ilike.%${word.replace(/[%,()]/g, ' ')}%,author.ilike.%${word.replace(/[%,()]/g, ' ')}%`);
    const rows = await run(q);
    if (!rows.length) return '本が見つかりませんでした。';
    return `本 ${rows.length} 冊\n${rows.map(bookLine).join('\n')}`;
  },

  async get_book({ book_id }, { db, userId }) {
    if (!isUuid(book_id)) throw new ToolError('book_id の形が違います（list_books の id を使ってください）');
    const rows = await run(db.from('books').select('id, title, author, status, rating, start_date, done_date, invest_purpose, current_challenge, hypothesis, book_reason, leverage_memo, book_tags(tag_name)').eq('user_id', userId).eq('id', book_id).limit(1));
    if (!rows.length) throw new ToolError('その id の本は本棚にありません');
    const b = rows[0];
    const memos = await run(db.from('book_memos').select('id, text, page_number, tags, created_at').eq('user_id', userId).eq('book_id', b.id).order('created_at', { ascending: true }).limit(200));
    const actions = await run(db.from('actions').select('id, text, deadline, done').eq('user_id', userId).eq('book_id', b.id).order('created_at', { ascending: true }).limit(100));
    const out = [bookLine(b)];
    const prep = [['得たいこと', b.invest_purpose], ['課題', b.current_challenge], ['仮説', b.hypothesis], ['選んだ理由', b.book_reason]].filter(([, v]) => v && String(v).trim());
    if (prep.length) out.push('\n## 読書準備', ...prep.map(([k, v]) => `- ${k}: ${clean(String(v), 2000)}`));
    if (b.leverage_memo && String(b.leverage_memo).trim()) out.push('\n## この本のまとめ', clean(String(b.leverage_memo), 8000));
    out.push(`\n## メモ（${memos.length} 件）`, memos.length ? memos.map((m) => memoLine(m, null).replace('（本なし） · ', '').replace('（本なし）', '')).join('\n') : '（まだありません）');
    if (actions.length) out.push(`\n## 行動（${actions.length} 件）`, actions.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.deadline ? `（期限 ${dateOnly(a.deadline)}）` : ''}`).join('\n'));
    return out.join('\n');
  },

  async search_memos({ query, book_id, limit }, { db, userId }) {
    const words = clean(query, QUERY_MAX).split(/\s+/).filter(Boolean).slice(0, 5);
    if (!words.length) throw new ToolError('query（探す言葉）を入れてください');
    let q = db.from('book_memos').select('id, book_id, text, page_number, tags, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limitOf(limit, 20));
    if (book_id) { if (!isUuid(book_id)) throw new ToolError('book_id の形が違います'); q = q.eq('book_id', book_id); }
    for (const w of words) q = q.ilike('text', `%${w.replace(/[%_]/g, ' ')}%`);
    const rows = await run(q);
    if (!rows.length) return `「${words.join(' ')}」を含むメモはありませんでした。`;
    const titles = await titleMap(db, userId, rows.map((r) => r.book_id));
    return `メモ ${rows.length} 件（「${words.join(' ')}」）\n${rows.map((m) => memoLine(m, titles.get(m.book_id))).join('\n')}`;
  },

  async recent_memos({ limit, days }, { db, userId }) {
    let q = db.from('book_memos').select('id, book_id, text, page_number, tags, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limitOf(limit, 20));
    const d = Number(days);
    if (Number.isFinite(d) && d > 0) q = q.gte('created_at', new Date(Date.now() - Math.min(3660, d) * 86400000).toISOString());
    const rows = await run(q);
    if (!rows.length) return 'メモはまだありません。';
    const titles = await titleMap(db, userId, rows.map((r) => r.book_id));
    return `最近のメモ ${rows.length} 件\n${rows.map((m) => memoLine(m, titles.get(m.book_id))).join('\n')}`;
  },

  async list_actions({ done, limit }, { db, userId }) {
    const wantDone = done === true;
    const rows = await run(db.from('actions').select('id, book_id, text, deadline, done, completed_at').eq('user_id', userId).eq('done', wantDone).order('deadline', { ascending: true, nullsFirst: false }).limit(limitOf(limit, 30)));
    if (!rows.length) return wantDone ? '完了した行動はまだありません。' : 'まだの行動はありません。';
    const titles = await titleMap(db, userId, rows.map((r) => r.book_id));
    return `${wantDone ? '完了した行動' : 'まだの行動'} ${rows.length} 件\n${rows.map((a) => `- [${a.done ? 'x' : ' '}] ${a.text}${a.deadline ? `（期限 ${dateOnly(a.deadline)}）` : ''}${titles.get(a.book_id) ? ` — 『${titles.get(a.book_id)}』` : ''}`).join('\n')}`;
  },

  async add_memo({ text, book_id, page_number, tags }, { db, userId }) {
    const body = clean(text, MEMO_TEXT_MAX);
    if (!body) throw new ToolError('text（メモの本文）を入れてください');
    let book = null;
    if (book_id) book = await ownBook(db, userId, book_id);
    const page = Number.isInteger(page_number) && page_number >= 0 ? page_number : null;
    const tagList = Array.isArray(tags) ? tags.map((t) => clean(String(t), 30)).filter(Boolean).slice(0, 10) : [];
    const row = { user_id: userId, book_id: book ? book.id : null, text: body, page_number: page, tags: tagList, photo_path: null, source_type: book ? 'book' : 'personal' };
    const rows = await run(db.from('book_memos').insert([row]).select('id'));
    return `メモを足しました${book ? `（『${book.title}』）` : '（本なし）'}。memo_id: ${rows[0]?.id || ''}`;
  },

  async add_action({ book_id, text, deadline }, { db, userId }) {
    const body = clean(text, ACTION_TEXT_MAX);
    if (!body) throw new ToolError('text（行動）を入れてください');
    const book = await ownBook(db, userId, book_id);
    const dl = typeof deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && !Number.isNaN(Date.parse(deadline)) ? deadline : null;
    const rows = await run(db.from('actions').insert([{ user_id: userId, book_id: book.id, text: body, deadline: dl, done: false }]).select('id'));
    return `行動を足しました（『${book.title}』${dl ? `・期限 ${dl}` : ''}）。action_id: ${rows[0]?.id || ''}`;
  },
};

// ---------- 接続キー → 本人 ----------
// 戻り値 { userId, tokenId } か null。取り消したキー・無いキーは null。
export async function resolveToken(db, token) {
  if (!looksLikeToken(token)) return null;
  const hash = sha256Hex(token);
  const { data, error } = await db.from('mcp_tokens').select('id, user_id, revoked_at, last_used_at').eq('token_hash', hash).limit(1);
  if (error || !data?.length) return null;
  const row = data[0];
  if (row.revoked_at) return null;
  return { userId: row.user_id, tokenId: row.id, lastUsedAt: row.last_used_at };
}

// 最後に使った時刻（10 分に 1 回だけ書く・失敗しても止めない）。
export async function touchToken(db, tokenRow, now = Date.now()) {
  const last = tokenRow.lastUsedAt ? Date.parse(tokenRow.lastUsedAt) : 0;
  if (now - last < 10 * 60 * 1000) return false;
  try { await db.from('mcp_tokens').update({ last_used_at: new Date(now).toISOString() }).eq('id', tokenRow.tokenId); } catch { /* ignore */ }
  return true;
}

// ---------- JSON-RPC ----------
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

// 1 つのメッセージを処理する。通知（id が無い）は null を返す。
export async function handleRpc(msg, ctx) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid Request');
  const { id, method, params } = msg;
  const isNotification = id === undefined;
  if (method.startsWith('notifications/')) return null;
  const respond = (r) => (isNotification ? null : r);
  switch (method) {
    case 'initialize':
      return respond(rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: 'Orime（読書メモのアプリ）に残した、この利用者の本・メモ・行動を読み書きします。答えるときは、どの本のどのメモを根拠にしたかを添えてください。メモは本人の言葉なので、言い換えずに引用してください。',
      }));
    case 'ping':
      return respond(rpcResult(id, {}));
    case 'tools/list':
      return respond(rpcResult(id, { tools: TOOLS }));
    case 'tools/call': {
      const name = params?.name;
      const fn = handlers[name];
      if (!fn) return respond(rpcError(id, -32602, `Unknown tool: ${name}`));
      try {
        const text = await fn(params?.arguments && typeof params.arguments === 'object' ? params.arguments : {}, ctx);
        return respond(rpcResult(id, { content: [{ type: 'text', text }], isError: false }));
      } catch (e) {
        const text = e instanceof ToolError ? e.message : 'いま読み書きできませんでした。少し待って、もう一度お試しください。';
        return respond(rpcResult(id, { content: [{ type: 'text', text }], isError: true }));
      }
    }
    default:
      return respond(rpcError(id, -32601, 'Method not found'));
  }
}

// 1 つでも配列でも受けて、返すものだけを返す（通知だけなら空）。
export async function handleBatch(body, ctx) {
  const list = Array.isArray(body) ? body : [body];
  if (!list.length) return [rpcError(null, -32600, 'Invalid Request')];
  const out = [];
  for (const m of list) {
    const r = await handleRpc(m, ctx);
    if (r) out.push(r);
  }
  return Array.isArray(body) ? out : out;
}
