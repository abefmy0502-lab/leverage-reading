import { useEffect, useState } from 'react';
import { loadNoteLinks, readCachedNoteLinks } from '../lib/noteLinks';

// 📘 note の説明書のリンク（端末の控えで先に描き、本番サイトの JSON が届いたら差し替える）。
// お試しモード（開発中だけ）: &note=1 で見本の URL を入れる。
function demoLinks() {
  if (!import.meta.env.DEV) return null;
  try {
    if (new URLSearchParams(window.location.search).get('note') !== '1') return null;
  } catch { return null; }
  return { home: 'https://note.com/orime_app', guides: { myBookBrain: 'https://note.com/orime_app/n/n0consult' } };
}

export function useNoteLinks() {
  const [links, setLinks] = useState(() => demoLinks() || readCachedNoteLinks());
  useEffect(() => {
    if (demoLinks()) return undefined;
    let alive = true;
    loadNoteLinks().then((l) => { if (alive && l) setLinks(l); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return links;
}
