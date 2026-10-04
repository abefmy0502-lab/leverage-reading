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
