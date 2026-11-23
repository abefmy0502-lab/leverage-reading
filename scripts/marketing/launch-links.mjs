#!/usr/bin/env node
// 🔗 公開の朝の 1 コマンド（2026-11-23・company/launch-2026-11/launch-day-runbook.md §2 の 7:20）。
//
//   VITE_APP_STORE_URL=https://apps.apple.com/jp/app/orime/id123 VITE_APP_STORE_PT=123456 \
//     node scripts/marketing/launch-links.mjs
//
// 公開の日に使う下書き（SNS・メール・レビューのお願い）の App Store のリンクの置き場所を、
// 場ごとのキャンペーンリンク（ct=）に置き換えた写しを marketing-out/launch/ に書き、一覧 links.md も作る。
// 元の下書きは変えない。置き換えられずに残った所があれば一覧に出して 1 で終わる。
// --dry-run: URL が無くても、どのキャンペーン名が要るかだけを並べる（承認の前の確かめ）。

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { withCampaign } from '../../src/lib/storeCampaign.js';
import { resolveLaunchLinks, campaignNamesIn, isAppStoreAppUrl, EXTRA_CAMPAIGNS } from './launchLinks.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const FILES = [
  ...readdirSync(join(ROOT, 'company/sns-prep')).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => `company/sns-prep/${f}`),
  'company/launch-2026-11/launch-email.md',
  'company/launch-2026-11/review-request.md',
];

const dry = process.argv.includes('--dry-run');
const url = String(process.env.VITE_APP_STORE_URL || '').trim();
const pt = String(process.env.VITE_APP_STORE_PT || '').trim();

if (dry) {
  for (const f of FILES) {
    const names = campaignNamesIn(readFileSync(join(ROOT, f), 'utf8'));
    console.log(`${f}: ${names.length ? names.join(' ') : '（リンクの置き場所なし）'}`);
  }
  console.log(`プロフィール・TikTok: ${EXTRA_CAMPAIGNS.join(' ')}`);
  process.exit(0);
}

if (!isAppStoreAppUrl(url)) {
  console.error('VITE_APP_STORE_URL に App Store のアプリのページ（https://apps.apple.com/jp/app/…/id数字）を入れてください。');
  process.exit(1);
}
if (!pt) console.warn('⚠️ VITE_APP_STORE_PT がありません。ct を付けても App Store Connect で数えられないので、URL だけにします。');

const outDir = join(ROOT, 'marketing-out/launch');
mkdirSync(outDir, { recursive: true });
const all = new Map();
const leftovers = [];
for (const f of FILES) {
  const { text, links, left } = resolveLaunchLinks(readFileSync(join(ROOT, f), 'utf8'), { url, pt });
  writeFileSync(join(outDir, basename(f)), text);
  for (const [ct, link] of links) all.set(ct, link);
  for (const l of left) leftovers.push(`${f}: ${l}`);
}
for (const ct of EXTRA_CAMPAIGNS) if (!all.has(ct)) all.set(ct, withCampaign(url, { pt, ct }));
const table = ['# 公開の日のリンク（場ごと）', '', '| ct | リンク |', '|---|---|', ...[...all].map(([ct, l]) => `| ${ct} | ${l} |`), ''].join('\n');
writeFileSync(join(outDir, 'links.md'), table);
console.log(`✓ ${FILES.length} 本の写しと links.md（${all.size} 個のリンク）を marketing-out/launch/ に書きました。`);
if (leftovers.length) {
  console.error(`⚠️ 置き換えられなかった所が ${leftovers.length} か所:`);
  for (const l of leftovers) console.error(`  ${l}`);
  process.exit(1);
}
