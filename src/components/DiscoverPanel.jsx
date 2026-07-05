// 📚🔥 話題の本を探す — テーマ別「新着・人気」ディスカバリー。
//
// 旧「テーマの棚」（AI 生成の推薦）は「実在するか怪しい・毎回同じ・鮮度ゼロ」の
// 弱さがあった。ここは楽天ブックス API の実データで、テーマ×(新着|人気) の
// 実在する本を並べる。課題が曖昧な日でも「棚を歩く」体験で出会いを作る。
//
// データは api/discover.js（楽天プロキシ）から。RAKUTEN_APPLICATION_ID 未設定なら
// { ok:false, reason:'not_configured' } が返るので「準備中」に倒す（fail-safe）。

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchDiscover, DISCOVER_THEMES } from '../lib/discover';
import { useHaptic } from '../hooks/useHaptic';

// 本棚の既存本と重複判定するためのキー（ISBN 優先、無ければ title|author 正規化）。
const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
function bookKey({ isbn, title, author }) {
  const i = (isbn || '').toString().replace(/[-\s]/g, '');
  if (i) return `isbn:${i}`;
  return `ta:${norm(title)}|${norm(author)}`;
}

function DiscoverCard({ item, added, onAdd }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        borderRadius: 14,
        border: '1px solid var(--c-hairline)',
        background: 'var(--c-card)',
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 56,
          height: 80,
          borderRadius: 6,
          flexShrink: 0,
          overflow: 'hidden',
          background: 'linear-gradient(135deg,#e9edf5,#dfe4ee)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
          <span style={{ fontSize: 22, opacity: 0.5 }} aria-hidden="true">📕</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--c-ink)', lineHeight: 1.35 }}>
          {item.title}
        </p>
        {item.author && (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--c-ink-2)' }}>{item.author}</p>
        )}
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--c-ink-3)' }}>
          {[item.publisher, item.salesDate].filter(Boolean).join(' ・ ')}
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={added}
            onClick={() => !added && onAdd(item)}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: added ? 'default' : 'pointer',
              minHeight: 34,
              background: added ? 'var(--c-hairline)' : 'var(--c-brand)',
              color: added ? 'var(--c-ink-3)' : '#fff',
            }}
          >
            {added ? '✅ 追加済み' : '📚 読みたいに追加'}
          </button>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'var(--c-brand)', textDecoration: 'none' }}
            >
              楽天ブックスで見る ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DiscoverPanel({ onAddBook, books }) {
  const haptic = useHaptic();
  const [theme, setTheme] = useState(DISCOVER_THEMES[0].key);
  const [sort, setSort] = useState('popular'); // 'popular' | 'new'
  const [state, setState] = useState({ loading: true, items: [], reason: null, ok: false });
  // クリック直後に「追加済み」を即反映するための楽観 set（books の再取得を待たない）。
  const [addedKeys, setAddedKeys] = useState(() => new Set());
  const reqIdRef = useRef(0);

  // 本棚の既存本キー集合（重複判定）。
  const shelfKeys = useMemo(() => {
    const s = new Set();
    (books || []).forEach((b) => s.add(bookKey({ isbn: b.isbn, title: b.title, author: b.author })));
    return s;
  }, [books]);

  useEffect(() => {
    const myId = ++reqIdRef.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    fetchDiscover({ theme, sort, signal: controller.signal }).then((res) => {
      // 最新リクエストのみ反映（テーマ/ソート連打時の順序逆転を防ぐ）。
      if (myId !== reqIdRef.current) return;
      setState({ loading: false, items: res.items || [], reason: res.reason, ok: res.ok });
    });
    return () => controller.abort();
  }, [theme, sort]);

  const handleAdd = (item) => {
    haptic.light?.();
    const key = bookKey(item);
    setAddedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    Promise.resolve(
      onAddBook?.(
        { title: item.title, author: item.author, isbn: item.isbn, cover: item.cover, why: '' },
        '',
      ),
    ).then((saved) => {
      // 重複 gate 等で追加されなかった (null) 場合は楽観フラグを戻す。
      if (saved == null) {
        setAddedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }).catch(() => {
      setAddedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* テーマチップ */}
      <div className="example-chips" style={{ marginTop: 0 }}>
        <p className="example-chips-label">🗂 テーマを選ぶ</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DISCOVER_THEMES.map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => { setTheme(t.key); haptic.light?.(); }}
              className="example-chip"
              style={
                theme === t.key
                  ? { background: 'var(--c-brand)', color: '#fff', borderColor: 'var(--c-brand)' }
                  : undefined
              }
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 新着 / 人気 トグル */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { k: 'popular', label: '🔥 人気' },
          { k: 'new', label: '🆕 新着' },
        ].map((opt) => (
          <button
            type="button"
            key={opt.k}
            onClick={() => { setSort(opt.k); haptic.light?.(); }}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 10,
              border: '1px solid var(--c-hairline-strong)',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              minHeight: 40,
              background: sort === opt.k ? 'var(--c-soft-2)' : 'transparent',
              color: sort === opt.k ? 'var(--c-brand)' : 'var(--c-ink-2)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 本体 */}
      {state.loading ? (
        <div className="ai-skeleton" aria-label="本を読み込み中" style={{ marginTop: 4 }}>
          <div className="ai-skeleton-line" style={{ width: '90%' }} />
          <div className="ai-skeleton-line" style={{ width: '78%' }} />
          <div className="ai-skeleton-line" style={{ width: '84%' }} />
        </div>
      ) : state.reason === 'not_configured' ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-ink-3)', fontSize: 13, lineHeight: 1.7 }}>
          🛠 この機能は準備中です。<br />もう少しお待ちください。
        </div>
      ) : state.items.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--c-ink-3)', fontSize: 13, lineHeight: 1.7 }}>
          📭 いまは本が見つかりませんでした。<br />別のテーマを試してみてください。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state.items.map((item, i) => {
            const key = bookKey(item);
            const added = addedKeys.has(key) || shelfKeys.has(key);
            return (
              <DiscoverCard
                key={`${key}-${i}`}
                item={item}
                added={added}
                onAdd={handleAdd}
              />
            );
          })}
          <p style={{ fontSize: 10, color: 'var(--c-ink-3)', textAlign: 'center', margin: '4px 0 0' }}>
            出典: 楽天ブックス
          </p>
        </div>
      )}
    </div>
  );
}
