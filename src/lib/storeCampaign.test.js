// 📊 App Store のキャンペーンリンク（ct=・2026-10-08）。
import { describe, it, expect } from 'vitest';
import { ctSlug, campaignToken, withCampaign, storeCampaignLink, shareCampaign, CT_MAX } from './storeCampaign';

const URL_ = 'https://apps.apple.com/jp/app/orime/id1234567890';

describe('campaignToken（キャンペーン名）', () => {
  it('種類_名前 の形で、英小文字・数字・_ だけ', () => {
    expect(campaignToken('note', 'Launch 2026-11')).toBe('note_launch_2026_11');
    expect(campaignToken('partner', 'Nekomachi')).toBe('partner_nekomachi');
    expect(campaignToken('lp', 'hero_3d')).toBe('lp_hero_3d');
    expect(ctSlug('  --A b__C--  ')).toBe('a_b_c');
  });
  it('決まっていない種類は空・名前が日本語だけなら種類だけ', () => {
    expect(campaignToken('ad', 'x')).toBe('');
    expect(campaignToken('note', '公開の記事')).toBe('note');
  });
  it('40 字まで（末尾の _ は残さない）', () => {
    const ct = campaignToken('partner', 'a'.repeat(60));
    expect(ct.length).toBeLessThanOrEqual(CT_MAX);
    expect(ct.endsWith('_')).toBe(false);
  });
});

describe('withCampaign / storeCampaignLink', () => {
  it('pt と ct を付ける（mt=8）', () => {
    expect(withCampaign(URL_, { pt: '123456', ct: 'share_record' }))
      .toBe(`${URL_}?pt=123456&ct=share_record&mt=8`);
    expect(withCampaign(`${URL_}?l=ja`, { pt: '1', ct: 'x' })).toBe(`${URL_}?l=ja&pt=1&ct=x&mt=8`);
  });
  it('pt が無ければ URL のまま（数えられない ct を付けない）', () => {
    expect(withCampaign(URL_, { pt: '', ct: 'share_record' })).toBe(URL_);
  });
  it('App Store の URL がまだ無い（live でない）なら空＝入れない', () => {
    expect(storeCampaignLink({ url: URL_, live: false, pt: '1' }, 'share_record')).toBe('');
    expect(storeCampaignLink({ url: URL_, live: true, pt: '1' }, 'share_record')).toBe(`${URL_}?pt=1&ct=share_record&mt=8`);
    expect(withCampaign('', { pt: '1', ct: 'x' })).toBe('');
  });
});

describe('shareCampaign（写真で共有）', () => {
  it('重ね方と今月の記録かで名前を分ける', () => {
    expect(shareCampaign({ variant: 'record' })).toBe('share_record');
    expect(shareCampaign({ variant: 'stats' })).toBe('share_stats');
    expect(shareCampaign({ variant: 'quote' })).toBe('share_quote');
    expect(shareCampaign({ variant: 'record', month: true })).toBe('share_month_record');
    expect(shareCampaign({ variant: 'unknown' })).toBe('share_record');
  });
});
