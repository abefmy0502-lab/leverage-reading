// 📚 本棚の本カード 2 種。App.jsx から切り出した自己完結コンポーネント。
//   - BookCoverCard: グリッド表示（表紙主役）
//   - SwipeableBookCard: リスト表示（スワイプ削除 + 長押し）
// トップレベル定義なので per-card hooks（useLongPress）が Rules of Hooks に従う。
// 表紙プレースホルダ色は src/lib/coverPalette.js（paletteFor）を参照。

import { memo, useState, useEffect } from 'react';
import { useLongPress } from '../hooks/useLongPress';
import { paletteFor } from '../lib/coverPalette';
import { ensureHttps } from '../lib/url';
import { ChevronRight } from 'lucide-react';
import SwipeableCard from './SwipeableCard';
import StatusBadge from './StatusBadge';
import { Stars } from './formPrimitives';

// グリッド表示用の本カード（表紙主役）。表紙無し / 画像 404 時は
// タイトルベースの色付きプレースホルダにフォールバック。
export const BookCoverCard = memo(function BookCoverCard({ book, isJustDone, onOpen, onLongPress, onAutoRetry }) {
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, book }),
  });
  const [from, to] = paletteFor(book.title);
  // book.id をキーに使って、book が変わった時のみ broken state をリセット。
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setBroken(false); setLoaded(false); }, [book.id, book.cover]);
  const showPlaceholder = !book.cover || broken;
  // 表紙が出ない本はバックグラウンドで再解決をキューイング。
  // セッション内で 1 回だけ走るので、ここから fire-and-forget で OK。
  useEffect(() => {
    if (showPlaceholder) onAutoRetry?.(book);
  }, [showPlaceholder, book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      className="book-cover-card"
      onClick={() => onOpen?.(book)}
      {...longPress.bind}
      style={{
        animation: isJustDone ? 'leverage-card-celebrate 2.4s ease both' : undefined,
      }}
    >
      <div className="book-cover-image-wrap">
        {/* グラデーションプレースホルダは常に下敷き: (a) ロード待ちの間も
            タイトル入りの色面が見える（生成りの空白にしない） (b) 画像は
            onLoad で opacity フェードイン＝突然のポップインを消す
            (c) onError 時の白フラッシュも起きない。 */}
        <div
          className="book-cover-placeholder"
          style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          {book.title}
        </div>
        {!showPlaceholder && (
          <img
            className={`book-cover-img${loaded ? ' is-loaded' : ''}`}
            src={ensureHttps(book.cover)}
            alt={book.title}
            loading="lazy"
            decoding="async"
            // キャッシュ済み画像は onLoad が発火しないことがあるため、
            // ref で complete を同期検出して即表示（再訪時のフェード再生なし）。
            ref={(el) => {
              if (el && el.complete && el.naturalWidth > 1 && !loaded) setLoaded(true);
            }}
            onError={() => setBroken(true)}
            // 1×1 transparent placeholder + Google Books の "No cover"
            // プレースホルダー (128×170 PNG、h/w 1.33) を実画像と区別する。
            // 通常の本の表紙は h/w 1.4-1.6 なので 1.35 を閾値にする (bookCover.js
            // checkImageExists と同じ基準)。
            onLoad={(e) => {
              const t = e?.target;
              if (!t) return;
              const w = t.naturalWidth || 0;
              const h = t.naturalHeight || 0;
              if (w <= 1 || h <= 1) { setBroken(true); return; }
              if (w >= 50 && h / w < 1.35) { setBroken(true); return; }
              setLoaded(true);
            }}
          />
        )}
        {/* ステータスを右下に小さなテキスト pill で常時表示。
            旧: 'done' だけ大きな ✅ を出していたが、すべての状態で
            視認できるよう「読みたい/読書前/読書中/読了」テキストに変更。
            book-status-pill.{status} で色を切替。 */}
        {book.status && (() => {
          const labels = { want: '読みたい', before: '積読', reading: '読書中', done: '読了' };
          const label = labels[book.status];
          if (!label) return null;
          return (
            <span
              className={`book-status-pill ${book.status}`}
              aria-label={label}
              title={label}
            >
              {label}
            </span>
          );
        })()}
      </div>
      <p className="book-cover-title">{book.title}</p>
      {book.author && <p className="book-cover-author">{book.author}</p>}
    </button>
  );
});

// 🖼 小さな表紙サムネ（縦長比率固定）。「続きから」等のミニカード用。
// BookCoverCard と同じ流儀 — タイトル入りの色付きプレースホルダを常に下敷きにし、
// 画像は onLoad でフェードイン・失敗(onError/1×1ダミー)時はプレースホルダに退避。
// 生の <img> を直接置くと、読み込み中/失敗時に「白い空き枠」になる（本棚の
// 続きからで実際に起きていた）。
export function MiniCover({ book, width = 44, radius = 4, onAutoRetry }) {
  const [from, to] = paletteFor(book.title);
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setBroken(false); setLoaded(false); }, [book.id, book.cover]);
  const show = !!book.cover && !broken;
  useEffect(() => {
    if (!show) onAutoRetry?.(book);
  }, [show, book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const height = Math.round(width * 1.42); // 一般的な書籍の縦横比
  return (
    // 表紙は「本の形」（DESIGN §4 の例外: 角丸 4）。影は使わず、極細の枠で面と分ける（暗い画面でも成立）。
    <div style={{ position: 'relative', width, height, borderRadius: radius, overflow: 'hidden', flexShrink: 0, boxShadow: 'inset 0 0 0 1px var(--separator)' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, ${from}, ${to})`,
          color: 'var(--on-cover)', fontSize: 'var(--text-caption)', fontWeight: 600,
          padding: '4px', lineHeight: 1.3, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
          wordBreak: 'break-word',
        }}
      >
        {book.title}
      </div>
      {show && (
        <img
          src={ensureHttps(book.cover)}
          alt=""
          loading="lazy"
          decoding="async"
          ref={(el) => { if (el && el.complete && el.naturalWidth > 1 && !loaded) setLoaded(true); }}
          onError={() => setBroken(true)}
          onLoad={(e) => {
            const t = e?.target;
            if (!t) return;
            if ((t.naturalWidth || 0) <= 1 || (t.naturalHeight || 0) <= 1) { setBroken(true); return; }
            setLoaded(true);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .25s ease' }}
        />
      )}
    </div>
  );
}

// Swipeable + long-pressable book row used on the bookshelf list.
export const SwipeableBookCard = memo(function SwipeableBookCard({ book, index, isJustDone, onOpen, onSwipeDelete, onLongPress, onAutoRetry }) {
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, book }),
  });
  // 表紙の読込・失敗検知・裏での再解決（onAutoRetry）は MiniCover が受け持つ。
  return (
    <SwipeableCard onDelete={() => onSwipeDelete?.(book)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${book.title || '無題'} を開く`}
        onClick={() => onOpen?.(book)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onOpen?.(book);
          }
        }}
        {...longPress.bind}
        style={{
          background: "var(--surface)",
          borderRadius: 'var(--radius)',
          padding: "var(--space-3) var(--space-4)",
          border: "1px solid var(--separator)",
          cursor: "pointer",
          transition: "background .12s ease, box-shadow .35s ease, transform .12s ease",
          animation: isJustDone
            ? "leverage-card-celebrate 2.4s ease both"
            // スタッガーは最初の一画面分（8件）だけ。無制限だと 60 冊目は
            // 1.2 秒不可視になり、詳細から戻るたびに画面が空白→パラパラ出現する。
            : `slideUp .3s ease ${Math.min(index, 8) * 0.02}s both`,
          // 長押しでカード周辺のテキスト選択 / iOS の callout を抑止。
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <div style={{ display: "flex", gap: 'var(--space-3)', alignItems: "center" }}>
          {/* 表紙は共通の MiniCover（読込フェード・失敗検知・代用表紙つき・角丸 4）。 */}
          <MiniCover book={book} width={44} onAutoRetry={onAutoRetry} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.title}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              {book.author && <span style={{ fontSize: 'var(--text-meta)', color: "var(--text-2)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.author}</span>}
              {book.rating > 0 && <Stars r={book.rating} size={12} />}
            </div>
            <div style={{ marginTop: 'var(--space-2)' }}>
              <StatusBadge status={book.status} />
            </div>
          </div>
          <ChevronRight size={18} strokeWidth={1.75} color="var(--text-3)" aria-hidden="true" />
        </div>
      </div>
    </SwipeableCard>
  );
});
