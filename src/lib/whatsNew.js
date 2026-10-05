// 🆕 新しくなったこと — 見た版を端末に覚え、更新したあとに 1 回だけ出すかを決める（2026-10-05）。
//
// - 見た版は localStorage（端末ごと・読めない／書けない端末では何もしない＝出さない側に倒す）
// - 新規の人（初回ガイドがまだ・本が 0 冊）には出さず、いまの版を見たことにする
// - 見た版を覚えていない今までの利用者（この仕組みより前から使っている人）には、いちばん新しい版だけ出す
// - Web の「新しい版があります」は、サーバーの release-notes.json（新しい版の中身）を network-first で読む

import { RELEASES, CURRENT_RELEASE_ID, WHERE_NAMES } from './releaseNotes';
import { isDemo } from './supabase';

export const WHATS_NEW_SEEN_KEY = 'orime.whatsnew.seen';
export const RELEASE_NOTES_URL = '/release-notes.json';

export function readSeenRelease() {
  try {
    const v = window.localStorage.getItem(WHATS_NEW_SEEN_KEY);
    return typeof v === 'string' && v ? v : null;
  } catch {
    return undefined; // 読めない（プライベートブラウズ・ブロック）: 出さない
  }
}

export function markReleaseSeen(id = CURRENT_RELEASE_ID) {
  if (!id) return;
  try {
    const prev = window.localStorage.getItem(WHATS_NEW_SEEN_KEY);
    // 古い版で上書きしない（設定から前の版を見ても、見た版は下げない）
    if (prev && compareReleaseId(prev, id) >= 0) return;
    window.localStorage.setItem(WHATS_NEW_SEEN_KEY, id);
  } catch { /* 書けない端末: 何もしない */ }
}

// 'YYYY-MM-DD'（同じ日の 2 つ目は '…b'）の比較。文字の並びがそのまま新旧になる。
export function compareReleaseId(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  if (x === y) return 0;
  return x > y ? 1 : -1;
}

// seenId より新しい版（新しい順）。
export function releasesNewerThan(releases, seenId) {
  const list = Array.isArray(releases) ? releases : [];
  if (!seenId) return list.slice();
  return list.filter((r) => compareReleaseId(r.id, seenId) > 0);
}

// 起動したときに、更新したあとのシートを出すかを決める（純粋な関数・テストあり）。
//   seenId:    端末に覚えた見た版（null＝覚えていない・undefined＝読めない）
//   isNewUser: はじめて使う人（初回ガイドがまだ・本が 0 冊）
// 返り値: { show: 出す版の配列（新しい順）, markSeen: いま見たことにする版 | null }
export function decideWhatsNew({ seenId, isNewUser, releases = RELEASES } = {}) {
  const list = Array.isArray(releases) ? releases : [];
  const current = list[0]?.id || null;
  if (!current || seenId === undefined) return { show: [], markSeen: null };
  if (seenId == null) {
    if (isNewUser) return { show: [], markSeen: current };
    // この仕組みより前から使っている人: いちばん新しい版だけ
    return { show: [list[0]], markSeen: null };
  }
  return { show: releasesNewerThan(list, seenId), markSeen: null };
}

// ── サーバーの release-notes.json（Web の新しい版の中身）を読む ──

const MAX_TEXT = 400;
const FIELDS = ['where', 'what', 'before', 'after', 'impact', 'intent'];

// 届いた中身を、画面に出せる形だけに絞る（文字だけ・長さを切る・欄のそろわない項目は捨てる）。
export function sanitizeReleases(data) {
  const raw = Array.isArray(data?.releases) ? data.releases : [];
  const out = [];
  for (const r of raw.slice(0, 50)) {
    if (!r || typeof r.id !== 'string' || !/^\d{4}-\d{2}-\d{2}[a-z]?$/.test(r.id)) continue;
    const items = (Array.isArray(r.items) ? r.items : [])
      .filter((it) => it && FIELDS.every((f) => typeof it[f] === 'string' && it[f].trim()))
      .slice(0, 20)
      .map((it) => Object.fromEntries(FIELDS.map((f) => [f, it[f].trim().slice(0, MAX_TEXT)])));
    if (!items.length) continue;
    out.push({ id: r.id, date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.id.slice(0, 10), items });
  }
  return out.sort((a, b) => compareReleaseId(b.id, a.id));
}

// アプリに入っている、いまの版の id。開発中のお試しモードだけ &bundle=2026-10-04 で「古いコードが動いている」形にできる
// （「新しい版があります」の「何が変わった？」を撮るため・本番では使わない）。
export function bundledReleaseId() {
  if (import.meta.env.DEV && isDemo) {
    try {
      const b = new URLSearchParams(window.location.search).get('bundle');
      if (b) return b;
    } catch { /* ignore */ }
  }
  return CURRENT_RELEASE_ID;
}

// 新しい版の「新しくなったこと」を読む。読めない・新しいものが無いときは []（バナーは今までどおり）。
export async function fetchUpcomingReleases({ fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return [];
  try {
    const res = await f(`${RELEASE_NOTES_URL}?t=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin' });
    if (!res || !res.ok) return [];
    const data = await res.json();
    return releasesNewerThan(sanitizeReleases(data), bundledReleaseId());
  } catch {
    return [];
  }
}

// 日付の見出し（「10月5日の更新」）。
export function releaseHeading(release) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(release?.date || release?.id || '');
  if (!m) return '更新';
  return `${Number(m[2])}月${Number(m[3])}日の更新`;
}

export { RELEASES, CURRENT_RELEASE_ID, WHERE_NAMES };
