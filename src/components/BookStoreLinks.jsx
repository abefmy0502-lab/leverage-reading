// Amazon + 楽天ブックス の購入リンクを並べて出す共通コンポーネント。
//
// 「本の表示は全部 Amazon と楽天の両方を出す」方針の単一の実装。本棚詳細 /
// AI選書の推薦カード / 話題の本の詳細シート すべてここを使う。
//
// variant:
//   'cta'     … want/before の本詳細向け。等分の 2 ボタンを 1 行に（文字が大きいときは縦に 2 つ）。
//   'compact' … reading/done・推薦カード・話題の本向け。控えめな横並びリンク。

import { getAmazonLink, handleAmazonClick, AMAZON_LINK_REL } from '../lib/amazonLink';
import { getRakutenLink, RAKUTEN_LINK_REL, STORE_DISCLOSURE_TEXT } from '../lib/rakutenLink';
import { ExternalLink } from 'lucide-react';
import { withPhraseBreaks } from './TightBubble';

// ストアの原色（Amazon オレンジ・楽天クリムゾン）は使わない。アプリの色はニュートラル＋
// 栗色 1 色だけ（DESIGN.md §3）。外部リンクであることは ↗ アイコンと aria-label で伝える。
const linkBase = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'transparent',
  color: 'var(--text)', fontWeight: 600, fontFamily: 'inherit', textDecoration: 'none',
  boxSizing: 'border-box', whiteSpace: 'nowrap',
};
// 注記は付随情報（DESIGN §2 --text-meta 13/400）。
const disclosureStyle = { fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)', lineHeight: 1.5 };

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
  const cta = variant === 'cta';
  const linkStyle = cta
    // 高さ 48 のボタンは DESIGN §5 どおり 17/600（44 の行ボタンだけ 15）。
    // 目立つ版は等分の 2 つを 1 行に（全幅を 2 段重ねると画面の下半分を取っていた・2026-11-18 ui-critic）。
    //   文字を大きくして 1 つが 9em に収まらないときだけ折り返して縦に 2 つ（DESIGN §6）。
    ? { ...linkBase, flex: '1 1 9em', minHeight: 48, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-body)' }
    : { ...linkBase, minHeight: 44, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sub)' };
  const icon = <ExternalLink size={16} aria-hidden="true" style={{ color: 'var(--text-3)' }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: cta ? '100%' : undefined }}>
      {/* ボタン同士は 12（DESIGN §1）。 */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 'var(--space-3)', alignItems: cta ? 'stretch' : 'center', flexWrap: 'wrap' }}>
        <a
          href={amazon} target="_blank" rel={AMAZON_LINK_REL} onClick={onAmazon}
          // 読み上げ名は見えている文字から始める（音声操作で「Amazon で…」と言えば押せるように）。
          aria-label={cta ? `Amazon で${verb}（『${title}』・外部リンク）` : `Amazon（『${title}』を${verb}・外部リンク）`}
          style={linkStyle}
        >
          {cta ? `Amazon で${verb}` : 'Amazon'}{icon}
        </a>
        <a
          href={rakuten} target="_blank" rel={RAKUTEN_LINK_REL} onClick={onRakuten}
          aria-label={cta ? `楽天で${verb}（楽天ブックス・『${title}』・外部リンク）` : `楽天ブックス（『${title}』を${verb}・外部リンク）`}
          style={linkStyle}
        >
          {cta ? `楽天で${verb}` : '楽天ブックス'}{icon}
        </a>
      </div>
      {showDisclosure && (
        // 複数行の注記は左揃え（中央揃えだと行頭がそろわず読みにくい）。
        // 文節の切れ目でだけ折り返す（「かかりま／せん」のように語の途中で割れていた・2026-10-04）。
        <small className="text-pretty" style={{ ...disclosureStyle, textAlign: 'left', paddingBottom: 'var(--space-4)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(STORE_DISCLOSURE_TEXT)}</small>
      )}
    </div>
  );
}
