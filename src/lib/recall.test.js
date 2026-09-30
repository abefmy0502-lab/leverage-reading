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
  noteDueAt,
  pickFallbackMemo,
  nextDueAt,
  nextDueLabel,
  applyLocalRecall,
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
    expect(relativeJa(iso(5 * 60 * 1000), NOW)).toBe('5 分前');
    expect(relativeJa(iso(3 * 3600 * 1000), NOW)).toBe('3 時間前');
    expect(relativeJa(iso(5 * DAY), NOW)).toBe('5 日前');
    expect(relativeJa(iso(14 * DAY), NOW)).toBe('2 週間前');
    expect(relativeJa(iso(90 * DAY), NOW)).toBe('3 か月前');
    expect(relativeJa(iso(400 * DAY), NOW)).toBe('1 年前');
  });
});

describe('recallFraming', () => {
  it('今日書いたばかり（<1日）は空＝想起フレーズを出さない', () => {
    expect(recallFraming(iso(3 * 3600 * 1000), NOW)).toBe('');
  });
  it('1日以上前は「◯◯のあなたのメモ」', () => {
    expect(recallFraming(iso(90 * DAY), NOW)).toBe('3 か月前のあなたのメモ');
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
  it('「もう一度」は recall_count を 0 に戻す（翌日また出る）', () => {
    expect(recallPatch(2, false).recall_count).toBe(0);
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

// 🐛 2026-10-01「覚えたと登録しても、何回も覚えたか？聞かれる」の回帰テスト。
describe('pickFallbackMemo（due なメモが無いときの控え）', () => {
  const young = (id, daysAgo) => ({ id, text: `若い${id}`, createdAt: iso(daysAgo * DAY) });
  const mastered = (id, recalledDaysAgo, count = 1) => ({
    id, text: `覚えた${id}`, createdAt: iso(200 * DAY), lastRecalledAt: iso(recalledDaysAgo * DAY), recallCount: count,
  });

  it('覚えたばかり（次の間隔が来ていない）メモは出さない', () => {
    const notes = [mastered('a', 0), mastered('b', 1), mastered('c', 2, 3)];
    expect(pickRecallMemo(notes, { now: NOW })).toBeNull();
    expect(pickFallbackMemo(notes, { now: NOW })).toBeNull();
    for (let seed = 0; seed < 20; seed += 1) {
      expect(pickFallbackMemo(notes, { now: NOW, seed })).toBeNull();
    }
  });
  it('「まだ覚えていない」（count=0・今日答えた）も翌日までは出さない', () => {
    const notes = [{ ...mastered('a', 0), recallCount: 0 }];
    expect(pickFallbackMemo(notes, { now: NOW })).toBeNull();
  });
  it('始めたばかりの人（一度も思い出していない若いメモだけ）には控えを出す', () => {
    const notes = [young('y1', 2), young('y2', 5)];
    expect(pickRecallMemo(notes, { now: NOW })).toBeNull();
    const got = pickFallbackMemo(notes, { now: NOW });
    expect(['y1', 'y2']).toContain(got.id);
  });
  it('覚えたメモと若いメモが混ざっても、選ぶのは若いメモだけ', () => {
    const notes = [mastered('a', 0), mastered('b', 1), young('y', 3)];
    for (let seed = 0; seed < 20; seed += 1) {
      expect(pickFallbackMemo(notes, { now: NOW, seed }).id).toBe('y');
    }
  });
  it('本文が空のメモは出さない', () => {
    expect(pickFallbackMemo([{ id: 'e', text: '  ', createdAt: iso(DAY) }], { now: NOW })).toBeNull();
  });
});

describe('nextDueAt / nextDueLabel（「今日の思い出しカードは、ここまでです」）', () => {
  it('何も残っていないとき、いちばん早く来る時刻を返す', () => {
    const a = { id: 'a', text: 'a', createdAt: iso(100 * DAY), lastRecalledAt: iso(1 * DAY), recallCount: 1 }; // 3 日後 → あと 2 日
    const b = { id: 'b', text: 'b', createdAt: iso(100 * DAY), lastRecalledAt: iso(1 * DAY), recallCount: 2 }; // 7 日後 → あと 6 日
    expect(pickRecallMemo([a, b], { now: NOW })).toBeNull();
    expect(pickFallbackMemo([a, b], { now: NOW })).toBeNull();
    expect(nextDueAt([a, b], { now: NOW })).toBe(NOW + 2 * DAY);
  });
  it('もう due なメモは数えない・メモが無ければ null', () => {
    const due = { id: 'd', text: 'd', createdAt: iso(100 * DAY), lastRecalledAt: iso(10 * DAY), recallCount: 1 };
    expect(nextDueAt([due], { now: NOW })).toBeNull();
    expect(nextDueAt([], { now: NOW })).toBeNull();
  });
  it('未想起の若いメモは作成から 14 日後', () => {
    const y = { id: 'y', text: 'y', createdAt: iso(3 * DAY) };
    expect(noteDueAt(y)).toBe(NOW + 11 * DAY);
  });
  it('文: 今日／明日／◯月◯日', () => {
    const base = new Date(2026, 8, 30, 9, 0, 0).getTime(); // 端末の 9/30 9:00
    expect(nextDueLabel(base + 3 * 3600 * 1000, base)).toBe('次は今日、あとで出します');
    expect(nextDueLabel(base + DAY, base)).toBe('次は明日出します');
    expect(nextDueLabel(base + 2 * DAY, base)).toBe('次は 10月2日に出します');
    expect(nextDueLabel(null, base)).toBe('');
  });
});

describe('applyLocalRecall（端末に残した記録を重ねる）', () => {
  const note = { id: 'm', text: 't', createdAt: iso(100 * DAY), lastRecalledAt: null, recallCount: 0 };
  it('DB に記録が無ければ端末の記録を使う', () => {
    const got = applyLocalRecall(note, { at: iso(DAY), count: 2 });
    expect(got.lastRecalledAt).toBe(iso(DAY));
    expect(got.recallCount).toBe(2);
  });
  it('端末の記録が新しければ端末を使う', () => {
    const got = applyLocalRecall({ ...note, lastRecalledAt: iso(10 * DAY), recallCount: 1 }, { at: iso(DAY), count: 2 });
    expect(got.lastRecalledAt).toBe(iso(DAY));
    expect(got.recallCount).toBe(2);
  });
  it('DB の記録が新しければ DB のまま', () => {
    const db = { ...note, lastRecalledAt: iso(DAY), recallCount: 3 };
    expect(applyLocalRecall(db, { at: iso(5 * DAY), count: 1 })).toBe(db);
  });
  it('記録が無い・壊れているときはそのまま', () => {
    expect(applyLocalRecall(note, null)).toBe(note);
    expect(applyLocalRecall(note, { at: 'x', count: 1 })).toBe(note);
  });
  it('重ねた結果、覚えたメモは控えにも出ない', () => {
    const got = applyLocalRecall({ ...note, createdAt: iso(3 * DAY) }, { at: iso(0), count: 1 });
    expect(pickRecallMemo([got], { now: NOW })).toBeNull();
    expect(pickFallbackMemo([got], { now: NOW })).toBeNull();
  });
});
