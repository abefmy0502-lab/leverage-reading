import { useEffect, useState } from 'react';
import { useAppDataCache } from '../state/AppDataCache';
import { ensureHttps } from '../lib/url';
import { useLongPress } from '../hooks/useLongPress';
import SwipeableCard from './SwipeableCard';
import { MoreVertical } from 'lucide-react';

const cardWrap = {
  position: 'relative',
  background: '#faf6f0',
  border: '1px solid #e4ddd0',
  borderRadius: 12,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const pageBadge = {
  alignSelf: 'flex-start',
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 8,
  background: '#eae3d6',
  color: '#7a6e58',
  fontWeight: 600,
};

const tagPill = {
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 10,
  background: '#f0ebe2',
  color: '#7a6e58',
};

const kebabBtn = {
  position: 'absolute',
  top: 2,
  right: 2,
  width: 44,
  height: 44,
  background: 'none',
  border: 'none',
  fontSize: 18,
  color: '#a89e8c',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
};

const menuStyle = {
  position: 'absolute',
  top: 32,
  right: 8,
  background: '#fff',
  border: '1px solid #e4ddd0',
  borderRadius: 8,
  boxShadow: '0 4px 14px rgba(30,25,20,0.12)',
  zIndex: 5,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 110,
  overflow: 'hidden',
};

const menuItem = {
  background: 'none',
  border: 'none',
  padding: '10px 14px',
  fontSize: 13,
  textAlign: 'left',
  fontFamily: 'inherit',
  cursor: 'pointer',
  color: '#3d362c',
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function BookMemoCard({ memo, onEdit, onCopy, onDelete, onSwipeDelete, onLongPress }) {
  const cache = useAppDataCache();
  // Synchronous cache hit → render the image immediately on first paint.
  const initialUrl = memo.photoPath ? cache.getCachedPhotoUrl(memo.photoPath) : null;
  const [photoUrl, setPhotoUrl] = useState(initialUrl);
  const [zoom, setZoom] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, memo }),
  });

  // 文脈のある alt（事実ベース）: ページ番号 + 本文先頭を補う
  const photoAlt = (() => {
    const parts = ['メモの写真'];
    if (memo.pageNumber != null) parts.push(`P.${memo.pageNumber}`);
    const snippet = (memo.text || '').trim().replace(/\s+/g, ' ').slice(0, 20);
    if (snippet) parts.push(`「${snippet}${(memo.text || '').trim().length > 20 ? '…' : ''}」`);
    return parts.join(' ');
  })();

  useEffect(() => {
    let cancelled = false;
    if (!memo.photoPath) {
      setPhotoUrl(null);
      return undefined;
    }
    const cached = cache.getCachedPhotoUrl(memo.photoPath);
    if (cached) {
      setPhotoUrl(cached);
      return undefined;
    }
    cache.fetchPhotoUrl(memo.photoPath).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [memo.photoPath, cache]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  const swipeEnabled = Boolean(onSwipeDelete);

  const cardInner = (
    <div style={cardWrap} {...(onLongPress ? longPress.bind : {})}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        style={{ ...kebabBtn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label="メニューを開く"
      >
        <MoreVertical size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {menuOpen && (
        <div style={menuStyle} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            style={menuItem}
            onClick={() => {
              setMenuOpen(false);
              onEdit?.(memo);
            }}
          >
            編集
          </button>
          {onCopy && (
            <button
              type="button"
              style={menuItem}
              onClick={() => {
                setMenuOpen(false);
                onCopy(memo);
              }}
            >
              コピー
            </button>
          )}
          <button
            type="button"
            style={{ ...menuItem, color: '#a05040' }}
            onClick={() => {
              setMenuOpen(false);
              onDelete?.(memo);
            }}
          >
            削除
          </button>
        </div>
      )}

      {memo.pageNumber != null && <span style={pageBadge}>P.{memo.pageNumber}</span>}

      {photoUrl && (
        <button
          type="button"
          onClick={() => setZoom(true)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'zoom-in',
            alignSelf: 'flex-start',
            width: '80%',
          }}
        >
          <img
            src={ensureHttps(photoUrl)}
            alt={photoAlt}
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: 8,
              border: '1px solid #e4ddd0',
              display: 'block',
            }}
          />
        </button>
      )}

      {memo.text && (
        <p
          style={{
            fontSize: 13,
            color: '#4a4036',
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            margin: 0,
            maxHeight: 400,
            overflowY: 'auto',
            paddingRight: 8,
          }}
        >
          {memo.text}
        </p>
      )}

      {memo.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {memo.tags.map((t) => (
            <span key={t} style={tagPill}>#{t}</span>
          ))}
        </div>
      )}

      <p style={{ fontSize: 10, color: '#b5aa96', margin: 0 }}>{formatDate(memo.createdAt)}</p>

      {zoom && photoUrl && (
        <div
          onClick={() => setZoom(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 400,
            background: 'rgba(20,16,12,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={ensureHttps(photoUrl)}
            alt={`${photoAlt}（拡大表示）`}
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );

  if (swipeEnabled) {
    return (
      <SwipeableCard onDelete={() => onSwipeDelete?.(memo)}>
        {cardInner}
      </SwipeableCard>
    );
  }
  return cardInner;
}
