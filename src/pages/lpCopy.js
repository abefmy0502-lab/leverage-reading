// 📝 LP（紹介ページ）の、条件で変わる文（料金の注記・FAQ・最後の注記）を作る（純粋な関数・テストあり）。
//
// 条件は 4 つ: 創業メンバー価格の期間中か（offer.active）／無料期間の表記（trialNote・'' は出さない）／
// App Store で公開済みか（appLive）／Jev を入れたビルドか（jev）。Landing.jsx はこれを 1 回だけ呼ぶ。
// テスト（lpCopy.test.js）が全部の組み合わせで「{MONTHLY_TEXT} のような書きかけの文字が出ない」
// 「公開前に『配信しています』と書かない」などを確かめる（2026-10-05・料金の注記に変数名がそのまま出ていた）。
//
// 言葉は CLAUDE.md の GLOSSARY に合わせる（無料プラン（ずっと無料）／7 日間無料・トークン・相談・行動・
// 思い出しカード・写真で共有）。効果を言い切らない（「忘れない」「作り話にしない」と書かない）。

import { noBreak, FOUNDING_NAME } from '../lib/foundingOffer';
import { trialFirstPhrase, trialPeriodOf } from '../lib/trialLabel';
import { savingsLabel } from '../lib/planOffers';
import { FREE_TOKENS, PAID_TOKENS, TRIAL_TOKENS, FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';

export const MONTHLY = 1480;
export const ANNUAL = 12800;
// 相談 1 回 ≈ 10 トークン（lib/tokens.js の TOKEN_COSTS.consult・LP を軽くするため tokens.js は読まない）。
export const CONSULT_TOKENS = 10;
// 関係するメモが無かった相談を払い戻す回数（api の AI_NO_INFO_REFUND_LIMIT の既定）。
export const NO_INFO_REFUNDS = 10;
// 公開予定（App Store の URL が無い間だけ出す）。VITE_LAUNCH_LABEL で変えられる。
export const DEFAULT_LAUNCH_LABEL = '2026 年 11 月';

// 文書の頭（title・description・OGP）。index.html の静的な meta と同じ言葉にする（lpCopy.test.js が確かめる）。
export const LP_TITLE = 'Orime｜読んだ本が、あなたの相談相手になる読書メモアプリ';
export const LP_DESCRIPTION = '「あの本に書いてあったはずなのに」をなくす読書メモアプリ。困ったことを相談すると、あなたが残した読書メモから、本とページを添えて答え、明日やることを一つ決めます。ブクログ・Kindle から取り込み可。無料プラン（ずっと無料）で始められます。';
export const LP_OG_DESCRIPTION = '読んだ本が、あなたの相談相手になる。あなたが残した読書メモから、本とページを添えて答え、明日やることを一緒に一つ決める読書アプリです。';

export const yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;
export const consultsOf = (tokens) => Math.round(tokens / CONSULT_TOKENS);

// JSON-LD に入れる文: 折り返さない印（WORD JOINER・折り返さない空白）を外す。
export const plainText = (t) => String(t || '').replace(/⁠/g, '').replace(/ /g, ' ');

export function buildLpCopy({
  offer = { active: false, endLabel: '', price: '' },
  trialNote = '',
  appLive = false,
  jev = false,
  launchLabel = DEFAULT_LAUNCH_LABEL,
} = {}) {
  const active = Boolean(offer?.active);
  const END = noBreak(offer?.endLabel || '');
  const FOUNDING_PRICE = offer?.price || '';
  const MONTHLY_TEXT = yen(MONTHLY);
  const ANNUAL_TEXT = yen(ANNUAL);
  const PER_MONTH_TEXT = yen(Math.floor(ANNUAL / 12));
  const SAVE = savingsLabel(MONTHLY, ANNUAL);
  const TRIAL = String(trialNote || '');
  const TRIAL_FIRST = TRIAL ? trialFirstPhrase(TRIAL) : '';
  const TRIAL_SENT = TRIAL ? (trialPeriodOf(TRIAL) ? `最初の ${trialPeriodOf(TRIAL)}が無料` : TRIAL) : '';
  // 無料期間があるプランの呼び方（創業メンバー価格のあいだは月額だけ）。
  const TRIAL_WHO = active ? '月額プラン' : 'プラン';
  const FREE_CONSULTS = consultsOf(FREE_TOKENS);
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
    renew = `${FOUNDING_NAME}の年額プランは、1 年目の ${FOUNDING_PRICE}（税込）を始めるときにまとめてお支払いいただき、2 年目から年額 ${ANNUAL_TEXT}（税込）で自動更新されます。`
      + (TRIAL
        ? `月額プランは${TRIAL_SENT}で、そのあと月額 ${MONTHLY_TEXT}（税込）で自動更新されます。無料期間が終わる 24 時間前までに解約すれば、料金はかかりません。`
        : `月額プランは月額 ${MONTHLY_TEXT}（税込）で自動更新されます。`);
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

  // ── よくある質問（並びは「いつ → 無料の範囲 → ChatGPT → データ → 正しさ → 始めやすさ → 料金 → 解約 → その他」）──
  // ld: false は検索結果に残すと古くなる問い（期間ものの創業メンバー価格・公開前だけの問い）。JSON-LD に入れない。
  // link: 答えの最後に付けるリンク（{ href, label }）。
  const faq = [
    ...(!appLive ? [{
      q: 'いつから使えますか？',
      a: `${LAUNCH}に、App Store で公開する予定です。このページでメールアドレスを登録いただくと、公開の日にお知らせします。`,
      ld: false,
    }] : []),
    {
      q: '無料プランで、何ができますか？',
      a: `本とメモは何件でも残せて、振り返り・行動・思い出しカード・写真で共有・ほかのアプリからの取り込みも使えます。AI の相談は${noBreak(`毎月 ${FREE_TOKENS} トークン`)}（約 ${FREE_CONSULTS} 回）、写真から書き起こしは${noBreak(`毎月 ${FREE_OCR_PER_MONTH} 回`)}です。相談のトークンを使い切った月も、AI を使わずに、あなたのメモから関係する一節を本ごとに並べてお答えします（メモが答える相談）。期間の決まりは無く、ずっと無料です。`,
    },
    {
      q: 'ChatGPT に聞くのと、何が違いますか？',
      a: 'ChatGPT は、広い知識から何でも答えてくれます。Orime は、あなたが読んで残したメモと読書の記録から答えます。メモを貼り付けたり、自分の読書を説明し直したりする必要はありません。答えには、もとになったメモ（本とページ）が付き、関係するメモが見つからないときは、無理に答えを作らずにそう伝えるようにしています。最初から答えを決めつけず、状況を聞いてから、明日やることを一緒に一つ決めます。',
    },
    {
      q: 'AI には、何が送られますか？',
      a: `相談では、あなたの質問と、答えに使うメモ・読書の記録（本の状態、行動の進み具合、前の相談の結論など）を ${SENDERS}。写真から書き起こしでは、撮ったページの画像を Google 社の有料の API に送ります。ほかのアプリからの取り込み・検索・写真で共有・メモが答える相談では、AI に何も送りません。はじめて AI を使うときに、送る内容と送り先を確かめてから使えます。`,
    },
    {
      q: 'メモは AI の学習に使われますか？',
      a: '使われません。送り先の各社は、API で送られたデータを AI の学習に使わないと規約で定めています（不正利用を見張るため、一定の期間保存されることはあります）。AI への送信は、設定のプライバシーからいつでも取り消せます。',
      link: { href: '/legal/privacy', label: '詳しくはプライバシーポリシーへ' },
    },
    {
      q: 'AI の答えは、正しいですか？',
      a: 'AI の答えは、間違えることもあります。そのため、答えにはもとになったメモ（本とページ）をいつも添えています。気になったら、根拠のメモを開いて確かめてください。関係するメモが見つからないときは、無理に答えを作らず、そう伝えるようにしています。',
    },
    {
      q: 'メモが少なくても相談できますか？',
      a: `メモが 1 件からでも相談できます。答えの材料はあなたのメモなので、増えるほど答えはあなたの状況に近づいていきます。関係するメモが見つからなかった相談は、トークンを使ったことにしません（${noBreak(`毎月 ${NO_INFO_REFUNDS} 回`)}まで）。`,
    },
    {
      q: 'これまでに読んだ本も使えますか？',
      a: '使えます。ブクログ・Kindle に残した記録（レビュー・読書メモ・ハイライト）は、ファイルを選ぶだけで取り込めます。読書メーターは、パソコンで保存したページから取り込めます（感想も入ります）。記録が無い本も、覚えている一行を書くだけで、その日から相談の材料になります。',
    },
    {
      q: '紙の本でも使えますか？',
      a: `使えます。本のページを撮ると、文字に書き起こしてメモにできます（無料プランは${noBreak(`毎月 ${FREE_OCR_PER_MONTH} 回`)}）。手で一行書くだけでもかまいません。`,
    },
    {
      q: '忙しくて、続けられるか不安です',
      a: '読みながら、心が動いた一行を残すだけで始められます。メモは本文だけで保存でき、ページ番号や写真はあとから足せます。',
    },
    {
      q: '料金はいくらですか？',
      a: `無料プラン（ずっと無料）で、本とメモ・振り返り・行動・写真で共有が使えます。AI は相談が${noBreak(`毎月 ${FREE_TOKENS} トークン`)}（約 ${FREE_CONSULTS} 回）、写真から書き起こしが${noBreak(`毎月 ${FREE_OCR_PER_MONTH} 回`)}です。プラン（月額 ${MONTHLY_TEXT}、または年額 ${ANNUAL_TEXT}・月あたり約 ${PER_MONTH_TEXT}・どちらも税込）にすると、相談が${noBreak(`毎月 ${PAID_TOKENS} トークン`)}（約 ${PAID_CONSULTS} 回）になり、AI 選書・読書計画シートも使えます。回数は目安で、1 回のトークンは質問とメモの量で変わります。使わなかったトークンは翌月に繰り越しません。${active ? `${END}までは、年額プランの 1 年目が ${FOUNDING_PRICE}（税込）です（${FOUNDING_NAME}）。` : ''}${TRIAL ? `${TRIAL_WHO}は${TRIAL_SENT}です（${ELIGIBLE}）。` : ''}お支払いは App Store（Apple ID）です。`,
    },
    ...(active ? [{
      q: `${FOUNDING_NAME}とは何ですか？`,
      a: `${END}（日本時間）までにプランを始めた方は、月額・年額どちらでも創業メンバーです（${noBreak('7 日間無料')}で始めた方も）。特典は、開発者への直接の窓口と、次に作る機能への投票です。人数の上限はありません。年額プランなら、1 年目は ${FOUNDING_PRICE}（税込）を始めるときにまとめてお支払いいただき、2 年目からは年額 ${ANNUAL_TEXT}（税込）で自動更新されます。この価格は App Store の初回特典なので、${ELIGIBLE}が対象です。先に月額プランの ${noBreak('7 日間無料')}を使うと、年額の${FOUNDING_NAME}は使えなくなります。`,
      ld: false,
    }] : []),
    ...(TRIAL ? [{
      q: '無料期間のあとは、自動で料金がかかりますか？',
      a: `${TRIAL_WHO}の無料期間（${TRIAL}）は、AI を ${TRIAL_TOKENS} トークン（相談 約 ${TRIAL_CONSULTS} 回）まで使えます。無料期間が終わると、${active ? `月額 ${MONTHLY_TEXT}（税込）` : '選んだプラン（月額か年額）'}で自動更新されます。無料期間が終わる 24 時間前までに App Store のサブスクリプション設定から解約すれば、料金はかかりません。無料期間は、${ELIGIBLE}が対象です（1 つの Apple ID に 1 回）。無料プランは期間の決まりがなく、ずっと無料です。`,
    }] : []),
    {
      q: '解約すると、メモは消えますか？',
      a: '消えません。解約は App Store のサブスクリプション設定からいつでもでき、違約金もありません。解約後も無料プランで使え、メモは残ります。再開すればそのまま使えます。',
    },
    {
      q: 'メモを持ち出せますか？退会したらどうなりますか？',
      a: '本・メモ・行動・相談の記録は、設定からいつでも 1 つの CSV ファイルでダウンロードできます（写真そのものは含みません）。退会はアプリの設定から申し込めて、お申し込みを受けて、法令で保管が必要なものを除き、データを消去します。',
    },
    {
      q: 'オフラインでも使えますか？',
      a: 'メモの保存と相談は、インターネットにつながっているときに使えます。つながっていないときは画面の上でお知らせし、書きかけのメモは消さずに残します。',
    },
    {
      q: '通知がしつこくなりませんか？',
      a: '思い出しの通知は、多くても週に 1 回です。届くのは、あなたが前に残したメモ 1 件だけ。行動は期限の日の朝に 1 回だけお知らせします。設定からいつでもオフにできます。',
    },
    {
      q: 'パソコンや Android でも使えますか？',
      a: appLive
        ? 'いまは App Store のアプリでお使いいただけます。パソコンのブラウザ版と Android 版は、準備ができしだいお知らせします。'
        : `まず App Store で公開します（${LAUNCH}の予定）。パソコンのブラウザ版と Android 版は、準備ができしだいお知らせします。`,
    },
    {
      q: '小説やエッセイでも使えますか？',
      a: '使えます。ビジネス書に限りません。答えの材料はあなたのメモなので、心に残った一行があれば、どんな本でも相談の材料になります。',
    },
  ].map((f) => ({ ld: true, ...f }));

  return {
    MONTHLY_TEXT, ANNUAL_TEXT, PER_MONTH_TEXT, SAVE,
    TRIAL_FIRST, TRIAL_SENT, TRIAL_WHO,
    FREE_CONSULTS, PAID_CONSULTS, TRIAL_CONSULTS,
    LAUNCH, ELIGIBLE, END,
    privacyLead: `相談では、あなたの質問と、答えに使うメモ・読書の記録を ${SENDERS}。写真からの書き起こしなど一部は Google 社の有料の API を使います。どの会社も、API で送られたデータを AI の学習に使わないと規約で定めています。`,
    pricingNote,
    priceLine,
    faq,
    // 検索結果向け（期間もの・公開前だけの問いを外し、見えない印を取った文）。
    faqLd: faq.filter((f) => f.ld).map((f) => ({ q: plainText(f.q), a: plainText(f.a) })),
  };
}
