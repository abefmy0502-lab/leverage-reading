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
  // 通知本文はロック画面に出るため、改行・タブ等は空白化し、その他の制御文字・
  // 双方向制御 (RTL override)・ゼロ幅/不可視文字 (ZWSP / BOM) は除去する。
  const clean = String(text)
    // C0 制御 (NUL-US) + DEL + C1 制御 (0x80-0x9F)。
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    // 双方向制御 / ゼロ幅 / 不可視フォーマット (RTL override, ZWSP, BOM 等)。
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

// ── 間隔反復（spaced repetition / SM-2 lite）──────────────────────────
//
// なぜ間隔反復か:
//   人は覚えたてを一度見ただけでは忘れる（エビングハウスの忘却曲線）。
//   忘れかけた"ちょうど良いタイミング"で再想起すると定着が最大化される。
//   そこで「何回覚えたか（recall_count）」に応じて次の想起までの間隔を伸ばす。
//   1 回目は 1 日後、次は 3 日後…と広げることで、まだ危ういメモは頻繁に、
//   定着したメモは稀に戻す。純ランダムより「忘れた頃に戻す」を機械的に保証できる。
//
// 間隔（日）。recall_count を index にして参照する（上限はクランプ）。
// 例: count=0 → 1 日後 / count=2 → 7 日後 / count>=6 → 140 日後。
const RECALL_INTERVALS = [1, 3, 7, 16, 35, 70, 140];

// recall_count から「次の想起まで空けるべき日数」を返す。
export function dueGapDays(recallCount) {
  const i = Math.min(Math.max(0, recallCount || 0), RECALL_INTERVALS.length - 1);
  return RECALL_INTERVALS[i];
}

// 凝縮系ソース（まとめ / 自分の学びログ等の「凝縮された 1 枚」）は
// 想起 1 回あたりの価値が高いので、選定で軽くブーストする。
function isCondensedSource(sourceType) {
  return sourceType === 'summary' || sourceType === 'personal';
}

// 「忘れた頃に戻ってくる」想起メモを 1 件選ぶ純関数（間隔反復モデル）。
//
// notes: [{ id, text, createdAt, lastRecalledAt?, recallCount?, sourceType? }] の配列。
//   - lastRecalledAt / recallCount は DB 未適用だと undefined になりうる（→ null / 0 扱い）。
//   - 呼び出し側が select に last_recalled_at / recall_count / source_type を足すと本領を発揮する。
//
// due（＝今日想起して良い）判定:
//   ① lastRecalledAt が無い（未想起）→ 作成から minAgeDays 日以上経っていれば due。
//      （若すぎる=まだ記憶に新しいメモは出さない、という従来のガードを維持）
//   ② lastRecalledAt がある → 前回想起から dueGapDays(recallCount) 日以上経っていれば due。
//   まだ間隔が来ていないメモは候補から除外する。
//
// due な候補の中から 1 件を重み付けで選ぶ:
//   ① より長く overdue（想起予定を過ぎている）ものを優先 = 一番忘れかけを救う
//   ② recall_count が低い（まだ定着していない）ものを優先
//   ③ 凝縮系（summary / personal）を軽くブースト
//   スコア上位の少数から、seed で 1 件を決める（同じ日は同じ 1 枚 = 日替わり安定）。
//
// 候補がゼロなら null（呼び出し側で「出さない / 送らない」判断）。
export function pickRecallMemo(notes, { now = Date.now(), minAgeDays = 14, seed = 0 } = {}) {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  const minAgeMs = minAgeDays * 86400000;

  // due 判定 + スコア付け。overdue 日数をスコアの基軸（1 日 = 1 点）にし、
  // 定着度・凝縮度は「日数換算の小さなボーナス」で足す（overdue が主・他は微調整）。
  const candidates = [];
  for (const n of notes) {
    if (!n || !n.text || !String(n.text).trim()) continue;
    const created = new Date(n.createdAt).getTime();
    if (Number.isNaN(created)) continue;

    const count = n.recallCount || 0;
    const lastRecalled = n.lastRecalledAt ? new Date(n.lastRecalledAt).getTime() : null;

    // このメモが想起可能になる時刻。
    const dueTime =
      lastRecalled == null || Number.isNaN(lastRecalled)
        ? created + minAgeMs // 未想起: 作成から minAgeDays
        : lastRecalled + dueGapDays(count) * 86400000; // 想起済: 間隔スケジュール

    if (now < dueTime) continue; // まだ間隔が来ていない → 除外

    const overdueDays = (now - dueTime) / 86400000;
    let score = overdueDays; // ① 長く overdue なほど優先
    score += Math.max(0, 6 - count) * 2; // ② 未定着ほど優先（最大 +12 日相当）
    if (isCondensedSource(n.sourceType)) score += 5; // ③ 凝縮系を軽くブースト

    candidates.push({ note: n, score });
  }
  if (candidates.length === 0) return null;

  // スコア降順（同点は id で安定ソート = 決定的）。
  candidates.sort((a, b) => b.score - a.score || String(a.note.id).localeCompare(String(b.note.id)));

  // 上位少数からのみ日替わりで 1 枚選ぶ（最優先だけを毎日出すと単調になるため、
  // 上位プールの中で seed により回す）。プールは最大 5 件。
  const pool = candidates.slice(0, Math.min(5, candidates.length));
  const idx = Math.abs(Math.floor((seed * 9301 + 49297) % 233280)) % pool.length;
  return (pool[idx] || pool[0]).note;
}

// 想起カードのフィードバックで DB に書く patch を返す純関数。
//   - mastered=true（「覚えた」）: recall_count を +1（次の想起間隔が伸びる = 当面出さない）
//   - mastered=false（「もう一度」）: recall_count 据え置き（間隔[0]=1 日後に再登場）
// どちらも last_recalled_at を now に更新して「今日出した」ことを記録する。
// 呼び出し側:
//   supabase.from('book_memos').update(recallPatch(count, mastered)).eq('id', memoId)
export function recallPatch(currentCount, mastered) {
  return {
    last_recalled_at: new Date().toISOString(),
    recall_count: (currentCount || 0) + (mastered ? 1 : 0),
  };
}
