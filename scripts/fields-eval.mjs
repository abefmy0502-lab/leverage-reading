#!/usr/bin/env node
// 🏷 本の分野の仕分けを、確かめる本（src/lib/bookFields.corpus.js）で比べる（2026-10-11）。
//   node scripts/fields-eval.mjs
// 比べるもの:
//   1. 言葉だけ（書店のジャンルを渡さない）＝端末の最初の見立て
//   2. ジャンル＋言葉（端末が書誌を取ってきたあと・サーバーが AI を使えないとき）
//   3. サーバーの決まり方: ジャンルだけで決まる本（AI を呼ばない）／AI に聞く本／言葉だけの本 の数
//   4. AI 1 回の原価の見込み（指示文＋本の書誌の文字数から・Gemini Flash-Lite と Claude Haiku）
// AI そのものはここでは呼ばない（鍵が要る・答えが毎回ちがう）。AI の答えの読み方は api/_bookFields.test.js で確かめる。

import { FIELD_CORPUS } from '../src/lib/bookFields.corpus.js';
import { classifyBookDetailed, genreCandidates } from '../api/_bookFieldsCore.js';
import { BOOK_FIELDS_SYSTEM, bookFieldsUserText, BOOK_FIELDS_MAX_TOKENS } from '../api/_bookFieldsPrompt.js';
import { costFromUsage } from '../api/_aiCost.js';
import { genreNamesOf } from '../api/_bookFields.js';

// allowEmpty の本（言葉だけでは決めきれない＝付けないのが正しい）は、付かなければ期待どおり。付いたら expect のどれかであること。
const judge = (b, got) => {
  if (!got.length) return !!b.allowEmpty;
  return got.every((g) => b.expect.includes(g)) && !(b.notFirst || []).includes(got[0]);
};

function run(label, books, featuresOf) {
  let assigned = 0;
  let ok = 0;
  const misses = [];
  for (const b of books) {
    const got = classifyBookDetailed(featuresOf(b)).fields;
    if (got.length) assigned += 1;
    if (judge(b, got)) ok += 1;
    else misses.push(`  - ${b.title}: ${got.join('・') || '（なし）'}（期待 ${b.expect.join('・')}）`);
  }
  const pct = (n) => `${((n / books.length) * 100).toFixed(1)}%`;
  const empties = books.filter((b) => b.allowEmpty).length;
  console.log(`${label}: ${books.length} 冊 / 付いた ${assigned}（${pct(assigned)}）/ 期待どおり ${ok}（${pct(ok)}・付けないのが正しい本 ${empties} 冊を含む）`);
  if (misses.length) console.log(misses.join('\n'));
  return { assigned, ok, n: books.length };
}

const withGenre = FIELD_CORPUS.filter((b) => (b.genreIds || []).length);
const strip = (b) => ({ ...b, genreIds: [] });

console.log('# 本の分野の仕分け（確かめる本）\n');
run('1. 言葉だけ（全部）', FIELD_CORPUS, strip);
run('2. ジャンル＋言葉（全部）', FIELD_CORPUS, (b) => b);
console.log('');
run('1. 言葉だけ（ジャンルつきの本）', withGenre, strip);
run('2. ジャンル＋言葉（ジャンルつきの本）', withGenre, (b) => b);

// 3. サーバーの決まり方
let byGenre = 0;
let byAi = 0;
let byKw = 0;
for (const b of FIELD_CORPUS) {
  const g = genreCandidates(b.genreIds || []);
  if (g && g.fields.length === 1) byGenre += 1;
  else if (b.description || (b.toc || []).length) byAi += 1;
  else byKw += 1;
}
console.log(`\n3. サーバーでの決まり方（${FIELD_CORPUS.length} 冊）: ジャンルだけ ${byGenre} / AI に聞く ${byAi} / 言葉だけ ${byKw}`);

// 4. 原価の見込み（日本語は 1 字 ≈ 1.2 トークンで数える＝api/_aiCost.js の見積もりと同じ・上振れ側）
const sample = FIELD_CORPUS.find((b) => b.title.startsWith('半径5メートル') && b.toc) || FIELD_CORPUS[0];
const chars = BOOK_FIELDS_SYSTEM.length + bookFieldsUserText({ ...sample, genreNames: genreNamesOf(sample.genreIds || []) }).length;
const usage = { input_tokens: Math.ceil(chars * 1.2), output_tokens: 25 };
const yen = (m) => (costFromUsage(m, usage) / 1000).toFixed(3);
console.log(`\n4. AI 1 回: 入力 約 ${usage.input_tokens} トークン・出力 約 ${usage.output_tokens}（上限 ${BOOK_FIELDS_MAX_TOKENS}）`);
console.log(`   Gemini Flash-Lite 約 ¥${yen('gemini-3.1-flash-lite')} / 冊・Claude Haiku（代わり）約 ¥${yen('claude-haiku-4-5')} / 冊`);
console.log(`   本ごとに 1 回だけ（全員で使う）・1 日の上限 2000 冊なら多くて 約 ¥${(Number(yen('gemini-3.1-flash-lite')) * 2000).toFixed(0)} / 日`);
