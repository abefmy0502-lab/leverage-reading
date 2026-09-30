// 📚 AI 選書の本文の書名の許可リスト（lib/advisorProse.js）のテスト。
// 本番の実例（2026-09-30）: 読む順番に架空の本が 3 冊並んだ。確かめた本・本棚の本だけを残す。
import { describe, it, expect } from 'vitest';
import { filterProseTitles, titlesLooselySame, titleMentions, proseTitleLists, renumberLists } from './advisorProse';

const ORDER = [
  '## 📋 読む順番のおすすめ',
  '1. 『BtoB営業を成功させるSPIN営業術』 — まず型をつかむ',
  '2. 『営業提案書とプレゼンの科学』 — 提案書を磨く',
  '3. 『無敗営業』（読書中） — 今の本で土台を固める',
  '4. 『営業force 最強の営業組織をつくる方法』 — 組織に広げる',
].join('\n');

describe('titlesLooselySame', () => {
  it('副題の有無・版の頭・記号の違いは同じ本', () => {
    expect(titlesLooselySame('無敗営業', '無敗営業 「3つの質問」と「4つの力」')).toBe(true);
    expect(titlesLooselySame('7つの習慣', '完訳 7つの習慣 人格主義の回復')).toBe(true);
    expect(titlesLooselySame('大型商談を成約に導く SPIN 営業術', '大型商談を成約に導く「SPIN」営業術')).toBe(true);
    expect(titlesLooselySame('嫌われる勇気―自己啓発の源流', '嫌われる勇気 自己啓発の源流「アドラー」の教え')).toBe(true);
  });
  it('頭が似ているだけの別の本・架空の本は同じにしない', () => {
    expect(titlesLooselySame('BtoB営業を成功させるSPIN営業術', '大型商談を成約に導く「SPIN」営業術')).toBe(false);
    expect(titlesLooselySame('マンガ でわかる営業術', 'マンガ 7つの習慣')).toBe(false);
    expect(titlesLooselySame('エッセンシャル思考の実践ワークブック', 'エッセンシャル思考')).toBe(false);
    expect(titlesLooselySame('営業', '営業力')).toBe(false);
  });
});

describe('titleMentions', () => {
  it('『…』は全部、書名の中の「…」は数えない', () => {
    expect(titleMentions('まず『大型商談を成約に導く「SPIN」営業術』を読む')).toEqual(['大型商談を成約に導く「SPIN」営業術']);
  });
  it('「…」は書名として使われているときだけ拾う', () => {
    expect(titleMentions('「3つの質問」を意識する')).toEqual([]);
    expect(titleMentions('1. 「影響力の武器」 — 説得の原理')).toEqual(['影響力の武器']);
    expect(titleMentions('次に「影響力の武器」（ロバート・チャルディーニ）を読む')).toEqual(['影響力の武器']);
    expect(titleMentions('次に「影響力の武器」を読む', { pool: ['影響力の武器[第三版]'] })).toEqual(['影響力の武器']);
  });
});

describe('filterProseTitles', () => {
  it('確かめた本・本棚の本だけ残し、架空の本の行を消して番号を振り直す', () => {
    const out = filterProseTitles(ORDER, { allowed: ['大型商談を成約に導く「SPIN」営業術'], shelf: ['無敗営業 「3つの質問」と「4つの力」'] });
    expect(out).toBe(['## 📋 読む順番のおすすめ', '1. 『無敗営業』（読書中） — 今の本で土台を固める'].join('\n'));
  });
  it('確かめられなかったカードの本（allowed に無い）は本文に残さない', () => {
    const text = '## 📋 読む順番のおすすめ\n1. 『本A』 — 先に\n2. 『本B』 — 次に';
    const lists = proseTitleLists([{ title: '本A', _verify: 'ok' }, { title: '本B', _verify: 'unknown' }], []);
    expect(filterProseTitles(text, lists)).toBe('## 📋 読む順番のおすすめ\n1. 『本A』 — 先に');
  });
  it('区画が空になったら見出しごと消す（ほかの区画は残す）', () => {
    const text = `${ORDER}\n\n## 📝 補足\n痛みが強いときは医師にも相談を。`;
    const out = filterProseTitles(text, { allowed: [], shelf: [] });
    expect(out).toBe('## 📝 補足\n痛みが強いときは医師にも相談を。');
  });
  it('消した箇条書きの続きの行（字下げ）も一緒に消す', () => {
    const text = '## 📋 読む順番\n1. **『架空の本』**\n   理由の続き\n2. **『本物の本』**\n   こちらの理由';
    const out = filterProseTitles(text, { allowed: ['本物の本'] });
    expect(out).toBe('## 📋 読む順番\n1. **『本物の本』**\n   こちらの理由');
  });
  it('表の行も消し、見出し行だけになった表は表ごと消す', () => {
    const text = '## 📋 読む順番\n| 順 | 本 | 理由 |\n|---|---|---|\n| 1 | 『架空の本』 | 型 |\n| 2 | 『本物の本』 | 実践 |';
    expect(filterProseTitles(text, { allowed: ['本物の本'] })).toBe('## 📋 読む順番\n| 順 | 本 | 理由 |\n|---|---|---|\n| 1 | 『本物の本』 | 実践 |');
    expect(filterProseTitles(text, { allowed: [] })).toBe('');
  });
  it('書名の無い行・書名の無い本文はそのまま', () => {
    const text = '## 👋 はじめに\n営業の成果を上げたいのですね。';
    expect(filterProseTitles(text, {})).toBe(text);
    expect(filterProseTitles('', {})).toBe('');
  });
});

describe('renumberLists', () => {
  it('飛んだ番号を振り直し、本文が来たら数え直す', () => {
    expect(renumberLists('1. a\n3. b\n\n5. c\n本文\n2. d')).toBe('1. a\n2. b\n\n3. c\n本文\n1. d');
  });
});
