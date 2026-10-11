// 🎬 字幕（.srt）の小さな関数（record-demo.mjs / finish-video.mjs が使う・テストは srt.test.js）。

// 0 以上の秒 → 「00:00:01,250」
export function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

// cues: [{ start, end, text }]（秒）。shift 秒だけ前へずらし（頭を切った動画に合わせる）、0 秒より前は切る。
// 長さが 0 以下になった字幕は捨てる。text の改行はそのまま（SRT は複数行を許す）。
export function toSrt(cues, shift = 0) {
  const lines = [];
  let n = 0;
  for (const c of cues) {
    const start = Math.max(0, c.start - shift);
    const end = c.end - shift;
    if (!c.text || end - start < 0.05) continue;
    n += 1;
    lines.push(String(n), `${srtTime(start)} --> ${srtTime(end)}`, c.text, '');
  }
  return lines.join('\n');
}

// 字幕を出す/消すの記録（{ at, text|null }）を、重ならない cue の並びにする。最後の字幕は end まで。
export function marksToCues(marks, end) {
  const cues = [];
  for (let i = 0; i < marks.length; i += 1) {
    const m = marks[i];
    if (!m.text) continue;
    const next = marks.slice(i + 1).find((x) => x.at > m.at);
    cues.push({ start: m.at, end: next ? next.at : end, text: m.text });
  }
  return cues;
}

// 切る区間（[[from, to], …]・秒）を除いた、残す区間の並び。重なり・順不同・範囲外は整える。
export function keepSegments(duration, cuts = []) {
  const cs = cuts
    .map(([a, b]) => [Math.max(0, Math.min(a, duration)), Math.max(0, Math.min(b, duration))])
    .filter(([a, b]) => b - a > 0.01)
    .sort((x, y) => x[0] - y[0]);
  const keep = [];
  let at = 0;
  for (const [a, b] of cs) {
    if (a > at) keep.push([at, a]);
    at = Math.max(at, b);
  }
  if (duration > at) keep.push([at, duration]);
  return keep;
}

// 元の動画の時刻 t を、切ったあとの時刻に直す（切った区間の中の時刻は、その区間の終わりと同じ）。
export function mapTime(t, segments) {
  let out = 0;
  for (const [a, b] of segments) {
    if (t <= a) return out;
    if (t < b) return out + (t - a);
    out += b - a;
  }
  return out;
}

// 字幕を切ったあとの時刻に直す。
export function cutCues(cues, segments) {
  return cues.map((c) => ({ ...c, start: mapTime(c.start, segments), end: mapTime(c.end, segments) }));
}
