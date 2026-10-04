// 推薦の後ろの文から「## 💬 まとめ」（励ましの一言だけの区画）を取り除く（SPEC §3-2「励ましだけのまとめは出さない」）。
// 読む順番など他の区画は残す。会話中のおすすめ（BookAdvisor）と過去の AI 選書の中身（AdvisorHistory）で同じ（2026-10-04 に共通化）。
export function dropSummarySection(md) {
  if (!md || typeof md !== 'string') return md || '';
  const out = [];
  let dropping = false;
  for (const raw of md.split('\n')) {
    if (/^#{1,6}\s/.test(raw.trim())) dropping = /まとめ/.test(raw);
    if (!dropping) out.push(raw);
  }
  return out.join('\n').trim();
}

// 推薦の前置き（「## 👋 はじめに」＋共感の数行）から、見出し行を落として 1 段落の文にする
//   （本のカードより控えめな 15/--text-2 の段落で出す・会話中と過去の AI 選書で同じ）。
export function introTextOf(md) {
  if (!md || typeof md !== 'string') return '';
  return md
    .split('\n')
    .filter((l) => !/^#{1,6}\s/.test(l.trim()))
    .map((l) => l.trim().replace(/^[-*]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'))
    .filter(Boolean)
    .join('');
}

// 保存された推薦の答え（前置き＋RECOMMENDATIONS_START…END＋読む順番など）を、本のカードの前と後ろに分ける。
//   ブロックが無い答え（ヒアリングの質問・古い会話）は found=false。END が無い（途中で切れた）ときは後ろを空に。
//   過去の AI 選書の中身を、会話中と同じ順（前置き → 本のカード → 読む順番）で出すため（SPEC §3-2・2026-10-04）。
export function splitRecoAnswer(raw) {
  const s = String(raw || '');
  const START = 'RECOMMENDATIONS_START';
  const END = 'RECOMMENDATIONS_END';
  const first = s.indexOf(START);
  if (first < 0) return { found: false, before: s, after: '' };
  const lastEnd = s.lastIndexOf(END);
  const after = lastEnd > first ? s.slice(lastEnd + END.length) : '';
  return { found: true, before: s.slice(0, first), after };
}
