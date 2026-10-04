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
// 例: 90日前 → "3 か月前" / 5日前 → "5 日前" / 30秒前 → "さっき"
// 表記は相談の「いちばん古いのは 4 か月前」（ai.js）と揃える: 「か月」・数字の前後に半角スペース。
export function relativeJa(iso, now = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return 'さっき';
  const min = Math.floor(diff / 60);
  if (min < 60) return `${min} 分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 時間前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 日前`;
  if (day < 30) return `${Math.floor(day / 7)} 週間前`;
  if (day < 365) return `${Math.floor(day / 30)} か月前`;
  return `${Math.floor(day / 365)} 年前`;
}

// ランダム想起カード / 通知タイトル専用の "久しぶりに戻ってきた感" を出す一行。
// 例: 3 か月前のメモなら「3 か月前のあなたのメモ」。
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

// AI が書いたもの（本の AI まとめ＝books.ai_summary）は思い出しカード・思い出しの通知に出さない。
// 思い出すのは自分の言葉だけ（2026-10-04 判断）。振り返りの一覧・検索には「AI まとめ」として残る。
// kind（振り返りの派生ノート）か sourceType（ai.js・通知の行）のどちらかで見分ける。
export const AI_WRITTEN_KINDS = Object.freeze(['ai_summary']);
export function isAiWritten(n) {
  if (!n) return false;
  return AI_WRITTEN_KINDS.includes(n.kind) || AI_WRITTEN_KINDS.includes(n.sourceType) || n.aiWritten === true;
}

// 本文が空・作成日が読めない・AI が書いたメモは想起の対象外（null）。
function isRecallable(n) {
  if (!n || !n.text || !String(n.text).trim()) return false;
  if (isAiWritten(n)) return false;
  return !Number.isNaN(new Date(n.createdAt).getTime());
}

// このメモが想起してよくなる時刻（ms）。対象外のメモは null。
//   - 未想起（lastRecalledAt が無い・読めない）: 作成から minAgeDays 日後
//   - 想起済: 前回想起した日（端末の日付）の 0 時から dueGapDays(recallCount) 日後
export function noteDueAt(n, { minAgeDays = 14 } = {}) {
  if (!isRecallable(n)) return null;
  const created = new Date(n.createdAt).getTime();
  const lastRecalled = n.lastRecalledAt ? new Date(n.lastRecalledAt).getTime() : null;
  if (lastRecalled == null || Number.isNaN(lastRecalled)) return created + minAgeDays * 86400000;
  // 思い出した日（端末の日付）の 0 時から数える（2026-10-04）。時刻のまま 24 時間後にすると、夜 21 時に
  // 「まだ覚えていない」と答えたメモは、知らせが「明日また出します」と言うのに翌朝には出なかった。
  const d = new Date(lastRecalled);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dueGapDays(n.recallCount || 0));
  return d.getTime();
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

  // due 判定 + スコア付け。overdue 日数をスコアの基軸（1 日 = 1 点）にし、
  // 定着度・凝縮度は「日数換算の小さなボーナス」で足す（overdue が主・他は微調整）。
  const candidates = [];
  for (const n of notes) {
    const dueTime = noteDueAt(n, { minAgeDays });
    if (dueTime == null) continue;
    const count = n.recallCount || 0;

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
//   - mastered=false（「もう一度」）: recall_count を 0 に戻す（間隔[0]=1 日後に再登場）。
//     据え置きだと、一度「覚えた」を押したメモは「もう一度」でも 3〜140 日後まで出てこなかった。
// どちらも last_recalled_at を now に更新して「今日出した」ことを記録する。
// 呼び出し側:
//   supabase.from('book_memos').update(recallPatch(count, mastered)).eq('id', memoId)
export function recallPatch(currentCount, mastered) {
  return {
    last_recalled_at: new Date().toISOString(),
    recall_count: mastered ? (currentCount || 0) + 1 : 0,
  };
}

// ── due なメモが無いときの控え（2026-10-01）───────────────────────────
//
// pickRecallMemo が null（今日出すべきメモが無い）のときに、思い出しカードへ出してよい 1 枚。
// 出してよいのは「一度も思い出していない、まだ若い（作成から minAgeDays 日未満）メモ」だけ。
//   - 始めたばかりの人（若いメモしか無い）でもカードが空にならないように残す控え。
//   - 「覚えた／まだ覚えていない」と答えて次の間隔を待っているメモは、決して出さない
//     （以前は全メモから選んでいたため、覚えたと答えたメモが何度も「覚えた？」と戻ってきた）。
// 候補が無ければ null（呼び出し側は「今日の思い出しカードは、ここまでです」を出す）。
export function pickFallbackMemo(notes, { now = Date.now(), minAgeDays = 14, seed = 0 } = {}) {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  const pool = [];
  for (const n of notes) {
    const dueTime = noteDueAt(n, { minAgeDays });
    if (dueTime == null) continue;
    const recalled = !!n.lastRecalledAt && !Number.isNaN(new Date(n.lastRecalledAt).getTime());
    // 思い出し済みで、まだ間隔が来ていないメモは出さない（due なら pickRecallMemo が拾う）。
    if (recalled && now < dueTime) continue;
    pool.push(n);
  }
  if (pool.length === 0) return null;
  // 並びに頼らず決定的に（同じ seed なら同じ 1 枚）。
  pool.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const idx = Math.abs(Math.floor((seed * 9301 + 49297) % 233280)) % pool.length;
  return pool[idx] || pool[0];
}

// 「今日の思い出しカードは、ここまでです」の下の「別のメモを見る」で出す 1 枚（答えのボタンは出さない）。
// できるだけ、最近（withinDays 日以内に）思い出したメモは避ける。すべて最近なら、どれでも。
// seed を 1 つずつ進めると、同じ候補の中を順に回る。候補が無ければ null。
export function pickExtraMemo(notes, { now = Date.now(), seed = 0, withinDays = 1 } = {}) {
  if (!Array.isArray(notes)) return null;
  const all = notes.filter(isRecallable);
  if (all.length === 0) return null;
  const cutoff = now - withinDays * 86400000;
  const notRecent = all.filter((n) => {
    const t = n.lastRecalledAt ? new Date(n.lastRecalledAt).getTime() : NaN;
    return Number.isNaN(t) || t < cutoff;
  });
  const pool = (notRecent.length ? notRecent : all).slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const i = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
  return pool[i];
}

// 次に思い出しカードが出る時刻（ms）。いま due なメモがあれば now 以下の値ではなく、
// まだ来ていないうちでいちばん早い時刻を返す。無ければ null。
export function nextDueAt(notes, { now = Date.now(), minAgeDays = 14 } = {}) {
  if (!Array.isArray(notes)) return null;
  let min = null;
  for (const n of notes) {
    const t = noteDueAt(n, { minAgeDays });
    if (t == null || t <= now) continue;
    if (min == null || t < min) min = t;
  }
  return min;
}

// 「次は ◯月◯日に出します」の文（端末の日付）。今日なら「次は今日、あとで出します」、
// 明日なら「次は明日出します」。null なら空文字。
export function nextDueLabel(ts, now = Date.now()) {
  if (ts == null || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const startOf = (t) => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const days = Math.round((startOf(ts) - startOf(now)) / 86400000);
  if (days <= 0) return '次は今日、あとで出します';
  if (days === 1) return '次は明日出します';
  return `次は ${d.getMonth() + 1}月${d.getDate()}日に出します`;
}

// 端末に残した想起の記録（{ at: ISO, count }）を、DB から読んだメモに重ねる。
// DB の値より新しいときだけ使う（別の端末で DB に新しく書かれていれば、そちらが正）。
// DB に列が無い・書き込みに失敗した環境で、「覚えた」が再読み込みで消えないようにするため。
export function applyLocalRecall(note, entry) {
  if (!note || !entry || !entry.at) return note;
  const localT = new Date(entry.at).getTime();
  if (Number.isNaN(localT)) return note;
  const dbT = note.lastRecalledAt ? new Date(note.lastRecalledAt).getTime() : null;
  if (dbT != null && !Number.isNaN(dbT) && dbT >= localT) return note;
  return { ...note, lastRecalledAt: entry.at, recallCount: Number.isFinite(entry.count) ? entry.count : 0 };
}
