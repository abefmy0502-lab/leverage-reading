import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveLaunchLinks, campaignNamesIn, isAppStoreAppUrl } from './launchLinks.js';

const URL = 'https://apps.apple.com/jp/app/orime/id1234567890';

describe('公開の朝のリンク', () => {
  it('SNS の置き場所を場ごとのリンクに', () => {
    const r = resolveLaunchLinks('返信 1：`{APP_STORE_URL}?ct=x_consult`', { url: URL, pt: '999' });
    expect(r.text).toBe(`返信 1：\`${URL}?pt=999&ct=x_consult&mt=8\``);
    expect(r.left).toEqual([]);
    expect(r.links.get('x_consult')).toContain('ct=x_consult');
  });
  it('メールの【…（ct=…）】もリンクに', () => {
    const r = resolveLaunchLinks('▼ App Store\n【App Store のキャンペーンリンク（ct=email_launch）】\n', { url: URL, pt: '1' });
    expect(r.text).toContain(`${URL}?pt=1&ct=email_launch&mt=8`);
    expect(r.text).not.toContain('【');
  });
  it('pt が無ければ URL だけ', () => {
    expect(resolveLaunchLinks('{APP_STORE_URL}?ct=th_goal', { url: URL }).text).toBe(URL);
  });
  it('URL が無ければ置き換えず、残りとして返す', () => {
    const r = resolveLaunchLinks('{APP_STORE_URL}?ct=x_goal', { url: '' });
    expect(r.text).toBe('{APP_STORE_URL}?ct=x_goal');
    expect(r.left.length).toBe(1);
  });
  it('説明の文の中の置き場所は残りに数えない', () => {
    expect(resolveLaunchLinks('`{APP_STORE_URL}` に ct を付ける', { url: URL }).left).toEqual([]);
  });
  it('キャンペーン名を重ねずに集める', () => {
    expect(campaignNamesIn('{APP_STORE_URL}?ct=x_a {APP_STORE_URL}?ct=x_a 【リンク（ct=email_b）】')).toEqual(['x_a', 'email_b']);
  });
  it('App Store のアプリのページの URL だけを受け付ける', () => {
    expect(isAppStoreAppUrl(URL)).toBe(true);
    expect(isAppStoreAppUrl('https://apps.apple.com/jp/app/id1234')).toBe(true);
    expect(isAppStoreAppUrl('https://orime.vercel.app')).toBe(false);
    expect(isAppStoreAppUrl(`${URL}?pt=1`)).toBe(false);
  });
  it('公開の日の下書きは、本物の URL を入れると置き場所が 1 つも残らない', () => {
    const files = [
      ...readdirSync('company/sns-prep').filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => `company/sns-prep/${f}`),
      'company/launch-2026-11/launch-email.md',
    ];
    for (const f of files) {
      const r = resolveLaunchLinks(readFileSync(f, 'utf8'), { url: URL, pt: '1' });
      expect(r.left, f).toEqual([]);
    }
  });
});
