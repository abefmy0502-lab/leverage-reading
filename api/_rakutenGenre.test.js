import { describe, it, expect } from 'vitest';
import { parseGenreIds } from './_rakutenGenre.js';

describe('parseGenreIds（楽天ブックスのジャンル ID）', () => {
  it('/ 区切りを配列に・本（001…）の形だけ・重ねない', () => {
    expect(parseGenreIds('001004008001/001019001')).toEqual(['001004008001', '001019001']);
    expect(parseGenreIds('001006/001006')).toEqual(['001006']);
    expect(parseGenreIds('002101/abc/001')).toEqual(['001']);
    expect(parseGenreIds('')).toEqual([]);
    expect(parseGenreIds(undefined)).toEqual([]);
  });
});
