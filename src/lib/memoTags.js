// 🏷 メモを書くシートに並べる「よく使うタグ」（2026-09-29）。
// その本のメモに付けたタグを多い順に、足りなければ本棚の本のタグで埋める（重複なし・max 件まで）。
// 「@」で始まるもの（学びの分類）は出さない。
export function frequentMemoTags(memos = [], fallbackTags = [], max = 8) {
  const count = new Map();
  for (const m of Array.isArray(memos) ? memos : []) {
    for (const t of Array.isArray(m?.tags) ? m.tags : []) {
      const tag = String(t || '').trim();
      if (!tag || tag.startsWith('@')) continue;
      count.set(tag, (count.get(tag) || 0) + 1);
    }
  }
  const out = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  for (const t of Array.isArray(fallbackTags) ? fallbackTags : []) {
    const tag = String(t || '').trim();
    if (!tag || tag.startsWith('@') || out.includes(tag)) continue;
    out.push(tag);
  }
  return out.slice(0, max);
}
