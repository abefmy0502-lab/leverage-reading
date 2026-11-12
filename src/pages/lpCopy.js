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
// 2026-10-11: 訴求を「読書を、受け身から会話へ」に（company/marketing-master-plan-2026-10.md §0）。
// 「著者と話せる」とは書かない（「本の語り口で答える」「本と会話する」まで）。
export const LP_TITLE = 'Orime｜読んだ本と、会話しよう。読書メモアプリ';
export const LP_DESCRIPTION = '読んだ本と会話できる読書メモアプリ。気になった一行をメモしておくと、迷ったときに AI が、あなたのメモをもとに、その本の考え方で答えます。時間を決めて読むタイマーや、読書の記録もあります。ブクログや Kindle の記録を取り込めて、無料プランで始められます。';
export const LP_OG_DESCRIPTION = '気になった一行をメモしておくと、迷ったときに AI があなたのメモをもとに、その本の考え方で答えてくれる読書メモアプリです。';
// 語り口の答えの注記（アプリの答えの最後の一行と同じ考え方・LP では 1 か所＝ヒーローの写真の下）。
export const VOICE_NOTE = '答えは AI によるもので、著者本人の言葉ではありません。';
// 画面は見本（2026-10-11・景品表示法の優良誤認を避ける）: LP の写真・動画の画面はお試しモードの作った答えで、
// 実際の AI の答えとは違う。LP ではヒーローの写真の下の 1 か所（2026-10-17 に短く。SNS の動画の字幕＝scripts/marketing/notes.mjs も同じ文）。
export const SAMPLE_NOTE = '画面は実際のものです。答えは、あなたのメモで変わります。';

// 🗣 会話そのもののヒーロー（2026-11-11 オーナー「一番最初のインパクトが少ない」・?hero=talk）。
//   見出しは標語ではなく約束。右（スマホは見出しの下）はオーナーのイラスト（会話の実物は同日「不要かな」でやめた）。
export const HERO_TALK = {
  h1: ['読んだ本が、', '相談相手になる。'],
  // 2026-11-11 オーナー「この文章も微妙」: 仕組みの説明（AI が・根拠に）をやめ、やることの小ささ → 起きること → 一番の価値（読むほど育つ）の 3 行に
  // 2026-11-12 オーナー「もっとわかりやすく」: 比喩（本が答える・相談相手が育つ）をやめ、やること → 起きること → 続けると の具体の言葉に
  lead: ['読んだ本の気になった一行を、メモするだけ。', '困ったとき、その本がメモをもとに答えます。', 'メモが増えるほど、答えはあなた向けになります。'],
};

// 📚 著者には聞けない。本には、聞ける。（2026-11-11 オーナー「著者と会話するのは難しいが Orime なら…複数の著者の考えを比べて、混ぜて相談できる」）。
//   「著者と話せる」「著者の頭脳」とは書かない（法務）。聞く相手は本（あなたのメモをもとに、AI が本の考え方で答える）。
//   3 つの聞き方はアプリの「相談相手」そのまま（1 冊／選んだ数冊／すべての本・MyBookBrain・「ほかの本の視点で」のチップ）。
export const ASK = {
  h2: ['著者には聞けない。', '本には、聞ける。'],
  lead: '相談する相手は、1 冊でも、何冊かでも、本棚ぜんぶでも。',
  modes: [
    { title: '1 冊に聞く', body: '『嫌われる勇気』に、いまの悩みを相談する。' },
    { title: '何冊かを比べる', body: '『7つの習慣』と『エッセンシャル思考』なら、それぞれどう考えるか。' },
    { title: '本棚ぜんぶに聞く', body: '読んだ本すべてから、いまの悩みに合う答えを。' },
  ],
};

// 🗣 使い方＝実際の 1 つの相談（2026-11-11 オーナーの実際の画面から・LpTalkFlow.jsx）。言い換えない。
export const TALK = {
  // 2 往復目（実際の画面: 聞き返しへの返事 → 2 冊をまとめた答えの最後に「明日からできる一歩」）
  reply: '営業の数字が伸びない。課題が見えない',
  replyFrom: '稲盛和夫『考え方』ほか 1 冊', // 差出人を 1 本の会話でそろえる（ui-critic 2026-11-11）
  // 行動リストに入った形（実際の行動の画面と同じ: 文・『本』· 期限）
  todo: '顧客との接点で試す 1 つの工夫を手帳に書く',
  todoMeta: '期限 明日',
  steps: [
    {
      title: '本に相談する',
      partner: '選んだ 2 冊',
      ask: '仕事に自信が持てなくなってきた。どうすればいい？',
    },
    {
      title: 'メモを根拠に、本の考え方で答える',
      from: '稲盛和夫『考え方』',
      // 2026-11-11 オーナー「根拠の部分は消して、相談で答えてくれた文章は全て出して」: 答えは全文・根拠のメモは出さない
      answer: '自信の喪失は、「できると信じ切る」という心の土台が揺らいでいるサインです。その土台を立て直すには、小さな創意工夫の積み重ねと、朝の時間を使った思考のリセットが有効です。',
      question: '自信が持てなくなった仕事は、どんな場面で、より強く感じますか？',
    },
    {
      title: '明日の一歩が決まる',
      action: '営業活動の前日の夜と当日の朝の計 10 分間で、「明日、顧客との接点で試す 1 つの工夫」を手帳に書き、その日の営業後に「それがうまくいったか、何を学んだか」を 3 行メモして記録する。1 週間その積み重ねを続ける。',
    },
  ],
};

// 📋 ほかにできること（2026-11-11 オーナー「情報過多・黄金の流れに」: 画面写真と 3 つの節を 1 節の短い一覧に。1 行ずつ・順は相談に近いものから）
// 🧩 ほかにできること（2026-11-12 オーナー「わかりにくすぎる・実際の画面を使わずに抽象化」）: 6 つを同じ形（線の絵＋題＋1 行）で
export const FEATURES = [
  { key: 'plan', plan: true, title: '読む前に、読み方が決まる', body: '得たいことを書くと、AI が読書計画シートを作り、重点的に読む箇所を示します。' },
  { key: 'advisor', plan: true, title: '次に読む本を、相談して選ぶ', body: '悩みを聞き取り、読んできた本と評価から、おすすめの本と読む順番。' },
  { key: 'action', title: '明日やることが決まる', body: '相談の答えの一歩は行動リストに入り、期限の朝に通知。' },
  { key: 'focus', title: '時間を決めて読む', body: 'タイマーをかけると表紙と残り時間だけの画面に。読んだ時間は本ごとに残ります。' },
  { key: 'share', title: '一文を画像で投稿', body: '写真に一文と書名をのせて、SNS へ。' },
  { key: 'library', title: '読書記録の基本もそろう', body: 'バーコードで登録、フォルダ、★の評価、ブクログや Kindle からの取り込み。' },
];

// 📖 読む前に、読み方が決まる（2026-11-11 オーナー「読書戦略を立てられることも伝えたい」）。積読の本の読書計画シート。
//   4 段は実装のとおり（得たいこと・課題・仮説 → シート＝概要・読み方の戦略・重点的に読む箇所・流し読みで OK・注意点・期待される変化）。
//   実物はオーナーの『イシューからはじめよ』のシートから（言い換えない・抜粋）。
export const PLAN = {
  h2: ['読む前に、', '読み方が決まる。'],
  steps: [
    { title: '得たいことを書く', body: 'この本から得たいこと、いまの課題、仮説。読む前に 3 つを言葉にします。' },
    { title: 'AI が読書計画シートを作る', body: '本の紹介と目次、あなたの得たいことから、読み方の戦略を書きます。' },
    { title: '重点的に読む箇所と、流し読みでよい箇所', body: '全部を均等に読まず、2 割の核に集中できます。' },
    { title: '読み終えたあとの変化まで', body: '注意点と、期待される変化。読み終えたら、ここに戻って確かめます。' },
  ],
  sample: {
    book: '『イシューからはじめよ』',
    want: '本当に解くべき問題を見極め、成果につながる仕事に集中する力を身につける。',
    sections: [
      { h: '読み方の戦略', items: ['「解くべき問題」か「単なる作業」かを見分ける基準を自分の中に構築する。', '成果に直結する仕事にリソースを集中させるための思考の型を習得する。'] },
      { h: '重点的に読む箇所（20%）', items: ['「イシュー」の定義に関する記述と、何がイシューで何がそうでないかを判別する基準の箇所。', '著者が提示する「課題解決の型」や、実際に価値ある仕事を進めるためのプロセスに関する部分。'] },
      { h: '流し読みで OK な箇所', items: ['一度理解した考え方に基づいた、繰り返しの説明や補足的な事例が続く箇所。'] },
      { h: '期待される変化', items: ['目の前の作業が「解くべき問題」なのか「無視すべき雑務」なのかを即座に判断できるようになる。'] },
    ],
  },
  note: '月額・年額プランで使えます。',
};

// 📈 なぜ会話すると残るのか（2026-11-11・LpWhy.jsx）。数字は引用した研究の結果（参考）で、Orime の効果ではない。「○倍」の断定は書かない。
export const WHY = {
  chartLabel: '思い出せる量の時間の線のイメージ。読むだけだと読んだ日から薄れていくが、会話する読書では相談のたびに戻り、落ち方がゆるくなる。参考: 忘却曲線と分散学習',
  chartCaption: '思い出せる量のイメージ（参考: 忘却曲線・分散学習）',
  // 2026-11-11 オーナー「ここまで細かくなくて良い・いい感じにまとめる」: 研究 3 つを 1 段に（数字は出さない・出典は 1 行）
  keys: ['思い出す', '間をあける', '自分の言葉で書く'],
  summary: 'この 3 つで、読んだことは残りやすくなると、学習の研究で分かっています。Orime の一行メモと相談は、この 3 つをそのまま形にしたものです。',
  sources: '参考: Roediger & Karpicke 2006／Dunlosky ほか 2013／Slamecka & Graf 1978',
  costTitle: '月 ¥1,480 は、本 1 冊分。',
  costBody: '読んだ本の中身が薄れていくなら、本代の多くは残りません。本 1 冊分で、読んだ本が相談相手として残ります。',
};

// 🧠 行動経済学・心理学に基づく文（2026-10-12・company/lp-behavioral-analysis-2026-10.md）。
// （ヒーローのボタンの下の「ずっと無料で使えます。…」は 2026-10-17 オーナー「不要？」でやめた＝ボタンの名前と料金の見出しで伝わる）
// 問題の自覚（損失回避・好奇心のすき間）: 「一方通行の読書から、会話する読書へ。」の見出しの下。数字（◯日で◯割）は使わない。
export const PROBLEM_LEAD = 'いい本を読んでも、いざというときに思い出せない。';
// 2026-10-22 LP の見直し: 問題の自覚を、読む人の口から出る 2 つの場面で（master plan §2 の「その人の言葉」）。
//   「一方通行の読書から、会話する読書へ。」の見出しの下＝図の前に置く（見出し → 自分の場面 → 図 → 言い切り の順）。
export const PROBLEM_LINES = [
  '「あの本に、書いてあったはずなのに」',
  '「読んだのに、いつものやり方に戻る」',
];
// 図の下の言い切り（抽象の「理解が残る」をやめ、起きることを 1 行で・2026-10-22）。
export const DIAGRAM_LINE = '読んだ本が、迷ったときの相談相手になる。';

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
  const FIRST_MONTH = `はじめの 2 か月は ${noBreak(`${FREE_FIRST_MONTH_TOKENS} トークン`)}（${FIRST_CONSULTS}）`;
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
        ? `月額プランは${TRIAL_SENT}で、そのあと${noBreak(`月額 ${MONTHLY_TEXT}（税込）`)}で自動更新されます。${noBreak('無料期間が終わる')} ${noBreak('24 時間前までに')}解約すれば、${noBreak('料金はかかりません')}。`
        : `月額プランは${noBreak(`月額 ${MONTHLY_TEXT}（税込）`)}で自動更新されます。`);
  } else if (TRIAL) {
    renew = `${TRIAL_SENT}。そのあと${noBreak(`月額 ${MONTHLY_TEXT}`)} か${noBreak(`年額 ${ANNUAL_TEXT}（税込）`)}で自動更新されます。${noBreak('無料期間が終わる')} ${noBreak('24 時間前までに')}解約すれば、${noBreak('料金はかかりません')}（App Store から）。`;
  } else {
    renew = `プランは、選んだプラン（月額 ${MONTHLY_TEXT} または年額 ${ANNUAL_TEXT}・税込）で自動更新されます。`;
  }
  const pricingNote = [
    renew,
    '解約後も、メモは残ります。',
  ];

  // ── 最後のボタンの下（2 句・句の途中で折り返さない）──
  const priceLine = [
    '無料プランは、ずっと無料です。',
    TRIAL ? `${TRIAL_WHO}は${TRIAL_SENT}で、いつでも解約できます。` : 'プランは、いつでも解約できます。',
  ];

  // ── よくある質問（2026-10-11 オーナー「もっとシンプルに」で 6〜7 問に絞った・Android・パソコンの問いは同日に戻した）──
  // 並び（2026-10-22）: 本の語り口 → メモが少なくても → ChatGPT との違い → 無料プランの範囲 → 無料期間のあと・解約（1 問）→ AI に送るもの・学習 → 創業メンバー（期間中）→ Android・パソコン。
  // ld: false は検索結果に残すと古くなる問い（期間ものの創業メンバー価格・公開前だけの問い）。JSON-LD に入れない。
  // link: 答えの最後に付けるリンク（{ href, label }）。
  const faq = [
    ...(prelaunch ? [{
      q: 'いつから使えますか？',
      a: `${LAUNCH}に、App Store で公開する予定です。このページでメールアドレスを登録いただくと、公開の日にお知らせします。`,
      ld: false,
    }] : []),
    {
      // 2026-11-11 仕上げ: LP の見出し「本には、聞ける」「メモを根拠に答える」に合わせた問いに
      q: 'AI は、何をもとに答えますか？',
      a: `あなたがその本に残したメモです。1 冊の本を相談相手に選ぶと、その本の考え方と言い回しに寄せて答えます。${VOICE_NOTE}小説やエッセイでも使えます。`,
    },
    {
      // 2026-10-22: いちばん多い不安「メモが無いと役に立たないのでは」に先に答える（育つ前の相談＝読んだ本の公開の紹介文で補う・CLAUDE.md）。
      q: 'メモが少なくても、相談できますか？',
      a: '1 件からできます。メモが 10 件になるまでは、読んだ本の公開されている紹介文も補足に使って答えます。答えの中で、もとがあなたのメモか本の紹介文かを書き分けます。メモが増えるほど、答えはあなたに合っていきます。',
    },
    {
      q: 'ChatGPT と、何が違いますか？',
      a: 'Orime は、あなたが残したメモと読書の記録から答えます。メモを貼り付けたり、読んだ本を一から説明したりしなくて大丈夫です。答えには、もとになったメモの本とページが付きます。関係するメモがないときは、そう伝えます。AI も間違えることがあるので、気になる答えはもとのメモで確かめてください。',
    },
    {
      q: 'Android・パソコンでも使えますか？',
      a: prelaunch
        ? `まず App Store（iPhone）で公開します（${LAUNCH}の予定）。Android 版とパソコン版は準備中です。`
        : 'いまは iPhone の App Store のアプリでだけ使えます。ログインもアプリから行います。Android 版とパソコン版は準備中です。',
    },
    {
      q: '無料プランで、何ができますか？',
      a: `本とメモは何件でも残せて、AI 以外の機能はすべて使えます。AI の相談と「この本で学べること」は、あわせて${noBreak(`毎月 ${FREE_TOKENS} トークン`)}（答え ${FREE_CONSULTS}）、${FIRST_MONTH}。写真から書き起こしは${noBreak(`毎月 ${FREE_OCR_PER_MONTH} 回`)}です。使い切った月も、あなたのメモから関係する一節を並べて答えます。`,
    },
    {
      // 2026-10-22: 無料期間と解約を 1 問に（問いは 7 問まで・オーナー「もっとシンプルに」）。
      q: TRIAL ? '無料期間のあとは、どうなりますか？' : '解約すると、メモは消えますか？',
      a: (TRIAL
        ? `${TRIAL_WHO}の無料期間（${TRIAL}）は、AI を ${TRIAL_TOKENS} トークン（答え ${TRIAL_CONSULTS}）まで使えます。無料期間が終わると、${active ? `${noBreak(`月額 ${MONTHLY_TEXT}（税込）`)}` : '選んだプラン（月額か年額）'}で自動更新されます。終わる 24 時間前までに App Store で解約すれば、${noBreak('料金はかかりません')}（違約金もありません）。無料期間を使えるのは 1 つの Apple ID につき 1 回です。`
        : '')
        + (TRIAL ? '解約してもメモは消えず、無料プランのまま使えます。' : '解約は App Store からいつでもでき、違約金もかかりません。解約してもメモは消えず、無料プランのまま使えます。')
        + '本・メモ・行動・相談の記録は、設定から CSV で書き出せます。',
    },
    {
      q: 'メモは AI の学習に使われますか？',
      a: `使われません。相談では、質問と答えに使うメモ・読書の記録を ${SENDERS}。写真から書き起こしでは、ページの画像を Google 社の有料 API に送ります。どの会社も、送られたデータを AI の学習に使わないと規約で決めています。AI をはじめて使うときに送る内容と送り先が表示され、設定からいつでも取り消せます。`,
      link: { href: '/legal/privacy', label: '詳しくはプライバシーポリシーへ' },
    },
    // 創業メンバー価格の問いは 2026-11-11 に外した（料金の 4 行の表と同じ内容・ui-critic）
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
