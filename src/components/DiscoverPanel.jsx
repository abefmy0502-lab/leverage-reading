// 📚🏬 話題の本を探す（本屋をぶらぶら）— カバー主役・横スクロールの棚を縦に並べる。
//
// 思想（ユーザーの狙い）:
//   ①思いがけない出会い … カバーが視界に入る横スクロール棚 + 日替わりローテ +
//     ジャンル横断の「今日の平台」「あえての一冊」で、予定してなかった本に出会う。
//   ②時代感度 … いま読まれてるビジネス書 / 話題の新刊（楽天の実データ）。
//   ③Orimeらしさ … パーソナルは"1棚"だけ（フィルターバブルで出会いを殺さない）。
//     さらに AI は「目利き書店員」役として、あえての一冊に一行POPを添える（本そのものは
//     楽天の実在データ＝捏造なし・低コスト）。
//
// データは api/discover.js（楽天プロキシ）。RAKUTEN_APPLICATION_ID 未設定なら
// reason:'not_configured' が返るので「準備中」に倒す（fail-safe）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchDiscover,
  DISCOVER_THEMES,
  themeLabel,
  pickDailyTheme,
  pickSerendipityTheme,
  seededShuffle,
  dateKey,
} from '../lib/discover';
import { generateSerendipityPop } from '../lib/ai';
import { useHaptic } from '../hooks/useHaptic';

// ── 重複判定キー（ISBN 優先、無ければ title|author 正規化）──────────────
const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
function bookKey({ isbn, title, author }) {
  const i = (isbn || '').toString().replace(/[-\s]/g, '');
  if (i) return `isbn:${i}`;
  return `ta:${norm(title)}|${norm(author)}`;
}

// ユーザーの蔵書タグ/フォルダから、テーマに紐づく関心を推定（パーソナル棚用）。
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
    const hit = DISCOVER_THEMES.find(
      (th) => tag.includes(th.label) || tag.includes(th.key) || th.label.includes(tag) || th.key.includes(tag),
    );
    if (hit) return { ...hit, tag };
  }
  return null;
}

// ユーザーの関心テーマ集合（あえての一冊はここを避けて畑違いを選ぶ）。
function userThemeKeys(books) {
  const keys = new Set();
  (books || []).forEach((b) => {
    [...(b.tags || []), ...(b.collections || [])].forEach((t) => {
      const tag = (t || '').trim();
      if (!tag) return;
      const hit = DISCOVER_THEMES.find(
        (th) => tag.includes(th.label) || tag.includes(th.key) || th.label.includes(tag) || th.key.includes(tag),
      );
      if (hit) keys.add(hit.key);
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

// POP の日次キャッシュ（1日1回だけ AI を叩く）。
function readCachedPop(book) {
  try { return localStorage.getItem(`orime.pop.${dateKey()}.${book.isbn || book.title}`) || ''; } catch { return ''; }
}
function writeCachedPop(book, text) {
  try { localStorage.setItem(`orime.pop.${dateKey()}.${book.isbn || book.title}`, text); } catch { /* quota/private mode */ }
}

// ── 単一カバー（背表紙）───────────────────────────────────────────────
function CoverThumb({ item, added, onOpen, onQuickAdd }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      style={{ width: 108, flex: '0 0 auto', scrollSnapAlign: 'start' }}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={`${item.title} の詳細`}
        style={{
          position: 'relative', width: 108, height: 156, padding: 0, border: 'none',
          borderRadius: 8, overflow: 'hidden', cursor: 'pointer', display: 'block',
          background: 'linear-gradient(135deg,#efe9df,#e4ddcf)',
          boxShadow: '0 2px 6px rgba(60,48,30,0.14)',
        }}
      >
        {item.cover && !imgErr ? (
          <img
            src={item.cover}
            alt=""
            loading="lazy"
            onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, opacity: 0.5 }} aria-hidden="true">📕</span>
        )}
        {/* クイック追加 / 追加済み バッジ */}
        <span
          role="button"
          tabIndex={0}
          aria-label={added ? '追加済み' : '読みたいに追加'}
          onClick={(e) => { e.stopPropagation(); if (!added) onQuickAdd(item); }}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !added) { e.stopPropagation(); onQuickAdd(item); } }}
          style={{
            position: 'absolute', right: 4, bottom: 4, width: 26, height: 26, borderRadius: 999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700,
            background: added ? 'rgba(95,122,85,0.95)' : 'rgba(92,80,67,0.92)', color: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)', cursor: added ? 'default' : 'pointer',
          }}
        >
          {added ? '✓' : '＋'}
        </span>
      </button>
      <p style={{
        margin: '6px 2px 0', fontSize: 11, lineHeight: 1.35, color: 'var(--c-ink)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {item.title}
      </p>
    </div>
  );
}

// ── 横スクロールの棚（1本）────────────────────────────────────────────
function Shelf({ title, emoji, subtitle, theme, sort, addedFor, onOpen, onQuickAdd, onNotConfigured }) {
  const [state, setState] = useState({ loading: true, items: [], reason: null });
  useEffect(() => {
    if (!theme) return undefined;
    const controller = new AbortController();
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetchDiscover({ theme, sort, signal: controller.signal }).then((res) => {
      if (!alive) return;
      if (res.reason === 'not_configured') onNotConfigured?.();
      // 日替わりで並びを軽くシャッフル＝「今日ぶらついたら別の順で並んでた」。
      const items = seededShuffle(res.items || []);
      setState({ loading: false, items, reason: res.reason });
    });
    return () => { alive = false; controller.abort(); };
  }, [theme, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!theme) return null;
  if (!state.loading && state.items.length === 0) return null; // 空/準備中の棚は出さない

  return (
    <section style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 8px' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>
          {emoji} {title}
        </h3>
        {subtitle && <span style={{ fontSize: 11, color: 'var(--c-ink-3)' }}>{subtitle}</span>}
      </div>
      {state.loading ? (
        <div style={{ display: 'flex', gap: 12, overflow: 'hidden', padding: '0 2px' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: 108, height: 156, borderRadius: 8, flex: '0 0 auto', background: 'var(--c-soft)' }} className="skeleton" />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'flex', gap: 12, overflowX: 'auto', padding: '2px 2px 6px',
            scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
          }}
        >
          {state.items.map((item, i) => {
            const key = bookKey(item);
            return (
              <CoverThumb
                key={`${key}-${i}`}
                item={item}
                added={addedFor(item)}
                onOpen={onOpen}
                onQuickAdd={onQuickAdd}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── 🎲 あえての一冊（1冊大きめ + 書店員POP）───────────────────────────
function SerendipityShelf({ theme, contextLine, addedFor, onOpen, onQuickAdd, onNotConfigured }) {
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pop, setPop] = useState('');
  const popReqRef = useRef('');

  useEffect(() => {
    if (!theme) return undefined;
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    fetchDiscover({ theme, sort: 'popular', signal: controller.signal }).then((res) => {
      if (!alive) return;
      if (res.reason === 'not_configured') onNotConfigured?.();
      // その日の1冊を決定的に選ぶ（毎回同じ本にならないよう軽くシャッフル）。
      const shuffled = seededShuffle(res.items || []);
      setBook(shuffled[0] || null);
      setLoading(false);
    });
    return () => { alive = false; controller.abort(); };
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps

  // 書店員POP（1日1回・localStorage キャッシュ・失敗は静かに無POP）。
  useEffect(() => {
    if (!book) { setPop(''); return; }
    const id = book.isbn || book.title;
    if (popReqRef.current === id) return; // 二重呼び防止
    popReqRef.current = id;
    const cached = readCachedPop(book);
    if (cached) { setPop(cached); return; }
    let alive = true;
    generateSerendipityPop({ title: book.title, author: book.author, contextLine })
      .then((line) => {
        if (!alive || !line) return;
        writeCachedPop(book, line);
        setPop(line);
      })
      .catch(() => { /* 無POP に倒す */ });
    return () => { alive = false; };
  }, [book, contextLine]);

  if (!theme) return null;
  if (!loading && !book) return null;

  return (
    <section style={{ marginBottom: 8 }}>
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
            aria-label={`${book.title} の詳細`}
            style={{
              width: 96, height: 140, flex: '0 0 auto', padding: 0, border: 'none', borderRadius: 8,
              overflow: 'hidden', cursor: 'pointer', background: 'linear-gradient(135deg,#efe9df,#e4ddcf)',
              boxShadow: '0 3px 10px rgba(60,48,30,0.2)',
            }}
          >
            {book.cover
              ? <img src={book.cover} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
              {/* 書店員の手書きPOP（AI）。まだ来ていなければ控えめな定型文で場つなぎ。 */}
              <p style={{
                margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.6, color: 'var(--c-ink)',
                fontStyle: 'italic', borderLeft: '3px solid var(--c-brand)', paddingLeft: 8,
              }}>
                {pop || 'いつもと違う棚から、一冊。'}
              </p>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  disabled={addedFor(book)}
                  onClick={() => !addedFor(book) && onQuickAdd(book)}
                  style={{
                    padding: '8px 16px', borderRadius: 999, border: 'none', fontSize: 12.5, fontWeight: 700,
                    fontFamily: 'inherit', cursor: addedFor(book) ? 'default' : 'pointer', minHeight: 36,
                    background: addedFor(book) ? 'var(--c-hairline)' : 'var(--c-brand)',
                    color: addedFor(book) ? 'var(--c-ink-3)' : '#fff',
                  }}
                >
                  {addedFor(book) ? '✅ 追加済み' : '📚 読みたいに追加'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ── 詳細ボトムシート（手に取る）───────────────────────────────────────
function DetailSheet({ item, added, onAdd, onClose }) {
  if (!item) return null;
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(30,24,16,0.42)',
        backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--c-card)', borderRadius: '20px 20px 0 0',
          padding: '10px 20px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 30px rgba(0,0,0,0.2)',
          animation: 'sheetUp .28s cubic-bezier(0.2,0.8,0.2,1)',
        }}
      >
        <div style={{ width: 36, height: 5, borderRadius: 999, background: 'var(--c-hairline-strong)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{
            width: 92, height: 132, flex: '0 0 auto', borderRadius: 8, overflow: 'hidden',
            background: 'linear-gradient(135deg,#efe9df,#e4ddcf)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(60,48,30,0.18)',
          }}>
            {item.cover
              ? <img src={item.cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

        <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
          <button
            type="button"
            disabled={added}
            onClick={() => { if (!added) { onAdd(item); onClose(); } }}
            style={{
              flex: 1, padding: '13px 0', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit', cursor: added ? 'default' : 'pointer', minHeight: 48,
              background: added ? 'var(--c-hairline)' : 'var(--c-brand)', color: added ? 'var(--c-ink-3)' : '#fff',
            }}
          >
            {added ? '✅ 追加済み' : '📚 読みたいに追加'}
          </button>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '13px 16px', borderRadius: 12, border: '1px solid var(--c-hairline-strong)',
                fontSize: 13, fontWeight: 600, color: 'var(--c-brand)', textDecoration: 'none', minHeight: 48,
                display: 'flex', alignItems: 'center',
              }}
            >
              楽天 ↗
            </a>
          )}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 10, color: 'var(--c-ink-3)', textAlign: 'center' }}>出典: 楽天ブックス</p>
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
  const [browseTheme, setBrowseTheme] = useState(() => pickDailyTheme(1));

  const shelfKeys = useMemo(() => {
    const s = new Set();
    (books || []).forEach((b) => s.add(bookKey({ isbn: b.isbn, title: b.title, author: b.author })));
    return s;
  }, [books]);

  const personal = useMemo(() => matchPersonalTheme(books), [books]);
  const serendipityTheme = useMemo(() => pickSerendipityTheme(userThemeKeys(books)), [books]);
  const contextLine = useMemo(() => readingContextLine(books), [books]);
  const todayTheme = useMemo(() => pickDailyTheme(0), []);
  const newTheme = useMemo(() => pickDailyTheme(3), []);

  const addedFor = (item) => {
    const key = bookKey(item);
    return addedKeys.has(key) || shelfKeys.has(key);
  };

  const handleAdd = (item) => {
    haptic.light?.();
    const key = bookKey(item);
    setAddedKeys((prev) => new Set(prev).add(key));
    Promise.resolve(
      onAddBook?.({ title: item.title, author: item.author, isbn: item.isbn, cover: item.cover, why: '' }, ''),
    ).then((saved) => {
      if (saved == null) {
        // 重複 gate 等で追加されなかった → 楽観フラグを戻す。
        setAddedKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
      }
    }).catch(() => {
      setAddedKeys((prev) => { const n = new Set(prev); n.delete(key); return n; });
    });
  };

  if (notConfigured) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--c-ink-3)', fontSize: 13, lineHeight: 1.8 }}>
        🛠 この機能は準備中です。<br />もう少しお待ちください。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* @keyframes をローカルに（このパネル専用の軽い演出） */}
      <style>{'@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}'}</style>

      <SerendipityShelf
        theme={serendipityTheme}
        contextLine={contextLine}
        addedFor={addedFor}
        onOpen={setDetail}
        onQuickAdd={handleAdd}
        onNotConfigured={() => setNotConfigured(true)}
      />

      <Shelf
        title="いま読まれてるビジネス書" emoji="🔥" theme="ビジネス" sort="popular"
        addedFor={addedFor} onOpen={setDetail} onQuickAdd={handleAdd}
        onNotConfigured={() => setNotConfigured(true)}
      />

      <Shelf
        title={`今日の平台『${themeLabel(todayTheme)}』`} emoji="✨" subtitle="日替わり" theme={todayTheme} sort="popular"
        addedFor={addedFor} onOpen={setDetail} onQuickAdd={handleAdd}
        onNotConfigured={() => setNotConfigured(true)}
      />

      <Shelf
        title={`話題の新刊『${themeLabel(newTheme)}』`} emoji="🆕" theme={newTheme} sort="new"
        addedFor={addedFor} onOpen={setDetail} onQuickAdd={handleAdd}
        onNotConfigured={() => setNotConfigured(true)}
      />

      {personal && (
        <Shelf
          title={`『${personal.tag}』が好きなあなたへ`} emoji="🫱" theme={personal.key} sort="popular"
          addedFor={addedFor} onOpen={setDetail} onQuickAdd={handleAdd}
          onNotConfigured={() => setNotConfigured(true)}
        />
      )}

      {/* 📚 テーマの棚 — チップで棚を切り替えてぶらぶら */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 8px' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--c-ink)' }}>📚 テーマの棚</h3>
          <span style={{ fontSize: 11, color: 'var(--c-ink-3)' }}>気になる棚を選ぶ</span>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '0 2px 10px', scrollbarWidth: 'none' }}>
          {DISCOVER_THEMES.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => { setBrowseTheme(t.key); haptic.light?.(); }}
              style={{
                flex: '0 0 auto', padding: '7px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer', minHeight: 34, whiteSpace: 'nowrap',
                border: browseTheme === t.key ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
                background: browseTheme === t.key ? 'var(--c-brand)' : 'transparent',
                color: browseTheme === t.key ? '#fff' : 'var(--c-ink-2)',
              }}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        <Shelf
          title={`『${themeLabel(browseTheme)}』の棚`} emoji="📖" theme={browseTheme} sort="popular"
          addedFor={addedFor} onOpen={setDetail} onQuickAdd={handleAdd}
          onNotConfigured={() => setNotConfigured(true)}
        />
      </div>

      <p style={{ fontSize: 10, color: 'var(--c-ink-3)', textAlign: 'center', margin: '4px 0 8px' }}>
        本の情報・表紙・価格の出典: 楽天ブックス
      </p>

      <DetailSheet
        item={detail}
        added={detail ? addedFor(detail) : false}
        onAdd={handleAdd}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}
