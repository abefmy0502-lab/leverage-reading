// 📊 利用状況の記録（ファーストパーティ計測） — track()
//
// ローンチ後の「磨きの優先順位」を実データで決めるための最小限の計測。
// 思想（CLAUDE.md）厳守: プライバシー最優先・静か・fail-silent・既存挙動非破壊。
//
// 設計の絶対原則:
//   1. ファーストパーティのみ — 自前 Supabase（analytics_events）にだけ書く。
//      外部トラッカー / 外部ドメインへの送信は一切なし（CSP 変更不要）。
//   2. PII を絶対に送らない — 送るのは「イベント名 ＋ 小さな enum/数値カウント」だけ。
//      メモ本文・書名・著者・メール・検索語・自由入力は構造的に入らない
//      （下の sanitizeProps が number/boolean/短い文字列だけ通す）。
//   3. fire-and-forget・never throws・never blocks — 呼び出し側を一切ブロックしない。
//      未設定 / 未ログイン / オプトアウト / テーブル未適用（schema error）は
//      静かに no-op。track() は同期処理上で await されない前提（Promise を投げ捨て）。
//   4. オプトアウト可 — 設定でオフにできる（localStorage `orime-analytics-optout`）。

import { supabase, isSupabaseConfigured } from './supabase';
import { markActivationFromEvent } from './activation';

const OPTOUT_KEY = 'orime-analytics-optout';

// ── オプトアウト状態（localStorage） ───────────────────────────────────────
// 既定は ON（記録する）。明示的に 'true' が入っているときだけオフ。

export function isAnalyticsOptedOut() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(OPTOUT_KEY) === 'true';
  } catch {
    // localStorage が使えない環境（プライベートブラウズ等）は「オフではない」扱い。
    return false;
  }
}

export function setAnalyticsOptOut(optedOut) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (optedOut) localStorage.setItem(OPTOUT_KEY, 'true');
    else localStorage.removeItem(OPTOUT_KEY);
  } catch {
    /* 永続化できなくても UI は壊さない（静かに無視）。 */
  }
}

// ── props サニタイズ（PII を構造的に排除） ─────────────────────────────────
// 通すのは:
//   - 有限な number
//   - boolean
//   - 短い文字列（<= 32 字。enum / ステータス / プラン名 等のみを想定）
// それ以外（オブジェクト・配列・長い文字列・NaN/Infinity・null/undefined）は捨てる。
// → 自由入力・本文・書名は「長すぎる or 型が違う」ので構造的に入り込めない。

const MAX_PROP_VALUE_LEN = 32;
const MAX_PROP_KEYS = 12;

function sanitizeProps(props) {
  const out = {};
  if (!props || typeof props !== 'object') return out;
  let count = 0;
  for (const key of Object.keys(props)) {
    if (count >= MAX_PROP_KEYS) break;
    if (typeof key !== 'string' || key.length === 0 || key.length > 32) continue;
    const v = props[key];
    if (typeof v === 'number') {
      if (Number.isFinite(v)) { out[key] = v; count += 1; }
      continue;
    }
    if (typeof v === 'boolean') { out[key] = v; count += 1; continue; }
    if (typeof v === 'string') {
      // 短い enum 値だけ通す。長い文字列（本文・自由入力）は丸ごと捨てる。
      if (v.length > 0 && v.length <= MAX_PROP_VALUE_LEN) { out[key] = v; count += 1; }
      continue;
    }
    // object / array / null / undefined / function などは通さない。
  }
  return out;
}

function sanitizeEventName(event) {
  if (typeof event !== 'string') return '';
  return event.slice(0, 64);
}

// ── getSession の軽量キャッシュ ───────────────────────────────────────────
// 低頻度イベント前提だが、起動直後や連続イベントで getSession を毎回叩かない
// よう短時間だけ user_id をキャッシュ（任意の最適化。失敗時は素直に再取得）。
let cachedUserId = null;
let cachedAt = 0;
const SESSION_CACHE_MS = 60_000;

async function resolveUserId() {
  const now = Date.now();
  if (cachedUserId && now - cachedAt < SESSION_CACHE_MS) return cachedUserId;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id || null;
    cachedUserId = uid;
    cachedAt = now;
    return uid;
  } catch {
    return null;
  }
}

// ── track(event, props) ───────────────────────────────────────────────────
// fire-and-forget。戻り値（Promise）を待つ必要はない。例外は外に出さない。
export function track(event, props = {}) {
  // 同期パスを一切ブロックしないため、本体は次の tick に逃がす。
  try {
    // 🌱 初週オンボーディングの進捗は計測オプトアウトに関係なく端末ローカルで記録。
    try { markActivationFromEvent(event); } catch { /* ignore */ }
    if (!isSupabaseConfigured || !supabase) return;
    if (isAnalyticsOptedOut()) return;
    const name = sanitizeEventName(event);
    if (!name) return;
    const safeProps = sanitizeProps(props);

    Promise.resolve().then(async () => {
      try {
        const userId = await resolveUserId();
        if (!userId) return; // 未ログインは静かに no-op。
        await supabase
          .from('analytics_events')
          .insert({ user_id: userId, event: name, props: safeProps });
        // テーブル未適用（schema error）・RLS 拒否・ネットワーク失敗はすべて
        // 握りつぶす（fail-silent）。計測の失敗で UX を壊さない。
      } catch {
        /* swallow */
      }
    });
  } catch {
    /* 同期パスでも絶対に throw しない。 */
  }
}

// ── イベント名の taxonomy 定数（company/analytics-plan.md と一致させる） ─────
// 文字列直書きでも動くが、配線箇所のタイポ防止に定数を使うことを推奨。
export const EVENTS = {
  APP_OPEN: 'app_open',
  BOOK_ADDED: 'book_added',
  STATUS_CHANGED: 'status_changed',
  MEMO_ADDED: 'memo_added',
  PAYWALL_VIEWED: 'paywall_viewed',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  PUSH_ENABLED: 'push_enabled',
  READING_PROGRESS_SET: 'reading_progress_set',
  EXPORT_USED: 'export_used',
  AI_USED: 'ai_used',
  REVIEW_OPENED: 'review_opened',
  RECORD_OPENED: 'record_opened', // 振り返り「📊 記録」サブタブの表示
  RECALL_SHOWN: 'recall_shown', // 本物の想起カード表示（当日メモのプレビュー除く）— 初週想起体験率の分子
  ACTION_COMPLETED: 'action_completed',
  SHARE_CARD: 'share_card', // 写真で共有・一文カードをシェア／保存（props: kind（record / stats / line）/ style / format / via / subject（book / month / year）だけ・本文や書名は送らない）
  PUSH_OPENED: 'push_opened', // 通知を押してアプリを開いた（props: kind（recall / action_deadline）だけ・2026-10-10）
  ACTION_ADDED: 'action_added', // 行動を足した（props: source（consult / memo / manual）だけ・2026-10-10）
  FOCUS_DONE: 'focus_done', // 読む（集中モード）をおえた（props: mode（timer / count）/ minutes（区分）だけ・2026-10-10）
  RECALL_ANSWERED: 'recall_answered', // 思い出しカードに答えた（props: mastered（覚えた＝true）だけ・2026-10-10）
  SHARE_SOURCE: 'share_source', // 「写真で共有」の選ぶシートで選んだ背景（props: source（camera / album / none）だけ・2026-10-11）
  SHARE_NUDGE: 'share_nudge', // ホームの「◯月の読書を、1 枚の画像に」の 1 行（props: kind（month / year）/ action（open / dismiss）だけ・2026-10-08）
};

// ── 区分（そのままの数を送らず、まとまりで送る・2026-10-10） ───────────────────
// メモの件数の区分（checkout_started の memos など）。数えていない・分からないときは 'unknown'。
export function memoCountBucket(n) {
  if (n == null || n === '') return 'unknown';
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 'unknown';
  if (v === 0) return '0';
  if (v < 3) return '1-2';
  if (v < 10) return '3-9';
  if (v < 30) return '10-29';
  return '30+';
}
// 読んだ時間（秒）の区分（focus_done の minutes）。
export function minutesBucket(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return 'unknown';
  const m = s / 60;
  if (m < 5) return '<5';
  if (m < 15) return '5-14';
  if (m < 30) return '15-29';
  if (m < 60) return '30-59';
  return '60+';
}

// ── app_open（起動と、前面に戻ったとき・2026-10-10） ─────────────────────────
// 起動のたびに 1 回（trigger: 'launch'）。前面に戻ったとき（trigger: 'foreground'）は、その端末の日付で
// まだ app_open を送っていない日だけ（＝前面に戻るのは 1 日に多くても 1 回）。
const APP_OPEN_DAY_KEY = 'orime.analytics.appOpenDay';
function localDayKey(now = Date.now()) {
  const d = new Date(now);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function shouldTrackAppOpen(trigger, { now = Date.now(), storage } = {}) {
  let ls = storage;
  try { if (ls === undefined && typeof localStorage !== 'undefined') ls = localStorage; } catch { ls = null; }
  const today = localDayKey(now);
  let last = null;
  try { last = ls ? ls.getItem(APP_OPEN_DAY_KEY) : null; } catch { last = null; }
  const ok = trigger === 'launch' || last !== today;
  if (ok) { try { ls?.setItem(APP_OPEN_DAY_KEY, today); } catch { /* 覚えられなくても送るだけ */ } }
  return ok;
}
export function trackAppOpen(trigger = 'launch', opts) {
  try {
    if (shouldTrackAppOpen(trigger, opts)) track(EVENTS.APP_OPEN, { trigger });
  } catch { /* never throw */ }
}
