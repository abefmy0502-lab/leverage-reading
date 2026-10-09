// 🔍 AI 選書の「保存された相談文」から、本人の言葉だけを取り出す小道具。
//
// 推薦を頼むときの相談文は、AI 向けに組み立てたテンプレート:
//   【相談内容】\n<相談>\n\n【ヒアリングの回答】\nQ. …\nA. …\n\n以上で…推薦してください。
// 履歴の表示や、本を「読みたい」に追加したときの読書準備（得たいこと・課題）には、
// この中の本人の言葉だけを使う（AI への指示文を本の欄に入れない）。
import { clamp } from './limits';

const TEMPLATE = /^【相談内容】\n([\s\S]*?)\n\n【ヒアリングの回答】\n([\s\S]*?)\n\n/;

// 相談の本文（テンプレートでなければそのまま）
export function concernOf(raw) {
  const s = String(raw || '');
  const m = s.match(TEMPLATE);
  return (m ? m[1] : s).trim();
}

// ヒアリングの Q/A（テンプレートでなければ空）
export function interviewPairsOf(raw) {
  const m = String(raw || '').match(TEMPLATE);
  if (!m) return [];
  const pairs = [];
  let q = '';
  for (const line of m[2].split('\n')) {
    if (line.startsWith('Q. ')) q = line.slice(3).trim();
    else if (line.startsWith('A. ')) {
      const a = line.slice(3).trim();
      if (a) pairs.push({ q, a });
    }
  }
  return pairs;
}

// 確かめた悩み（2026-10-08）: AI が受け取ったまとめ（summary）と、本人の直し（correction）。無ければ空。
//   推薦を頼む文の【受け取った悩み】【本人の直し（最優先）】の節（lib/advisorInterview.js の buildRecoMessage）。
function sectionOf(s, name) {
  const head = `【${name}】\n`;
  const i = s.indexOf(head);
  if (i < 0) return '';
  const rest = s.slice(i + head.length);
  const end = rest.indexOf('\n\n');
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}
export function confirmedOf(raw) {
  const s = String(raw || '');
  if (!TEMPLATE.test(s)) return { summary: '', correction: '' };
  return { summary: sectionOf(s, '受け取った悩み'), correction: sectionOf(s, '本人の直し（最優先）') };
}

// 表示用: 相談＋回答（「・」の箇条書き）。受け取った悩みと本人の直しは入れない
//   （過去の AI 選書では会話中と同じく、小見出し「受け取った悩み」と直しの吹き出しを別に出す＝confirmedOf・2026-10-08）。
export function displayUserText(raw) {
  const s = String(raw || '');
  if (!TEMPLATE.test(s)) return s;
  const answers = interviewPairsOf(s).map((p) => p.a);
  const c = concernOf(s);
  return answers.length ? `${c}\n${answers.map((a) => `・${a}`).join('\n')}` : c;
}

// 🧭 本を「読みたい」に追加したときの読書準備（AI を使わない・2026-09-29 に対応を正した）。
//   現在の課題      ＝ 最初の相談 ＋ ヒアリングの 1 問目（いまのつまずき）
//   この本から得たいこと ＝ ヒアリングの「理想の状態」の答え（問いの言葉で探し、無ければ 2 問目）
//   以前は相談そのものを「得たいこと」に、答えを全部つなげて「課題」に入れていた（困りごとが得たいことに入る）。
//   ヒアリングが無かったとき（相談だけで推薦した）は、得たいことは空のまま（本人に書いてもらう）。
//   2026-10-08: 悩みを確かめた（confirmed＝{ summary, correction }）ときは、現在の課題＝本人の直し＋受け取ったまとめ
//   （直しが先＝本人の言葉を優先）。「まだ言葉にできない」と答えた問い（unsure）は答えに数えない。
const IDEAL_Q = /理想|なりたい|得たい|目指|ゴール|どうなれ|どうなって/;
export function advisorSetupFields(concern, answers, confirmed = null) {
  const c = String(concern || '').trim();
  const list = (Array.isArray(answers) ? answers : [])
    .filter((x) => !x?.unsure)
    .map((x) => ({ q: String(x?.q || '').trim(), a: String(x?.a || '').trim() }))
    .filter((x) => x.a);
  let idealIdx = list.findIndex((x) => IDEAL_Q.test(x.q));
  if (idealIdx < 0 && list.length >= 2) idealIdx = 1;
  const first = list[0] && idealIdx !== 0 ? list[0].a : '';
  const told = [String(confirmed?.correction || '').trim(), String(confirmed?.summary || '').trim()].filter(Boolean);
  return {
    challenge: told.length ? told.join('\n') : [c, first].filter(Boolean).join('／'),
    purpose: idealIdx >= 0 ? list[idealIdx].a : '',
  };
}

// 📋 「読みたいに追加」で本へ渡す読書準備（会話中のおすすめ・確認の「書名で探す」「手動で入力する」・
//   過去の AI 選書の中身で同じ中身・2026-10-04 に共通化。以前は過去の AI 選書だけ仮説に推薦の核心を入れ、
//   選書理由に核心を足していなかった）。
//   得たいこと＝理想の状態の答え（sourceQuery も同じ＝「AI 選書で入力した内容に戻す」の元）／課題＝相談＋1 問目／
//   仮説は空（推薦の核心は AI の言葉で、本人の仮説ではない＝読む前に自分で書く欄）／
//   選書理由＝推薦の「なぜ」＋改行＋「この本の核心: …」。answers は呼ぶ側で sanitize 済みの { q, a }。
//   confirmed＝確かめた悩み（{ summary, correction }・2026-10-08）。課題はこれを優先する。
export function advisorSetupPayload(concern, answers, rec, confirmed = null) {
  const setup = advisorSetupFields(concern, answers, confirmed);
  return {
    sourceQuery: clamp(setup.purpose, 400),
    investPurpose: clamp(setup.purpose, 400),
    currentChallenge: clamp(setup.challenge, 400),
    hypothesis: '',
    bookReason: clamp([String(rec?.why || '').trim(), rec?.core ? `この本の核心: ${String(rec.core).trim()}` : ''].filter(Boolean).join('\n'), 400),
  };
}
