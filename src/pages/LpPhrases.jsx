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
  // 塊の頭の半角の空白は、前の塊の終わりへ移す（行の頭に空白が出ないように・行の終わりの空白は畳まれる）。
  for (let i = 1; i < out.length; i += 1) {
    const m = out[i].match(/^ +/);
    if (m && out[i].length > m[0].length) { out[i - 1] += m[0]; out[i] = out[i].slice(m[0].length); }
  }
  return out;
}

// 半角の空白（「毎月 10 回」「24 時間前」「ChatGPT は」）では折り返さない（2026-10-05・「毎月／10 回」「24／時間前」と
// 数と単位が割れていた）。折り返すのは文節の切れ目（<wbr>）だけ。行より長い塊は CSS の overflow-wrap が割る。
// 塊の中の空白だけを折り返さない空白にする（塊の終わりの空白は、そこで折り返せるようにそのまま）。
const keepSpaces = (t) => t.replace(/ (?=[^ ]*[^ ])/g, '\u00a0');

// 2026-10-12 オーナー「改行の違和感」: 短い文（60 字まで＝見出し・カードの説明・リード）は、句読点（、。）の後ろだけで
// 折り返す（句をひとかたまりの inline-block に包む＝「いざと／いう」「AI／以外」のような割れが出ない）。
// 句が 1 行より長いときだけ、句の中を文節で割る。長い文（よくある質問の答え・料金の注記）は今までどおり文節で。
export const CLAUSE_MAX = 60;
export function clausesOf(parts) {
  const out = [[]];
  parts.forEach((p) => {
    out[out.length - 1].push(p);
    if (/[、。！？」]$/.test(p.replace(/[\s\u00a0\u2060]+$/, ''))) out.push([]);
  });
  return out.filter((c) => c.length);
}

export default function Phrases({ children, clause }) {
  const text = String(children ?? '');
  const parts = phrasesOf(text);
  const useClause = clause ?? text.length <= CLAUSE_MAX;
  // 長い文は本の組版と同じく文字の単位で詰めて折り返す（文節で割ると右が大きくでこぼこになる・2026-10-12）。
  // 数と単位（「24 時間前」）は折り返さない空白でつなぐ。
  if (!useClause) return <span className="lp-longtext">{keepSpaces(text)}</span>;
  return clausesOf(parts).map((c, k) => (
    <span key={k} className="lp-clause">
      {c.map((p, i) => <Fragment key={i}>{i > 0 && <wbr />}{keepSpaces(p)}</Fragment>)}
    </span>
  ));
}
