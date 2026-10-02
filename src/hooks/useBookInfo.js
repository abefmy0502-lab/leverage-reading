// 📖 本の詳細の「この本について」用: 本の紹介文と目次（lib/bookInfo.js）を読む。
//   戻り値 { info, loading }。info は null（見つからない・まだ）か { description, toc, … }。
//   enabled が false の間は取りに行かない（読了の本など、出さない画面）。
import { useEffect, useState } from 'react';
import { bookInfoKey, loadBookInfo, peekBookInfo } from '../lib/bookInfo';

export function useBookInfo(book, { enabled = true } = {}) {
  const key = enabled ? bookInfoKey(book) : '';
  const [state, setState] = useState(() => {
    const known = key ? peekBookInfo(book) : null;
    return { key, info: known || null, loading: !!key && known === undefined };
  });

  useEffect(() => {
    if (!key) { setState({ key: '', info: null, loading: false }); return undefined; }
    const known = peekBookInfo(book);
    if (known !== undefined) { setState({ key, info: known, loading: false }); return undefined; }
    let alive = true;
    setState({ key, info: null, loading: true });
    loadBookInfo(book).then((info) => { if (alive) setState({ key, info, loading: false }); });
    return () => { alive = false; };
    // 本が変わったとき（鍵が変わったとき）だけ取り直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 鍵が変わった直後の 1 回は前の本の中身を見せない。
  if (state.key !== key) {
    const known = key ? peekBookInfo(book) : null;
    return { info: known || null, loading: !!key && known === undefined };
  }
  return { info: state.info, loading: state.loading };
}
