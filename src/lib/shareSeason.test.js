// 月末の「今月の読書」の声かけと、12 月の「今年の読書」（2026-10-08・marketing-strategy-2026-11.md §6 の 2・3）。
import { describe, it, expect } from 'vitest';
import {
  isMonthEndWindow, finishedInMonth, monthNudgeEligible, pickShareNudge, needsMonthMemoCount,
  readNudgeState, markNudgeDone, nudgeText, SHARE_NUDGE_STORAGE_KEY, recordYearShown, yearShowCount, YEAR_NUDGE_MAX_SHOWS,
} from './shareNudge';
import {
  isYearWrapSeason, hasFinishedThisYear, yearChoiceAllowed, yearRecord, orderYearQuoteCandidates,
  shareHashtags, buildRecordShareText, subjectChoices, shareItemsFor, yearMemoCountFor,
  finishedSubVariants, pickSubVariant, monthRecord, applyShareItems,
} from './shareOverlay';
import { buildShareText } from './shareCardLayout';

const d = (y, m, day) => new Date(y, m - 1, day, 12, 0, 0);
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const NONE = { month: null, year: null, yearShows: null };

describe('月末の 3 日間', () => {
  it('31 日の月は 29〜31 日・28 日の 2 月は 26〜28 日・うるう年は 27〜29 日', () => {
    expect(isMonthEndWindow(d(2026, 10, 28))).toBe(false);
    expect(isMonthEndWindow(d(2026, 10, 29))).toBe(true);
    expect(isMonthEndWindow(d(2026, 10, 31))).toBe(true);
    expect(isMonthEndWindow(d(2026, 11, 27))).toBe(false);
    expect(isMonthEndWindow(d(2026, 11, 28))).toBe(true);
    expect(isMonthEndWindow(d(2026, 11, 30))).toBe(true);
    expect(isMonthEndWindow(d(2027, 2, 25))).toBe(false);
    expect(isMonthEndWindow(d(2027, 2, 26))).toBe(true);
    expect(isMonthEndWindow(d(2028, 2, 26))).toBe(false);
    expect(isMonthEndWindow(d(2028, 2, 27))).toBe(true);
    expect(isMonthEndWindow(d(2026, 12, 1))).toBe(false);
  });
});

describe('月末の声かけの条件（読了 1 冊以上 か メモ 3 件以上）', () => {
  const now = d(2026, 11, 29);
  const books = [
    { id: 'a', status: 'done', doneDate: '2026-11-03' },
    { id: 'b', status: 'done', doneDate: '2026-10-30' },
    { id: 'c', status: 'reading' },
  ];
  it('その月の読了だけを数える', () => {
    expect(finishedInMonth(books, now)).toBe(1);
    expect(finishedInMonth(books, d(2026, 10, 30))).toBe(1);
    expect(finishedInMonth([], now)).toBe(0);
  });
  it('読了 1 冊・メモ 3 件のどちらかで出す', () => {
    expect(monthNudgeEligible({ finishedCount: 1 })).toBe(true);
    expect(monthNudgeEligible({ finishedCount: 0, memoCount: 3 })).toBe(true);
    expect(monthNudgeEligible({ finishedCount: 0, memoCount: 2 })).toBe(false);
    expect(monthNudgeEligible({ finishedCount: 0, memoCount: null })).toBe(false);
  });
  it('月末だけ・読了があれば数えずに出す', () => {
    expect(pickShareNudge({ now, books, state: NONE })).toEqual({ kind: 'month', text: '11月の読書を、1 枚の画像に' });
    expect(pickShareNudge({ now: d(2026, 11, 20), books, state: NONE })).toBeNull();
    expect(needsMonthMemoCount({ now, books, state: NONE })).toBe(false);
  });
  it('読了が無ければメモを数えてから（3 件で出す・2 件は出さない）', () => {
    const noDone = [{ id: 'c', status: 'reading' }];
    expect(needsMonthMemoCount({ now, books: noDone, state: NONE })).toBe(true);
    expect(needsMonthMemoCount({ now: d(2026, 11, 10), books: noDone, state: NONE })).toBe(false);
    expect(pickShareNudge({ now, books: noDone, monthMemoCount: null, state: NONE })).toBeNull();
    expect(pickShareNudge({ now, books: noDone, monthMemoCount: 2, state: NONE })).toBeNull();
    expect(pickShareNudge({ now, books: noDone, monthMemoCount: 3, state: NONE })?.kind).toBe('month');
  });
  it('押した・閉じた月は二度と出さない（次の月の月末はまた出す）', () => {
    const st = memStorage();
    markNudgeDone(st, 'month', now);
    const state = readNudgeState(st);
    expect(state.month).toBe('2026-11');
    expect(pickShareNudge({ now, books, state })).toBeNull();
    expect(pickShareNudge({ now: d(2026, 11, 30), books, state })).toBeNull();
    expect(needsMonthMemoCount({ now, books: [], state })).toBe(false);
    const jan = [{ id: 'a', status: 'done', doneDate: '2027-01-10' }];
    expect(pickShareNudge({ now: d(2027, 1, 30), books: jan, state })?.kind).toBe('month');
  });
  it('端末に書けない・壊れた値でも落ちない', () => {
    expect(readNudgeState(null)).toEqual(NONE);
    const st = memStorage();
    st.setItem(SHARE_NUDGE_STORAGE_KEY, '{oops');
    expect(readNudgeState(st)).toEqual(NONE);
    expect(markNudgeDone({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'month', now)).toBeNull();
  });
});

describe('12 月の「今年の読書」', () => {
  const books = [
    { id: 'a', title: 'イシューからはじめよ', status: 'done', doneDate: '2026-03-10', actions: [{ done: true, completedAt: '2026-03-20' }, { done: true, completedAt: '2025-12-30' }] },
    { id: 'b', title: '1兆ドルコーチ', status: 'done', doneDate: '2026-12-02', actions: [{ done: true, completedAt: '2026-12-02T10:00:00Z' }, { done: false }] },
    { id: 'c', title: 'エッセンシャル思考', status: 'done', doneDate: '2026-07-01', actions: [] },
    { id: 'd', title: '去年の本', status: 'done', doneDate: '2025-11-01', actions: [] },
    { id: 'e', title: '読書中の本', status: 'reading', actions: [{ done: true, completedAt: '2026-06-01' }] },
  ];
  it('12/1〜12/31 だけ', () => {
    expect(isYearWrapSeason(d(2026, 11, 30))).toBe(false);
    expect(isYearWrapSeason(d(2026, 12, 1))).toBe(true);
    expect(isYearWrapSeason(d(2026, 12, 31))).toBe(true);
    expect(isYearWrapSeason(d(2027, 1, 1))).toBe(false);
  });
  it('1 冊も読み終えていない年は出さない', () => {
    expect(hasFinishedThisYear(books, d(2026, 12, 3))).toBe(true);
    expect(hasFinishedThisYear([books[3], books[4]], d(2026, 12, 3))).toBe(false);
    expect(yearChoiceAllowed(books, d(2026, 12, 3))).toBe(true);
    expect(yearChoiceAllowed(books, d(2026, 11, 29))).toBe(false);
    expect(yearChoiceAllowed([books[3]], d(2026, 12, 3))).toBe(false);
  });
  it('数え方: 今年の読了・今年のメモ（件数を渡したらそちら）・今年に実行した行動', () => {
    const memos = [
      { id: 'm1', text: 'a', createdAt: '2026-02-01T00:00:00Z' },
      { id: 'm2', text: '', photoPath: 'x.jpg', createdAt: '2026-05-01T00:00:00Z' },
      { id: 'm3', text: '   ', createdAt: '2026-05-01T00:00:00Z' },
      { id: 'm4', text: '去年', createdAt: '2025-06-01T00:00:00Z' },
    ];
    const rec = yearRecord(books, memos, d(2026, 12, 3));
    expect(rec.title).toBe('2026年の読書');
    expect(rec.kicker).toBe('');
    expect(rec.titleIsBook).toBe(false);
    expect(rec.stats).toEqual([
      { key: 'books', label: '読了', value: '3冊' },
      { key: 'memos', label: 'メモ', value: '2件' },
      { key: 'actions', label: '実行した行動', value: '3件' },
    ]);
    // 表紙は新しく読み終えた順
    expect(rec.finishedBooks.map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(rec.sub).toBe('『1兆ドルコーチ』『エッセンシャル思考』 ほか 1 冊');
    expect(yearRecord(books, memos, d(2026, 12, 3), { memoCount: 1234 }).stats[1].value).toBe('1234件');
    expect(yearRecord(books, memos, d(2026, 12, 3), { readingSec: 3600 * 40 }).stats.find((st) => st.key === 'reading')).toEqual({ key: 'reading', label: '読書の時間', value: '40時間' });
  });
  it('件数は読んだメモの数え方とそろえる（上限より多い人だけ、読めなかった分を足す）', () => {
    const memos = [{ text: 'a' }, { text: ' ' }, { text: '', photoPath: 'p.jpg' }];
    expect(yearMemoCountFor(memos, 3, 2000)).toBeNull(); // 全部読めた＝yearRecord が数える（空のメモは数えない）
    expect(yearMemoCountFor(memos, null, 3)).toBeNull();
    // 上限に届かないのに数え上げが多い（空のメモが混ざる等）ときも数え直す
    expect(yearMemoCountFor(memos, 10, 2000)).toBeNull();
    // 上限（3 件）まで読んで、まだある
    expect(yearMemoCountFor(memos, 10, 3)).toBe(2 + 7);
  });
  it('1 冊だけ・メモ 0・行動 0 の年も作れる（数字は読了だけ）', () => {
    const rec = yearRecord([{ id: 'x', title: 'ひとつ', status: 'done', doneDate: '2026-02-01', actions: [] }], [], d(2026, 12, 3));
    expect(rec.stats).toEqual([{ key: 'books', label: '読了', value: '1冊' }]);
    expect(rec.sub).toBe('『ひとつ』');
    expect(rec.subVariants).toEqual(['『ひとつ』', '1 冊']);
  });
  it('連続日数・順位・目標・バッジは入れない（数字は冊数・メモ・行動だけ）', () => {
    const rec = yearRecord(books, [], d(2026, 12, 3));
    expect(rec.stats.map((s) => s.key)).toEqual(['books', 'actions']);
    expect(JSON.stringify(rec)).not.toMatch(/連続|位|目標|バッジ/);
    expect(shareItemsFor({ record: rec, variant: 'record' }).map((i) => i.key)).toEqual(['title', 'author', 'books', 'actions', 'stamp']);
  });
  it('「どの本？」は 今月 → 今年 → 本（12 月だけ）', () => {
    const list = [{ id: 'r', title: 'R', status: 'reading' }];
    expect(subjectChoices(list, { includeYear: true }).map((c) => c.kind)).toEqual(['month', 'year', 'book']);
    expect(subjectChoices(list).map((c) => c.kind)).toEqual(['month', 'book']);
  });
  it('ホームの 1 行は 12 月は今年だけ（12/30 に今年を閉じたら、今月の 1 行も出さない）', () => {
    const now = d(2026, 12, 30);
    expect(pickShareNudge({ now: d(2026, 12, 3), books, state: NONE })).toEqual({ kind: 'year', text: nudgeText('year', now) });
    expect(nudgeText('year', now)).toBe('2026年の読書を、1 枚の画像に');
    expect(pickShareNudge({ now, books, state: NONE })?.kind).toBe('year');
    const st = memStorage();
    markNudgeDone(st, 'year', now);
    const state = readNudgeState(st);
    expect(pickShareNudge({ now: d(2026, 12, 3), books, state })).toBeNull();
    expect(pickShareNudge({ now, books, state })).toBeNull();
    expect(needsMonthMemoCount({ now, books: [], state: NONE })).toBe(false);
    expect(pickShareNudge({ now: d(2026, 12, 3), books: [books[3]], state: NONE })).toBeNull();
  });
  it('今年の 1 行は、触らないまま 3 回出したらもう出さない（次の年はまた数える）', () => {
    const st = memStorage();
    const now = d(2026, 12, 5);
    for (let i = 0; i < YEAR_NUDGE_MAX_SHOWS - 1; i += 1) recordYearShown(st, now);
    expect(yearShowCount(readNudgeState(st), now)).toBe(2);
    expect(pickShareNudge({ now, books, state: readNudgeState(st) })?.kind).toBe('year');
    recordYearShown(st, now);
    expect(pickShareNudge({ now, books, state: readNudgeState(st) })).toBeNull();
    // 閉じた印は数えた回数を消さない
    markNudgeDone(st, 'month', d(2026, 11, 29));
    expect(yearShowCount(readNudgeState(st), now)).toBe(3);
    const next = [{ id: 'n', status: 'done', doneDate: '2027-03-01' }];
    expect(yearShowCount(readNudgeState(st), d(2027, 12, 5))).toBe(0);
    expect(pickShareNudge({ now: d(2027, 12, 5), books: next, state: readNudgeState(st) })?.kind).toBe('year');
  });
});

describe('今年の「いちばん残した一文」（AI を使わない）', () => {
  it('「覚えた」の多いメモ → しっかり書いたメモ → 新しい順・AI まとめは入れない', () => {
    const memos = [
      { id: 'new-short', text: '短い', createdAt: '2026-12-01' },
      { id: 'new', text: 'チームが勝つための判断をする。', createdAt: '2026-11-20' },
      { id: 'old', text: '問いを見極めてから答えを出す。', createdAt: '2026-02-01' },
      { id: 'recall1', text: 'やらないことを決める。', createdAt: '2026-03-01', recallCount: 1 },
      { id: 'recall3', text: '相手の名前を覚えて呼ぶ。', createdAt: '2026-01-05', recall_count: 3 },
      { id: 'ai', text: 'AI が書いたまとめの長い文です。', createdAt: '2026-12-02', recallCount: 9, sourceType: 'ai_summary' },
      { id: 'empty', text: ' ', createdAt: '2026-12-02', recallCount: 5 },
    ];
    expect(orderYearQuoteCandidates(memos).map((m) => m.id)).toEqual(['recall3', 'recall1', 'new', 'old', 'new-short']);
  });
  it('メモが無ければ空', () => {
    expect(orderYearQuoteCandidates([])).toEqual([]);
    expect(orderYearQuoteCandidates(null)).toEqual([]);
  });
});

describe('共有の文に添えるハッシュタグ（画像には入れない）', () => {
  it('今月は読了のある月だけ「#◯月読了本」・今年は「#2026年の読書」・本 1 冊は無し', () => {
    expect(shareHashtags('month', d(2026, 11, 29), { finishedCount: 1 })).toEqual(['#11月読了本']);
    expect(shareHashtags('month', d(2026, 1, 30), { finishedCount: 3 })).toEqual(['#1月読了本']);
    expect(shareHashtags('month', d(2026, 11, 29), { finishedCount: 0 })).toEqual([]);
    expect(shareHashtags('month', d(2026, 11, 29))).toEqual([]);
    expect(shareHashtags('year', d(2026, 12, 3))).toEqual(['#2026年の読書']);
    expect(shareHashtags(null)).toEqual([]);
  });
  it('#Orime の前に同じ行で入る', () => {
    const rec = { title: '11月の読書', titleIsBook: false, kicker: '2026' };
    expect(buildRecordShareText({ record: rec, siteUrl: 'https://orime.vercel.app', tags: ['#11月読了本'] }))
      .toBe('11月の読書\n#11月読了本 #Orime\nhttps://orime.vercel.app');
    expect(buildShareText({ title: 'イシューからはじめよ', line: '問い', tags: ['#2026年の読書'] }))
      .toBe('『イシューからはじめよ』より\n問い\n#2026年の読書 #Orime');
    // 渡さなければ今までどおり
    expect(buildRecordShareText({ record: rec })).toBe('11月の読書\n#Orime');
  });
});

describe('読み終えた本の行（「ほか N 冊」を … で消さない）', () => {
  const b = (t) => ({ title: t });
  it('2 冊＋ほか N 冊 → 1 冊＋ほか N+1 冊 → N 冊', () => {
    expect(finishedSubVariants([b('A'), b('B'), b('C'), b('D')])).toEqual(['『A』『B』 ほか 2 冊', '『A』 ほか 3 冊', '4 冊']);
    expect(finishedSubVariants([b('A'), b('B')])).toEqual(['『A』『B』', '『A』 ほか 1 冊', '2 冊']);
    expect(finishedSubVariants([])).toEqual([]);
  });
  it('幅に入る最初のものを選ぶ・どれも入らなければ冊数だけ', () => {
    const v = finishedSubVariants([b('とても長い書名の本'), b('もう一冊の長い書名'), b('C')]);
    const m = (t) => Array.from(t).length * 10;
    expect(pickSubVariant(v, m, 400)).toBe(v[0]);
    expect(pickSubVariant(v, m, 200)).toBe('『とても長い書名の本』 ほか 2 冊');
    expect(pickSubVariant(v, m, 50)).toBe('3 冊');
  });
  it('今月にも同じ書き方・著者（読み終えた本）を隠したら消える', () => {
    const rec = monthRecord([{ id: 'a', title: 'A', status: 'done', doneDate: '2026-11-02' }], [], d(2026, 11, 29));
    expect(rec.subVariants).toEqual(['『A』', '1 冊']);
    expect(applyShareItems(rec, ['author']).subVariants).toBeNull();
  });
});
