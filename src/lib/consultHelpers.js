// 💬 相談の小さな決まりごと（AI を使わない・画面の文を組み立てるだけ）。
//
// - buildConsultExamples: 相談例（ホームの相談カード・相談の空の画面で共通）。
//     1. 前の相談の続き（「前に相談した「…」、その後どう進める？」）
//     2. 本の「現在の課題」（読書準備でユーザーが書いた言葉＝いちばん本人の悩みに近い）
//     3. メモのある本から（『書名』の学びで、明日から使えるものは？）
//     4. よくある困りごと（LP の「試しに、相談してみる」と同じ形）
//   「「タグ」で迷ったとき、私のメモからヒントをください」の型は不自然なので 2026-09-29 にやめた。
// - standaloneAction: 答えの一歩を行動リストに入れるとき、あとで一覧で読んでも分かる文にする
//     （「この件」「それ」で始まる一歩には、相談の要約を頭に付ける）。
//
// ⚠️ src では正規表現の後読み（lookbehind）を使わない。

// よくある困りごと（相談の形・LP の ConsultDemo と同じ言い方）
export const WORRY_EXAMPLES = [
  '部下が報告をくれなくて困っています',
  '会議で話がまとまりません',
  '仕事を抱えすぎて手が回りません',
];

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// 相談の文の要約（最初の 1 文・末尾の句読点を外して n 文字まで）。
export function questionGist(question, n = 20) {
  const first = oneLine(question).split(/[。？?！!\n]/).map((x) => x.trim()).find(Boolean) || '';
  const t = first.replace(/[、，,\s]+$/, '');
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// 本の「現在の課題」を相談の形に（「〜。どう考えればいい？」）。
function challengeQuestion(challenge) {
  const t = oneLine(challenge).replace(/[。．.]+$/, '');
  if (!t) return '';
  const clipped = t.length > 40 ? `${t.slice(0, 39)}…` : t;
  if (/[？?]$/.test(clipped)) return clipped;
  return `${clipped}。どう考えればいい？`;
}

// books: アプリの本（camelCase の currentChallenge / status / title / updatedAt）
// memoBookIds: メモのある本の id（Set・null＝まだ分からない）
// lastConsult: { question } 前の相談（無ければ null）
// 返り値: [{ text, kind: 'continue' | 'challenge' | 'book' | 'worry' }]
export function buildConsultExamples({ books = [], memoBookIds = null, lastConsult = null, count = 3 } = {}) {
  const out = [];
  const push = (text, kind) => {
    if (text && !out.some((e) => e.text === text) && out.length < count) out.push({ text, kind });
  };
  const gist = lastConsult?.question ? questionGist(lastConsult.question, 18) : '';
  if (gist) push(`前に相談した「${gist}」、その後どう進める？`, 'continue');

  const list = Array.isArray(books) ? books : [];
  const withChallenge = list
    .filter((b) => oneLine(b.currentChallenge))
    .sort((a, b) => String(b.updatedAt || b.updated_at || '').localeCompare(String(a.updatedAt || a.updated_at || '')));
  if (withChallenge[0]) push(challengeQuestion(withChallenge[0].currentChallenge), 'challenge');

  const hasMemo = (b) => memoBookIds == null || memoBookIds.has(b.id);
  const recent = list.find((b) => b.status === 'reading' && hasMemo(b))
    || list.find((b) => b.status === 'done' && hasMemo(b))
    || (memoBookIds ? list.find((b) => memoBookIds.has(b.id)) : null);
  if (recent?.title) push(`『${recent.title}』の学びで、明日から使えるものは？`, 'book');

  WORRY_EXAMPLES.forEach((w) => push(w, 'worry'));
  return out;
}

// 「この件」「それ」などで始まる（または中で指す）一歩は、あとで行動の一覧だけを見ても分からない。
const DEMONSTRATIVE_START = /^(この|その|あの|これ|それ|あれ)/;
const VAGUE_REF = /(この件|その件|この問題|その問題|この悩み|その悩み|この状況|その状況|このこと|そのこと|それについて|これについて)/;

export function needsSubject(action) {
  const t = oneLine(action);
  return !!t && (DEMONSTRATIVE_START.test(t) || VAGUE_REF.test(t));
}

// 行動リストに入れる文。単独で分かる文ならそのまま、そうでなければ「〈相談の要約〉：」を頭に付ける。
export function standaloneAction(action, question, max = 500) {
  const t = oneLine(action);
  if (!t || !needsSubject(t)) return t.slice(0, max);
  const gist = questionGist(question, 20);
  if (!gist) return t.slice(0, max);
  return `${gist}：${t}`.slice(0, max);
}
