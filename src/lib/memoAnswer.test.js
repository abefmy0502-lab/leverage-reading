import { describe, it, expect } from 'vitest';
import { extractConsultTerms, answerFromMemos, buildMemoAnswerCorpus, countSearchedMemos, MEMO_ANSWER_MAX_BOOKS } from './memoAnswer';

const terms = (q) => extractConsultTerms(q).map((t) => `${t.kind}:${t.term}`);

describe('extractConsultTerms: 困りごとから探す言葉', () => {
  it('漢字 2 文字以上の言葉を取り出し、相談の言い回しとひらがなだけの語は外す', () => {
    expect(terms('上司への報告がうまくいかない。どうすればいいですか？')).toEqual(['word:上司', 'word:報告']);
  });
  it('悩み・相談・自分・方法などのよくある言葉は外す', () => {
    expect(terms('自分の悩みについて相談したい。いい方法は？')).toEqual([]);
  });
  it('1 文字の漢字＋送りがなは動詞として取り出す（困る・思うは外す）', () => {
    expect(terms('頼まれごとを断れなくて困っています')).toEqual(['verb:頼', 'verb:断']);
  });
  it('頭のよくある言葉は外して残りを使う（「毎日忙しい」→「忙」）', () => {
    expect(terms('毎日忙しくて')).toEqual(['verb:忙']);
  });
  it('カタカナ語・英数字も言葉にする（正規化してひらがなにそろえる・数字だけは外す）', () => {
    expect(terms('チームの1on1がうまくいかない 3回目')).toEqual(['word:ちーむ', 'word:1on1']);
  });
  it('同じ言葉は 1 つ・多くて 8 つ', () => {
    expect(terms('報告と報告')).toEqual(['word:報告']);
    const many = '会議 資料 企画 提案 顧客 営業 予算 目標 計画 評価';
    expect(terms(many)).toHaveLength(8);
  });
});

const BOOKS = [
  { id: 'b1', title: 'エッセンシャル思考', investPurpose: '仕事を抱えすぎて手が回らない状態を抜け出したい' },
  { id: 'b2', title: 'イシューからはじめよ', leverageMemo: '報告は結論から。' },
  { id: 'b3', title: '人を動かす' },
  { id: 'b4', title: '数値化の鬼' },
];
const MEMOS = [
  { id: 'm1', book_id: 'b1', page_number: 64, text: '頼まれごとに即答しない。一度持ち帰ると、断る余地が生まれる。', created_at: '2026-05-01' },
  { id: 'm2', book_id: 'b1', page_number: 18, text: 'やらないことを決めるのが、いちばん大事な仕事。', created_at: '2026-05-02' },
  { id: 'm3', book_id: 'b2', page_number: null, text: '部長への報告で、結論より経緯を先に話してしまう。', created_at: '2026-06-01' },
  { id: 'm4', book_id: 'b3', page_number: 142, text: '人に動いてもらうには、命令ではなく質問で。', created_at: '2026-07-01' },
  { id: 'm5', book_id: null, page_number: null, text: '上司に相談するときは、選択肢を2つ用意して「私はAがいい」まで言う。', created_at: '2026-08-01', tags: ['仕事術'] },
  { id: 'm6', book_id: 'b4', page_number: 15, text: '頑張りますは計測できない。行動を数で決める。', created_at: '2026-09-01', tags: ['報告'] },
];

describe('answerFromMemos: 関係しそうな一節を本ごとに', () => {
  it('当たった一節を、本ごとにまとめて返す（学びは本の無いまとまり）', () => {
    const r = answerFromMemos({ question: '上司への報告がうまくいかない', books: BOOKS, memos: MEMOS });
    const keys = r.groups.map((g) => (g.book ? g.book.title : '学び'));
    expect(keys).toContain('イシューからはじめよ');
    expect(keys).toContain('学び');
    const issue = r.groups.find((g) => g.bookId === 'b2');
    // メモ（m3）と、この本のまとめの両方が当たる。メモを先に
    expect(issue.hits[0].memoId).toBe('m3');
    expect(issue.hits[0].segments.some((s) => s.match && s.text === '報告')).toBe(true);
  });
  it('タグだけで当たった文は出さない（本文に言葉が無いと理由が分からない）', () => {
    const r = answerFromMemos({ question: '報告のしかた', books: BOOKS, memos: MEMOS });
    expect(r.groups.some((g) => g.bookId === 'b4')).toBe(false);
  });
  it('動詞は送りがなが違っても当たる（「断れない」→「断る」）', () => {
    const r = answerFromMemos({ question: '頼まれると断れない', books: BOOKS, memos: MEMOS });
    expect(r.groups[0].bookId).toBe('b1');
    expect(r.groups[0].hits[0].memoId).toBe('m1');
  });
  it('読書準備（得たいこと）も欄の名前つきで探す', () => {
    const r = answerFromMemos({ question: '手が回らない', books: BOOKS, memos: MEMOS });
    const hit = r.groups[0].hits[0];
    expect(hit.kind).toBe('prep');
    expect(hit.label).toBe('得たいこと');
  });
  it(`多くて ${MEMO_ANSWER_MAX_BOOKS} 冊・1 冊から 2 件まで`, () => {
    const memos = Array.from({ length: 20 }, (_, i) => ({ id: `x${i}`, book_id: `k${i % 5}`, text: `会議の進め方 ${i}`, created_at: '2026-01-01' }));
    const books = Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, title: `本${i}` }));
    const bg = Array.from({ length: 30 }, (_, i) => ({ id: `y${i}`, book_id: 'k0', text: `朝の散歩 ${i}`, created_at: '2026-01-01' }));
    const r = answerFromMemos({ question: '会議が長い', books, memos: [...memos, ...bg] });
    expect(r.groups.length).toBe(MEMO_ANSWER_MAX_BOOKS);
    r.groups.forEach((g) => expect(g.hits.length).toBeLessThanOrEqual(2));
  });
  it('半分を超えるメモに出る言葉だけで当たった文は出さない', () => {
    const memos = Array.from({ length: 10 }, (_, i) => ({ id: `z${i}`, book_id: 'k1', text: i < 6 ? `仕事の話 ${i}` : '散歩', created_at: '2026-01-01' }));
    const r = answerFromMemos({ question: '仕事がつらい', books: [{ id: 'k1', title: '本' }], memos });
    expect(r.groups).toEqual([]);
  });
  it('見つからないときは空（言葉が取れない・メモが無いときも）', () => {
    expect(answerFromMemos({ question: 'スキーがうまくなりたい', books: BOOKS, memos: MEMOS }).groups).toEqual([]);
    expect(answerFromMemos({ question: 'どうしたらいい？', books: BOOKS, memos: MEMOS }).groups).toEqual([]);
    expect(answerFromMemos({ question: '報告', books: [], memos: [] }).groups).toEqual([]);
  });
  it('相談相手を本に絞ったときは、その本だけ（学びは入れない）', () => {
    const r = answerFromMemos({ question: '上司への報告', books: BOOKS, memos: MEMOS, scopeIds: ['b2'] });
    expect(r.groups.map((g) => g.bookId)).toEqual(['b2']);
  });
  it('探したメモの数は カード式＋学び＋この本のまとめ（読書準備は数えない）', () => {
    const corpus = buildMemoAnswerCorpus({ books: BOOKS, memos: MEMOS });
    expect(countSearchedMemos(corpus)).toBe(MEMOS.length + 1);
    expect(answerFromMemos({ question: '報告', books: BOOKS, memos: MEMOS }).searched).toBe(7);
  });
  it('消した本のメモは出さない', () => {
    const r = answerFromMemos({ question: '報告', books: BOOKS, memos: [...MEMOS, { id: 'gone', book_id: 'deleted', text: '報告の型', created_at: '2026-01-01' }] });
    expect(r.groups.some((g) => g.bookId === 'deleted')).toBe(false);
  });
});
