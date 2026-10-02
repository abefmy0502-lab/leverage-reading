// 🧭 相談の「今回の質問にとくに関係がありそうなメモ」を Jev（TypeSafe AI の判断のモデル）に選んでもらう（2026-10-02）。
//
// 相談のメモは 2 つの塊で渡す（lib/ai.js の selectConsultMemos・docs/ai-routing.md §7）:
//   芯     … 質問に左右されないメモ一覧（その日のうちは同じ文字＝キャッシュが効く）← Jev は触らない
//   関係するメモ … 質問ごとに変わる塊（いまは 2 文字ずつの語片の重なり＝pickRelatedMemos）← ここだけを Jev で選ぶ
// 候補（語片が重なるメモ 20 件＋重要度の高いメモで 30 件まで）を、メモ 1 件ずつ「この質問の役に立つか」で
// 決めてもらい、確率 JEV_RELEVANCE_MIN 以上を確率の高い順に並べる。Jev が使えないときは null（今までの選び方）。
// 送るのは質問と、候補の一節（160 字まで）と書名だけ（メモの id は送らず、m0〜 の番号を付ける）。

export const JEV_RELEVANCE_MIN = 0.5;
export const JEV_RELEVANCE_CANDIDATES = 30;
export const JEV_LEXICAL_CANDIDATES = 20;
const SNIPPET_CHARS = 160;

// 候補: 語片が重なるメモ（近い順）→ 重要度の高いメモ（重なりの無い、意味だけが近いメモを拾うため）。
//   lexical: pickRelatedMemos の結果（近い順）/ byPriority: 重要度の高い順のメモ
export function relevanceCandidates({ lexical = [], byPriority = [], max = JEV_RELEVANCE_CANDIDATES, lexicalMax = JEV_LEXICAL_CANDIDATES } = {}) {
  const out = [];
  const seen = new Set();
  const add = (m) => {
    if (!m || seen.has(m) || !String(m.text || '').trim()) return;
    seen.add(m);
    out.push(m);
  };
  for (const m of lexical.slice(0, lexicalMax)) add(m);
  for (const m of byPriority) {
    if (out.length >= max) break;
    add(m);
  }
  return out.slice(0, max);
}

// 送る材料（api/_jevTasks.js の readRelevanceInput の形）。clean: プロンプトに入れる前の整え（sanitizeForPrompt）。
export function relevanceInput(question, candidates, { clean = (s) => String(s || '') } = {}) {
  return {
    question: [...clean(question)].slice(0, 400).join(''),
    memos: candidates.map((m, i) => ({
      id: `m${i}`,
      text: [...clean(m.text).replace(/\s+/g, ' ').trim()].slice(0, SNIPPET_CHARS).join(''),
      book: [...clean(m.book?.title || '')].slice(0, 40).join(''),
    })),
  };
}

// 答え（{ m0: 確率, … }）→ 関係するメモ（確率の高い順・同じ確率は候補の順）。読めなければ null。
export function relatedFromScores(candidates, scores, { min = JEV_RELEVANCE_MIN } = {}) {
  if (!scores || typeof scores !== 'object') return null;
  const rows = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const p = Number(scores[`m${i}`]);
    if (!Number.isFinite(p)) return null; // 1 件でも欠けていたら使わない（一部の答えで偏らせない）
    if (p >= min) rows.push({ m: candidates[i], p, i });
  }
  rows.sort((a, b) => b.p - a.p || a.i - b.i);
  return rows.map((r) => r.m);
}
