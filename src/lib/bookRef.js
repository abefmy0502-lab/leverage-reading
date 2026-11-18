// 📚 読書準備（この本で学べること・読書計画シート）の参考にする、推薦用の本のデータ（2026-11-17 オーナー「このデータがあれば読書準備の段階でのデータも変わりそう」）。
//   AI 選書と同じ検索（search_advisor_books）を書名で引き、ISBN か書名で同じ本を 1 冊選ぶ。新しい SQL は要らない。
//   返すのは 難しさ・前提知識・推薦者（5 人まで）・推薦ポイント・書評サイトの要約（500 字まで）。
//   書評サイトの要約は AI の参考だけ（画面に出さない・言い回しを写させない）。見つからない・つながらないときは null＝今までどおり。
import { searchCatalog } from './advisorCandidates';
import { titlesLooselySame } from './advisorProse';
import { DIFFICULTY_LABELS } from './readerLevel';

export const BOOK_REF_TIMEOUT_MS = 3000;
export const BOOK_REF_MAX_CHARS = 700;

const cache = new Map();
const isbn13 = (v) => {
  const s = String(v || '').replace(/[-\s]/g, '');
  return /^\d{13}$/.test(s) ? s : '';
};

/** 書名から検索の言葉（2〜20 字・副題や括弧の前まで）。 */
export function refTerm(title) {
  let t = String(title || '').split(/[（(：:―—\-〜~「『]/)[0].replace(/\s+/g, ' ').trim();
  // 空白の後ろは副題のことが多い（「確率思考の戦略論 どうすれば売上は増えるのか」）。前が 4 字以上なら前だけで探す。
  const head = t.split(' ')[0];
  if (head.length >= 4) t = head;
  return t.length >= 2 ? t.slice(0, 20) : '';
}

/** 検索の結果から、この本と同じ 1 冊（ISBN が一致・無ければ書名がほぼ同じ）。 */
export function pickRef(list, book) {
  const rows = Array.isArray(list) ? list : [];
  const isbn = isbn13(book?.isbn);
  const hit = (isbn && rows.find((r) => r.isbn === isbn))
    || (!isbn && rows.find((r) => titlesLooselySame(r.title, book?.title || '')));
  if (!hit) return null;
  const ref = {
    difficulty: hit.difficulty || 0,
    prereq: hit.prereq || '',
    endorsers: hit.endorsers || [],
    recPoints: hit.recPoints ?? null,
    extSummary: hit.extSummary || '',
  };
  return ref.difficulty || ref.prereq || ref.endorsers.length || ref.extSummary ? ref : null;
}

/** この本の参考データ（null＝無い）。3 秒で打ち切る・同じ本は覚える。 */
export async function loadBookRef(book, { rpc, timeoutMs = BOOK_REF_TIMEOUT_MS } = {}) {
  const term = refTerm(book?.title);
  if (!term) return null;
  const key = isbn13(book?.isbn) || `t:${term}`;
  if (cache.has(key)) return cache.get(key);
  const work = searchCatalog([term], { ...(rpc ? { rpc } : {}), limit: 10 }).then((list) => pickRef(list, book)).catch(() => null);
  const ref = await Promise.race([work, new Promise((r) => { setTimeout(() => r(undefined), timeoutMs); })]);
  if (ref === undefined) return null; // 間に合わなかった＝覚えない（次はまた聞く）
  cache.set(key, ref);
  return ref;
}

/** AI に渡す 1 つの塊（呼び出し側で sanitizeForPrompt をかける）。無ければ ''。 */
export function refForPrompt(ref) {
  if (!ref) return '';
  const lines = [];
  if (ref.difficulty) lines.push(`- 難しさ: ${DIFFICULTY_LABELS[ref.difficulty]}${ref.prereq ? `（前提: ${ref.prereq}）` : ''}`);
  else if (ref.prereq) lines.push(`- 前提知識: ${ref.prereq}`);
  if (ref.endorsers.length) lines.push(`- この本をすすめた人: ${ref.endorsers.length} 人`);
  if (ref.extSummary) lines.push(`- 書評サイトの要約（参考・言い回しを写さない）: ${ref.extSummary.replace(/\s+/g, ' ')}`);
  return lines.join('\n').slice(0, BOOK_REF_MAX_CHARS);
}

export function clearBookRefCache() { cache.clear(); }
