// 🔔📱 端末の中だけの「思い出しの通知」（2026-11-26 継続の点検）。
//
// なぜ: iPhone のアプリの通知（APNs）は鍵と Xcode の設定がそろうまで出せない（VITE_NATIVE_PUSH）。そのあいだ、
//   アプリを開かなくなった人を 3〜7 日目に呼び戻す手段が無かった。端末の中の通知（@capacitor/local-notifications）なら
//   サーバーも鍵も要らない。
//
// 決まり（押しつけない・思い出しの通知の約束と同じ「多くても週に 1 回」）:
//   - 本人が「通知を受け取る」を押したときだけ（端末の許可も本人が決める）。設定でいつでも止められる。
//   - アプリを開くたびに、先の予定を消して置き直す＝開いている人には届かない。開かなくなったときだけ、
//     3 日後・10 日後・24 日後に 1 通ずつ（間は 7 日・14 日）。
//   - 中身は自分の言葉のメモの一節（思い出しカードと同じ選び方・AI のまとめは出さない）。メモが無く読み始めていない人は、
//     本棚で待っている本。どちらも無ければ置かない。
//   - 届く時刻は端末の 20 時（夜の読書の前）。押すとアプリが開き、ホームの「また開いたときの 1 行」が出る。
//   - APNs の通知を使うビルド（VITE_NATIVE_PUSH=on）では使わない（2 重に届けない）。
//   - 行動の期限の日の朝 8 時にも 1 通（2026-11-27・planDeadlineReminders）。
//
// ⚠️ Capacitor の部品は Promise で返さない（箱 { plugin } で返す・capacitorPluginBox.test.js）。

import { Capacitor } from '@capacitor/core';
import { NATIVE_PUSH_ON } from './nativePush';
import { pickRecallMemo, pickFallbackMemo, memoExcerpt, isAiWritten } from './recall';

const ALL_IDS = () => [...REMINDER_IDS, ...DEADLINE_IDS];

export const LOCAL_REMINDER_KEY = 'orime.localReminder.v1';
export const REMINDER_IDS = [7101, 7102, 7103];
export const REMINDER_AFTER_DAYS = [3, 10, 24];
export const REMINDER_HOUR = 20;
// 🎯 行動の期限の通知（2026-11-27 体験した人の声「行動を決めても、アプリの外から呼び戻すものが無い」）:
//   期限の日の朝 8 時に 1 通（APNs の期限の通知と同じ約束・期限の日ごとにまとめる・近い 3 日まで・14 日先まで）。
//   本棚や行動が変わるたびに置き直す＝完了した行動・消した行動には届かない。
export const DEADLINE_IDS = [7111, 7112, 7113];
export const DEADLINE_HOUR = 8;
export const DEADLINE_AHEAD_DAYS = 14;

let available = null;
// この端末で使えるか（iPhone のアプリ・部品が入っている・APNs の通知を使わないビルド）。
export function isLocalReminderCapable() {
  if (available != null) return available;
  try {
    available = Capacitor.isNativePlatform() && !NATIVE_PUSH_ON && Capacitor.isPluginAvailable('LocalNotifications');
  } catch { available = false; }
  return available;
}

async function loadLN() {
  const mod = await import('@capacitor/local-notifications');
  return { plugin: mod.LocalNotifications };
}

export function isLocalReminderOn() {
  try { return localStorage.getItem(LOCAL_REMINDER_KEY) === '1'; } catch { return false; }
}
function setOn(on) {
  try { if (on) localStorage.setItem(LOCAL_REMINDER_KEY, '1'); else localStorage.removeItem(LOCAL_REMINDER_KEY); } catch { /* ignore */ }
}

// 'prompt' | 'granted' | 'denied' | 'unsupported'
export async function getLocalReminderPermission() {
  if (!isLocalReminderCapable()) return 'unsupported';
  try {
    const { plugin: LN } = await loadLN();
    const r = await LN.checkPermissions();
    const v = r?.display;
    return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'prompt';
  } catch { return 'unsupported'; }
}

// 通知を受け取る（必ずボタンを押した中で呼ぶ）。{ ok, reason }
export async function enableLocalReminder() {
  if (!isLocalReminderCapable()) return { ok: false, reason: 'unsupported' };
  try {
    const { plugin: LN } = await loadLN();
    const r = await LN.requestPermissions();
    if (r?.display !== 'granted') return { ok: false, reason: 'denied' };
    setOn(true);
    return { ok: true };
  } catch { return { ok: false, reason: 'error' }; }
}

export async function disableLocalReminder() {
  setOn(false);
  if (!isLocalReminderCapable()) return;
  try {
    const { plugin: LN } = await loadLN();
    await LN.cancel({ notifications: ALL_IDS().map((id) => ({ id })) });
  } catch { /* ignore */ }
}

// 届ける中身を決める（純関数・テストあり）。{ title, body, kind } か null。
//   memos: [{ id, bookId, text, createdAt, lastRecalledAt?, recallCount?, sourceType? }]
//   books: [{ id, title, status, archivedAt? }]
export function planReminders({ now = Date.now(), memos = [], books = [] } = {}) {
  const own = (Array.isArray(memos) ? memos : []).filter((m) => m && String(m.text || '').trim() && !isAiWritten(m)
    && Number.isFinite(new Date(m.createdAt).getTime()));
  const out = [];
  const used = new Set();
  REMINDER_AFTER_DAYS.forEach((days, i) => {
    const at = new Date(now + days * 86400000);
    at.setHours(REMINDER_HOUR, 0, 0, 0);
    const fireAt = at.getTime();
    if (own.length) {
      const pool = own.filter((m) => !used.has(m.id));
      const pick = pickRecallMemo(pool, { now: fireAt, minAgeDays: 1, seed: i + 1 }) || pickFallbackMemo(pool, { now: fireAt, minAgeDays: 0, seed: i + 1 }) || pool[0];
      if (!pick) return;
      used.add(pick.id);
      // 題に本の名前（本が何百冊もあると、どの本のメモか分からない・2026-11-26 体験した人の声）
      const book = (Array.isArray(books) ? books : []).find((b) => b && b.id === pick.bookId);
      const title = book?.title ? `『${String(book.title).slice(0, 30)}』のメモ` : '前に書いたメモ';
      out.push({ id: REMINDER_IDS[i], at: fireAt, kind: 'memo', title, body: memoExcerpt(pick.text, 80) });
      return;
    }
    const waiting = (Array.isArray(books) ? books : []).filter((b) => b && b.title && !b.archivedAt && (b.status === 'before' || b.status === 'want'));
    if (i === 0 && waiting.length) {
      // メモがまだ無い人には 1 通だけ（同じ本を何度も知らせない）
      out.push({ id: REMINDER_IDS[i], at: fireAt, kind: 'book', title: '本棚で待っている本', body: `『${String(waiting[0].title).slice(0, 60)}』` });
    }
  });
  return out;
}

// 期限の日の朝の通知（純関数・テストあり）。books: [{ id, title, archivedAt?, actions: [{ text, deadline 'YYYY-MM-DD', done }] }]
export function planDeadlineReminders({ now = Date.now(), books = [] } = {}) {
  const byDay = new Map();
  for (const b of Array.isArray(books) ? books : []) {
    if (!b || b.archivedAt) continue;
    for (const a of Array.isArray(b.actions) ? b.actions : []) {
      const text = String(a?.text || '').trim();
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a?.deadline || ''));
      if (!a || a.done || !text || !m) continue;
      const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), DEADLINE_HOUR, 0, 0, 0).getTime();
      if (!(at > now) || at - now > DEADLINE_AHEAD_DAYS * 86400000) continue;
      const list = byDay.get(at) || [];
      list.push(text);
      byDay.set(at, list);
    }
  }
  return [...byDay.entries()].sort((x, y) => x[0] - y[0]).slice(0, DEADLINE_IDS.length).map(([at, texts], i) => ({
    id: DEADLINE_IDS[i], at, kind: 'deadline', title: '今日が期限の行動',
    body: `「${memoExcerpt(texts[0], 60)}」${texts.length > 1 ? ` ほか ${texts.length - 1} 件` : ''}`,
  }));
}

// 直前に置いたときのメモ（本棚や行動が変わったときに、メモを読み直さずに置き直す）
let lastMemos = null; // null＝この回はまだメモを読んでいない（メモの通知には触らない）

// アプリを開いたとき・本棚や行動が変わったとき: 先の予定を消して置き直す（開いている人には届かない）。オンでなければ何もしない。
//   memos を渡さなければ、直前に置いたときのメモを使う。
export async function rescheduleLocalReminders({ memos = null, books = [], now = Date.now() } = {}) {
  if (!isLocalReminderCapable() || !isLocalReminderOn()) return false;
  if (Array.isArray(memos)) lastMemos = memos;
  try {
    const { plugin: LN } = await loadLN();
    const perm = await LN.checkPermissions();
    if (perm?.display !== 'granted') return false;
    // メモをまだ読んでいない回（ホームを開く前に本棚が変わった）は、期限の通知だけを置き直す（前に置いたメモの通知を消さない）。
    const memosKnown = Array.isArray(lastMemos);
    await LN.cancel({ notifications: (memosKnown ? ALL_IDS() : DEADLINE_IDS).map((id) => ({ id })) }).catch(() => {});
    const plan = [...(memosKnown ? planReminders({ now, memos: lastMemos, books }) : []), ...planDeadlineReminders({ now, books })];
    if (!plan.length) return true;
    await LN.schedule({
      notifications: plan.map((p) => ({
        id: p.id, title: p.title, body: p.body,
        schedule: { at: new Date(p.at), allowWhileIdle: true },
        extra: { url: p.kind === 'deadline' ? '/?tab=review&sub=action' : '/', kind: `local_${p.kind}` },
      })),
    });
    return true;
  } catch { return false; }
}
