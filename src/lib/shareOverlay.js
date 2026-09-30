// 📷 写真で共有（Strava のように、撮った写真の上に読書の記録と一文を重ねる）の「決めごと」。
//
// canvas も DOM も触らない純粋関数だけ（テストで確かめられるように）。描くのは shareCard.js。
//   - pickShareSubject   … ホームから開いたときに、どの本（または「今月」）を最初に選んでおくか
//   - subjectChoices     … シートの「どの本？」の並び（今月 → 読書中 → 最近読み終えた本）
//   - bookRecord         … 本 1 冊の記録（読了・読書中の日付・メモの件数・実行した行動）
//   - monthRecord        … 今月の記録（読了の冊数・メモ・実行した行動）
//   - orderQuoteCandidates / swapQuote / swapQuoteLabel … 重ねる一文（新しい順・1 タップで次へ）
//   - splitStatValue     … 「9月28日」の数字を大きく、単位を小さく描くための分け方
//   - recordFrame / placeRecordBlock … 4:5・9:16 の、SNS で切られない範囲（安全な枠）と置き方
//   - buildRecordShareText … 共有の文（画像に入れたものだけ）
//
// 入れるのは、画面で本人が見ている情報だけ（書名・著者・日付・件数・一文）。名前・メール・タグは入れない。
// 連続日数・目標・順位・バッジは入れない（反ゲーミフィケーション）。

import { clampLine, FORMATS } from './shareCardLayout';

// 「記録」に重ねる一文は短く（写真を見せたいので 3 行まで）。
export const RECORD_QUOTE_MAX = 60;
// 見せ方は 2 つ: 記録（数字が主役・Strava の記録の形）／一文（メモの一文が主役）。
export const VARIANTS = ['record', 'quote'];
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

// 画像の右下の日付「2026.9.30」。
export function fmtStamp(now = new Date()) {
  return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
}

const sameMonth = (d, now) => !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
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

// シートの「どの本？」の並び: 今月 → 読書中（新しい順）→ 読了（新しい順）。多すぎると選べないので max 冊まで。
// 選んでいる本が範囲の外なら、今月の次に入れて見えるようにする。
export function subjectChoices(books, { selectedId = null, max = 8 } = {}) {
  const list = (Array.isArray(books) ? books : []).filter(isShareable);
  const reading = list.filter((b) => b.status === 'reading').sort((a, b) => recency(b) - recency(a));
  const done = list.filter((b) => b.status === 'done').sort((a, b) => recency(b) - recency(a));
  let picked = [...reading, ...done].slice(0, max);
  if (selectedId && !picked.some((b) => b.id === selectedId)) {
    const sel = list.find((b) => b.id === selectedId);
    if (sel) picked = [sel, ...picked.slice(0, max - 1)];
  }
  return [{ kind: 'month' }, ...picked.map((b) => ({ kind: 'book', bookId: b.id, book: b }))];
}

// ---------------------------------------------------------------- 記録（数字）

const hasText = (m) => !!m && String(m.text || '').trim().length > 0;
const hasSummary = (b) => typeof (b?.leverageMemo ?? b?.leverage_memo) === 'string' && (b.leverageMemo ?? b.leverage_memo).trim().length > 0;

// 本 1 冊の記録。stats は最大 3 つ・0 のものは出さない（日付は分かるときだけ）。
// 戻り値: { kicker, title, sub, stats: [{ label, value }] }
export function bookRecord(book, memos = [], now = new Date()) {
  const b = book || {};
  const done = b.status === 'done';
  const memoCount = (Array.isArray(memos) ? memos : []).filter((m) => hasText(m) || m?.photoPath).length + (hasSummary(b) ? 1 : 0);
  const actionsDone = (Array.isArray(b.actions) ? b.actions : []).filter((a) => a && a.done).length;
  const stats = [];
  if (done && parseLocalDate(b.doneDate)) stats.push({ label: '読了', value: fmtMonthDay(b.doneDate, now) });
  else if (!done && parseLocalDate(b.startDate)) stats.push({ label: '読みはじめ', value: fmtMonthDay(b.startDate, now) });
  if (memoCount > 0) stats.push({ label: 'メモ', value: `${memoCount}件` });
  if (actionsDone > 0) stats.push({ label: '実行した行動', value: `${actionsDone}件` });
  return {
    kicker: done ? '読了' : '読書中',
    title: String(b.title || '').trim() || '無題',
    titleIsBook: true,
    sub: String(b.author || '').trim(),
    stats,
  };
}

// 今月の記録（読了の冊数・今月のメモ・今月に実行した行動）。本が 1 冊も無くても作れる（数字の無い 1 枚）。
// monthMemos は今月書いたメモ（件数だけ使う）。
export function monthRecord(books, monthMemos = [], now = new Date()) {
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
  if (finished.length) stats.push({ label: '読了', value: `${finished.length}冊` });
  if (memoCount) stats.push({ label: 'メモ', value: `${memoCount}件` });
  if (actionsDone) stats.push({ label: '実行した行動', value: `${actionsDone}件` });
  const titles = finished.slice(0, 2).map((b) => `『${String(b.title || '').trim()}』`).join('');
  const more = finished.length > 2 ? ` ほか ${finished.length - 2} 冊` : '';
  return {
    kicker: `${now.getFullYear()}年${now.getMonth() + 1}月`,
    title: `${now.getMonth() + 1}月の読書`,
    titleIsBook: false,
    sub: finished.length ? `${titles}${more}` : (stats.length ? '' : '読書の記録をはじめました'),
    stats,
    finishedBooks: finished.slice(0, 4),
  };
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
export function orderQuoteCandidates(memos, { preferId = null } = {}) {
  const list = (Array.isArray(memos) ? memos : []).filter(hasText);
  const sorted = [...list].sort((a, b) => timeOf(b.createdAt || b.created_at) - timeOf(a.createdAt || a.created_at));
  if (preferId) {
    const i = sorted.findIndex((m) => m.id === preferId);
    if (i > 0) sorted.unshift(sorted.splice(i, 1)[0]);
  }
  return sorted;
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

// 見せ方の選択肢（一文が無ければ記録だけ）と、最初の見せ方。
export function availableVariants(hasQuote) {
  return hasQuote ? ['record', 'quote'] : ['record'];
}
export function defaultVariant({ fromMemo = false, hasQuote = false } = {}) {
  return fromMemo && hasQuote ? 'quote' : 'record';
}

// ---------------------------------------------------------------- 安全な枠（SNS で切られない範囲）

// 幅 1080 の画像の中で、文字を置いてよい範囲。
//   ストーリー 9:16 … 上下 約 250 は Instagram の帯（名前・返信欄）がかかるので 270 空ける
//   投稿 4:5      … プロフィールの一覧は 3:4 に切られる（左右 約 34）ので左右 80 空ける
// footerBaseline はロゴと日付の基線、wordH はロゴの文字の高さ。
const FRAMES = {
  story: { margin: 88, safeTop: 270, safeBottom: 1920 - 270, footerBaseline: 1630, wordH: 42, gap: 64 },
  post: { margin: 80, safeTop: 96, safeBottom: 1350 - 72, footerBaseline: 1262, wordH: 38, gap: 56 },
  square: { margin: 72, safeTop: 80, safeBottom: 1080 - 64, footerBaseline: 1004, wordH: 34, gap: 48 },
};

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
    kickerSize: r(32),
    titleSize: r(66),
    subSize: r(34),
    statLabelSize: r(30),
    statValueSize: r(78),
    statUnitSize: r(34),
    quoteSizes: [r(52), r(48), r(44), r(40), r(36)],
    metaSize: r(32),
  };
}

// 記録のまとまり（高さ blockH）を、下のロゴの上に置く。文字の塊は安全な枠の中に入れる。
// 入らないとき fits=false（呼び出し側が一文を外して組み直す）。
// 空いた上の範囲（coverArea）には、写真でない地のとき表紙を置く。
export function placeRecordBlock(frame, blockH) {
  const bottom = frame.footerTop - frame.gap;
  const top = bottom - blockH;
  const fits = top >= frame.safeTop;
  return {
    top: Math.max(frame.safeTop, top),
    bottom,
    fits,
    coverArea: { top: frame.safeTop, bottom: Math.max(frame.safeTop, top - frame.gap) },
  };
}

// 数字の列: 3 つまでを等分に並べる（左そろえ）。
export function statColumns(frame, count) {
  const n = Math.max(1, Math.min(3, count));
  const width = (frame.W - frame.margin * 2) / n;
  return Array.from({ length: n }, (_, i) => ({ x: frame.margin + width * i, width }));
}

// ---------------------------------------------------------------- 共有の文

// 画像に入れたものだけ（記録の見出し・書名・一文）＋ #Orime ＋ URL。
export function buildRecordShareText({ record, quote = '', siteUrl = '' }) {
  const parts = [];
  if (record) {
    parts.push(record.titleIsBook ? `${record.kicker}『${record.title}』` : record.title);
  }
  const q = String(quote || '').trim();
  if (q) parts.push(q);
  parts.push('#Orime');
  const url = String(siteUrl || '').trim();
  if (url) parts.push(url);
  return parts.join('\n');
}
