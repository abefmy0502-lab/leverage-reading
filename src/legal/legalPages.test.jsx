// 📜 公開中の法務ページ（利用規約・特商法の表記・プライバシーポリシー）が、いま売っているものの条件と
// 同意のシートの送るものに合っているか（2026-10-04 法令の点検）。数字は lib/tokenAmounts.js と lib/foundingOffer.js から。
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TermsPage from './TermsPage';
import SctPage from './SctPage';
import PrivacyPage from './PrivacyPage';
import { FREE_TOKENS, PAID_TOKENS, TRIAL_TOKENS, FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { FOUNDING_PRICE_YEN } from '../lib/foundingOffer';
import { featureForPurpose } from '../lib/aiProcessors';

// タグを外して、空白をつめた本文（数字の前後の空白の有無に左右されないように）。
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const founding = FOUNDING_PRICE_YEN.toLocaleString('ja-JP');

describe('利用規約', () => {
  const t = text(<TermsPage />);
  it('無料プラン・7 日間無料・創業メンバー価格・トークンの決まりがある', () => {
    expect(t).toContain('無料プラン');
    expect(t).toContain(`毎月${FREE_TOKENS}トークン`);
    expect(t).toContain(`毎月${FREE_OCR_PER_MONTH}回`);
    expect(t).toContain(`毎月${PAID_TOKENS}トークン`);
    expect(t).toContain(`${TRIAL_TOKENS}トークン`);
    expect(t).toContain('7日間無料');
    expect(t).toContain(`${founding}円`);
    expect(t).toContain('年額12,800円(税込)で自動更新');
    expect(t).toContain('翌月に繰り越しません');
    expect(t).toContain('購入から180日間');
    expect(t).toContain('1か月以上前に本サービス内でお知らせ');
  });
  it('無い「各号」を参照しない・宣伝やサブライセンスでコンテンツを使わない', () => {
    expect(t).not.toContain('各号');
    expect(t).not.toContain('サブライセンス');
    expect(t).not.toMatch(/宣伝の目的/);
  });
  it('軽過失の責任を全部は免れない（上限つき・軽過失と明記）', () => {
    expect(t).not.toContain('一切の責任を負いません');
    expect(t).toContain('軽過失');
    expect(t).toContain('上限');
  });
  it('最終更新日', () => {
    expect(t).toContain('最終更新日:2026年10月4日');
  });
});

describe('特定商取引法に基づく表記', () => {
  const t = text(<SctPage />);
  it('無料プラン・自動更新・創業メンバー価格・追加トークン・解約の方法', () => {
    expect(t).toContain('無料プラン:0円');
    expect(t).toContain('自動で選んだプランの料金');
    expect(t).toContain(`1年目が${founding}円(税込)`);
    expect(t).toContain('年額12,800円(税込)で自動更新');
    expect(t).toContain('300トークン300円(税込)');
    expect(t).toContain('1,000トークン800円(税込)');
    expect(t).toContain('180日間有効');
    expect(t).toContain('払い戻しはできません');
    expect(t).toContain('サブスクリプション');
    expect(t).toContain('最終更新日:2026年10月4日');
  });
});

describe('プライバシーポリシー', () => {
  const t = text(<PrivacyPage />);
  it('AI 選書の送るものに、同意のシートと同じく「メモの一部」がある', () => {
    expect(featureForPurpose('book_advisor').sends).toContain('メモの一部');
    expect(t).toMatch(/AI選書:[^→]*メモの一部/);
  });
  it('公開のお知らせのメールアドレス（取得・利用目的・消す時期）', () => {
    expect(t).toContain('公開のお知らせ');
    expect(t).toContain('公開のお知らせにだけ使い');
    expect(t).toContain('公開から3か月以内に削除');
    expect(t).not.toContain('メールマガジン');
  });
});
