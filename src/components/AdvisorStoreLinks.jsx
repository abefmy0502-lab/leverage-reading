// 🛒 AI 選書のおすすめカードの購入リンク（Amazon・楽天ブックス）。
// 主役は「読みたいに追加」なので、ストアは控えめな文字リンク（btnLink: --accent・15/600・高さ 44・枠なし・↗）。
// 会話中のカード（BookAdvisor）と過去の AI 選書の中身（AdvisorHistory）で同じ部品を使う（2026-10-04 に BookAdvisor から切り出し）。
// 紹介料の開示はカード群の下にまとめて 1 回（ここでは出さない）。
import { ExternalLink as IcExternal, Share as IcShare } from 'lucide-react';
import { getRakutenLink, RAKUTEN_LINK_REL } from '../lib/rakutenLink';
import { getAmazonLink, handleAmazonClick, AMAZON_LINK_REL } from '../lib/amazonLink';
import { btnLink } from '../styles/ui';
import { advisorShareMessage, shareReferral } from '../lib/referral';
import { isAppStoreLive, storeLinkFor } from '../lib/appStore';
import { SITE_URL } from '../lib/legalLinks';
import { track } from '../lib/analytics';
import { useToast } from './Toast';

const storeLink = { ...btnLink, gap: 'var(--space-1)', textDecoration: 'none', whiteSpace: 'nowrap', boxSizing: 'border-box' };

// share: 「共有」も出す（AI 選書で見つけた本を人に教える・本と核心の 1 文と orime の入手先だけ・悩みは入れない・2026-11-26）。
export default function AdvisorStoreLinks({ book, share = false }) {
  const title = book?.title || '';
  const toast = useToast();
  const onShare = async (e) => {
    e.stopPropagation();
    track('advisor_share', { action: 'open' });
    const msg = advisorShareMessage(book, isAppStoreLive ? storeLinkFor('share_advisor') : `${SITE_URL}/lp`);
    if (!msg || await shareReferral(msg)) return;
    try {
      await navigator.clipboard?.writeText(msg);
      toast.success('本を教える文をコピーしました。');
    } catch {
      toast.error('コピーできませんでした。もう一度押してください。');
    }
  };
  const amazon = getAmazonLink(book);
  const rakuten = getRakutenLink(book);
  return (
    // 文字の左端をカードの本文にそろえる（btnLink の左右 4 を打ち消す）。押せる高さ 44 のうち文字より下の分は
    //   カードの下の余白に見えるので、12 だけ打ち消して見た目の下を上の 16 にそろえる（押せる範囲は 44 のまま・2026-11-17 ui-critic）。
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-3))' }}>
      <a
        href={amazon} target="_blank" rel={AMAZON_LINK_REL}
        onClick={(e) => { e.stopPropagation(); handleAmazonClick(e, amazon); }}
        aria-label={`Amazon で『${title}』を見る（外部リンク）`}
        style={storeLink}
      >
        Amazon<IcExternal size="1.1em" aria-hidden="true" />
      </a>
      <a
        href={rakuten} target="_blank" rel={RAKUTEN_LINK_REL}
        onClick={(e) => e.stopPropagation()}
        aria-label={`楽天ブックス で『${title}』を見る（外部リンク）`}
        style={storeLink}
      >
        楽天ブックス<IcExternal size="1.1em" aria-hidden="true" />
      </a>
      {share && (
        <button type="button" onClick={onShare} aria-label={`『${title}』を共有（人に教える）`} style={{ ...storeLink, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', marginRight: 'calc(-1 * var(--space-1))' }}>
          共有<IcShare size="1.1em" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
