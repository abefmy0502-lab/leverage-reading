// 🌱 初週オンボーディング（活性化）— 新規ユーザーを aha（メモ→想起が返ってくる）
// まで最短で運ぶための 3 ステップ（追加→メモ→想起体験）。端末ローカルに保存。
//
//   book_added → 本を1冊追加      （analytics track 経由で自動）
//   memo_added → 気づきをメモ       （analytics track 経由で自動）
//   review     → 振り返りで想起を体験 （Review.jsx が自分のメモ想起カードを
//                実際に1枚表示したときに markActivation('review') を直接呼ぶ。
//                タブを開いただけ＝偽陽性を避け、aha を体験して初めて完了）
//
// ※「本のステータスを進める」は aha（読んで終わりにしない＝メモ→想起）に
//   寄与しない単なる操作習熟のため、ステップから撤去（本田: 無駄を削る）。

const KEY = 'orime-activation-v1';
const DISMISS_KEY = 'orime-activation-v1:dismiss';
// 3 つ目は 2026-09-26 に review（想起体験）→ consult（相談で答えを受け取る）へ変更。
// 一番の価値「自分だけの相談相手」を初週の aha に据えるため。旧 review 完了済みの端末は
// ActivationChecklist 側で consult 完了扱いにして、チェックリストを再出現させない。
export const ACTIVATION_STEPS = ['book', 'memo', 'consult'];
const EVENT_TO_STEP = {
  book_added: 'book',
  memo_added: 'memo',
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

export function dismissActivation() {
  try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event('orime-activation')); } catch { /* ignore */ }
}
export function isActivationDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
