import { describe, it, expect } from 'vitest';
import { homeActionsSummary, daysUntilDeadline } from './homeActions';
import { actionResultQuestion, memoConsultQuestion } from './consultHelpers';

const now = new Date('2026-10-10T09:00:00');
const day = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

describe('homeActionsSummary', () => {
  it('無ければ null', () => {
    expect(homeActionsSummary([], now)).toBeNull();
    expect(homeActionsSummary([{ text: 'a', deadline: day(3) }, { text: 'b', deadline: null }], now)).toBeNull();
    expect(homeActionsSummary([{ text: 'a', deadline: day(0), done: true }], now)).toBeNull();
  });
  it('今日が期限なら今日の行動', () => {
    const s = homeActionsSummary([{ text: '明日の', deadline: day(1) }, { text: '今日の', deadline: day(0) }], now);
    expect(s).toMatchObject({ kind: 'today', label: '今日の行動', count: 1 });
    expect(s.first.text).toBe('今日の');
  });
  it('過ぎたものがあれば今日までの行動（古い順）', () => {
    const s = homeActionsSummary([{ text: '今日', deadline: day(0) }, { text: '先週', deadline: day(-5) }], now);
    expect(s).toMatchObject({ label: '今日までの行動', count: 2 });
    expect(s.first.text).toBe('先週');
  });
  it('明日だけなら明日の行動（優先の高い順）', () => {
    const s = homeActionsSummary([{ text: 'ふつう', deadline: day(1) }, { text: '優先', deadline: day(1), priority: 'high' }], now);
    expect(s).toMatchObject({ kind: 'tomorrow', label: '明日の行動', count: 2 });
    expect(s.first.text).toBe('優先');
  });
  it('日数', () => {
    expect(daysUntilDeadline(day(-1), now)).toBe(-1);
    expect(daysUntilDeadline('', now)).toBeNull();
  });
});

describe('相談の下書き', () => {
  it('行動の結果', () => {
    expect(actionResultQuestion('上司に先に結論を話す', '早く終わった。')).toBe('「上司に先に結論を話す」をやってみました。早く終わった。次はどうしたらいい？');
    expect(actionResultQuestion('上司に話す')).toBe('「上司に話す」をやってみました。次はどうしたらいい？');
    expect(actionResultQuestion('「結論」から話す')).toBe('「『結論』から話す」をやってみました。次はどうしたらいい？');
    expect(actionResultQuestion('')).toBe('');
  });
  it('メモ', () => {
    expect(memoConsultQuestion('「問い」を先に立てる')).toBe('「『問い』を先に立てる」と書いたメモを、いまの自分にどう活かせる？');
    expect(memoConsultQuestion('あ'.repeat(60)).length).toBeLessThan(80);
  });
});
