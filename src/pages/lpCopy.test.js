// LP の条件で変わる文（lpCopy.js）。2026-10-05: 創業メンバー価格の期間中、料金の注記に「{MONTHLY_TEXT}」と
// 変数名がそのまま出ていた（自動更新後の金額が読めない）。全部の組み合わせで書きかけの文字が残らないことを確かめる。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLpCopy, plainText, storeHrefOf, APP_STORE_SEARCH_URL, LP_TITLE, LP_DESCRIPTION, LP_OG_DESCRIPTION, VOICE_NOTE, SAMPLE_NOTE } from './lpCopy';

const OFFER_ON = { active: true, endLabel: '12月15日', price: '¥9,800', priceLabel: '1 年目 ¥9,800' };
const OFFER_OFF = { active: false, endLabel: '', price: '¥9,800', priceLabel: '1 年目 ¥9,800' };
const combos = [];
for (const offer of [OFFER_ON, OFFER_OFF]) for (const trialNote of ['7 日間無料', '']) for (const prelaunch of [false, true]) for (const jev of [false, true]) {
  combos.push({ offer, trialNote, prelaunch, jev });
}
const allText = (c) => [
  ...c.pricingNote, ...c.priceLine,
  ...c.faq.flatMap((f) => [f.q, f.a]),
  ...c.faqLd.flatMap((f) => [f.q, f.a]),
].join('\n');
const name = ({ offer, trialNote, prelaunch, jev }) => `offer=${offer.active} trial=${Boolean(trialNote)} pre=${prelaunch} jev=${jev}`;

describe('buildLpCopy（全部の組み合わせ）', () => {
  it.each(combos.map((c) => [name(c), c]))('%s: 書きかけの文字（{ } $ undefined）が無い', (_, cfg) => {
    const t = allText(buildLpCopy(cfg));
    expect(t).not.toMatch(/[{}$]/);
    expect(t).not.toMatch(/undefined|null|NaN/);
  });
  it.each(combos.map((c) => [name(c), c]))('%s: 料金の注記に、自動更新のあとの月額の金額がある', (_, cfg) => {
    const c = buildLpCopy(cfg);
    const note = c.pricingNote[0].replace(/\u2060/g, '').replace(/\u00a0/g, ' ');
    expect(note).toMatch(/月額 ¥1,480[^。]*税込/);
    if (cfg.offer.active) expect(note).toContain('2 年目から年額 ¥12,800（税込）で自動更新');
    if (cfg.trialNote) expect(c.pricingNote[0]).toContain('24 時間前までに解約すれば');
  });
  it.each(combos.map((c) => [name(c), c]))('%s: 使わない言い方（作り話・忘れない・初めての方・先着・通常価格・シェア）が無い', (_, cfg) => {
    const t = allText(buildLpCopy(cfg));
    ['作り話', '忘れない', '初めての方', '初めて登録', '先着', '通常価格', '通常の', 'シェア', '全部ダウンロード', 'すべて消去', 'マイ読書脳', 'お試し', '無料トライアル']
      .forEach((w) => expect(t).not.toContain(w));
  });
});

describe('公開後（既定）と公開前（VITE_LP_PRELAUNCH=on）', () => {
  it('既定は公開済みの形: 「いつから」の問いが無く、パソコン・Android の答えが「いまは App Store のアプリで」・公開予定を書かない', () => {
    const c = buildLpCopy({ offer: OFFER_OFF, trialNote: '7 日間無料' });
    const t = allText(c);
    expect(c.faq.some((f) => f.q === 'いつから使えますか？')).toBe(false);
    expect(c.faq.find((f) => f.q.startsWith('パソコン')).a).toContain('いまは App Store のアプリで');
    expect(t).not.toMatch(/公開する予定|の予定）|メールアドレスを登録/);
  });
  it('公開前の形は「配信しています」と書かず、公開予定を先頭の問いで言う', () => {
    const c = buildLpCopy({ offer: OFFER_OFF, trialNote: '7 日間無料', prelaunch: true });
    const t = allText(c);
    expect(t).not.toContain('配信しています');
    expect(c.faq[0].q).toBe('いつから使えますか？');
    expect(plainText(c.faq[0].a)).toContain('2026 年 11 月');
    // 公開前だけの問いは検索結果（JSON-LD）に入れない
    expect(c.faqLd.some((f) => f.q === 'いつから使えますか？')).toBe(false);
  });
  it('公開予定の書き方は変えられる', () => {
    const c = buildLpCopy({ prelaunch: true, launchLabel: '2026 年 12 月' });
    expect(plainText(c.faq[0].a)).toContain('2026 年 12 月');
  });
});

describe('App Store へのボタンの行き先', () => {
  it('URL があればそのページ、無ければ日本の App Store の「Orime」の検索', () => {
    expect(storeHrefOf({ live: true, url: 'https://apps.apple.com/jp/app/orime/id123?pt=1&ct=lp_hero_photo' })).toContain('/id123');
    expect(storeHrefOf({ live: false, url: 'https://apps.apple.com/jp/app/orime' })).toBe(APP_STORE_SEARCH_URL);
    expect(APP_STORE_SEARCH_URL).toMatch(/^https:\/\/apps\.apple\.com\/jp\/.*term=Orime/);
  });
});

describe('本の語り口（著者と話せる、とは書かない）', () => {
  it.each(combos.map((c) => [name(c), c]))('%s: 「著者と話」「著者本人が答え」が無く、語り口の注記が FAQ にある', (_, cfg) => {
    const t = allText(buildLpCopy(cfg));
    expect(t).not.toMatch(/著者と(話|対話)|著者本人が答え|著者が答え/);
    expect(t).toContain(VOICE_NOTE);
  });
  it('title・description にも「著者と話せる」と書かない・AI 要約と書かない', () => {
    [LP_TITLE, LP_DESCRIPTION, LP_OG_DESCRIPTION].forEach((t) => {
      expect(t).not.toMatch(/著者と(話|対話)/);
      expect(t).not.toContain('AI 要約');
    });
  });
});

describe('創業メンバー価格', () => {
  it('期間中: 月額の 7 日間無料を使うと年額の創業メンバー価格が使えないことが分かる', () => {
    const c = buildLpCopy({ offer: OFFER_ON, trialNote: '7 日間無料' });
    const f = c.faq.find((x) => x.q.includes('創業メンバー価格'));
    expect(plainText(f.a)).toContain('先に月額プランの 7 日間無料を使うと、年額の創業メンバー価格は使えなくなります');
    expect(f.a).toContain('同じ Apple ID でプランの初回特典を使ったことがない方');
    // 期間ものの問いは検索結果に入れない・見えない印も外す
    expect(c.faqLd.some((x) => x.q.includes('創業メンバー価格'))).toBe(false);
    c.faqLd.forEach((x) => expect(x.a).not.toMatch(/[⁠ ]/));
    // 期間中、7 日間無料は月額だけ
    expect(c.priceLine[1]).toContain('月額プランは 7 日間無料');
  });
  it('期間外: 創業メンバー価格の問いが無い', () => {
    const c = buildLpCopy({ offer: OFFER_OFF, trialNote: '7 日間無料' });
    expect(c.faq.some((x) => x.q.includes('創業メンバー価格'))).toBe(false);
    expect(c.priceLine[1]).toContain('プランは 7 日間無料');
  });
});

describe('AI の送り先', () => {
  const sendQ = (c) => c.faq.find((f) => f.q.startsWith('AI には')).a;
  it('Jev を入れたビルドだけ TypeSafe AI 社を書く', () => {
    expect(sendQ(buildLpCopy({ jev: true }))).toContain('TypeSafe AI');
    expect(sendQ(buildLpCopy({ jev: false }))).not.toContain('TypeSafe AI');
  });
});

describe('index.html の静的な meta と LP の言葉がそろっている', () => {
  it('title・description・og・twitter', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain(`<title>${LP_TITLE}</title>`);
    expect(html).toContain(`<meta name="description" content="${LP_DESCRIPTION}" />`);
    expect(html).toContain(`<meta property="og:title" content="${LP_TITLE}" />`);
    expect(html).toContain(`<meta property="og:description" content="${LP_OG_DESCRIPTION}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${LP_TITLE}" />`);
    expect(html).toContain(`<meta name="twitter:description" content="${LP_OG_DESCRIPTION}" />`);
  });
});

describe('効果を言い切らない（景表法・SPEC §1-4）', () => {
  const BANNED = ['忘れない', '作り話', '必ず', '絶対', '確実', '唯一', 'No.1', '最強', '誰でも', '成果が出る', '賢くなる', '良くなる', '出てきます', '先着', '通常価格', 'AI 要約', '著者と話', '著者と対話'];
  it('LP の画面の文（Landing.jsx・LpWaitlist.jsx・LpFlow.jsx のコメントを除く）と lpCopy の文', () => {
    const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    const files = ['./Landing.jsx', './LpWaitlist.jsx', './LpFlow.jsx', './lpCopy.js'].map((f) => strip(readFileSync(new URL(f, import.meta.url), 'utf8')));
    const copies = combos.map((c) => allText(buildLpCopy(c)));
    [...files, ...copies].forEach((t) => BANNED.forEach((w) => expect(t, w).not.toContain(w)));
  });
});

describe('「毎月 N 回」を割らない（2026-10-05 第 3 回）', () => {
  it.each(combos.map((c) => [name(c), c]))('%s: 「毎月」のあとに折り返せる空白が無い', (_, cfg) => {
    // 画面に出す文だけ（検索向けの faqLd は見えない印を外してあるので数えない）
    const c = buildLpCopy(cfg);
    const t = [...c.pricingNote, ...c.priceLine, ...c.faq.flatMap((f) => [f.q, f.a])].join('\n');
    expect(t).not.toMatch(/毎月 /);
    expect(t).toMatch(/毎\u2060月\u2060\u00a0/);
  });
  it('AI の送り先の答えは「を Anthropic 社」（空白あり）', () => {
    expect(buildLpCopy({}).faq.find((f) => f.q.startsWith('AI には')).a).toContain('を Anthropic 社');
  });

});

describe('値段と（税込）を割らない', () => {
  it('金額と（税込）の間に折り返せる空白が無い', async () => {
    const c = buildLpCopy(combos.find((x) => x.offer.active));
    // 検索向けの JSON-LD（faqLd）は文字のまま（つなぎ文字を外す）なので除く
    const text = JSON.stringify({ pricingNote: c.pricingNote, faq: c.faq });
    expect(text).not.toMatch(/¥[\d,]+[ \n]?（税込）/);
    expect(text).toMatch(/¥\u20609\u2060,/);
  });
});

describe('画面は見本だと示す（景品表示法の優良誤認・2026-10-11）', () => {
  it('「画面は見本です。」で始まり、実際の答えはメモで変わると書く', () => {
    expect(SAMPLE_NOTE.startsWith('画面は見本です。')).toBe(true);
    expect(SAMPLE_NOTE).toContain('あなたのメモによって変わります');
  });
  it('LP ではヒーローの写真の下の 1 か所に出す', () => {
    const src = readFileSync(new URL('./Landing.jsx', import.meta.url), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(src.match(/\$\{SAMPLE_NOTE\}/g) || []).toHaveLength(1);
    expect(src).toMatch(/<figcaption[^>]*>.*\$\{SAMPLE_NOTE\}\$\{VOICE_NOTE\}/);
  });
});
