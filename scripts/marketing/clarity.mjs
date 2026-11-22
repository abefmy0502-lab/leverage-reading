// 🧭 初めて Orime を知る人にも分かる動画の決まり（2026-11-22 オーナー「動画は初めてアプリのことを知る人でも内容がわかるように」）。
//
// どの動画も、この順で伝える（テストと声づくりの前に clarityProblems で確かめる）:
//   1. 困っていること（冒頭・Orime の名前から始めない）
//   2. Orime とは何か（どの動画も同じ一言＝DEFINITION を入れる）
//   3. 使い方（押す・書くを、ふつうの言葉で）
//   4. 「これからは、…」（どう変わるか）
//   5. 「無料プランで、今日から試せます」（いちばん最後の文）
// アプリの中でしか通じない言葉（JARGON）は使わない。使いたいときは、ふつうの言葉に言い換える。

export const DEFINITION = 'Orime は、読んだ本のメモから答えてくれる読書アプリ';

// 初めての人に通じない言葉 → 言い換えの例
export const JARGON = {
  行動リスト: '「行動」（明日やること）',
  根拠: 'どの本の、どのメモから',
  ロードマップ: '道のり',
  区切り: '〇か月ごと',
  相談相手: '（言わない）',
  トークン: '（言わない）',
  集中モード: '「読む」',
  お試し: '（言わない）',
  タブ: '（言わない）',
  チップ: '（言わない）',
  振り返り: '（言わない）',
  分野: '本のジャンル',
  フォルダ: '（言わない）',
  読書計画シート: '（言わない）',
  思い出しカード: '（言わない）',
  逆算: '目標から決める',
  背表紙: '（言わなくてよい）',
};

const MAX_LINE = 36; // 1 つの字幕（＝1 回の声）の長さ。長いと読み切れない

// lines: 冒頭の題から最後の文まで、出る順の文（字幕・声の文）
export function clarityProblems(lines, { checkLength = true } = {}) {
  const out = [];
  const flat = lines.map((l) => String(l || '').replace(/\n/g, '')).filter(Boolean);
  if (!flat.length) return ['文がありません'];
  if (/^(読書メモのアプリ\s*)?Orime/.test(flat[0])) out.push('最初の文は困っていることから（Orime の名前から始めない）');
  const defAt = flat.findIndex((l) => l.includes(DEFINITION) || l.replace(/、/g, '').includes(DEFINITION.replace(/、/g, '')));
  if (defAt < 0) out.push(`「${DEFINITION}」が無い（Orime とは何かを、どの動画も同じ一言で）`);
  else if (defAt > 3) out.push('Orime とは何かは、困っていることのすぐ後（4 つめの文まで）に');
  const nextAt = flat.findIndex((l) => l.startsWith('これからは'));
  if (nextAt < 0) out.push('「これからは、…」（どう変わるか）が無い');
  else if (defAt >= 0 && nextAt < defAt) out.push('「これからは」は使い方の後に');
  if (!/無料プランで、今日から試せます/.test(flat.at(-1))) out.push('いちばん最後の文は「無料プランで、今日から試せます」');
  for (const l of flat) {
    for (const w of Object.keys(JARGON)) if (l.includes(w)) out.push(`「${w}」は初めての人に通じない → ${JARGON[w]}（${l}）`);
    if (checkLength && l.length > MAX_LINE && l !== DEFINITION) out.push(`長い（${l.length} 字・${MAX_LINE} 字まで）: ${l}`);
  }
  return out;
}
