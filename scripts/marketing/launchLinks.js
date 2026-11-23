// 🔗 公開の朝に、下書きの App Store のリンクの置き場所を本物のリンクにする（2026-11-23）。
//
// 下書きの書き方は 2 つ:
//   {APP_STORE_URL}?ct=x_consult                   … SNS の下書き（company/sns-prep/）
//   【App Store のキャンペーンリンク（ct=email_launch）】 … メール・レビューのお願い（company/launch-2026-11/）
// どちらも <App Store の URL>?pt=<pt>&ct=<名前>&mt=8 にする（src/lib/storeCampaign.js の withCampaign と同じ形）。
// 何も import しないもの以外は使わない（node のスクリプトから使う）。

import { withCampaign, ctSlug, CT_MAX } from '../../src/lib/storeCampaign.js';

const PLACEHOLDER_RE = /\{APP_STORE_URL\}\?ct=([a-z0-9_]+)/g;
const BRACKET_RE = /【[^】\n]*?ct=([a-z0-9_]+)[^】\n]*】/g;

function cleanCt(name) {
  return ctSlug(name).slice(0, CT_MAX);
}

// 1 つの文の置き場所を本物のリンクにする。返すのは { text, links: Map<ct, url>, left: string[] }。
// left は、置き換えられずに残った置き場所（URL が無い・形が違う）。
export function resolveLaunchLinks(text, { url = '', pt = '' } = {}) {
  const links = new Map();
  const base = String(url || '').trim();
  const make = (ct) => {
    const c = cleanCt(ct);
    const link = withCampaign(base, { pt, ct: c });
    if (link) links.set(c, link);
    return link;
  };
  let out = String(text || '');
  if (base) {
    out = out.replace(PLACEHOLDER_RE, (m, ct) => make(ct) || m);
    out = out.replace(BRACKET_RE, (m, ct) => make(ct) || m);
  }
  const left = [
    // 説明の文の中の `{APP_STORE_URL}` だけ（? が続かない）は数えない。
    ...(out.match(/\{APP_STORE_URL\}\?[^\s`）)]*/g) || []),
    ...(out.match(BRACKET_RE) || []),
  ];
  return { text: out, links, left };
}

// 下書きに出てくるキャンペーン名を全部（重ねない・出てきた順）。
export function campaignNamesIn(text) {
  const names = [];
  const add = (ct) => { const c = cleanCt(ct); if (c && !names.includes(c)) names.push(c); };
  for (const m of String(text || '').matchAll(PLACEHOLDER_RE)) add(m[1]);
  for (const m of String(text || '').matchAll(BRACKET_RE)) add(m[1]);
  return names;
}

// プロフィール・TikTok など、下書きの文の中には置き場所が無いが公開の朝に要るリンク（company/sns-prep/profiles.md・instagram-week1.md）。
export const EXTRA_CAMPAIGNS = ['x_profile', 'th_profile', 'ig_profile', 'tt_profile', 'note_profile', 'tt_shelf', 'tt_goal', 'tt_consult'];

// App Store のアプリのページの URL か（https://apps.apple.com/<国>/app/…/id<数字>）。
export function isAppStoreAppUrl(url) {
  return /^https:\/\/apps\.apple\.com\/[a-z]{2}\/app\/[^?#\s]*\/?id\d+$/.test(String(url || '').trim());
}
