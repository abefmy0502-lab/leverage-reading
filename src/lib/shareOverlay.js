// 📷 写真で共有（Strava のように、撮った写真の上に読書の記録と一文を重ねる）の「決めごと」。
//
// canvas も DOM も触らない純粋関数だけ（テストで確かめられるように）。描くのは shareCard.js。
//   - pickShareSubject   … ホームから開いたときに、どの本（または「今月」）を最初に選んでおくか
//   - subjectChoices     … シートの「どの本？」の並び（今月 → 読書中 → 最近読み終えた本）
//   - bookRecord         … 本 1 冊の記録（メモの件数・実行した行動。日付は既定で出さない小さな添え書き・2026-10-09）
//   - monthRecord        … 今月の記録（読了の冊数・メモ・実行した行動）
//   - yearRecord / orderYearQuoteCandidates / isYearWrapSeason / hasFinishedThisYear
//                        … 今年の読書（12 月だけ・冊数・メモ・行動・いちばん残した一文・2026-10-08）
//   - shareHashtags      … 共有の文に添えるハッシュタグ（#10月読了本・#2026年の読書。画像には入れない）
//   - orderQuoteCandidates / swapQuote / swapQuoteLabel … 重ねる一文（新しい順・1 タップで次へ）
//   - splitStatValue     … 「9月28日」の数字を大きく、単位を小さく描くための分け方
//   - recordFrame / placeRecordBlock / recordBlockPlan … 4:5・9:16 の、SNS で切られない範囲（安全な枠）と置き方・組み
//   - statsStackPlan / placeStatsStack … 「数字」の重ね方（Strava の大きな数字を真ん中に縦に積む・2026-10-05）
//   - logoBox / LOGO_RULES … Orime のロゴの場所・大きさ・空き（ロゴは必ず入る・2026-10-05）
//   - shareItemsFor / applyShareItems / readHiddenItems … 表示する項目（出す・隠す・前の選択を覚える。ロゴは項目に無い）
//   - readSharePrefs / writeSharePrefs / stepVariant … 選んだ重ね方・形を端末に覚える・左右のスワイプで次の重ね方へ
//   - buildRecordShareText … 共有の文（画像に入れたものだけ）
//
// 入れるのは、画面で本人が見ている情報だけ（書名・著者・日付・件数・一文）。名前・メール・タグは入れない。
// 連続日数・目標・順位・バッジは入れない（反ゲーミフィケーション）。

import { clampLine, FORMATS } from './shareCardLayout';
import { isAiWritten } from './recall';

// 「記録」に重ねる一文は短く（写真を見せたいので 3 行まで）。
export const RECORD_QUOTE_MAX = 60;
// 重ね方（見せ方）は 4 つ（2026-10-05）: 記録（書名と数字の横並び・Strava の記録の形）／数字（大きな数字を真ん中に
// 縦に積む・Strava の共有の定番の形）／一文（メモの一文が主役）／雑誌（2026-10-09・左上に大きな引用＋続きの小さな文・
// 右に本のカード・右上にロゴ・下に小さな日付＝雑誌の 1 ページのような組み。本 1 冊でメモがあるときだけ）。
// 左右のスワイプでこの順に切り替わる。
export const VARIANTS = ['record', 'stats', 'quote', 'magazine'];
// 形は 2 つ: 投稿 4:5 ／ ストーリー 9:16（正方形は選ばせない）。
export const SHARE_FORMATS = ['post', 'story'];

// ---------------------------------------------------------------- 日付

// 'YYYY-MM-DD' は端末の日付として読む（UTC で 1 日ずれない）。ISO はそのまま。
export function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 「9月28日」（今年でなければ「2025年9月28日」）。
export function fmtMonthDay(value, now = new Date()) {
  const d = parseLocalDate(value);
  if (!d) return '';
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}年${md}`;
}

// 数字の行の日付「9.28」（今年でなければ「2025.9.28」）。画像の日付は右下の「2026.10.9」と同じ点の書き方にそろえる
// （「9月28日」と「2026.10.5」が 1 枚に混ざっていた・2026-10-08 オーナー「おしゃれな感じに」）。
export function fmtDotDate(value, now = new Date()) {
  const d = parseLocalDate(value);
  if (!d) return '';
  const md = `${d.getMonth() + 1}.${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}.${md}`;
}

// 画像の右下の日付「2026.9.30」。
export function fmtStamp(now = new Date()) {
  return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
}

const sameMonth = (d, now) => !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
const sameYear = (d, now) => !!d && d.getFullYear() === now.getFullYear();
const timeOf = (v) => {
  const d = parseLocalDate(v);
  return d ? d.getTime() : 0;
};

// ---------------------------------------------------------------- どの本？

const isShareable = (b) => !!b && (b.status === 'reading' || b.status === 'done') && String(b.title || '').trim();
// 最近さわった順（読書中は読み始め・更新、読了は読了日・更新の新しいほう）。
const recency = (b) => Math.max(timeOf(b.updatedAt || b.updated_at), timeOf(b.doneDate), timeOf(b.startDate), timeOf(b.createdAt || b.created_at));

// ホームのカメラから開いたときに最初に選ぶもの:
//   いま読んでいる本（最近さわった順の先頭）→ 無ければ最近読み終えた（さわった）本 → 本が無ければ「今月」。
// 戻り値: { kind: 'book', bookId } | { kind: 'month' }
export function pickShareSubject(books) {
  const list = (Array.isArray(books) ? books : []).filter(isShareable);
  const reading = list.filter((b) => b.status === 'reading').sort((a, b) => recency(b) - recency(a));
  if (reading.length) return { kind: 'book', bookId: reading[0].id };
  const done = list.filter((b) => b.status === 'done').sort((a, b) => recency(b) - recency(a));
  if (done.length) return { kind: 'book', bookId: done[0].id };
  return { kind: 'month' };
}

// 今月に読み終えた本があるか（振り返り › 記録から「写真で共有」を押したとき、「今月」を選んでおくかどうか・2026-10-01）。
// 読了が 0 冊の「今月」の 1 枚は中身が薄いので、そのときは pickShareSubject（いま読んでいる本）に任せる。
export function hasFinishedThisMonth(books, now = new Date()) {
  return (Array.isArray(books) ? books : [])
    .some((b) => b && b.status === 'done' && sameMonth(parseLocalDate(b.doneDate), now));
}

// シートの「どの本？」の並び: 今月 →（12 月だけ）今年 → 読書中（新しい順）→ 読了（新しい順）。多すぎると選べないので max 冊まで。
// 選んでいる本が範囲の外なら、今月の次に入れて見えるようにする。
// includeYear … 「今年」を出すか（12 月で、今年に読み終えた本が 1 冊以上＝yearChoiceAllowed）。
export function subjectChoices(books, { selectedId = null, max = 8, includeYear = false } = {}) {
  const list = (Array.isArray(books) ? books : []).filter(isShareable);
  const reading = list.filter((b) => b.status === 'reading').sort((a, b) => recency(b) - recency(a));
  const done = list.filter((b) => b.status === 'done').sort((a, b) => recency(b) - recency(a));
  let picked = [...reading, ...done].slice(0, max);
  if (selectedId && !picked.some((b) => b.id === selectedId)) {
    const sel = list.find((b) => b.id === selectedId);
    if (sel) picked = [sel, ...picked.slice(0, max - 1)];
  }
  return [{ kind: 'month' }, ...(includeYear ? [{ kind: 'year' }] : []), ...picked.map((b) => ({ kind: 'book', bookId: b.id, book: b }))];
}

// ---------------------------------------------------------------- 今年の読書（12 月だけ・2026-10-08）
//
// Spotify Wrapped と同じ時期に、1 年を 1 枚で見せる（company/marketing-strategy-2026-11.md §6-3）。
// 出すのは 12 月（端末の日付の 12/1〜12/31）だけ・今年に読み終えた本が 1 冊以上あるときだけ。
// 入れるのは 冊数・メモの数・実行した行動の数・読み終えた本の表紙・いちばん残した一文。
// 連続日数・順位・目標・バッジは入れない（反ゲーミフィケーション）。

export function isYearWrapSeason(now = new Date()) {
  return now.getMonth() === 11;
}

export function hasFinishedThisYear(books, now = new Date()) {
  return (Array.isArray(books) ? books : [])
    .some((b) => b && b.status === 'done' && sameYear(parseLocalDate(b.doneDate), now));
}

// 「今年」を選べるか（12 月・今年の読了 1 冊以上）。
export function yearChoiceAllowed(books, now = new Date()) {
  return isYearWrapSeason(now) && hasFinishedThisYear(books, now);
}

// ---------------------------------------------------------------- 記録（数字）

const hasText = (m) => !!m && String(m.text || '').trim().length > 0;
const hasSummary = (b) => typeof (b?.leverageMemo ?? b?.leverage_memo) === 'string' && (b.leverageMemo ?? b.leverage_memo).trim().length > 0;

// 著者の書き方（2026-10-08 オーナー「著者の名前が長い、複数いるとキレてしまう」）。
// 複数なら「最初の著者 ほか」。区切りは 、, / ／ & ＆ と、漢字だけの名前どうしの「・」（「岸見一郎・古賀史健」）。
// カタカナの名前の中の「・」（「エリック・シュミット」「D・カーネギー」）では切らない。「（著）」などの役割は外す。
const ROLE_RE = /[（(][^）)]*[）)]\s*$/u;
const KANJI_NAME = /^[\p{Script=Han}々〆ヶ\s]+$/u;
export function splitAuthors(author) {
  const raw = String(author || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const parts = raw.split(/\s*(?:[、,，/／&＆]|\s+and\s+)\s*/u).map((a) => a.replace(ROLE_RE, '').trim()).filter(Boolean);
  const out = [];
  for (const a of parts) {
    const dots = a.split('・').map((x) => x.trim()).filter(Boolean);
    if (dots.length > 1 && dots.every((x) => KANJI_NAME.test(x))) out.push(...dots);
    else out.push(a);
  }
  return out;
}
export function formatAuthors(author) {
  const list = splitAuthors(author);
  if (!list.length) return '';
  return list.length > 1 ? `${list[0]} ほか` : list[0];
}

// 本 1 冊の記録。stats は意味のある数だけ（メモの件数・実行した行動・0 は出さない）。
// 日付は数字にしない（2026-10-09 オーナー「そもそもなんで読み始めの日付を目立たせる？」）: 読了日・読みはじめの日は
// date に分けて持ち、出すときも見出しの小さな添え書き（「読了 · 9.28」）だけ。既定は出さない（SHARE_ITEMS_DEFAULT_OFF）。
// 戻り値: { kicker, title, sub, stats: [{ key, label, value }], date: { label, text } | null }
export function bookRecord(book, memos = [], now = new Date()) {
  const b = book || {};
  const done = b.status === 'done';
  const memoCount = (Array.isArray(memos) ? memos : []).filter((m) => hasText(m) || m?.photoPath).length + (hasSummary(b) ? 1 : 0);
  const actionsDone = (Array.isArray(b.actions) ? b.actions : []).filter((a) => a && a.done).length;
  const stats = [];
  if (memoCount > 0) stats.push({ key: 'memos', label: 'メモ', value: `${memoCount}件` });
  if (actionsDone > 0) stats.push({ key: 'actions', label: '実行した行動', value: `${actionsDone}件` });
  let date = null;
  if (done && parseLocalDate(b.doneDate)) date = { label: '読了日', text: fmtDotDate(b.doneDate, now) };
  else if (!done && parseLocalDate(b.startDate)) date = { label: '読みはじめの日', text: `${fmtDotDate(b.startDate, now)}〜` };
  return {
    kicker: done ? '読了' : '読書中',
    title: String(b.title || '').trim() || '無題',
    titleIsBook: true,
    sub: formatAuthors(b.author),
    stats,
    date,
  };
}

// ⏱ 今月・今年の読書の時間（集中モードの合計・2026-10-11 オーナー裁定）。1 分未満は出さない。
//   数字の欄の短い形「12時間30分」「45分」（数字は大きく・単位は小さく描く＝splitStatValue）。
export const READING_STAT_MIN_SEC = 60;
export function readingStatValue(sec) {
  const m = Math.round(Math.max(0, Number(sec) || 0) / 60);
  if (m < 1) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}分`;
  return r ? `${h}時間${r}分` : `${h}時間`;
}
function pushReadingStat(stats, readingSec) {
  if (!(Number(readingSec) >= READING_STAT_MIN_SEC)) return;
  const value = readingStatValue(readingSec);
  if (value) stats.push({ key: 'reading', label: '読書の時間', value });
}

// 画像に描く数字（3 つまで）。4 つそろうとき（今月・今年の 読了・メモ・読書の時間・実行した行動）は、
//   外から見て読書の量と成果が伝わる 読了・読書の時間・実行した行動 を出し、メモの数を外す（2026-10-11）。
//   どれかが 0 で 3 つ以下ならメモも入る。表示する項目で外した数字は先に除いてから選ぶ（applyShareItems のあと）。
export const STATS_MAX = 3;
export function shownStats(stats) {
  const list = Array.isArray(stats) ? stats.filter(Boolean) : [];
  if (list.length <= STATS_MAX) return list;
  const noMemos = list.filter((st) => st.key !== 'memos');
  return (noMemos.length >= STATS_MAX ? noMemos : list).slice(0, STATS_MAX);
}

// 今月の記録（読了の冊数・今月のメモ・今月に実行した行動・読書の時間）。本が 1 冊も無くても作れる（数字の無い 1 枚）。
// monthMemos は今月書いたメモ（件数だけ使う）。readingSec は今月の集中モードの合計秒（無ければ出さない）。
export function monthRecord(books, monthMemos = [], now = new Date(), { readingSec = 0 } = {}) {
  const list = Array.isArray(books) ? books : [];
  const finished = list
    .filter((b) => b && b.status === 'done' && sameMonth(parseLocalDate(b.doneDate), now))
    .sort((a, b) => timeOf(b.doneDate) - timeOf(a.doneDate));
  const memoCount = (Array.isArray(monthMemos) ? monthMemos : [])
    .filter((m) => (hasText(m) || m?.photoPath) && sameMonth(parseLocalDate(m.createdAt || m.created_at), now)).length;
  let actionsDone = 0;
  for (const b of list) {
    for (const a of (Array.isArray(b?.actions) ? b.actions : [])) {
      if (a && a.done && sameMonth(parseLocalDate(a.completedAt || a.completed_at), now)) actionsDone += 1;
    }
  }
  const stats = [];
  if (finished.length) stats.push({ key: 'books', label: '読了', value: `${finished.length}冊` });
  if (memoCount) stats.push({ key: 'memos', label: 'メモ', value: `${memoCount}件` });
  // 画像の数字は 3 つまで。4 つそろうときはメモの数を外す（shownStats・2026-10-11）。
  pushReadingStat(stats, readingSec);
  if (actionsDone) stats.push({ key: 'actions', label: '実行した行動', value: `${actionsDone}件` });
  const subVariants = finishedSubVariants(finished);
  return {
    kicker: String(now.getFullYear()),
    title: `${now.getMonth() + 1}月の読書`,
    titleIsBook: false,
    sub: finished.length ? subVariants[0] : (stats.length ? '' : '読書の記録をはじめました'),
    subVariants: finished.length ? subVariants : null,
    stats,
    finishedBooks: finished.slice(0, 4),
  };
}

// 読み終えた本の行（今月・今年の書名の下）の書き方を、長い順に（2026-10-08 第 2 回 ui-critic「ほか N 冊が … で消える」）。
//   『A』『B』 ほか N 冊 → 『A』 ほか N+1 冊 → 「N+2 冊」。描く側は幅に入る最初のものを使う（pickSubVariant）＝冊数は切らない。
export function finishedSubVariants(finished) {
  const list = Array.isArray(finished) ? finished : [];
  const n = list.length;
  if (!n) return [];
  const t = (b) => `『${String(b?.title || '').trim()}』`;
  const out = [];
  if (n >= 2) out.push(`${t(list[0])}${t(list[1])}${n > 2 ? ` ほか ${n - 2} 冊` : ''}`);
  out.push(n >= 2 ? `${t(list[0])} ほか ${n - 1} 冊` : t(list[0]));
  out.push(`${n} 冊`);
  return out;
}

// 幅に入る最初の書き方（どれも入らなければ最後＝いちばん短いもの）。measure(text) は描く幅。
export function pickSubVariant(variants, measure, width) {
  const list = (Array.isArray(variants) ? variants : []).filter(Boolean);
  if (!list.length) return '';
  return list.find((v) => measure(v) <= width) || list[list.length - 1];
}

// 今年の記録（今年に読み終えた本の冊数・今年のメモ・今年に実行した行動）。
// yearMemos は今年書いたメモ（読める分だけ）。memoCount を渡したら、件数はそちらを使う（読む上限より多い人のため）。
// 見出しは無し（題の「2026年の読書」が年を言う）。表紙は新しく読み終えた順に 4 冊まで（重ねる部品は今月と同じ）。
export function yearRecord(books, yearMemos = [], now = new Date(), { memoCount = null, readingSec = 0 } = {}) {
  const list = Array.isArray(books) ? books : [];
  const finished = list
    .filter((b) => b && b.status === 'done' && sameYear(parseLocalDate(b.doneDate), now))
    .sort((a, b) => timeOf(b.doneDate) - timeOf(a.doneDate));
  const counted = (Array.isArray(yearMemos) ? yearMemos : [])
    .filter((m) => (hasText(m) || m?.photoPath) && sameYear(parseLocalDate(m.createdAt || m.created_at), now)).length;
  const memos = Number.isFinite(memoCount) && memoCount >= 0 ? memoCount : counted;
  let actionsDone = 0;
  for (const b of list) {
    for (const a of (Array.isArray(b?.actions) ? b.actions : [])) {
      if (a && a.done && sameYear(parseLocalDate(a.completedAt || a.completed_at), now)) actionsDone += 1;
    }
  }
  const stats = [];
  if (finished.length) stats.push({ key: 'books', label: '読了', value: `${finished.length}冊` });
  if (memos) stats.push({ key: 'memos', label: 'メモ', value: `${memos}件` });
  // 画像の数字は 3 つまで。4 つそろうときはメモの数を外す（shownStats・2026-10-11）。
  pushReadingStat(stats, readingSec);
  if (actionsDone) stats.push({ key: 'actions', label: '実行した行動', value: `${actionsDone}件` });
  const subVariants = finishedSubVariants(finished);
  return {
    kicker: '',
    title: `${now.getFullYear()}年の読書`,
    titleIsBook: false,
    sub: finished.length ? subVariants[0] : '',
    subVariants: finished.length ? subVariants : null,
    stats,
    finishedBooks: finished.slice(0, 4),
  };
}

// 今年のメモの件数（yearRecord と同じ数え方＝本文か写真のあるメモ）。読んだ件数がシートの読む上限（limit）に
// 届いたときだけ、読めなかった分を数え上げの数から足す（その分は本文の有無が分からないので、そのまま数える）。
// 上限に届かなければ null＝yearRecord が読んだメモを数え直す（数え上げは空のメモも数えるので使わない・第 4 回）。
export function yearMemoCountFor(memos, total, limit = Infinity) {
  const list = Array.isArray(memos) ? memos : [];
  if (list.length < limit || !Number.isFinite(total) || total <= list.length) return null;
  const counted = list.filter((m) => String(m.text || '').trim() || m.photoPath).length;
  return counted + (total - list.length);
}

// 副題を除いた書名（長い書名が決まった行数に入らないとき、副題の前で切って』を閉じるため・第 3 回）。
// 区切りは 全角の空白・日本語の前の半角の空白・―〜：・開き丸括弧。区切りが無ければそのまま。
//   「イシューからはじめよ 知的生産の「シンプルな本質」」→「イシューからはじめよ」
//   「GIVE & TAKE 「与える人」こそ成功する時代」→「GIVE & TAKE」（英字の間の空白では切らない）
export function mainTitle(title) {
  const t = String(title || '').trim();
  // eslint-disable-next-line no-control-regex
  const m = /^(.{2,}?)(?:　|\s+(?=[^\x00-\x7F])|\s*[―—～〜：:]|\s*[（(])/u.exec(t);
  return m ? m[1].trim() : t;
}

// 「9月28日」→ [{ text:'9', big:true }, { text:'月', big:false }, …]。数字（と小数点）を大きく、単位を小さく。
export function splitStatValue(value) {
  const out = [];
  for (const ch of Array.from(String(value ?? ''))) {
    const big = /[0-9０-９.,]/.test(ch);
    const last = out[out.length - 1];
    if (last && last.big === big) last.text += ch;
    else out.push({ text: ch, big });
  }
  return out;
}

// ---------------------------------------------------------------- 重ねる一文

// 本文のあるメモだけ・新しい順。preferId（メモの「…」→「この一文をシェア」）を先頭に。
// AI が書いたもの（AI まとめ）は入れない＝画像の主役は自分の言葉（2026-10-09）。本人がそのメモを選んだときだけ入れる。
export function orderQuoteCandidates(memos, { preferId = null } = {}) {
  const list = (Array.isArray(memos) ? memos : []).filter((m) => hasText(m) && (!isAiWritten(m) || (preferId && m.id === preferId)));
  const sorted = [...list].sort((a, b) => timeOf(b.createdAt || b.created_at) - timeOf(a.createdAt || a.created_at));
  if (preferId) {
    const i = sorted.findIndex((m) => m.id === preferId);
    if (i > 0) sorted.unshift(sorted.splice(i, 1)[0]);
  }
  return sorted;
}

// 今年の「いちばん残した一文」の並び（先頭がいちばん）。AI を使わない・AI が書いたもの（AI まとめ）は入れない。
//   1. 思い出しカードで「覚えた」を多く押したメモ（recallCount が大きい順）
//   2. 自分の言葉でしっかり書いたメモ（8 字以上）
//   3. 同じなら新しい順
// 「別の一文」はこの順に次へ。
export const YEAR_QUOTE_MIN_CHARS = 8;
export function orderYearQuoteCandidates(memos) {
  const list = (Array.isArray(memos) ? memos : []).filter((m) => hasText(m) && !isAiWritten(m));
  const recall = (m) => {
    const n = Number(m.recallCount ?? m.recall_count);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const solid = (m) => (Array.from(String(m.text).trim()).length >= YEAR_QUOTE_MIN_CHARS ? 1 : 0);
  return [...list].sort((a, b) => (recall(b) - recall(a))
    || (solid(b) - solid(a))
    || (timeOf(b.createdAt || b.created_at) - timeOf(a.createdAt || a.created_at)));
}

// 見せ方ごとの一文の長さ（記録は 60 字・一文は 120 字）。
export function quoteText(text, variant = 'quote') {
  return clampLine(text, variant === 'record' ? RECORD_QUOTE_MAX : undefined).text;
}

// 「別の一文」を押したときの次（index -1 ＝ 一文なし）。
// 記録（allowNone）は 候補 1 → 2 → … → なし → 1 と回る。一文の見せ方は なし にしない。
export function swapQuote(index, count, allowNone = false) {
  if (!count) return -1;
  if (index < 0) return 0;
  const next = index + 1;
  if (next < count) return next;
  return allowNone ? -1 : 0;
}

// ボタンの名前（押すと何が起きるか）。押しても変わらないときは null（ボタンを出さない）。
export function swapQuoteLabel(index, count, allowNone = false) {
  if (!count) return null;
  if (!allowNone && count < 2) return null;
  const next = swapQuote(index, count, allowNone);
  if (index < 0) return '一文を入れる';
  if (next < 0) return '一文を外す';
  return '別の一文';
}

// 重ね方の選択肢（数字が 1 つも無ければ「数字」を出さない・一文が無ければ「一文」を出さない）と、最初の見せ方。
// 雑誌は本 1 冊（book）で一文（自分の言葉のメモ）があるときだけ（今月・今年・メモが無い本では選べない・2026-10-09）。
export function availableVariants(hasQuote, hasStats = false, { book = false } = {}) {
  return VARIANTS.filter((v) => (v === 'quote' ? !!hasQuote : v === 'stats' ? !!hasStats : v === 'magazine' ? !!hasQuote && !!book : true));
}
// 最初の重ね方（2026-10-09 オーナー「もっとおしゃれな内容で、周りに拡散したいと思える内容に」）。
//   1. メモから開いた（fromMemo）＝その一文
//   2. 前に選んだ重ね方（preferred）が選べるならそれ
//   3. 読書中の本（readingBook）・「大きな数字」を選んでいたが大きく出せる数が無い＝一文があれば「心に残った一文」
//   4. ほかは「書名と数字」（読書中でメモが無い本は、見出しの「読書中」が小さな添え書きになる）
// variants を省いたときは、選べるかどうかを見ない（記録はいつも選べる）。
export function defaultVariant({ fromMemo = false, hasQuote = false, preferred = null, variants = null, readingBook = false } = {}) {
  const can = (v) => (Array.isArray(variants) ? variants.includes(v) : (v !== 'quote' || hasQuote));
  if (fromMemo && hasQuote && can('quote')) return 'quote';
  if (preferred && VARIANTS.includes(preferred) && can(preferred)) return preferred;
  if (hasQuote && can('quote') && (readingBook || preferred === 'stats')) return 'quote';
  return 'record';
}

// ---------------------------------------------------------------- 雑誌（2026-10-09 オーナーの見本）
//
// 雑誌の 1 ページのような組み（中身はこれだけ・2026-10-09 オーナー「読書の記録の帯は不要」）:
//   右上 … Orime のロゴ（必ず入る・小さく）。その下の英字のひとこと「READ. NOTE. GROW.」は 2026-10-09 にやめた（オーナー「不要」）＝空きを詰める
//   左上 … 大きな引用＝心に残った一文の最初の文（「」で包む・細い明朝・字間を広く・3 行まで）
//          その下に、続きの文を小さく 3 行まで（無ければ出さない）
//   右   … 本のカード（表紙・書名・著者。説明の文は入れない＝AI の文も出版社の文も使わない）
//   下   … 左に小さな日付「2026.10.09 FRI」・右に英字のひとこと（MAGAZINE_TAGLINE_BOTTOM）
// 数字の帯（メモの数・行動など）は作らない。下の行には、あとで短い数を 1 つだけ添えられる場所（note）を残す
// （集中モードの読書時間を予定・今は null＝出さない）。

export const MAGAZINE_TAGLINE_BOTTOM = 'YOUR BOOKS, YOUR ADVISOR.';
export const MAGAZINE_HEAD_MAX = 48;
export const MAGAZINE_BODY_MAX = 90;
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// 雑誌の下の日付「2026.10.09 FRI」（ほかの重ね方の「2026.10.9」より小さく描く・主役にしない）。
export function fmtMagazineStamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}.${p(now.getMonth() + 1)}.${p(now.getDate())} ${DOW[now.getDay()]}`;
}

// 一文を、大きく出す最初の文（head）と、小さく続ける残り（body）に分ける。
// 最初の文＝最初の。！？か改行まで。長すぎる（MAGAZINE_HEAD_MAX 超）ときは … で切る。外側の「」は外す（描くときに付ける）。
export function splitMagazineQuote(text) {
  const s = clampLine(text).text;
  if (!s) return { head: '', body: '' };
  const m = /^[^\n。！？!?]*[。！？!?]+[」』）)]*/u.exec(s);
  let head = (m ? m[0] : s.split('\n')[0]).trim();
  let rest = s.slice(m ? m[0].length : s.split('\n')[0].length).replace(/\n+/g, ' ').trim();
  const unq = /^「([^「」]*)」$/u.exec(head);
  if (unq) head = unq[1].trim();
  // 「A。B」のように括弧が 2 つの文にまたがるときは、片方だけ残った括弧を外す。
  if (/^「/u.test(head) && !head.includes('」')) head = head.slice(1).trim();
  if (/」$/u.test(rest) && !rest.includes('「')) rest = rest.slice(0, -1).trim();
  if (Array.from(head).length > MAGAZINE_HEAD_MAX) head = clampLine(head, MAGAZINE_HEAD_MAX).text;
  // 外側を「」で包むので、中の「」は『』に（入れ子の引用の書き方）。
  head = head.replace(/「/gu, '『').replace(/」/gu, '』');
  if (rest) rest = clampLine(rest, MAGAZINE_BODY_MAX).text;
  return { head, body: rest };
}

// 雑誌の中身（本 1 冊・その本の心に残った一文＝自分の言葉のメモ）。メモが無い（quote が空）なら null＝選べない。
// note は下の行の短い数の欄（今は使わない＝null。集中モードの読書時間を入れる予定・{ label, value }）。
// 戻り値: { title, titleIsBook, sub, kicker, stats: [], date: null, quote: { head, body }, note }
export function magazineRecord(book, quote, { note = null } = {}) {
  const b = book || {};
  const q = splitMagazineQuote(quote);
  if (!q.head) return null;
  return {
    kicker: '',
    title: String(b.title || '').trim() || '無題',
    titleIsBook: true,
    sub: formatAuthors(b.author),
    stats: [],
    date: null,
    quote: q,
    note: note && String(note.value || '').trim() ? { label: String(note.label || ''), value: String(note.value) } : null,
  };
}

// 雑誌の下の行に並べるもの（左から）: 日付（隠せる）→ 短い数の欄（あれば）。右は英字のひとこと（いつも）。
export function magazineFooterItems({ stamp = '', note = null } = {}) {
  const left = [];
  if (stamp) left.push({ kind: 'stamp', text: stamp });
  if (note && note.value) left.push({ kind: 'note', text: note.label ? `${note.label} ${note.value}` : String(note.value) });
  return { left, right: MAGAZINE_TAGLINE_BOTTOM };
}

// ---------------------------------------------------------------- 安全な枠（SNS で切られない範囲）

// 幅 1080 の画像の中で、文字を置いてよい範囲。
//   ストーリー 9:16 … 上下 約 250 は Instagram の帯（名前・返信欄）がかかるので 270 空ける
//   投稿 4:5      … プロフィールの一覧は 3:4 に切られる（左右 約 34）ので左右 80 空ける
// footerBaseline はロゴと日付の基線、wordH はロゴの文字の高さ（LOGO_RULES.minWordH 以上）。
const FRAMES = {
  story: { margin: 96, safeTop: 270, safeBottom: 1920 - 270, footerBaseline: 1630, wordH: 36, gap: 72 },
  post: { margin: 88, safeTop: 104, safeBottom: 1350 - 72, footerBaseline: 1262, wordH: 32, gap: 64 },
  square: { margin: 80, safeTop: 88, safeBottom: 1080 - 64, footerBaseline: 1004, wordH: 30, gap: 56 },
};

// ---------------------------------------------------------------- ロゴ（必ず入る・2026-10-05 オーナー裁定）
//
// 「Orime のロゴはマストで入るようにしてください」。どの重ね方・地・形でも、左下にロゴを必ず描く（隠す項目に無い）。
// 決まり（幅 1080 の画像の座標）:
//   - 大きさ … 「Orime」の文字の高さ 30 以上（スマホで縮めて見ても 11pt ほど・2026-10-08 に 36 → 30＝必須だが主張しない
//               オーナー「おしゃれな意識高い人間が使いたくなるように」）。本の印はその 1.28 倍
//   - 余白   … 左は 72 以上（SNS の一覧で切られる左右 34 より内側）・基線は安全な枠の下端より上
//   - 空き   … ロゴの上 24 には何も置かない（自分で入れる言葉も、この線より下には動かせない＝言葉でロゴを隠せない）
//   - 読める … 写真の上は白いロゴ＋影、その下の写真の明るさから幕の濃さを決める（白と 4.5:1 以上・scrimAlpha）。
//               紙は元の色（焦げ茶）、夜・表紙の色・透明は白。今日の日付を隠しても、ロゴの場所は変わらない
// 動かせるのは写真と言葉だけ（ロゴは指で動かせない・大きさも変えられない）。
export const LOGO_RULES = { minWordH: 30, minMargin: 72, clearance: 24 };

// ロゴの箱（文字の高さ wordH・基線 baseline・左端 x・上端 top＝本の印の上端・clearTop＝上の空きの線）。
// 基線と大きさは形ごとに決まった値（重ね方・地で変えない）。左端だけ、その重ね方の文字の左端にそろえる（margin・72 以上）。
export function logoBox(format = 'post', { margin } = {}) {
  const f = recordFrame(format);
  const wordH = Math.max(LOGO_RULES.minWordH, f.wordH);
  const x = Math.max(LOGO_RULES.minMargin, Number.isFinite(margin) ? margin : f.margin);
  const markH = wordH * 1.28;
  const top = Math.floor(f.footerBaseline - wordH / 2 - markH / 2);
  return { x, baseline: f.footerBaseline, wordH, top, clearTop: top - LOGO_RULES.clearance };
}

// 雑誌のロゴの場所（右上・安全な枠の上端から）。大きさは logoBox と同じ（決まり LOGO_RULES のまま）。
// 右端は余白（frame.margin・72 以上）。clearBottom（ロゴの下端＋決まりの空き 24）より上には言葉を置けない（ロゴを隠せない）。
// ロゴの下の英字のひとことは 2026-10-09 にやめた（オーナー「不要」）＝引用はロゴのすぐ下の空きから始まる。
// 戻り値: { right, top, wordH, markH, baseline, clearBottom }
export function magazineLogoBox(format = 'post') {
  const f = recordFrame(format);
  const wordH = logoBox(f.format).wordH;
  const markH = wordH * 1.28;
  const top = f.safeTop;
  return {
    right: f.W - Math.max(LOGO_RULES.minMargin, f.margin),
    top,
    wordH,
    markH,
    baseline: top + markH / 2 + wordH / 2,
    clearBottom: Math.round(top + markH) + LOGO_RULES.clearance,
  };
}

export function recordFrame(format = 'post') {
  const key = FRAMES[format] ? format : 'post';
  const { w: W, h: H } = FORMATS[key];
  const f = FRAMES[key];
  // 記録の文字の大きさ（スマホで縮めて見ても読める・ストーリーが一番大きい）。
  const scale = key === 'story' ? 1 : key === 'post' ? 0.92 : 0.84;
  const r = (n) => Math.round(n * scale);
  return {
    format: key, W, H, ...f,
    footerTop: f.footerBaseline - Math.round(f.wordH * 1.5),
    kickerSize: r(30),
    titleSize: r(68),
    subSize: r(34),
    statLabelSize: r(30),
    statValueSize: r(108),
    statUnitSize: r(36),
    quoteSizes: [r(50), r(46), r(42), r(38), r(36)],
    metaSize: r(32),
  };
}

// 記録のまとまり（高さ blockH）を、下のロゴの上に置く。文字の塊は安全な枠の中に入れる。
// 入らないとき fits=false（呼び出し側が一文を外して組み直す）。
// 空いた上の範囲（coverArea）には、写真でない地のとき表紙を置く。
// hasFooter=false（ロゴも今日の日付も隠した）ときは、ロゴの場所まで下ろす（下に空きを残さない・2026-10-01）。
export function placeRecordBlock(frame, blockH, { hasFooter = true } = {}) {
  const bottom = hasFooter ? frame.footerTop - frame.gap : frame.footerBaseline;
  const top = bottom - blockH;
  const fits = top >= frame.safeTop;
  return {
    top: Math.max(frame.safeTop, top),
    bottom,
    fits,
    coverArea: { top: frame.safeTop, bottom: Math.max(frame.safeTop, top - frame.gap) },
  };
}

// 写真でない地の記録で、上の空きに置く表紙（今月は 4 冊まで重ねる）の場所と大きさ。
// 書名だけを出すとき（titleOnly）は、表紙を書名のすぐ上・左の余白にそろえて置く＝表紙と書名で 1 つのまとまりに見える
// （上の真ん中に浮かせると、書名だけが下に取り残されて意図しない空きに見えた・2026-10-01 ui-critic）。
// 空きが狭い（220 以下）・表紙が無いときは null。戻り値: { x0, y0, w, h, step }
export function recordCoverPlacement(frame, place, { count = 1, titleOnly = false } = {}) {
  const areaH = place.coverArea.bottom - place.coverArea.top;
  if (!count || areaH <= 220) return null;
  const h = Math.round(Math.min(areaH * 0.86, titleOnly ? 440 : (count > 1 ? 400 : 520)));
  const w = Math.round(h / 1.45);
  const step = count > 1 ? Math.round(w * 0.62) : 0;
  const total = w + step * (count - 1);
  if (titleOnly) return { x0: frame.margin, y0: place.top - frame.gap - h, w, h, step };
  return {
    x0: frame.margin + Math.max(0, (frame.W - frame.margin * 2 - total) / 2),
    y0: place.coverArea.top + (areaH - h) / 2,
    w, h, step,
  };
}

// 書名の大きさの倍率。数字を全部隠したとき（「書名だけ」など）は、書名を主役にして大きく（1.25 倍・3 行まで）
// ＝隠した場所がぽっかり空いて見えないように（2026-10-01）。
export function recordTitleScale({ statsCount = 0 } = {}) {
  return statsCount > 0 ? 1 : 1.25;
}
export function recordTitleMaxLines({ statsCount = 0 } = {}) {
  return statsCount > 0 ? 2 : 3;
}

// 記録のまとまりの組み（上から 一文 → 見出し → 書名 → 著者 → 線 → 数字）。隠した項目は場所を取らない。
// 間（一文の下・見出しの下 10・著者の上 6・線の上下）は、上と下の両方に何かあるときだけ入れる。
// shareCard.js の drawRecordBlock はこの top / height のとおりに描く（テストで高さを確かめられるように純粋関数）。
// 戻り値: { elements: [{ kind, top, height }], height, titleScale, titleLH }
export function recordBlockPlan(frame, {
  hasKicker = false, titleLines = 0, hasSub = false, subLines = 1, statsCount = 0, quoteLines = 0, quoteLineHeight = 0,
} = {}) {
  const titleScale = recordTitleScale({ statsCount });
  const titleLH = Math.round(frame.titleSize * titleScale * 1.3);
  const labelH = Math.round(frame.statLabelSize * 1.3);
  const ruleGap = Math.round(frame.statLabelSize * 1.1);
  const parts = [];
  if (quoteLines > 0) parts.push({ kind: 'quote', height: quoteLines * quoteLineHeight, gapAfter: Math.round(frame.quoteSizes[0] * 1.3) });
  if (hasKicker) parts.push({ kind: 'kicker', height: Math.round(frame.kickerSize * 1.35), gapAfter: 16 });
  if (titleLines > 0) parts.push({ kind: 'title', height: Math.min(recordTitleMaxLines({ statsCount }), titleLines) * titleLH, gapAfter: 0 });
  // 著者は 2 行まで折り返す（… で切らない・2026-10-08）。
  if (hasSub) parts.push({ kind: 'sub', height: Math.round(frame.subSize * 1.45) * Math.max(1, Math.min(2, subLines)), gapBefore: 10, gapAfter: 0 });
  if (statsCount > 0) {
    parts.push({ kind: 'rule', height: 0, gapBefore: ruleGap, gapAfter: ruleGap });
    parts.push({ kind: 'stats', height: labelH + 10 + frame.statValueSize, gapAfter: 0 });
  }
  const elements = [];
  let y = 0;
  parts.forEach((p, i) => {
    // 線は、上に何かあるときだけ引く（数字だけなら線は要らない）。
    if (p.kind === 'rule' && i === 0) return;
    if (elements.length) {
      const prev = parts[parts.indexOf(elements[elements.length - 1].part)];
      y += Math.max(prev.gapAfter || 0, p.gapBefore || 0);
    }
    elements.push({ kind: p.kind, top: y, height: p.height, part: p });
    y += p.height;
  });
  return {
    elements: elements.map(({ part, ...e }) => e), // eslint-disable-line no-unused-vars
    height: y,
    titleScale,
    titleLH,
  };
}

// 記録のまとまりの、一文を除いた高さ（見出し・書名・著者・線・数字）。
// 一文はこの残りに入るときだけ入れる（入らなければ外す）ので、これが安全な枠に入れば書名と数字は必ず見える。
export function recordBaseHeight(frame, { titleLines = 1, hasKicker = true, hasSub = true, statsCount = 3 } = {}) {
  return recordBlockPlan(frame, { titleLines, hasKicker, hasSub, statsCount }).height;
}

// 数字の列（3 つまで）。widths（各列の中身＝名前と数字の広いほうの幅）を渡すと、中身の幅に合わせて
// 列の間を等しくする（左端は余白・最後の列の右端は右の余白・2026-10-05 第 2 回 ui-critic「等分だと
// 『9月28日』と『24件』がくっつき、『2件』の右が空く」）。間は STAT_COL_GAP 以上（入らなければ呼び出し側が縮める）。
// widths が無ければ等分（左そろえ）。
export const STAT_COL_GAP = 40;
export function statColumns(frame, count, widths = null) {
  const n = Math.max(1, Math.min(3, count));
  const contentW = frame.W - frame.margin * 2;
  if (!Array.isArray(widths) || widths.length < n || n === 1) {
    const width = contentW / n;
    return Array.from({ length: n }, (_, i) => ({ x: frame.margin + width * i, width }));
  }
  const ws = widths.slice(0, n).map((w) => Math.max(0, Number(w) || 0));
  const total = ws.reduce((a, b) => a + b, 0);
  // 数字が 2 つで中身が短いと、2 つめが右端まで飛んで離れて見える。間は余白の内側の幅の 2 割まで
  // （そのときだけ最後の列の右端は右の余白より内側）。
  const gap = Math.max(STAT_COL_GAP, Math.min(contentW * 0.2, (contentW - total) / (n - 1)));
  let x = frame.margin;
  return ws.map((w) => {
    const col = { x, width: w };
    x += w + gap;
    return col;
  });
}

// 数字の列が入る大きさの倍率（中身の幅の合計＋間 STAT_COL_GAP が余白の内側に入るまで、数字だけを縮める）。
// labelWidths は名前（縮めない）、valueWidths は倍率 1 の数字の幅。戻り値 0.5〜1。
export function statColumnsScale(frame, labelWidths, valueWidths) {
  const n = Math.min(3, valueWidths.length);
  if (n <= 1) {
    const avail = frame.W - frame.margin * 2;
    return Math.max(0.5, Math.min(1, avail / Math.max(1, valueWidths[0] || 1)));
  }
  const avail = frame.W - frame.margin * 2 - STAT_COL_GAP * (n - 1);
  const totalAt = (k) => valueWidths.slice(0, n).reduce((s, v, i) => s + Math.max(labelWidths[i] || 0, v * k), 0);
  let k = 1;
  while (k > 0.5 && totalAt(k) > avail) k -= 0.01;
  return Math.max(0.5, Math.round(k * 100) / 100);
}

// ---------------------------------------------------------------- 数字（Strava の大きな数字・2026-10-05）
//
// 真ん中に、上から 見出し → 書名 → 著者 → （間）→ 数字（名前は小さく・数字は大きく）を縦に積む（中央そろえ）。
// 数字は記録と同じもの（3 つまで・0 は出さない）。一文は入れない（数字が主役）。
// 大きさはストーリーを基準に投稿 0.92 倍（記録と同じ）。
// compact（写真の地）は、写真を見せるために詰める（数字 140・間を狭く＝まとまりが画像の半分ほどに収まる・2026-10-05 第 2 回）。
export function statsStyle(frame, { compact = false } = {}) {
  const k = frame.format === 'story' ? 1 : frame.format === 'post' ? 0.92 : 0.84;
  const r = (n) => Math.round(n * k);
  const c = (a, b) => r(compact ? b : a);
  return {
    kickerSize: c(30, 28),
    titleSize: c(56, 50),
    subSize: c(34, 32),
    labelSize: c(30, 28),
    valueSize: c(148, 132),
    unitSize: c(44, 40),
    titleLH: Math.round(c(56, 50) * 1.36),
    labelH: Math.round(c(30, 28) * 1.3),
    statGap: c(44, 24), // 数字と、次の数字の名前の間
    headGap: c(72, 48), // 書名・著者と、1 つめの数字の間
  };
}

// 数字の積み方の組み（隠した項目は場所を取らない）。戻り値: { elements: [{ kind, top, height, index? }], height, style }
export function statsStackPlan(frame, { hasKicker = false, titleLines = 0, hasSub = false, subLines = 1, statsCount = 0, compact = false } = {}) {
  const st = statsStyle(frame, { compact });
  const parts = [];
  if (hasKicker) parts.push({ kind: 'kicker', height: Math.round(st.kickerSize * 1.35), gapAfter: 12 });
  if (titleLines > 0) parts.push({ kind: 'title', height: Math.min(2, titleLines) * st.titleLH, gapAfter: 0 });
  if (hasSub) parts.push({ kind: 'sub', height: Math.round(st.subSize * 1.45) * Math.max(1, Math.min(2, subLines)), gapBefore: 10, gapAfter: 0 });
  const n = Math.max(0, Math.min(3, statsCount));
  for (let i = 0; i < n; i += 1) {
    parts.push({ kind: 'stat', index: i, height: st.labelH + 4 + st.valueSize, gapBefore: i === 0 ? st.headGap : st.statGap, gapAfter: 0 });
  }
  const elements = [];
  let y = 0;
  parts.forEach((p, i) => {
    if (i > 0) y += Math.max(parts[i - 1].gapAfter || 0, p.gapBefore || 0);
    elements.push({ kind: p.kind, top: y, height: p.height, ...(p.kind === 'stat' ? { index: p.index } : {}) });
    y += p.height;
  });
  return { elements, height: y, style: st };
}

// 数字の積み方の置き場所: 安全な枠の上端から、ロゴの上（間 gap）までの範囲の真ん中。
// 言葉を入れたとき・align: 'bottom'（写真の地＝写真の上のほうを見せる）は下に寄せる（言葉は上のほうに置かれるので重ねない）。
// coverCount（写真でない地の表紙の数）があれば、表紙＋間＋積み方を 1 つのまとまりとして真ん中に置く
// （表紙の高さ 200 も取れなければ表紙は出さない）。戻り値: { top, bottom, fits, cover: { x0, y0, w, h, step } | null }
export function placeStatsStack(frame, blockH, { phrase = false, coverCount = 0, align = 'center' } = {}) {
  const areaTop = frame.safeTop;
  const areaBottom = frame.footerTop - frame.gap;
  const room = areaBottom - areaTop;
  const fits = blockH <= room;
  let cover = null;
  let groupH = blockH;
  if (coverCount > 0 && !phrase) {
    const h = Math.round(Math.min(frame.format === 'story' ? 440 : 340, room - blockH - frame.gap));
    if (h >= 200) {
      const w = Math.round(h / 1.45);
      const step = coverCount > 1 ? Math.round(w * 0.62) : 0;
      const total = w + step * (coverCount - 1);
      cover = { x0: Math.round((frame.W - total) / 2), y0: 0, w, h, step };
      groupH = h + frame.gap + blockH;
    }
  }
  const top0 = phrase || align === 'bottom' ? areaBottom - groupH : areaTop + Math.max(0, (room - groupH) / 2);
  const groupTop = Math.max(areaTop, Math.round(top0));
  if (cover) cover.y0 = groupTop;
  const top = cover ? groupTop + cover.h + frame.gap : groupTop;
  return { top, bottom: top + blockH, fits, cover };
}

// ---------------------------------------------------------------- 表示する項目（2026-10-01）
//
// オーナー要望「人によって読み始めのタイミングを書かなくても良かったり、著者は不要だったり、
// タイトルだけが良かったりするだろうから調整できるようにしたい」。画像に入れる項目ごとに出す・隠すを選ぶ。
// 覚えるのは「隠した項目」の名前だけ（新しい項目が増えても最初は出る）。端末の中（localStorage）に。
// ロゴは項目に無い＝隠せない（2026-10-05 オーナー裁定「Orime のロゴはマストで入るように」）。以前に隠した人の
// 端末に残る 'logo' は、読むときに捨てる（readHiddenItems が SHARE_ITEM_KEYS に無い名前を落とす）。

export const SHARE_ITEM_KEYS = ['status', 'title', 'author', 'date', 'books', 'memos', 'actions', 'reading', 'quote', 'stamp'];
export const SHARE_ITEMS_STORAGE_KEY = 'orime.share.hiddenItems';

const STAT_ITEM_LABEL = { books: '読了の冊数', memos: 'メモの数', actions: '実行した行動', reading: '読書の時間' };

// いまの 1 枚で選べる項目（中身のある項目だけ・上から画像の順）。戻り値: [{ key, label }]
//   記録: 状態（今月は年）・書名（今月は「9月の読書」）・著者（今月は読み終えた本）・数字それぞれ・一文・今日の日付
//   数字: 記録と同じ（一文は入れないので出さない）
//   一文: 書名・著者（一文は主役なので隠せない）
//   雑誌: 書名・著者・今日の日付（引用は主役なので隠せない）
// ロゴは出さない（必ず入る・2026-10-05）。
export function shareItemsFor({ record = null, variant = 'record', hasQuote = false, hasAuthor = false } = {}) {
  const out = [];
  const book = !!record?.titleIsBook;
  if ((variant === 'record' || variant === 'stats') && record) {
    if (record.kicker) out.push({ key: 'status', label: book ? '状態' : '年' });
    if (record.title) out.push({ key: 'title', label: book ? '書名' : `「${record.title}」` });
    if (record.sub) out.push({ key: 'author', label: book ? '著者' : '読み終えた本' });
    if (record.date?.text) out.push({ key: 'date', label: record.date.label });
    for (const st of record.stats || []) {
      if (st?.key) out.push({ key: st.key, label: STAT_ITEM_LABEL[st.key] || st.label });
    }
    if (hasQuote && variant === 'record') out.push({ key: 'quote', label: '一文' });
    out.push({ key: 'stamp', label: '今日の日付' });
  } else if (variant === 'magazine') {
    // 雑誌: 引用（主役・隠せない）・書名・著者・今日の日付
    out.push({ key: 'title', label: '書名' });
    if (hasAuthor) out.push({ key: 'author', label: '著者' });
    out.push({ key: 'stamp', label: '今日の日付' });
  } else {
    out.push({ key: 'title', label: '書名' });
    if (hasAuthor) out.push({ key: 'author', label: '著者' });
  }
  return out;
}

const hiddenSet = (hidden) => new Set(Array.isArray(hidden) || hidden instanceof Set ? [...hidden] : []);

// 見出しの小さな添え書き（「読了 · 9.28」「読書中 · 10.5〜」）。日付を出すとき（表示する項目でオン）だけ。
export function kickerWithDate(kicker, date) {
  const k = String(kicker || '').trim();
  const d = String(date?.text || '').trim();
  if (!d) return k;
  return k ? `${k} · ${d}` : d;
}

// 隠した項目を記録に当てる（隠した見出し・書名・著者は空に、数字は外す）。日付は既定で隠す（SHARE_ITEMS_DEFAULT_OFF）。
export function applyShareItems(record, hidden) {
  if (!record) return record;
  const h = hiddenSet(hidden);
  return {
    ...record,
    kicker: kickerWithDate(h.has('status') ? '' : record.kicker, h.has('date') ? null : record.date),
    title: h.has('title') ? '' : record.title,
    sub: h.has('author') ? '' : record.sub,
    subVariants: h.has('author') ? null : (record.subVariants || null),
    stats: (record.stats || []).filter((st) => !h.has(st.key)),
  };
}

// 描く側が見るフラグ（記録以外の項目）。ロゴは必ず描くのでフラグは無い。
export function shareVisibility(hidden) {
  const h = hiddenSet(hidden);
  return { title: !h.has('title'), author: !h.has('author'), quote: !h.has('quote'), stamp: !h.has('stamp') };
}

// 既定で隠す項目（本人がオンにしたときだけ出す）。日付は画像の主役にしない（2026-10-09）。
// オンにした項目は別の名前（orime.share.shownItems）で覚える（隠した項目の一覧は今までの形のまま）。
export const SHARE_ITEMS_DEFAULT_OFF = ['date'];
export const SHARE_SHOWN_STORAGE_KEY = 'orime.share.shownItems';

function readList(storage, key) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((k) => SHARE_ITEM_KEYS.includes(k)) : [];
  } catch {
    return [];
  }
}

// 前に選んだ「隠した項目」を読む（読めない・壊れている・private ブラウズ＝既定で隠す項目だけを隠す）。
export function readHiddenItems(storage) {
  const hidden = readList(storage, SHARE_ITEMS_STORAGE_KEY);
  const shown = readList(storage, SHARE_SHOWN_STORAGE_KEY);
  const out = [...hidden];
  for (const k of SHARE_ITEMS_DEFAULT_OFF) if (!shown.includes(k) && !out.includes(k)) out.push(k);
  return out;
}

export function writeHiddenItems(storage, hidden) {
  try {
    const list = [...hiddenSet(hidden)].filter((k) => SHARE_ITEM_KEYS.includes(k));
    storage?.setItem(SHARE_ITEMS_STORAGE_KEY, JSON.stringify(list));
    storage?.setItem(SHARE_SHOWN_STORAGE_KEY, JSON.stringify(SHARE_ITEMS_DEFAULT_OFF.filter((k) => !list.includes(k))));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 選んだ重ね方・形を覚える（2026-10-05）
//
// 次に共有するときも同じ重ね方・形で開く（ストーリーにばかり出す人は毎回切り替えなくてよい）。端末の中だけ。
// 読めない・壊れている・private ブラウズ＝既定（記録・投稿）。地（写真・紙…）と写真そのものは覚えない。
export const SHARE_PREFS_STORAGE_KEY = 'orime.share.prefs';

export function readSharePrefs(storage) {
  try {
    const raw = storage?.getItem(SHARE_PREFS_STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return {
      variant: p && VARIANTS.includes(p.variant) ? p.variant : null,
      format: p && SHARE_FORMATS.includes(p.format) ? p.format : null,
    };
  } catch {
    return { variant: null, format: null };
  }
}

export function writeSharePrefs(storage, patch = {}) {
  try {
    const next = { ...readSharePrefs(storage), ...patch };
    storage?.setItem(SHARE_PREFS_STORAGE_KEY, JSON.stringify({
      variant: VARIANTS.includes(next.variant) ? next.variant : null,
      format: SHARE_FORMATS.includes(next.format) ? next.format : null,
    }));
    return !!storage;
  } catch {
    return false;
  }
}

// 左右のスワイプ（dir: 1＝次・-1＝前）で次の重ね方。端では止まる（回り込まない＝いまどこかが分かる）。
export function stepVariant(variants, current, dir) {
  const list = Array.isArray(variants) ? variants : [];
  const i = list.indexOf(current);
  if (i < 0) return list[0] || current;
  return list[Math.min(list.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)))];
}

// ---------------------------------------------------------------- 共有の文

// 共有の文に添えるハッシュタグ（画像には入れない・2026-10-08）。X の月末の「#◯月読了本」と 12 月の「今年の読書」に乗る。
//   今月 … #10月読了本（その月の数字・その月に読み終えた本があるときだけ＝メモだけの月は付けない・オーナー判断）
//   今年 … #2026年の読書／本 1 冊 … なし
export function shareHashtags(kind, now = new Date(), { finishedCount = 0 } = {}) {
  if (kind === 'month') return finishedCount >= 1 ? [`#${now.getMonth() + 1}月読了本`] : [];
  if (kind === 'year') return [`#${now.getFullYear()}年の読書`];
  return [];
}

// 画像に入れたものだけ（記録の見出し・書名・一文）＋ハッシュタグ（tags・#Orime の前）＋ #Orime ＋ URL。
export function buildRecordShareText({ record, quote = '', siteUrl = '', tags = [] }) {
  const parts = [];
  // 書名を隠した（表示する項目）ときは文にも入れない（画像に入れたものだけ）。
  if (record && record.title) {
    parts.push(record.titleIsBook ? `${record.kicker || ''}『${record.title}』` : record.title);
  }
  const q = String(quote || '').trim();
  if (q) parts.push(q);
  const tagLine = [...(Array.isArray(tags) ? tags : []).filter(Boolean), '#Orime'].join(' ');
  parts.push(tagLine);
  const url = String(siteUrl || '').trim();
  if (url) parts.push(url);
  return parts.join('\n');
}
