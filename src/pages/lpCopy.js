// 📝 LP（紹介ページ）の、条件で変わる文（料金の注記・FAQ・最後の注記）を作る（純粋な関数・テストあり）。
//
// 条件は 4 つ: 創業メンバー価格の期間中か（offer.active）／無料期間の表記（trialNote・'' は出さない）／
// 公開前の形か（prelaunch＝VITE_LP_PRELAUNCH=on のときだけ・2026-10-11 から既定は公開済みの形）／
// Jev を入れたビルドか（jev）。Landing.jsx はこれを 1 回だけ呼ぶ。
// テスト（lpCopy.test.js）が全部の組み合わせで「{MONTHLY_TEXT} のような書きかけの文字が出ない」
// 「公開前に『配信しています』と書かない」などを確かめる（2026-10-05・料金の注記に変数名がそのまま出ていた）。
//
// 言葉は CLAUDE.md の GLOSSARY に合わせる（無料プラン（ずっと無料）／7 日間無料・トークン・相談・行動・
// 思い出しカード・写真で共有）。効果を言い切らない（「忘れない」「作り話にしない」と書かない）。

import { noBreak, FOUNDING_NAME } from '../lib/foundingOffer';
import { trialFirstPhrase, trialPeriodOf } from '../lib/trialLabel';
import { savingsLabel } from '../lib/planOffers';
import { FREE_TOKENS, FREE_FIRST_MONTH_TOKENS, PAID_TOKENS, TRIAL_TOKENS, FREE_OCR_PER_MONTH, answerCountLabel, CONSULT_ANSWERS_NOTE } from '../lib/tokenAmounts';

export const MONTHLY = 1480;
export const ANNUAL = 12800;
// 量の目安は「AI の答え 約 N 回」（1 回 約 10 トークン・lib/tokenAmounts.js の ANSWER_TOKENS・2026-10-09）。
// 相談 1 つが何回の答えか（CONSULT_ANSWERS_NOTE）は、料金の注記（Landing.jsx）で 1 回だけ言う。
export { CONSULT_ANSWERS_NOTE };
// 関係するメモが無かった相談を払い戻す回数（api の AI_NO_INFO_REFUND_LIMIT の既定）。
export const NO_INFO_REFUNDS = 10;
// 公開予定（公開前の形＝VITE_LP_PRELAUNCH=on のときだけ出す）。VITE_LAUNCH_LABEL で変えられる。
export const DEFAULT_LAUNCH_LABEL = '2026 年 11 月';

// 文書の頭（title・description・OGP）。index.html の静的な meta と同じ言葉にする（lpCopy.test.js が確かめる）。
// 2026-10-11: 訴求を「読書を、受け身から対話へ」に（company/marketing-master-plan-2026-10.md §0）。
// 「著者と話せる」とは書かない（「本の語り口で答える」「本と対話する」まで）。
export const LP_TITLE = 'Orime｜読んだ本と、対話しよう。読書メモアプリ';
export const LP_DESCRIPTION = '読書を、受け身から対話へ。心に響いた一行を残すと、AI がその本の語り口で、あなたのメモから答えます。本とページを添えて、明日の一歩まで。集中モード・写真で共有・分野ごとの記録も。ブクログ・Kindle から取り込めて、無料プラン（ずっと無料）で始められます。';
export const LP_OG_DESCRIPTION = '読んだ本と、対話しよう。心に響いた一行から、AI が本の語り口で答え、明日の一歩まで一緒に決める読書メモアプリです。';
// 語り口の答えの注記（アプリの答えの最後の一行と同じ考え方・LP では 1 か所＝ヒーローの写真の下）。
export const VOICE_NOTE = '答えは、AI が本とあなたのメモから語り口をまねたもので、著者本人の言葉ではありません。';
// 画面は見本（2026-10-11・景品表示法の優良誤認を避ける）: LP の写真・動画の画面はお試しモードの作った答えで、
// 実際の AI の答えとは違う。LP ではヒーローの写真の下の 1 か所。SNS の動画の字幕（scripts/marketing/notes.mjs）も同じ文。
export const SAMPLE_NOTE = '画面は見本です。実際の答えは、あなたのメモによって変わります。';

// 📱 App Store の URL（VITE_APP_STORE_URL）がまだ無いビルドでも、ボタンは出す（2026-10-11 オーナー「ローンチしている前提」）。
// そのときの行き先は、日本の App Store での「Orime」の検索。URL が入れば、ボタンはアプリのページ（＋キャンペーン ct=）へ。
export const APP_STORE_SEARCH_URL = 'https://apps.apple.com/jp/search?term=Orime';
export const storeHrefOf = ({ live, url }) => (live && url ? url : APP_STORE_SEARCH_URL);

export const yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;
// 「約 3 回」「約 80 回」（折り返さない空白でつなぐ）。
export const consultsOf = (tokens) => noBreak(answerCountLabel(tokens));

// JSON-LD に入れる文: 折り返さない印（WORD JOINER・折り返さない空白）を外す。
export const plainText = (t) => String(t || '').replace(/⁠/g, '').replace(/ /g, ' ');

export function buildLpCopy({
  offer = { active: false, endLabel: '', price: '' },
  trialNote = '',
  prelaunch = false,
  jev = false,
  launchLabel = DEFAULT_LAUNCH_LABEL,
} = {}) {
  const active = Boolean(offer?.active);
  const END = noBreak(offer?.endLabel || '');
  const FOUNDING_PRICE = offer?.price || '';
  const MONTHLY_TEXT = yen(MONTHLY);
  const ANNUAL_TEXT = yen(ANNUAL);
  const PER_MONTH_TEXT = yen(Math.floor(ANNUAL / 12));
  // 月額の 1 日あたりの目安（¥1,480 ÷ 30 ≒ ¥49・2026-10-11 オーナー「¥1,480 を安く感じさせる」）。
  const PER_DAY_TEXT = yen(Math.round(MONTHLY / 30));
  // 年額の 1 日あたりの目安（¥12,800 ÷ 365 ≒ ¥35）。
  const ANNUAL_PER_DAY_TEXT = yen(Math.round(ANNUAL / 365));
  const SAVE = savingsLabel(MONTHLY, ANNUAL);
  const TRIAL = String(trialNote || '');
  const TRIAL_FIRST = TRIAL ? trialFirstPhrase(TRIAL) : '';
  const TRIAL_SENT = TRIAL ? (trialPeriodOf(TRIAL) ? `最初の ${trialPeriodOf(TRIAL)}が無料` : TRIAL) : '';
  // 無料期間があるプランの呼び方（創業メンバー価格のあいだは月額だけ）。
  const TRIAL_WHO = active ? '月額プラン' : 'プラン';
  const FREE_CONSULTS = consultsOf(FREE_TOKENS);
  // 🌱 無料プランのはじめの月（アカウントを作った月）だけ 60 トークン（2026-10-09）。
  const FIRST_CONSULTS = consultsOf(FREE_FIRST_MONTH_TOKENS);
  const FIRST_MONTH = `はじめの月は ${noBreak(`${FREE_FIRST_MONTH_TOKENS} トークン`)}（${FIRST_CONSULTS}）`;
  const PAID_CONSULTS = consultsOf(PAID_TOKENS);
  const TRIAL_CONSULTS = consultsOf(TRIAL_TOKENS);
  const LAUNCH = noBreak(launchLabel || DEFAULT_LAUNCH_LABEL);
  // 初回特典の対象（App Store の決まり＝同じサブスクのグループで 1 つの Apple ID に 1 回）。「初めての方」と書かない。
  const ELIGIBLE = '同じ Apple ID でプランの初回特典を使ったことがない方';
  const SENDERS = jev
    ? 'Anthropic 社の API に送って答えを作ります（関係するメモを選ぶ判断に TypeSafe AI 社を使うことがあります）'
    : 'Anthropic 社の API に送って答えを作ります';

  // ── 料金の欄のボタンの下の注記（2 段落）──
  let renew;
  if (active) {
    renew = `${FOUNDING_NAME}の年額プランは、1 年目の ${noBreak(`${FOUNDING_PRICE}（税込）`)}を始めるときにまとめてお支払いいただき、2 年目から${noBreak(`年額 ${ANNUAL_TEXT}（税込）`)}で自動更新されます。`
      + (TRIAL
        ? `月額プランは${TRIAL_SENT}で、そのあと${noBreak(`月額 ${MONTHLY_TEXT}（税込）`)}で自動更新されます。無料期間が終わる 24 時間前までに解約すれば、料金はかかりません。`
        : `月額プランは${noBreak(`月額 ${MONTHLY_TEXT}（税込）`)}で自動更新されます。`);
  } else if (TRIAL) {
    renew = `プランは${TRIAL_SENT}で、そのあと選んだプラン（月額 ${MONTHLY_TEXT} または年額 ${ANNUAL_TEXT}・税込）で自動更新されます。無料期間が終わる 24 時間前までに解約すれば、料金はかかりません。`;
  } else {
    renew = `プランは、選んだプラン（月額 ${MONTHLY_TEXT} または年額 ${ANNUAL_TEXT}・税込）で自動更新されます。`;
  }
  const pricingNote = [
    `アプリは無料でダウンロードできます。${renew}`,
    'お支払いは App Store（Apple ID）です。解約はいつでもでき、違約金はありません。解約しても無料プランで使え、メモは残ります。',
  ];

  // ── 最後のボタンの下（2 句・句の途中で折り返さない）──
  const priceLine = [
    '無料プランは、ずっと無料。',
    TRIAL ? `${TRIAL_WHO}は ${TRIAL}・いつでも解約できます。` : 'プランは、いつでも解約できます。',
  ];

  // ── よくある質問（2026-10-11 オーナー「もっとシンプルに」で 5〜6 問に絞った）──
  // 並び: 本の語り口 → ChatGPT との違い → 無料プランの範囲 → AI に送るもの・学習 → 無料期間のあと → 解約・持ち出し。
  // ld: false は検索結果に残すと古くなる問い（期間ものの創業メンバー価格・公開前だけの問い）。JSON-LD に入れない。
  // link: 答えの最後に付けるリンク（{ href, label }）。
  const faq = [
    ...(prelaunch ? [{
      q: 'いつから使えますか？',
      a: `${LAUNCH}に、App Store で公開する予定です。このページでメールアドレスを登録いただくと、公開の日にお知らせします。パソコンのブラウザ版と Android 版は、準備ができしだいお知らせします。`,
      ld: false,
    }] : []),
    {
      q: '「本の語り口で答える」とは、どういうことですか？',
      a: `1 冊の本に相談すると、AI がその本の語り口をまねて、あなたがその本に残したメモと読書の準備から答えます。${VOICE_NOTE}答えの名前の行にも「（本の語り口で・AI）」と出ます。本の要約ではなく、材料はあなたのメモです。小説やエッセイでも使えます。`,
    },
    {
      q: 'ChatGPT に聞くのと、何が違いますか？',
      a: 'Orime は、あなたが読んで残したメモと読書の記録から答えます。メモを貼り付けたり、自分の読書を説明し直したりする必要はありません。答えには、もとになったメモ（本とページ）が付き、関係するメモが見つからないときは、無理に答えを作らずにそう伝えるようにしています。AI の答えは間違えることもあるので、根拠のメモとあわせて確かめてください。',
    },
    {
      q: '無料プランで、何ができますか？',
      a: `本とメモは何件でも残せて、行動・集中モード・読書の記録・写真で共有・ほかのアプリからの取り込みも使えます。AI の相談と「この本で学べること」は、あわせて${noBreak(`毎月 ${FREE_TOKENS} トークン`)}（AI の答え ${FREE_CONSULTS}）で、${FIRST_MONTH}です。写真から書き起こしは${noBreak(`毎月 ${FREE_OCR_PER_MONTH} 回`)}です。使い切った月も、AI を使わずにあなたのメモから関係する一節を並べてお答えします（メモが答える相談）。期間の決まりは無く、ずっと無料です。`,
    },
    {
      q: 'メモは AI の学習に使われますか？',
      a: `使われません。相談では、あなたの質問と、答えに使うメモ・読書の記録を ${SENDERS}。写真から書き起こしでは、撮ったページの画像を Google 社の有料の API に送ります。どの会社も、API で送られたデータを AI の学習に使わないと規約で定めています。はじめて AI を使うときに送る内容と送り先を確かめられ、設定のプライバシーからいつでも取り消せます。`,
      link: { href: '/legal/privacy', label: '詳しくはプライバシーポリシーへ' },
    },
    ...(active ? [{
      q: `${FOUNDING_NAME}とは何ですか？`,
      a: `${END}（日本時間）までにプランを始めた方は、月額・年額どちらでも創業メンバーです（${noBreak('7 日間無料')}で始めた方も）。特典は、開発者への直接の窓口と、次に作る機能への投票です。人数の上限はありません。年額プランなら、1 年目は ${noBreak(`${FOUNDING_PRICE}（税込）`)}を始めるときにまとめてお支払いいただき、2 年目からは${noBreak(`年額 ${ANNUAL_TEXT}（税込）`)}で自動更新されます。この価格は App Store の初回特典なので、${ELIGIBLE}が対象です。先に月額プランの ${noBreak('7 日間無料')}を使うと、年額の${FOUNDING_NAME}は使えなくなります。`,
      ld: false,
    }] : []),
    ...(TRIAL ? [{
      q: '無料期間のあとは、自動で料金がかかりますか？',
      a: `${TRIAL_WHO}の無料期間（${TRIAL}）は、AI を ${TRIAL_TOKENS} トークン（AI の答え ${TRIAL_CONSULTS}）まで使えます。無料期間が終わると、${active ? `${noBreak(`月額 ${MONTHLY_TEXT}（税込）`)}` : '選んだプラン（月額か年額）'}で自動更新されます。無料期間が終わる 24 時間前までに App Store のサブスクリプション設定から解約すれば、料金はかかりません。無料期間は、${ELIGIBLE}が対象です（1 つの Apple ID に 1 回）。`,
    }] : []),
    {
      q: '解約すると、メモは消えますか？',
      a: '消えません。解約は App Store のサブスクリプション設定からいつでもでき、違約金もありません。解約後も無料プランで使え、メモは残ります。本・メモ・行動・相談の記録は、設定からいつでも CSV でダウンロードできます。',
    },
  ].map((f) => ({ ld: true, ...f }));

  return {
    MONTHLY_TEXT, ANNUAL_TEXT, PER_MONTH_TEXT, PER_DAY_TEXT, ANNUAL_PER_DAY_TEXT, SAVE,
    TRIAL_FIRST, TRIAL_SENT, TRIAL_WHO,
    FREE_CONSULTS, FIRST_CONSULTS, PAID_CONSULTS, TRIAL_CONSULTS,
    LAUNCH, ELIGIBLE, END,
    pricingNote,
    priceLine,
    faq,
    // 検索結果向け（期間もの・公開前だけの問いを外し、見えない印を取った文）。
    faqLd: faq.filter((f) => f.ld).map((f) => ({ q: plainText(f.q), a: plainText(f.a) })),
  };
}
