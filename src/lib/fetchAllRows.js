// Supabase は 1 回の取得が既定で 1000 行まで。使い込んだ人のメモ・行動が
// 黙って欠けないように、ページを分けて全部取る（上限 maxPages ページは安全弁）。
// makeQuery: 毎回新しいクエリを返す関数（.from().select().eq().order() まで）。
// 並びが一意になるよう、呼び出し側で id の並びも付けること（ページ境界の重複・欠落防止）。
// 返り値は Supabase と同じ形 { data, error }。
export async function fetchAllRows(makeQuery, { pageSize = 1000, maxPages = 10 } = {}) {
  let rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await makeQuery().range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return { data: page === 0 ? null : rows, error };
    rows = rows.concat(data || []);
    if (!data || data.length < pageSize) break;
  }
  return { data: rows, error: null };
}
