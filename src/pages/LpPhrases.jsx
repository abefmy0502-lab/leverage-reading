// 🧩 LP の段落を文節で折り返す（BudouX で文節の切れ目に <wbr> を入れ、CSS の .lp-wbr＝word-break: keep-all と組む）。
// `word-break: auto-phrase` は iOS の Safari では効かず「流／れ」のように語の途中で割れるため（2026-10-02 ui-critic）。
// 日付（「12月15日」）は文節に分けない（1 つの塊のまま）。BudouX はアプリでも使っている（TightBubble.jsx）。
import { Fragment } from 'react';
import { loadDefaultJapaneseParser } from 'budoux';

let parser = null;
const DATE = /^\d+月\d+日/;

export function phrasesOf(text) {
  if (!parser) parser = loadDefaultJapaneseParser();
  const out = [];
  for (const seg of parser.parse(String(text || ''))) {
    // 「12月」「15日…」のように日付が割れたら、前の塊につなぐ。
    const prev = out[out.length - 1];
    // 折り返さない印（WORD JOINER・折り返さない空白）の前後では分けない（noBreak の塊を割らない）。
    if (prev && (/[\u2060\u00a0]$/.test(prev) || /^[\u2060\u00a0]/.test(seg))) out[out.length - 1] = prev + seg;
    else if (prev && /\d+月$/.test(prev) && /^\d+日/.test(seg)) out[out.length - 1] = prev + seg;
    else if (prev && DATE.test(prev + seg) && /^\d+$/.test(prev)) out[out.length - 1] = prev + seg;
    else out.push(seg);
  }
  return out;
}

export default function Phrases({ children }) {
  const parts = phrasesOf(children);
  return parts.map((p, i) => <Fragment key={i}>{i > 0 && <wbr />}{p}</Fragment>);
}
