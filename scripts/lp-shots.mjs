#!/usr/bin/env node
// 📸 LP（src/pages/Landing.jsx）に載せるアプリ画面の写真を撮り直す。
//
// お試しモード（サンプルのメモ入り・Supabase/AI 不要）で実際のアプリを開き、
// iPhone 相当（390×844 @2x）で明暗の両方を撮って、public/lp/<名前>-<light|dark>-<390|780>.webp に書き出す。
// アプリの画面を変えたら、これを流して LP の写真を今の画面にそろえる。
//
// 使い方:
//   1. 別ターミナルで  npm run demo            （http://localhost:5173）
//   2. npm run lp:shots                       → LP に載せる全部（hero・flow-line/talk/voice/source・action・focus・share・fields・advisor）
//      npm run lp:shots -- answer recall      → 絞って撮る
//   （お試しモードを別のポートで動かしているときは UI_SHOTS_URL=http://localhost:5461 などを付ける）
// 撮る画面: hero（1 冊の本に相談し、本の語り口で答えている所・ヒーロー・2026-10-11）/
//           flow-line・flow-talk・flow-voice・flow-source（「読んだ本と、対話する」の 4 コマ・2026-10-11）/
//           focus（集中モード）/ fields（記録の分野）/ advisor（AI 選書のおすすめの本と読む順番）/ answer（相談の答え・聞き返し）/
//           sources（根拠の本）/ memo（メモを書くシート）/
//           action（行動）/ recall（思い出しカード）/ search（メモの言葉で本を探す）/
//           flow-worry・flow-memo・flow-ask・flow-action（前の 4 コマ＝部下の報告の相談・2026-10-02・名前を指定したときだけ）/
//           share（写真で共有の画像そのもの＝明暗なし・ストーリー 9:16・public/lp/share-story-<540|1080>.webp）
//
// 撮り方の決まり（2026-10-05）: どの URL にも &lpshot=1 を付ける。お試しモードが「部下が報告をくれない」の相談に、
//   悩みと噛み合う答え（根拠は自分の学び＋2 冊の本）を返す（src/demo/demoFetch.js の lpShotAnswer）。
//   相手の名前は「2 冊の本と自分の学び」になり、実在の著者名が答えの話し手に見えない（LP の画像の決まり）。
//   書名・著者名は「根拠を見る」の中の書誌として出るだけ。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE = process.env.UI_SHOTS_URL || 'http://localhost:5173';
const OUT = 'public/lp';
const only = process.argv.slice(2);
const nav = (n) => `nav button[aria-label="${n}"]`;

// お試しモードの注記（「お試しモードの応答です」）は LP の写真に写さない。
const hideDemoNote = (p) => p.evaluate(() => {
  // 注記を含むいちばん内側の要素だけを隠す（中に改行や span があっても見つける）。
  document.querySelectorAll('p,div,span').forEach((el) => {
    if (!/お試しモード/.test(el.textContent)) return;
    if ([...el.children].some((c) => /お試しモード/.test(c.textContent))) return;
    el.style.display = 'none';
  });
});
// 画面ごとの開く URL（既定は /?lpshot=1）。flow-worry は答えを途中で止める設定（&ai=stall）で、
// 送った悩みと答えの書きはじめ（結論の数行）が出ている所を撮る（読み込み中の骨組みだけの画面にしない・2026-10-05）。
const SHOT_URL = { 'flow-worry': '/?lpshot=1&ai=stall', 'flow-talk': '/?lpshot=1&ai=stall', focus: '/?lpshot=1&focus=timer' };
const DEFAULT_URL = '/?lpshot=1';
const ask = async (p) => {
  await p.locator(nav('相談')).click(); await p.waitForTimeout(800);
  await p.locator('textarea[aria-label="相談したいこと"]').fill('部下が報告をくれなくて困っています');
  await p.locator('button[aria-label="送信"]').click();
  await p.waitForTimeout(7000);
  await hideDemoNote(p);
};

// 相談の会話の場所を下端まで送る（答えの最後＝「あなたに聞きたいこと」と入力欄の上のチップを見せる）。
const chatToBottom = (p) => p.evaluate(() => {
  const el = document.querySelector('.chat-scroll');
  if (el) el.scrollTop = el.scrollHeight;
});

// ── 1 冊の本に相談する（2026-10-11・ヒーローと 4 コマ）──
const VOICE_BOOK = '嫌われる勇気';
const VOICE_Q = '相手が自分をどう思うかが気になって、意見が言えません';
const VOICE_LINE = '人にどう思われるかより、自分がどうしたいかを先に考える。';
const openBook = async (p) => {
  await p.locator('button:has-text("すべての本")').first().click(); await p.waitForTimeout(800);
  await p.locator(`.lvg-page button:has-text("${VOICE_BOOK}")`).first().click(); await p.waitForTimeout(1200);
};
const askBook = async (p) => {
  await openBook(p);
  await p.locator('button:has-text("この本に相談する")').first().click(); await p.waitForTimeout(1500);
  await p.locator('textarea[aria-label="相談したいこと"]').fill(VOICE_Q);
  await p.locator('button[aria-label="送信"]').click();
  await p.waitForTimeout(8000);
  await hideDemoNote(p);
};
// 名前の行の著者名（「（本の語り口で・AI）」の前の文字）だけを隠す。
const hideAuthorName = (p) => p.evaluate(() => {
  document.querySelectorAll('span').forEach((el) => {
    if (el.textContent.trim() !== '（本の語り口で・AI）') return;
    const name = el.previousElementSibling;
    if (name) name.style.display = 'none';
  });
});
// 画面のどこでも: 文字 text を含むいちばん内側の要素を、上から gap の所へ送る（スクロールの箱を探す）。
const scrollToTextAny = (p, text, gap) => p.evaluate(({ text, gap }) => {
  const el = [...document.querySelectorAll('*')].reverse().find((e) => e.textContent.includes(text) && e.children.length < 3);
  if (!el) return;
  let sc = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  if (sc) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - gap;
  else window.scrollBy(0, el.getBoundingClientRect().top - gap);
}, { text, gap });
// 会話の場所で、文字 text の要素を上から gap の所へ送る。
const scrollToText = (p, text, gap) => p.evaluate(({ text, gap }) => {
  const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim().startsWith(text));
  const sc = el?.closest('.chat-scroll');
  if (!el || !sc) return;
  sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - gap;
}, { text, gap });

const SHOTS = {
  // ── 2026-10-11 の作り直し（読書を、受け身から対話へ）──
  // ヒーロー: 1 冊の本（『嫌われる勇気』）に相談して、本の語り口で答え、状況を 1 つ聞き返しているところ。
  //   名前の行の著者名だけは隠す（実在の著者が話しているように見せない・LP の画像の決まり）。「（本の語り口で・AI）」は残す。
  hero: async (p) => {
    await askBook(p);
    await hideAuthorName(p);
    await scrollToText(p, VOICE_Q, 16);
  },
  // LP「読んだ本と、対話する」の 4 コマ: 一行を残す → 本に相談する → 本の語り口で聞き返す → 本とページで確かめる
  // 1. 一行を残す: メモを書いて保存し、本の詳細のメモの一覧（いちばん上に今の一行）を見せる
  'flow-line': async (p) => {
    await openBook(p);
    await p.locator('button:has-text("メモを書く")').last().click(); await p.waitForTimeout(900);
    await p.keyboard.type(VOICE_LINE, { delay: 5 });
    await p.locator('[role=dialog] button:has-text("保存")').last().click(); await p.waitForTimeout(2500);
    // 保存の知らせ（ほかの行動へのすすめ）は写さない
    await p.evaluate(() => document.querySelectorAll('[role=status], .toast, [data-toast]').forEach((el) => { el.style.display = 'none'; }));
    await scrollToTextAny(p, VOICE_LINE, 420);
  },
  'flow-talk': async (p) => {
    await openBook(p);
    await p.locator('button:has-text("この本に相談する")').first().click(); await p.waitForTimeout(1500);
    await p.locator('textarea[aria-label="相談したいこと"]').fill(VOICE_Q);
    await p.locator('button[aria-label="送信"]').click();
    await p.waitForTimeout(Number(process.env.FLOW_WORRY_MS || 4500));
    await hideDemoNote(p);
    await hideAuthorName(p);
  },
  'flow-voice': async (p) => {
    await askBook(p);
    await hideAuthorName(p);
    await chatToBottom(p);
    await p.waitForTimeout(400);
  },
  'flow-source': async (p) => {
    await askBook(p);
    await hideAuthorName(p);
    await p.locator('summary:has-text("根拠を見る")').first().click(); await p.waitForTimeout(600);
    await hideDemoNote(p);
    await scrollToText(p, '参照したメモ', 64);
  },
  // 習慣にする: 集中モード（時間を決めて読む・『数値化の鬼』）
  focus: async (p) => { await p.waitForTimeout(1500); },
  // 自分の読書を客観的に見る: 振り返り › 記録の「分野」
  fields: async (p) => {
    await p.locator(nav('振り返り')).click(); await p.waitForTimeout(800);
    await p.locator('button[role=tab]:has-text("記録")').click();
    await p.locator('#book-fields-record-title').waitFor({ timeout: 20000 }); await p.waitForTimeout(800);
    await p.evaluate(() => {
      const h = document.getElementById('book-fields-record-title');
      if (!h) return;
      h.scrollIntoView({ block: 'start' });
      const sc = [...document.querySelectorAll('*')].find((e) => e.contains(h) && e.scrollHeight > e.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(e).overflowY));
      if (sc) sc.scrollTop -= 88; else window.scrollBy(0, -170);
    });
  },
  // 次に読む本と、読み方まで: AI 選書（悩みを聞き取り → 受け取った悩みを確かめる → おすすめの本と読む順番・2026-10-11）
  advisor: async (p) => {
    await p.locator(nav('相談')).click(); await p.waitForTimeout(600);
    await p.locator('button[role=tab]:has-text("AI 選書")').click();
    await p.locator('textarea[aria-label="AI 選書への相談内容"]').fill('仕事が回らず、いつも時間が足りません');
    await p.locator('button[aria-label="本を探す"]').click(); await p.waitForTimeout(3000);
    for (const [chip, more] of [['大事なことほど後回しになる', '大事なことほど後回しになる。メールと会議で一日が終わってしまう'], ['夕方に自分の仕事を進めたい', '夕方に自分の仕事を進めたい']]) {
      await p.locator(`[aria-label="答えの候補"] button:has-text("${chip}")`).click();
      await p.locator('textarea[aria-label="自分の言葉で答える"]').fill(more);
      await p.locator('button[aria-label="答える"]').click(); await p.waitForTimeout(2500);
    }
    await p.locator('button:has-text("合っている")').click(); await p.waitForTimeout(9000);
    await hideDemoNote(p);
  },
  answer: async (p) => {
    await ask(p);
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === '部下が報告をくれなくて困っています');
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      const sc = [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 10 && e.contains(el) && getComputedStyle(e).overflowY !== 'visible');
      if (sc) sc.scrollTop -= 12;
    });
  },
  sources: async (p) => {
    await ask(p);
    await p.locator('summary:has-text("根拠を見る")').first().click(); await p.waitForTimeout(600);
    await hideDemoNote(p);
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^もとになった本/.test(e.textContent.trim()));
      if (el) el.scrollIntoView({ block: 'center' });
    });
  },
  memo: async (p) => {
    await p.locator('button[aria-label$="にメモを書く"]').first().click(); await p.waitForTimeout(800);
    await p.keyboard.type('部下の話は、結論を急がずに最後まで聞く。', { delay: 5 });
  },
  action: async (p) => {
    await p.locator(nav('振り返り')).click(); await p.waitForTimeout(800);
    await p.locator('button[role=tab]:has-text("行動")').click();
  },
  recall: async (p) => {
    await p.locator(nav('振り返り')).click(); await p.waitForTimeout(800);
    await p.locator('button[role=tab]:has-text("メモ")').click(); await p.waitForTimeout(800);
    // 特定の読書術の本（書名）は LP の写真に出さない（2026-09 オーナー方針）。
    for (let i = 0; i < 8; i++) {
      const card = await p.evaluate(() => (document.body.innerText || '').split('月ごとのメモ')[0]);
      if (!/レバレッジ/.test(card)) break;
      // 「別のメモを見る」は思い出しカードの「…」の中（2026-09-27〜）。
      await p.locator('button[aria-haspopup="menu"]').first().click(); await p.waitForTimeout(400);
      await p.locator('[role="menuitem"]:has-text("別のメモを見る"), button:has-text("別のメモを見る")').first().click(); await p.waitForTimeout(900);
    }
  },
  // ── LP「悩みから、明日の一歩まで」の 4 コマ（2026-10-02）──
  // 1. 困っていることを書いて送る（答えを書きはじめたところ）
  'flow-worry': async (p) => {
    await p.locator(nav('相談')).click(); await p.waitForTimeout(800);
    await p.locator('textarea[aria-label="相談したいこと"]').fill('部下が報告をくれなくて困っています');
    await p.locator('button[aria-label="送信"]').click();
    await p.waitForTimeout(Number(process.env.FLOW_WORRY_MS || 4500));
    await hideDemoNote(p);
  },
  // 2. あなたのメモの一節が返ってくる（根拠を開いたところ）
  'flow-memo': async (p) => {
    await ask(p);
    await p.locator('summary:has-text("根拠を見る")').first().click(); await p.waitForTimeout(600);
    await hideDemoNote(p);
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^参照したメモ/.test(e.textContent.trim()));
      if (!el) return;
      el.scrollIntoView({ block: 'start' });
      const sc = el.closest('.chat-scroll');
      if (sc) sc.scrollTop -= 64;
    });
  },
  // 3. 状況を 1 つ聞き返す（答えの最後の「あなたに聞きたいこと」と、答えの候補のチップ）
  'flow-ask': async (p) => {
    await ask(p);
    await chatToBottom(p);
    await p.waitForTimeout(400);
    await hideDemoNote(p);
  },
  // 4. やることを 1 つ決める（「会議の前」と答えて「ここで答えと行動を」）
  'flow-action': async (p) => {
    await ask(p);
    await p.locator('[aria-label="続けて聞く"] button >> nth=0').click();
    await p.locator('[aria-label="続けて聞く"] button:has-text("ここで答えと行動を")').waitFor({ timeout: 15000 });
    await p.locator('[aria-label="続けて聞く"] button:has-text("ここで答えと行動を")').click();
    await p.locator('[aria-label="相談への答え"]:not([aria-busy]) button:has-text("行動に追加")').waitFor({ timeout: 15000 });
    await p.waitForTimeout(800);
    await hideDemoNote(p);
  },
  // メモの言葉で本を探す（すべての本の検索・2026-09-30）
  search: async (p) => {
    await p.locator('button:has-text("すべての本")').first().click(); await p.waitForTimeout(800);
    await p.locator('button[aria-label="本を検索"]').click(); await p.waitForTimeout(300);
    await p.locator('input[aria-label^="本を検索（"]').fill('チーム'); await p.waitForTimeout(1200);
    await p.locator('input[aria-label^="本を検索（"]').blur();
  },
};
// メモのシートは下半分だけを切り出す（背後のぼかしたホームを見せない）。値は @2x の px。
const CROP_TOP = { memo: 846, 'flow-line': 0 };

function browserOptions() {
  if (process.env.PW_EXE) return { executablePath: process.env.PW_EXE };
  if (existsSync('/opt/pw-browsers/chromium')) return { executablePath: '/opt/pw-browsers/chromium' };
  return { channel: 'chrome' };
}

// 📷 写真で共有の画像そのもの（アプリの描き方 src/lib/shareCard.js の drawShareCard をそのまま呼ぶ・2026-10-11 から
//   ストーリー 9:16 の「書名と数字」で数字と一文を隠し、一文は「言葉を入れる」の明朝の引用＝「」で包む・オーナーの見本の形）。写真は scripts/fixtures/lp-share-cafe.jpg（オーナーの見本の写真・文字なし）。
//   本は架空（書名「はたらく考え方」・著者「阿部文哉」・一文は新しく書いた文）＝実在の本の文を写さない。表紙も架空の装丁を描く。
const LP_SHARE_BOOK = { title: 'はたらく考え方', author: '阿部文哉', line: '人は、言われたことより、見たことで動く。まず自分がやってみせることだ。', page: 42 };
async function shootShareCard(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', colorScheme: 'light' });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const photoUrl = `data:image/jpeg;base64,${readFileSync('scripts/fixtures/lp-share-cafe.jpg').toString('base64')}`;
    const out = await page.evaluate(async ({ photoUrl, b }) => {
      const card = await import('/src/lib/shareCard.js');
      const ov = await import('/src/lib/shareOverlay.js');
      const photo = await card.loadPhotoFile(new File([await (await fetch(photoUrl)).blob()], 'cafe.jpg', { type: 'image/jpeg' }));
      const c = document.createElement('canvas'); c.width = 300; c.height = 440;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 300, 440); g.addColorStop(0, '#3b5a78'); g.addColorStop(1, '#1d3247');
      x.fillStyle = g; x.fillRect(0, 0, 300, 440);
      x.fillStyle = '#f4efe6'; x.font = '600 34px serif'; x.fillText('はたらく', 28, 90); x.fillText('考え方', 28, 136);
      const cover = await card.prepareCover({ cover: c.toDataURL('image/png') });
      const now = new Date(2026, 9, 12);
      // 読書中の本・数字と一文は隠し、一文は「言葉を入れる」の明朝の引用で上の中央に（オーナーの見本の形・2026-10-11）。
      const book = { id: 'lp', title: b.title, author: b.author, status: 'reading', startDate: '2026-10-05', actions: [] };
      const record = ov.bookRecord(book, [{ id: 'm0', text: b.line }], now);
      const fonts = await card.prepareFonts(`${record.kicker}${record.title}${record.sub}「${b.line}」2026.10.12`);
      const logo = await card.prepareLogo();
      const cv = document.createElement('canvas');
      card.drawShareCard(cv, {
        layout: 'record', format: 'story', style: 'photo', photo, record, stamp: '2026.10.12',
        line: '', page: null, title: b.title, author: b.author, seedKey: 'm0',
        cover, covers: [], fonts, logo, view: { panX: 0, panY: 0, zoom: 1 }, textPos: 'bottom',
        hidden: ['books', 'memos', 'actions', 'reading', 'quote', 'date'],
        phrase: { text: b.line, style: 'mincho', x: 0.5, y: 0.24, scale: 1, invert: false },
      });
      const res = { full: cv.toDataURL('image/png').split(',')[1] };
      for (const w of [540, 1080]) {
        const d = document.createElement('canvas');
        d.width = w; d.height = Math.round(cv.height * w / cv.width);
        const dg = d.getContext('2d'); dg.imageSmoothingQuality = 'high';
        dg.drawImage(cv, 0, 0, d.width, d.height);
        res[w] = d.toDataURL('image/webp', 0.82).split(',')[1];
      }
      return res;
    }, { photoUrl, b: LP_SHARE_BOOK });
    for (const w of [540, 1080]) writeFileSync(`${OUT}/share-story-${w}.webp`, Buffer.from(out[w], 'base64'));
    // 書き出した 1 枚そのもの（PNG・確かめ用・git 管理外）
    mkdirSync('ui-shots/lp-share', { recursive: true });
    writeFileSync('ui-shots/lp-share/share-story-1080.png', Buffer.from(out.full, 'base64'));
    console.log('✓ share');
    return 0;
  } catch (e) {
    console.error(`✗ share: ${e.message.split('\n')[0]}`);
    return 1;
  } finally {
    await ctx.close();
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(browserOptions());
const encoder = await browser.newPage();
let failed = 0;
if (!only.length || only.includes('share')) failed += await shootShareCard(browser);
// 2026-10-02 の作り直しで LP に載せなくなった画面（ストアの画像などで使うときは名前を指定して撮る）。
// 2026-10-11 の作り直しで、ヒーローは hero（1 冊の本の語り口）、4 コマは flow-line・flow-talk・flow-voice・flow-source に。
// 前の 4 コマ（部下の報告の相談）と answer は外した。
const EXTRA = new Set(['answer', 'sources', 'memo', 'recall', 'search', 'flow-worry', 'flow-memo', 'flow-ask', 'flow-action']);
for (const [name, steps] of Object.entries(SHOTS)) {
  if (only.length ? !only.includes(name) : EXTRA.has(name)) continue;
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      locale: 'ja-JP', colorScheme: scheme,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}${SHOT_URL[name] || DEFAULT_URL}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await steps(page);
      await page.waitForTimeout(700);
      const b64 = (await page.screenshot()).toString('base64');
      for (const w of [390, 780]) {
        const data = await encoder.evaluate(async ({ b64, w, crop }) => {
          const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
          const sh = img.height - crop;
          const c = document.createElement('canvas');
          c.width = w; c.height = Math.round(sh * w / img.width);
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, crop, img.width, sh, 0, 0, c.width, c.height);
          return c.toDataURL('image/webp', 0.8).split(',')[1];
        }, { b64, w, crop: CROP_TOP[name] || 0 });
        writeFileSync(`${OUT}/${name}-${scheme}-${w}.webp`, Buffer.from(data, 'base64'));
      }
      console.log(`✓ ${name} (${scheme})`);
    } catch (e) {
      failed += 1;
      console.error(`✗ ${name} (${scheme}): ${e.message.split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();
if (failed) process.exit(1);
