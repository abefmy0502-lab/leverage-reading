// 🎯 相談の答えから「行動に追加」したかどうか（2026-10-09・初めて使う人の目での点検）。
//
// 以前は追加したことを画面の中（ChatMessage の state）だけで覚えていたので、過去の相談・「この続きを相談する」で
// 同じ答えを開き直すと、また「行動に追加」が出て同じ行動が 2 件入っていた。
// 表は変えずに、次の 2 つで判定する:
//   ①いまある行動の中に、この答えの一歩から作る文と同じ文の行動がある（どの端末で足しても分かる）
//   ②この端末で、この答え（chat_messages の id）から足したと覚えている（本を選んで足したときに文を直した場合の控え）
// どちらかなら「行動に追加済み」を出して押せないようにする。

const STORAGE_KEY = 'orime.consult.actionAdded.v1';
const MAX_REMEMBERED = 300;

// 比べるための形: 空白・句点・感嘆符を除いて、全角英数を半角に（言い回しの小さな揺れで別物にしない）。
export function normActionText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(/[\s 　]+/g, '')
    .replace(/[。．.！!]+$/g, '')
    .trim();
}

// この一歩と同じ文の行動（あれば最初の 1 件）。保存時に文字数で切られた行も、頭が一致すれば同じとみなす。
export function findAddedAction(actions, actionText) {
  const key = normActionText(actionText);
  if (!key || !Array.isArray(actions)) return null;
  for (const a of actions) {
    const t = normActionText(a?.text);
    if (!t) continue;
    if (t === key) return a;
    // 500 字で切られて保存された長い一歩（どちらかが 40 字以上で、短いほうがもう一方の頭）。
    if (t.length >= 40 && key.length >= 40 && (key.startsWith(t) || t.startsWith(key))) return a;
  }
  return null;
}

// 覚えている形: [{ id: 答えの id, text: 足した行動の文 }]（前の版は id の文字列だけ）。
function readEntries() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v
      .map((x) => (typeof x === 'string' ? { id: x, text: '' } : (x && typeof x.id === 'string' ? { id: x.id, text: typeof x.text === 'string' ? x.text : '' } : null)))
      .filter(Boolean);
  } catch {
    return [];
  }
}
function writeEntries(list) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_REMEMBERED)));
  } catch { /* 覚えられなくても、①の文の一致で分かる */ }
}
const findEntry = (answerId) => (answerId ? readEntries().find((e) => e.id === String(answerId)) || null : null);

// この端末で、この答えから行動を足したと覚えているか（行動の一覧と突き合わせない）。
export function wasAnswerActionAdded(answerId) {
  return !!findEntry(answerId);
}

// この答えから行動を足したことを覚える（足した行動の文も・新しいものを後ろに・多すぎたら古いものから捨てる）。
export function rememberAnswerActionAdded(answerId, actionText = '') {
  if (!answerId) return;
  const id = String(answerId);
  writeEntries([...readEntries().filter((e) => e.id !== id), { id, text: String(actionText || '') }]);
}

export function forgetAnswerActionAdded(answerId) {
  if (!answerId) return;
  const id = String(answerId);
  const list = readEntries();
  if (list.some((e) => e.id === id)) writeEntries(list.filter((e) => e.id !== id));
}

// まとめて判定（{ added, action }）。action は「見る」で行動の一覧のその行へ送るための目印に使う。
// actions が読めている（配列）ときは、いまある行動に一致するものがあるときだけ追加済み
// （覚えた答えでも、その行動を消していたら、もう一度足せる・2026-10-10）。
// 行動の一覧を読めていない（null）ときだけ、この端末で覚えた印で判定する。
export function answerActionStatus({ answerId, actionText, actions }) {
  const action = findAddedAction(actions, actionText);
  if (action) return { added: true, action };
  const entry = findEntry(answerId);
  if (!entry) return { added: false, action: null };
  if (!Array.isArray(actions)) return { added: true, action: null };
  const byText = entry.text ? findAddedAction(actions, entry.text) : null;
  if (byText) return { added: true, action: byText };
  return { added: false, action: null };
}
