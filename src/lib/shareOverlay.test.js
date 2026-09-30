// 📷 写真で共有の決めごと（どの本・どの数字・どの一文・安全な枠）のテスト。canvas は使わない。

import { describe, it, expect } from 'vitest';
import {
  pickShareSubject, subjectChoices, bookRecord, monthRecord, splitStatValue,
  orderQuoteCandidates, quoteText, swapQuote, swapQuoteLabel, availableVariants, defaultVariant,
  recordFrame, placeRecordBlock, statColumns, buildRecordShareText, fmtMonthDay, fmtStamp, RECORD_QUOTE_MAX,
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
      { label: '読了', value: '9月28日' },
      { label: 'メモ', value: '3件' },
      { label: '実行した行動', value: '2件' },
    ]);
  });
  it('読書中: 読みはじめの日。0 の数字は出さない', () => {
    const r = bookRecord({ title: 'X', status: 'reading', startDate: '2026-09-21' }, [], NOW);
    expect(r.kicker).toBe('読書中');
    expect(r.stats).toEqual([{ label: '読みはじめ', value: '9月21日' }]);
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
      { label: '読了', value: '3冊' },
      { label: 'メモ', value: '1件' },
      { label: '実行した行動', value: '1件' },
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
  it('数字の列は余白の内側で等分', () => {
    const f = recordFrame('post');
    const cols = statColumns(f, 3);
    expect(cols).toHaveLength(3);
    expect(cols[0].x).toBe(f.margin);
    expect(cols[2].x + cols[2].width).toBeCloseTo(f.W - f.margin);
    expect(statColumns(f, 5)).toHaveLength(3);
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
