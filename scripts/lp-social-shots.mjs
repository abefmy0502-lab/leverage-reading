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

const SUMMARY = '能力より先に、考え方の向きを整える。朝会では、まず「どうすればできるか」から話すことにした。';
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
  bio: '営業 10 年目。後輩に、効いた本をすすめています。',
  // 好きな本・好きな言葉は入れない（名前・フォロー・本棚が 1 枚に入るように）
  avatar: '',
};
const PUBLIC_ID = 'sample0001';

const book = { ...BOOKS[0], summary: SUMMARY };
const pages = {
  book: renderBook(PROFILE, book, { publicId: PUBLIC_ID, showSummary: true, linkShelf: false }).html,
  shelf: renderProfile(PROFILE, { publicId: PUBLIC_ID, shelf: buildShelf(BOOKS, [], { summaries: true }), social: true }).html,
};

const OUT = path.resolve('public/lp');
// スマホでも中の文字がほぼ実寸で読めるよう、狭い幅で上の大事な所だけ（2026-11-23 ui-critic round 7）
const W = 320;
const H = 660;
// ブラウザの住所の行（リンクで開く Web のページだと分かるように・LP の部品に見せない）
const URLS = { book: 'orime.vercel.app/u/misaki/b/…', shelf: 'orime.vercel.app/u/misaki' };
const tmp = mkdtempSync(path.join(tmpdir(), 'lp-social-'));
const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: scheme });
    const p = await ctx.newPage();
    for (const [name, html] of Object.entries(pages)) {
      await p.setContent(html, { waitUntil: 'load' });
      await p.evaluate((u) => {
        document.querySelector('main').style.paddingTop = '16px';
        const bar = document.createElement('div');
        bar.textContent = u;
        bar.setAttribute('style', 'position:sticky;top:0;z-index:9;height:28px;display:flex;align-items:center;justify-content:center;background:var(--fill);color:var(--text-3);font:13px/1 -apple-system,system-ui,sans-serif;border-bottom:1px solid var(--separator)');
        document.body.prepend(bar);
      }, URLS[name]);
      await p.waitForTimeout(200);
      const clipY = 0;
      const png = path.join(tmp, `${name}-${scheme}.png`);
      await p.screenshot({ path: png, clip: { x: 0, y: clipY, width: W, height: H }, fullPage: true });
      for (const [w, src] of [[390, 320], [780, 640]]) {
        execFileSync('convert', [png, '-resize', `${src}x`, '-quality', '82', '-define', 'webp:method=6', path.join(OUT, `social-${name}-${scheme}-${w}.webp`)]);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log('done');
