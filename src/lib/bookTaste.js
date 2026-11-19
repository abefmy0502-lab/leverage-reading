// 📚 AI 選書の「本の選び方」（2026-11-19 オーナー「選書の際に名著、新刊、おすすめなどを選択できるのもいいかも」）。
//   おまかせ（悩みに合う本を、長く読まれている本も新しい本も混ぜて）／名著／新しい本／いま話題。
//   候補（lib/advisorCandidates.js）の並びを、この選び方に合う本が先になるように並べ替え、推薦の AI にも 1 段で渡す。
//   候補を減らしはしない（合う本が少ないときに、悩みに合わない本を無理に出さない）。
//   手がかりは推薦用の本のデータの事実だけ（出版年・売れ方＝trend・賞と年間ベストの印＝marks・書評の推薦）。

export const TASTE_PREFS = ['auto', 'classic', 'new', 'trend'];
export const TASTE_LABELS = { auto: 'おまかせ', classic: '名著', new: '新しい本', trend: 'いま話題' };

// 確かめのカードの案内の 1 行（390 幅で 1 行に収まる長さ）
//   難しさの案内と同じ「…を中心に探します」（「先に」は時間の順に読めた・2026-11-19 ui-critic）
const TASTE_NOTES = {
  auto: '出た時期を問わず、悩みに合う本を探します',
  classic: '長く読まれ、評価の定まった本を中心に探します',
  new: '去年と今年に出た本を中心に探します',
  trend: 'いま書店でよく売れている本を中心に探します',
};
// おすすめの上の 1 行（何で選んだか）
const TASTE_RESULTS = { classic: '名著を中心に探しました', new: '新しい本を中心に探しました', trend: 'いま話題の本を中心に探しました' };
export function tasteResultLine(pref) {
  return TASTE_RESULTS[pref] || '';
}
export function tasteNote(pref) {
  return TASTE_NOTES[TASTE_PREFS.includes(pref) ? pref : 'auto'];
}

const year = (c) => {
  const y = Number(String(c?.pubYear || '').slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : 0;
};

/** その本が選び方にどれだけ合うか（0＝手がかりなし）。nowYear は今年。 */
export function tasteScore(c, pref, nowYear) {
  if (!c || pref === 'auto' || !TASTE_PREFS.includes(pref)) return 0;
  const y = year(c);
  const marks = Array.isArray(c.marks) ? c.marks.length : 0;
  const rec = Number(c.recPoints) > 0 ? 1 : 0;
  if (pref === 'classic') {
    // 賞・年間ベストの印、出て 3 年以上たっても売れている、出て 5 年以上、書評の推薦
    let s = Math.min(marks, 2) * 2;
    if (c.trend === 'steady') s += 3;
    if (y && nowYear - y >= 5) s += 2;
    else if (y && nowYear - y >= 3) s += 1;
    return s + rec;
  }
  if (pref === 'new') {
    // 出て 1 年ほど（今年と去年）・出て 1 年以内で売れている
    let s = 0;
    if (y && nowYear - y <= 1) s += 3;
    else if (y && nowYear - y === 2) s += 1;
    if (c.trend === 'new') s += 2;
    return s;
  }
  // trend: いま分野の売上上位（売れ方の印があればどちらでも）・年間ベストの印も少し
  let s = c.trend ? 3 : 0;
  if (s && y && nowYear - y <= 1) s += 1;
  return s + Math.min(marks, 1);
}

/** 選び方に合う本が先になるように並べ替える（同じ点なら前の順のまま・本は減らさない）。 */
export function rankByTaste(cands, pref, nowYear = new Date().getFullYear()) {
  const list = Array.isArray(cands) ? cands : [];
  if (pref === 'auto' || !TASTE_PREFS.includes(pref)) return list;
  return list
    .map((c, i) => ({ c, i, s: tasteScore(c, pref, nowYear) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

/** 推薦の AI に渡す 1 段（おまかせは空）。 */
export function tasteBlock(pref, nowYear = new Date().getFullYear()) {
  if (pref === 'classic') {
    return '【本の選び方】本人は「名著」を選んだ。長く読まれ、評価の定まった本を中心に選ぶ。手がかりは候補の受賞・売れ方（出て 3 年以上たっても売上上位）・出版年・書評の推薦。合う本が少なければ、悩みに合うことを優先し、前置きでそのことを一言だけ書く。';
  }
  if (pref === 'new') {
    return `【本の選び方】本人は「新しい本」を選んだ。出て 1 年ほど（${nowYear - 1} 年以降）の本を中心に選ぶ。手がかりは候補の出版年と売れ方。合う本が少なければ、悩みに合うことを優先し、前置きでそのことを一言だけ書く。出版年が分からない本を新しいと言わない。`;
  }
  if (pref === 'trend') {
    return '【本の選び方】本人は「いま話題」を選んだ。いま書店でよく売れている本（候補の売れ方が分野の売上上位）を中心に選ぶ。売れ方の印が無い本を「話題」と言わない。合う本が少なければ、悩みに合うことを優先し、前置きでそのことを一言だけ書く。';
  }
  return '';
}
