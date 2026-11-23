import { describe, it, expect } from 'vitest';
import { readLibraryShape, writeLibraryShape, LIBRARY_SHAPE_KEY } from './libraryShape';

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

describe('libraryShape', () => {
  it('はじめて（何も覚えていない）は検索なし・状態の行あり・フォルダなし', () => {
    expect(readLibraryShape(mem())).toEqual({ search: false, status: true, folders: false });
  });
  it('表示の形を覚えている（本を出したことがある）なら検索あり', () => {
    expect(readLibraryShape(mem({ bookshelfViewLast: 'grid' }))).toEqual({ search: true, status: true, folders: false });
  });
  it('書いた形を読み戻す', () => {
    const s = mem();
    writeLibraryShape({ search: true, status: false, folders: true }, s);
    expect(readLibraryShape(s)).toEqual({ search: true, status: false, folders: true });
  });
  it('壊れた値・読めない端末でも落ちない', () => {
    expect(readLibraryShape(mem({ [LIBRARY_SHAPE_KEY]: '{' }))).toEqual({ search: true, status: true, folders: false });
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readLibraryShape(broken)).toEqual({ search: true, status: true, folders: false });
    expect(() => writeLibraryShape({ search: true }, broken)).not.toThrow();
  });
});
