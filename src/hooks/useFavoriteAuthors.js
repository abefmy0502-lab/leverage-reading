// ✍️ お気に入りの著者（lib/favoriteAuthors.js・2026-11-25）。
//   開いて少したってから（ホームの最初の描画を待たせない）、覚えてから 1 日たった著者だけ書店に聞き直す（1 回に 5 人まで・
//   1.5 秒ずつ空ける）。読み終えるたびに news（ホームの 1 行）を出し直す。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  localFavoriteAuthors, loadFavoriteAuthors, addFavoriteAuthor, removeFavoriteAuthor, dismissAuthorBooks,
  fetchAuthorBooks, authorsToCheck, homeNewBook, authorKey, FAV_AUTHORS_CHANGED_EVENT, cachedAuthorBooks, newBooksFor,
} from '../lib/favoriteAuthors';

const START_DELAY_MS = 4000;
const GAP_MS = 1500;

export function useFavoriteAuthors(userId, { isOwned, active = true } = {}) {
  const [favs, setFavs] = useState(() => localFavoriteAuthors(userId));
  const [tick, setTick] = useState(0); // 著者の本を読み直したら +1（news を出し直す）
  const isOwnedRef = useRef(isOwned);
  isOwnedRef.current = isOwned;

  useEffect(() => {
    let alive = true;
    setFavs(localFavoriteAuthors(userId));
    loadFavoriteAuthors(userId).then((list) => { if (alive) setFavs(list); });
    const onChange = () => setFavs(localFavoriteAuthors(userId));
    window.addEventListener(FAV_AUTHORS_CHANGED_EVENT, onChange);
    return () => { alive = false; window.removeEventListener(FAV_AUTHORS_CHANGED_EVENT, onChange); };
  }, [userId]);

  // 書店に聞き直す（開いている間に 1 回・お気に入りが増えたらその人も）。
  const favKeys = favs.map((f) => f.key).join('|');
  useEffect(() => {
    if (!active || !userId || !favs.length) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      for (const f of authorsToCheck(favs)) {
        if (ctrl.signal.aborted) return;
        try {
          // eslint-disable-next-line no-await-in-loop
          const r = await fetchAuthorBooks(f.name, { signal: ctrl.signal });
          if (r.ok) setTick((t) => t + 1);
        } catch { return; }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((res) => setTimeout(res, GAP_MS));
      }
    }, START_DELAY_MS);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, userId, favKeys]);

  const news = useMemo(
    () => homeNewBook(favs, { isOwned: (b) => !!isOwnedRef.current?.(b) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [favs, tick],
  );

  const isFavorite = useCallback((name) => favs.some((f) => f.key === authorKey(name)), [favs]);
  const add = useCallback((name) => addFavoriteAuthor(userId, name), [userId]);
  const remove = useCallback((name) => removeFavoriteAuthor(userId, authorKey(name)), [userId]);
  const dismiss = useCallback((key, isbns) => dismissAuthorBooks(userId, key, isbns), [userId]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  // ホームの 1 行を閉じた＝その著者のいまの新しい本は、もう知らせない（次の新しい本はまた知らせる）。
  const dismissNews = useCallback(() => {
    if (!news) return;
    const list = newBooksFor(news.fav, cachedAuthorBooks(news.fav.name)?.books || [], { isOwned: (b) => !!isOwnedRef.current?.(b) });
    dismissAuthorBooks(userId, news.fav.key, list.map((b) => b.isbn));
  }, [news, userId]);

  return { favs, news, isFavorite, add, remove, dismiss, dismissNews, refresh };
}
