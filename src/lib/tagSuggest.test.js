// 🏷 タグの提案（lib/tagSuggest.js）: 自分のタグだけ・見逃すほうを選ぶ・Jev の答えの読み方。
import { describe, it, expect } from 'vitest';
import { buildSeed } from '../demo/seed';
import {
  scoreTagsLocal, suggestTagsLocal, tagUniverse, jevTagCandidates, tagsFromJev, TAG_SUGGEST_MAX, LOCAL_MIN,
} from './tagSuggest';

const seed = buildSeed(null);
const rows = seed.book_memos;
const tagsOf = (list) => list.map((x) => x.tag);

describe('自分のタグ', () => {
  it('メモのタグ＋本のタグ・「@」で始まるものは入れない', () => {
    const u = tagUniverse([{ tags: ['習慣', '@気づき', '習慣'] }, { tags: ['時間'] }], ['キャリア', '@x']);
    expect([...u.entries()]).toEqual([['習慣', 2], ['時間', 1], ['キャリア', 0]]);
  });
});

describe('端末の中の決め方（AI なし）', () => {
  it('タグの言葉が文に出ていれば、いちばん強い（3 文字以上のタグ）', () => {
    const r = suggestTagsLocal({ text: 'コミュニケーションは、聞くことから始まる。', rows });
    expect(r[0]).toMatchObject({ tag: 'コミュニケーション', why: 'text', score: 1 });
  });

  it('2 文字のタグ（時間）は、ふつうの言葉として出ただけではすすめない', () => {
    expect(tagsOf(suggestTagsLocal({ text: '毎朝同じ時間に起きると、一日のリズムが整う。', rows }))).not.toContain('時間');
  });

  it('近いメモが 1 件だけ・遠いときは、そのタグに寄せない（夕飯はカレー → カレンダーの「時間」）', () => {
    expect(suggestTagsLocal({ text: '夕飯はカレーだった。', rows })).toEqual([]);
  });

  it('似たことを書いたメモに付いているタグをすすめる（人を動かす・1on1 の話 → マネジメント）', () => {
    const r = suggestTagsLocal({ text: '部下には命令ではなく質問で考えてもらう。「どうすればうまくいくと思う？」', rows, bookTags: ['マネジメント', 'コミュニケーション'] });
    expect(tagsOf(r)).toContain('マネジメント');
  });

  it('すすめるのは 3 個まで・もう付いているタグはすすめない・関係の薄いタグはすすめない', () => {
    const r = suggestTagsLocal({ text: '部下には命令ではなく質問で考えてもらう。', rows, current: ['マネジメント'] });
    expect(tagsOf(r)).not.toContain('マネジメント');
    expect(r.length).toBeLessThanOrEqual(TAG_SUGGEST_MAX);
    const unrelated = suggestTagsLocal({ text: '今日は雨で、電車がとても混んでいた。傘を忘れた。', rows });
    expect(unrelated).toEqual([]);
  });

  it('短すぎるメモ・タグが 1 つも無い人にはすすめない', () => {
    expect(suggestTagsLocal({ text: 'なるほど', rows })).toEqual([]);
    expect(suggestTagsLocal({ text: '部下に任せることが育てることになる。', rows: rows.map((m) => ({ ...m, tags: [] })) })).toEqual([]);
  });

  it('自分自身（保存したメモ）は近いメモに数えない', () => {
    const self = rows.find((m) => m.tags?.includes('心理学'));
    const r = scoreTagsLocal({ text: self.text, memoId: self.id, rows });
    // 自分の「心理学」だけで 1 位にならない（ほかに「心理学」のメモは無い）
    expect(r.find((x) => x.tag === '心理学').score).toBeLessThan(LOCAL_MIN);
  });
});

describe('Jev の候補と答え', () => {
  it('候補は端末の点の高い順 → よく使う順・16 個まで', () => {
    const scored = [
      { tag: 'a', score: 0.5, uses: 1 }, { tag: 'b', score: 0, uses: 9 }, { tag: 'c', score: 0.9, uses: 0 }, { tag: 'd', score: 0, uses: 2 },
    ];
    expect(jevTagCandidates(scored)).toEqual(['c', 'a', 'b', 'd']);
    expect(jevTagCandidates(scored, 2)).toEqual(['c', 'a']);
  });
  it('答え: 0.6 以上を高い順に 3 個まで・数が合わなければ null', () => {
    expect(tagsFromJev(['a', 'b', 'c', 'd', 'e'], [0.9, 0.2, 0.61, 0.95, 0.7])).toEqual([
      { tag: 'd', score: 0.95, why: 'jev' }, { tag: 'a', score: 0.9, why: 'jev' }, { tag: 'e', score: 0.7, why: 'jev' },
    ]);
    expect(tagsFromJev(['a'], [0.1])).toEqual([]);
    expect(tagsFromJev(['a', 'b'], [0.9])).toBe(null);
    expect(tagsFromJev(['a'], null)).toBe(null);
  });
});
