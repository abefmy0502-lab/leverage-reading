// ⏱ 集中モード（読書の時間）の数え方（2026-10-09 オーナー「時間を決めて読書する」・本田直之さんの考え）。
//
// 時間は「始めた時刻から数え直す」（タイマーの setInterval を足していかない）。アプリを裏に回しても、
// 端末が眠っても、戻ったときに Date.now() から正しく出し直せる。一時停止は止めた時刻と止めていた合計で持つ。
//
// 状態（端末に保存する形・すべて ms の時刻）:
//   { bookId, mode: 'timer' | 'count', startedAt, pausedAt: null | ms, pausedMs, durationSec: タイマーの長さ（計測は null） }
// 画面の数字は分単位（秒は出さない＝ちらつかせない）。タイマーは残りを切り上げ、計測は経った分を切り捨てる。
//
// 反ゲーミフィケーション: 連続日数・目標・順位・バッジは作らない。見せるのは「今日この本を何分読んだか」と
// 「この本でこれまで何分」だけ（作業量の可視化をしない 2026-06-26 の例外として、読書時間だけオーナー承認）。

export const FOCUS_MINUTES = [15, 30, 45, 60];
export const FOCUS_DEFAULT = { mode: 'timer', minutes: 30 };
// 1 回の記録の下限（これより短いのは押し間違いとみなして残さない）と上限（つけっぱなしの夜を 1 回にしない）。
export const MIN_SESSION_SEC = 30;
export const MAX_SESSION_SEC = 6 * 3600;
// 途中の状態をこれより前に始めたものは、戻ってきても再開しない（前の日に置き忘れたもの）。
export const STALE_MS = 12 * 3600 * 1000;

const STATE_KEY = 'orime.focus.v1';
const PREFS_KEY = 'orime.focus.prefs';

// ---------------------------------------------------------------- 時間の計算

// 始める。untilMs（「◯時◯分まで」・2026-10-10）を渡したタイマーは、長さ＝その時刻まで（秒・1 分〜6 時間）。
// 記録の形は今までどおりタイマー（mode 'timer'）で、画面に「18:45 まで」と出すために until を持つ。
export function startFocus({ bookId, mode, minutes, untilMs }, now = Date.now()) {
  const m = mode === 'count' ? 'count' : 'timer';
  if (m === 'timer' && Number.isFinite(untilMs)) {
    // 秒は切り上げ（四捨五入だと 10:48 が 10:47:59.6 になり「10:47 まで」と出ていた・2026-10-11）。
    // 表に出す時刻は、上限・下限で長さを変えなかったときは入れた時刻そのもの。
    const raw = (untilMs - now) / 1000;
    const sec = Math.min(MAX_SESSION_SEC, Math.max(60, Math.ceil(raw)));
    const until = sec === Math.ceil(raw) ? untilMs : now + sec * 1000;
    return { bookId, mode: m, startedAt: now, pausedAt: null, pausedMs: 0, durationSec: sec, until };
  }
  const min = FOCUS_MINUTES.includes(Number(minutes)) ? Number(minutes) : FOCUS_DEFAULT.minutes;
  return { bookId, mode: m, startedAt: now, pausedAt: null, pausedMs: 0, durationSec: m === 'timer' ? min * 60 : null };
}

// ---------------------------------------------------------------- 「◯時◯分まで」（2026-10-10 オーナー「電車で乗り換えの駅まで」）

// 時刻の既定: いまから 20 分後を、次の 5 分の区切りに切り上げる（18:23 → 18:45）。"HH:MM"。
export const UNTIL_DEFAULT_AHEAD_MIN = 20;
export function defaultUntilTime(now = Date.now()) {
  const step = 5 * 60 * 1000;
  const t = Math.ceil((now + UNTIL_DEFAULT_AHEAD_MIN * 60 * 1000) / step) * step;
  return fmtClock(t);
}

// "18:45"（端末の時刻・24 時間）。
export function fmtClock(ms) {
  // いちばん近い分に丸める（前の版で保存した 10:47:59.6 のような途中の状態も 10:48 と出す）。
  const d = new Date(Math.round(ms / 60000) * 60000);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// "HH:MM" → その時刻の次に来る時刻（ms・いま以前なら次の日）。読めなければ null。
// 23:50 に 00:20 を選んだら 30 分後（日付をまたぐ）。
export function untilToMs(hhmm, now = Date.now()) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const d = new Date(now);
  let t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi).getTime();
  if (t <= now) t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, h, mi).getTime();
  return t;
}

// 選んだ時刻を確かめる。
//   { ok: true, untilMs, minutes }        … minutes は残りの分（切り上げ）
//   { ok: false, error: 'empty' | 'past' | 'tooLong', message }
// 12 時間より先になる時刻は「いまより前を選んだ」とみなす（18:00 に 17:30＝past）。
// 1 分未満も past。12 時間までで 6 時間を超えるものは tooLong（1 回 6 時間まで）。
export const UNTIL_MESSAGES = {
  empty: 'おわる時刻を選んでください',
  past: 'いまより後の時刻を選んでください',
  tooLong: '6 時間までの時刻を選んでください',
};
export function checkUntil(hhmm, now = Date.now()) {
  const untilMs = untilToMs(hhmm, now);
  if (untilMs == null) return { ok: false, error: 'empty', message: UNTIL_MESSAGES.empty };
  const diff = untilMs - now;
  if (diff < 60 * 1000 || diff > STALE_MS) return { ok: false, error: 'past', message: UNTIL_MESSAGES.past };
  if (diff > MAX_SESSION_SEC * 1000) return { ok: false, error: 'tooLong', message: UNTIL_MESSAGES.tooLong };
  return { ok: true, untilMs, minutes: Math.ceil(diff / 60000) };
}

// 読んでいた秒（一時停止を除く）。タイマーは長さで止める（終わったあとに裏で置いていた時間は数えない）。
export function elapsedSeconds(s, now = Date.now()) {
  if (!s || !Number.isFinite(s.startedAt)) return 0;
  const end = Number.isFinite(s.pausedAt) ? s.pausedAt : now;
  const raw = Math.max(0, Math.floor((end - s.startedAt - (s.pausedMs || 0)) / 1000));
  const capped = Math.min(raw, MAX_SESSION_SEC);
  return s.mode === 'timer' && Number.isFinite(s.durationSec) ? Math.min(capped, s.durationSec) : capped;
}

export function remainingSeconds(s, now = Date.now()) {
  if (!s || s.mode !== 'timer' || !Number.isFinite(s.durationSec)) return null;
  return Math.max(0, s.durationSec - elapsedSeconds(s, now));
}

export function isTimerDone(s, now = Date.now()) {
  return !!s && s.mode === 'timer' && remainingSeconds(s, now) === 0;
}

// タイマーの進み（0〜1・輪は 1 − これ＝残りの割合で描く）。
export function timerProgress(s, now = Date.now()) {
  if (!s || s.mode !== 'timer' || !s.durationSec) return 0;
  return Math.min(1, elapsedSeconds(s, now) / s.durationSec);
}

export function pauseFocus(s, now = Date.now()) {
  if (!s || Number.isFinite(s.pausedAt)) return s;
  return { ...s, pausedAt: now };
}

export function resumeFocus(s, now = Date.now()) {
  if (!s || !Number.isFinite(s.pausedAt)) return s;
  return { ...s, pausedAt: null, pausedMs: (s.pausedMs || 0) + Math.max(0, now - s.pausedAt) };
}

// タイマーが終わったあとの「続けて読む」: 計測に切り替えて、タイマーの長さから続ける
// （終わってから押すまでに置いていた時間は数えない＝止めていた時間に足す）。
export function continueAsCount(s, now = Date.now()) {
  if (!s) return s;
  const base = resumeFocus(s, now);
  const raw = Math.max(0, Math.floor((now - base.startedAt - (base.pausedMs || 0)) / 1000));
  const read = elapsedSeconds(base, now);
  const idleMs = Math.max(0, raw - read) * 1000;
  return { ...base, mode: 'count', durationSec: null, pausedMs: (base.pausedMs || 0) + idleMs };
}

// 画面の大きな数字。タイマー＝残り（切り上げ）、計測＝経った分（切り捨て）。
// 戻り値: { hours, minutes }（60 分未満は hours 0）。
export function displayMinutes(s, now = Date.now()) {
  if (!s) return { hours: 0, minutes: 0 };
  const total = s.mode === 'timer'
    ? Math.ceil((remainingSeconds(s, now) || 0) / 60)
    : Math.floor(elapsedSeconds(s, now) / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

// 記録する 1 行（短すぎる・始まっていないときは null）。
// おわりの時刻は「読んでいた時間のおわり」（タイマーが終わってから置いていた時間・6 時間を超えた分は含めない
// ＝日付をまたいだときに、その日の分を正しく分けられるように）。
export function sessionRow(s, now = Date.now()) {
  const seconds = elapsedSeconds(s, now);
  if (!s?.bookId || seconds < MIN_SESSION_SEC) return null;
  const stopMs = Number.isFinite(s.pausedAt) ? s.pausedAt : now;
  const readEndMs = s.startedAt + (s.pausedMs || 0) + seconds * 1000;
  const endMs = Math.min(stopMs, Math.max(readEndMs, s.startedAt));
  return {
    book_id: s.bookId,
    started_at: new Date(s.startedAt).toISOString(),
    ended_at: new Date(Math.max(endMs, s.startedAt)).toISOString(),
    seconds,
    mode: s.mode === 'count' ? 'count' : 'timer',
  };
}

// ---------------------------------------------------------------- 合計

// 端末の暦の日（YYYY-MM-DD）。
export function localDay(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 端末の暦のその日の 0 時と次の日の 0 時（ms）。
export function dayRange(now = Date.now()) {
  const d = new Date(now);
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return { from, to };
}

// 1 回分のうち [from, to) に入る秒。日付をまたいだ回（23:50〜0:30）は、始めてからおわるまでの間に
// 読んだ秒を時刻の割合で分ける（一時停止の時間は回の中で均して数える）。おわりが無い・同じ時刻なら始めた時刻で決める。
export function secondsWithin(r, from, to) {
  const sec = Math.max(0, Number(r?.seconds) || 0);
  const st = Date.parse(r?.started_at);
  if (!sec || !Number.isFinite(st)) return 0;
  const en = Date.parse(r?.ended_at);
  if (!Number.isFinite(en) || en <= st) return st >= from && st < to ? sec : 0;
  const overlap = Math.max(0, Math.min(en, to) - Math.max(st, from));
  if (overlap <= 0) return 0;
  if (overlap >= en - st) return sec;
  return Math.round((sec * overlap) / (en - st));
}

// その日（端末の日付）のこの本の合計秒。日付をまたいだ回は、その日に入る分だけを数える。
export function todaySeconds(rows, bookId, now = Date.now()) {
  const { from, to } = dayRange(now);
  return (rows || []).reduce((sum, r) => (r && r.book_id === bookId ? sum + secondsWithin(r, from, to) : sum), 0);
}

export function totalSeconds(rows, bookId) {
  return (rows || []).reduce((sum, r) => (r && r.book_id === bookId ? sum + (Number(r.seconds) || 0) : sum), 0);
}

// 「32 分」「1 時間 5 分」「3 時間」。30 秒以上 1 分未満は「1 分」（記録するのは 30 秒から）。
export function fmtDuration(sec) {
  const s = Math.max(0, Number(sec) || 0);
  if (s <= 0) return '0 分';
  const m = Math.max(1, Math.round(s / 60));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r} 分`;
  return r ? `${h} 時間 ${r} 分` : `${h} 時間`;
}

// 写真で共有（雑誌）の下の行の短い数の欄。今日この本を読んでいなければ null（出さない）。
export function shareReadingNote(rows, bookId, now = Date.now()) {
  const sec = bookId ? todaySeconds(rows, bookId, now) : 0;
  return sec >= MIN_SESSION_SEC ? { label: '読書', value: fmtDuration(sec) } : null;
}

// ---------------------------------------------------------------- 端末に覚える（途中の状態・前回の選び方）

function storage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function saveFocusState(s, store = storage()) {
  try {
    if (!store) return;
    if (s) store.setItem(STATE_KEY, JSON.stringify(s));
    else store.removeItem(STATE_KEY);
  } catch { /* 保存できなくても数えるのは続ける */ }
}

// 途中の状態を読むだけ（古さは見ない・消さない）。壊れていれば null。
export function readFocusState(store = storage()) {
  try {
    const raw = store?.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.bookId !== 'string' || !Number.isFinite(s.startedAt) || !['timer', 'count'].includes(s.mode)) return null;
    return { ...s, pausedAt: Number.isFinite(s.pausedAt) ? s.pausedAt : null, pausedMs: Number(s.pausedMs) || 0 };
  } catch {
    return null;
  }
}

// 途中の状態を読む（壊れている・古すぎるものは捨てる）。
// 古すぎる（12 時間より前に始めた）ものは、捨てる前に 1 回分として onStale(row) に渡す
// （タイマーは長さまで・計測は 6 時間まで＝sessionRow の決まりどおり）。消してから渡すので 1 回だけ。
export function loadFocusState(now = Date.now(), store = storage(), { onStale } = {}) {
  try {
    const s = readFocusState(store);
    if (!s) {
      if (store?.getItem(STATE_KEY)) store.removeItem(STATE_KEY);
      return null;
    }
    if (s.startedAt > now + 60_000) { store.removeItem(STATE_KEY); return null; }
    if (now - s.startedAt > STALE_MS) {
      store.removeItem(STATE_KEY);
      const row = sessionRow(s, now);
      if (row && typeof onStale === 'function') {
        try { onStale(row); } catch { /* 残せなくても再開はしない */ }
      }
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

// until: 前回「時刻」を選んだか（時刻そのものは覚えない＝次はまた いま＋20 分 を既定に）。
export function loadFocusPrefs(store = storage()) {
  try {
    const p = JSON.parse(store?.getItem(PREFS_KEY) || 'null');
    if (!p) return { ...FOCUS_DEFAULT, until: false, remembered: false };
    return {
      mode: p.mode === 'count' ? 'count' : 'timer',
      minutes: FOCUS_MINUTES.includes(Number(p.minutes)) ? Number(p.minutes) : FOCUS_DEFAULT.minutes,
      until: p.until === true,
      remembered: true,
    };
  } catch {
    return { ...FOCUS_DEFAULT, until: false, remembered: false };
  }
}

export function saveFocusPrefs({ mode, minutes, until = false }, store = storage()) {
  try { store?.setItem(PREFS_KEY, JSON.stringify({ mode, minutes, until: !!until })); } catch { /* ignore */ }
}
