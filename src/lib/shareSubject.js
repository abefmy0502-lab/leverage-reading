// 📷 写真で共有の「どの本？」と日付の小さな決まりごと（2026-10-11 に shareOverlay.js から分けた）。
//   ホーム・振り返り・声かけ（shareNudge）が最初から使うのはここだけ。重ね方や画像の配置の大きな本体
//   （shareOverlay.js・shareCardLayout.js）は、写真で共有を開いたときに読む（最初に読む JS を軽くする）。
//   shareOverlay.js は同じ名前でここを出し直すので、今までの import はそのまま動く。

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

export const sameMonth = (d, now) => !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
export const sameYear = (d, now) => !!d && d.getFullYear() === now.getFullYear();
export const timeOf = (v) => {
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
