// ⚡ 画面が使う AI の指示文の決まった言葉だけを、重い指示文の本体（prompts.js）から分けた（2026-10-11）。
//   prompts.js は AI を呼ぶときに import() で読む（ai.js の loadPrompts）＝最初に読む JS を軽くする。
//   ここは画面（MarkdownSections・planChapters・bookBrief）が最初から使う小さな定数だけ。

// 読書計画シートで目次が無いときの決まった 1 行。
export const PLAN_NO_TOC_LINE = '目次が手に入らないため、章の名前は挙げていません。';
// 目次はあるが、AI が挙げた章がどれも目次と合わなかったとき（lib/planChapters.js が行を消したあとの決まった 1 行・2026-10-04）。
// 画面は PLAN_NO_TOC_LINE と同じく注記（13/--text-3）で見せる（MarkdownSections の renderPara）。
export const PLAN_NO_MATCH_LINE = '目次と合う章が見つからなかったため、章の名前は挙げていません。';
// この本で学べることの見出し（lib/bookBrief.js が読む）。
export const BRIEF_HEADINGS = { summary: '概要', learn: '学べること', savor: '味わえること', hypotheses: '仮説の例' };
