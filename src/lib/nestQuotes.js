// 「」の中の「」を『』にする（引用の入れ子・2026-11-18 ui-critic「答えの中の引用が「…「…」と崩れて見える」）。
//   「部長への報告で「この報告で決めてほしいことは何か」から話す」→「部長への報告で『この報告で決めてほしいことは何か』から話す」
//   行が変わったら数え直す（閉じ忘れが次の行に広がらない）。もともとの『』はそのまま。
export function nestQuotes(text) {
  const src = String(text ?? '');
  if (!src.includes('「')) return src;
  let depth = 0;
  let out = '';
  for (const ch of src) {
    if (ch === '\n') { depth = 0; out += ch; continue; }
    if (ch === '「') { out += depth >= 1 ? '『' : '「'; depth += 1; continue; }
    if (ch === '」') {
      if (depth > 0) depth -= 1;
      out += depth >= 1 ? '』' : '」';
      continue;
    }
    out += ch;
  }
  return out;
}

// 引用する文を「」に入れる前に整える: 中の「」を『』に、途中で切った『』は閉じる。
export function quotable(text) {
  let s = String(text ?? '').replace(/「/g, '『').replace(/」/g, '』');
  const open = (s.match(/『/g) || []).length - (s.match(/』/g) || []).length;
  if (open > 0) {
    // 「…」で切った文は、… のあとで閉じる。
    s += '』'.repeat(open);
  }
  return s;
}
