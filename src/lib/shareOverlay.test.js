// 📷 写真で共有の決めごと（どの本・どの数字・どの一文・安全な枠）のテスト。canvas は使わない。

import { describe, it, expect } from 'vitest';
import {
  pickShareSubject, subjectChoices, bookRecord, monthRecord, splitStatValue, hasFinishedThisMonth,
  orderQuoteCandidates, quoteText, swapQuote, swapQuoteLabel, availableVariants, defaultVariant,
  recordFrame, placeRecordBlock, statColumns, buildRecordShareText, recordBaseHeight, fmtMonthDay, fmtStamp, RECORD_QUOTE_MAX,
  recordBlockPlan, recordTitleScale, shareItemsFor, applyShareItems, shareVisibility, readHiddenItems, writeHiddenItems,
  SHARE_ITEMS_STORAGE_KEY, recordCoverPlacement, SHARE_ITEM_KEYS, readSharePrefs, writeSharePrefs, SHARE_PREFS_STORAGE_KEY,
  stepVariant, logoBox, LOGO_RULES, statsStackPlan, placeStatsStack, statColumnsScale, STAT_COL_GAP,
} from './shareOverlay.js';

const NOW = new Date(2026, 8, 30, 10, 0, 0); // 2026-09-30

describe('pickShareSubject（ホームのカメラから開いたときの本）', () => {
  it('いま読んでいる本のうち、最近さわった本', () => {
    const books = [
      { id: 'a', title: 'A', status: 'reading', updatedAt: '2026-09-20T00:00:00Z' },
      { id: 'b', title: 'B', status: 'reading', updatedAt: '2026-09-28T00:00:00Z' },
      { id: 'c', title: 'C', status: 'done', doneDate: '2026-09-29', updatedAt: '2026-09-29T00:00:00Z' },
    ];
    expect(pickShareSubject(books)).toEqual({ kind: 'book', bookId: 'b' });
  });
  it('読書中が無ければ、最近読み終えた本', () => {
    const books = [
      { id: 'c', title: 'C', status: 'done', doneDate: '2026-08-01' },
      { id: 'd', title: 'D', status: 'done', doneDate: '2026-09-12' },
      { id: 'w', title: 'W', status: 'want', updatedAt: '2026-09-30T00:00:00Z' },
    ];
    expect(pickShareSubject(books)).toEqual({ kind: 'book', bookId: 'd' });
  });
  it('本が無い（読みたい・積読だけ）ときは今月', () => {
    expect(pickShareSubject([])).toEqual({ kind: 'month' });
    expect(pickShareSubject([{ id: 'w', title: 'W', status: 'want' }])).toEqual({ kind: 'month' });
  });
});

describe('subjectChoices（シートの「どの本？」）', () => {
  const books = [
    { id: 'r1', title: 'R1', status: 'reading', updatedAt: '2026-09-01' },
    { id: 'd1', title: 'D1', status: 'done', doneDate: '2026-09-10' },
    { id: 'r2', title: 'R2', status: 'reading', updatedAt: '2026-09-20' },
    { id: 'w1', title: 'W1', status: 'want' },
  ];
  it('今月 → 読書中（新しい順）→ 読了。読みたい・積読は出さない', () => {
    const c = subjectChoices(books);
    expect(c.map((x) => (x.kind === 'month' ? 'month' : x.bookId))).toEqual(['month', 'r2', 'r1', 'd1']);
  });
  it('多すぎるときは max 冊まで・選んでいる本は必ず入れる', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: `R${i}`, status: 'reading', updatedAt: `2026-09-${String(i + 1).padStart(2, '0')}` }));
    const c = subjectChoices(many, { selectedId: 'r0', max: 4 });
    expect(c).toHaveLength(5);
    expect(c.some((x) => x.bookId === 'r0')).toBe(true);
  });
});

describe('bookRecord（本 1 冊の数字）', () => {
  it('読了: 読了日・メモの件数（まとめも 1 件）・実行した行動', () => {
    const r = bookRecord(
      { title: 'イシューからはじめよ', author: '安宅和人', status: 'done', doneDate: '2026-09-28', leverageMemo: 'まとめ', actions: [{ done: true }, { done: false }, { done: true }] },
      [{ text: 'a' }, { text: 'b' }, { text: '  ' }],
      NOW,
    );
    expect(r.kicker).toBe('読了');
    expect(r.title).toBe('イシューからはじめよ');
    expect(r.sub).toBe('安宅和人');
    expect(r.stats).toEqual([
      { key: 'date', label: '読み終えた日', value: '9月28日' },
      { key: 'memos', label: 'メモ', value: '3件' },
      { key: 'actions', label: '実行した行動', value: '2件' },
    ]);
  });
  it('読書中: 読みはじめの日。0 の数字は出さない', () => {
    const r = bookRecord({ title: 'X', status: 'reading', startDate: '2026-09-21' }, [], NOW);
    expect(r.kicker).toBe('読書中');
    expect(r.stats).toEqual([{ key: 'date', label: '読みはじめ', value: '9月21日' }]);
  });
  it('去年の日付は年も入れる', () => {
    expect(fmtMonthDay('2025-12-31', NOW)).toBe('2025年12月31日');
  });
});

describe('monthRecord（今月の数字）', () => {
  const books = [
    { id: 'a', title: 'A', status: 'done', doneDate: '2026-09-03', actions: [{ done: true, completedAt: '2026-09-10T00:00:00Z' }, { done: true, completedAt: '2026-08-10T00:00:00Z' }] },
    { id: 'b', title: 'B', status: 'done', doneDate: '2026-09-20' },
    { id: 'c', title: 'C', status: 'done', doneDate: '2026-09-25' },
    { id: 'd', title: 'D', status: 'done', doneDate: '2026-08-30' },
  ];
  const memos = [{ text: 'x', createdAt: '2026-09-02T01:00:00Z' }, { text: 'y', createdAt: '2026-08-31T01:00:00Z' }];
  it('今月読み終えた冊数・今月のメモ・今月に実行した行動', () => {
    const r = monthRecord(books, memos, NOW);
    expect(r.title).toBe('9月の読書');
    expect(r.kicker).toBe('2026');
    expect(r.stats).toEqual([
      { key: 'books', label: '読了', value: '3冊' },
      { key: 'memos', label: 'メモ', value: '1件' },
      { key: 'actions', label: '実行した行動', value: '1件' },
    ]);
    // 読み終えた新しい順に 2 冊＋ほか
    expect(r.sub).toBe('『C』『B』 ほか 1 冊');
  });
  it('本が 1 冊も無くても作れる（数字の無い 1 枚）', () => {
    const r = monthRecord([], [], NOW);
    expect(r.stats).toEqual([]);
    expect(r.sub).toBe('読書の記録をはじめました');
  });
});

describe('splitStatValue', () => {
  it('数字を大きく・単位を小さく', () => {
    expect(splitStatValue('9月28日')).toEqual([
      { text: '9', big: true }, { text: '月', big: false }, { text: '28', big: true }, { text: '日', big: false },
    ]);
    expect(splitStatValue('24件')).toEqual([{ text: '24', big: true }, { text: '件', big: false }]);
  });
});

describe('重ねる一文', () => {
  const memos = [
    { id: 'old', text: '古いメモ', createdAt: '2026-09-01T00:00:00Z' },
    { id: 'new', text: '新しいメモ', createdAt: '2026-09-29T00:00:00Z' },
    { id: 'empty', text: '', createdAt: '2026-09-30T00:00:00Z' },
    { id: 'mid', text: '真ん中', createdAt: '2026-09-15T00:00:00Z' },
  ];
  it('本文のあるメモだけ・新しい順（いちばん新しいメモが最初に重なる）', () => {
    expect(orderQuoteCandidates(memos).map((m) => m.id)).toEqual(['new', 'mid', 'old']);
  });
  it('メモの「…」から開いたら、そのメモを先頭に', () => {
    expect(orderQuoteCandidates(memos, { preferId: 'old' }).map((m) => m.id)).toEqual(['old', 'new', 'mid']);
  });
  it('記録に重ねる一文は 60 字まで', () => {
    const t = quoteText('あ'.repeat(100), 'record');
    expect(Array.from(t).length).toBeLessThanOrEqual(RECORD_QUOTE_MAX);
    expect(Array.from(quoteText('い'.repeat(100), 'quote')).length).toBe(100);
  });
  it('記録は 候補 → … → なし → 最初 と回る・一文の見せ方はなしにしない', () => {
    expect([0, 1, 2, -1].map((i) => swapQuote(i, 3, true))).toEqual([1, 2, -1, 0]);
    expect([0, 1, 2].map((i) => swapQuote(i, 3, false))).toEqual([1, 2, 0]);
    expect(swapQuote(0, 0, true)).toBe(-1);
  });
  it('ボタンの名前は、押すと何が起きるか', () => {
    expect(swapQuoteLabel(0, 3, true)).toBe('別の一文');
    expect(swapQuoteLabel(2, 3, true)).toBe('一文を外す');
    expect(swapQuoteLabel(-1, 3, true)).toBe('一文を入れる');
    expect(swapQuoteLabel(0, 1, true)).toBe('一文を外す');
    expect(swapQuoteLabel(0, 1, false)).toBeNull(); // 替えるものが無い
    expect(swapQuoteLabel(0, 0, true)).toBeNull();
  });
  it('見せ方: 一文が無ければ記録だけ。メモから開いたら一文が先', () => {
    expect(availableVariants(false)).toEqual(['record']);
    expect(availableVariants(true)).toEqual(['record', 'quote']);
    expect(defaultVariant({ fromMemo: true, hasQuote: true })).toBe('quote');
    expect(defaultVariant({ fromMemo: false, hasQuote: true })).toBe('record');
    expect(defaultVariant({ fromMemo: true, hasQuote: false })).toBe('record');
  });
});

describe('安全な枠（4:5 と 9:16 で SNS に切られない）', () => {
  it('ストーリーは上下 約 250 の帯に文字をかけない', () => {
    const f = recordFrame('story');
    expect(f.H).toBe(1920);
    expect(f.safeTop).toBeGreaterThanOrEqual(250);
    expect(f.footerBaseline).toBeLessThanOrEqual(1920 - 250);
  });
  it('投稿（4:5）は 3:4 の一覧で切られる左右 34 より内側', () => {
    const f = recordFrame('post');
    expect(f.H).toBe(1350);
    expect(f.margin).toBeGreaterThan(34);
    expect(f.footerBaseline).toBeLessThanOrEqual(f.safeBottom);
  });
  it('まとまりはロゴの上・枠に入らなければ fits=false', () => {
    for (const fmt of ['post', 'story']) {
      const f = recordFrame(fmt);
      const ok = placeRecordBlock(f, 500);
      expect(ok.fits).toBe(true);
      expect(ok.top).toBeGreaterThanOrEqual(f.safeTop);
      expect(ok.bottom).toBeLessThan(f.footerTop);
      expect(ok.coverArea.bottom).toBeLessThanOrEqual(ok.top);
      const tooTall = placeRecordBlock(f, f.H);
      expect(tooTall.fits).toBe(false);
      expect(tooTall.top).toBe(f.safeTop);
    }
  });
  it('大きくした数字（120）でも、書名 2 行・著者・数字 3 つは安全な枠に入る（一文はその残りにだけ入れる）', () => {
    for (const fmt of ['post', 'story']) {
      const f = recordFrame(fmt);
      expect(f.statValueSize).toBeGreaterThanOrEqual(fmt === 'story' ? 120 : 110);
      expect(f.kickerSize).toBeGreaterThanOrEqual(34);
      expect(f.metaSize).toBeGreaterThanOrEqual(34);
      const h = recordBaseHeight(f, { titleLines: 2, hasKicker: true, hasSub: true, statsCount: 3 });
      const at = placeRecordBlock(f, h);
      expect(at.fits).toBe(true);
      // 一文の 1 行分（いちばん小さい大きさ）の余りもある
      const withQuote = placeRecordBlock(f, h + Math.round(f.quoteSizes[f.quoteSizes.length - 1] * 1.55) + Math.round(f.quoteSizes[0] * 0.95));
      expect(withQuote.fits).toBe(true);
    }
  });
  it('数字の列は中身の幅に合わせ、列の間を等しく（左右の端は余白・間は 40 以上）', () => {
    const f = recordFrame('post');
    // 幅が分からなければ等分
    const even = statColumns(f, 3);
    expect(even).toHaveLength(3);
    expect(even[0].x).toBe(f.margin);
    expect(even[2].x + even[2].width).toBeCloseTo(f.W - f.margin);
    expect(statColumns(f, 5)).toHaveLength(3);
    // 中身の幅（「9月28日」は広く、「2件」は狭い）
    const cols = statColumns(f, 3, [300, 160, 220]);
    expect(cols[0].x).toBe(f.margin);
    expect(cols[2].x + cols[2].width).toBeCloseTo(f.W - f.margin);
    const gap1 = cols[1].x - (cols[0].x + cols[0].width);
    const gap2 = cols[2].x - (cols[1].x + cols[1].width);
    expect(gap1).toBeCloseTo(gap2);
    expect(gap1).toBeGreaterThanOrEqual(STAT_COL_GAP);
    // 2 つで中身が短いときは、間を余白の内側の 2 割までにする（2 つめが右端まで飛ばない）
    const two = statColumns(f, 2, [280, 100]);
    expect(two[1].x - (two[0].x + two[0].width)).toBeCloseTo((f.W - f.margin * 2) * 0.2);
  });
  it('入らないときは数字だけを縮めて、間 40 を残す', () => {
    const f = recordFrame('post');
    const avail = f.W - f.margin * 2;
    expect(statColumnsScale(f, [200, 80, 230], [300, 160, 120])).toBe(1);
    const k = statColumnsScale(f, [100, 100, 100], [500, 300, 200]);
    expect(k).toBeLessThan(1);
    expect(500 * k + 300 * k + 200 * k + STAT_COL_GAP * 2).toBeLessThanOrEqual(avail + 1);
    expect(statColumnsScale(f, [0], [2000])).toBe(0.5);
  });
});

describe('共有の文', () => {
  it('画像に入れたものだけ', () => {
    const record = bookRecord({ title: 'イシューからはじめよ', status: 'done', doneDate: '2026-09-28' }, [], NOW);
    expect(buildRecordShareText({ record, quote: '問いを見極める', siteUrl: 'https://orime.vercel.app' }))
      .toBe('読了『イシューからはじめよ』\n問いを見極める\n#Orime\nhttps://orime.vercel.app');
    const month = monthRecord([], [], NOW);
    expect(buildRecordShareText({ record: month })).toBe('9月の読書\n#Orime');
  });
  it('日付の刻印', () => {
    expect(fmtStamp(NOW)).toBe('2026.9.30');
  });
});

describe('表示する項目（2026-10-01）', () => {
  const book = { title: 'イシューからはじめよ', author: '安宅和人', status: 'reading', startDate: '2026-09-21', actions: [{ done: true }] };
  const rec = bookRecord(book, [{ text: 'a' }], NOW);

  it('選べる項目は中身のあるものだけ・画像の上から順（記録）・ロゴは項目に無い（必ず入る）', () => {
    const items = shareItemsFor({ record: rec, variant: 'record', hasQuote: true });
    expect(items.map((i) => i.key)).toEqual(['status', 'title', 'author', 'date', 'memos', 'actions', 'quote', 'stamp']);
    expect(items.find((i) => i.key === 'date').label).toBe('読みはじめ');
    expect(items.find((i) => i.key === 'memos').label).toBe('メモの数');
    // 著者の無い本・一文の無い本は、その項目を出さない
    const bare = bookRecord({ title: 'X', status: 'reading' }, [], NOW);
    expect(shareItemsFor({ record: bare, variant: 'record', hasQuote: false }).map((i) => i.key)).toEqual(['status', 'title', 'stamp']);
  });
  it('数字の重ね方は記録と同じ項目（一文は入れないので出さない）', () => {
    expect(shareItemsFor({ record: rec, variant: 'stats', hasQuote: true }).map((i) => i.key))
      .toEqual(['status', 'title', 'author', 'date', 'memos', 'actions', 'stamp']);
  });
  it('今月の記録は名前が変わる（年・「9月の読書」・読了の冊数）', () => {
    const m = monthRecord([{ id: 'a', title: 'A', status: 'done', doneDate: '2026-09-03' }], [], NOW);
    const items = shareItemsFor({ record: m, variant: 'record' });
    expect(items.map((i) => i.label)).toEqual(['年', '「9月の読書」', '読み終えた本', '読了の冊数', '今日の日付']);
  });
  it('一文の見せ方は書名・著者だけ（一文は主役なので隠せない・ロゴは必ず入る）', () => {
    expect(shareItemsFor({ variant: 'quote', hasAuthor: true }).map((i) => i.key)).toEqual(['title', 'author']);
    expect(shareItemsFor({ variant: 'quote', hasAuthor: false }).map((i) => i.key)).toEqual(['title']);
  });
  it('どの重ね方・どの本でも、ロゴは「表示する項目」に出ない', () => {
    const m = monthRecord([], [], NOW);
    for (const variant of ['record', 'stats', 'quote']) {
      for (const record of [rec, m, bookRecord({ title: 'X', status: 'done' }, [], NOW)]) {
        expect(shareItemsFor({ record, variant, hasQuote: true, hasAuthor: true }).some((i) => i.key === 'logo')).toBe(false);
      }
    }
    expect(SHARE_ITEM_KEYS).not.toContain('logo');
  });
  it('隠した項目は記録から外れる（数字は項目ごと）', () => {
    const r = applyShareItems(rec, ['status', 'author', 'date']);
    expect(r.kicker).toBe('');
    expect(r.sub).toBe('');
    expect(r.title).toBe('イシューからはじめよ');
    expect(r.stats.map((s) => s.key)).toEqual(['memos', 'actions']);
    expect(shareVisibility(['logo', 'stamp'])).toEqual({ title: true, author: true, quote: true, stamp: false });
    // 書名を隠したら共有の文にも入れない
    expect(buildRecordShareText({ record: applyShareItems(rec, ['title']) })).toBe('#Orime');
  });
  it('前の選択を覚える（壊れた値・知らない名前・読めない保存先でも落ちない）', () => {
    const mem = new Map();
    const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
    expect(readHiddenItems(storage)).toEqual([]);
    expect(writeHiddenItems(storage, ['author', 'nope', 'date'])).toBe(true);
    expect(readHiddenItems(storage)).toEqual(['author', 'date']);
    mem.set(SHARE_ITEMS_STORAGE_KEY, '{broken');
    expect(readHiddenItems(storage)).toEqual([]);
    const throwing = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('quota'); } };
    expect(readHiddenItems(throwing)).toEqual([]);
    expect(writeHiddenItems(throwing, ['author'])).toBe(false);
    expect(readHiddenItems(null)).toEqual([]);
  });
  it('以前に「ロゴを隠す」を選んだ端末でも、ロゴは隠さない（読むときに捨てる・書くときにも残さない）', () => {
    const mem = new Map();
    const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
    mem.set(SHARE_ITEMS_STORAGE_KEY, JSON.stringify(['logo', 'stamp', 'author']));
    expect(readHiddenItems(storage)).toEqual(['stamp', 'author']);
    writeHiddenItems(storage, ['logo', 'author']);
    expect(JSON.parse(mem.get(SHARE_ITEMS_STORAGE_KEY))).toEqual(['author']);
  });
});

describe('重ね方・形を覚える・スワイプ（2026-10-05）', () => {
  const mk = () => {
    const mem = new Map();
    return { mem, storage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) } };
  };
  it('重ね方は 3 つ（記録・数字・一文）。数字が無ければ数字を、一文が無ければ一文を出さない', () => {
    expect(availableVariants(true, true)).toEqual(['record', 'stats', 'quote']);
    expect(availableVariants(false, true)).toEqual(['record', 'stats']);
    expect(availableVariants(true, false)).toEqual(['record', 'quote']);
  });
  it('選んだ重ね方・形を覚える（壊れた値・知らない名前は既定に）', () => {
    const { mem, storage } = mk();
    expect(readSharePrefs(storage)).toEqual({ variant: null, format: null });
    expect(writeSharePrefs(storage, { variant: 'stats' })).toBe(true);
    expect(writeSharePrefs(storage, { format: 'story' })).toBe(true);
    expect(readSharePrefs(storage)).toEqual({ variant: 'stats', format: 'story' });
    mem.set(SHARE_PREFS_STORAGE_KEY, JSON.stringify({ variant: 'nope', format: 'square' }));
    expect(readSharePrefs(storage)).toEqual({ variant: null, format: null });
    mem.set(SHARE_PREFS_STORAGE_KEY, '{broken');
    expect(readSharePrefs(storage)).toEqual({ variant: null, format: null });
    const throwing = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('quota'); } };
    expect(readSharePrefs(throwing)).toEqual({ variant: null, format: null });
    expect(writeSharePrefs(throwing, { variant: 'quote' })).toBe(false);
    expect(writeSharePrefs(null, { variant: 'quote' })).toBe(false);
  });
  it('左右のスワイプで隣の重ね方へ（端では止まる）', () => {
    const v = ['record', 'stats', 'quote'];
    expect(stepVariant(v, 'record', 1)).toBe('stats');
    expect(stepVariant(v, 'stats', 1)).toBe('quote');
    expect(stepVariant(v, 'quote', 1)).toBe('quote');
    expect(stepVariant(v, 'stats', -1)).toBe('record');
    expect(stepVariant(v, 'record', -1)).toBe('record');
    expect(stepVariant(['record'], 'quote', 1)).toBe('record');
  });
});

describe('ロゴ（必ず入る・2026-10-05）', () => {
  it('どの形でも、決まりの大きさ・余白・安全な枠の中', () => {
    for (const fmt of ['post', 'story', 'square']) {
      const f = recordFrame(fmt);
      const b = logoBox(fmt);
      expect(b.wordH).toBeGreaterThanOrEqual(LOGO_RULES.minWordH);
      expect(f.wordH).toBeGreaterThanOrEqual(LOGO_RULES.minWordH);
      expect(b.x).toBeGreaterThanOrEqual(LOGO_RULES.minMargin);
      expect(b.baseline).toBeLessThanOrEqual(f.safeBottom);
      expect(b.clearTop).toBe(b.top - LOGO_RULES.clearance);
      // 記録のまとまりはロゴの上の空きより上に置く
      expect(placeRecordBlock(f, 300).bottom).toBeLessThanOrEqual(b.clearTop);
    }
    // 左端は重ね方の文字の左端にそろえられるが、72 より内側には寄せない
    expect(logoBox('post', { margin: 104 }).x).toBe(104);
    expect(logoBox('post', { margin: 10 }).x).toBe(LOGO_RULES.minMargin);
  });
});

describe('数字の重ね方（大きな数字を縦に積む）', () => {
  const kinds = (p) => p.elements.map((e) => e.kind);
  it('見出し → 書名 → 著者 → 数字（3 つまで）。隠した項目は場所を取らない', () => {
    const f = recordFrame('story');
    const p = statsStackPlan(f, { hasKicker: true, titleLines: 2, hasSub: true, statsCount: 5 });
    expect(kinds(p)).toEqual(['kicker', 'title', 'sub', 'stat', 'stat', 'stat']);
    p.elements.reduce((prev, e) => { expect(e.top).toBeGreaterThanOrEqual(prev); return e.top + e.height; }, 0);
    expect(statsStackPlan(f, { statsCount: 1 }).elements[0].top).toBe(0);
    expect(statsStackPlan(f, {}).height).toBe(0);
    // 数字は名前より大きく、記録の数字よりも大きい（Strava の大きな数字）
    expect(p.style.valueSize).toBeGreaterThan(p.style.labelSize * 3);
    expect(p.style.valueSize).toBeGreaterThan(f.statValueSize);
    // 写真の地（compact）は詰める＝写真を見せる。ストーリーでは画像の半分以下
    const c = statsStackPlan(f, { hasKicker: true, titleLines: 2, hasSub: true, statsCount: 3, compact: true });
    expect(c.height).toBeLessThan(p.height);
    expect(c.height).toBeLessThanOrEqual(f.H / 2);
    expect(c.style.valueSize).toBeGreaterThan(f.statValueSize);
  });
  it('どの組み合わせでも安全な枠に入り、ロゴの上の空きより上（言葉あり・表紙ありも）', () => {
    for (const fmt of ['post', 'story']) {
      const f = recordFrame(fmt);
      const logo = logoBox(fmt);
      for (let mask = 0; mask < 16; mask += 1) {
        const opt = { hasKicker: !!(mask & 1), titleLines: mask & 2 ? 2 : 0, hasSub: !!(mask & 4), statsCount: mask & 8 ? 3 : 1 };
        const h = statsStackPlan(f, opt).height;
        for (const phrase of [false, true]) {
          for (const coverCount of [0, 1, 4]) {
            const at = placeStatsStack(f, h, { phrase, coverCount });
            expect(at.fits, `${fmt} ${JSON.stringify(opt)}`).toBe(true);
            expect(at.top).toBeGreaterThanOrEqual(f.safeTop);
            expect(at.bottom).toBeLessThanOrEqual(logo.clearTop);
            if (at.cover) {
              expect(at.cover.y0).toBeGreaterThanOrEqual(f.safeTop);
              expect(at.cover.y0 + at.cover.h).toBeLessThan(at.top);
              expect(at.cover.x0).toBeGreaterThanOrEqual(f.margin);
            }
          }
        }
      }
    }
  });
  it('言葉を入れたら下に寄せる・表紙は言葉と重ねない', () => {
    const f = recordFrame('story');
    const h = statsStackPlan(f, { titleLines: 1, statsCount: 2 }).height;
    const mid = placeStatsStack(f, h);
    const low = placeStatsStack(f, h, { phrase: true, coverCount: 1 });
    expect(low.top).toBeGreaterThan(mid.top);
    expect(low.cover).toBeNull();
    expect(low.bottom).toBe(f.footerTop - f.gap);
    // 写真の地（align: 'bottom'）は下に寄せて、写真の上のほうを見せる
    const photo = placeStatsStack(f, h, { align: 'bottom' });
    expect(photo.bottom).toBe(f.footerTop - f.gap);
    expect(photo.top).toBeGreaterThan(mid.top);
  });
});

describe('隠した項目に合わせた組み（高さ・安全な枠）', () => {
  const kinds = (p) => p.elements.map((e) => e.kind);

  it('全部あるとき: 一文 → 見出し → 書名 → 著者 → 線 → 数字', () => {
    const f = recordFrame('story');
    const p = recordBlockPlan(f, { hasKicker: true, titleLines: 2, hasSub: true, statsCount: 3, quoteLines: 2, quoteLineHeight: 80 });
    expect(kinds(p)).toEqual(['quote', 'kicker', 'title', 'sub', 'rule', 'stats']);
    // 要素は重ならず、上から順に並ぶ
    p.elements.reduce((prevBottom, e) => { expect(e.top).toBeGreaterThanOrEqual(prevBottom); return e.top + e.height; }, 0);
    const last = p.elements[p.elements.length - 1];
    expect(p.height).toBe(last.top + last.height);
  });
  it('一文を除いた高さは、これまでの数え方と同じ', () => {
    const f = recordFrame('post');
    const kickerH = Math.round(f.kickerSize * 1.35) + 10;
    const titleH = 2 * Math.round(f.titleSize * 1.3);
    const subH = 6 + Math.round(f.subSize * 1.45);
    const statsH = Math.round(f.statLabelSize * 1.1) * 2 + Math.round(f.statLabelSize * 1.3) + 10 + f.statValueSize;
    expect(recordBaseHeight(f, { titleLines: 2, hasKicker: true, hasSub: true, statsCount: 3 })).toBe(kickerH + titleH + subH + statsH);
  });
  it('書名だけ: 書名が主役（1.25 倍・3 行まで）で、隠した項目の場所は残らない', () => {
    for (const fmt of ['post', 'story']) {
      const f = recordFrame(fmt);
      const p = recordBlockPlan(f, { titleLines: 1 });
      expect(kinds(p)).toEqual(['title']);
      expect(p.titleScale).toBe(recordTitleScale({ statsCount: 0 }));
      expect(p.titleScale).toBeGreaterThan(1);
      expect(p.height).toBe(Math.round(f.titleSize * 1.25 * 1.3));
      expect(recordBlockPlan(f, { titleLines: 5 }).height).toBe(3 * p.titleLH);
      // ロゴと日付を隠したら、ロゴの場所まで下ろす。どちらでも安全な枠の中。
      for (const hasFooter of [true, false]) {
        const at = placeRecordBlock(f, recordBlockPlan(f, { titleLines: 3 }).height, { hasFooter });
        expect(at.fits).toBe(true);
        expect(at.top).toBeGreaterThanOrEqual(f.safeTop);
        expect(at.bottom).toBeLessThanOrEqual(f.safeBottom);
      }
      expect(placeRecordBlock(f, 100, { hasFooter: false }).bottom).toBeGreaterThan(placeRecordBlock(f, 100).bottom);
    }
  });
  it('数字だけなら線を引かない・見出しだけなら後ろの間を足さない', () => {
    const f = recordFrame('story');
    const onlyStats = recordBlockPlan(f, { statsCount: 2 });
    expect(kinds(onlyStats)).toEqual(['stats']);
    expect(onlyStats.elements[0].top).toBe(0);
    const onlyKicker = recordBlockPlan(f, { hasKicker: true });
    expect(onlyKicker.height).toBe(Math.round(f.kickerSize * 1.35));
    expect(recordBlockPlan(f, {}).height).toBe(0);
  });
  it('どの組み合わせでも（一文なしで）安全な枠に入る', () => {
    for (const fmt of ['post', 'story']) {
      const f = recordFrame(fmt);
      for (let mask = 0; mask < 16; mask += 1) {
        const opt = { hasKicker: !!(mask & 1), titleLines: mask & 2 ? 3 : 0, hasSub: !!(mask & 4), statsCount: mask & 8 ? 3 : 0 };
        for (const hasFooter of [true, false]) {
          const at = placeRecordBlock(f, recordBlockPlan(f, opt).height, { hasFooter });
          expect(at.fits, `${fmt} ${JSON.stringify(opt)} footer=${hasFooter}`).toBe(true);
          expect(at.bottom).toBeLessThanOrEqual(f.safeBottom);
        }
      }
    }
  });
});

describe('表紙の置き方（写真でない地の記録）', () => {
  it('書名だけのときは、表紙を書名のすぐ上・左の余白にそろえる', () => {
    for (const fmt of ['post', 'story']) {
      const f = recordFrame(fmt);
      const place = placeRecordBlock(f, recordBlockPlan(f, { titleLines: 1 }).height);
      const at = recordCoverPlacement(f, place, { count: 1, titleOnly: true });
      expect(at.x0).toBe(f.margin);
      expect(at.y0 + at.h).toBe(place.top - f.gap);
      expect(at.y0).toBeGreaterThanOrEqual(f.safeTop);
    }
  });
  it('ふだんは上の空きの真ん中・空きが狭ければ出さない', () => {
    const f = recordFrame('story');
    const place = placeRecordBlock(f, 500);
    const at = recordCoverPlacement(f, place, { count: 1 });
    expect(at.y0).toBeGreaterThan(place.coverArea.top);
    expect(at.y0 + at.h).toBeLessThan(place.coverArea.bottom);
    expect(recordCoverPlacement(f, placeRecordBlock(f, f.H), { count: 1 })).toBeNull();
    expect(recordCoverPlacement(f, place, { count: 0 })).toBeNull();
  });
});

describe('hasFinishedThisMonth（振り返り › 記録から開いたときに「今月」を選んでおくか）', () => {
  const now = new Date(2026, 9, 1); // 2026-10-01
  it('今月に読了した本があれば true', () => {
    expect(hasFinishedThisMonth([{ id: 'a', status: 'done', doneDate: '2026-10-01' }], now)).toBe(true);
  });
  it('先月の読了・読書中だけなら false（いま読んでいる本に任せる）', () => {
    expect(hasFinishedThisMonth([
      { id: 'a', status: 'done', doneDate: '2026-09-30' },
      { id: 'b', status: 'reading' },
    ], now)).toBe(false);
    expect(hasFinishedThisMonth([], now)).toBe(false);
    expect(hasFinishedThisMonth(null, now)).toBe(false);
  });
});
