// 🌱 初週オンボーディング（活性化）— 新規ユーザーを aha（メモ→想起が返ってくる）
// まで最短で運ぶためのチェックリスト状態。端末ローカルに保存（PII なし・軽量）。
//
// 4 ステップは全て既存の track() イベントと対応するので、analytics.js の track()
// 冒頭で markActivationFromEvent を呼ぶだけで自動的に進む（追加配線ほぼ不要）。
//   book_added     → 本を1冊追加
//   memo_added     → 気づきをメモ
//   review_opened  → 振り返りで想起を体験
//   status_changed → 本のステータスを進める

const KEY = 'orime-activation-v1';
const DISMISS_KEY = 'orime-activation-v1:dismiss';
export const ACTIVATION_STEPS = ['book', 'memo', 'review', 'status'];
const EVENT_TO_STEP = {
  book_added: 'book',
  memo_added: 'memo',
  review_opened: 'review',
  status_changed: 'status',
};

export function getActivation() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* ignore */ } }

export function markActivation(step) {
  if (!ACTIVATION_STEPS.includes(step)) return;
  const o = getActivation();
  if (o[step]) return;
  o[step] = true;
  save(o);
  try { window.dispatchEvent(new Event('orime-activation')); } catch { /* ignore */ }
}

// analytics.js の track() から呼ぶ（イベント名→ステップに変換）。
export function markActivationFromEvent(event) {
  const step = EVENT_TO_STEP[event];
  if (step) markActivation(step);
}

export function isActivationComplete() {
  const o = getActivation();
  return ACTIVATION_STEPS.every((s) => o[s]);
}

export function dismissActivation() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('orime-activation')); } catch { /* ignore */ }
}
export function isActivationDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
