import { describe, it, expect } from 'vitest';
import { fetchAllRows } from './fetchAllRows';

const fakeTable = (n) => {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  return () => ({ range: async (a, b) => ({ data: rows.slice(a, b + 1), error: null }) });
};

describe('fetchAllRows', () => {
  it('1000 件を超えても全部取る', async () => {
    const { data, error } = await fetchAllRows(fakeTable(2345));
    expect(error).toBeNull();
    expect(data).toHaveLength(2345);
    expect(data[2344].id).toBe(2344);
  });
  it('ちょうど 1000 件でも止まる', async () => {
    const { data } = await fetchAllRows(fakeTable(1000));
    expect(data).toHaveLength(1000);
  });
  it('最初のページで失敗したらエラーを返す', async () => {
    const { data, error } = await fetchAllRows(() => ({ range: async () => ({ data: null, error: { message: 'x' } }) }));
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'x' });
  });
});
