// 🧵 過去の相談の続き（2026-10-08 オーナー「過去の相談の続きをスムーズにすることができない」）。純粋な関数だけ。
//
//   相談（chat_messages）は 1 行ずつ（相談・答え）保存していて、「1 つの相談の会話」という置き場所が無い。
//   そこで答えの行の refs に目印 `🧵 <会話のはじめの相談の id>|<相談相手の本の id,…>` を残す（refs は画面用の
//   目印つきの行を入れる場所＝ほかの目印と同じ・新しい列や SQL は要らない）。
//   - 過去の相談の一覧は、同じ目印の答えを 1 つの相談（会話）にまとめる＝続きを相談しても一覧が二重にならない
//   - 「この続きを相談する」で、その会話を今の会話として並べ、相談相手もそのときの本に戻す
//   目印の無い前の答え（この仕組みより前）は、相談と答えの 1 組ずつのまま。

export const THREAD_REF_PREFIX = '🧵 ';
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 答えの行に残す目印。rootId が無ければ ''。 */
export function encodeThreadRef(rootId, scopeIds = []) {
  const root = String(rootId || '');
  if (!ID_RE.test(root)) return '';
  const scope = (Array.isArray(scopeIds) ? scopeIds : []).map(String).filter((id) => ID_RE.test(id)).slice(0, 20);
  return `${THREAD_REF_PREFIX}${root}${scope.length ? `|${scope.join(',')}` : ''}`;
}

/** refs から目印を読む → { rootId, scopeIds } か null。 */
export function decodeThreadRef(refs) {
  const hit = (Array.isArray(refs) ? refs : []).find((r) => String(r || '').startsWith(THREAD_REF_PREFIX));
  if (!hit) return null;
  const [root, scope = ''] = String(hit).slice(THREAD_REF_PREFIX.length).split('|');
  if (!ID_RE.test(root || '')) return null;
  return { rootId: root, scopeIds: scope.split(',').filter((id) => ID_RE.test(id)) };
}

export const isThreadRef = (r) => String(r || '').startsWith(THREAD_REF_PREFIX);

// 画面の上だけの一時的な行（書いている途中・失敗）。会話のはじめにはしない。
const TEMP_ID = /^(err|streaming|bg-wait|memo-)/;

/**
 * いまの会話のはじめの相談の id（次の答えの目印に使う）。
 * 会話の最初の保存済みの相談 → その答えに目印があればその rootId（続きを相談した会話は、元の会話のはじめ）。
 * 会話がまだ無ければ fallbackId（いま送った相談の id）。
 */
export function threadRootOf(messages, fallbackId = null) {
  const list = Array.isArray(messages) ? messages : [];
  const i = list.findIndex((m) => m && m.role === 'user' && !TEMP_ID.test(String(m.id || '')) && !m.local);
  if (i < 0) return fallbackId || null;
  const answer = list.slice(i + 1).find((m) => m && m.role === 'assistant');
  const mark = answer ? decodeThreadRef(answer.refs) : null;
  return mark?.rootId || list[i].id || fallbackId || null;
}

/**
 * 過去の相談の一覧の組み立て。messages（古い順）→ 相談（会話）ごとの配列（中は古い順）を、新しく話した相談から。
 * 相談と答えの 1 組の答えに目印があれば、目印の会話にまとめる（会話の位置は、いちばん新しいやりとりの位置）。
 * 画面の上だけのやりとり（メモが答える相談）は入れない（skip で渡す）。
 */
export function groupConsults(messages, { skip = () => false } = {}) {
  const pairs = [];
  (Array.isArray(messages) ? messages : []).forEach((m) => {
    if (!m || skip(m)) return;
    if (m.role === 'user' || pairs.length === 0) pairs.push([m]);
    else pairs[pairs.length - 1].push(m);
  });
  const byRoot = new Map();
  const order = [];
  pairs.forEach((p) => {
    const answer = p.find((m) => m.role === 'assistant');
    const mark = answer ? decodeThreadRef(answer.refs) : null;
    const root = mark?.rootId || p[0].id;
    if (!byRoot.has(root)) { byRoot.set(root, []); order.push(root); }
    byRoot.get(root).push(...p);
  });
  const last = (g) => g.reduce((a, m) => (String(m.createdAt || '') > a ? String(m.createdAt || '') : a), '');
  return order.map((r) => byRoot.get(r)).sort((a, b) => last(b).localeCompare(last(a)));
}

/** その会話の相談相手（いちばん新しい答えの目印から）。分からなければ []（すべての本）。 */
export function threadScopeOf(group) {
  const answers = (Array.isArray(group) ? group : []).filter((m) => m && m.role === 'assistant');
  for (let i = answers.length - 1; i >= 0; i -= 1) {
    const mark = decodeThreadRef(answers[i].refs);
    if (mark) return mark.scopeIds;
    if (Array.isArray(answers[i].scopeIds)) return answers[i].scopeIds;
  }
  return [];
}

/** 入力欄の上の 1 行に出す相談の題（はじめの相談・18 字まで）。 */
export function threadTitleOf(group, max = 18) {
  const first = (Array.isArray(group) ? group : []).find((m) => m && m.role === 'user');
  const t = String(first?.content || '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : t;
}
