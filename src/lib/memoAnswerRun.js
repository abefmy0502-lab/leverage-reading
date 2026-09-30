// 💬 メモが答える相談を 1 回動かす（2026-10-01）。自分のメモを読み（loadMemos）、lib/memoAnswer.js で一節を選ぶだけ。
// ⚠️ ここからは AI（lib/ai.js・lib/streamClaude.js・/api/claude）を呼ばない＝トークンを使わない（memoAnswerRun.test.js で確かめる）。
import { answerFromMemos } from './memoAnswer';

// loadMemos: () => Promise<{ rows, error }>（hooks/useAllMemoRows.js の loadAllMemoRows を控えで上書きしたもの）
// 返り値: { status: 'ready', terms, searched, groups } | { status: 'error' }
export async function runMemoAnswer({ question, books = [], scopeIds = [], loadMemos }) {
  let rows = null;
  try {
    const res = await loadMemos();
    if (res && !res.error && Array.isArray(res.rows)) rows = res.rows;
  } catch { /* 下で error */ }
  if (!rows) return { status: 'error' };
  return { status: 'ready', ...answerFromMemos({ question, books, memos: rows, scopeIds }) };
}
