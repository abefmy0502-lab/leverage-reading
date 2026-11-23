// 📸 LP の「すすめたい本は、リンク 1 つで。」の節の画面写真（2026-11-23 オーナー「本棚をシェアやフォローなどの機能は
//   LP に必ず入れてほしい・優秀な社会人は自分のおすすめな本を教えたりする」）。
//   公開のページ（api/_profilePage.js）を本物の描き方（renderBook / renderProfile）で、見本の人の本で描いて撮る。
//   表紙は外の画像を読まずに、公開のページと同じ書名の板（coverPlaceholder）で出す。
//
//   node scripts/lp-social-shots.mjs  → public/lp/social-book-<light|dark>-<390|780>.webp・social-shelf-…
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderBook, renderProfile, buildShelf } from '../api/_profilePage.js';

const SUMMARY = '結果は「考え方×熱意×能力」。能力より先に、考え方の向きを整える。\n\nチームの朝会では、まず「どうすればできるか」から話すことにした。できない理由を並べる時間が減った。';
const BOOKS = [
  { id: '11111111-1111-4111-8111-111111111111', title: '考え方', author: '稲盛和夫', status: 'done', rating: 5, leverage_memo: SUMMARY },
  { id: '22222222-2222-4222-8222-222222222222', title: 'イシューからはじめよ', author: '安宅和人', status: 'done', rating: 5, leverage_memo: '解く前に、解くべき問いを選ぶ。' },
  { id: '33333333-3333-4333-8333-333333333333', title: 'エッセンシャル思考', author: 'グレッグ・マキューン', status: 'done', rating: 4, leverage_memo: 'やらないことを先に決める。' },
  { id: '44444444-4444-4444-8444-444444444444', title: '人を動かす', author: 'D・カーネギー', status: 'done', rating: 4 },
  { id: '55555555-5555-4555-8555-555555555555', title: '嫌われる勇気', author: '岸見一郎', status: 'reading' },
  { id: '66666666-6666-4666-8666-666666666666', title: 'チームが機能するとはどういうことか', author: 'エイミー・C・エドモンドソン', status: 'reading' },
  { id: '77777777-7777-4777-8777-777777777777', title: '1分で話せ', author: '伊藤羊一', status: 'before' },
  { id: '88888888-8888-4888-8888-888888888888', title: '問いのデザイン', author: '安斎勇樹', status: 'want' },
];
const PROFILE = {
  nickname: 'みさき',
  bio: 'メーカーで営業 10 年目。チームの後輩に、読んで効いた本をすすめています。',
  // 好きな本・好きな言葉は入れない（名前・フォロー・本棚が 1 枚に入るように）
  avatar: '',
};
const PUBLIC_ID = 'sample0001';

const book = { ...BOOKS[0], summary: SUMMARY };
const pages = {
  book: renderBook(PROFILE, book, { publicId: PUBLIC_ID, showSummary: true, linkShelf: true }).html,
  shelf: renderProfile(PROFILE, { publicId: PUBLIC_ID, shelf: buildShelf(BOOKS, [], { summaries: true }), social: true }).html,
};

const OUT = path.resolve('public/lp');
const tmp = mkdtempSync(path.join(tmpdir(), 'lp-social-'));
const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2, colorScheme: scheme });
    const p = await ctx.newPage();
    for (const [name, html] of Object.entries(pages)) {
      await p.setContent(html, { waitUntil: 'load' });
      await p.waitForTimeout(200);
      // 上の余白（ページの頭の 48）を詰めて、名前・フォロー・本棚の頭が 1 枚に入るように
      const clipY = await p.evaluate(() => {
        const el = document.querySelector('main > *');
        return el ? Math.max(0, el.getBoundingClientRect().top + window.scrollY - 24) : 0;
      });
      const png = path.join(tmp, `${name}-${scheme}.png`);
      await p.screenshot({ path: png, clip: { x: 0, y: clipY, width: 390, height: 700 }, fullPage: true });
      for (const w of [390, 780]) {
        execFileSync('convert', [png, '-resize', `${w}x`, '-quality', '82', '-define', 'webp:method=6', path.join(OUT, `social-${name}-${scheme}-${w}.webp`)]);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log('done');
