import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAMPLE_NOTE, BOOK_DISCLAIMER } from './notes.mjs';
import { AUTHOR_REDACT, SCENARIOS, redactPairs } from './scenarios.mjs';
import { SAMPLE_NOTE as LP_SAMPLE_NOTE } from '../../src/pages/lpCopy.js';

const apply = (s, list) => list.reduce((out, [from, to]) => out.split(from).join(to), s);
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('画面は見本だと示す（2026-10-11・景品表示法の優良誤認）', () => {
  it('動画の注記は LP と同じ文', () => {
    expect(SAMPLE_NOTE).toBe(LP_SAMPLE_NOTE);
    expect(SAMPLE_NOTE.startsWith('画面は見本です。')).toBe(true);
  });
  it('録画の舞台に焼き込み、仕上げは注記の無い録画を断る', () => {
    expect(src('./record-demo.mjs')).toMatch(/<p id="sample">\$\{escapeHtml\(SAMPLE_NOTE\)\}<\/p>/);
    expect(src('./record-demo.mjs')).toContain('sampleNote: SAMPLE_NOTE');
    expect(src('./finish-video.mjs')).toContain('meta.sampleNote !== SAMPLE_NOTE');
  });
  it('実在の書名を出す投稿の一文', () => {
    expect(BOOK_DISCLAIMER).toContain('本の著者・出版社とは関係ありません');
  });
});

describe('実在の著者名を映さない（全部の台本）', () => {
  // お試しモードのデータに出てくる著者（「見本」「架空」の作った名前は除く）
  const demoAuthors = () => {
    const seed = src('../../src/demo/seed.js');
    const fetch = src('../../src/demo/demoFetch.js');
    const search = src('../../src/demo/demoBookSearch.js');
    const names = new Set();
    for (const m of seed.matchAll(/\[\s*'[^']+',\s*'([^']+)',\s*'97\d{11}'/g)) names.add(m[1]);
    for (const m of search.matchAll(/\[\s*'[^']+',\s*'[^']*',\s*'([^']+)',\s*'[^']+',\s*'\d{4}年/g)) names.add(m[1]);
    for (const m of fetch.matchAll(/author: '([^']+)'/g)) names.add(m[1]);
    for (const m of seed.matchAll(/^\s*'### \d+\. .+? - ([^']+)',$/gm)) names.add(m[1]);
    return [...names].filter((n) => !/見本|架空/.test(n));
  };

  it('お試しモードの著者は全員 AUTHOR_REDACT にある', () => {
    const missing = demoAuthors().filter((a) => !(a in AUTHOR_REDACT));
    expect(missing).toEqual([]);
    expect(demoAuthors().length).toBeGreaterThan(20);
  });

  it('画面の文字は書名に、表紙・canvas では消える', () => {
    const { text, media } = redactPairs();
    expect(apply('📚 安宅和人『イシューからはじめよ』 p.25', text)).toBe('📚 『イシューからはじめよ』 p.25');
    expect(apply('エリック・シュミット（本の語り口で・AI）', text)).toBe('『1兆ドルコーチ』（本の語り口で・AI）');
    expect(apply('◆『7つの習慣』｜スティーブン・R・コヴィー', text)).toBe('◆『7つの習慣』');
    expect(apply('岸見一郎・古賀史健', text)).toBe('『嫌われる勇気』');
    expect(apply('岸見一郎 ほか', media)).toBe('');
    expect(apply('D・カーネギー', media)).toBe('');
    for (const a of Object.keys(AUTHOR_REDACT)) {
      expect(apply(`著者：${a}`, text)).not.toContain(a);
      expect(apply(a, media)).toBe('');
    }
  });

  it('どの台本にも同じ置きかえが効く（台本の redact はその上に足すだけ）', () => {
    for (const s of SCENARIOS) {
      const { text } = redactPairs(s.redact);
      expect(apply('リンダ・グラットン', text), s.name).toBe('『LIFE SHIFT』');
    }
  });

  it('台本の字幕に実在の著者名を書かない', () => {
    for (const s of SCENARIOS) {
      const words = [s.title, ...(s.steps || []).map((x) => x.say || '')].join('\n');
      for (const a of Object.keys(AUTHOR_REDACT)) expect(words, `${s.name}: ${a}`).not.toContain(a);
    }
  });
});
