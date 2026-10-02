// 🧭 Jev に決めてもらうこと（用途ごとの問いの組み立てと、答えの読み方）。2026-10-02。
// 名前が _ で始まるので Vercel の関数にはならない。api/_jevRelay.js（アプリからの中継）と scripts/jev-eval.mjs（評価）が使う。
//
// アプリから届くのは「材料」だけ（問いの文はサーバーが作る）。改造したアプリが自由な問いを Jev に送れないように
// （中継を何にでも使える判断の窓口にしない）。材料は長さと数で切り、制御文字を外す。
//
// 用途（docs/jev-plan.md の表）:
//   memo_relevance … 相談の質問に、このメモは役に立つか（メモ 1 件に 1 つの はい/いいえ）
//                    → 相談の「今回の質問にとくに関係がありそうなメモ」（質問ごとに変わる塊）だけを決める
//   memo_filing    … 保存したメモに、自分のタグのどれが合うか（タグ 1 つに 1 つの はい/いいえ）
//   intent         … 相談の問いの種類（本を探す / 相談 / 行動を決めたい / そのほか）の 1 つの選択
//                    （評価だけ。アプリはまだ使わない＝docs/jev-plan.md「先に評価」）
//
// 問いの文は英語（Jev は英語がいちばん得意・日本語は「扱えるが同じ精度ではない」）、材料は日本語のまま。
// 大きな問いを 1 つ立てるより、小さな はい/いいえ に分けたほうが日本語でも当たりやすい（公開の検証）ので、
// メモ・タグごとに 1 つずつ聞く。

export const RELEVANCE_MAX_MEMOS = 30;
export const RELEVANCE_MEMO_CHARS = 160;
export const RELEVANCE_TITLE_CHARS = 40;
export const QUESTION_CHARS = 400;
export const FILING_MAX_TAGS = 20;
export const FILING_TAG_CHARS = 30;
export const FILING_MEMO_CHARS = 600;
export const INTENTS = ['lookup', 'consult', 'decide_action', 'other'];

// 制御文字を外し、空白を詰め、長さで切る（api 側の sanitizeForPrompt）。
// 角かっこは全角にする（材料の中に「[m3]」を書いて、ほかのメモの印になりすますのを防ぐ）。
export function cleanJevText(v, max) {
  const s = String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
    .replace(/\[/g, '［').replace(/\]/g, '］')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [...s].slice(0, max).join('');
}

const yesNo = (instructions, yes, no) => ({ type: 'noul', instructions, criteria: { true: yes, false: no } });

// ── memo_relevance ─────────────────────────────────────────────────

// 材料を整える。読めなければ null。memos の id は 'm0'〜（アプリが付ける・メモの DB の id は送らない）。
export function readRelevanceInput(input) {
  const question = cleanJevText(input?.question, QUESTION_CHARS);
  if (!question || !Array.isArray(input?.memos)) return null;
  const memos = [];
  const seen = new Set();
  for (const m of input.memos.slice(0, RELEVANCE_MAX_MEMOS)) {
    const id = typeof m?.id === 'string' && /^m\d{1,2}$/.test(m.id) ? m.id : null;
    const text = cleanJevText(m?.text, RELEVANCE_MEMO_CHARS).replace(/\n+/g, ' ');
    if (!id || seen.has(id) || !text) continue;
    seen.add(id);
    memos.push({ id, text, book: cleanJevText(m?.book, RELEVANCE_TITLE_CHARS).replace(/[『』\n]/g, '') });
  }
  return memos.length ? { question, memos } : null;
}

// 問いの組み立て。1 回に送るメモは maxQuestions 件まで（その回の state にはその回のメモだけを書く）。
export function relevanceRequests({ question, memos }, { maxQuestions = 6 } = {}) {
  const out = [];
  for (let i = 0; i < memos.length; i += maxQuestions) {
    const chunk = memos.slice(i, i + maxQuestions);
    // 判断のしかた（意味で決める・語の重なりでは決めない）は state に 1 回だけ書き、問いは短く（入力のトークンを抑える）。
    const state = `The user's question (Japanese):\n${question}\n\n` +
      `Notes the user wrote while reading books (Japanese, one per line, id in brackets). ` +
      `A note is useful when its idea, advice, example or warning applies to the user's situation, judged by meaning, ` +
      `not by shared words:\n` +
      chunk.map((m) => `[${m.id}]${m.book ? ` 『${m.book}』` : ''} ${m.text}`).join('\n');
    const questions = {};
    for (const m of chunk) {
      questions[m.id] = yesNo(
        `Is note [${m.id}] useful for answering the user's question?`,
        'Its idea applies to the question, even in different words.',
        'Different topic, or only surface words in common.',
      );
    }
    out.push({ state, questions });
  }
  return out;
}

// 答え → { scores: { m0: 0.82, … } }
export function relevanceResult(answers, { memos }) {
  const scores = {};
  for (const m of memos) {
    const a = answers?.[m.id];
    if (!a || a.type !== 'noul') return null;
    scores[m.id] = Math.round(a.p * 1000) / 1000;
  }
  return { scores };
}

// ── memo_filing ────────────────────────────────────────────────────

export function readFilingInput(input) {
  const memo = cleanJevText(input?.memo, FILING_MEMO_CHARS);
  if (!memo || !Array.isArray(input?.tags)) return null;
  const tags = [];
  for (const t of input.tags) {
    const tag = cleanJevText(t, FILING_TAG_CHARS).replace(/["“”\n]/g, '');
    if (tag && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= FILING_MAX_TAGS) break;
  }
  if (!tags.length) return null;
  return { memo, book: cleanJevText(input?.book, RELEVANCE_TITLE_CHARS).replace(/[『』\n]/g, ''), tags };
}

export function filingRequests({ memo, book, tags }) {
  const state = `A note the user just saved while reading${book ? ` 『${book}』` : ''} (Japanese):\n${memo}\n\n` +
    `The user's own tags (topic labels they already use): ${tags.map((t) => `"${t}"`).join(', ')}\n` +
    'A tag fits only if the note is clearly about that topic, so the user would look for it under that tag later.';
  const questions = {};
  tags.forEach((t, i) => {
    questions[`t${i}`] = yesNo(
      `Does the tag "${t}" fit this note?`,
      `The note is clearly about "${t}".`,
      `Not mainly about "${t}", or the link is weak.`,
    );
  });
  return [{ state, questions }];
}

// 答え → { probs: [p0, p1, …] }（送ったタグの順）
export function filingResult(answers, { tags }) {
  const probs = [];
  for (let i = 0; i < tags.length; i += 1) {
    const a = answers?.[`t${i}`];
    if (!a || a.type !== 'noul') return null;
    probs.push(Math.round(a.p * 1000) / 1000);
  }
  return { probs };
}

// ── intent ─────────────────────────────────────────────────────────

export function readIntentInput(input) {
  const question = cleanJevText(input?.question, QUESTION_CHARS);
  return question ? { question, followUp: input?.followUp === true } : null;
}

export function intentRequests({ question, followUp }) {
  const state = `${followUp ? 'A follow-up message in an ongoing conversation' : 'The first message'} the user sent to an advisor that ` +
    `answers from the user's own reading notes (Japanese):\n${question}`;
  return [{
    state,
    questions: {
      intent: {
        type: 'choice',
        instructions: 'What does the user want from this message?',
        criteria: {
          lookup: 'They are trying to remember WHICH BOOK (or which of their notes) said something, e.g. 「どの本だっけ」「何の本に書いてあった」.',
          consult: 'They describe a worry or situation and want advice or a perspective drawn from their reading.',
          decide_action: 'They explicitly ask what concrete step to take now, e.g. 「どうしたらいい」「何をすればいい」「行動を決めたい」.',
          other: 'A greeting, thanks, test, or something unrelated to their reading or worries.',
        },
      },
    },
  }];
}

export function intentResult(answers) {
  const a = answers?.intent;
  if (!a || a.type !== 'choice' || !INTENTS.includes(a.choice)) return null;
  return { intent: a.choice, confidence: a.confidence ?? null, probabilities: a.probabilities || null };
}

// 用途 → { read, requests, result }
export const JEV_TASKS = {
  memo_relevance: { read: readRelevanceInput, requests: relevanceRequests, result: relevanceResult },
  memo_filing: { read: readFilingInput, requests: filingRequests, result: filingResult },
  intent: { read: readIntentInput, requests: intentRequests, result: intentResult },
};

// 材料の文字数（ログ・原価の見積もり用）。
export function jevInputChars(requests) {
  let n = 0;
  for (const r of requests || []) {
    n += String(r.state || '').length;
    for (const q of Object.values(r.questions || {})) n += JSON.stringify(q).length;
  }
  return n;
}
