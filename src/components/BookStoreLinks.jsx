// 🛒 Amazon + 楽天ブックス の購入リンクを並べて出す共通コンポーネント。
//
// 「本の表示は全部 Amazon と楽天の両方を出す」方針の単一の実装。本棚詳細 /
// AI選書の推薦カード / 話題の本の詳細シート すべてここを使う。
//
// variant:
//   'cta'     … want/before の本詳細向け。全幅の目立つ2ボタン（買う導線が主役）。
//   'compact' … reading/done・推薦カード・話題の本向け。控えめな横並びリンク。

import { getAmazonLink, handleAmazonClick, AMAZON_LINK_REL } from '../lib/amazonLink';
import { getRakutenLink, RAKUTEN_LINK_REL, STORE_DISCLOSURE_TEXT } from '../lib/rakutenLink';

const AMAZON_ORANGE = '#FF9900';
const RAKUTEN_CRIMSON = '#BF0000';

export default function BookStoreLinks({ book, variant = 'compact', showDisclosure = true, stopPropagation = false, buy = false }) {
  const amazon = getAmazonLink(book);
  const rakuten = getRakutenLink(book);
  const title = (book && book.title) || '';
  const verb = buy ? '買う' : '見る';
  const onAmazon = (e) => {
    if (stopPropagation) e.stopPropagation();
    handleAmazonClick(e, amazon);
  };
  const onRakuten = (e) => { if (stopPropagation) e.stopPropagation(); };

  if (variant === 'cta') {
    // 旧: Amazon 原色オレンジの全幅塗り + 楽天クリムゾンの太枠が縦に積まれ、
    // 詳細画面の暖色世界から浮いていた（実機監査 2026-07-17）。ストアの
    // 認知色は残しつつ淡いティントに落とし、2 列 1 行のソフトボタンに。
    // 購入導線（want/before では主要アクション）としての存在感は面積で担保する。
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <a
            href={amazon} target="_blank" rel={AMAZON_LINK_REL} onClick={onAmazon}
            aria-label={`Amazon で『${title}』を${verb}（外部リンク）`}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '12px 8px', background: '#fbf3e2', color: '#7a5500',
              border: '1px solid #e8d4a8', borderRadius: 'var(--radius-md)', textDecoration: 'none',
              fontWeight: 700, fontSize: 13, fontFamily: 'inherit', minHeight: 48,
              boxSizing: 'border-box', whiteSpace: 'nowrap',
            }}
          >
            Amazon で{verb} ↗
          </a>
          <a
            href={rakuten} target="_blank" rel={RAKUTEN_LINK_REL} onClick={onRakuten}
            aria-label={`楽天ブックス で『${title}』を${verb}（外部リンク）`}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '12px 8px', background: '#faf0ee', color: '#a03030',
              border: '1px solid #e6c8c2', borderRadius: 'var(--radius-md)', textDecoration: 'none',
              fontWeight: 700, fontSize: 13, fontFamily: 'inherit', minHeight: 48,
              boxSizing: 'border-box', whiteSpace: 'nowrap',
            }}
          >
            楽天で{verb} ↗
          </a>
        </div>
        {showDisclosure && (
          <small style={{ fontSize: 10, color: 'var(--c-ink-2)', lineHeight: 1.6, textAlign: 'center' }}>{STORE_DISCLOSURE_TEXT}</small>
        )}
      </div>
    );
  }

  // compact
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <a
          href={amazon} target="_blank" rel={AMAZON_LINK_REL} onClick={onAmazon}
          aria-label={`Amazon で『${title}』を見る（外部リンク）`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '10px 14px', borderRadius: 999, border: `1px solid ${AMAZON_ORANGE}`,
            background: 'transparent', color: '#7a5500', fontSize: 12, fontWeight: 700,
            fontFamily: 'inherit', textDecoration: 'none', minHeight: 44,
          }}
        >
          🛒 Amazon ↗
        </a>
        <a
          href={rakuten} target="_blank" rel={RAKUTEN_LINK_REL} onClick={onRakuten}
          aria-label={`楽天ブックス で『${title}』を見る（外部リンク）`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '10px 14px', borderRadius: 999, border: `1px solid ${RAKUTEN_CRIMSON}`,
            background: 'transparent', color: RAKUTEN_CRIMSON, fontSize: 12, fontWeight: 700,
            fontFamily: 'inherit', textDecoration: 'none', minHeight: 44,
          }}
        >
          🛒 楽天 ↗
        </a>
      </div>
      {showDisclosure && (
        <small style={{ fontSize: 10, color: 'var(--c-ink-3)', lineHeight: 1.5 }}>{STORE_DISCLOSURE_TEXT}</small>
      )}
    </div>
  );
}
