// 🌱 Landing Page — Orime（2026-10-02 作り直し → 2026-10-05 マーケティングの 4 つの報告で作り直し）
//
// 一番の価値（CLAUDE.md）: 読むほど、自分だけの相談相手が育つ。見出しはストア・OGP と同じ
// 「読んだ本が、あなたの相談相手になる。」。勝ちどころ（市場の報告）: 要約ではなく、あなたのメモから。
// 書き写さなくていい（撮る・取り込む）。答えは明日の一歩まで。
// 相手: 30〜40 代で、ビジネス書を月 2〜4 冊読み、「あの本に書いてあったはずなのに」と感じている人。
//
// 流れ（2026-10-05）:
//   ① ヒーロー（上の 1 行「あの本に、書いてあったはずなのに。」→ 見出し → 補足（本とページ・明日の一歩）→ 入口
//      → 「取り込めば初日から相談できます」→ 文字ボタン「15 秒で、相談の流れを見る」）
//   ② 悩みから、明日の一歩まで（実画面 4 枚・LpFlow.jsx）
//   ③ ChatGPT に聞くのと、何が違う？（Orime ならしなくていいこと 4 つ・3 列の比較表は外した）
//   ④ 決めた一歩は、やり切るまで（行動）
//   ⑤ 読むほど、あなただけの相談相手が育つ（一番の価値）
//   ⑥ メモがゼロでも、初日から（取り込む・一言ずつ・撮る）＋入口
//   ⑦ 読んだ本を、写真で共有（短く）
//   ⑧ メモは、AI の学習に使われません（送るもの・送り先・4 つの約束）
//   ⑨ 料金「まずは、無料プランで。」（創業メンバー価格は期間中だけ、この中の帯 1 枚）＋入口
//   ⑩ よくある質問 → ⑪ 最後の入口。利用者の声は実在の声が届くまで出さない（TESTIMONIALS が空なら節ごと出ない）
//
// 入口（2026-10-05）: App Store の URL（VITE_APP_STORE_URL）があれば「無料プランで始める」（App Store・予約注文の
//   ページでもそのまま動く）。無い間は、押せないボタンを並べず「公開の日にメールで知らせる」（LpWaitlist.jsx）と
//   公開予定の 1 行（VITE_LAUNCH_LABEL・既定「2026 年 11 月」）。下の固定の帯とヘッダーのボタンは公開後だけ。
//
// 創業メンバー価格（lib/foundingOffer.js）: VITE_FOUNDING_OFFER=on かつ VITE_FOUNDING_OFFER_END（日本時間）の前だけ、
//   ヒーローの小さな印・料金の中の帯・年額の行・FAQ を出す。終わる日を過ぎると自動で消える。「先着」「通常価格」を
//   書かない・¥9,800 と ¥12,800 の差を書かない（二重価格にしない）。期間中、7 日間無料は月額だけ。
//
// 条件で変わる文（料金の注記・FAQ）は lpCopy.js（テストあり）。見た目はアプリと同じトークン（landing.css）。
// 端末名（iPhone）は打ち出さない（Android も出す予定）。架空の数字・声・効果の言い切りは書かない。
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
import { FREE_TOKENS, PAID_TOKENS, TRIAL_TOKENS, FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { normalizeTrialLabel } from '../lib/trialLabel';
import { readFoundingOffer, noBreak, FOUNDING_NAME } from '../lib/foundingOffer';
import Shot from './LpShot';
import LpFlow from './LpFlow';
import LpWaitlist from './LpWaitlist';
import Phrases from './LpPhrases';
import { buildLpCopy, MONTHLY, ANNUAL, NO_INFO_REFUNDS, DEFAULT_LAUNCH_LABEL, LP_TITLE, LP_DESCRIPTION, LP_OG_DESCRIPTION } from './lpCopy';
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
// 公開予定（App Store の URL が無い間だけ出す）。
const LAUNCH_LABEL = (import.meta.env.VITE_LAUNCH_LABEL || DEFAULT_LAUNCH_LABEL).trim();
// 📛 Apple 公式の「App Store からダウンロード」バッジ（任意）。Apple のマーケティングのページから日本語版の SVG を
// そのまま（色・形を変えずに）public/lp/ に置き、その場所を VITE_APP_STORE_BADGE に入れたときだけ、公開後の
// ヒーローと最後のボタンの横に出す（高さ 40 以上・周りに高さの 1/4 の余白・Apple のガイドライン）。
const BADGE_SRC = (import.meta.env.VITE_APP_STORE_BADGE || '').trim();
const COPY = buildLpCopy({ offer: OFFER, trialNote: TRIAL_NOTE, appLive: isAppStoreLive, jev: AI_JEV_ON, launchLabel: LAUNCH_LABEL });
const { MONTHLY_TEXT, ANNUAL_TEXT, PER_MONTH_TEXT, SAVE, TRIAL_FIRST, TRIAL_CONSULTS, FREE_CONSULTS, PAID_CONSULTS, END } = COPY;
const LAUNCH_LINE = `${LAUNCH_LABEL}に、App Store で公開予定です。`;
// ボタンの文言（2026-10-02 オーナー承認）: アプリは無料プラン（ずっと無料）で使える（押すと App Store）。
const CTA_LABEL = '無料プランで始める';

// 🗣 お客様の声。実在ユーザーの許可を得た本物の声だけを入れる（捏造・盛りは絶対 NG・本物が届くまで出さない）。
// 形式: { quote, who: '30代・営業', how: '部下との 1on1 の前に相談している' }。空なら節ごと出ない。
const TESTIMONIALS = [];

// ③ ChatGPT に聞くのと、何が違う？（「ChatGPT にできないこと」ではなく「Orime ならしなくていいこと」・事実だけ）
const VS_POINTS = [
  { head: '貼り付けなくていい', body: '読みながら残した一行が、そのまま相談の材料になります。相談のたびに、自分の読書を説明し直す必要はありません。' },
  { head: '本とページで確かめられる', body: '答えには、もとになったメモ（書名とページ）が付きます。' },
  { head: '無いときは、無いと伝える', body: `関係するメモが見つからないときは、無理に答えを作らず、そう伝えるようにしています。そのときは、トークンを使ったことにしません（毎月 ${NO_INFO_REFUNDS} 回まで）。` },
  { head: '聞き返してから、一歩を決める', body: '最初から行動を決めつけず、あなたの状況を聞いてから、明日やることを一緒に一つ決めます。' },
];

// ⑤ 読むほど、あなただけの相談相手が育つ（「良くなる」「賢くなる」と言い切らない）
const GROW_POINTS = [
  { head: '一行で残す', body: '読みながら、心が動いた一行だけ。紙の本は、ページを撮れば文字に書き起こせます。' },
  { head: '本と本がつながる', body: 'メモを残すと、別の本で似たことを書いたメモを見せます。1 冊では気づかなかったことが、つながりから見えてくることもあります。' },
  { head: '頭にも残す', body: '忘れかけたメモが、思い出しカードでもう一度めぐってきます。通知は多くても週に 1 回です。' },
];

// ⑥ メモがゼロでも、初日から（初日の 3 つの道・SPEC §1-1d）
const START_POINTS = [
  { head: 'ほかのアプリから取り込む', body: 'ブクログ・読書メーター・Kindle に残したレビュー・感想・ハイライトを、ファイルを選ぶだけで。ファイルの読み取りは端末の中で行い、AI には送りません。' },
  { head: '読んだ本に、一言ずつ', body: '覚えている一行を書くだけ。うろ覚えで大丈夫です。' },
  { head: '本のページを撮る', body: `撮ったページを文字に書き起こして、メモにします（無料プランは毎月 ${FREE_OCR_PER_MONTH} 回）。` },
];

// ⑧ データの約束。すべて実装・規約で裏付けのある事実だけ（AI の正しさを保証しない・持ち出しと消去を言い過ぎない）。
const PRIVACY_POINTS = [
  { head: 'AI に送る前に、確かめます', body: 'はじめて AI を使うとき、送る内容と送り先を見てから使えます。設定のプライバシーから、いつでも取り消せます。' },
  { head: '根拠のメモを、いつも添えます', body: '答えには、もとになったメモ（本とページ）が付きます。AI の答えは間違えることもあるので、根拠のメモとあわせて確かめてください。' },
  { head: 'メモは、あなたのもの', body: '本・メモ・行動・相談の記録は、設定からいつでも CSV でダウンロードできます（写真そのものは含みません）。退会のお申し込みを受けて、法令で保管が必要なものを除き、データを消去します。解約しても、メモは残ります。' },
  { head: '急かさない', body: '思い出しの通知は多くても週に 1 回。行動は期限の日の朝に 1 回だけ。バッジや連続日数で急かす仕組みは入れていません。' },
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

// 📱 App Store へ（公開後だけ）。loc = 押した場所（header / sticky / hero / start / pricing / final）。
function StoreCta({ className, children, tabIndex, hidden = false, loc = 'other' }) {
  return (
    <a href={storeUrlFor(loc)} className={className} tabIndex={tabIndex} aria-hidden={hidden || undefined} onClick={() => lpTrack('cta_click', { loc })}>
      {children}
    </a>
  );
}

// 📷 PC で見ている人向けの QR コード（スマホのカメラで読んで App Store へ）。広い画面だけ（CSS で出し分け）。
function StoreQr() {
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
      {/* 読み取りやすいよう、明暗どちらでも白地に黒（QR の色だけはトークンにしない） */}
      <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} width="88" height="88" role="img" aria-label="App Store のページを開く QR コード" shapeRendering="crispEdges">
        <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
        <path d={cells.join('')} fill="#000" />
      </svg>
      <p>スマホのカメラで<br />読み取って入手</p>
    </div>
  );
}

// 入口: 公開後は「無料プランで始める」（＋QR・公式バッジ）、公開前は「公開の日にメールで知らせる」。
function Entry({ loc, wl, qr = false, badge = false, launch = false, center = false }) {
  if (!isAppStoreLive) {
    return <LpWaitlist loc={loc} done={wl.done} onDone={wl.markDone} launch={launch ? LAUNCH_LINE : ''} center={center} />;
  }
  return (
    <div className="lp-cta-row">
      <StoreCta className="lp-btn lp-btn-large" loc={loc}>{CTA_LABEL}</StoreCta>
      {badge && BADGE_SRC && (
        <a className="lp-badge" href={storeUrlFor(`${loc}_badge`)} onClick={() => lpTrack('cta_click', { loc: `${loc}_badge` })}>
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
        description: '読んだ本が、あなたの相談相手になる読書メモアプリ。あなたが残した読書メモから、本とページを添えて答え、明日やることを一緒に一つ決めて行動リストに入れられる。',
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
    lpTrack('lp_view', { offer: OFFER.active, live: isAppStoreLive });
    const depthSent = new Set();
    // 下部の固定ボタン（公開後・スマホのみ）は、ヒーローのボタンが画面から外れたときだけ出す。
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 100;
      [25, 50, 75, 100].forEach((d) => {
        if (pct >= d - 1 && !depthSent.has(d)) { depthSent.add(d); lpTrack('scroll_depth', { pct: d }); }
      });
      if (!isAppStoreLive) return;
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
            {isAppStoreLive && (
              <StoreCta
                className={`lp-btn lp-btn-small lp-header-cta${heroCtaVisible ? ' is-hidden' : ''}`}
                loc="header"
                tabIndex={heroCtaVisible ? -1 : undefined}
                hidden={heroCtaVisible}
              >
                {CTA_LABEL}
              </StoreCta>
            )}
            {/* ログインはいつも右端（ボタンはその左で出入りする＝出入りしてもログインは動かない） */}
            <a href="/?auth=signin" className="lp-header-login" onClick={() => lpTrack('login_click', {})}>ログイン</a>
          </nav>
        </div>
      </header>

      {/* 下の固定の帯は公開後だけ（公開前に押せない帯を出し続けない・2026-10-05） */}
      {isAppStoreLive && (
        <div className={`lp-sticky${showSticky ? ' is-visible' : ''}`} aria-hidden={showSticky ? undefined : 'true'}>
          <StoreCta className="lp-btn" loc="sticky" tabIndex={showSticky ? undefined : -1}>{CTA_LABEL}</StoreCta>
        </div>
      )}

      <main id="lp-main">
        {/* ============ ① ヒーロー ============ */}
        <section className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-text">
              <p className="lp-eyebrow"><span>あの本に、</span><span>書いてあったはずなのに。</span></p>
              <h1 className="lp-h1">
                <span>読んだ本が、</span><span>あなたの</span><span>相談相手になる。</span>
              </h1>
              <p className="lp-lead lp-wbr">
                <Phrases>困ったことを書くと、あなたが前に残した読書メモから答えます。どの本の、何ページのメモかも一緒に。最後に、明日やることを一つ決めます。</Phrases>
              </p>
              <div className="lp-cta-block" ref={heroCtaRef}>
                <Entry loc="hero" wl={wl} qr badge launch />
                <p className="lp-cta-sub lp-wbr">
                  <Phrases>ブクログ・読書メーター・Kindle の記録を取り込めば、初日から相談できます。</Phrases>
                </p>
                <div className="lp-hero-links">
                  <a className="lp-textlink" href="#lp-flow" onClick={() => lpTrack('hero_secondary', {})}>
                    <span>15 秒で、相談の流れを見る</span><ChevronDown size="1.1em" aria-hidden="true" />
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
            <figure className="lp-hero-shot">
              <div className={`lp-hero-stage${slot3D ? ' is-3d-slot' : ''}${ready3D ? ' is-3d' : ''}`} ref={heroStageRef}>
                <Shot
                  name="answer"
                  eager
                  imgRef={heroImgRef}
                  alt="相談の画面。「部下が報告をくれなくて困っています」という相談に、2 冊の本と自分の学びのメモを根拠にした答えと、「報告が遅れるのは、どんな場面が多いですか？」という問いが返っている"
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
              <p className="lp-wbr"><Phrases>困ったことを書くと、前に読んで残したメモの一節を根拠に答えます。状況を一つ聞き返してから、明日やることを一緒に一つ決めます。</Phrases></p>
            </div>
            <LpFlow onEvent={lpTrack} />
            <p className="lp-shot-note">画面は、サンプルのメモを入れた実際のアプリです</p>
          </div>
        </section>

        {/* ============ ③ ChatGPT に聞くのと、何が違う？ ============ */}
        <section className="lp-sec" aria-labelledby="lp-vs" data-lp-sec="vs-chatgpt">
          <div className="lp-wrap lp-split">
            <div className="lp-split-head">
              <h2 className="lp-h2" id="lp-vs">
                <span>ChatGPT に</span><span>聞くのと、</span><span>何が違う？</span>
              </h2>
              <p className="lp-wbr"><Phrases>ChatGPT は、広い知識から何でも答えてくれます。要約のサービスは、ほかの人がまとめた本の要点を届けてくれます。Orime が答えるのは、あなたが読んで、書き残したことからです。</Phrases></p>
              <p className="lp-wbr"><Phrases>自分が前に読んで納得した言葉なら、明日やってみようと思える。Orime は、そう考えて作っています。</Phrases></p>
            </div>
            <div>
              <PointList items={VS_POINTS} check />
              <p className="lp-fine">ChatGPT は、OpenAI の商標です。比べているのは主な使い方の違いです（2026 年 10 月時点）。各サービスの機能は、設定やプランで異なります。</p>
            </div>
          </div>
        </section>

        {/* ============ ④ 決めた一歩は、やり切るまで（行動） ============ */}
        <section className="lp-sec lp-band" aria-labelledby="lp-action" data-lp-sec="action">
          <div className="lp-wrap lp-media">
            <div className="lp-media-text">
              <h2 className="lp-h2" id="lp-action">
                <span>決めた一歩は、</span><span>やり切るまで。</span>
              </h2>
              <p className="lp-wbr"><Phrases>相談で決めた一歩は、ボタン一つで行動リストへ。期限の日の朝に一度だけお知らせします。終わったら「やってみて、どうでしたか？」と振り返れて、その記録も次の相談の材料になります。</Phrases></p>
            </div>
            <figure className="lp-media-shot">
              <Shot name="action" alt="振り返りの行動の画面。今週の期限と完了の数、期限ごとに分かれた行動の一覧" />
              <figcaption>画面は、サンプルのメモを入れた実際のアプリです</figcaption>
            </figure>
          </div>
        </section>

        {/* ============ ⑤ 読むほど、育つ（一番の価値） ============ */}
        <section className="lp-sec" aria-labelledby="lp-grow" data-lp-sec="grow">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-grow">
                <span>読むほど、</span><span>あなただけの</span><span>相談相手が育つ。</span>
              </h2>
              <p className="lp-wbr"><Phrases>答えの材料は、あなたが残したメモです。一行ずつ増えるほど、答えはあなたの仕事と悩みに近づいていきます。</Phrases></p>
            </div>
            <PointList items={GROW_POINTS} className="lp-points lp-trio" />
          </div>
        </section>

        {/* ============ ⑥ メモがゼロでも、初日から ============ */}
        <section className="lp-sec lp-band" aria-labelledby="lp-start" data-lp-sec="start">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-start">
                <span>メモがゼロでも、</span><span>初日から。</span>
              </h2>
              <p className="lp-wbr"><Phrases>これまでの読書も、相談の材料になります。始め方は 3 つ。どの道も、終えたら最初の相談の文を用意しておきます。送るかどうかは、あなたが決めます。</Phrases></p>
            </div>
            <PointList items={START_POINTS} className="lp-points lp-trio" />
            <div className="lp-cta-block">
              <Entry loc="start" wl={wl} />
            </div>
            <p className="lp-fine">ブクログ・読書メーター・Kindle は、各社の商標または登録商標です。</p>
          </div>
        </section>

        {/* ============ ⑦ 写真で共有の見本 ============ */}
        <section className="lp-sec" aria-labelledby="lp-share" data-lp-sec="share">
          <div className="lp-wrap lp-media">
            <div className="lp-media-text">
              <h2 className="lp-h2" id="lp-share">
                <span>読んだ本を、</span><span>写真で共有。</span>
              </h2>
              <p className="lp-wbr"><Phrases>撮った写真に、書名と日付・メモの数・いちばん新しい一文が重なります。写真は端末の中で描き、どこにも送りません。無料プランで使えます。</Phrases></p>
            </div>
            <figure className="lp-media-shot lp-reveal">
              <img
                className="lp-share-img"
                src="/lp/share-card-1080.webp"
                srcSet="/lp/share-card-540.webp 540w, /lp/share-card-1080.webp 1080w"
                sizes="(min-width: 768px) 340px, 80vw"
                width="1080"
                height="1350"
                loading="lazy"
                decoding="async"
                alt="共有の画像の見本。朝の机の写真に「チームの勝利が最優先。個人の手柄より、チームが勝つための判断をする。」という一文、読書中の本の書名、読みはじめの日、メモの数、Orime のロゴが重なっている"
              />
              <figcaption>見本の写真とサンプルのメモで、アプリが作った画像です</figcaption>
            </figure>
          </div>
        </section>

        {/* ============ ⑧ AI の学習に使われません ============ */}
        <section className="lp-sec lp-band" aria-labelledby="lp-privacy" data-lp-sec="privacy">
          <div className="lp-wrap lp-split">
            <div className="lp-split-head">
              <h2 className="lp-h2" id="lp-privacy">
                <span>メモは、</span><span>AI の学習に</span><span>使われません。</span>
              </h2>
              <p className="lp-wbr"><Phrases>{COPY.privacyLead}</Phrases></p>
            </div>
            <PointList items={PRIVACY_POINTS} check />
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

        {/* ============ ⑨ 料金（無料プランを前に） ============ */}
        <section className="lp-sec lp-pricing" aria-labelledby="lp-pricing" data-lp-sec="pricing">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-pricing">
                {/* 見出しに金額を置かない（月あたりの額を請求額より大きく見せない） */}
                <span>まずは、</span><span>無料プランで。</span>
              </h2>
              <p className="lp-wbr"><Phrases>{`本とメモは、ずっと無料です。相談も、無料プランで毎月 約 ${FREE_CONSULTS} 回まで AI が答えます。`}</Phrases></p>
            </div>

            {/* 創業メンバー価格（期間中だけ・料金の中の帯 1 枚）。「先着」「通常価格」と書かない・差額を書かない */}
            {OFFER.active && (
              <div className="lp-offer" id="lp-offer" data-lp-sec="offer">
                <p className="lp-offer-title">{FOUNDING_NAME}<span className="lp-nb">（{OFFER.endLabel}（日本時間）まで）</span></p>
                <p className="lp-wbr"><Phrases>{`${END}までにプランを始めた方は、月額・年額どちらでも創業メンバーです。特典は、開発者への直接の窓口と、次に作る機能への投票。年額プランは、1 年目が ${OFFER.price}（税込）です。`}</Phrases></p>
                <p className="lp-wbr"><Phrases>{`年額の 1 年目の価格は App Store の初回特典なので、先に月額プランの ${noBreak('7 日間無料')}を使うと、年額の${FOUNDING_NAME}は使えなくなります。人数の上限はありません。`}</Phrases></p>
                <p className="lp-wbr lp-offer-note"><Phrases>Orime は、阿部文哉がひとりで作っています。最初に使ってくださる方の声で、次の形を決めたいと思っています。</Phrases></p>
              </div>
            )}

            {/* 2 枚（無料プラン（ずっと無料）と、プラン）。広い画面では横に並べる */}
            <div className="lp-plan-cards">
              <div className="lp-plan">
                <p className="lp-plan-name">無料プラン</p>
                <p className="lp-plan-price">¥0<span>ずっと無料</span></p>
                <ul className="lp-included" aria-label="無料プランに含まれるもの">
                  {/* li は flex（印と文を横に並べる）なので、文は 1 つの span に包む */}
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>本とメモは何件でも（振り返り・行動・思い出しカード・写真で共有も）</span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>ブクログ・読書メーター・Kindle から取り込み</span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>相談は<span className="lp-nb">毎月 約 {FREE_CONSULTS} 回</span><span className="lp-nb">（{FREE_TOKENS} トークン）</span></span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>使い切った月も、<strong>メモが答える相談</strong>（AI を使わずに、あなたのメモから関係する一節を本ごとに並べます）</span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>写真から書き起こし <span className="lp-nb">毎月 {FREE_OCR_PER_MONTH} 回</span></span></li>
                </ul>
              </div>
              <div className="lp-plan">
                <p className="lp-plan-name"><span>プラン{TRIAL_FIRST && !OFFER.active && <span className="lp-plan-trial">（{TRIAL_FIRST}）</span>}</span></p>
                <ul className="lp-included" aria-label="プランに含まれるもの">
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>相談は<span className="lp-nb">毎月 約 {PAID_CONSULTS} 回</span><span className="lp-nb">（{PAID_TOKENS} トークン）。</span>足りない月は、有料で追加できます</span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>AI 選書・読書計画シート・メモの凝縮</span></li>
                  {TRIAL_NOTE && (
                    <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>無料期間の間は <span className="lp-nb">{TRIAL_TOKENS} トークン</span><span className="lp-nb">（相談 約 {TRIAL_CONSULTS} 回）</span></span></li>
                  )}
                </ul>
                <div className="lp-plan-rows">
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">年額プラン<span className="lp-plan-tag">{OFFER.active ? FOUNDING_NAME : 'おすすめ'}</span></p>
                    {OFFER.active ? (
                      <>
                        <p className="lp-plan-price">{OFFER.priceLabel}<span>（税込）</span></p>
                        {/* 条件は金額のすぐ下に（誰の・いつの価格か）。その次の行に 2 年目からの自動更新 */}
                        <p className="lp-plan-cond"><span className="lp-nb">{OFFER.endLabel}</span>までに始めた方の 1 年目。始めるときに 1 年分をまとめてお支払い（同じ Apple ID で初回特典を使っていない方）</p>
                        <p className="lp-plan-sub"><span className="lp-nb">2 年目から</span> <span className="lp-nb">年額 {ANNUAL_TEXT}（税込）</span>で自動更新</p>
                      </>
                    ) : (
                      <>
                        <p className="lp-plan-price">{ANNUAL_TEXT}<span>/ 年（税込）</span></p>
                        <p className="lp-plan-sub"><span className="lp-nb">月あたり約 {PER_MONTH_TEXT}。</span>{SAVE && <span className="lp-nb">{SAVE}。</span>}</p>
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
            <p className="lp-fine lp-wbr">
              <Phrases>{`回数は目安です（1 回のトークンは、質問とメモの量で変わります）。使わなかったトークンは翌月に繰り越しません。関係するメモが見つからなかった相談は、トークンを使ったことにしません（毎月 ${NO_INFO_REFUNDS} 回まで）。無料プランに期間の決まりはありません。`}</Phrases>
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

        {/* ============ ⑩ よくある質問 ============ */}
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

        {/* ============ ⑪ 最後の入口 ============ */}
        <section className="lp-final" aria-labelledby="lp-final" data-lp-sec="final">
          <div className="lp-wrap lp-narrow lp-final-inner">
            <h2 className="lp-h2" id="lp-final">
              <span>今日残した一行が、</span><span>一年後のあなたの</span><span>相談に答える。</span>
            </h2>
            <div className="lp-cta-block">
              <Entry loc="final" wl={wl} qr badge launch center />
              <p className="lp-cta-note">{COPY.priceLine.map((t) => <span key={t}>{t}</span>)}</p>
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
