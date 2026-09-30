// 💬 相談相手のアイコン（2026-09-30・DESIGN §5「相談相手のアイコン」・lib/consultPartner.js）。
// LINE の相手のアイコンと名前の行のように、答えがどの本のメモから来たかを見せる。
//   - 1 冊: その本の表紙（丸く切り抜く・表紙が無い本は代用表紙の色）
//   - 数冊: 表紙を最大 4 つ並べた丸（2 冊は左右・3 冊は左 1 つ＋右 2 つ・4 冊は 2×2）
//   - 自分の学び: --fill の丸に電球
// アイコンは飾り（aria-hidden）。名前の行が文字として読まれる。

import { useState } from 'react';
import { Lightbulb, Library, ChevronRight } from 'lucide-react';
import { paletteFor } from '../lib/coverPalette';
import { ensureHttps } from '../lib/url';
import { GROUP_TILES } from '../lib/consultPartner';
import BottomSheet from './BottomSheet';
import { MiniCover } from './BookCards';

export const AVATAR_SIZE = 32;
export const AVATAR_SIZE_SMALL = 24;
// 名前の行の高さ（13・行間 1.5）＋ 名前と吹き出しの間（4）。アイコンは吹き出しの上端に合わせる。
const NAME_OFFSET = 'calc(var(--text-meta) * 1.5 + var(--space-1))';

function CoverTile({ book }) {
  const [from, to] = paletteFor(book?.title || '');
  const [broken, setBroken] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', background: `linear-gradient(135deg, ${from}, ${to})` }}>
      {book?.cover && !broken && (
        <img
          src={ensureHttps(book.cover)}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          onLoad={(e) => { const t = e?.target; if (t && ((t.naturalWidth || 0) <= 1 || (t.naturalHeight || 0) <= 1)) setBroken(true); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </span>
  );
}

function SelfTile({ size }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: 'var(--fill)', color: 'var(--text-2)' }}>
      <Lightbulb size={Math.round(size * 0.55)} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

export default function PartnerAvatar({ partner, size = AVATAR_SIZE, style = null }) {
  const base = {
    position: 'relative', display: 'block', width: size, height: size, flexShrink: 0, borderRadius: 999, overflow: 'hidden',
    background: 'var(--fill)', boxShadow: 'inset 0 0 0 1px var(--separator)', ...style,
  };
  if (!partner) return <span aria-hidden="true" style={{ ...base, background: 'none', boxShadow: 'none' }} />;
  if (partner.kind === 'self') return <span aria-hidden="true" style={base}><SelfTile size={size} /></span>;
  if (partner.kind === 'book') return <span aria-hidden="true" style={base}><CoverTile book={partner.books[0]} /></span>;
  const tiles = [...partner.books.slice(0, GROUP_TILES).map((b) => ({ b })), ...(partner.self ? [{ self: true }] : [])].slice(0, GROUP_TILES);
  if (tiles.length === 0) {
    return (
      <span aria-hidden="true" style={{ ...base, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
        <Library size={Math.round(size * 0.55)} strokeWidth={1.75} aria-hidden="true" />
      </span>
    );
  }
  const n = tiles.length;
  // 丸の中を 1px の線（面の色）で区切って並べる（LINE のグループのアイコンと同じ）。
  const grid = n === 1 ? { gridTemplate: '1fr / 1fr' }
    : n === 2 ? { gridTemplate: '1fr / 1fr 1fr' }
      : { gridTemplate: '1fr 1fr / 1fr 1fr' };
  return (
    <span aria-hidden="true" style={{ ...base, display: 'grid', gap: 1, background: 'var(--surface)', ...grid }}>
      {tiles.map((t, i) => (
        <span key={i} style={{ display: 'block', overflow: 'hidden', ...(n === 3 && i === 0 ? { gridRow: '1 / 3' } : null) }}>
          {t.self ? <SelfTile size={size / 2} /> : <CoverTile book={t.b} />}
        </span>
      ))}
    </span>
  );
}

// 名前の行（13/--text-2・1 行で … 省略）。数冊のときは押すと本の一覧（押せる範囲 44・見た目の高さは変えない）。
export function PartnerName({ partner, onOpenList = null, as: Tag = 'p' }) {
  if (!partner) return null;
  const text = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  const line = { display: 'flex', alignItems: 'center', margin: '0 0 var(--space-1)', fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)', lineHeight: 1.5 };
  if (onOpenList && partner.kind === 'group' && partner.books.length > 0) {
    return (
      <Tag style={line}>
        <button
          type="button"
          onClick={onOpenList}
          aria-haspopup="dialog"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', maxWidth: '100%', minHeight: 44, margin: 'calc((var(--text-meta) * 1.5 - 44px) / 2) 0', padding: 0, background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={text}>{partner.label}</span>
          <ChevronRight size={14} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-3)' }} />
        </button>
      </Tag>
    );
  }
  // 語り口の答え（2026-09-30）: 「著者名」は長ければ … で省き、「（本の語り口で・AI）」はいつも見せる（切らない）。
  return (
    <Tag style={line}>
      <span style={text}>{partner.label}</span>
      {partner.suffix && <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{partner.suffix}</span>}
    </Tag>
  );
}

// アイコン（左）＋ 名前の行と中身（右）。partner が null のときは同じ幅の空き（列をそろえる）。
// showName=false は名前の行を出さない（アイコンも出さず、列だけそろえる）。
export function PartnerRow({ partner, children, onOpenList = null, showName = true, nameAs = 'p', style = null }) {
  const shown = !!partner && showName;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', ...style }}>
      <span
        // アイコンを押しても一覧を開ける（読み上げは名前の行のボタンで）。
        onClick={shown && onOpenList && partner.kind === 'group' ? onOpenList : undefined}
        style={{ flexShrink: 0, marginTop: shown ? NAME_OFFSET : 0, cursor: shown && onOpenList && partner.kind === 'group' ? 'pointer' : 'default' }}
      >
        <PartnerAvatar partner={shown ? partner : null} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {shown && <PartnerName partner={partner} onOpenList={onOpenList} as={nameAs} />}
        {children}
      </div>
    </div>
  );
}

// 数冊の相手の名前（アイコン）を押したときの本の一覧。行を押すとその本を開く。
export function PartnerBooksSheet({ partner, title = 'この答えのもとになった本', onClose, onOpenBook = null }) {
  if (!partner) return null;
  const row = { width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 56, padding: 'var(--space-2) 0', background: 'none', border: 'none', borderBottom: '1px solid var(--separator)', textAlign: 'left', fontFamily: 'inherit', color: 'var(--text)', cursor: onOpenBook ? 'pointer' : 'default' };
  return (
    <BottomSheet title={title} onClose={onClose}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {partner.books.map((b) => {
          const inner = (
            <>
              <MiniCover book={b} width={32} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>『{b.title}』</span>
                {b.author && <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{b.author}</span>}
              </span>
              {onOpenBook && b.id && <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
            </>
          );
          return (
            <li key={b.id || b.title}>
              {onOpenBook && b.id
                ? <button type="button" style={row} onClick={() => { onClose?.(); onOpenBook(b.id); }}>{inner}</button>
                : <div style={row}>{inner}</div>}
            </li>
          );
        })}
        {partner.self && (
          <li>
            <div style={row}>
              <span style={{ width: 32, height: 32, borderRadius: 999, overflow: 'hidden', flexShrink: 0 }}><SelfTile size={32} /></span>
              <span style={{ fontSize: 'var(--text-body)', fontWeight: 600 }}>自分の学び</span>
            </div>
          </li>
        )}
      </ul>
    </BottomSheet>
  );
}
