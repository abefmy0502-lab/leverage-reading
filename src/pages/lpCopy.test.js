// LP の条件で変わる文（lpCopy.js）。2026-10-05: 創業メンバー価格の期間中、料金の注記に「{MONTHLY_TEXT}」と
// 変数名がそのまま出ていた（自動更新後の金額が読めない）。全部の組み合わせで書きかけの文字が残らないことを確かめる。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildLpCopy, plainText, LP_TITLE, LP_DESCRIPTION, LP_OG_DESCRIPTION } from './lpCopy';

const OFFER_ON = { active: true, endLabel: '12月15日', price: '¥9,800', priceLabel: '1 年目 ¥9,800' };
const OFFER_OFF = { active: false, endLabel: '', price: '¥9,800', priceLabel: '1 年目 ¥9,800' };
const combos = [];
for (const offer of [OFFER_ON, OFFER_OFF]) for (const trialNote of ['7 日間無料', '']) for (const appLive of [true, false]) for (const jev of [false, true]) {
  combos.push({ offer, trialNote, appLive, jev });
}
const allText = (c) => [
  ...c.pricingNote, ...c.priceLine, c.privacyLead,
  ...c.faq.flatMap((f) => [f.q, f.a]),
  ...c.faqLd.flatMap((f) => [f.q, f.a]),
].join('\n');
const name = ({ offer, trialNote, appLive, jev }) => `offer=${offer.active} trial=${Boolean(trialNote)} live=${appLive} jev=${jev}`;

describe('buildLpCopy（全部の組み合わせ）', () => {
  it.each(combos.map((c) => [name(c), c]))('%s: 書きかけの文字（{ } $ undefined）が無い', (_, cfg) => {
    const t = allText(buildLpCopy(cfg));
    expect(t).not.toMatch(/[{}$]/);
    expect(t).not.toMatch(/undefined|null|NaN/);
  });
  it.each(combos.map((c) => [name(c), c]))('%s: 料金の注記に、自動更新のあとの月額の金額がある', (_, cfg) => {
    const c = buildLpCopy(cfg);
    expect(c.pricingNote[0]).toMatch(/月額 ¥1,480[^。]*税込/);
    if (cfg.offer.active) expect(c.pricingNote[0]).toContain('2 年目から年額 ¥12,800（税込）で自動更新');
    if (cfg.trialNote) expect(c.pricingNote[0]).toContain('24 時間前までに解約すれば');
  });
  it.each(combos.map((c) => [name(c), c]))('%s: 使わない言い方（作り話・忘れない・初めての方・先着・通常価格・シェア）が無い', (_, cfg) => {
    const t = allText(buildLpCopy(cfg));
    ['作り話', '忘れない', '初めての方', '初めて登録', '先着', '通常価格', '通常の', 'シェア', '全部ダウンロード', 'すべて消去', 'マイ読書脳', 'お試し', '無料トライアル']
      .forEach((w) => expect(t).not.toContain(w));
  });
});

describe('公開前と公開後', () => {
  it('公開前は「配信しています」と書かず、公開予定を先頭の問いで言う', () => {
    const c = buildLpCopy({ offer: OFFER_OFF, trialNote: '7 日間無料', appLive: false });
    const t = allText(c);
    expect(t).not.toContain('配信しています');
    expect(c.faq[0].q).toBe('いつから使えますか？');
    expect(plainText(c.faq[0].a)).toContain('2026 年 11 月');
    // 公開前だけの問いは検索結果（JSON-LD）に入れない
    expect(c.faqLd.some((f) => f.q === 'いつから使えますか？')).toBe(false);
  });
  it('公開後は「いつから」の問いが無く、パソコン・Android の答えが「いまは App Store のアプリで」', () => {
    const c = buildLpCopy({ offer: OFFER_OFF, trialNote: '7 日間無料', appLive: true });
    expect(c.faq.some((f) => f.q === 'いつから使えますか？')).toBe(false);
    expect(c.faq.find((f) => f.q.startsWith('パソコン')).a).toContain('いまは App Store のアプリで');
  });
  it('公開予定の書き方は変えられる', () => {
    const c = buildLpCopy({ appLive: false, launchLabel: '2026 年 12 月' });
    expect(plainText(c.faq[0].a)).toContain('2026 年 12 月');
  });
});

describe('創業メンバー価格', () => {
  it('期間中: 月額の 7 日間無料を使うと年額の創業メンバー価格が使えないことが分かる', () => {
    const c = buildLpCopy({ offer: OFFER_ON, trialNote: '7 日間無料', appLive: true });
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
    const c = buildLpCopy({ offer: OFFER_OFF, trialNote: '7 日間無料', appLive: true });
    expect(c.faq.some((x) => x.q.includes('創業メンバー価格'))).toBe(false);
    expect(c.priceLine[1]).toContain('プランは 7 日間無料');
  });
});

describe('AI の送り先', () => {
  it('Jev を入れたビルドだけ TypeSafe AI 社を書く', () => {
    expect(buildLpCopy({ jev: true }).privacyLead).toContain('TypeSafe AI');
    expect(buildLpCopy({ jev: false }).privacyLead).not.toContain('TypeSafe AI');
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
  const BANNED = ['忘れない', '作り話', '必ず', '絶対', '確実', '唯一', 'No.1', '最強', '誰でも', '成果が出る', '賢くなる', '良くなる', '出てきます'];
  it('LP の画面の文（Landing.jsx・LpWaitlist.jsx・LpFlow.jsx のコメントを除く）と lpCopy の文', () => {
    const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    const files = ['./Landing.jsx', './LpWaitlist.jsx', './LpFlow.jsx'].map((f) => strip(readFileSync(new URL(f, import.meta.url), 'utf8')));
    const copies = combos.map((c) => allText(buildLpCopy(c)));
    [...files, ...copies].forEach((t) => BANNED.forEach((w) => expect(t, w).not.toContain(w)));
  });
});
