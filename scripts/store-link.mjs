#!/usr/bin/env node
// 📊 note の記事・発信者に渡す App Store のキャンペーンリンクを作る（2026-10-08・docs/lp-measurement.md）。
//
//   VITE_APP_STORE_URL=https://apps.apple.com/jp/app/orime/id… VITE_APP_STORE_PT=123456 \
//     node scripts/store-link.mjs note launch
//   → https://apps.apple.com/jp/app/orime/id…?pt=123456&ct=note_launch&mt=8
//
// 種類: note（記事）/ partner（発信者・読書会）/ share / lp / web。名前は英小文字・数字・_ に直す（40 字まで）。
// App Store の URL が無いときは作らない（公開前に配るリンクは、紹介ページ https://orime.vercel.app に）。

import { campaignToken, withCampaign, CT_KINDS } from '../src/lib/storeCampaign.js';

const [kind, ...rest] = process.argv.slice(2);
const name = rest.join('_');
const url = String(process.env.VITE_APP_STORE_URL || '').trim();
const pt = String(process.env.VITE_APP_STORE_PT || '').trim();

const ct = campaignToken(kind, name);
if (!ct) {
  console.error(`使い方: node scripts/store-link.mjs <${CT_KINDS.join('|')}> <名前>`);
  process.exit(1);
}
if (!url) {
  console.error('VITE_APP_STORE_URL がありません（App Store の URL が決まってから作ります）。');
  process.exit(1);
}
if (!pt) console.error('注意: VITE_APP_STORE_PT が無いので、ct を付けても App Store Connect で数えられません。');
console.log(`キャンペーン名: ${ct}`);
console.log(withCampaign(url, { pt, ct }));
