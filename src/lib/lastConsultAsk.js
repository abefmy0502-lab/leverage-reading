// 💬 いちばん新しい相談の問い（有料プランの画面の「「…」の続きも、話せます。」に使う・2026-10-21 点検）。
//   メモが答えた相談は過去の相談に保存しないので、画面は前の（AI が答えた）相談の名前を出していた。
//   メモが答えた相談の問いをここに 30 分だけ覚え、有料プランの画面は先にこちらを見る。端末の中だけ。
const TTL_MS = 30 * 60 * 1000;
let mem = null; // { text, at }

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function rememberConsultAsk(text, now = Date.now()) {
  const t = clean(text);
  if (t.length < 12) return;
  mem = { text: t, at: now };
}

export function recentConsultAsk(now = Date.now()) {
  if (!mem || now - mem.at > TTL_MS) return '';
  return mem.text;
}

export function __resetConsultAskForTest() { mem = null; }
