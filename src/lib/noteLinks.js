// 📘 note の説明書へのリンク（2026-11-25 オーナー「note の役割は世の中に詳細な機能を伝える役割・そのままユーザーには説明書として使いたい・
//   note は AIO に強い」）。
//
// 中身の正は public/note-links.json（{ home, guides: { <ヘルプのキー>: <記事の URL> } }）。
//   アプリのヘルプは「使い方を短く」、note は「くわしい説明書」。ヘルプの下の 1 行と設定の 1 行から開く。
//   iPhone のアプリも本番サイトの JSON を読む＝記事を足しても出し直しが要らない（読めなければ端末の控え・それも無ければ出さない）。
//   URL は note.com の https だけを通す（ほかの場所に飛ばさない）。空なら何も出さない。
import { isNative } from './iap';
import { SITE_URL } from './legalLinks';

const CACHE_KEY = 'orime.noteLinks.v1';
const NOTE_URL_RE = /^https:\/\/note\.com\/[A-Za-z0-9_]{1,40}(?:\/[A-Za-z0-9_/-]{0,200})?$/;

export const isNoteUrl = (u) => typeof u === 'string' && NOTE_URL_RE.test(u.trim());

/** JSON の形を確かめて、note.com の URL だけを残す。 */
export function normalizeNoteLinks(raw) {
  const out = { home: '', guides: {} };
  if (!raw || typeof raw !== 'object') return out;
  if (isNoteUrl(raw.home)) out.home = raw.home.trim();
  const g = raw.guides && typeof raw.guides === 'object' ? raw.guides : {};
  Object.keys(g).slice(0, 100).forEach((k) => {
    if (/^[A-Za-z0-9_]{1,40}$/.test(k) && isNoteUrl(g[k])) out.guides[k] = g[k].trim();
  });
  return out;
}

/** その画面のくわしい記事（無ければ note のトップ・どちらも無ければ ''）。 */
export function noteGuideUrl(links, helpKey) {
  if (!links) return '';
  return (helpKey && links.guides?.[helpKey]) || links.home || '';
}

export function readCachedNoteLinks() {
  try { return normalizeNoteLinks(JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')); } catch { return normalizeNoteLinks(null); }
}

let inflight = null;
/** 本番サイトの note-links.json を読む（アプリを開いている間は 1 回）。失敗したら端末の控え。 */
export function loadNoteLinks({ fetchImpl = typeof fetch === 'function' ? fetch : null } = {}) {
  if (inflight) return inflight;
  inflight = (async () => {
    if (!fetchImpl) return readCachedNoteLinks();
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    try {
      const url = isNative ? `${SITE_URL}/note-links.json` : '/note-links.json';
      const res = await fetchImpl(url, { cache: 'no-cache', signal: ctrl?.signal });
      if (!res?.ok) throw new Error('bad status');
      const links = normalizeNoteLinks(await res.json());
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(links)); } catch { /* ignore */ }
      return links;
    } catch {
      inflight = null; // 次に開いたときにもう一度
      return readCachedNoteLinks();
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  return inflight;
}

export function _resetNoteLinksForTest() { inflight = null; }
