// 🔄 recall.js（想起の純ロジック）のユニットテスト。
// これはリポジトリ最初の自動テスト（#19 世界レベルへの基盤）。想起は Orime の
// 看板価値かつ Review/HomeRecall/push-cron の 3 箇所で挙動を共有するため、まず
// ここを回帰から守る。純関数のみ対象（I/O なし・決定的）。
//
// 実行: npm test（vitest run）

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  relativeJa,
  recallFraming,
  memoExcerpt,
  dueGapDays,
  pickRecallMemo,
  recallPatch,
} from './recall.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 6, 4, 0, 0, 0); // 固定 now（決定的）
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

describe('relativeJa', () => {
  it('空/不正入力は空文字', () => {
    expect(relativeJa('', NOW)).toBe('');
    expect(relativeJa('not-a-date', NOW)).toBe('');
  });
  it('直近はさっき/分/時間/日/週/月/年で区切る', () => {
    expect(relativeJa(iso(30 * 1000), NOW)).toBe('さっき');
    expect(relativeJa(iso(5 * 60 * 1000), NOW)).toBe('5分前');
    expect(relativeJa(iso(3 * 3600 * 1000), NOW)).toBe('3時間前');
    expect(relativeJa(iso(5 * DAY), NOW)).toBe('5日前');
    expect(relativeJa(iso(14 * DAY), NOW)).toBe('2週間前');
    expect(relativeJa(iso(90 * DAY), NOW)).toBe('3ヶ月前');
    expect(relativeJa(iso(400 * DAY), NOW)).toBe('1年前');
  });
});

describe('recallFraming', () => {
  it('今日書いたばかり（<1日）は空＝想起フレーズを出さない', () => {
    expect(recallFraming(iso(3 * 3600 * 1000), NOW)).toBe('');
  });
  it('1日以上前は「◯◯のあなたのメモ」', () => {
    expect(recallFraming(iso(90 * DAY), NOW)).toBe('3ヶ月前のあなたのメモ');
  });
});

describe('memoExcerpt', () => {
  it('制御文字・ゼロ幅・改行を掃除して1行化する', () => {
    expect(memoExcerpt('a\nb\tc', 100)).toBe('a b c');
    expect(memoExcerpt('x​y﻿z', 100)).toBe('xyz');
  });
  it('max を超えたら … で clamp（末尾を含めて max 文字）', () => {
    const out = memoExcerpt('あ'.repeat(200), 10);
    expect(out.length).toBe(10);
    expect(out.endsWith('…')).toBe(true);
  });
  it('空/非文字列は空文字', () => {
    expect(memoExcerpt('', 10)).toBe('');
    expect(memoExcerpt(null, 10)).toBe('');
  });
});

describe('dueGapDays', () => {
  it('recall_count を index に間隔を返し、上限でクランプ', () => {
    expect(dueGapDays(0)).toBe(1);
    expect(dueGapDays(2)).toBe(7);
    expect(dueGapDays(6)).toBe(140);
    expect(dueGapDays(999)).toBe(140); // クランプ
    expect(dueGapDays(-5)).toBe(1); // 負値は 0 扱い
    expect(dueGapDays(undefined)).toBe(1);
  });
});

describe('pickRecallMemo', () => {
  it('空配列は null', () => {
    expect(pickRecallMemo([], { now: NOW })).toBeNull();
    expect(pickRecallMemo(null, { now: NOW })).toBeNull();
  });

  it('本文が空の候補は除外し、due が無ければ null', () => {
    const notes = [{ id: '1', text: '   ', createdAt: iso(100 * DAY) }];
    expect(pickRecallMemo(notes, { now: NOW })).toBeNull();
  });

  it('未想起メモは minAgeDays を満たさないと出さない', () => {
    const notes = [{ id: '1', text: 'young', createdAt: iso(2 * DAY) }];
    // 既定 minAgeDays=14 → 2日前は未 due
    expect(pickRecallMemo(notes, { now: NOW })).toBeNull();
    // minAgeDays=1 なら due
    expect(pickRecallMemo(notes, { now: NOW, minAgeDays: 1 })?.id).toBe('1');
  });

  it('想起済みは前回想起 + dueGapDays を過ぎるまで出さない', () => {
    // recall_count=2 → 間隔 7 日。前回想起が 3 日前ならまだ未 due。
    const notDue = [{
      id: 'r', text: 'reviewed', createdAt: iso(100 * DAY),
      lastRecalledAt: iso(3 * DAY), recallCount: 2,
    }];
    expect(pickRecallMemo(notDue, { now: NOW })).toBeNull();
    // 前回想起が 10 日前なら due（7 日間隔を超過）。
    const due = [{
      id: 'r', text: 'reviewed', createdAt: iso(100 * DAY),
      lastRecalledAt: iso(10 * DAY), recallCount: 2,
    }];
    expect(pickRecallMemo(due, { now: NOW })?.id).toBe('r');
  });

  it('due なメモだけが候補になる（若すぎるメモは除外され due な方が選ばれる）', () => {
    const notes = [
      { id: 'young', text: 'a', createdAt: iso(10 * DAY) }, // <14日 → 未 due（除外）
      { id: 'old', text: 'b', createdAt: iso(200 * DAY) },  // due
    ];
    // 候補が 'old' 1 件だけになるので seed に依らず決定的に 'old'。
    expect(pickRecallMemo(notes, { now: NOW, seed: 0 })?.id).toBe('old');
    expect(pickRecallMemo(notes, { now: NOW, seed: 7 })?.id).toBe('old');
  });

  it('同じ入力・同じ seed は決定的（日替わり安定）', () => {
    const notes = [
      { id: 'a', text: 'a', createdAt: iso(50 * DAY) },
      { id: 'b', text: 'b', createdAt: iso(60 * DAY) },
      { id: 'c', text: 'c', createdAt: iso(70 * DAY) },
    ];
    const p1 = pickRecallMemo(notes, { now: NOW, seed: 42 });
    const p2 = pickRecallMemo(notes, { now: NOW, seed: 42 });
    expect(p1?.id).toBe(p2?.id);
  });
});

describe('recallPatch', () => {
  afterEach(() => vi.useRealTimers());

  it('「覚えた」は recall_count を +1', () => {
    const p = recallPatch(2, true);
    expect(p.recall_count).toBe(3);
    expect(typeof p.last_recalled_at).toBe('string');
  });
  it('「もう一度」は recall_count 据え置き', () => {
    expect(recallPatch(2, false).recall_count).toBe(2);
  });
  it('null/undefined count は 0 起点', () => {
    expect(recallPatch(undefined, true).recall_count).toBe(1);
    expect(recallPatch(null, false).recall_count).toBe(0);
  });
  it('last_recalled_at は現在時刻の ISO', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T12:00:00.000Z'));
    expect(recallPatch(0, true).last_recalled_at).toBe('2026-07-04T12:00:00.000Z');
  });
});
