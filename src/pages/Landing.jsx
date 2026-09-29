// 🌱 Landing Page — Orime（2026-09-26 作り直し版）
//
// 目的はひとつ: App Store からダウンロードしてもらうこと（主 CTA は全部同じ行動）。
// 流れ: ヒーロー（一番の価値＝相談の答えの実画面）→ 課題 → 使い方 3 ステップ
// （残す→相談する→行動にする）→ メモを育てる仕組み（思い出しカード・テーマまとめ）
// → 読む前と読み終えた本にも → 記録アプリとの違い → 料金（年額をおすすめ）→ FAQ → 最終 CTA。
//
// 見た目はアプリと同じトークン（src/styles/tokens.css）で書く。色はニュートラル＋
// 栗色のアクセント 1 色（押せるものと最重要の情報だけ）。明暗はアプリと同じく端末に従う。
// 端末名（iPhone）は打ち出さない（将来 Android も出すため・2026-09-26 オーナー指示）。
//
// 誠実さの約束（旧版から継承）:
//   - 架空のユーザー数・お客様の声・効果数値は書かない（声は TESTIMONIALS に実在のものだけ）
//   - 実装されていない機能を約束しない。画面写真はお試しモード（サンプルのメモ）で撮った
//     実際のアプリ（public/lp の WebP。撮り直しは npm run demo → npm run lp:shots）
//   - 無料トライアルは正典（company/launch-plan-appstore-2026-07-27.md）の「月額・年額とも 7 日間無料」を既定で出す。
//     App Store の設定を変えたら VITE_TRIAL_NOTE で文言を変える（'off' で非表示）
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
import { savingsLabel } from '../lib/iap';
import { FREE_TOKENS, PAID_TOKENS } from '../lib/tokenAmounts';
import { normalizeTrialLabel, trialFirstPhrase, trialPeriodOf } from '../lib/trialNudge';
import ConsultDemo from './ConsultDemo';
import qrcode from 'qrcode-generator';
import { lpTrack, lpVariant, storeUrlFor } from '../lib/lpTrack';
import { inject as injectVercelAnalytics } from '@vercel/analytics';
import './landing.css';

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
// loc = 押した場所（header / sticky / hero / demo / pricing / final）。記録と App Store のキャンペーン名に使う。
function StoreCta({ className, children, tabIndex, loc = 'other' }) {
  if (!isAppStoreLive) {
    return <span className={`${className} is-soon`} aria-disabled="true">App Store で近日公開</span>;
  }
  return (
    <a href={storeUrlFor(loc)} className={className} tabIndex={tabIndex} onClick={() => lpTrack('cta_click', { loc })}>
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

// 🎁 プランの無料期間の表記（既定は正典どおり「7 日間無料」）。App Store の Introductory Offer を変えたら
// env（VITE_TRIAL_NOTE）で合わせる（'off' で出さない）。「7日間無料」のような書き方も「7 日間無料」にそろえる。
// 「無料」が 2 つあるので取り違えない書き方にする（2026-09-28・GLOSSARY）:
//   無料プラン（ずっと無料）＝契約なし／最初の 7 日間は無料＝プランの無料期間（1 つの Apple ID に 1 回）。
const TRIAL_RAW = (import.meta.env.VITE_TRIAL_NOTE ?? '7 日間無料').trim();
const TRIAL_NOTE = TRIAL_RAW === 'off' ? '' : normalizeTrialLabel(TRIAL_RAW);
// 「最初の 7 日間は無料」（期間が取り出せない書き方はそのまま）。
const TRIAL_FIRST = TRIAL_NOTE ? trialFirstPhrase(TRIAL_NOTE) : '';
// 文の中の形（「プランは最初の 7 日間が無料で、…」）。
const TRIAL_SENT = TRIAL_NOTE ? (trialPeriodOf(TRIAL_NOTE) ? `最初の ${trialPeriodOf(TRIAL_NOTE)}が無料` : TRIAL_NOTE) : '';
// ボタンの文言: アプリは無料プラン（ずっと無料）で使える（フリーミアム・2026-09-27）ので「無料ではじめる」
// （押すと App Store）。無料期間はプランの話なので、料金の欄とボタンの下の文に書く。
const CTA_LABEL = '無料ではじめる';
const CTA_SHORT = '無料ではじめる';

const MONTHLY = 1480;
const ANNUAL = 12800;
const SAVE = savingsLabel(MONTHLY, ANNUAL);
const PRICE_LINE = TRIAL_NOTE
  ? `App Store から無料でダウンロード。無料プランはずっと無料。プランは${TRIAL_SENT}で、その後は月額 ¥1,480 または年額 ¥12,800（税込）。無料期間中に解約すれば料金はかかりません`
  : 'App Store から無料でダウンロード。無料プランはずっと無料。プランは月額 ¥1,480 または年額 ¥12,800（税込）';

// 🗣 お客様の声。実在ユーザーの許可を得た本物の声だけを入れる（捏造・盛りは絶対 NG）。
// 形式: { quote, who: '30代・営業', how: '部下との 1on1 の前に相談している' }。空なら節ごと出ない。
const TESTIMONIALS = [];

// 記録アプリとの比較（料金の前で「今のアプリで足りる」に答える）。存在しない機能は書かない。
const COMPARE_ROWS = [
  { label: '困ったとき', others: '自分で見返して探す', us: '相談すると、メモから答えが返る' },
  { label: 'メモが増えると', others: '探すのが大変になる', us: '答えの材料が増える' },
  { label: '行動', others: 'アプリの外で管理する', us: ['答えから、', '行動リストへ'] },
  { label: '見返すきっかけ', others: '自分で思い出したとき', us: '忘れかけた頃に、メモが戻ってくる' },
  { label: 'あなたの歩み', others: '記録が並ぶだけ', us: ['読んだ時期・やれた行動・', '前の相談まで踏まえて答える'] },
];

// 作り手の約束（信頼の材料）。すべて実装・規約で裏付けのある事実だけ。作り手の体験談は、
// 本人の言葉が届くまで書かない（架空の声を作らない）。
const PROMISES = [
  { head: 'メモは、あなたのもの', body: '設定からいつでも全部ダウンロードできます。退会を申し込めば、すべて消去します。解約しても、メモは残ります。' },
  { head: 'AI の学習に使わない', body: '相談のために送るメモは、Anthropic 社の API の規約により、AI の再学習に使われません。' },
  { head: '答えを作り話にしない', body: '答えには必ず、もとになったメモが付きます。関係するメモが無いときは、無理に答えずそう伝えます。' },
  { head: '急かさない', body: '思い出しの通知は多くても週に 1 回。行動は期限の日の朝に 1 回だけお知らせします。バッジや連続日数で、使うことを急かす仕組みは入れていません。' },
  { head: '声は、作り手に直接届く', body: `要望や不具合は ${SUPPORT_EMAIL} へ。個人で開発しているので、開発者本人に届きます。` },
];

// FAQ は「申し込みの手前で止まる理由」を書く場所。表示と FAQPage JSON-LD の両方の元。
const FAQ_ITEMS = [
  {
    q: 'メモが少なくても相談できますか？',
    a: 'メモが 1 件からでも相談できます。答えの根拠はあなたのメモだけなので、メモが増えるほど答えは具体的になります。関係するメモが無いときは、無理に答えを作らず、そう伝えます。',
  },
  {
    q: 'これまでに読んだ本も使えますか？',
    a: '使えます。読み終えた本を選んで、覚えている一行を書くだけで、その日から相談の材料になります。ブクログ・読書メーター・Kindle に残した記録（レビュー・感想・ハイライト）も、ファイルを選ぶだけで取り込めます。',
  },
  {
    q: '忙しくて、続けられるか不安です',
    a: '読みながら、心が動いた一行を残すだけで始められます。メモは本文だけで保存でき、ページ番号や写真はあとから足せます。',
  },
  {
    q: 'メモは AI\u00a0の学習に使われますか？',
    a: '使われません。相談などの AI 機能では、メモを Anthropic 社の Claude API に送って答えを作ります。API 経由で送られたデータは、同社の規約で AI の再学習に使われません。詳しくはプライバシーポリシーをご覧ください。',
  },
  {
    q: '料金はいくらですか？',
    a: `無料プラン（ずっと無料）で、メモ・記録・振り返り・シェアが使えます。AI は相談だけ、毎月 ${FREE_TOKENS} トークン（相談 約 3 回）です。プラン（月額 ¥1,480、または年額 ¥12,800・月あたり約 ¥1,066）にすると、相談が毎月 ${PAID_TOKENS} トークン（約 80 回）になり、AI 選書・テーマまとめ・読書計画シート・写真からの書き起こしも使えます。${TRIAL_NOTE ? `プランは${TRIAL_SENT}です（初めての方だけ）。` : ''}お支払いは App Store（Apple ID）です。`,
  },
  ...(TRIAL_NOTE ? [{
    q: '無料期間のあとは、自動で料金がかかりますか？',
    a: `プランの無料期間（${TRIAL_NOTE}）が終わると、選んだプラン（月額か年額）で自動更新されます。無料期間が終わる 24 時間前までに App Store のサブスクリプション設定から解約すれば、料金はかかりません。無料期間は、初めて登録する方が対象です。無料プランは期間の決まりがなく、ずっと無料です。`,
  }] : []),
  {
    q: '解約すると、メモは消えますか？',
    a: '消えません。解約は App Store のサブスクリプション設定からいつでもでき、違約金もありません。解約後もアカウントとメモは残り、再開すればそのまま使えます。',
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

// アプリの実画面（お試しモードで撮影）。暗い画面の端末には暗い画面の写真を出す。
function Shot({ name, alt, eager = false, ratio = [390, 844], imgRef }) {
  const set = (scheme) => `/lp/${name}-${scheme}-390.webp 390w, /lp/${name}-${scheme}-780.webp 780w`;
  const sizes = '(min-width: 768px) 300px, 72vw';
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" type="image/webp" srcSet={set('dark')} sizes={sizes} />
      <img
        ref={imgRef}
        className="lp-shot"
        src={`/lp/${name}-light-780.webp`}
        srcSet={set('light')}
        sizes={sizes}
        width={ratio[0]}
        height={ratio[1]}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchpriority={eager ? 'high' : undefined}
        decoding={eager ? undefined : 'async'}
      />
    </picture>
  );
}

export default function Landing() {
  const heroCtaRef = useRef(null);
  const [showSticky, setShowSticky] = useState(false);
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
    document.title = 'Orime｜読むほど、自分だけの相談相手が育つ読書アプリ';
    const metas = [
      setMeta('description',
        '読みながら残したメモをもとに、困ったときの相談に答えるアプリ。答えには根拠にした本とメモが付き、明日からの一歩は行動リストへ。月額 ¥1,480・年額 ¥12,800、いつでも解約できます。'),
      setMeta('og:title', 'Orime｜読むほど、自分だけの相談相手が育つ読書アプリ', 'property'),
      setMeta('og:description', '読みながら残したメモをもとに、困ったときの相談に答えるアプリ。答えには、根拠にした本とメモが付きます。', 'property'),
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
        description: '読みながら残したメモをもとに、困ったときの相談に答える読書アプリ。答えには根拠にした本とメモが付き、明日からの一歩を行動リストに入れられる。',
        offers: [
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

    // 下部の固定ボタンは、ヒーローのボタンが画面から外れたときだけ出す（スマホのみ・CSS で制御）。
    // 画面写真が画面に入ったら、奥から手前へ起き上がる（ヒーローの 3D とそろえた動き）。
    let revealIo = null;
    if (typeof IntersectionObserver !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const root = document.querySelector('.lp-root');
      root?.classList.add('lp-motion');
      revealIo = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); revealIo.unobserve(e.target); } });
      }, { threshold: 0.2 });
      document.querySelectorAll('.lp-reveal').forEach((el) => revealIo.observe(el));
    }

    // Vercel Web Analytics（閲覧数・参照元・端末。Cookie なし）。LP でだけ読み込み、開発中は出さない。
    if (!import.meta.env.DEV) { try { injectVercelAnalytics({ mode: 'production' }); } catch { /* 無くても LP は動く */ } }
    // 記録: 表示 1 回と、読み進めた深さ（25/50/75/100%）をそれぞれ 1 回ずつ。
    lpTrack('lp_view', {});
    const depthSent = new Set();
    const onScroll = () => {
      const el = heroCtaRef.current;
      // 本文の中の同じボタン（料金・最後）が見えている間は、下の固定ボタンを出さない（同じボタンを 2 つ並べない）。
      const vh = window.innerHeight;
      const inlineCtaVisible = Array.from(document.querySelectorAll('.lp-btn')).some((b) => {
        if (b.closest('.lp-sticky, .lp-header') || el?.contains(b)) return false;
        const r = b.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh;
      });
      setShowSticky(!inlineCtaVisible && (el ? el.getBoundingClientRect().bottom < 0 : window.scrollY > 480));
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
            <StoreCta className="lp-btn lp-btn-small lp-header-cta" loc="header">{CTA_SHORT}</StoreCta>
          </nav>
        </div>
      </header>

      <div className={`lp-sticky${showSticky ? ' is-visible' : ''}`} aria-hidden={showSticky ? undefined : 'true'}>
        <StoreCta className="lp-btn" loc="sticky" tabIndex={showSticky ? undefined : -1}>{CTA_LABEL}</StoreCta>
      </div>

      <main id="lp-main">
        {/* ============ ヒーロー ============ */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-text">
              <h1 className="lp-h1">
                <span>読むほど、</span><span>自分だけの</span><span>相談相手が育つ。</span>
              </h1>
              <p className="lp-lead">
                困っていることを書くと、あなたが読んで残したメモと、これまでの歩みを踏まえて答えが返ってくるアプリです。答えには、根拠にした本とページが付きます。
              </p>
              <div className="lp-cta-block" ref={heroCtaRef}>
                <div className="lp-cta-row">
                  <StoreCta className="lp-btn lp-btn-large" loc="hero">{CTA_LABEL}</StoreCta>
                  <StoreQr />
                </div>
                {/* 料金の説明はヒーローに置かない（スマホの最初の画面に答えの画面写真を入れるため）。
                    料金・無料期間・自動更新は下の「料金」と最後のボタンの下に書く。 */}
              </div>
            </div>
            <figure className="lp-hero-shot">
              <div className={`lp-hero-stage${ready3D ? ' is-3d' : ''}`} ref={heroStageRef}>
                <Shot
                  name="answer"
                  eager
                  imgRef={heroImgRef}
                  alt="相談の画面。「部下が報告をくれなくて困っています」という相談に、『イシューからはじめよ』と『1兆ドルコーチ』のメモを根拠にした答えと、明日からできる一歩が返っている"
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

        {/* ============ 課題 ============ */}
        <section className="lp-sec lp-problem" aria-labelledby="lp-problem">
          <div className="lp-wrap lp-narrow">
            <h2 className="lp-h2" id="lp-problem">
              <span>前に読んだ本に、</span><span>答えがあったはずなのに。</span>
            </h2>
            <p>
              {/* 句の切れ目で改行（「出てこない。」が行をまたがないように） */}
              部下が報告をくれない。<br />
              企画がなかなか通らない。<br />
              そんなとき「あの本に何か書いてあった」と<br />
              思い出しても、中身までは出てこない。
            </p>
            <p>
              本の内容は、読み終えた日から少しずつ抜けていきます。足りないのは記憶力より、読んだことを困ったときに引き出す仕組みです。
            </p>
            <p className="lp-turn"><span>Orime は、その仕組みを</span><span>「相談相手」というかたちにしました。</span></p>
          </div>
        </section>

        {/* ============ 体験: 試しに、相談してみる ============ */}
        <section className="lp-sec lp-try" aria-labelledby="lp-try">
          <div className="lp-wrap">
            <h2 className="lp-h2" id="lp-try">
              <span>試しに、</span><span>相談してみる。</span>
            </h2>
            <ConsultDemo
              onEvent={lpTrack}
              cta={(
                <>
                  <p className="lp-demo-cta-lead">自分の本とメモで、相談してみませんか。</p>
                  <StoreCta className="lp-btn" loc="demo">{CTA_LABEL}</StoreCta>
                </>
              )}
            />
          </div>
        </section>

        {/* ============ 使い方（本当の手順なので番号を振る） ============ */}
        <section className="lp-sec lp-steps" aria-labelledby="lp-steps">
          <div className="lp-wrap">
            <h2 className="lp-h2" id="lp-steps">
              <span>残す。</span><span>相談する。</span><span>やってみる。</span>
            </h2>
            <ol className="lp-step-list">
              <li className="lp-step">
                <div className="lp-step-text">
                  <p className="lp-step-num" aria-hidden="true">1</p>
                  <h3 className="lp-h3">読みながら、一行だけ残す</h3>
                  <p>心が動いた一行を、その場でメモします。本文だけで保存でき、ページ番号や写真はあとから足せます。ページを撮影すれば、AI が文字に起こします。</p>
                </div>
                <div className="lp-step-shot lp-reveal">
                  <Shot name="memo" ratio={[390, 421]} alt="メモを書く画面。『1兆ドルコーチ』に「部下の話は、結論を急がずに最後まで聞く。」と入力している" />
                </div>
              </li>
              <li className="lp-step lp-step-flip">
                <div className="lp-step-text">
                  <p className="lp-step-num" aria-hidden="true">2</p>
                  <h3 className="lp-h3">困ったら、相談する</h3>
                  <p>悩みを書いて送ると、これまでのメモを根拠に答えが返ってきます。何冊ぶんのメモでもつなげて考え、使った本とページは一覧で確かめられます。</p>
                  <p>いつ何を読んだか、決めた行動をどこまでやれたか、前にどんな相談をしたかも踏まえて答えます。相談する本を、1 冊や数冊に絞ることもできます。</p>
                </div>
                <div className="lp-step-shot lp-reveal">
                  <Shot name="sources" alt="相談の答えの下に「もとになった本」として『イシューからはじめよ』『1兆ドルコーチ』p.95『数値化の鬼』が並ぶ画面" />
                </div>
              </li>
              <li className="lp-step">
                <div className="lp-step-text">
                  <p className="lp-step-num" aria-hidden="true">3</p>
                  <h3 className="lp-h3">答えを、今週やることに</h3>
                  <p>答えに付く「明日からできる一歩」は、ボタン 1 つで行動リストに入ります。期限を過ぎたもの・今日・今週の順に並ぶので、やることを見失いません。</p>
                </div>
                <div className="lp-step-shot lp-reveal">
                  <Shot name="action" alt="行動の画面。本から生まれた行動が、今週と来週以降に分かれて期限つきで並ぶ" />
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* ============ メモを育てる仕組み ============ */}
        <section className="lp-sec lp-grow" aria-labelledby="lp-grow">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-grow">
                <span>残したメモは、</span><span>しまい込まない。</span>
              </h2>
              <p>相談の答えの材料は、あなたのメモです。だから Orime は、残したメモを眠らせない工夫もしています。</p>
            </div>
            <div className="lp-grow-grid">
              <article className="lp-grow-item">
                <h3 className="lp-h3">思い出しカード</h3>
                <p>忘れかけた頃のメモが、1 枚ずつ戻ってきます。「覚えた」を押すと次は間隔を空け、「もう一度」なら翌日にまた出ます。思い出しの通知は多くても週に 1 回で、オフにもできます。</p>
                <div className="lp-reveal"><Shot name="recall" alt="思い出しカードの画面。5 か月前に『イシューからはじめよ』p.88 に残したメモが表示され、「覚えた」「もう一度」を選べる" /></div>
              </article>
              <article className="lp-grow-item">
                <h3 className="lp-h3">テーマまとめ</h3>
                <p>「マネジメント」などのテーマを選ぶと、何冊ものメモを「核心」「繰り返す原則」「次の一歩」にまとめます。次の一歩は、そのまま行動リストに入れられます。</p>
                <div className="lp-reveal"><Shot name="theme" alt="テーマまとめの画面。マネジメントについて本 3 冊のメモから、核心の一文、繰り返す原則 3 つ、次の一歩がまとめられている" /></div>
              </article>
            </div>
          </div>
        </section>

        {/* ============ 読む前と、読み終えた本にも ============ */}
        <section className="lp-sec lp-more" aria-labelledby="lp-more">
          <div className="lp-wrap lp-more-grid">
            <h2 className="lp-h2" id="lp-more">
              <span>本を選ぶ前から、</span><span>読み終えた本まで。</span>
            </h2>
            <dl className="lp-more-list">
              <div>
                <dt>AI 選書</dt>
                <dd>いまの課題を話すと、AI が質問で深掘りし、合う本を理由つきで挙げます。</dd>
              </div>
              <div>
                <dt>読書計画シート</dt>
                <dd>読む目的を先に書いておくと、重点的に読む章を AI が一緒に絞ります。</dd>
              </div>
              <div>
                <dt>これまで読んだ本から始める</dt>
                <dd>読み終えた本を選び、覚えている一行を書くだけ。登録したその日から相談できます。</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ============ 記録アプリとの違い ============ */}
        <section className="lp-sec lp-compare" aria-labelledby="lp-compare">
          <div className="lp-wrap lp-narrow-wide">
            <h2 className="lp-h2" id="lp-compare">
              <span>記録するアプリとの</span><span>違い</span>
            </h2>
            <p>読んだ本を記録できるアプリは、ほかにもあります。Orime が受け持つのは、その記録を困ったときに使うところです。</p>
            <table className="lp-table">
              <thead>
                <tr>
                  <td />
                  <th scope="col">記録するアプリ</th>
                  <th scope="col" className="is-us">Orime</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{r.others}</td>
                    <td className="is-us">{Array.isArray(r.us) ? r.us.map((t) => <span className="lp-phrase" key={t}>{t}</span>) : r.us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ============ 作り手と約束（信頼） ============ */}
        <section className="lp-sec lp-promise" aria-labelledby="lp-promise">
          <div className="lp-wrap lp-promise-grid">
            <div className="lp-promise-head">
              <h2 className="lp-h2" id="lp-promise">
                <span>Orime は、</span><span>ひとりで作っています。</span>
              </h2>
              <p>
                開発と運営は、阿部文哉（個人）です。読んだ本が、困ったときにちゃんと役に立つように。そのために、次のことを約束して作っています。
              </p>
              <p className="lp-promise-sign">Orime 開発者　阿部文哉</p>
            </div>
            <ol className="lp-promise-list">
              {PROMISES.map((p) => (
                <li key={p.head}>
                  <p className="lp-promise-title">{p.head}</p>
                  <p>{p.body}</p>
                </li>
              ))}
            </ol>
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

        {/* ============ 料金（年額をおすすめ） ============ */}
        <section className="lp-sec lp-pricing" aria-labelledby="lp-pricing">
          <div className="lp-wrap lp-narrow-wide">
            <h2 className="lp-h2" id="lp-pricing">
              {/* 月あたりの額を請求額より大きく見せない（見出しに金額を置かない・2026-09-27） */}
              <span>メモと記録は、</span><span>ずっと無料です。</span>
            </h2>
            {/* 2 枚だけ（2026-09-28）: 無料プラン（ずっと無料）と、プラン（最初の 7 日間は無料）。
                「無料」だけの見出しにしない（7 日間無料と取り違えないように・GLOSSARY）。 */}
            <div className="lp-plan-cards">
              <div className="lp-plan">
                <p className="lp-plan-name">無料プラン</p>
                <p className="lp-plan-price">¥0<span>ずっと無料</span></p>
                {/* 含まれるものは各カードの中に（別の一覧にすると、どちらのプランの話か分かりにくい） */}
                <p className="lp-plan-sub">本とメモは、何件でも登録できます。記録・振り返り・シェアも使え、相談は<span style={{ whiteSpace: 'nowrap' }}>毎月 {FREE_TOKENS} トークン</span>（約 3 回）。</p>
              </div>
              <div className="lp-plan">
                <p className="lp-plan-name"><span>プラン{TRIAL_FIRST && <span className="lp-plan-trial">（{TRIAL_FIRST}）</span>}</span></p>
                <ul className="lp-included" aria-label="プランに含まれるもの">
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" />相談が毎月 {PAID_TOKENS} トークン（約 80 回）。足りない月は追加もできます</li>
                  <li><Check size={16} strokeWidth={2.4} aria-hidden="true" />AI 選書・テーマまとめ・読書計画シート・写真からの書き起こし</li>
                </ul>
                <div className="lp-plan-rows">
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">年額プラン<span className="lp-plan-tag">おすすめ</span></p>
                    <p className="lp-plan-price">¥12,800<span>/ 年（税込）</span></p>
                    <p className="lp-plan-sub">月あたり約 ¥1,066。{SAVE}。</p>
                  </div>
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">月額プラン</p>
                    <p className="lp-plan-price">¥1,480<span>/ 月（税込）</span></p>
                    <p className="lp-plan-sub">1 か月ずつ続けられます。</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="lp-cta-block">
              <StoreCta className="lp-btn lp-btn-large" loc="pricing">{CTA_LABEL}</StoreCta>
              <p className="lp-cta-note">
                アプリは無料でダウンロードできます。
                {TRIAL_NOTE
                  ? `プランは${TRIAL_SENT}で、そのあと選んだプラン（月額 ¥1,480 または年額 ¥12,800・税込）で自動更新されます。無料期間中に解約すれば、料金はかかりません。`
                  : 'プランは、選んだプラン（月額 ¥1,480 または年額 ¥12,800・税込）で自動更新されます。'}
                <br />
                お支払いは App Store（Apple ID）です。解約はいつでもでき、違約金はありません。解約しても無料プランで使え、メモは残ります。
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
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ============ 最終 CTA ============ */}
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
              <p className="lp-cta-note">{PRICE_LINE}。いつでも解約できます。</p>
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
          <p className="lp-footer-op">運営：阿部文哉</p>
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
