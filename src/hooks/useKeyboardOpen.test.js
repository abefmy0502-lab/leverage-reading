// 下のタブを隠す「キーボードが開いている」の判定（2026-11-08）: 入力欄がカーソルを持ったまま消えても元に戻る。偽の document で。
import { describe, it, expect, vi } from 'vitest';
import { attachKeyboardWatch, RECHECK_MS } from './useKeyboardOpen';

function fakeDom({ vv = null } = {}) {
  const listeners = {};
  const on = (t, fn) => { (listeners[t] ||= []).push(fn); };
  const off = (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); };
  const fire = (t, e = {}) => (listeners[t] || []).forEach((fn) => fn(e));
  const doc = { activeElement: null, addEventListener: on, removeEventListener: off };
  const win = { innerHeight: 800, visualViewport: vv, addEventListener: on, removeEventListener: off };
  return { doc, win, fire };
}
const field = (connected = true) => ({ tagName: 'TEXTAREA', isConnected: connected });

describe('attachKeyboardWatch', () => {
  it('入力欄にカーソルで開く・外れたら閉じる', () => {
    vi.useFakeTimers();
    const { doc, win, fire } = fakeDom();
    const seen = [];
    attachKeyboardWatch((o) => seen.push(o), { doc, win });
    const ta = field();
    doc.activeElement = ta; fire('focusin', { target: ta });
    expect(seen).toEqual([true]);
    doc.activeElement = null; fire('focusout', { target: ta }); vi.advanceTimersByTime(100);
    expect(seen).toEqual([true, false]);
    vi.useRealTimers();
  });
  it('カーソルを持ったまま入力欄が消えても、0.5 秒で閉じる（focusout が来ない）', () => {
    vi.useFakeTimers();
    const { doc, win, fire } = fakeDom();
    const seen = [];
    attachKeyboardWatch((o) => seen.push(o), { doc, win });
    const ta = field();
    doc.activeElement = ta; fire('focusin', { target: ta });
    ta.isConnected = false; // 画面から消えたが activeElement に残る
    vi.advanceTimersByTime(RECHECK_MS + 10);
    expect(seen).toEqual([true, false]);
    vi.useRealTimers();
  });
  it('指で触ったときにも確かめる', () => {
    const { doc, win, fire } = fakeDom();
    const seen = [];
    attachKeyboardWatch((o) => seen.push(o), { doc, win, setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    const ta = field();
    doc.activeElement = ta; fire('focusin', { target: ta });
    doc.activeElement = { tagName: 'DIV' }; fire('pointerdown');
    expect(seen).toEqual([true, false]);
  });
  it('入力欄にカーソルが無いときの画面の縮みは、キーボードとみなさない', () => {
    const vv = { height: 500, addEventListener: () => {}, removeEventListener: () => {} };
    const { doc, win } = fakeDom({ vv });
    const seen = [];
    attachKeyboardWatch((o) => seen.push(o), { doc, win });
    expect(seen).toEqual([]);
  });
  it('iOS のアプリは知らせだけを信じる（カーソルだけでは開かない・閉じる知らせで閉じる）', () => {
    const { doc, win, fire } = fakeDom();
    const seen = [];
    attachKeyboardWatch((o) => seen.push(o), { doc, win, setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    fire('orime:native-keyboard', { detail: { open: true } });
    const ta = field(); doc.activeElement = ta; fire('focusin', { target: ta });
    fire('orime:native-keyboard', { detail: { open: false } });
    expect(seen).toEqual([true, false]);
  });
  it('iOS のアプリで「閉じた」知らせが来なくても、カーソルが外れていれば 0.5 秒で閉じる', () => {
    vi.useFakeTimers();
    const { doc, win, fire } = fakeDom();
    const seen = [];
    attachKeyboardWatch((o) => seen.push(o), { doc, win });
    const ta = field(); doc.activeElement = ta;
    fire('orime:native-keyboard', { detail: { open: true } });
    expect(seen).toEqual([true]);
    doc.activeElement = null;
    vi.advanceTimersByTime(RECHECK_MS + 10);
    expect(seen).toEqual([true, false]);
    vi.useRealTimers();
  });
});
