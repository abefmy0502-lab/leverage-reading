// 📗 読了の本の詳細の 2 つの小さな区画（2026-10-11 オーナーと約束・AI を使わない）。
//
// 1. 読了の 3 つの問い: 「いちばん効いた主張は？」「明日から何を変える？」「あえて反論するなら？」。
//    押すとメモを書くシートが開き、問いが入力欄の上に出る（本文は空・保存すると普通のメモ）。
//    メモにした問いは消える・区画ごと閉じられる・読了から 14 日を過ぎたら出さない。覚えるのは端末の中だけ
//    （orime.doneQuestions.v1:<本の id>＝{ answered: [key…], dismissed }）。
// 2. 読む前と読んだ後: 積読のときに書いた「得たいこと」「課題」「仮説」を並べ（メモは上のメモ一覧で読める）、
//    「答えは見つかった？」で、その本に相談する下書き「読む前に「…」と書いていました。答えは見つかった？」へ（送らない）。
//    読了から 14 日だけ（3 つの問いと同じ）。

export const DONE_QUESTIONS = [
  { key: 'claim', text: 'いちばん効いた主張は？' },
  { key: 'change', text: '明日から何を変える？' },
  { key: 'counter', text: 'あえて反論するなら？' },
];
export const DONE_QUESTIONS_DAYS = 14;
const LS_PREFIX = 'orime.doneQuestions.v1:';
const DAY_MS = 24 * 60 * 60 * 1000;

export function doneQuestionOf(key) {
  return DONE_QUESTIONS.find((q) => q.key === key) || null;
}

/** 端末に覚えた、この本の問いの状態（読めなければ空）。 */
export function readDoneQuestionState(bookId, storage = globalThis.localStorage) {
  const empty = { answered: [], dismissed: false };
  if (!bookId) return empty;
  try {
    const raw = storage?.getItem(LS_PREFIX + bookId);
    if (!raw) return empty;
    const v = JSON.parse(raw);
    return {
      answered: Array.isArray(v?.answered) ? v.answered.filter((k) => doneQuestionOf(k)) : [],
      dismissed: !!v?.dismissed,
    };
  } catch {
    return empty;
  }
}

function writeState(bookId, state, storage) {
  try { storage?.setItem(LS_PREFIX + bookId, JSON.stringify(state)); } catch { /* 書けない端末ではその場だけ */ }
}

/** 問いをメモにした（その問いを消す）。新しい状態を返す。 */
export function markDoneQuestionAnswered(bookId, key, storage = globalThis.localStorage) {
  const s = readDoneQuestionState(bookId, storage);
  const next = { ...s, answered: s.answered.includes(key) ? s.answered : [...s.answered, key] };
  if (bookId && doneQuestionOf(key)) writeState(bookId, next, storage);
  return next;
}

/** 区画ごと閉じた。新しい状態を返す。 */
export function dismissDoneQuestions(bookId, storage = globalThis.localStorage) {
  const next = { ...readDoneQuestionState(bookId, storage), dismissed: true };
  if (bookId) writeState(bookId, next, storage);
  return next;
}

// 読了日（'YYYY-MM-DD'）の 0 時（端末の時刻）。読めなければ NaN。
function localDayStart(ymd) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

/** 読了の本で、読了日から 14 日以内か（読了日の無い本は false）。3 つの問いと「読む前に書いたこと」で共通。 */
export function withinDoneDays(book, now = Date.now()) {
  if (!book || book.status !== 'done') return false;
  const start = localDayStart(book.doneDate ?? book.done_date);
  if (!Number.isFinite(start)) return false;
  const days = Math.floor((now - start) / DAY_MS);
  return days >= 0 && days <= DONE_QUESTIONS_DAYS;
}

/**
 * いま出す問い（読了の本・読了から 14 日以内・閉じていない・まだメモにしていない問い）。
 * 読了日が無い本は出さない（いつ読み終えたか分からない古い本に、急に問いを出さない）。
 */
export function visibleDoneQuestions(book, state, now = Date.now()) {
  if (!withinDoneDays(book, now)) return [];
  const s = state || { answered: [], dismissed: false };
  if (s.dismissed) return [];
  return DONE_QUESTIONS.filter((q) => !s.answered.includes(q.key));
}

// ---------------------------------------------------------------------------
// 読む前と読んだ後
// ---------------------------------------------------------------------------

const oneLine = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** 「読む前に書いたこと」に出す項目（読了から 14 日以内の本だけ・無ければ []）。 */
export function visibleBeforeItems(book, now = Date.now()) {
  return withinDoneDays(book, now) ? beforeReadingItems(book) : [];
}

/** 積読のときに書いたこと（得たいこと → 課題 → 仮説・空のものは出さない）。 */
export function beforeReadingItems(book) {
  if (!book) return [];
  return [
    { key: 'purpose', label: 'この本から得たいこと', text: oneLine(book.investPurpose ?? book.invest_purpose) },
    { key: 'challenge', label: '現在の課題', text: oneLine(book.currentChallenge ?? book.current_challenge) },
    { key: 'hypothesis', label: '仮説', text: oneLine(book.hypothesis) },
  ].filter((x) => x.text);
}

const clip = (t, max) => {
  const chars = [...oneLine(t)];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
};

/** 「答えは見つかった？」で相談の入力欄に入れる下書き（得たいこと → 課題 → 仮説 のうち最初のもの）。 */
export function foundAnswerDraft(book, { max = 40 } = {}) {
  const first = beforeReadingItems(book)[0];
  if (!first) return '';
  // 『』は書名の印（相談では本の名前として確かめる）なので使わない。中の「」は『』に（「」の中で閉じないように）
  const said = clip(first.text, max).replace(/「/g, '『').replace(/」/g, '』');
  return `読む前に「${said}」と書いていました。答えは見つかった？`;
}

/**
 * 問いから書いたメモの本文（頭に「問い：…」の 1 行を残す）。相談の材料で、自分の反論などを著者の主張と
 * 取り違えないため。全体が max 字を超えるときは本文の後ろを削る。
 */
export const PROMPT_PREFIX = '問い：';
export function promptedMemoText(prompt, body, max = Infinity) {
  const b = String(body ?? '');
  const q = oneLine(prompt);
  if (!q || !b.trim()) return b;
  const head = `${PROMPT_PREFIX}${q}\n`;
  const out = head + b;
  return out.length > max ? out.slice(0, max) : out;
}
