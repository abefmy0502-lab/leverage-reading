// 🌱 Landing Page — Orime（2026-10-02 作り直し・11 月の公開に向けて）
//
// ポジショニング（2026-10-02 オーナー承認）: 「読んだ本が、あなたの相談相手になる。」
// 相手: 30〜40 代で、ビジネス書を月 2〜4 冊読み、「読んだのに覚えていない」「行動に移せない」と感じている人。
// 目的はひとつ: App Store からダウンロードしてもらうこと（主 CTA は全部同じ行動「無料プランで始める」）。
//
// 流れ（オーナー承認の構成）:
//   ① ヒーロー（見出し＋相談の答えの実画面）
//   ② 悩み → あなたのメモの一節 → 聞き返し → 一歩を決める（実画面 4 枚・約 15 秒・LpFlow.jsx）
//   ③ 比較表（ブクログ＝記録／ChatGPT＝広い知識から答える／Orime＝あなたの読書から答える。事実だけ・けなさない）
//   ④ 写真で共有の見本（アプリが描いた実際の画像）
//   ⑤ 「メモは、AI の学習に使われません。」（と、データの約束）
//   （創業メンバー価格・期間中だけ）→ 料金 → よくある質問 → ⑥ 最後のボタン「無料プランで始める」
//   ⑦ 利用者の声は、実在の声が届くまで出さない（TESTIMONIALS が空なら節ごと出ない）
//
// 創業メンバー価格（lib/foundingOffer.js）: VITE_FOUNDING_OFFER=on かつ VITE_FOUNDING_OFFER_END（日本時間）の前だけ、
//   ヒーローの小さな印・創業メンバー価格の節・料金の年額の行・FAQ を出す。終わる日を過ぎると自動で消える。
//   創業メンバー（特典＝開発者への直接の窓口・次に作る機能への投票）は、期間中にプランを始めた全員（月額・年額・
//   7 日間無料で始めた人も・2026-10-02 コーディネーター裁定）。¥9,800 は年額だけ。
//   「先着 N 人」とは書かない（人数の上限は付けない・景表法）。期間中、年額の初回特典は「1 年目 ¥9,800」なので
//   年額に 7 日間無料は付かない（7 日間無料は月額だけ）。金額の真実は App Store。
//
// 見た目はアプリと同じトークン（src/styles/tokens.css）で書く。色はニュートラル＋
// 栗色のアクセント 1 色（押せるものと最重要の情報だけ）。明暗はアプリと同じく端末に従う。
// 端末名（iPhone）は打ち出さない（将来 Android も出すため・2026-09-26 オーナー指示）。
//
// 誠実さの約束（旧版から継承）:
//   - 架空のユーザー数・お客様の声・効果数値は書かない（声は TESTIMONIALS に実在のものだけ）
//   - 実装されていない機能を約束しない。画面写真はお試しモード（サンプルのメモ）で撮った
//     実際のアプリ（public/lp の WebP。撮り直しは npm run demo → npm run lp:shots）
//   - 無料期間は正典（月額・年額とも 7 日間無料）を既定で出す。App Store の設定を変えたら VITE_TRIAL_NOTE で
//     文言を変える（'off' で非表示）。創業メンバー価格のあいだは月額だけ
//
// 技術ノート:
//   - CSP は default-src 'self'。外部 JS/画像/フォントは使わない
//   - SEO: SPA のためランタイムで meta/canonical/JSON-LD を注入し、unmount で戻す
//     （SNS のクローラ向けの静的な og:* は index.html 側）
//   - CTA は <a href>（長押し・中クリック等のネイティブ挙動を尊重）

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { BUILD_LABEL } from '../lib/buildInfo';
import { SUPPORT_EMAIL } from '../lib/contact';
import { isAppStoreLive } from '../lib/appStore';
import { savingsLabel } from '../lib/planOffers';
import { FREE_TOKENS, PAID_TOKENS, TRIAL_TOKENS, FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { normalizeTrialLabel, trialFirstPhrase, trialPeriodOf } from '../lib/trialNudge';
import { readFoundingOffer, noBreak, FOUNDING_NAME } from '../lib/foundingOffer';
import Shot from './LpShot';
import LpFlow from './LpFlow';
import Phrases from './LpPhrases';
import qrcode from 'qrcode-generator';
import { lpTrack, lpVariant, storeUrlFor } from '../lib/lpTrack';
import { inject as injectVercelAnalytics } from '@vercel/analytics';
import './landing.css';

// 無料期間（7 日間無料）の相談のおよその回数（相談 1 回 約 10 トークン＝lib/tokens.js の TOKEN_COSTS.consult。LP を軽くするため tokens.js は読まない）。
const TRIAL_CONSULTS = Math.round(TRIAL_TOKENS / 10);

// 🌱 ヒーローの 3D（three.js）は別チャンクで、写真を出したあとに読み込む。
const Hero3D = lazy(() => import('./Hero3D'));

// 🏷️ フッターにビルド識別子を出すのは URL に ?rev があるときだけ（訪問者には見せない）。
const SHOW_BUILD = (() => {
  try { return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('rev'); } catch { return false; }
})();

// 3D を出してよい端末か（データ節約モードと WebGL 非対応は写真のまま）。
function canUse3D() {
  if (typeof window === 'undefined') return false;
  if (navigator.connection?.saveData) return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// 📱 App Store の URL は src/lib/appStore.js に一元化。VITE_APP_STORE_URL が未設定の間は
// 押せない「近日公開」表示に倒す（プレースホルダー URL で App Store の 404 に落とさない）。
// loc = 押した場所（header / sticky / hero / flow / offer / pricing / final）。記録と App Store のキャンペーン名に使う。
function StoreCta({ className, children, tabIndex, hidden = false, loc = 'other' }) {
  if (!isAppStoreLive) {
    return <span className={`${className} is-soon`} aria-disabled="true" aria-hidden={hidden || undefined}>App Store で近日公開</span>;
  }
  return (
    <a href={storeUrlFor(loc)} className={className} tabIndex={tabIndex} aria-hidden={hidden || undefined} onClick={() => lpTrack('cta_click', { loc })}>
      {children}
    </a>
  );
}

// 📷 PC で見ている人向けの QR コード（スマホのカメラで読んで App Store へ）。
// App Store の URL があるときだけ・広い画面だけ（CSS で出し分け）。読み取りやすいよう白地に黒で描く。
function StoreQr() {
  if (!isAppStoreLive) return null;
  const qr = qrcode(0, 'M');
  qr.addData(storeUrlFor('qr'));
  qr.make();
  const n = qr.getModuleCount();
  const cells = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
  }
  return (
    <div className="lp-qr">
      <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width="88" height="88" role="img" aria-label="App Store のページを開く QR コード" shapeRendering="crispEdges">
        <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
        <path d={cells.join('')} fill="#000" />
      </svg>
      <p>スマホのカメラで<br />読み取って入手</p>
    </div>
  );
}

// 🌱 創業メンバー価格（期間中だけ・日本時間の終わる日の翌 0 時で自動で消える）。
const OFFER = readFoundingOffer();
// 終わる日（「12月15日」）は文の中で折り返さない。金額（「¥9,800」）は foundingOffer.js の定数 1 つから（2026-10-02 ui-critic）。
// 画面には「公開から 30 日間」と書かない（公開日がずれても文が嘘にならないよう、終わる日だけを言う）。
const END = noBreak(OFFER.endLabel);
const FOUNDING_PRICE = OFFER.price;

// 🎁 プランの無料期間の表記（既定は正典どおり「7 日間無料」）。App Store の Introductory Offer を変えたら
// env（VITE_TRIAL_NOTE）で合わせる（'off' で出さない）。「7日間無料」のような書き方も「7 日間無料」にそろえる。
// 「無料」が 2 つあるので取り違えない書き方にする（2026-09-28・GLOSSARY）:
//   無料プラン（ずっと無料）＝契約なし／最初の 7 日間は無料＝プランの無料期間（1 つの Apple ID に 1 回）。
// 創業メンバー価格のあいだは、無料期間は月額だけ（年額の初回特典は「1 年目 ¥9,800」）。
const TRIAL_RAW = (import.meta.env.VITE_TRIAL_NOTE ?? '7 日間無料').trim();
const TRIAL_NOTE = TRIAL_RAW === 'off' ? '' : normalizeTrialLabel(TRIAL_RAW);
// 「最初の 7 日間は無料」（期間が取り出せない書き方はそのまま）。
const TRIAL_FIRST = TRIAL_NOTE ? trialFirstPhrase(TRIAL_NOTE) : '';
// 文の中の形（「プランは最初の 7 日間が無料で、…」）。
const TRIAL_SENT = TRIAL_NOTE ? (trialPeriodOf(TRIAL_NOTE) ? `最初の ${trialPeriodOf(TRIAL_NOTE)}が無料` : TRIAL_NOTE) : '';
// 無料期間があるプランの呼び方（「プラン」／創業メンバー価格のあいだは「月額プラン」）。
const TRIAL_WHO = OFFER.active ? '月額プラン' : 'プラン';
// ボタンの文言（2026-10-02 オーナー承認）: アプリは無料プラン（ずっと無料）で使える（押すと App Store）。
const CTA_LABEL = '無料プランで始める';

const MONTHLY = 1480;
const ANNUAL = 12800;
// 金額の文字は数から作る（¥9,800 と同じく 1 か所・2026-10-02 ui-critic）。金額の真実は App Store。
const yen = (n) => `¥${n.toLocaleString('ja-JP')}`;
const MONTHLY_TEXT = yen(MONTHLY);
const ANNUAL_TEXT = yen(ANNUAL);
const PER_MONTH_TEXT = yen(Math.floor(ANNUAL / 12));
const SAVE = savingsLabel(MONTHLY, ANNUAL);
// 最後のボタンの下の注記（2 行以内・2026-09-29）。金額と自動更新・解約の条件は料金の欄（lp-pricing）で言う。
//   句ごとの塊（inline-block）で組み、「7 / 日間」のように語の途中で折り返さない。
const PRICE_LINE = [
  '無料プランは、ずっと無料。',
  TRIAL_NOTE ? `${TRIAL_WHO}は ${TRIAL_NOTE}・いつでも解約できます。` : 'プランは、いつでも解約できます。',
];

// 🗣 お客様の声。実在ユーザーの許可を得た本物の声だけを入れる（捏造・盛りは絶対 NG・2026-10-02 オーナー: 本物が届くまで出さない）。
// 形式: { quote, who: '30代・営業', how: '部下との 1on1 の前に相談している' }。空なら節ごと出ない。
const TESTIMONIALS = [];

// ③ 比較表（2026-10-02 オーナー承認: ブクログ＝記録／ChatGPT＝一般論／Orime＝あなたの読書から答える）。
// 事実だけ・けなさない。それぞれの得意なことを並べる（他社にない機能を「無い」とは書かない）。
const COMPARE_COLS = [
  { name: 'ブクログ', key: '記録' },
  // ChatGPT の見出しは「広い知識から答える」（「一般論」はけなして聞こえる・事実だけ・2026-10-02 コーディネーター裁定）。
  { name: 'ChatGPT', key: '広い知識から答える' },
  { name: 'Orime', key: 'あなたの読書から答える', us: true },
];
const COMPARE_ROWS = [
  { label: '得意なこと', cells: ['読んだ本を記録して、本棚に並べる', '広く一般的な知識から、何でも答える', 'あなたが残した読書メモを根拠に答える'] },
  { label: '困ったとき', cells: ['記録を自分で見返して探す', '状況を説明すると、一般的な答えが返る', '相談すると、メモの一節を根拠に、状況を聞き返す'] },
  { label: '読むほど', cells: ['本棚と記録が増える', '読んだ本は、会話で伝えた分だけ踏まえる', '答えの材料が増え、答えがあなたに近づく'] },
];

// ⑤ AI の学習に使われない・データの約束。すべて実装・規約で裏付けのある事実だけ。
const PRIVACY_POINTS = [
  { head: 'AI に送る前に、確かめます', body: 'はじめて AI を使うとき、送る内容と送り先を見てから使えます。設定のプライバシーから、いつでも取り消せます。' },
  { head: '答えを作り話にしない', body: '答えには、もとになったメモが付きます。関係するメモが無いときは、無理に答えずそう伝えます。' },
  { head: 'メモは、あなたのもの', body: '設定からいつでも全部ダウンロードできます。退会を申し込めば、すべて消去します。解約しても、メモは残ります。' },
  { head: '急かさない', body: '思い出しの通知は多くても週に 1 回。行動は期限の日の朝に 1 回だけ。バッジや連続日数で急かす仕組みは入れていません。' },
];

// FAQ は「申し込みの手前で止まる理由」を書く場所。表示と FAQPage JSON-LD の両方の元。
const FAQ_ITEMS = [
  {
    q: 'ChatGPT とは、何が違いますか？',
    a: 'ChatGPT は、広く一般的な知識から答えます。Orime は、あなたが読んで残したメモと読書の記録を根拠に答え、使ったメモ（本とページ）をいっしょに見せます。最初から答えを決めつけず、あなたの状況を聞いてから、明日やることを一緒に一つ決めます。',
  },
  {
    q: 'メモが少なくても相談できますか？',
    a: 'メモが 1 件からでも相談できます。答えの根拠はあなたのメモなので、メモが増えるほど答えは具体的になります。関係するメモが無いときは、無理に答えを作らず、そう伝えます。',
  },
  {
    q: 'これまでに読んだ本も使えますか？',
    a: '使えます。読み終えた本を選んで、覚えている一行を書くだけで、その日から相談の材料になります。ブクログ・Kindle に残した記録（レビュー・読書メモ・ハイライト）は、ファイルを選ぶだけで取り込めます。読書メーターは、パソコンで保存したページから取り込めます（感想も入ります）。',
  },
  {
    q: '忙しくて、続けられるか不安です',
    a: '読みながら、心が動いた一行を残すだけで始められます。メモは本文だけで保存でき、ページ番号や写真はあとから足せます。ページを撮影すれば、写真から文字に書き起こせます。',
  },
  {
    q: 'メモは AI の学習に使われますか？',
    a: '使われません。相談では、メモを Anthropic 社の Claude API に送って答えを作ります。読書計画シートやメモの凝縮、写真から書き起こしなど一部の機能は Google 社の有料の API を使います。どの会社も、API 経由で送られたデータを規約で AI の学習に使いません。はじめて AI を使うときに送る内容と送り先を確かめられ、設定からいつでも取り消せます。詳しくはプライバシーポリシーをご覧ください。',
  },
  {
    q: '料金はいくらですか？',
    a: `無料プラン（ずっと無料）で、メモ・記録・振り返り・シェアが使えます。AI は相談が毎月 ${FREE_TOKENS} トークン（相談 約 3 回）、写真から書き起こしが毎月 ${FREE_OCR_PER_MONTH} 回です。プラン（月額 ${MONTHLY_TEXT}、または年額 ${ANNUAL_TEXT}・月あたり約 ${PER_MONTH_TEXT}）にすると、相談が毎月 ${PAID_TOKENS} トークン（約 80 回）になり、AI 選書・読書計画シートも使えます。${OFFER.active ? `${END}までは、年額プランの 1 年目が ${FOUNDING_PRICE}（税込）です（創業メンバー価格）。` : ''}${TRIAL_NOTE ? `${TRIAL_WHO}は${TRIAL_SENT}です（初めての方だけ）。` : ''}お支払いは App Store（Apple ID）です。`,
  },
  ...(OFFER.active ? [{
    q: `${FOUNDING_NAME}とは何ですか？`,
    a: `${END}（日本時間）までにプランを始めた方は、月額・年額どちらでも（7 日間無料で始めた方も）創業メンバーです。開発者への直接の窓口と、次に作る機能への投票をご用意しています。人数の上限はありません。年額プランなら、1 年目は ${FOUNDING_PRICE}（税込）を始めるときにまとめてお支払いいただき、2 年目からは年額 ${ANNUAL_TEXT}（税込）で自動更新されます。この価格は App Store の初回特典なので、同じ Apple ID でプランの初回特典（月額プランの 7 日間無料など）を使ったことがない方が対象です。`,
  }] : []),
  ...(TRIAL_NOTE ? [{
    q: '無料期間のあとは、自動で料金がかかりますか？',
    a: `${TRIAL_WHO}の無料期間（${TRIAL_NOTE}）は、AI を ${TRIAL_TOKENS} トークン（相談 約 ${TRIAL_CONSULTS} 回）まで使えます。無料期間が終わると、${OFFER.active ? '月額プラン' : '選んだプラン（月額か年額）'}で自動更新されます。無料期間が終わる 24 時間前までに App Store のサブスクリプション設定から解約すれば、料金はかかりません。無料期間は、初めて登録する方が対象です。無料プランは期間の決まりがなく、ずっと無料です。`,
  }] : []),
  {
    q: '解約すると、メモは消えますか？',
    a: '消えません。解約は App Store のサブスクリプション設定からいつでもでき、違約金もありません。解約後も無料プランで使え、メモは残ります。再開すればそのまま使えます。',
  },
  {
    q: '通知がしつこくなりませんか？',
    a: '思い出しの通知は、多くても週に 1 回です。届くのは、あなたが前に残したメモ 1 件だけ。行動は期限の日の朝に 1 回だけお知らせします。設定からいつでもオフにできます。',
  },
  {
    q: 'Android でも使えますか？',
    a: 'いまは App Store で配信しています。Android 版は準備ができしだいお知らせします。',
  },
];

const setMeta = (name, content, attr = 'name') => {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  let created = false;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
    created = true;
  }
  const prev = created ? null : el.getAttribute('content');
  el.setAttribute('content', content);
  return { el, created, prev };
};

const TITLE = 'Orime｜読んだ本が、あなたの相談相手になる';
const DESCRIPTION = '読んだのに覚えていない、行動に移せない。Orime は、あなたが残した読書メモを根拠に答える相談相手です。メモの一節で答え、状況を聞き返し、明日やることを一緒に一つ決めます。無料プラン（ずっと無料）で始められます。';

export default function Landing() {
  const heroCtaRef = useRef(null);
  const [showSticky, setShowSticky] = useState(false);
  // ヒーローのボタンが見えている間は、ヘッダーのボタン（広い画面）を隠す＝主ボタンを 2 つ並べない（2026-10-02 ui-critic）。
  // 本文の中の同じボタン（料金・最後）が見えている間も true（2026-10-03・広い画面のヘッダーは上に付いたまま）。
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const heroStageRef = useRef(null);
  const heroImgRef = useRef(null);
  const [want3D, setWant3D] = useState(false);
  const [ready3D, setReady3D] = useState(false);
  const on3DReady = useCallback(() => { setReady3D(true); lpTrack('hero_3d', { ok: true }); }, []);
  const on3DLost = useCallback(() => { setReady3D(false); setWant3D(false); }, []);

  // 写真（LCP）を出し終えてから 3D を読み込む。A/B で「写真」に振り分けた人には出さない。
  useEffect(() => {
    if (lpVariant() !== '3d') return undefined;
    if (!canUse3D()) { lpTrack('hero_3d', { ok: false }); return undefined; }
    const kick = () => setWant3D(true);
    const id = 'requestIdleCallback' in window ? window.requestIdleCallback(kick, { timeout: 1500 }) : window.setTimeout(kick, 600);
    return () => ('cancelIdleCallback' in window ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, []);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const metas = [
      setMeta('description', DESCRIPTION),
      setMeta('og:title', TITLE, 'property'),
      setMeta('og:description', '読んだ本が、あなたの相談相手になる。あなたが残した読書メモを根拠に答え、明日やることを一緒に一つ決める読書アプリです。', 'property'),
      setMeta('og:type', 'website', 'property'),
    ];

    // canonical（LP は /lp でも表示されるため、正規 URL をルートに寄せる）
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${window.location.origin}/`;
    document.head.appendChild(canonical);

    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Orime',
        operatingSystem: 'iOS',
        applicationCategory: 'LifestyleApplication',
        description: '読んだ本が、あなたの相談相手になる読書アプリ。あなたが残した読書メモを根拠に答え、明日やることを一緒に一つ決めて行動リストに入れられる。',
        offers: [
          { '@type': 'Offer', name: '無料プラン', price: '0', priceCurrency: 'JPY' },
          { '@type': 'Offer', name: '月額プラン', price: String(MONTHLY), priceCurrency: 'JPY' },
          { '@type': 'Offer', name: '年額プラン', price: String(ANNUAL), priceCurrency: 'JPY' },
        ],
        url: `${window.location.origin}/`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ]);
    document.head.appendChild(ld);

    // メイン App の overflow:hidden + 100dvh が LP に効いてしまうので解除。
    const root = document.getElementById('root');
    document.documentElement.classList.add('lp-active');
    document.body.classList.add('lp-active');
    if (root) root.classList.add('lp-active');
    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      rootOverflow: root?.style.overflow ?? '',
      rootHeight: root?.style.height ?? '',
      rootDisplay: root?.style.display ?? '',
    };
    document.documentElement.style.overflow = 'auto';
    document.documentElement.style.height = 'auto';
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    if (root) {
      root.style.overflow = 'visible';
      root.style.height = 'auto';
      root.style.display = 'block';
    }

    // 画像（共有の見本）が画面に入ったら、奥から手前へ起き上がる（ヒーローの 3D とそろえた動き）。
    // 節が画面に入ったら 1 回だけ記録する（比較・共有・学習・創業メンバー価格がどこまで読まれたか）。
    let revealIo = null;
    let secIo = null;
    if (typeof IntersectionObserver !== 'undefined') {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.querySelector('.lp-root')?.classList.add('lp-motion');
        revealIo = new IntersectionObserver((entries) => {
          entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); revealIo.unobserve(e.target); } });
        }, { threshold: 0.2 });
        document.querySelectorAll('.lp-reveal').forEach((el) => revealIo.observe(el));
      }
      secIo = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          lpTrack('section_view', { s: e.target.dataset.lpSec });
          secIo.unobserve(e.target);
        });
      }, { threshold: 0.4 });
      document.querySelectorAll('[data-lp-sec]').forEach((el) => secIo.observe(el));
    }

    // Vercel Web Analytics（閲覧数・参照元・端末。Cookie なし）。LP でだけ読み込み、開発中は出さない。
    if (!import.meta.env.DEV) { try { injectVercelAnalytics({ mode: 'production' }); } catch { /* 無くても LP は動く */ } }
    // 記録: 表示 1 回（創業メンバー価格を出しているか）と、読み進めた深さ（25/50/75/100%）をそれぞれ 1 回ずつ。
    lpTrack('lp_view', { offer: OFFER.active });
    const depthSent = new Set();
    // 下部の固定ボタンは、ヒーローのボタンが画面から外れたときだけ出す（スマホのみ・CSS で制御）。
    const onScroll = () => {
      const el = heroCtaRef.current;
      // 本文の中の同じボタン（料金・最後）が見えている間は、下の固定ボタンを出さない（同じボタンを 2 つ並べない）。
      const vh = window.innerHeight;
      // 広い画面ではヘッダーが上に付いたままなので、その下から見えている範囲で数える（ヘッダーの裏のボタンは見えていない）。
      const top = Math.max(0, document.querySelector('.lp-header')?.getBoundingClientRect().bottom || 0);
      const inlineCtaVisible = Array.from(document.querySelectorAll('.lp-btn')).some((b) => {
        if (b.closest('.lp-sticky, .lp-header') || el?.contains(b)) return false;
        const r = b.getBoundingClientRect();
        return r.bottom > top && r.top < vh;
      });
      setShowSticky(!inlineCtaVisible && (el ? el.getBoundingClientRect().bottom < 0 : window.scrollY > 480));
      if (el) {
        const hr = el.getBoundingClientRect();
        // ヘッダーのボタンは、ヒーローのボタンも本文の中の同じボタン（料金・最後）も見えていないときだけ（主ボタンを 2 つ並べない）。
        setHeroCtaVisible((hr.bottom > top && hr.top < vh) || inlineCtaVisible);
      }
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 100;
      [25, 50, 75, 100].forEach((d) => {
        if (pct >= d - 1 && !depthSent.has(d)) { depthSent.add(d); lpTrack('scroll_depth', { pct: d }); }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      document.title = prevTitle;
      metas.forEach(({ el, created, prev: prevContent }) => {
        if (created) el.parentElement?.removeChild(el);
        else if (prevContent != null) el.setAttribute('content', prevContent);
      });
      canonical.parentElement?.removeChild(canonical);
      ld.parentElement?.removeChild(ld);
      window.removeEventListener('scroll', onScroll);
      revealIo?.disconnect();
      secIo?.disconnect();
      document.documentElement.classList.remove('lp-active');
      document.body.classList.remove('lp-active');
      if (root) root.classList.remove('lp-active');
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.documentElement.style.height = prev.htmlHeight;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.height = prev.bodyHeight;
      if (root) {
        root.style.overflow = prev.rootOverflow;
        root.style.height = prev.rootHeight;
        root.style.display = prev.rootDisplay;
      }
    };
  }, []);

  return (
    <div className="lp-root">
      <a className="lp-skip" href="#lp-main">本文へスキップ</a>

      <header className="lp-header">
        <div className="lp-wrap lp-header-inner">
          <a href="/" className="lp-brand" aria-label="Orime トップ">
            <img src="/icons/icon-192.png" alt="" width="28" height="28" />
            <span>Orime</span>
          </a>
          <nav className="lp-header-nav" aria-label="ヘッダー">
            <a href="/?auth=signin" className="lp-header-login">ログイン</a>
            <StoreCta
              className={`lp-btn lp-btn-small lp-header-cta${heroCtaVisible ? ' is-hidden' : ''}`}
              loc="header"
              tabIndex={heroCtaVisible ? -1 : undefined}
              hidden={heroCtaVisible}
            >
              {CTA_LABEL}
            </StoreCta>
          </nav>
        </div>
      </header>

      <div className={`lp-sticky${showSticky ? ' is-visible' : ''}`} aria-hidden={showSticky ? undefined : 'true'}>
        <StoreCta className="lp-btn" loc="sticky" tabIndex={showSticky ? undefined : -1}>{CTA_LABEL}</StoreCta>
      </div>

      <main id="lp-main">
        {/* ============ ① ヒーロー ============ */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-text">
              <p className="lp-eyebrow"><span>読んだのに、覚えていない。</span><span>行動に移せない。</span></p>
              <h1 className="lp-h1">
                <span>読んだ本が、</span><span>あなたの</span><span>相談相手になる。</span>
              </h1>
              <p className="lp-lead">
                Orime は、あなたが残した読書メモから答える相談相手です。困ったときに相談すると、メモの一節を根拠に答え、状況を聞き返し、明日やることを一緒に一つ決めます。
              </p>
              <div className="lp-cta-block" ref={heroCtaRef}>
                <div className="lp-cta-row">
                  <StoreCta className="lp-btn lp-btn-large" loc="hero">{CTA_LABEL}</StoreCta>
                  <StoreQr />
                </div>
                {/* 創業メンバー価格（期間中だけ）: 押すと下の節へ。料金・自動更新の条件は料金の欄で言う。 */}
                {OFFER.active && (
                  <a className="lp-offer-badge" href="#lp-offer" onClick={() => lpTrack('offer_badge', {})}>
                    {FOUNDING_NAME}・<span className="lp-nb">{OFFER.endLabel}</span>まで
                  </a>
                )}
              </div>
            </div>
            <figure className="lp-hero-shot">
              <div className={`lp-hero-stage${ready3D ? ' is-3d' : ''}`} ref={heroStageRef}>
                <Shot
                  name="answer"
                  eager
                  imgRef={heroImgRef}
                  alt="相談の画面。「部下が報告をくれなくて困っています」という相談に、『イシューからはじめよ』などのメモを根拠にした答えと、「報告が遅れるのは、どんな場面が多いですか？」という問いが返っている"
                />
                {want3D && (
                  <Suspense fallback={null}>
                    <Hero3D stageRef={heroStageRef} imgRef={heroImgRef} onReady={on3DReady} onLost={on3DLost} />
                  </Suspense>
                )}
              </div>
              <figcaption>画面は、サンプルのメモを入れた実際のアプリです</figcaption>
            </figure>
          </div>
        </section>

        {/* ============ ② 悩み → メモの一節 → 聞き返し → 一歩 ============ */}
        <section className="lp-sec lp-flow-sec" aria-labelledby="lp-flow" data-lp-sec="flow">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-flow">
                <span>悩みから、</span><span>明日の一歩まで。</span>
              </h2>
              <p className="lp-wbr"><Phrases>前に読んで残したメモが、困ったときの答えの材料になります。</Phrases></p>
            </div>
            <LpFlow onEvent={lpTrack} />
            <p className="lp-shot-note">画面は、サンプルのメモを入れた実際のアプリです</p>
          </div>
        </section>

        {/* ============ ③ 比べると ============ */}
        <section className="lp-sec lp-compare" aria-labelledby="lp-compare" data-lp-sec="compare">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-compare">
                <span>記録するだけでも、</span><span>広く答えるだけでもなく。</span>
              </h2>
              <p className="lp-wbr"><Phrases>読書の記録も、AI に聞くことも、それぞれに得意なことがあります。Orime が受け持つのは、あなたの読書から答えることです。</Phrases></p>
            </div>
            <table className="lp-cmp">
              <caption className="lp-sr">ブクログ・ChatGPT・Orime の得意なことの違い</caption>
              <thead>
                <tr>
                  <td />
                  {COMPARE_COLS.map((c) => (
                    <th scope="col" key={c.name} className={c.us ? 'is-us' : undefined}>
                      <span className="lp-cmp-name">{c.name}</span>
                      <span className="lp-cmp-key lp-wbr"><Phrases>{c.key}</Phrases></span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    {r.cells.map((t, i) => (
                      <td key={COMPARE_COLS[i].name} className={COMPARE_COLS[i].us ? 'is-us' : undefined} data-col={COMPARE_COLS[i].name}><span className="lp-wbr"><Phrases>{t}</Phrases></span></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="lp-cmp-note">
              ブクログに残した記録は、Orime にそのまま取り込めます。比べているのは主な使い方の違いです（2026 年 10 月時点）。ブクログ・ChatGPT は、各社の商標または登録商標です。
            </p>
          </div>
        </section>

        {/* ============ ④ 写真で共有の見本 ============ */}
        <section className="lp-sec lp-share" aria-labelledby="lp-share" data-lp-sec="share">
          <div className="lp-wrap lp-share-grid">
            <div className="lp-share-text">
              <h2 className="lp-h2" id="lp-share">
                <span>読んだ本を、</span><span>写真で共有。</span>
              </h2>
              <p className="lp-wbr"><Phrases>撮った写真に、書名と日付・メモの数、いちばん新しいメモの一文が重なります。読み終えた本なら、やり終えた行動の数も。押すのは「共有する」だけです。</Phrases></p>
              <p className="lp-wbr"><Phrases>写真は端末の中で描き、どこにも送りません。無料プランで使えます。</Phrases></p>
            </div>
            <figure className="lp-share-figure lp-reveal">
              <img
                className="lp-share-img"
                src="/lp/share-card-1080.webp"
                srcSet="/lp/share-card-540.webp 540w, /lp/share-card-1080.webp 1080w"
                sizes="(min-width: 768px) 360px, 80vw"
                width="1080"
                height="1350"
                loading="lazy"
                decoding="async"
                alt="共有の画像の見本。朝の机の写真に「チームの勝利が最優先。個人の手柄より、チームが勝つための判断をする。」という一文、読書中の『1兆ドルコーチ』エリック・シュミット、読みはじめ 9月23日、メモ 3 件、Orime のロゴが重なっている"
              />
              <figcaption>見本の写真とサンプルのメモで、アプリが作った画像です</figcaption>
            </figure>
          </div>
        </section>

        {/* ============ ⑤ AI の学習に使われません ============ */}
        <section className="lp-sec lp-privacy" aria-labelledby="lp-privacy" data-lp-sec="privacy">
          <div className="lp-wrap lp-privacy-grid">
            <div className="lp-privacy-head">
              <h2 className="lp-h2" id="lp-privacy">
                <span>メモは、</span><span>AI の学習に</span><span>使われません。</span>
              </h2>
              <p className="lp-wbr">
                <Phrases>相談では、メモを Anthropic 社の API に送って答えを作ります。写真からの書き起こしなど一部は Google 社の有料の API を使います。どの会社も、API で送られたデータを規約で AI の学習に使いません。</Phrases>
              </p>
            </div>
            <ul className="lp-points">
              {PRIVACY_POINTS.map((p) => (
                <li key={p.head}>
                  <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                  <div>
                    <p className="lp-points-title">{p.head}</p>
                    <p>{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ 利用者の声（実在の声があるときだけ） ============ */}
        {TESTIMONIALS.length > 0 && (
          <section className="lp-sec" aria-labelledby="lp-voices">
            <div className="lp-wrap lp-narrow">
              <h2 className="lp-h2" id="lp-voices">使っている人の声</h2>
              {TESTIMONIALS.map((t, i) => (
                <figure className="lp-voice" key={i}>
                  <blockquote>{t.quote}</blockquote>
                  <figcaption>{t.who}{t.how ? `／${t.how}` : ''}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* ============ 創業メンバー価格（期間中だけ） ============ */}
        {OFFER.active && (
          <section className="lp-sec lp-offer" id="lp-offer" aria-labelledby="lp-offer-title" data-lp-sec="offer">
            <div className="lp-wrap lp-offer-grid">
              <div className="lp-offer-head">
                <p className="lp-offer-when"><span className="lp-nb">{OFFER.endLabel}</span>（日本時間）まで</p>
                <h2 className="lp-h2" id="lp-offer-title">{FOUNDING_NAME}</h2>
                <p className="lp-wbr">
                  <Phrases>{`${OFFER.endLabel}までにプランを始めた方は、月額・年額どちらでも創業メンバーです。年額プランなら、1 年目が ${FOUNDING_PRICE}（税込）です。2 年目からは年額 ${ANNUAL_TEXT}（税込）で自動更新されます。`}</Phrases>
                </p>
                <p className="lp-wbr"><Phrases>Orime は、阿部文哉がひとりで作っています。最初に使ってくださる方の声で、次の形を決めたいと思っています。</Phrases></p>
              </div>
              <div className="lp-offer-card">
                <p className="lp-offer-label">年額プラン</p>
                <p className="lp-offer-price">{OFFER.priceLabel}<span>（税込）</span></p>
                <p className="lp-offer-after">2 年目から 年額 {ANNUAL_TEXT}（税込）</p>
                <p className="lp-offer-label lp-offer-label-perks">創業メンバーの特典（月額・年額どちらでも）</p>
                <ul className="lp-included" aria-label="創業メンバーの特典">
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>開発者への直接の窓口（いただいた要望を優先して読みます）</span></li>
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>次に作る機能への投票</span></li>
                </ul>
                <div className="lp-cta-block">
                  <StoreCta className="lp-btn lp-btn-large" loc="offer">{CTA_LABEL}</StoreCta>
                  <p className="lp-cta-note lp-wbr">
                    <Phrases>{`無料プランで始めて、${END}までにアプリの「プランを見る」からプランへ（${noBreak('7 日間無料')}で始めた方も創業メンバーです）。年額の ${FOUNDING_PRICE} は App Store の初回特典なので、同じ Apple ID で初回特典（月額プランの 7 日間無料など）を使ったことがない方が対象です。人数の上限はありません。`}</Phrases>
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ============ 料金（年額をおすすめ） ============ */}
        <section className="lp-sec lp-pricing" aria-labelledby="lp-pricing" data-lp-sec="pricing">
          <div className="lp-wrap lp-narrow-wide">
            <h2 className="lp-h2" id="lp-pricing">
              {/* 月あたりの額を請求額より大きく見せない（見出しに金額を置かない・2026-09-27） */}
              <span>メモと記録は、</span><span>ずっと無料です。</span>
            </h2>
            {/* 2 枚だけ（2026-09-28）: 無料プラン（ずっと無料）と、プラン。
                「無料」だけの見出しにしない（7 日間無料と取り違えないように・GLOSSARY）。 */}
            <div className="lp-plan-cards">
              <div className="lp-plan">
                <p className="lp-plan-name">無料プラン</p>
                <p className="lp-plan-price">¥0<span>ずっと無料</span></p>
                {/* 含まれるものは各カードの中に（別の一覧にすると、どちらのプランの話か分かりにくい） */}
                <ul className="lp-included" aria-label="無料プランに含まれるもの">
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>本とメモは何件でも。記録・振り返り・シェアも</span></li>
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>相談は<span className="lp-nb">毎月 {FREE_TOKENS} トークン</span>（約 3 回）</span></li>
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>写真から書き起こし <span className="lp-nb">毎月 {FREE_OCR_PER_MONTH} 回</span></span></li>
                </ul>
              </div>
              <div className="lp-plan">
                <p className="lp-plan-name"><span>プラン{TRIAL_FIRST && !OFFER.active && <span className="lp-plan-trial">（{TRIAL_FIRST}）</span>}</span></p>
                <ul className="lp-included" aria-label="プランに含まれるもの">
                  {/* li は flex（印と文を横に並べる）なので、文は 1 つの span に包む（文の途中で別の塊に割れないように） */}
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>相談が毎月 <span className="lp-nb">{PAID_TOKENS} トークン（約 80 回）</span>。{TRIAL_NOTE && <>無料期間中は <span className="lp-nb">{TRIAL_TOKENS} トークン</span><span className="lp-nb">（相談 約 {TRIAL_CONSULTS} 回）</span>。</>}足りない月は追加もできます</span></li>
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" /><span>AI 選書・読書計画シート・写真から書き起こし</span></li>
                </ul>
                <div className="lp-plan-rows">
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">年額プラン<span className="lp-plan-tag">{OFFER.active ? FOUNDING_NAME : 'おすすめ'}</span></p>
                    {OFFER.active ? (
                      <>
                        <p className="lp-plan-price">{OFFER.priceLabel}<span>（税込）</span></p>
                        {/* 条件は金額のすぐ下に（誰の・いつの価格か・景表法・2026-10-02 ui-critic）。その次の行に 2 年目からの自動更新。 */}
                        <p className="lp-plan-cond"><span className="lp-nb">{OFFER.endLabel}</span>までに始めた方の 1 年目（初回特典を使ったことがない Apple ID）</p>
                        <p className="lp-plan-sub">2 年目から 年額 {ANNUAL_TEXT}（税込）で自動更新</p>
                      </>
                    ) : (
                      <>
                        <p className="lp-plan-price">{ANNUAL_TEXT}<span>/ 年（税込）</span></p>
                        <p className="lp-plan-sub">月あたり約 {PER_MONTH_TEXT}。{SAVE}。</p>
                      </>
                    )}
                  </div>
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">月額プラン</p>
                    <p className="lp-plan-price">{MONTHLY_TEXT}<span>/ 月（税込）</span></p>
                    <p className="lp-plan-sub">{OFFER.active && TRIAL_FIRST ? `${TRIAL_FIRST}。` : '1 か月ずつ続けられます。'}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="lp-cta-block">
              <StoreCta className="lp-btn lp-btn-large" loc="pricing">{CTA_LABEL}</StoreCta>
              <p className="lp-cta-note lp-wbr">
                <Phrases>{`アプリは無料でダウンロードできます。${OFFER.active
                  ? `${FOUNDING_NAME}の年額プランは、1 年目の ${FOUNDING_PRICE}（税込）を始めるときにまとめてお支払いいただき、2 年目から年額 ${ANNUAL_TEXT}（税込）で自動更新されます。${TRIAL_NOTE ? `月額プランは${TRIAL_SENT}で、そのあと月額 {MONTHLY_TEXT}（税込）で自動更新されます。無料期間が終わる 24 時間前までに解約すれば、料金はかかりません。` : '月額プランは月額 ${MONTHLY_TEXT}（税込）で自動更新されます。'}`
                  : TRIAL_NOTE
                    ? `プランは${TRIAL_SENT}で、そのあと選んだプラン（月額 ${MONTHLY_TEXT} または年額 ${ANNUAL_TEXT}・税込）で自動更新されます。無料期間が終わる 24 時間前までに解約すれば、料金はかかりません。`
                    : `プランは、選んだプラン（月額 ${MONTHLY_TEXT} または年額 ${ANNUAL_TEXT}・税込）で自動更新されます。`}`}</Phrases>
                <br />
                <Phrases>お支払いは App Store（Apple ID）です。解約はいつでもでき、違約金はありません。解約しても無料プランで使え、メモは残ります。</Phrases>
              </p>
            </div>
          </div>
        </section>

        {/* ============ FAQ（申し込みの手前で止まる理由） ============ */}
        <section className="lp-sec lp-faq" aria-labelledby="lp-faq">
          <div className="lp-wrap lp-narrow">
            <h2 className="lp-h2" id="lp-faq">よくある質問</h2>
            <div className="lp-faq-list">
              {FAQ_ITEMS.map((f, i) => (
                <details className="lp-faq-item" key={f.q} onToggle={(e) => { if (e.currentTarget.open) lpTrack('faq_open', { i }); }}>
                  <summary>
                    <span>{f.q}</span>
                    <ChevronDown size={20} aria-hidden="true" className="lp-faq-mark" />
                  </summary>
                  {/* 答えも文節で折り返す（iOS の Safari で語の途中で割れない・2026-10-02 ui-critic） */}
                  <p className="lp-wbr"><Phrases>{f.a}</Phrases></p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============ ⑥ 最後のボタン ============ */}
        <section className="lp-final" aria-labelledby="lp-final">
          <div className="lp-wrap lp-narrow lp-final-inner">
            <h2 className="lp-h2" id="lp-final">
              <span>今日残した一行が、</span><span>一年後のあなたの</span><span>相談に答える。</span>
            </h2>
            <div className="lp-cta-block">
              <div className="lp-cta-row">
                <StoreCta className="lp-btn lp-btn-large" loc="final">{CTA_LABEL}</StoreCta>
                <StoreQr />
              </div>
              <p className="lp-cta-note">{PRICE_LINE.map((t) => <span key={t}>{t}</span>)}</p>
            </div>
            <p className="lp-story">
              <span>Orime（オリメ）の名前は</span><span>「折り目」から。</span><span>大切なページの角を折るように、</span><span>心が動いた一行に</span><span>印をつけておけるアプリを</span><span>目指しています。</span>
            </p>
          </div>
        </section>
      </main>

      <footer className="lp-footer" data-build={BUILD_LABEL}>
        <div className="lp-wrap">
          <p className="lp-footer-brand">Orime</p>
          <p className="lp-footer-op">運営：阿部文哉（個人で開発しています）</p>
          <nav className="lp-footer-links" aria-label="フッター">
            <a href="/legal/terms">利用規約</a>
            <a href="/legal/privacy">プライバシーポリシー</a>
            <a href="/legal/sct">特定商取引法に基づく表記</a>
            <a href={`mailto:${SUPPORT_EMAIL}`}>お問い合わせ</a>
          </nav>
          <p className="lp-footer-copy">© 2026 Orime</p>
          {/* 🏷️ ビルド識別子。訪問者には見せない。配信中の版は URL に ?rev を付けると
              ここに出る（フッターの data-build 属性でも確認できる）。 */}
          {SHOW_BUILD && <p className="lp-footer-build">{BUILD_LABEL}</p>}
        </div>
      </footer>
    </div>
  );
}
