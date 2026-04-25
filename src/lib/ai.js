import { supabase, isSupabaseConfigured } from './supabase';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 1024;

async function getAccessToken() {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

async function postClaude(payload) {
  const accessToken = await getAccessToken();
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch('/api/claude', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    return '通信エラー';
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return 'レスポンス解析エラー';
  }

  if (!res.ok) {
    if (res.status === 401) return 'AI機能を使うにはログインが必要です。';
    if (res.status === 429) return 'リクエストが多すぎます。少し時間をおいて再試行してください。';
    if (data?.error?.message) return `エラー: ${data.error.message}`;
    if (typeof data?.error === 'string') return `エラー: ${data.error}`;
    return 'エラー';
  }

  if (Array.isArray(data?.content)) {
    return data.content.map((b) => b.text || '').join('\n') || 'エラー';
  }
  return 'エラー';
}

/**
 * Supports the legacy (system, userMessage, options?) signature used by App.jsx
 * as well as a (messages, options) form for new callers.
 */
export async function callClaude(systemOrMessages, userOrOptions, options) {
  let messages;
  let opts;
  let system;

  if (Array.isArray(systemOrMessages)) {
    messages = systemOrMessages;
    opts = userOrOptions || {};
    system = opts.system;
  } else {
    system = systemOrMessages;
    messages = [{ role: 'user', content: userOrOptions }];
    opts = options || {};
  }

  const payload = {
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.max_tokens || DEFAULT_MAX_TOKENS,
    messages,
  };
  if (system) payload.system = system;

  return postClaude(payload);
}

export default callClaude;

// ============================================================================
// 🧠 マイ読書脳 (My Book Brain)
// ============================================================================
// Builds a prompt from the user's memos (book + personal) and asks Claude to
// answer a question grounded in those memos. Returns { content, refs }.
//
// Token budgeting: we cap to ~80 memos by priority (rating × 2 + recency rank).
// Heavy users with hundreds of memos still fit in a single Claude call.

const MAX_MEMOS = 80;

function memoPriority(memo) {
  // Newer memos are weighted higher; book memos with high ratings get a boost.
  const ageDays = memo.created_at
    ? (Date.now() - Date.parse(memo.created_at)) / 86400000
    : 9999;
  const recencyScore = Math.max(0, 100 - ageDays);
  const rating = memo.book?.rating || 0;
  const ratingScore = rating * 8;
  const personalBoost = memo.source_type === 'personal' ? 6 : 0;
  return recencyScore + ratingScore + personalBoost;
}

function pickCategory(tags) {
  if (!Array.isArray(tags)) return null;
  const cat = tags.find((t) => typeof t === 'string' && t.startsWith('@'));
  return cat ? cat.slice(1) : null;
}

function formatMemo(memo) {
  if (memo.source_type === 'personal' || !memo.book) {
    const date = memo.created_at?.slice(0, 10) || '';
    const cat = pickCategory(memo.tags) || 'その他';
    return `【自分の学び: ${date} / ${cat}】${memo.text || ''}`;
  }
  const b = memo.book;
  const parts = [`本: ${b.title || ''}`];
  if (b.author) parts.push(`著者: ${b.author}`);
  if (Number.isFinite(memo.page_number)) parts.push(`P.${memo.page_number}`);
  const tagText = (memo.tags || [])
    .filter((t) => typeof t === 'string' && !t.startsWith('@'))
    .map((t) => `#${t}`)
    .join(' ');
  if (tagText) parts.push(`タグ: ${tagText}`);
  return `【${parts.join(' / ')}】${memo.text || ''}`;
}

const BRAIN_SYSTEM = `あなたはユーザーの過去の読書メモと自分の学びを基にアドバイスする「マイ読書脳」です。
以下のメモはユーザーが本から得た気づき・学び、および本以外（会話・経験・観察など）から得た学びです。これらを総合的に判断し、ユーザーの質問に親身に答えてください。

回答ルール:
- 必ずユーザーのメモから根拠を示す
- 「あなたのメモから判断すると…」のように、メモを参照していることが伝わる書き出しにする
- 2〜3 段落、簡潔だが具体的に
- 末尾に参照したメモのリストを以下の形式で示す:
  REFS_START
  - 📚 著者『本のタイトル』P.◯◯
  - 💡 自分の学び (YYYY-MM-DD / カテゴリ)
  REFS_END
- 該当するメモがない時は正直に「まだ関連するメモがないので、◯◯のような本を読むと参考になるかもしれません」と答える`;

function parseRefs(text) {
  if (typeof text !== 'string') return { body: text || '', refs: [] };
  const m = text.match(/REFS_START\s*([\s\S]*?)\s*REFS_END/);
  if (!m) return { body: text, refs: [] };
  const body = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  const refs = m[1]
    .split('\n')
    .map((line) => line.replace(/^[-・\s•]+/, '').trim())
    .filter(Boolean);
  return { body, refs };
}

export async function callMyBookBrain({ userId, question }) {
  if (!isSupabaseConfigured || !userId) {
    throw new Error('Supabase が設定されていません。');
  }
  const { data, error } = await supabase
    .from('book_memos')
    .select('*, book:books(id, title, author, rating)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const all = data || [];
  // Priority-rank, then preserve original recency order for the slice.
  const ranked = [...all]
    .map((m, i) => ({ memo: m, score: memoPriority(m) - i * 0.01 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MEMOS)
    .map((x) => x.memo);

  if (ranked.length === 0) {
    return {
      body:
        'まだメモが 1 件も保存されていません。本を読んでメモを書くと、ここでマイ読書脳があなただけのアドバイザーになります。',
      refs: [],
      memoCount: 0,
      memoTotal: 0,
    };
  }

  const formatted = ranked.map(formatMemo).join('\n\n');
  const userPrompt =
    `ユーザーのメモ一覧（重要度順、合計 ${ranked.length}/${all.length} 件を抜粋）:\n\n` +
    formatted +
    `\n\nそれでは、以下の質問に答えてください:\n${question}`;

  const result = await callClaude(BRAIN_SYSTEM, userPrompt, { max_tokens: 1500 });

  // callClaude returns string for both success and known errors. Treat error
  // strings as plain content but with no refs.
  if (typeof result !== 'string' || result.startsWith('エラー') || result.startsWith('AI機能') || result.startsWith('リクエスト')) {
    return { body: result || 'エラー', refs: [], memoCount: ranked.length, memoTotal: all.length };
  }

  const parsed = parseRefs(result);
  return {
    body: parsed.body,
    refs: parsed.refs,
    memoCount: ranked.length,
    memoTotal: all.length,
  };
}

