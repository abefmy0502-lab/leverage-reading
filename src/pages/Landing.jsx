// 🌱 Landing Page — Orime（2026-10-02 作り直し → 2026-10-05 → 2026-10-11 公開している前提・新しい訴求で作り直し）
//
// 訴求の正は company/marketing-master-plan-2026-10.md（§0）: 読書を、受け身から対話へ。見出しは「読んだ本と、対話しよう。」
//   心に響いた一行から、AI が本の語り口で答える（要約ではなく、あなたのメモから・本とページを添えて）→ 成果へ。
//   「著者と話せる」とは書かない（「本の語り口で答える」「本と対話する」まで）。語り口の注記はヒーローの写真の下の 1 か所。
// 相手: 読書の成果を最大にしたい人・読書を習慣にしたい人・意識の高い社会人・大学生（立場では絞らない）。
//
// 流れ（2026-10-11）:
//   ① ヒーロー（A/B: 'illust'＝いろいろな本と対話するイラスト（LpIllust.jsx）↔ 'photo'＝1 冊の本に相談した答えの画面）
//   ② 受け身から対話へ（これまで／これから の 2 行＋実画面 4 枚の対話の流れ・LpFlow.jsx＋相談の例 3 つ）
//   ③ 続けられて、成果が見える（柱 ②〜⑤ を 1 行ずつ: 明日の一歩・集中モード・写真で共有・分野）
//   ④ メモがゼロでも、今日から（一言ずつ・取り込む・撮る・積読でも）＋入口
//   ⑤ 料金（見出しは価値の言い換え「月に本 1 冊ほどの値段で、…」・補足に月額と 1 日あたり約 ¥49・年額は 1 日あたり約 ¥35・プランで手に入るもの 3 つ）
//   → ⑥ よくある質問（5〜6 問）→ ⑦ 最後の入口。2026-10-11 オーナー「もっとシンプルに・1 画面 1 メッセージ」で文と注記を減らし、
//   開発者の名前は LP に出さない（法律のページだけ）。利用者の声は実在の声が届くまで出さない（TESTIMONIALS が空なら節ごと出ない）
//
// 入口（2026-10-11）: 既定は公開済みの形＝「無料プランで始める」（下の固定の帯・ヘッダーのボタン・PC の QR も）。
//   App Store の URL（VITE_APP_STORE_URL）があればアプリのページ（＋キャンペーン ct=・lpTrack の storeUrlFor）、
//   無いビルドでは日本の App Store での「Orime」の検索（lpCopy.js の APP_STORE_SEARCH_URL）。
//   公開前の形（メールでお知らせ・公開予定の行・公開前の FAQ）は VITE_LP_PRELAUNCH=on のときだけ（LpWaitlist.jsx）。
//
// 創業メンバー価格（lib/foundingOffer.js）: VITE_FOUNDING_OFFER=on かつ VITE_FOUNDING_OFFER_END（日本時間）の前だけ、
//   ヒーローの小さな印・料金の中の帯・年額の行・FAQ を出す。終わる日を過ぎると自動で消える。「先着」「通常価格」を
//   書かない・¥9,800 と ¥12,800 の差を書かない（二重価格にしない）。期間中、7 日間無料は月額だけ。
//
// 条件で変わる文（料金の注記・FAQ）は lpCopy.js（テストあり）。見た目はアプリと同じトークン（landing.css）。
// 端末名（iPhone）は打ち出さない（Android も出す予定）。架空の数字・声・効果の言い切りは書かない。チーム・会社向けは書かない。
//
// 技術ノート:
//   - CSP は default-src 'self'。外部 JS/画像/フォントは使わない
//   - `/` のはじめての人には main.jsx がアプリ本体を読まずにこのページを出す（lib/staticRoute.js の landingAtRoot）
//   - このファイルから Supabase のクライアントを読まない（lib/trialLabel.js・lib/tokenAmounts.js など軽いものだけ）
//   - SEO: SPA のためランタイムで meta/canonical/JSON-LD を注入し、unmount で戻す（静的な og:* は index.html）
//   - CTA は <a href>（長押し・中クリック等のネイティブ挙動を尊重）

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { BUILD_LABEL } from '../lib/buildInfo';
import { SUPPORT_EMAIL } from '../lib/contact';
import { isAppStoreLive } from '../lib/appStore';
import { AI_JEV_ON } from '../lib/aiProcessors';
import { PAID_TOKENS, TRIAL_TOKENS, FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { normalizeTrialLabel } from '../lib/trialLabel';
import { readFoundingOffer, noBreak, FOUNDING_NAME } from '../lib/foundingOffer';
import Shot from './LpShot';
import LpFlow from './LpFlow';
import LpWaitlist from './LpWaitlist';
import LpIllust from './LpIllust';
import LpArt, { hasArt } from './LpArt';
import Phrases from './LpPhrases';
import { buildLpCopy, storeHrefOf, CONSULT_ANSWERS_NOTE, MONTHLY, ANNUAL, NO_INFO_REFUNDS, DEFAULT_LAUNCH_LABEL, LP_TITLE, LP_DESCRIPTION, LP_OG_DESCRIPTION, VOICE_NOTE, SAMPLE_NOTE } from './lpCopy';
import qrcode from 'qrcode-generator';
import { lpTrack, lpVariant, storeUrlFor, isWidePointer } from '../lib/lpTrack';
import { inject as injectVercelAnalytics } from '@vercel/analytics';
import './landing.css';

// 🌱 ヒーローの 3D（three.js）は別チャンクで、写真を出したあとに読み込む（広い画面・マウスの端末だけ）。
const Hero3D = lazy(() => import('./Hero3D'));

// 🏷️ フッターにビルド識別子を出すのは URL に ?rev があるときだけ（訪問者には見せない）。
const SHOW_BUILD = (() => {
  try { return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('rev'); } catch { return false; }
})();

// 3D を出してよい端末か（広い画面・マウスの端末だけ・2026-10-05。データ節約モードと WebGL 非対応は写真のまま）。
function canUse3D() {
  if (typeof window === 'undefined') return false;
  if (navigator.connection?.saveData) return false;
  if (!isWidePointer()) return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// 🌱 創業メンバー価格（期間中だけ・日本時間の終わる日の翌 0 時で自動で消える）。
const OFFER = readFoundingOffer();
// 🎁 プランの無料期間の表記（既定は正典どおり「7 日間無料」・VITE_TRIAL_NOTE で変える・'off' で出さない）。
const TRIAL_RAW = (import.meta.env.VITE_TRIAL_NOTE ?? '7 日間無料').trim();
const TRIAL_NOTE = TRIAL_RAW === 'off' ? '' : normalizeTrialLabel(TRIAL_RAW);
// 🚀 公開前の形（メールでお知らせ・公開予定・公開前の FAQ）は VITE_LP_PRELAUNCH=on のときだけ（2026-10-11 から既定は公開済み）。
// 🧪 開発中だけ ?prelaunch=1 で公開前の形を見られる。
const PRELAUNCH = String(import.meta.env.VITE_LP_PRELAUNCH || '').trim().toLowerCase() === 'on'
  || (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('prelaunch') === '1');
// 公開予定（公開前の形のときだけ出す）。
const LAUNCH_LABEL = (import.meta.env.VITE_LAUNCH_LABEL || DEFAULT_LAUNCH_LABEL).trim();
// 📛 Apple 公式の「App Store からダウンロード」バッジ（任意）。Apple のマーケティングのページから日本語版の SVG を
// そのまま（色・形を変えずに）public/lp/ に置き、その場所を VITE_APP_STORE_BADGE に入れたときだけ、公開後の
// ヒーローと最後のボタンの横に出す（高さ 40 以上・周りに高さの 1/4 の余白・Apple のガイドライン）。
const BADGE_SRC = (import.meta.env.VITE_APP_STORE_BADGE || '').trim();
const COPY = buildLpCopy({ offer: OFFER, trialNote: TRIAL_NOTE, prelaunch: PRELAUNCH, jev: AI_JEV_ON, launchLabel: LAUNCH_LABEL });
const { MONTHLY_TEXT, ANNUAL_TEXT, PER_MONTH_TEXT, PER_DAY_TEXT, ANNUAL_PER_DAY_TEXT, SAVE, TRIAL_FIRST, TRIAL_CONSULTS, FREE_CONSULTS, FIRST_CONSULTS, PAID_CONSULTS, END } = COPY;
const LAUNCH_LINE = `${LAUNCH_LABEL}に、App Store で公開予定です。`;
// ボタンの文言（2026-10-02 オーナー承認）: アプリは無料プラン（ずっと無料）で使える（押すと App Store）。
// 狭い幅・最大の文字で割れても「無料プランで／始める」になるよう、2 つの塊に包む（.lp-btn は keep-all）。
//   .lp-btn は inline-flex なので、外側を 1 つの span にして 2 つの塊を同じ行の中に置く（2 列に割れていた・2026-10-11 ui-critic）。
const CTA_LABEL = <span className="lp-btn-label"><span className="lp-nb">無料プランで</span><wbr /><span className="lp-nb">始める</span></span>;

// 🗣 お客様の声。実在ユーザーの許可を得た本物の声だけを入れる（捏造・盛りは絶対 NG・本物が届くまで出さない）。
// 形式: { quote, who: '30代・営業', how: '部下との 1on1 の前に相談している' }。空なら節ごと出ない。
const TESTIMONIALS = [];

// ② これまでの読書と、Orime の読書（2 行だけ）
const BEFORE_AFTER = [
  { label: 'これまで', steps: ['読む', '閉じる', '終わり'] },
  { label: 'Orime', steps: ['一行を残す', '本と対話する', '明日の一歩'] },
];

// ② 相談の例（幅を持たせて 3 つ・立場で絞らない）
const ASK_EXAMPLES = [
  { who: '仕事', q: '任せるのが苦手。どうしたらいい？' },
  { who: '就活・キャリア', q: '自己分析で、自分の強みをどう言う？' },
  { who: '習慣・自己成長', q: '続けたいのに、三日で終わってしまう' },
];

// ③ 続けられて、成果が見える（柱 ②〜⑤・1 つ 1〜2 文・画面 1 枚）
const PILLARS = [
  {
    id: 'action', shot: 'action', artAlt: '相談で決めた一歩を、明日のやることに書き込む様子のイラスト',
    head: '成果につなげる',
    title: '対話の最後は、明日の一歩。',
    body: '決めた一歩は行動リストへ。期限の日の朝にお知らせします。',
    alt: '振り返りの行動の画面。明日・来週以降に分かれた行動の一覧と、それぞれの本の名前',
  },
  {
    id: 'focus', shot: 'focus', artAlt: '時間を決めて、集中して本を読む様子のイラスト',
    head: '習慣にする',
    title: '時間を決めて、集中して読む。',
    body: '集中モードで読んだ時間が、本と分野ごとに残ります。',
    alt: '集中モードの画面。暗い地に本の表紙と書名、「残り 23 分」の大きな数字と細い輪、下にメモ・おわる・一時停止のボタン',
  },
  {
    id: 'share', share: true, artAlt: '心に残った一文を写真に重ねて共有する様子のイラスト',
    head: '発信して、続ける',
    title: '心に残った一文を、1 枚の画像に。',
    body: '写真に一文と書名を重ねて共有。写真はどこにも送りません。',
    alt: '共有の画像の見本。朝の机の写真に、心に残った一文と書名・ページ、Orime のロゴが重なっている',
  },
  {
    id: 'fields', shot: 'fields', artAlt: 'これまでに読んだ本を分野ごとに見渡す様子のイラスト',
    head: '自分の読書を客観的に見る',
    title: 'どの分野が手薄か、見える。',
    body: '手薄な分野が分かり、次の一冊を AI 選書で相談できます（プラン）。',
    alt: '振り返りの記録の「分野」。仕事・自分と生活の分野ごとの本とメモの数と、「まだ本がない分野」のチップ',
  },
];

// ③ の下の安心の 4 つ。学習＝各社の API 規約／同意＝ensureAiConsent（はじめて AI を使う操作のとき）／
// 書き出し＝設定の CSV（lib/exportData.js）・退会のお申し込みで消去／写真で共有＝端末の中で描く（サーバーに送らない）。
const TRUST_POINTS = [
  'メモは、AI の学習に使われません',
  'AI に送るのは AI の機能を使うときだけ。はじめに同意を聞きます',
  'いつでも CSV で書き出せて、退会のお申し込みでデータを消去します',
  '共有の写真は、サーバーに送りません',
];

// ④ メモがゼロでも、今日から（0 日目の 4 つの道・SPEC §1-1d）
const START_POINTS = [
  { head: '読んだ本に、一言ずつ', body: `覚えている一行を書くだけ。${noBreak('うろ覚え')}で大丈夫です。` },
  { head: 'ほかのアプリから取り込む', body: 'ブクログ・読書メーター・Kindle の記録を、ファイルを選ぶだけで。' },
  { head: '本のページを撮る', body: '線を引いたページを撮ると、文字に書き起こします。' },
  { head: '積読から始める', body: '読む前に「この本で学べること」が分かります。' },
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

// 文書の頭（index.html と同じ言葉・lpCopy.js の LP_TITLE など・テストが一致を確かめる）。
const TITLE = LP_TITLE;
const DESCRIPTION = LP_DESCRIPTION;
const OG_DESCRIPTION = LP_OG_DESCRIPTION;

// 📱 App Store へ。loc = 押した場所（header / sticky / hero / start / pricing / final / qr）。
// URL（VITE_APP_STORE_URL）が無いビルドでは、日本の App Store での「Orime」の検索へ（lpCopy.js）。
const storeHref = (loc) => storeHrefOf({ live: isAppStoreLive, url: storeUrlFor(loc) });

function StoreCta({ className, children, tabIndex, hidden = false, loc = 'other' }) {
  return (
    <a href={storeHref(loc)} className={className} tabIndex={tabIndex} aria-hidden={hidden || undefined} onClick={() => lpTrack('cta_click', { loc })}>
      {children}
    </a>
  );
}

// 📷 PC で見ている人向けの QR コード（スマホのカメラで読んで App Store へ）。広い画面だけ（CSS で出し分け）。
function StoreQr() {
  const qr = qrcode(0, 'M');
  qr.addData(storeHref('qr'));
  qr.make();
  const n = qr.getModuleCount();
  const cells = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`);
  }
  return (
    <div className="lp-qr">
      {/* 読み取りやすいよう、明暗どちらでも白地に黒（QR の色だけはトークンにしない） */}
      <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width="88" height="88" role="img" aria-label="App Store のページを開く QR コード" shapeRendering="crispEdges">
        <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
        <path d={cells.join('')} fill="#000" />
      </svg>
      <p>スマホのカメラで<br />読み取って入手</p>
    </div>
  );
}

// 入口: 既定は「無料プランで始める」（＋QR・公式バッジ）、公開前の形のときだけ「公開の日にメールで知らせる」。
function Entry({ loc, wl, qr = false, badge = false, launch = false, center = false }) {
  if (PRELAUNCH) {
    return <LpWaitlist loc={loc} done={wl.done} onDone={wl.markDone} launch={launch ? LAUNCH_LINE : ''} center={center} />;
  }
  return (
    <div className="lp-cta-row">
      <StoreCta className="lp-btn lp-btn-large" loc={loc}>{CTA_LABEL}</StoreCta>
      {badge && BADGE_SRC && (
        <a className="lp-badge" href={storeHref(`${loc}_badge`)} onClick={() => lpTrack('cta_click', { loc: `${loc}_badge` })}>
          <img src={BADGE_SRC} alt="App Store からダウンロード" height="40" />
        </a>
      )}
      {qr && <StoreQr />}
    </div>
  );
}

// 節の中の 3〜4 項目（見出し＋本文・上に線）。印を付けるときは check。
function PointList({ items, check = false, className = 'lp-points' }) {
  return (
    <ul className={className}>
      {items.map((p) => (
        <li key={p.head}>
          {check && <Check size="1.1em" strokeWidth={2.4} aria-hidden="true" />}
          <div>
            <p className="lp-points-title">{p.head}</p>
            <p className="lp-wbr"><Phrases>{p.body}</Phrases></p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Landing() {
  const heroCtaRef = useRef(null);
  const [showSticky, setShowSticky] = useState(false);
  // ヒーローのボタンが見えている間は、ヘッダーのボタン（広い画面）を隠す＝主ボタンを 2 つ並べない。
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  // 公開のお知らせ: 1 か所で送ったら、ほかの入口も「お知らせします」にする。
  const [wlDone, setWlDone] = useState(false);
  const wl = { done: wlDone, markDone: useCallback(() => setWlDone(true), []) };
  // ヒーローの表示方式（2026-10-11〜）: 'illust'＝いろいろな本と対話するイラスト ↔ 'photo'＝1 冊に相談した答えの実際の画面
  // （'3d' は ?hero=3d のときだけ・lib/lpTrack.js の lpVariant）。イラストのときは注記を画面のある「読んで、終わりにしない。」の節に任せる。
  const [heroVariant] = useState(() => lpVariant());
  // 写真で共有の柱がイラストに替わったら、「共有の画像は見本の写真で…」の注記は出さない。
  const shareArt = hasArt('illust-share');
  const heroStageRef = useRef(null);
  const heroImgRef = useRef(null);
  // 3D に振り分けた・3D を出せる端末では、最初から 3D の余白を取っておく（あとから余白が足されて見出しが跳ねない・CLS）。
  const [slot3D] = useState(() => lpVariant() === '3d' && canUse3D());
  const [want3D, setWant3D] = useState(false);
  const [ready3D, setReady3D] = useState(false);
  const on3DReady = useCallback(() => { setReady3D(true); lpTrack('hero_3d', { ok: true }); }, []);
  const on3DLost = useCallback(() => { setReady3D(false); setWant3D(false); }, []);

  // 写真（LCP）を出し終えてから 3D を読み込む。A/B で「写真」に振り分けた人・スマホには出さない。
  useEffect(() => {
    if (lpVariant() !== '3d') return undefined;
    if (!slot3D) { lpTrack('hero_3d', { ok: false }); return undefined; }
    const kick = () => setWant3D(true);
    const id = 'requestIdleCallback' in window ? window.requestIdleCallback(kick, { timeout: 1500 }) : window.setTimeout(kick, 600);
    return () => ('cancelIdleCallback' in window ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  }, [slot3D]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = TITLE;
    const metas = [
      setMeta('description', DESCRIPTION),
      setMeta('og:title', TITLE, 'property'),
      setMeta('og:description', OG_DESCRIPTION, 'property'),
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
        // ストアの第 1 カテゴリ（仕事効率化）に近いもの
        applicationCategory: 'BusinessApplication',
        description: '読んだ本と対話する読書メモアプリ。心に響いた一行を残すと、AI がその本の語り口で、あなたのメモから本とページを添えて答え、明日やることを一緒に一つ決める。集中モード・写真で共有・分野ごとの読書の記録も。',
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
        // 期間もの（創業メンバー価格）・公開前だけの問いは入れない。見えない印は外してある（lpCopy.js の faqLd）
        mainEntity: COPY.faqLd.map((f) => ({
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

    // 画像が画面に入ったら、奥から手前へ起き上がる（ヒーローの 3D とそろえた動き）。
    // 節が画面に入ったら 1 回だけ記録する（どの節まで読まれたか・data-lp-sec）。
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
    // 記録: 表示 1 回（創業メンバー価格を出しているか・公開済みか）と、読み進めた深さ（25/50/75/100%）。
    lpTrack('lp_view', { offer: OFFER.active, live: isAppStoreLive, pre: PRELAUNCH });
    const depthSent = new Set();
    // 下部の固定ボタン（公開前の形では出さない・スマホのみ）は、ヒーローのボタンが画面から外れたときだけ出す。
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 100;
      [25, 50, 75, 100].forEach((d) => {
        if (pct >= d - 1 && !depthSent.has(d)) { depthSent.add(d); lpTrack('scroll_depth', { pct: d }); }
      });
      if (PRELAUNCH) return;
      const el = heroCtaRef.current;
      const vh = window.innerHeight;
      // 広い画面ではヘッダーが上に付いたままなので、その下から見えている範囲で数える。
      const top = Math.max(0, document.querySelector('.lp-header')?.getBoundingClientRect().bottom || 0);
      // 本文の中の同じボタン（初日から・料金・最後）が見えている間は、固定ボタン・ヘッダーのボタンを出さない。
      const inlineCtaVisible = Array.from(document.querySelectorAll('.lp-btn')).some((b) => {
        if (b.closest('.lp-sticky, .lp-header') || el?.contains(b)) return false;
        const r = b.getBoundingClientRect();
        return r.bottom > top && r.top < vh;
      });
      setShowSticky(!inlineCtaVisible && (el ? el.getBoundingClientRect().bottom < 0 : window.scrollY > 480));
      if (el) {
        const hr = el.getBoundingClientRect();
        setHeroCtaVisible((hr.bottom > top && hr.top < vh) || inlineCtaVisible);
      }
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

  const footerLink = (to) => () => lpTrack('footer_link', { to });

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
            {!PRELAUNCH && (
              <StoreCta
                className={`lp-btn lp-btn-small lp-header-cta${heroCtaVisible ? ' is-hidden' : ''}`}
                loc="header"
                tabIndex={heroCtaVisible ? -1 : undefined}
                hidden={heroCtaVisible}
              >
                {CTA_LABEL}
              </StoreCta>
            )}
            {/* 「ログイン」は置かない（2026-10-11 オーナー「アプリでしか使わない想定なので、App Store へ流すボタンに」）。
                管理者は /?auth=signin を直接開く。右上は「無料プランで始める」1 つ（広い画面・ヒーローのボタンが外れてから）。 */}
          </nav>
        </div>
      </header>

      {/* 下の固定の帯（公開前の形では出さない・2026-10-05） */}
      {!PRELAUNCH && (
        <div className={`lp-sticky${showSticky ? ' is-visible' : ''}`} aria-hidden={showSticky ? undefined : 'true'}>
          <StoreCta className="lp-btn" loc="sticky" tabIndex={showSticky ? undefined : -1}>{CTA_LABEL}</StoreCta>
        </div>
      )}

      <main id="lp-main">
        {/* ============ ① ヒーロー ============ */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-text">
              <p className="lp-eyebrow"><span>AI 読書メモアプリ</span></p>
              <h1 className="lp-h1">
                <span>読んだ本と、</span><span>対話しよう。</span>
              </h1>
              <p className="lp-lead lp-wbr">
                <Phrases>迷ったことを聞くと、AI が本の語り口で、あなたのメモから答えます。本とページを添えて、明日の一歩まで。</Phrases>
              </p>
              <div className="lp-cta-block" ref={heroCtaRef}>
                <Entry loc="hero" wl={wl} qr badge launch />
                <div className="lp-hero-links">
                  <a className="lp-textlink" href="#lp-flow" onClick={() => lpTrack('hero_secondary', {})}>
                    <span>15 秒で、対話の流れを見る</span><ChevronDown size="1.1em" aria-hidden="true" />
                  </a>
                  {/* 創業メンバー価格（期間中だけ）: 押すと料金の中の帯へ */}
                  {OFFER.active && (
                    <a className="lp-textlink" href="#lp-offer" onClick={() => lpTrack('offer_badge', {})}>
                      {FOUNDING_NAME}・<span className="lp-nb">{OFFER.endLabel}</span>まで
                    </a>
                  )}
                </div>
              </div>
            </div>
            {heroVariant === 'illust' ? (
              <figure className="lp-hero-shot lp-hero-illust">
                <LpIllust />
              </figure>
            ) : (
            <figure className="lp-hero-shot">
              <div className={`lp-hero-stage${slot3D ? ' is-3d-slot' : ''}${ready3D ? ' is-3d' : ''}`} ref={heroStageRef}>
                <Shot
                  name="hero"
                  eager
                  imgRef={heroImgRef}
                  alt="相談の画面。相談相手を『嫌われる勇気』の 1 冊にして「相手が自分をどう思うかが気になって、意見が言えません」と送ると、「（本の語り口で・AI）」の答え「私の考え方で言えば、他人の課題と自分の課題を分ける」と、「意見を言いにくいのは、どんな会議ですか？」という問いが返っている"
                />
                {want3D && (
                  <Suspense fallback={null}>
                    <Hero3D stageRef={heroStageRef} imgRef={heroImgRef} onReady={on3DReady} onLost={on3DLost} />
                  </Suspense>
                )}
              </div>
              {/* 「画面は見本です。」と語り口の注記は LP でここ 1 か所（アプリの答えの最後の一行と同じ考え方・2026-10-11） */}
              <figcaption className="lp-wbr"><Phrases>{`${SAMPLE_NOTE}${VOICE_NOTE}`}</Phrases></figcaption>
            </figure>
            )}
          </div>
        </section>

        {/* ============ ② 受け身から対話へ ============ */}
        <section className="lp-sec lp-flow-sec" aria-labelledby="lp-flow" data-lp-sec="flow">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-flow">
                <span>読んで、</span><span>終わりにしない。</span>
              </h2>
              {/* 一番の価値（CLAUDE.md）を 1 行で・対話の流れの頭に（2026-10-11 ui-critic） */}
              <p className="lp-wbr lp-flow-lead"><Phrases>読むほど、あなただけの相談相手が育つ。</Phrases></p>
              <dl className="lp-ba">
                {BEFORE_AFTER.map((r, i) => (
                  <div key={r.label} className={i === 1 ? 'is-after' : undefined}>
                    <dt>{r.label}</dt>
                    <dd>{r.steps.map((t, k) => <span key={t} className="lp-nb">{k > 0 && <span className="lp-ba-arrow" aria-hidden="true">→</span>}{t}</span>)}</dd>
                  </div>
                ))}
              </dl>
              {/* イメージ図（public/lp/illust-dialogue-*.webp を置いたときだけ・LpArt.jsx）。実際の画面は下の対話の流れに残す */}
              <LpArt name="illust-dialogue" ratio="4:3" className="lp-art-sec" alt="読んで終わりにせず、心に残った一行から本と対話し、明日の一歩につなげる様子のイラスト" />
            </div>
            <LpFlow onEvent={lpTrack} />
            <div className="lp-asks">
              <p className="lp-asks-title">たとえば、こんな相談</p>
              <ul>
                {ASK_EXAMPLES.map((x) => (
                  <li key={x.q}><span className="lp-asks-who">{x.who}</span><span className="lp-wbr"><Phrases>{`「${x.q}」`}</Phrases></span></li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ============ ③ 続けられて、成果が見える（柱 ②〜⑤） ============ */}
        <section className="lp-sec" aria-labelledby="lp-pillars" data-lp-sec="pillars">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-pillars">
                <span>続けられて、</span><span>成果が見える。</span>
              </h2>
            </div>
            <ul className="lp-pillars">
              {PILLARS.map((x) => (
                <li key={x.id} id={`lp-${x.id}`} data-lp-sec={x.id}>
                  <div className="lp-pillar-shot">
                    {/* 柱のイラスト（public/lp/illust-<id>-*.webp・1:1）を置いたら絵に、無ければ今の画面写真 */}
                    <LpArt
                      name={`illust-${x.id}`}
                      ratio="1:1"
                      sizes="(min-width: 768px) 240px, 72vw"
                      alt={x.artAlt}
                      fallback={(
                        <>
                        {x.share ? (
                          <img
                            className="lp-share-img"
                            src="/lp/share-card-540.webp"
                            srcSet="/lp/share-card-540.webp 540w, /lp/share-card-1080.webp 1080w"
                            sizes="(min-width: 768px) 240px, 40vw"
                            width="1080"
                            height="1350"
                            loading="lazy"
                            decoding="async"
                            alt={x.alt}
                          />
                        ) : <Shot name={x.shot} alt={x.alt} className="lp-shot lp-shot-sm" sizes="(min-width: 768px) 240px, 40vw" />}
                        </>
                      )}
                    />
                  </div>
                  <div className="lp-pillar-text">
                    <p className="lp-pillar-head">{x.head}</p>
                    <h3 className="lp-h3 lp-wbr"><Phrases>{x.title}</Phrases></h3>
                    <p className="lp-wbr"><Phrases>{x.body}</Phrases></p>
                  </div>
                </li>
              ))}
            </ul>
            {!shareArt && <p className="lp-shot-note lp-pillars-note">共有の画像は、見本の写真でアプリが作ったものです。</p>}
            {/* 安心の 4 つ（どれも実装と規約で確かめた事実だけ・2026-10-11） */}
            <ul className="lp-trust" aria-label="データの扱い">
              {TRUST_POINTS.map((t) => (
                <li key={t}><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span className="lp-wbr"><Phrases>{t}</Phrases></span></li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ ④ メモがゼロでも、今日から ============ */}
        <section className="lp-sec lp-band" aria-labelledby="lp-start" data-lp-sec="start">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-start">
                <span>メモがゼロでも、</span><span>今日から。</span>
              </h2>
              <LpArt name="illust-start" ratio="4:3" className="lp-art-sec" alt="読んだ本に一言ずつ残したり、ほかのアプリの記録を取り込んだり、本のページを撮ったりして始める様子のイラスト" />
            </div>
            <PointList items={START_POINTS} className="lp-points lp-trio lp-quad" />
            <div className="lp-cta-block">
              <Entry loc="start" wl={wl} />
            </div>
            <p className="lp-fine lp-wbr"><Phrases>ブクログ・読書メーター・Kindle は、各社の商標または登録商標です。</Phrases></p>
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

        {/* ============ ⑤ 料金（無料プランを前に） ============ */}
        <section className="lp-sec lp-pricing" aria-labelledby="lp-pricing" data-lp-sec="pricing">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-pricing">
                {/* 価値の言い換え（2026-10-11 オーナー「¥1,480 を安く感じさせる」）。比べる値段（通常・定価・他社）は書かない。
                    見出しに金額を置かない（月あたりの額を請求額より大きく見せない） */}
                <span>月に</span><span>本{'\u00a0'}1{'\u00a0'}冊ほどの</span><span>値段で、</span><span>読んだ本</span><span>すべてが</span><span>相談相手に。</span>
              </h2>
              <p className="lp-wbr"><Phrases>{`${noBreak(`月額 ${MONTHLY_TEXT}`)}${noBreak('（1 日あたり')}${noBreak(`約 ${PER_DAY_TEXT}）。`)}まずは無料プラン（ずっと無料）から始められます。`}</Phrases></p>
            </div>

            {/* 創業メンバー価格（期間中だけ・料金の中の帯 1 枚）。「先着」「通常価格」と書かない・差額を書かない */}
            {OFFER.active && (
              <div className="lp-offer" id="lp-offer" data-lp-sec="offer">
                <p className="lp-offer-title">{FOUNDING_NAME}<span className="lp-nb">（{OFFER.endLabel}（日本時間）まで）</span></p>
                <p className="lp-wbr"><Phrases>{`${END}までにプランを始めた方は、月額・年額どちらでも創業メンバーです。特典は、開発者への直接の窓口と、次に作る機能への投票。年額プランは、1 年目が ${noBreak(`${OFFER.price}（税込）`)}です。`}</Phrases></p>
                <p className="lp-wbr"><Phrases>{`年額の 1 年目の価格は App Store の初回特典なので、先に月額プランの ${noBreak('7 日間無料')}を使うと、年額の${FOUNDING_NAME}は使えなくなります。人数の上限はありません。`}</Phrases></p>
              </div>
            )}

            {/* 2 枚（無料プラン（ずっと無料）と、プラン）。広い画面では横に並べる */}
            <div className="lp-plan-cards">
              <div className="lp-plan">
                <p className="lp-plan-name">無料プラン</p>
                <p className="lp-plan-price">¥0<span>ずっと無料</span></p>
                <ul className="lp-included" aria-label="無料プランに含まれるもの">
                  {/* li は flex（印と文を横に並べる）なので、文は 1 つの span に包む */}
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>本とメモは何件でも（行動・集中モード・記録・写真で共有・取り込みも）</span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>AI の答えは<span className="lp-nb">毎月 {FREE_CONSULTS}</span><span className="lp-nb">（はじめの月は {FIRST_CONSULTS}）</span></span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>写真から書き起こし <span className="lp-nb">毎月 {FREE_OCR_PER_MONTH} 回</span></span></li>
                </ul>
              </div>
              <div className="lp-plan">
                <p className="lp-plan-name"><span>プラン{TRIAL_FIRST && !OFFER.active && <span className="lp-plan-trial">（{TRIAL_FIRST}）</span>}</span></p>
                {/* プランで手に入るもの（具体的に 4 つ・数は lib/tokenAmounts.js のとおり） */}
                <ul className="lp-included" aria-label="プランに含まれるもの">
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span><span className="lp-nb">AI の答え {PAID_CONSULTS}</span><span className="lp-nb">（毎月 {PAID_TOKENS} トークン）</span></span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>すべての <span className="lp-nb">AI 機能</span>（読書計画シート・<span className="lp-nb">AI 選書・</span>写真から書き起こし・メモの凝縮など）</span></li>
                  {TRIAL_NOTE && (
                    <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>無料期間の間は <span className="lp-nb">{TRIAL_TOKENS} トークン</span><span className="lp-nb">（AI の答え {TRIAL_CONSULTS}）</span></span></li>
                  )}
                </ul>
                <div className={`lp-plan-rows${OFFER.active ? ' is-founding' : ''}`}>
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">年額プラン<span className="lp-plan-tag">{OFFER.active ? FOUNDING_NAME : 'おすすめ'}</span></p>
                    {OFFER.active ? (
                      <>
                        <p className="lp-plan-price">{OFFER.priceLabel}<span>（税込）</span></p>
                        {/* 条件は金額のすぐ下に（誰の・いつの価格か）。その次の行に 2 年目からの自動更新 */}
                        <p className="lp-plan-cond lp-wbr"><Phrases>{`${noBreak(OFFER.endLabel)}までに始めた方の ${noBreak('1 年目')}。始めるときに ${noBreak('1 年分')}をまとめてお支払い（同じ Apple ID で初回特典を使っていない方）`}</Phrases></p>
                        <p className="lp-plan-sub"><span className="lp-nb">2 年目から</span> <span className="lp-nb">年額 {ANNUAL_TEXT}（税込）</span>で自動更新</p>
                      </>
                    ) : (
                      <>
                        <p className="lp-plan-price">{ANNUAL_TEXT}<span>/ 年（税込）</span></p>
                        <p className="lp-plan-sub"><span className="lp-nb">1 年分を前払い。</span><span className="lp-nb">1 日あたり約 {ANNUAL_PER_DAY_TEXT}。</span>{SAVE && <span className="lp-nb">{SAVE}。</span>}</p>
                      </>
                    )}
                  </div>
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">月額プラン</p>
                    <p className="lp-plan-price">{MONTHLY_TEXT}<span>/ 月（税込）</span></p>
                    <p className="lp-plan-sub"><span className="lp-nb">1 日あたり約 {PER_DAY_TEXT}。</span>{OFFER.active && TRIAL_FIRST && <span className="lp-nb">{TRIAL_FIRST}。</span>}</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="lp-fine lp-wbr">
              <Phrases>{`回数は目安です（${CONSULT_ANSWERS_NOTE}）。使わなかったトークンは翌月に繰り越しません。関係するメモが見つからなかった相談は、トークンを戻します（${noBreak(`毎月 ${NO_INFO_REFUNDS} 回`)}まで）。`}</Phrases>
            </p>
            <div className="lp-cta-block">
              <Entry loc="pricing" wl={wl} />
              <p className="lp-cta-note lp-wbr">
                <Phrases>{COPY.pricingNote[0]}</Phrases>
                <br />
                <Phrases>{COPY.pricingNote[1]}</Phrases>
              </p>
            </div>
          </div>
        </section>

        {/* ============ ⑥ よくある質問 ============ */}
        <section className="lp-sec lp-faq" aria-labelledby="lp-faq" data-lp-sec="faq">
          <div className="lp-wrap lp-narrow">
            <h2 className="lp-h2" id="lp-faq">よくある質問</h2>
            <div className="lp-faq-list">
              {COPY.faq.map((f, i) => (
                <details className="lp-faq-item" key={f.q} onToggle={(e) => { if (e.currentTarget.open) lpTrack('faq_open', { i, q: f.q.slice(0, 40) }); }}>
                  <summary>
                    <span className="lp-wbr"><Phrases>{f.q}</Phrases></span>
                    <ChevronDown size="1.25em" aria-hidden="true" className="lp-faq-mark" />
                  </summary>
                  {/* 答えも文節で折り返す（iOS の Safari で語の途中で割れない） */}
                  <p className="lp-wbr">
                    <Phrases>{f.a}</Phrases>
                    {f.link && <> <a className="lp-inline-link" href={f.link.href}>{f.link.label}</a></>}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============ ⑦ 最後の入口 ============ */}
        <section className="lp-final" aria-labelledby="lp-final" data-lp-sec="final">
          <div className={`lp-wrap lp-narrow lp-final-inner${PRELAUNCH ? '' : ' is-live'}`}>
            <h2 className="lp-h2" id="lp-final">
              <span>次の一冊から、</span><span>本と対話しよう。</span>
            </h2>
            <div className="lp-cta-block">
              <Entry loc="final" wl={wl} qr badge launch center />
              <p className="lp-cta-note lp-wbr">{COPY.priceLine.map((t) => <span key={t}><Phrases>{t}</Phrases></span>)}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer" data-build={BUILD_LABEL}>
        <div className="lp-wrap">
          <p className="lp-footer-brand">Orime</p>
          <nav className="lp-footer-links" aria-label="フッター">
            <a href="/legal/terms" onClick={footerLink('terms')}>利用規約</a>
            <a href="/legal/privacy" onClick={footerLink('privacy')}>プライバシーポリシー</a>
            <a href="/legal/sct" onClick={footerLink('sct')}>特定商取引法に基づく表記</a>
            <a href={`mailto:${SUPPORT_EMAIL}`} onClick={footerLink('mail')}>お問い合わせ</a>
          </nav>
          <p className="lp-footer-copy">© 2026 Orime</p>
          {/* 🏷️ ビルド識別子。訪問者には見せない（URL に ?rev を付けたときだけ・フッターの data-build でも確認できる） */}
          {SHOW_BUILD && <p className="lp-footer-build">{BUILD_LABEL}</p>}
        </div>
      </footer>
    </div>
  );
}
