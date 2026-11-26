// 🌙 また開いたときの 1 行（lib/returnMoments.js・2026-11-26）をホームで決める。
//
// - 前に開いた日は端末に覚える（`orime.lastVisit.v1:<利用者>`・日本時間の日付だけ）。アプリを開いたその回のはじめに 1 回だけ読み、
//   今日に書き換える（同じ回のうちにホームへ何度戻っても、前の日のまま＝1 行が消えたり出たりしない）。
// - もう出した印は `orime.returnMoment.v1:<利用者>`（新しい 20 件だけ）。出した時点で印を付ける（同じ日に何度も出さない）。
//   はじめて N の 1 行は、閉じるか押すまで（14 日のうち）出す。
// - メモはすべての本の検索と同じ控え（loadAllMemoRows）から読む＝新しい問い合わせを増やさない。
// - 読み終えるか MEMO_COUNT_WAIT_MS まで待って 1 回だけ決める（あとから差し込んでホームを押し下げない）。
// お試しモード: &lastvisit=5（前に開いたのが 5 日前）・&joined=90d（アカウントを作ったのが 90 日前）。

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { loadAllMemoRows, peekAllMemoRows } from './useAllMemoRows';
import { appNow } from '../lib/appNow';
import { isDemo } from '../lib/supabase';
import { anniversaryOf, pickReturnMoment, jstDay, dayDiff, BACK_AFTER_DAYS, dueActionOf } from '../lib/returnMoments';
import { track } from '../lib/analytics';
import { useReadingSessions } from './useReadingSessions';

const VISIT_KEY = 'orime.lastVisit.v1:';
const DONE_KEY = 'orime.returnMoment.v1:';

// その回（アプリを開いてから閉じるまで）の「前に開いた日」。利用者ごとに 1 回だけ決める。
const sessionPrev = new Map();
function prevVisitDay(userId, today) {
  if (sessionPrev.has(userId)) return sessionPrev.get(userId);
  let prev = null;
  try { prev = localStorage.getItem(VISIT_KEY + userId); } catch { /* ignore */ }
  if (isDemo) {
    const n = Number(new URLSearchParams(window.location.search).get('lastvisit'));
    if (Number.isFinite(n) && n > 0) prev = jstDay(Date.parse(`${today}T03:00:00Z`) - n * 86400000);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(prev || ''))) prev = null;
  sessionPrev.set(userId, prev);
  try { localStorage.setItem(VISIT_KEY + userId, today); } catch { /* ignore */ }
  return prev;
}
function readDone(userId) {
  try { const v = JSON.parse(localStorage.getItem(DONE_KEY + userId) || '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); }
}
function markDone(userId, key) {
  if (!userId || !key) return;
  try {
    const list = [...readDone(userId)].filter((k) => k !== key);
    list.push(key);
    localStorage.setItem(DONE_KEY + userId, JSON.stringify(list.slice(-20)));
  } catch { /* ignore */ }
}

const toMemo = (r) => ({ id: r.id, bookId: r.book_id, text: r.text || '', createdAt: r.created_at, sourceType: r.source_type || null });

// 戻り値: { ready, moment, close(action) }。moment が null なら出さない。
export function useReturnMoment(active, books, waitMs) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [now] = useState(() => appNow().getTime());
  const today = jstDay(now);
  const [prev] = useState(() => (userId ? prevVisitDay(userId, today) : null));
  const createdAt = user?.created_at || null;
  const [done] = useState(() => (userId ? readDone(userId) : new Set()));
  const ann = anniversaryOf(createdAt, now);
  const gap = dayDiff(prev, today);
  // 読みに行く必要があるか（はじめて N の 14 日のうち・3 日以上あけた日だけ）。
  const need = active && !!userId && ((ann && !done.has(ann.key)) || (gap != null && gap >= BACK_AFTER_DAYS && !done.has(`back:${today}`))
    || (!done.has(`act:${today}`) && !!dueActionOf(books, now)));
  const { rows: sessions } = useReadingSessions();
  const [rows, setRows] = useState(() => (userId ? peekAllMemoRows(userId) : null));
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!need || rows) return undefined;
    let alive = true;
    loadAllMemoRows(userId).then((r) => { if (alive) setRows(r?.rows || []); }).catch(() => { if (alive) setRows([]); });
    const t = setTimeout(() => { if (alive) setTimedOut(true); }, waitMs);
    return () => { alive = false; clearTimeout(t); };
  }, [need, userId]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !need || !!rows || timedOut;
  const [decided, setDecided] = useState(undefined);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!ready || decided !== undefined || !active) return;
    if (!need || !rows) { setDecided(null); return; }
    const bookIds = new Set((books || []).map((b) => b.id));
    const readSeconds = (sessions || []).reduce((sum, r) => sum + (Number(r?.seconds) || 0), 0);
    const m = pickReturnMoment({ now, createdAt, prevDay: prev, memos: rows.map(toMemo), bookIds, books, done, readSeconds });
    setDecided(m);
    if (m) {
      // 「おかえりなさい」は出した時点で今日の分を済ませる（同じ日にもう出さない）。はじめて N は閉じるか押すまで。
      if (m.kind === 'back' || m.kind === 'action') markDone(userId, m.key);
      // 見せたメモを覚える（次の 1 行で同じメモを繰り返さない）
      if (m.memo?.id) markDone(userId, `m:${m.memo.id}`);
      // 見せた本も覚える（はじめて N のたびに同じ本をすすめない・読みかけの本は続けて出してよい）
      if (m.book?.id && m.action !== 'focus') markDone(userId, `b:${m.book.id}`);
      if (m.book?.id && m.action === 'focus' && m.book.status !== 'reading') markDone(userId, `b:${m.book.id}`);
      // 節目で見せた読みかけの本（次の節目でも同じ本なら、ほかの本に替えてもよいと伝える）
      if (m.kind === 'anniv' && m.book?.id && m.book.status === 'reading') markDone(userId, `r:${m.book.id}`);
      track('return_moment', { kind: m.kind, action: 'shown', to: m.action, ...(m.kind === 'anniv' ? { days: Number(m.key.split(':')[1]) || 0 } : { gap: gap || 0 }) });
    }
  }, [ready, active]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = (action) => {
    if (decided) markDone(userId, decided.key);
    setClosed(true);
    track('return_moment', { kind: decided?.kind || 'none', action });
  };
  return { ready, moment: closed ? null : decided || null, close };
}
