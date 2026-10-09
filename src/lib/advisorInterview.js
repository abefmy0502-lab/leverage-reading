// 🔍 AI 選書の聞き取り（2026-10-08 作り直し・オーナー「選択式だとレールが引かれている感じ・本音を引き出せる形に」）。
//
// 流れ: 相談を書く → AI が 1 回に 1 つだけ開いた問いを聞く（書き出しのきっかけの選択肢 2〜3 つ＋
//   いつも「どれも少し違う」「まだ言葉にできない」）→ 自分の言葉で答える（選択肢は押すと入力欄に入るだけ）
//   → 悩みの芯が見えたら（または「このくらいで探して」）「あなたの悩みを、こう受け取りました」を確かめる
//   → 「合っている」か「少し違う（直す）」→ 本を探す。
// ここは画面に依存しない小道具（AI の答えの解析・AI に渡す文の組み立て・深刻な言葉の見張り）。
// AI に渡す本人の言葉の sanitize（sanitizeForPrompt）は呼ぶ側（BookAdvisor）で済ませる。ここは長さだけを切る。
import { clamp } from './limits';

// 問いの数の上限（悩みの芯が見えたら AI が先に止める・原価を増やしすぎない）。
export const MAX_INTERVIEW_QUESTIONS = 4;

// いつも付ける逃げ道の 2 つ（AI には作らせない）。
export const OPT_OFF = 'どれも少し違う';
export const OPT_UNSURE = 'まだ言葉にできない';
// 「どれも少し違う」を押したときの入力欄の問い。
export const OFF_PLACEHOLDER = 'どこが違いますか？';
// AI に渡すときの印（答えの行に付ける・本人には見せない）。
const OFF_NOTE = '（選択肢はどれも違う、と自分の言葉で答えた）';
const UNSURE_ANSWER = '（まだ言葉にできない）';

// AI が選択肢に入れてしまった逃げ道・その他は捨てる（アプリが付けるので二重にしない）。
// 丸ごとその形のものだけ（「違う部署で」「その他の人が」のような書き出しは捨てない）。
const ESCAPE_OPTION = /^(どれも(少し)?(違う|ちがう)|(その他|そのほか)(（.*）)?|(よく)?(わからない|分からない|わかりません|分かりません)|まだ言葉にできない|言葉にできない|特にない|とくにない|なんとも言えない|何とも言えない)$/;
const OPTION_MAX = 24; // 8〜20 字を頼む。少しはみ出すのは許し、長すぎる文は捨てる。
const QUESTION_MAX = 120;
const SUMMARY_MAX = 300;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
// 節の区切り（空行）と取り違えないよう、本文の中の空行は 1 つの改行にする。
const oneBlock = (v) => str(v).replace(/\n\s*\n+/g, '\n');

// 選択肢を整える（文字列だけ・逃げ道を除く・末尾の「。」を落とす・重複なし・最大 3 つ）。
export function cleanOptions(list) {
  const out = [];
  for (const o of Array.isArray(list) ? list : []) {
    const s = str(o).replace(/[。．、,，\s]+$/u, '');
    if (!s || s.length > OPTION_MAX || ESCAPE_OPTION.test(s)) continue;
    if (out.includes(s)) continue;
    out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

// AI の答え（JSON）を解く。前後に余計な文字があっても最初の { 〜 最後の } を読む。
//   返り値: { done, question, options, summary } | null（読めない）。
//   以前の形（{ done, questions: [{ q, options }] }）も読む（1 問目だけを使う）。
export function parseInterviewStep(text) {
  if (typeof text !== 'string') return null;
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  let obj;
  try { obj = JSON.parse(text.slice(s, e + 1)); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  let question = str(obj.question);
  let options = obj.options;
  if (!question && Array.isArray(obj.questions) && obj.questions[0]) {
    question = str(obj.questions[0].q);
    options = obj.questions[0].options;
  }
  const summary = clamp(str(obj.summary), SUMMARY_MAX);
  const done = obj.done === true || !question;
  if (done) return { done: true, question: '', options: [], summary };
  return { done: false, question: clamp(question, QUESTION_MAX), options: cleanOptions(options), summary };
}

// 入力欄の上に並べるチップ（AI の書き出し＋いつもの逃げ道 2 つ）。kind: 'start' | 'off' | 'unsure'。
export function interviewChips(step) {
  const starts = cleanOptions(step?.options).map((label) => ({ kind: 'start', label }));
  return [...starts, { kind: 'off', label: OPT_OFF }, { kind: 'unsure', label: OPT_UNSURE }];
}

// 答えの候補を入力欄に入れる形（2026-10-09 オーナー「が、のあとはあるかなししかなく、続きを書く意味がない」）:
//   候補は言い切った短い答え。押すとそのまま入る（そのまま送っても、直しても、書き足してもよい）。
export function starterText(label) {
  return str(label);
}

// 書き出しのチップを押したときの入力欄の中身（カーソルは末尾に置く＝呼ぶ側）。
//   空か、前に押したチップの言葉だけなら入れ替え、本人が書いた文があれば消さずに後ろへ足す（押しても書いたものは消えない）。
export function applyStarter(current, label, chipLabels = []) {
  const cur = String(current || '');
  const t = cur.trim();
  const next = starterText(label);
  const isChip = (x) => chipLabels.some((l) => x === str(l) || x === starterText(l));
  if (!t || isChip(t)) return next;
  if (cur.includes(str(label))) return cur;
  return `${cur.replace(/\s+$/u, '')}${/[、。,.!?！？…]$/u.test(t) ? '' : '、'}${next}`;
}

// 答えが書き出しのチップから始まっていれば、その書き出し（チップの言葉）を返す。無ければ ''。
export function starterOf(answer, labels = []) {
  const a = str(answer);
  if (!a) return '';
  let hit = '';
  for (const l of Array.isArray(labels) ? labels : []) {
    const lab = str(l);
    if (!lab) continue;
    if ((a.startsWith(starterText(lab)) || a.startsWith(lab)) && lab.length > hit.length) hit = lab;
  }
  return hit;
}

// 本人が書き足した言葉（書き出しを除いた残り・頭の読点は落とす）。書き出しが無ければ答えのまま。
export function ownWords(answer, starter = '') {
  const a = str(answer);
  const st = str(starter);
  if (!st) return a;
  const rest = a.startsWith(starterText(st)) ? a.slice(starterText(st).length) : a.startsWith(st) ? a.slice(st.length) : a;
  return rest.replace(/^[、,，\s]+/u, '').trim();
}

// 候補の言葉だけ（何も書き足していない）か。送るのは止めない（2026-10-09）。AI に渡す印を変えるのに使う。
export function onlyStarter(answer, labels = []) {
  const a = str(answer);
  if (!a) return false;
  return (Array.isArray(labels) ? labels : []).some((l) => a === str(l) || a === starterText(l));
}

// AI に渡す「これまでの問いと答え」。answers: [{ q, a, off?, unsure? }]（a は sanitize 済み）。
export function buildPriorQA(answers) {
  return (Array.isArray(answers) ? answers : [])
    .map((x) => {
      const q = clamp(str(x?.q), QUESTION_MAX);
      if (x?.unsure) return `Q. ${q}\nA. ${UNSURE_ANSWER}`;
      const a = clamp(oneBlock(x?.a), 400);
      if (!a) return '';
      // 候補を使った答えは、その印を付ける（AI が「本人の言葉」として引くのは本人が書いた部分だけ）。
      const st = clamp(str(x?.starter), 40);
      const starterNote = !st ? ''
        : a === st ? `\n（候補「${st}」をそのまま選んだ。本人の言葉としては引かない）`
        : `\n（候補「${st}」に本人が書き足した。引くのは、書き足した部分）`;
      return `Q. ${q}\nA. ${a}${starterNote}${x?.off ? `\n${OFF_NOTE}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');
}

// 本人が言葉で答えたものだけ（「まだ言葉にできない」は除く）。表示・読書準備・推薦に使う。
export function spokenAnswers(answers) {
  return (Array.isArray(answers) ? answers : []).filter((x) => x && !x.unsure && str(x.a));
}

// 推薦を頼む文（保存もこの形・lib/advisorText.js が本人の言葉だけを取り出す）。
//   受け取ったまとめと本人の直しがあれば節として足し、直しを最優先にするよう頼む。
export function buildRecoMessage({ concern, answers, summary = '', correction = '' }) {
  const lines = buildPriorQA(spokenAnswers(answers));
  const sum = clamp(oneBlock(summary), SUMMARY_MAX);
  const fix = clamp(oneBlock(correction), 400);
  return (
    `【相談内容】\n${oneBlock(concern)}\n\n【ヒアリングの回答】\n${lines || '（なし）'}\n\n` +
    (sum ? `【受け取った悩み】\n${sum}\n\n` : '') +
    (fix ? `【本人の直し（最優先）】\n${fix}\n\n` : '') +
    `以上で聞き取りは十分です。これ以上質問せず、本人の言葉${fix ? '（直しを最優先）' : ''}を踏まえて、` +
    `その人に本当に効く実在の本を推薦してください。「なぜあなたに」は本人が書いた言葉を「」で引いて結びつけてください。`
  );
}

// 🫶 命に関わる深刻な言葉（本人の文に出たときだけ、相談窓口を静かに示す 1 行を出す・AI は使わない）。
const CARE_WORDS = /死にたい|しにたい|消えたい|きえたい|自殺|自死|いなくなりたい|生きているのがつらい|生きてるのがつらい|生きるのがつらい|生きる意味がない|生きていたくない|リストカット/;
export const CARE_LINE = 'つらい気持ちが強いときは、ひとりで抱えず、身近な人や、こころの相談窓口にも話してみてください。';
// 厚生労働省の相談窓口の案内（電話・SNS の窓口の一覧）。外部リンクで開く。
// org（「（厚生労働省）」）は折り返しで割らない（画面で 1 まとまりにする）。
export const CARE_LINK = { name: 'まもろうよ こころ', org: '（厚生労働省）', label: 'まもろうよ こころ（厚生労働省）', url: 'https://www.mhlw.go.jp/mamorouyokokoro/' };
export function needsCareLine(texts) {
  return (Array.isArray(texts) ? texts : [texts]).some((t) => CARE_WORDS.test(String(t || '')));
}
