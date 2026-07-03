// 🤖 AI 選書 → 読書計画シート構造化要約
//
// BookAdvisor の会話履歴と「読みたいに追加」された本を Claude に渡して、
//   - investPurpose (投資目的)
//   - currentChallenge (現在の課題)
//   - hypothesis (この本に対する仮説)
//   - bookReason (なぜこの本か / AI としての選書理由)
// の 4 フィールドにまとめさせる。失敗してもアプリは止めない (呼び出し側で
// fallback を持つ)。

import { callClaude, sanitizeForPrompt } from './ai.js';
import { PROMPTS } from './prompts.js';
import { LIMITS, clamp } from './limits.js';

const ROLE_LABEL = { user: 'ユーザー', assistant: 'AI', system: 'system' };

function buildConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  return messages
    .map((m) => {
      // ここまでで既に BookAdvisor 側の各所で sanitize されている想定だが、
      // AI に渡す直前の境界としてもう一段 sanitize+clamp する（他の AI
      // 呼び出し口と同じ防御的パターン。CLAUDE.md のセキュリティチェック
      // リスト「AI prompt: ユーザー入力を sanitizeForPrompt() で除去」）。
      const raw = (m.content ?? m.text ?? '').toString();
      const text = clamp(sanitizeForPrompt(raw), LIMITS.memoText).trim();
      if (!text) return '';
      return `${ROLE_LABEL[m.role] || m.role}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

// 出力 JSON の周辺に余計な文字が混じっても拾えるように、最初の `{` と
// 最後の `}` を見つけてその区間をパースする。
function extractJson(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * @param {Array<{role:string, content?:string, text?:string}>} messages
 * @param {{title:string, author?:string}} selectedBook
 * @returns {Promise<{investPurpose:string, currentChallenge:string, hypothesis:string, bookReason:string}>}
 */
export async function summarizeAdvisorConversation(messages, selectedBook) {
  if (!selectedBook?.title) {
    throw new Error('selectedBook.title is required');
  }
  const conversation = buildConversation(messages);
  const prompt = PROMPTS.advisorSummary;
  const raw = await callClaude(
    prompt.system,
    prompt.user({
      conversation,
      title: selectedBook.title,
      author: selectedBook.author || '',
    }),
    { max_tokens: 800, model: 'claude-sonnet-4-6', cacheSystem: true },
  );
  const parsed = extractJson(raw);
  if (!parsed) throw new Error('JSON parse failed');
  return {
    investPurpose: typeof parsed.invest_purpose === 'string' ? parsed.invest_purpose.trim() : '',
    currentChallenge: typeof parsed.current_challenge === 'string' ? parsed.current_challenge.trim() : '',
    hypothesis: typeof parsed.hypothesis === 'string' ? parsed.hypothesis.trim() : '',
    bookReason: typeof parsed.book_reason === 'string' ? parsed.book_reason.trim() : '',
  };
}
