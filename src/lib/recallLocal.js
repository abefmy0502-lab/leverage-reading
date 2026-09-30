// 🔄 思い出しカードの記録を端末に残す（localStorage・recall.js は I/O を持たないので分けた）。
//
// 何を残すか: { [memoId]: { at: ISO, count: number } }（最後に思い出した時刻・覚えた回数）。
//   - 派生のメモ（本のまとめ・AI まとめ・行動のふりかえり）は DB の行が無いので、常にここへ。
//   - 本物のメモも、DB への書き込みが失敗したとき（`supabase_recall_memory.sql` が未適用で
//     last_recalled_at / recall_count の列が無い・通信断など）はここへ（2026-10-01）。
//     これが無いと「覚えた」が再読み込みで消え、同じメモに何度も「覚えた？」と聞いていた。
// 読むときは recall.js の applyLocalRecall で、DB の値より新しいときだけ重ねる。
// プライベートブラウズなどで使えないときは静かに諦める（次もカードに出るだけ）。

export const RECALL_LOCAL_KEY = 'orime-recall-local-v1';
// 以前の名前（派生のメモだけを残していた）。読むときに引き継ぐ。
const LEGACY_SYNTH_KEY = 'orime-synth-recall-v1';
const MAX_ENTRIES = 500;

function readMap(key) {
  try {
    const raw = localStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    return map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  } catch {
    return {};
  }
}

export function loadRecallLocal() {
  const legacy = readMap(LEGACY_SYNTH_KEY);
  const map = readMap(RECALL_LOCAL_KEY);
  // 新しい方を残す（同じ id が両方にあれば at の新しい方）。
  const merged = { ...legacy };
  for (const [id, e] of Object.entries(map)) {
    const prev = merged[id];
    if (!prev || String(e?.at || '') >= String(prev?.at || '')) merged[id] = e;
  }
  return merged;
}

export function saveRecallLocal(map) {
  try {
    const next = { ...map };
    const keys = Object.keys(next);
    if (keys.length > MAX_ENTRIES) {
      keys.sort((a, b) => String(next[a]?.at || '').localeCompare(String(next[b]?.at || '')));
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete next[k];
    }
    localStorage.setItem(RECALL_LOCAL_KEY, JSON.stringify(next));
    // 引き継ぎが済んだので古い名前は消す。
    try { localStorage.removeItem(LEGACY_SYNTH_KEY); } catch { /* ignore */ }
  } catch { /* 使えない端末は諦める */ }
}
