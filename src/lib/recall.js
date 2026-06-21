// 🔄 想起（recall）の純ロジック共有モジュール。
//
// なぜ切り出すか:
//   - Review.jsx（クライアント / React）と api/push-cron.js（サーバー / Node）の
//     両方が「久しぶりに戻ってきたメモ」の文言・選定思想を必要とする。
//   - React 依存も Supabase 依存も持たない純関数だけをここに置くことで、
//     クライアントは ESM import、サーバーは（CommonJS でも）ロジックをミラーできる。
//
// ⚠️ このファイルは副作用ゼロ・I/O ゼロを厳守する（DRY 共有のため）。

// 経過時間を日本語の相対表現にする。
// 例: 90日前 → "3ヶ月前" / 5日前 → "5日前" / 30秒前 → "さっき"
export function relativeJa(iso, now = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return 'さっき';
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min}分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}時間前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}日前`;
  if (day < 30) return `${Math.floor(day / 7)}週間前`;
  if (day < 365) return `${Math.floor(day / 30)}ヶ月前`;
  return `${Math.floor(day / 365)}年前`;
}

// ランダム想起カード / 通知タイトル専用の "久しぶりに戻ってきた感" を出す一行。
// 例: 3ヶ月前のメモなら「3ヶ月前のあなたのメモ」。
// 今日書いたばかりのものは空文字（まだ「戻ってきた」感がないので抑制）。
export function recallFraming(iso, now = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const day = Math.floor((now - t) / 86400000);
  if (day < 1) return ''; // 今日書いたばかり — 想起のフレーズは出さない
  return `${relativeJa(iso, now)}のあなたのメモ`;
}

// メモ本文を通知本文向けに短く整える（制御文字除去 + 行頭結合 + clamp）。
export function memoExcerpt(text, max = 120) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

// 「忘れた頃に戻ってくる」想起メモを 1 件選ぶ純関数。
//
// notes: [{ id, text, createdAt }] の配列（新しい順でなくてよい）。
// 選定ポリシー（設計書 §3.3 MVP）:
//   ① 作成から minAgeDays 日以上前のメモのみ（最新は外す = 忘れた頃が肝）
//   ② 可能なら 1〜6 ヶ月前を優先（sweet spot）
//   ③ 本文が空のメモは除外
//   ④ 候補がゼロなら null（呼び出し側で「送らない」判断）
//
// 決定性のため seed を受け取る（同じ入力なら同じ結果。Cron の冪等性に寄与）。
export function pickRecallMemo(notes, { now = Date.now(), minAgeDays = 14, seed = 0 } = {}) {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  const minAgeMs = minAgeDays * 86400000;
  const sweetMin = 30 * 86400000; // 1ヶ月
  const sweetMax = 183 * 86400000; // 約6ヶ月

  const eligible = notes.filter((n) => {
    if (!n || !n.text || !String(n.text).trim()) return false;
    const t = new Date(n.createdAt).getTime();
    if (Number.isNaN(t)) return false;
    return now - t >= minAgeMs;
  });
  if (eligible.length === 0) return null;

  const sweet = eligible.filter((n) => {
    const age = now - new Date(n.createdAt).getTime();
    return age >= sweetMin && age <= sweetMax;
  });
  const pool = sweet.length > 0 ? sweet : eligible;

  // seed ベースの擬似ランダム（決定的）。
  const idx = Math.abs(Math.floor((seed * 9301 + 49297) % 233280)) % pool.length;
  return pool[idx] || pool[0];
}
