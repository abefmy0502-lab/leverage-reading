import { useEffect, useState } from 'react';
import { fmtDateJa } from '../lib/dates';
import { useAppDataCache } from '../state/AppDataCache';
import { ensureHttps } from '../lib/url';
import { useLongPress } from '../hooks/useLongPress';
import SwipeableCard from './SwipeableCard';
import { MoreHorizontal } from 'lucide-react';
import PhotoLightbox from './PhotoLightbox';
import MemoLinks from './MemoLinks';

const cardWrap = {
  position: 'relative',
  background: 'var(--surface)',
  // 枠は幅・線・色に分けて書く（border の一括指定と borderColor を混ぜると、強調を外したときに
  // 色だけが消えて黒い枠が残る・2026-09-29）。色はカードごとに必ず入れる（下の cardInner）。
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
  // content-visibility: auto は使わない（最初の描画で仮の高さ 140 から本来の高さへ縮んで、一覧が跳ねていた・2026-09-29）。
};

// ページ番号と日付は「従」— 1 行にまとめた控えめなラベル（「p.33 · 9/20」）で本文を主役に保つ。
// 右上の「…」と同じ行に並ぶので、右は「…」の分だけ空ける。
const metaLine = {
  alignSelf: 'stretch',
  fontSize: 'var(--text-meta)',
  color: 'var(--text-3)',
  fontWeight: 400,
  margin: 0,
  paddingRight: 'var(--space-8)',
  minHeight: 20,
};

// タグは押せない表示＝面を付けない（DESIGN §5「表示用ラベル」）。
const tagLabel = {
  fontSize: 'var(--text-meta)',
  color: 'var(--text-2)',
  maxWidth: '100%',
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

const kebabBtn = {
  position: 'absolute',
  top: 'var(--space-1)',
  right: 'var(--space-1)',
  width: 44,
  height: 44,
  background: 'none',
  border: 'none',
  fontSize: 'var(--text-body)',
  color: 'var(--text-2)',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
};

// ⚠️ 写真拡大モーダルは PhotoLightbox（createPortal で body 直下）に出す。
// カードは SwipeableCard の transform + overflow:hidden 配下にあり、
// カード内に描くと position:fixed が transform を containing block として全画面にならない。
// 「…」のメニューは長押しと同じ ContextMenu（BookMemoList が出す）。

// 日付の書き方はアプリ全体で 1 つ（今年は「9/20」、違う年は「2025/9/20」）。
const formatDate = (iso) => fmtDateJa(iso);

// links: 本と本がつながる（ほかの本で似たことを書いたメモ・MemoLinks）。開いた（検索から示した・「続きを読む」）ときだけ親が渡す。
// onExpandChange(memo, expanded): 「続きを読む」で開いた・閉じたことを親に知らせる（開いたメモのつながるメモを探す）。
// onOpenLink(book, memoId): つながるメモの行を押したとき。
export default function BookMemoCard({ memo, highlight, onEdit, onSwipeDelete, onLongPress, links = null, onExpandChange = null, onOpenLink = null }) {
  const cache = useAppDataCache();
  // Synchronous cache hit → render the image immediately on first paint.
  const initialUrl = memo.photoPath ? cache.getCachedPhotoUrl(memo.photoPath) : null;
  const [photoUrl, setPhotoUrl] = useState(initialUrl);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [zoom, setZoom] = useState(false);

  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, memo }),
  });

  // 文脈のある alt（事実ベース）: ページ番号 + 本文先頭を補う
  const photoAlt = (() => {
    const parts = ['メモの写真'];
    if (memo.pageNumber != null) parts.push(`p.${memo.pageNumber}`);
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


  // 写真の拡大表示（Esc・× ・どこを押しても閉じる）は PhotoLightbox（2026-10-18 に部品にした）。

  const swipeEnabled = Boolean(onSwipeDelete);

  // 本文が長い場合は行間広めの .long-text を当てて読みやすく（短い断片は据え置き）
  // 18px・1 行約 20 字なので、約 4 行を超える（80 字超 or 改行 4 つ以上）メモを畳む。
  const isLongBody = (memo.text || '').length > 80 || (memo.text || '').split('\n').length > 4;
  const [expanded, setExpanded] = useState(false);

  // スクリーンリーダー向けのカード要約（事実ベース・1メモ＝1記事として読める）
  const cardAria = (() => {
    const parts = ['メモ'];
    if (memo.pageNumber != null) parts.push(`${memo.pageNumber}ページ`);
    const dateLabel = formatDate(memo.createdAt);
    if (dateLabel) parts.push(dateLabel);
    return parts.join('・');
  })();

  // 「…」の読み上げ名に本文の先頭 12 字を入れる（同じ「メニューを開く」が並ぶと区別できない）。
  const menuLabel = (() => {
    const chars = Array.from((memo.text || '').trim().replace(/\s+/g, ' '));
    if (chars.length === 0) return 'メモのメニュー';
    return `${chars.slice(0, 12).join('')}${chars.length > 12 ? '…' : ''}のメニュー`;
  })();
  // カードの本文を押したら編集を開く（「…」→「編集」まで 2 タップだったのを 1 タップに・2026-09-29）。
  // 「続きを読む」・写真・「…」は自分の動作だけ（stopPropagation）。文字を選んでいる途中は開かない。
  const openEditFromCard = () => {
    if (!onEdit) return;
    try { if (window.getSelection?.()?.toString()) return; } catch { /* ignore */ }
    onEdit(memo);
  };

  const cardInner = (
    <div
      style={{
        ...cardWrap,
        ...(onEdit ? { cursor: 'pointer' } : {}),
        // highlight === 'focus': 振り返り・すべての本の検索から開いた「このメモ」を、淡い面で一度だけ示す
        //   （.just-added-card・枠は栗色にしない＝アクセントは押せる場所だけ・DESIGN §3-2・2026-09-30）。
        borderColor: 'var(--separator)',
        transition: 'background-color var(--duration-base) var(--ease-out), border-color var(--duration-base) var(--ease-out)',
      }}
      className={highlight === 'focus' ? 'just-added-card' : highlight ? 'just-added' : undefined}
      role="article"
      aria-label={cardAria}
      data-memo-id={memo.id}
      onClick={onEdit ? openEditFromCard : undefined}
      {...(onLongPress ? longPress.bind : {})}
    >
      <button
        type="button"
        // 長押しと同じメニュー（ContextMenu・アイコンつき・BookMemoList の memoMenu）を「…」の下に開く（2026-09-30）。
        onClick={(e) => {
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onLongPress?.({ x: rect.right - 8, y: rect.bottom + 4, memo });
        }}
        className="icon-btn"
        style={{ ...kebabBtn, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-label={menuLabel}
      >
        <MoreHorizontal size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {/* ページ番号と日付を 1 行に（「p.33 · 9/20」）。 */}
      <p style={metaLine} aria-hidden="true">
        {memo.pageNumber != null && <>p.{memo.pageNumber}<span style={{ margin: '0 var(--space-1)' }}>·</span></>}
        {formatDate(memo.createdAt)}
      </p>

      {/* 署名 URL 解決待ちの間、写真の場所を先に確保（skeleton シマー）。
          「テキストだけ → 数百ms後にカードがガクッと伸びて写真出現」の
          レイアウトシフトを消す。 */}
      {memo.photoPath && !photoUrl && (
        <div
          className="skeleton"
          aria-hidden="true"
          style={{ width: '80%', aspectRatio: '4 / 3', borderRadius: 'var(--radius)' }}
        />
      )}
      {photoUrl && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setZoom(true); }}
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
              borderRadius: 'var(--radius)',
              border: '1px solid var(--separator)',
              display: 'block',
              opacity: photoLoaded ? 1 : 0,
              transition: 'opacity var(--duration-fast) var(--ease-out)',
            }}
          />
        </button>
      )}

      {memo.text && (
        <>
          {/* メモ本文は「読む文章」（DESIGN §2: 明朝 18・行間 1.7・幅をそろえる＝components.css の .memo-body）。長文は 4 行で畳み、
              「続きを読む」で全文（カード内の入れ子スクロールはやめた・SPEC §2）。 */}
          <p
            className="memo-body"
            style={{
              ...(isLongBody && !expanded
                ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                : {}),
            }}
          >
            {memo.text}
          </p>
          {isLongBody && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); onExpandChange?.(memo, !expanded); }}
              style={{ alignSelf: 'flex-start', minHeight: 44, padding: 0, margin: 'calc(-1 * var(--space-2)) 0', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
            >
              {expanded ? '閉じる' : '続きを読む'}
            </button>
          )}
        </>
      )}

      {memo.tags?.length > 0 && (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', rowGap: 'var(--space-1)' }}
          aria-label={`タグ: ${memo.tags.join('、')}`}
        >
          {memo.tags.map((t) => (
            <span key={t} style={tagLabel} aria-hidden="true">#{t}</span>
          ))}
        </div>
      )}

      {/* 🔗 つながるメモ（ほかの本で似たことを書いたメモ・見つかったときだけ）。カードの押す・長押しには届かせない。 */}
      {links && links.length > 0 && onOpenLink && (
        <MemoLinks links={links} onOpen={onOpenLink} style={{ marginTop: 'var(--space-1)' }} />
      )}

      {zoom && photoUrl && <PhotoLightbox src={photoUrl} alt={photoAlt} onClose={() => setZoom(false)} />}
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
