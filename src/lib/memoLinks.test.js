import { describe, it, expect } from 'vitest';
import {
  bigramCounts, buildLinkIndex, findLinkedMemos, linkIndexFor, sharedRuns, normalizeLinkText,
  linkHighlightRanges, linkSegments,
  LINK_MIN_SCORE, LINK_MAX,
} from './memoLinks';

describe('つながるメモの一節の印（2026-10-01 ui-critic）', () => {
  const marked = (seg) => seg.filter((s) => s.match).map((s) => s.text);
  it('印は語の途中から始めず、漢字・カタカナの語の端まで広げる', () => {
    const text = '人に動いてもらうには、命令ではなく質問で聞く。';
    // 「令で」「質問」だけを共有していても、印は「命令」「質問」の頭から
    const ranges = linkHighlightRanges(text, ['令で', '質問']);
    const parts = ranges.map(([a, b]) => text.slice(a, b));
    expect(parts).toContain('命令で');
    expect(parts).toContain('質問');
    // カタカナの語も端まで
    const t2 = 'よいマネージャーは答えを与えない。';
    const p2 = linkHighlightRanges(t2, ['ネー', 'ージ']).map(([a, b]) => t2.slice(a, b));
    expect(p2).toEqual(['マネージャー']);
  });
  it('「から」のようなひらがな 2 文字だけの印は付けない', () => {
    expect(linkHighlightRanges('結論から話す', ['から'])).toEqual([]);
  });
  it('印が一節の半分を超えたら、いちばん長い印だけにする', () => {
    const text = '報告は結論から先に話す。';
    const seg = linkSegments(text, ['報告', '結論', 'から', '先に', 'に話', '話す']);
    const m = marked(seg);
    expect(m).toHaveLength(1);
    const total = seg.map((s) => s.text).join('').length;
    expect(m[0].length).toBeLessThan(total);
  });
  it('半分以下なら、印はそのまま', () => {
    const text = '人に動いてもらうには、命令ではなく質問で。どうすればうまくいくと思うかを聞く。';
    expect(marked(linkSegments(text, ['命令', '質問'])).length).toBe(2);
  });
});

let seq = 0;
const memo = (bookId, text, extra = {}) => ({ id: `m${(seq += 1)}`, book_id: bookId, text, page_number: null, created_at: '2026-09-01T00:00:00Z', ...extra });

// 別々の話のメモ（索引の IDF を現実に近づけるための、よくある読書メモ）。
const BACKGROUND = [
  memo('b1', '読書は投資。1冊から1つでも行動が変われば元は取れる。'),
  memo('b1', '読んだあとに自分用のメモを作り、何度も見返すのが本番。'),
  memo('b2', '分析の前にストーリーラインと絵コンテを作る。'),
  memo('b2', 'よいイシューの条件は本質的な選択肢であること。'),
  memo('b3', '予定を詰めすぎない。予備の時間を最初からカレンダーに入れておく。'),
  memo('b3', '迷ったら「絶対にやりたい」と思えないものは、すべてやらないにする。'),
  memo('b4', '人は自分が重要だと感じたいもの。相手の名前を覚えて呼ぶ。'),
  memo('b5', '他人の課題と自分の課題を分ける。'),
  memo('b6', 'チームの勝利が最優先。個人の手柄より、チームが勝つための判断をする。'),
  memo('b7', 'チームの週次ミーティングで、次の一週間で何件やるかを各自に言ってもらう。'),
  memo('b8', '寝る前の15分は記憶のゴールデンタイム。1日の学びを3行で書いてから寝る。'),
];

describe('bigramCounts', () => {
  it('記号・空白で区切り、2 文字ずつの切れ端にする（区切りをまたがない）', () => {
    const c = bigramCounts('報告、結論');
    expect([...c.keys()]).toEqual(['報告', '結論']);
  });
  it('数字だけ・どの本にも出る言葉（自分・場合）は数えない', () => {
    const c = bigramCounts('自分の場合は 2026 年');
    expect(c.has('自分')).toBe(false);
    expect(c.has('場合')).toBe(false);
    expect(c.has('20')).toBe(false);
    expect(c.has('の場')).toBe(true);
  });
  it('全角・半角・大文字小文字をそろえ、カタカナはひらがなにしない', () => {
    expect(normalizeLinkText('ＫＰＩ　ﾁｰﾑ')).toBe('kpi チーム');
  });
});

describe('findLinkedMemos: 似ているメモ', () => {
  const target = memo('coach', 'よいマネージャーは答えを与えない。命令ではなく質問で、「どうすればうまくいくと思う？」と考えさせる。');
  const index = buildLinkIndex([...BACKGROUND, target, memo('people', '批判しても人は変わらない。まず相手の立場で考える。')]);

  it('同じ考えを書いた別の本のメモを見つける', () => {
    const out = findLinkedMemos(index, { text: '人に動いてもらうには、命令ではなく質問で。「どうすればうまくいくと思う？」と聞く。', bookId: 'people' });
    expect(out).toHaveLength(1);
    expect(out[0].memo).toBe(target);
    expect(out[0].score).toBeGreaterThanOrEqual(LINK_MIN_SCORE);
    expect(out[0].shared).toContain('質問');
  });
  it('送りがなや言い回しが少し違っても見つける（「頼まれごと」「一度持ち帰る」）', () => {
    const idx = buildLinkIndex([...BACKGROUND, memo('ess', '頼まれごとに即答しない。「確認して返事します」と一度持ち帰ると、断る余地が生まれる。')]);
    const out = findLinkedMemos(idx, { text: '頼まれごとはその場で引き受けず、一度持ち帰ってから数字で判断する。', bookId: 'kpi' });
    expect(out).toHaveLength(1);
    expect(out[0].bookId).toBe('ess');
  });
  it('同じ本のメモ・そのメモ自身は出さない', () => {
    const t = '命令ではなく質問で、「どうすればうまくいくと思う？」と考えさせる。';
    expect(findLinkedMemos(index, { text: t, bookId: 'coach' })).toEqual([]);
    expect(findLinkedMemos(index, { text: target.text, bookId: 'other', memoId: target.id })).toEqual([]);
  });
});

describe('findLinkedMemos: 似ていないメモ（出さない）', () => {
  const index = buildLinkIndex([
    ...BACKGROUND,
    memo('coach', 'よいマネージャーは答えを与えない。命令ではなく質問で考えさせる。'),
    memo('coach', '1on1 は仕事の話の前に、相手の近況や家族の話から始める。'),
  ]);
  it('同じ長い言葉（マネージャー）が 1 つあるだけでは、つなげない', () => {
    expect(findLinkedMemos(index, { text: 'マネージャーの仕事は、メンバーの話を聞くこと。', bookId: 'x' })).toEqual([]);
  });
  it('「チーム」だけが同じ別々の話は、つなげない', () => {
    expect(findLinkedMemos(index, { text: 'チームの目標を数字で決めて、毎週見直す。', bookId: 'x' })).toEqual([]);
  });
  it('助詞や「ている」だけが同じ文は、つなげない', () => {
    expect(findLinkedMemos(index, { text: 'そういうことをしているときは、なるべく早めにやめておく。', bookId: 'x' })).toEqual([]);
  });
  it('短すぎるメモは比べない', () => {
    expect(findLinkedMemos(index, { text: 'なるほど', bookId: 'x' })).toEqual([]);
  });
});

describe('findLinkedMemos: 並びと件数', () => {
  const idx = buildLinkIndex([
    ...BACKGROUND,
    memo('a', '報告は結論から話す。決めてほしいことを最初に言う。'),
    memo('a', '報告は結論から。決めてほしいことを先に言う。'),
    memo('b', '上司への報告は、結論から先に話して、決めてほしいことを言う。'),
    memo('c', '報告では、結論から話し、決めてほしいことをはっきり言う。'),
  ]);
  const out = findLinkedMemos(idx, { text: '部長への報告で、結論より先に「決めてほしいこと」から話す。', bookId: 'z' });
  it(`1 冊から 1 件だけ・多くて ${LINK_MAX} 件`, () => {
    expect(out.length).toBe(LINK_MAX);
    expect(new Set(out.map((o) => o.bookId)).size).toBe(out.length);
  });
  it('似ている順', () => {
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });
});

describe('sharedRuns', () => {
  it('続けて共有する並びを数え、ひらがなだけの並びは数えない', () => {
    const vec = new Map([['報告', 1], ['結論', 1], ['てい', 1], ['いる', 1]]);
    const r = sharedRuns([[...'報告と結論'], [...'している']], vec);
    expect(r.runs).toBe(2);
    expect(r.phrase).toBe(0);
  });
  it('ひらがなと漢字の混じった長い並びは言い回しとして数える', () => {
    const t = 'どうすればうまくいくと思う';
    const chars = [...t];
    const vec = new Map();
    for (let i = 0; i < chars.length - 1; i += 1) vec.set(chars[i] + chars[i + 1], 1);
    expect(sharedRuns([chars], vec).phrase).toBe(chars.length);
  });
});

describe('linkIndexFor: 1,000 件を超えても速い', () => {
  it('同じ配列の索引は作り直さない・1,200 件で 1 回探すのが十分速い', () => {
    const words = ['会議', '報告', '結論', '部下', '上司', '読書', '習慣', '時間', '目標', '数字', '質問', '命令', '計画', '予定', '振り返り', 'チーム', '顧客', '提案', '資料', '企画'];
    const rows = Array.from({ length: 1200 }, (_, i) => memo(`bk${i % 60}`, `${words[i % 20]}について、${words[(i * 7) % 20]}と${words[(i * 13) % 20]}を考える。${i}番目のメモ。`));
    const t0 = performance.now();
    const idx = linkIndexFor(rows);
    const t1 = performance.now();
    expect(linkIndexFor(rows)).toBe(idx);
    findLinkedMemos(idx, { text: '会議の報告は結論から先に言う。', bookId: 'zz' });
    const t2 = performance.now();
    // 目安: 索引づくり 400ms・1 回探す 50ms より十分短い（CI の遅い機械でも落ちない幅）
    expect(t1 - t0).toBeLessThan(400);
    expect(t2 - t1).toBeLessThan(50);
  });
});
