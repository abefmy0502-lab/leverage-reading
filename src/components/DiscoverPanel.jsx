// 📚🏬 話題の本を探す（本屋をぶらぶら）— カバー主役・横スクロールの棚を縦に並べる。
//
// 思想（ユーザーの狙い）:
//   ①思いがけない出会い … カバーが視界に入る横スクロール棚 + 日替わりローテ +
//     ジャンル横断の「今日の平台」「あえての一冊」で、予定してなかった本に出会う。
//   ②時代感度 … いま読まれてるビジネス書 / 話題の新刊（楽天の実データ）。
//   ③Orimeらしさ … パーソナルは"1棚"だけ（フィルターバブルで出会いを殺さない）。
//     AI は「目利き書店員」役として、あえての一冊に一行POPを添える（本は実在データ）。
//
// データは api/discover.js（楽天プロキシ）。未設定なら reason:'not_configured'。
//
// 品質メモ（監査反映）: 棚はビューポート近接で遅延ロード（初回リクエスト集中を抑制）、
// CoverThumb は memo + 追加ボタンをカバーと兄弟化（ネスト解消・a11y）、詳細シートは
// role=dialog/Escape/フォーカス管理/背景スクロールロック、二重追加ガード、AI概要の
// 中断安全キャッシュ + 再試行、全棚空のときの空状態、などを実装。

import { useEffect, useMemo, useRef, useState, useCallback, memo } from 'react';
import { toMessage } from '../lib/errors';
import { createPortal } from 'react-dom';
import { Plus, Check, X as IcX } from 'lucide-react';
import {
  fetchDiscover,
  DISCOVER_THEMES,
  themeLabel,
  tagToThemeKey,
  pickDailyTheme,
  pickSerendipityTheme,
  seededShuffle, bandedShuffle, NEW_RELEASE_POOL,
  dateKey,
  cleanupStalePopCache,
} from '../lib/discover';
import { generateSerendipityPop, streamBookQuickSummary } from '../lib/ai';
import { useHaptic } from '../hooks/useHaptic';
import BookStoreLinks from './BookStoreLinks';

// ── 重複判定キー（ISBN 優先、無ければ title|author 正規化）──────────────
const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
function bookKey({ isbn, title, author }) {
  const i = (isbn || '').toString().replace(/[-\s]/g, '');
  if (i) return `isbn:${i}`;
  return `ta:${norm(title)}|${norm(author)}`;
}

// ユーザーの蔵書タグ/フォルダから、ジャンルテーマに紐づく関心を推定（パーソナル棚用）。
function matchPersonalTheme(books) {
  const counts = new Map();
  (books || []).forEach((b) => {
    [...(b.tags || []), ...(b.collections || [])].forEach((t) => {
      const n = (t || '').trim();
      if (n) counts.set(n, (counts.get(n) || 0) + 1);
    });
  });
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  for (const tag of tags) {
    const key = tagToThemeKey(tag);
    if (key) {
      const meta = DISCOVER_THEMES.find((th) => th.key === key);
      if (meta) return { ...meta, tag };
    }
  }
  return null;
}

// ユーザーの関心テーマ集合（あえての一冊はここを避けて畑違いを選ぶ）。
function userThemeKeys(books) {
  const keys = new Set();
  (books || []).forEach((b) => {
    [...(b.tags || []), ...(b.collections || [])].forEach((t) => {
      const key = tagToThemeKey((t || '').trim());
      if (key) keys.add(key);
    });
  });
  return [...keys];
}

// 書店員POP 用の「読書傾向」1行（AI に渡す軽いコンテキスト・DB 追加往復なし）。
function readingContextLine(books) {
  const top = (books || [])
    .filter((b) => b && (b.status === 'done' || b.status === 'reading' || (Number(b.rating) || 0) >= 4))
    .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
    .slice(0, 3)
    .map((b) => `『${(b.title || '').toString().slice(0, 30)}』`)
    .filter(Boolean);
  return top.length ? `最近は ${top.join('・')} などを読んでいる` : '';
}

// POP の日次 localStorage キャッシュ（1日1回だけ AI を叩く）。キーは bookKey で統一。
function popStorageKey(book) { return `orime.pop.${dateKey()}.${bookKey(book)}`; }
function readCachedPop(book) {
  try { return localStorage.getItem(popStorageKey(book)) || ''; } catch { return ''; }
}
function writeCachedPop(book, text) {
  try { localStorage.setItem(popStorageKey(book), text); } catch { /* quota/private mode */ }
}

// AI 概要のセッション内キャッシュ（開き直しで再生成しない）。上限つき（監査 FE5/P6）。
const summaryCache = new Map(); // bookKey -> text
function cacheSummary(key, text) {
  summaryCache.set(key, text);
  if (summaryCache.size > 120) {
    const oldest = summaryCache.keys().next().value;
    if (oldest !== undefined) summaryCache.delete(oldest);
  }
}

// ── ビューポート近接で「表示された」を返すフック（棚の遅延ロード用）─────────
function useInView(ref, { rootMargin = '400px', enabled = true } = {}) {
  const [inView, setInView] = useState(!enabled);
  useEffect(() => {
    if (!enabled) { setInView(true); return undefined; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, rootMargin, ref]);
  return inView;
}

// 横スクロール行の共通スタイル（右端フェードで「まだ続く」を示す・監査 U6）。
const SCROLL_ROW = {
  display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 6px',
  scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
  WebkitMaskImage: 'linear-gradient(90deg,#000 92%,transparent)',
  maskImage: 'linear-gradient(90deg,#000 92%,transparent)',
};
const COVER_FALLBACK_BG = 'linear-gradient(135deg,#efe9df,#e4ddcf)';

// ── 単一カバー（背表紙）。追加ボタンはカバーの「兄弟」（ネストしない）───────
const CoverThumb = memo(function CoverThumb({ item, added, onOpen, onQuickAdd }) {
  const [imgErr, setImgErr] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // キャッシュ済み画像は onLoad が発火しない競合があるため、マウント時に
  // img.complete を見て即 loaded 化する（表紙が opacity:0 で消える回帰の修正）。
  const imgRef = useCallback((el) => { if (el && el.complete && el.naturalWidth > 0) setLoaded(true); }, []);
  return (
    <div style={{ width: 108, flex: '0 0 auto', scrollSnapAlign: 'start' }}>
      <div style={{ position: 'relative', width: 108, height: 156 }}>
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-label={`${item.title} の詳細を見る`}
          style={{
            position: 'absolute', inset: 0, width: 108, height: 156, padding: 0, border: 'none',
            borderRadius: 8, overflow: 'hidden', cursor: 'pointer', display: 'block',
            background: COVER_FALLBACK_BG, boxShadow: '0 2px 6px rgba(60,48,30,0.14)',
          }}
        >
          {item.cover && !imgErr ? (
            <img
              ref={imgRef}
              src={item.cover}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setImgErr(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .25s ease' }}
            />
          ) : (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, opacity: 0.5 }} aria-hidden="true">📕</span>
          )}
        </button>
        {/* クイック追加：44px のタップ領域に 28px の視覚バッジ。カバーボタンの兄弟。 */}
        <button
          type="button"
          disabled={added}
          aria-label={added ? `『${item.title}』は追加済み` : `『${item.title}』を読みたいに追加`}
          onClick={(e) => { e.stopPropagation(); if (!added) onQuickAdd(item); }}
          style={{
            position: 'absolute', right: 0, bottom: 0, width: 44, height: 44, padding: 0, border: 'none',
            background: 'transparent', cursor: added ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{
            width: 28, height: 28, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: added ? 'var(--c-positive)' : 'var(--c-brand)', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.32)',
          }}>
            {added ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : <Plus size={16} strokeWidth={3} aria-hidden="true" />}
          </span>
        </button>
      </div>
      <p style={{
        margin: '6px 2px 0', fontSize: 11, lineHeight: 1.35, color: 'var(--c-ink)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {item.title}
      </p>
    </div>
  );
});

// ── 横スクロールの棚（1本・ビューポート近接で遅延ロード）─────────────────
function Shelf({ id, title, emoji, subtitle, theme, sort, eager, addedFor, onOpen, onQuickAdd, onNotConfigured, onResult }) {
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { enabled: !eager });
  const [state, setState] = useState({ loading: true, items: [] });

  useEffect(() => {
    if (!theme || !inView) return undefined;
    const controller = new AbortController();
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetchDiscover({ theme, sort, signal: controller.signal }).then((res) => {
      if (!alive) return;
      if (res.reason === 'not_configured') onNotConfigured?.();
      // 帯内シャッフル: 日替わり感は保ちつつ売れ筋上位（良書）を先頭帯に維持する。
      const items = bandedShuffle(res.items || []);
      setState({ loading: false, items });
      onResult?.(id, items.length > 0);
    });
    return () => { alive = false; controller.abort(); };
  }, [theme, sort, inView]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!theme) return null;
  // 読み込み後に空なら棚ごと出さない。ただし ref を維持するため、未ロード時は枠を出す。
  const settled = inView && !state.loading;
  if (settled && state.items.length === 0) return null;

  return (
    <section ref={sectionRef} style={{ marginBottom: 4 }} aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 8px' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>{emoji} {title}</h3>
        {subtitle && <span style={{ fontSize: 11, color: 'var(--c-ink-3)' }}>{subtitle}</span>}
      </div>
      {(!inView || state.loading) ? (
        <div style={{ display: 'flex', gap: 12, overflow: 'hidden', padding: '0 2px' }} aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 108, height: 156, borderRadius: 8, flex: '0 0 auto', background: 'var(--c-soft)' }} className="skeleton" />
          ))}
        </div>
      ) : (
        <div style={SCROLL_ROW}>
          {state.items.map((item, i) => (
            <CoverThumb key={`${bookKey(item)}-${i}`} item={item} added={addedFor(item)} onOpen={onOpen} onQuickAdd={onQuickAdd} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── 🎲 あえての一冊（1冊大きめ + 書店員POP）───────────────────────────
function SerendipityShelf({ theme, contextLine, addedFor, onOpen, onQuickAdd, onNotConfigured, onResult }) {
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pop, setPop] = useState('');

  useEffect(() => {
    if (!theme) return undefined;
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    fetchDiscover({ theme, sort: 'popular', signal: controller.signal }).then((res) => {
      if (!alive) return;
      if (res.reason === 'not_configured') onNotConfigured?.();
      // 上位帯（売れ筋1〜6位）の中から日替わりで1冊 — 畑違いでも「良い本」を出す。
      const shuffled = bandedShuffle(res.items || []);
      const picked = shuffled[0] || null;
      setBook(picked);
      setLoading(false);
      onResult?.('serendipity', !!picked);
    });
    return () => { alive = false; controller.abort(); };
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // 書店員POP（1日1回・localStorage キャッシュ・失敗/中断は静かに無POP）。
  // 監査 FE3: 成功時のみ「済み」とみなす（ref で永久ロックしない）→ StrictMode/失敗後も再試行可能。
  useEffect(() => {
    if (!book) { setPop(''); return undefined; }
    const cached = readCachedPop(book);
    if (cached) { setPop(cached); return undefined; }
    setPop('');
    const controller = new AbortController();
    let alive = true;
    generateSerendipityPop({ title: book.title, author: book.author, contextLine, signal: controller.signal })
      .then((line) => {
        if (!alive || !line) return;
        writeCachedPop(book, line);
        setPop(line);
      })
      .catch(() => { /* 無POP に倒す */ });
    return () => { alive = false; try { controller.abort(); } catch { /* noop */ } };
  }, [book, contextLine]);

  if (!theme) return null;
  if (!loading && !book) return null;
  const isAdded = book ? addedFor(book) : false;

  return (
    <section style={{ marginBottom: 8 }} aria-label="あえての一冊">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 8px' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>🎲 あえての一冊</h3>
        <span style={{ fontSize: 11, color: 'var(--c-ink-3)' }}>いつもと違う棚から</span>
      </div>
      <div style={{
        display: 'flex', gap: 14, padding: 14, borderRadius: 16,
        background: 'linear-gradient(135deg, #fbf7ef, #f3ede0)', border: '1px solid var(--c-hairline)',
      }}>
        {loading ? (
          <div style={{ width: 96, height: 140, borderRadius: 8, background: 'var(--c-soft)' }} className="skeleton" />
        ) : (
          <button
            type="button"
            onClick={() => onOpen(book)}
            aria-label={`『${book.title}』の詳細を見る`}
            style={{
              width: 96, height: 140, flex: '0 0 auto', padding: 0, border: 'none', borderRadius: 8,
              overflow: 'hidden', cursor: 'pointer', background: COVER_FALLBACK_BG, boxShadow: '0 3px 10px rgba(60,48,30,0.2)',
            }}
          >
            {book.cover
              ? <img src={book.cover} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 30, opacity: 0.5 }} aria-hidden="true">📕</span>}
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {loading ? (
            <div className="skeleton" style={{ height: 14, width: '80%', borderRadius: 6 }} />
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', lineHeight: 1.4 }}>{book.title}</p>
              {book.author && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--c-ink-2)' }}>{book.author}</p>}
              {/* 書店員の手書きPOP（AI）。未到着時は見出しと重複しない控えめな一言で場つなぎ。 */}
              <p style={{
                margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--c-ink)',
                fontStyle: 'italic', borderLeft: '3px solid var(--c-brand)', paddingLeft: 8,
              }}>
                {pop || '書店員がひとことを考え中…'}
              </p>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  disabled={isAdded}
                  onClick={() => !isAdded && onQuickAdd(book)}
                  style={{
                    padding: '11px 16px', borderRadius: 999, border: 'none', fontSize: 12.5, fontWeight: 700,
                    fontFamily: 'inherit', cursor: isAdded ? 'default' : 'pointer', minHeight: 44,
                    background: isAdded ? 'var(--c-hairline)' : 'var(--c-brand)',
                    color: isAdded ? 'var(--c-ink-3)' : 'var(--c-brand-ink)',
                  }}
                >
                  {isAdded ? '✅ 追加済み' : '📚 読みたいに追加'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── 詳細ボトムシート（ダイアログ）───────────────────────────────────────
function DetailSheet({ item, added, onAdd, onClose }) {
  const key = item ? bookKey(item) : '';
  const [summary, setSummary] = useState('');
  const [sumLoading, setSumLoading] = useState(false);
  const [sumErr, setSumErr] = useState('');
  const abortRef = useRef(null);
  const sheetRef = useRef(null);
  const returnFocusRef = useRef(null);

  // 本が変わったらリセット＋キャッシュ参照。閉じる/切替時は生成を中断。
  useEffect(() => {
    setSumErr('');
    setSumLoading(false);
    setSummary(key ? (summaryCache.get(key) || '') : '');
    return () => { try { abortRef.current?.abort?.(); } catch { /* noop */ } };
  }, [key]);

  // ダイアログ挙動: 背景スクロールロック・初期フォーカス・Escape・フォーカストラップ・
  // クローズ時に元の要素へフォーカスを戻す（監査 U2）。
  useEffect(() => {
    if (!item) return undefined;
    returnFocusRef.current = (typeof document !== 'undefined') ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // 次フレームでシートへフォーカス（描画後）。
    const raf = requestAnimationFrame(() => { try { sheetRef.current?.focus(); } catch { /* noop */ } });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const root = sheetRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll('button:not([disabled]), a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      try { returnFocusRef.current?.focus?.(); } catch { /* noop */ }
    };
  }, [item, onClose]);

  const runSummary = () => {
    if (!item || sumLoading) return;
    setSumLoading(true);
    setSumErr('');
    const controller = new AbortController();
    abortRef.current = controller;
    streamBookQuickSummary({
      title: item.title,
      author: item.author,
      signal: controller.signal,
      onChunk: (t) => setSummary(t),
    })
      // 監査 FE1: 中断時は streamClaude が部分テキストで resolve するため、
      // 中断していない完了時のみキャッシュする（部分要約の焼き付き防止）。
      .then((full) => { if (full && !controller.signal.aborted) cacheSummary(key, full); })
      .catch((e) => { setSumErr(toMessage(e, '概要を取得できませんでした。もう一度お試しください。')); })
      .finally(() => setSumLoading(false));
  };

  if (!item) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--backdrop)',
        backdropFilter: 'var(--backdrop-blur)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`『${item.title}』の詳細`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--c-card)', borderRadius: '20px 20px 0 0',
          padding: '10px 20px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -10px 30px rgba(30,25,20,0.18)',
          animation: 'leverage-sheet-up .25s cubic-bezier(0.2,0.9,0.3,1)', outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 36, height: 5, borderRadius: 999, background: 'var(--c-hairline-strong)', margin: '4px auto 0', flex: 1 }} aria-hidden="true" />
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{ width: 44, height: 44, flex: '0 0 auto', borderRadius: 999, border: 'none', background: 'var(--c-soft)', color: 'var(--c-ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <IcX size={16} aria-hidden="true" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{
            width: 92, height: 132, flex: '0 0 auto', borderRadius: 8, overflow: 'hidden',
            background: COVER_FALLBACK_BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(60,48,30,0.18)',
          }}>
            {item.cover
              ? <img src={item.cover} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 30, opacity: 0.5 }} aria-hidden="true">📕</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--c-ink)', lineHeight: 1.4 }}>{item.title}</p>
            {item.author && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--c-ink-2)' }}>{item.author}</p>}
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--c-ink-3)' }}>
              {[item.publisher, item.salesDate].filter(Boolean).join(' ・ ')}
            </p>
            {Number.isFinite(item.price) && item.price > 0 && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--c-ink-3)' }}>¥{item.price.toLocaleString()}</p>
            )}
          </div>
        </div>

        {/* 📖 概要を AI でサッと読む（3〜5行）。エラー時は再試行導線を出す（監査 U4/FE6）。 */}
        <div style={{ marginTop: 16 }}>
          {(!summary && !sumLoading) && (
            <button
              type="button"
              onClick={runSummary}
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: '1px dashed var(--c-hairline-strong)',
                background: 'var(--c-soft)', color: 'var(--c-brand)', fontSize: 13, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer', minHeight: 48,
              }}
            >
              {sumErr ? '🔄 もう一度、概要を読む' : '📖 この本の概要を AI で読む'}
            </button>
          )}
          {(summary || sumLoading) && (
            <div style={{ padding: 12, borderRadius: 12, background: 'var(--c-soft)', border: '1px solid var(--c-hairline)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-3)' }}>
                🤖 AI による概要{sumLoading ? '（生成中…）' : ''}
              </p>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--c-ink)', whiteSpace: 'pre-wrap' }}>
                {summary || '…'}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--c-ink-3)' }}>
                ※ AI の推定です。事実と異なる場合があります。
              </p>
            </div>
          )}
          {sumErr && !sumLoading && (
            <p role="alert" style={{ margin: '6px 2px 0', fontSize: 12, color: 'var(--c-critical)' }}>{sumErr}</p>
          )}
        </div>

        {/* 読みたい追加 + Amazon/楽天 の両方リンク（統一） */}
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            disabled={added}
            onClick={() => { if (!added) { onAdd(item); onClose(); } }}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit', cursor: added ? 'default' : 'pointer', minHeight: 48,
              background: added ? 'var(--c-hairline)' : 'var(--c-brand)', color: added ? 'var(--c-ink-3)' : 'var(--c-brand-ink)',
            }}
          >
            {added ? '✅ 追加済み' : '📚 読みたいに追加'}
          </button>
          <div style={{ marginTop: 10 }}>
            <BookStoreLinks book={item} variant="compact" buy />
          </div>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 10, color: 'var(--c-ink-3)', textAlign: 'center' }}>本の情報・表紙・価格の出典: 楽天ブックス</p>
      </div>
    </div>,
    document.body,
  );
}

// ── 本体 ──────────────────────────────────────────────────────────────
export default function DiscoverPanel({ onAddBook, books }) {
  const haptic = useHaptic();
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [emptyAll, setEmptyAll] = useState(false);
  const [nonce, setNonce] = useState(0); // 再試行で棚を作り直す
  const [browseTheme, setBrowseTheme] = useState(() => pickDailyTheme(1));

  // 古い日付の POP キャッシュを掃除（無制限成長防止・監査 P6）。
  useEffect(() => { cleanupStalePopCache(); }, []);

  const shelfKeys = useMemo(() => {
    const s = new Set();
    (books || []).forEach((b) => s.add(bookKey({ isbn: b.isbn, title: b.title, author: b.author })));
    return s;
  }, [books]);

  const personal = useMemo(() => matchPersonalTheme(books), [books]);
  const serendipityTheme = useMemo(() => pickSerendipityTheme(userThemeKeys(books)), [books]);
  const contextLine = useMemo(() => readingContextLine(books), [books]);
  const todayTheme = useMemo(() => pickDailyTheme(0), []);
  const newTheme = useMemo(() => pickDailyTheme(3, NEW_RELEASE_POOL), []);

  // 棚の構成（監査 FE2: theme|sort が重複する棚は除外して同一棚の二重表示を防ぐ）。
  const shelfConfigs = useMemo(() => {
    const seen = new Set();
    const list = [];
    const push = (cfg) => {
      const k = `${cfg.theme}|${cfg.sort}`;
      if (cfg.theme && !seen.has(k)) { seen.add(k); list.push(cfg); }
    };
    push({ id: 'business', title: 'いま読まれてるビジネス書', emoji: '🔥', theme: 'ビジネス・経済', sort: 'popular', eager: true });
    push({ id: 'today', title: `今日の平台『${themeLabel(todayTheme)}』`, emoji: '✨', subtitle: '日替わり', theme: todayTheme, sort: 'popular' });
    push({ id: 'new', title: `話題の新刊『${themeLabel(newTheme)}』`, emoji: '🆕', theme: newTheme, sort: 'new' });
    if (personal) push({ id: 'personal', title: `『${personal.tag}』が好きなあなたへ`, emoji: '🫱', theme: personal.key, sort: 'popular' });
    return list;
  }, [todayTheme, newTheme, personal]);

  // 全棚が空のときだけ空状態を出す（個々の弱い棚は静かに隠す・監査 U7）。
  const expectedIds = useMemo(() => ['serendipity', ...shelfConfigs.map((c) => c.id)], [shelfConfigs]);
  const resultsRef = useRef({});
  // リセットは再試行(nonce)時のみ。books 変更で expectedIds の identity が変わっても
  // 既に報告済みの eager 棚は再報告しないため、reset すると emptyAll 判定が二度と
  // 成立しなくなる（監査 FE3）。棚 id が増減しても resultsRef は追記/残置で無害。
  useEffect(() => { resultsRef.current = {}; setEmptyAll(false); }, [nonce]);
  const onResult = useCallback((id, had) => {
    resultsRef.current[id] = had;
    const done = expectedIds.every((x) => x in resultsRef.current);
    if (done) setEmptyAll(expectedIds.every((x) => !resultsRef.current[x]));
  }, [expectedIds]);
  const onNotConfigured = useCallback(() => setNotConfigured(true), []);

  // 追加ボタンの安定参照（監査 P2: memo(CoverThumb) を効かせる）＋二重追加ガード（FE4）。
  const refs = useRef({ onAddBook, haptic, addedKeys, shelfKeys });
  refs.current = { onAddBook, haptic, addedKeys, shelfKeys };
  const addingRef = useRef(new Set());

  const addedFor = (item) => {
    const key = bookKey(item);
    return addedKeys.has(key) || shelfKeys.has(key);
  };

  const handleAdd = useCallback((item) => {
    const key = bookKey(item);
    const { onAddBook: add, haptic: hap, addedKeys: ak, shelfKeys: sk } = refs.current;
    // 既に追加済み / 追加処理中なら二重送信しない（FE4）。
    if (ak.has(key) || sk.has(key) || addingRef.current.has(key)) return;
    addingRef.current.add(key);
    hap?.light?.();
    setAddedKeys((prev) => new Set(prev).add(key));
    Promise.resolve(
      add?.({ title: item.title, author: item.author, isbn: item.isbn, cover: item.cover, why: '' }, ''),
    ).then((saved) => {
      // 重複 gate 等で追加されなかった（null）→ 既に本棚にある場合は追加済み表示を維持、
      // そうでなければ楽観フラグを戻す。
      if (saved == null && !refs.current.shelfKeys.has(key)) {
        setAddedKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
      }
    }).catch(() => {
      setAddedKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    }).finally(() => { addingRef.current.delete(key); });
  }, []);

  // 安定した open/close（memo(CoverThumb) を効かせる＋詳細シートの dialog effect が
  // 親の再描画のたびに再実行されないように）。
  const openDetail = useCallback((item) => { refs.current.haptic?.light?.(); setDetail(item); }, []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const retry = useCallback(() => { setNotConfigured(false); setEmptyAll(false); setNonce((n) => n + 1); }, []);

  if (notConfigured) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-ink-3)', fontSize: 13, lineHeight: 1.8 }}>
        🛠 この機能は準備中です。<br />もう少しお待ちください。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {emptyAll && (
        <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--c-ink-3)', fontSize: 13, lineHeight: 1.8, background: 'var(--c-soft)', borderRadius: 14 }}>
          📭 いまは本を取得できませんでした。<br />少し時間をおいて、もう一度お試しください。
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={retry}
              style={{ padding: '10px 20px', borderRadius: 999, border: '1px solid var(--c-hairline-strong)', background: 'transparent', color: 'var(--c-brand)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', minHeight: 44 }}
            >
              🔄 再試行
            </button>
          </div>
        </div>
      )}

      <SerendipityShelf
        key={`serendipity-${nonce}`}
        theme={serendipityTheme}
        contextLine={contextLine}
        addedFor={addedFor}
        onOpen={openDetail}
        onQuickAdd={handleAdd}
        onNotConfigured={onNotConfigured}
        onResult={onResult}
      />

      {shelfConfigs.map((cfg) => (
        <Shelf
          key={`${cfg.id}-${nonce}`}
          id={cfg.id}
          title={cfg.title}
          emoji={cfg.emoji}
          subtitle={cfg.subtitle}
          theme={cfg.theme}
          sort={cfg.sort}
          eager={cfg.eager}
          addedFor={addedFor}
          onOpen={openDetail}
          onQuickAdd={handleAdd}
          onNotConfigured={onNotConfigured}
          onResult={onResult}
        />
      ))}

      {/* 📚 テーマの棚 — チップで棚を切り替えてぶらぶら */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 8px' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>📚 テーマの棚</h3>
          <span style={{ fontSize: 11, color: 'var(--c-ink-3)' }}>気になる棚を選ぶ</span>
        </div>
        <div aria-label="テーマを選ぶ" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 2px 10px', scrollbarWidth: 'none', WebkitMaskImage: 'linear-gradient(90deg,#000 92%,transparent)', maskImage: 'linear-gradient(90deg,#000 92%,transparent)' }}>
          {DISCOVER_THEMES.map((t) => {
            const active = browseTheme === t.key;
            return (
              <button
                type="button"
                key={t.key}
                aria-pressed={active}
                onClick={() => { setBrowseTheme(t.key); haptic.light?.(); }}
                style={{
                  flex: '0 0 auto', padding: '10px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer', minHeight: 44, whiteSpace: 'nowrap',
                  border: active ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
                  background: active ? 'var(--c-brand)' : 'transparent',
                  color: active ? 'var(--c-brand-ink)' : 'var(--c-ink-2)',
                }}
              >
                {t.emoji} {t.label}
              </button>
            );
          })}
        </div>
        <Shelf
          key={`browse-${browseTheme}-${nonce}`}
          id="browse"
          title={`『${themeLabel(browseTheme)}』の棚`}
          emoji="📖"
          theme={browseTheme}
          sort="popular"
          eager
          addedFor={addedFor}
          onOpen={openDetail}
          onQuickAdd={handleAdd}
          onNotConfigured={onNotConfigured}
        />
      </div>

      <p style={{ fontSize: 10, color: 'var(--c-ink-3)', textAlign: 'center', margin: '4px 0 8px' }}>
        本の情報・表紙・価格の出典: 楽天ブックス
      </p>

      <DetailSheet
        item={detail}
        added={detail ? addedFor(detail) : false}
        onAdd={handleAdd}
        onClose={closeDetail}
      />
    </div>
  );
}
