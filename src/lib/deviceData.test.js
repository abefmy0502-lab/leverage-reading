import { describe, it, expect } from 'vitest';
import { clearDeviceData } from './deviceData';

function memStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

describe('データの初期化・退会で端末の控えを消す', () => {
  it('決まったキーと接頭辞のキーだけを消す', () => {
    const store = memStore({
      'orime.readingSessions.v1': '[]',
      'orime.focus.v1': '{}',
      'orime.bookBrief.v1:abc': 'x',
      'orime.consult.actionAdded.v1': '{}',
      'orime.viewmap:u1': '{}',
      'orime.share.prefs': '{}',
      'orime.share.nudges': '{}',
      'orime.whatsnew.seen': '2026-10-09',
      theme: 'dark',
    });
    expect(clearDeviceData(store)).toBe(7);
    expect(store.keys().sort()).toEqual(['orime.whatsnew.seen', 'theme']);
  });
  it('保存場所が無くても落ちない', () => {
    expect(clearDeviceData(null)).toBe(0);
  });
});
