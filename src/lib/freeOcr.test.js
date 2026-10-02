import { describe, it, expect } from 'vitest';
import {
  FREE_OCR_PER_MONTH, freeOcrPeriodKey, freeOcrRemaining, freeOcrHintParts, freeOcrTapAction,
} from './freeOcr';
import { isAiNoticeString, isClaudeErrorString } from './ai';
import * as server from '../../api/_aiAccess.js';

describe('📷 無料プランの写真から書き起こし（画面の写し）', () => {
  it('回数と行のキーはサーバーの既定と同じ（日本時間の月）', () => {
    expect(FREE_OCR_PER_MONTH).toBe(server.freeOcrPerMonth({}));
    const now = Date.parse('2026-09-30T16:00:00Z'); // 日本時間 10/1
    expect(freeOcrPeriodKey(now)).toBe('freeocr-2026-10');
    expect(freeOcrPeriodKey(now)).toBe(server.freeOcrPeriodKey(server.jstMonthKey(now)));
  });

  it('残り = 上限 − 使った回数（0 未満にしない・分からなければ null）', () => {
    expect(freeOcrRemaining(10, 0)).toBe(10);
    expect(freeOcrRemaining(10, 2)).toBe(8);
    expect(freeOcrRemaining(10, 10)).toBe(0);
    expect(freeOcrRemaining(10, 12)).toBe(0);
    expect(freeOcrRemaining(10, null)).toBe(null);
    expect(freeOcrRemaining(10, undefined)).toBe(null);
  });

  it('ボタンのそばの 1 行: 無料プランだけ・残りがあれば「今月の残り N 回」', () => {
    expect(freeOcrHintParts({ freeMode: true, remaining: 8 })).toEqual(['今月の残り 8 回']);
    expect(freeOcrHintParts({ freeMode: true, remaining: 1 })).toEqual(['今月の残り 1 回']);
  });

  it('0 回: 「◯月1日に戻ります」（日本時間の来月・12 月は 1 月へ）', () => {
    expect(freeOcrHintParts({ freeMode: true, remaining: 0, now: new Date('2026-10-02T03:00:00Z') }))
      .toEqual(['今月の残り 0 回・', '11月1日に戻ります']);
    expect(freeOcrHintParts({ freeMode: true, remaining: 0, now: new Date('2026-12-15T03:00:00Z') })[1]).toBe('1月1日に戻ります');
    // 日本時間ではもう 11 月（UTC は 10/31）
    expect(freeOcrHintParts({ freeMode: true, remaining: 0, now: new Date('2026-10-31T16:00:00Z') })[1]).toBe('12月1日に戻ります');
  });

  it('プランの人・分からないときは出さない', () => {
    expect(freeOcrHintParts({ freeMode: false, remaining: 8 })).toBe(null);
    expect(freeOcrHintParts({ freeMode: false, remaining: null })).toBe(null);
    expect(freeOcrHintParts({ freeMode: true, remaining: null })).toBe(null);
  });

  it('押したとき: 無料プランで 0 回なら有料プランの画面・それ以外は写真を選ぶ（止めるのはサーバー）', () => {
    expect(freeOcrTapAction({ freeMode: true, remaining: 0 })).toBe('paywall');
    expect(freeOcrTapAction({ freeMode: true, remaining: 3 })).toBe('pick');
    expect(freeOcrTapAction({ freeMode: true, remaining: null })).toBe('pick');
    expect(freeOcrTapAction({ freeMode: false, remaining: 0 })).toBe('pick');
  });

  it('使い切りの案内（402）はエラーではなく案内として扱う（書き起こしの本文にしない）', () => {
    const msg = server.freeOcrLimitMessage(10, Date.parse('2026-10-02T03:00:00Z'));
    expect(isAiNoticeString(msg)).toBe(true);
    expect(isClaudeErrorString(msg)).toBe(true);
  });
});
