// AI 選書の「たとえば」（BookAdvisor と、相談のメモ 0 件の「次に読む 1 冊を探す」で共有・2026-11-27 に BookAdvisor.jsx から移した）。
// 本を探す形の例（相談＝読んだ本のメモから答える と見分けがつくように・2026-10-09 オーナー「入口をはっきり分ける」）。
export const ADVISOR_EXAMPLES = [
  '人前で話すのが苦手。おすすめの本は？',
  '仕事を抱えすぎて、いつも時間が足りない。読むならどの本？',
  'お金の不安を減らしたい。最初に読む 1 冊は？',
];
// まだ読み終えた本が無い人には、読む習慣をつける例を先に（仕事の悩みと読んだ本を前提にしない・2026-11-27 模擬 6 回目
//   「読書習慣の無い人の入口が、仕事の悩みばかり」）。数は 3 つのまま。
export const ADVISOR_EXAMPLES_NEW_READER = [
  '本を読む習慣をつけたい。薄くて読みやすい 1 冊は？',
  '人前で話すのが苦手。おすすめの本は？',
  '仕事を抱えすぎて、いつも時間が足りない。読むならどの本？',
];
export function advisorExamplesFor(books) {
  const doneCount = (Array.isArray(books) ? books : []).filter((b) => b && b.status === 'done' && !b.archivedAt).length;
  return doneCount === 0 ? ADVISOR_EXAMPLES_NEW_READER : ADVISOR_EXAMPLES;
}
