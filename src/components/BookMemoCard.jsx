import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppDataCache } from '../state/AppDataCache';
import { ensureHttps } from '../lib/url';
import { useLongPress } from '../hooks/useLongPress';
import SwipeableCard from './SwipeableCard';
import { MoreVertical, Image, Target } from 'lucide-react';

const cardWrap = {
  position: 'relative',
  background: 'var(--c-card)',
  border: '1px solid var(--c-hairline)',
  borderRadius: 'var(--radius-md)',
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  boxShadow: '0 1px 3px rgba(60, 48, 30, 0.05)',
  // 大量メモ時、画面外カードのレイアウト/ペイントをスキップ（未対応環境は無視）。
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 140px',
};

// ページ番号は「従」— 塗り+bold だと本文より先に視線が落ちる（階層の逆転）。
// 控えめなインラインラベルに落とし、本文を主役に保つ。
const pageBadge = {
  alignSelf: 'flex-start',
  fontSize: 'var(--type-meta)',
  padding: 0,
  background: 'none',
  color: 'var(--c-ink-3)',
  fontWeight: 500,
};

const tagPill = {
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 10,
  background: 'var(--c-soft)',
  color: 'var(--c-ink-2)',
  maxWidth: '100%',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
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
  color: 'var(--c-ink-2)',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
};

// ⚠️ このメニューと写真拡大モーダルは createPortal で body 直下に出す。
// カードは SwipeableCard の transform + overflow:hidden 配下にあり、
// カード内に描くと (a) メニューが短いカードでクリップされ「削除」に届かない
// (b) position:fixed が transform を containing block として全画面にならない。
const menuStyle = {
  position: 'fixed',
  background: 'var(--surface)',
  border: '1px solid var(--c-hairline)',
  borderRadius: 8,
  boxShadow: '0 4px 14px rgba(30,25,20,0.12)',
  zIndex: 300,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 110,
  overflow: 'hidden',
};

const menuItem = {
  background: 'none',
  border: 'none',
  padding: '12px 16px',
  minHeight: 44,
  fontSize: 13,
  textAlign: 'left',
  fontFamily: 'inherit',
  cursor: 'pointer',
  color: 'var(--c-ink)',
  WebkitTapHighlightColor: 'transparent',
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function BookMemoCard({ memo, highlight, onEdit, onCopy, onShare, onDelete, onMakeAction, onSwipeDelete, onLongPress }) {
  const cache = useAppDataCache();
  // Synchronous cache hit → render the image immediately on first paint.
  const initialUrl = memo.photoPath ? cache.getCachedPhotoUrl(memo.photoPath) : null;
  const [photoUrl, setPhotoUrl] = useState(initialUrl);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 }); // fixed 座標（portal 用）

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
    // portal + position:fixed のメニューはスクロールに追従しない。開いたまま
    // スクロールするとカードから切り離されて浮くため、スクロールで閉じる
    // （内側スクロールコンテナのイベントは bubble しないので capture で拾う）。
    window.addEventListener('scroll', close, { capture: true, passive: true });
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, { capture: true });
    };
  }, [menuOpen]);

  // 写真拡大モーダルは背景タップで閉じるが、キーボード利用者向けに Esc でも
  // 閉じられるようにする（モーダルの基本作法・a11y）。
  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const swipeEnabled = Boolean(onSwipeDelete);

  // 本文が長い場合は行間広めの .long-text を当てて読みやすく（短い断片は据え置き）
  const isLongBody = (memo.text || '').length > 120;

  // スクリーンリーダー向けのカード要約（事実ベース・1メモ＝1記事として読める）
  const cardAria = (() => {
    const parts = ['メモ'];
    if (memo.pageNumber != null) parts.push(`${memo.pageNumber}ページ`);
    const dateLabel = formatDate(memo.createdAt);
    if (dateLabel) parts.push(dateLabel);
    return parts.join('・');
  })();

  const cardInner = (
    <div
      style={cardWrap}
      className={highlight ? 'just-added' : undefined}
      role="article"
      aria-label={cardAria}
      {...(onLongPress ? longPress.bind : {})}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          setMenuPos({
            top: Math.min(rect.bottom + 2, (window.innerHeight || 800) - 240),
            right: Math.max(8, (window.innerWidth || 400) - rect.right),
          });
          setMenuOpen((v) => !v);
        }}
        className="icon-btn"
        style={{ ...kebabBtn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label="メニューを開く"
      >
        <MoreVertical size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {menuOpen && createPortal(
        <div
          style={{ ...menuStyle, top: menuPos.top, right: menuPos.right }}
          onClick={(e) => e.stopPropagation()}
          // portal でも React ツリー上は SwipeableCard / useLongPress の子のまま
          // なので、合成 touch イベントが背後のスワイプ削除・長押しに届く。遮断する。
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
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
          {onMakeAction && (memo.text || '').trim() && (
            <button
              type="button"
              style={menuItem}
              onClick={() => {
                setMenuOpen(false);
                onMakeAction(memo);
              }}
            >
              <Target size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
              行動にする
            </button>
          )}
          {onShare && (memo.text || '').trim() && (
            <button
              type="button"
              style={menuItem}
              onClick={() => {
                setMenuOpen(false);
                onShare(memo);
              }}
            >
              <Image size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
              画像で共有
            </button>
          )}
          <button
            type="button"
            style={{ ...menuItem, color: 'var(--c-critical)' }}
            onClick={() => {
              setMenuOpen(false);
              onDelete?.(memo);
            }}
          >
            削除
          </button>
        </div>,
        document.body,
      )}

      {memo.pageNumber != null && <span style={pageBadge}>P.{memo.pageNumber}</span>}

      {/* 署名 URL 解決待ちの間、写真の場所を先に確保（skeleton シマー）。
          「テキストだけ → 数百ms後にカードがガクッと伸びて写真出現」の
          レイアウトシフトを消す。 */}
      {memo.photoPath && !photoUrl && (
        <div
          className="skeleton"
          aria-hidden="true"
          style={{ width: '80%', aspectRatio: '4 / 3', borderRadius: 8 }}
        />
      )}
      {photoUrl && (
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label="写真を拡大表示"
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
            loading="lazy"
            decoding="async"
            ref={(el) => { if (el && el.complete && el.naturalWidth > 0 && !photoLoaded) setPhotoLoaded(true); }}
            onLoad={() => setPhotoLoaded(true)}
            style={{
              width: '100%',
              height: 'auto',
              borderRadius: 8,
              border: '1px solid var(--c-hairline)',
              display: 'block',
              opacity: photoLoaded ? 1 : 0,
              transition: 'opacity var(--duration-fast) var(--ease-out)',
            }}
          />
        </button>
      )}

      {memo.text && (
        <p
          style={{
            fontSize: 13,
            color: 'var(--c-ink)',
            // 長文ほど行間をわずかに広げて可読性を上げる（短文は詰めすぎない）
            lineHeight: isLongBody ? 1.85 : 1.7,
            whiteSpace: 'pre-wrap',
            margin: 0,
            maxHeight: 400,
            overflowY: 'auto',
            paddingRight: 8,
            // 長い URL や英単語でカードが横に膨らむのを防ぐ
            overflowWrap: 'anywhere',
          }}
        >
          {memo.text}
        </p>
      )}

      {memo.tags?.length > 0 && (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}
          aria-label={`タグ: ${memo.tags.join('、')}`}
        >
          {memo.tags.map((t) => (
            <span key={t} style={tagPill} aria-hidden="true">#{t}</span>
          ))}
        </div>
      )}

      <p
        style={{ fontSize: 10, color: 'var(--c-ink-3)', margin: 0 }}
        aria-label={`作成日 ${formatDate(memo.createdAt)}`}
      >
        {formatDate(memo.createdAt)}
      </p>

      {zoom && photoUrl && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="写真の拡大表示。タップで閉じる"
          onClick={() => setZoom(false)}
          // 拡大写真上のパン/長押しが背後のカードのスワイプ削除・長押しメニューに
          // バブリングしてメモが消える事故を防ぐ（portal は React ツリーを辿る）。
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
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
          {/* ♿ aria-modal ダイアログ内にフォーカス可能要素がゼロだと、SR ユーザーは
              背景が隠された状態で移動先を失う。閉じるボタンを内包し開時にフォーカス。 */}
          <button
            type="button"
            autoFocus
            onClick={(e) => { e.stopPropagation(); setZoom(false); }}
            aria-label="拡大表示を閉じる"
            style={{
              position: 'absolute', top: 'max(env(safe-area-inset-top, 0px), 12px)', right: 12,
              width: 44, height: 44, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.16)', color: 'var(--on-cover)', fontSize: 20, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>,
        document.body,
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
