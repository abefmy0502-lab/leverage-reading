// 🛒 AI 選書のおすすめカードの購入リンク（Amazon・楽天ブックス）。
// 主役は「読みたいに追加」なので、ストアは控えめな文字リンク（btnLink: --accent・15/600・高さ 44・枠なし・↗）。
// 会話中のカード（BookAdvisor）と過去の AI 選書の中身（AdvisorHistory）で同じ部品を使う（2026-10-04 に BookAdvisor から切り出し）。
// 紹介料の開示はカード群の下にまとめて 1 回（ここでは出さない）。
import { ExternalLink as IcExternal } from 'lucide-react';
import { getRakutenLink, RAKUTEN_LINK_REL } from '../lib/rakutenLink';
import { getAmazonLink, handleAmazonClick, AMAZON_LINK_REL } from '../lib/amazonLink';
import { btnLink } from '../styles/ui';

const storeLink = { ...btnLink, gap: 'var(--space-1)', textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box' };

export default function AdvisorStoreLinks({ book }) {
  const title = book?.title || '';
  const amazon = getAmazonLink(book);
  const rakuten = getRakutenLink(book);
  return (
    // 文字の左端をカードの本文にそろえる（btnLink の左右 4 を打ち消す）。
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginLeft: 'calc(-1 * var(--space-1))' }}>
      <a
        href={amazon} target="_blank" rel={AMAZON_LINK_REL}
        onClick={(e) => { e.stopPropagation(); handleAmazonClick(e, amazon); }}
        aria-label={`Amazon で『${title}』を見る（外部リンク）`}
        style={storeLink}
      >
        Amazon<IcExternal size={16} aria-hidden="true" />
      </a>
      <a
        href={rakuten} target="_blank" rel={RAKUTEN_LINK_REL}
        onClick={(e) => e.stopPropagation()}
        aria-label={`楽天ブックス で『${title}』を見る（外部リンク）`}
        style={storeLink}
      >
        楽天ブックス<IcExternal size={16} aria-hidden="true" />
      </a>
    </div>
  );
}
