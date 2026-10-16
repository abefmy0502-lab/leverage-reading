// 🌱 Landing Page — Orime（2026-10-02 作り直し → 2026-10-05 → 2026-10-11 公開している前提・新しい訴求で作り直し）
//
// 訴求の正は company/marketing-master-plan-2026-10.md（§0）: 読書を、受け身から会話へ。見出しは「読んだ本と、会話しよう。」
//   心に響いた一行から、AI が本の語り口で答える（要約ではなく、あなたのメモから・本とページを添えて）→ 成果へ。
//   「著者と話せる」とは書かない（「本の語り口で答える」「本と会話する」まで）。語り口の注記はヒーローの写真の下の 1 か所。
// 相手: 読書の成果を最大にしたい人・読書を習慣にしたい人・意識の高い社会人・大学生（立場では絞らない）。
//
// 流れ（2026-10-11）:
//   ① ヒーロー（A/B: 'illust'＝いろいろな本と会話するイラスト（LpIllust.jsx）↔ 'photo'＝1 冊の本に相談した答えの画面）
//   ② 受け身から会話へ（これまで／これから の 2 行＋実画面 4 枚の会話の流れ・LpFlow.jsx＋相談の例 3 つ）
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
import { Check, ChevronDown, Menu, X } from 'lucide-react';
import { BUILD_LABEL } from '../lib/buildInfo';
import { SUPPORT_EMAIL } from '../lib/contact';
import { isAppStoreLive } from '../lib/appStore';
import { AI_JEV_ON } from '../lib/aiProcessors';
import { TRIAL_TOKENS, FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { normalizeTrialLabel } from '../lib/trialLabel';
import { readFoundingOffer, noBreak, FOUNDING_NAME } from '../lib/foundingOffer';
import Shot from './LpShot';
import LpFlow from './LpFlow';
import LpWaitlist from './LpWaitlist';
import LpIllust from './LpIllust';
import LpArt, { hasArt } from './LpArt';
import Phrases from './LpPhrases';
import { buildLpCopy, storeHrefOf, CONSULT_ANSWERS_NOTE, MONTHLY, ANNUAL, DEFAULT_LAUNCH_LABEL, LP_TITLE, LP_DESCRIPTION, LP_OG_DESCRIPTION, VOICE_NOTE, SAMPLE_NOTE, ZERO_RISK_NOTE, PROBLEM_LEAD } from './lpCopy';
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
// 料金の欄のボタン（有料のカードのすぐ下・2026-10-12）。押す先は同じ App Store（無料期間はアプリの中で始める）。
const TRIAL_CTA_LABEL = <span className="lp-btn-label"><span className="lp-nb">7 日間無料で</span><wbr /><span className="lp-nb">試す</span></span>;

// 🗣 お客様の声。実在ユーザーの許可を得た本物の声だけを入れる（捏造・盛りは絶対 NG・本物が届くまで出さない）。
// 形式: { quote, who: '30代・営業', how: '部下との 1on1 の前に相談している' }。空なら節ごと出ない。
const TESTIMONIALS = [];

// 🎞 イラストの型のヒーローに重ねる端末: 実際の画面 3 枚（メモ → 相談相手を選ぶ → 本の語り口の答え）を
//   1 回だけ順に切り替えて、最後の答えの画面で止まる（2026-10-12 ui-critic「会話が動いて見える瞬間」）。
//   動きを減らす設定では、最初から答えの画面だけ。画面はどれも npm run lp:shots の実際のアプリ。
const HERO_MINI = [
  { name: 'flow-line', alt: '本の詳細のメモの一覧。今日残した一行' },
  { name: 'flow-talk', alt: '相談相手を選ぶ画面「誰に相談しますか？」' },
  { name: 'hero', alt: '相談の画面。『嫌われる勇気』の 1 冊に相談し、本の語り口で答えが返ってきている' },
];
// 「画面は見本です。」と語り口の注記は LP でここ 1 か所＝ヒーローの画面のすぐ下（イラストの型も重ねた端末で答えを見せるので・2026-10-12）
function HeroNote() {
  // 2026-10-12 オーナー「無駄な補足」: ヒーローは「画面は見本です。…」だけ（語り口の注記は画面の中の「（本の語り口で・AI）」と、最初から開いているよくある質問の 1 問目）。
  return <figcaption className="lp-wbr lp-hero-note"><Phrases>{SAMPLE_NOTE}</Phrases></figcaption>;
}

function HeroMini() {
  const [still] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(window.location.search).get('motion') === 'static'; } catch { return true; }
  });
  const [i, setI] = useState(still ? HERO_MINI.length - 1 : 0);
  useEffect(() => {
    if (still || i >= HERO_MINI.length - 1) return undefined;
    const t = window.setTimeout(() => setI((n) => n + 1), i === 0 ? 2200 : 2600);
    return () => window.clearTimeout(t);
  }, [i, still]);
  return (
    <div className="lp-hero-mini" aria-live="off">
      {HERO_MINI.map((m, k) => (
        <div key={m.name} className={`lp-hero-mini-frame${k === i ? ' is-on' : ''}`}>
          <Shot name={m.name} eager={k === HERO_MINI.length - 1} hidden={k !== HERO_MINI.length - 1} alt={m.alt} className="lp-shot" sizes="(min-width: 768px) 220px, 46vw" />
        </div>
      ))}
    </div>
  );
}

// ② これまでの読書と、Orime の読書（2026-10-12 オーナー「従来の読書は一方通行。Orime は本と会話できるので、
//   自分自身のオリジナルの内容で理解できる。ビフォーアフターの世界観を」）。図は 本 → 自分（一方通行）と 本 ⇄ 自分（会話）。
const BEFORE_AFTER = [
  { label: '', title: '読み終えたら、そこで終わり。', body: 'たいていそのまま本棚に戻ります。' },
  { label: '', title: '自分だけの理解が残る。', body: '本に悩みを話すと、質問が返ってきます。答えているうちに、考えがまとまっていきます。', after: true },
];

// ② 相談の例（幅を持たせて 3 つ・立場で絞らない）
const ASK_EXAMPLES = [
  { q: '部下に任せたいのに、結局自分でやってしまう。どうしたらいい？' },
  { q: '面接で話せる強みが見つからない' },
  { q: '何を始めても三日坊主で終わる' },
];

// ③ 続けられて、成果が見える（柱 ②〜⑤・1 つ 1〜2 文・画面 1 枚）
const PILLARS = [
  {
    id: 'action', shot: 'action', artAlt: '相談で決めた一歩を、明日のやることに書き込む様子のイラスト',
    title: '相談の最後に、明日やることを決める',
    body: '決めたことは行動リストに入り、期限の日の朝に通知が届きます。',
    alt: '振り返りの行動の画面。明日・来週以降に分かれた行動の一覧と、それぞれの本の名前',
  },
  {
    id: 'focus', shot: 'focus', artAlt: '時間を決めて、集中して本を読む様子のイラスト',
    title: '時間を決めて読む',
    body: 'タイマーをかけると、表紙と残り⁠時間だけの画面になります。読んだ時間は本ごとに残ります。',
    alt: '集中モードの画面。暗い地に本の表紙と書名、「残り 23 分」の大きな数字と細い輪、下にメモ・おわる・一時停止のボタン',
  },
  {
    id: 'share', share: true, artAlt: '心に残った一文を写真に重ねて共有する様子のイラスト',
    title: '気に入った一文を画像にして投稿',
    body: '写真に一文と書名をのせて、SNS に投稿できます。',
    alt: '写真で共有で作った縦長の画像。海辺のカフェの写真の上に、細い明朝の一文「「人間として何が正しいか」と自分に問い、正しいと信じる道を貫き倒す。」と、読書中の本『考え方』稲盛和夫、Orime のロゴと日付 2026.10.12 が重なっている',
  },
  {
    id: 'fields', shot: 'fields', artAlt: 'これまでに読んだ本を分野ごとに見渡す様子のイラスト',
    title: '読んできた分野が見える',
    body: '読んだ本が分野ごとに並ぶので、偏りに気づけます。',
    alt: '振り返りの記録の「分野」。仕事・自分と生活の分野ごとの本とメモの数と、「まだ本がない分野」のチップ',
  },
  {
    // AI 選書（2026-10-11 オーナー「おすすめの本と順番、その本を読む戦略まで」）。言い過ぎない: 聞き取り・読んできた本と評価・
    //   最近の相談 → おすすめと読む順番 → 追加した本の読書計画シート。どちらもプランの機能。
    id: 'advisor', shot: 'advisor', artAlt: '悩みを聞いて、次に読む本と読む順番を選ぶ様子のイラスト',
    title: '次に読む本を選んでもらう',
    body: '悩みを話すと、これまで読んだ本や最近の相談をもとに、おすすめの本と読む順番を出します。', plan: true,
    alt: 'AI 選書の画面。受け取った悩みのまとめと、おすすめの本のカード、読む順番',
  },
];

// ③ の下の、読書記録アプリとしての基本（2026-10-13 オーナー「ブクログなども意識して、バーコード・フォルダ分けも当たり前にできると」）。
//   乗り換える人が「今やっていることができるか」を確かめる場所。主役にはしない（見出しは小さく・ふつうの箇条書き）。どれも実装済み。
const BASICS = [
  'バーコードを読み取って本を登録',
  '読みたい・積読・読書中・読了で管理',
  'フォルダで自由に分ける',
  '読み終えた本に ★ で評価',
  'ブクログ・読書メーター・Kindle から取り込み',
];

// ③ の下の安心の 4 つ。学習＝各社の API 規約／同意＝ensureAiConsent（はじめて AI を使う操作のとき）／
// 書き出し＝設定の CSV（lib/exportData.js）・退会のお申し込みで消去／写真で共有＝端末の中で描く（サーバーに送らない）。
const TRUST_POINTS = [
  'メモが AI の学習に使われることはありません。使っている AI の会社の規約で決まっています。',
  'メモを送るのは、AI を使うときだけです。はじめて使う前に、送る⁠内容が表示されます。',
  '本・メモ・行動は、いつでも CSV で書き出せます。',
];

// ④ メモがゼロでも、今日から（0 日目の 4 つの道・SPEC §1-1d）
const START_POINTS = [
  { head: '読んだ本に一言', body: `覚えていることを一行だけ。${noBreak('うろ覚え')}でかまいません。` },
  { head: 'ほかのアプリから取り込む', body: 'ブクログ・読書メーター・Kindle の記録を移せます。' },
  { head: '本のページを撮る', body: '撮ったページを文字に起こします。' },
  { head: '積読から始める', body: '読む前に、学べる⁠ことが分かります。' },
];

// 🧭 ページ内の案内（2026-10-13 オーナー「ハンバーガーメニュー等を適宜」）。広い画面はヘッダーに文字のリンク、
//   スマホは 3 本線のボタン（ハンバーガーメニュー）で開く。行き先はページの中の見出し。
const NAV_ITEMS = [
  { href: '#lp-grow', label: '使い方' },
  { href: '#lp-pillars', label: 'できること' },
  { href: '#lp-pricing', label: '料金' },
  { href: '#lp-faq', label: 'よくある質問' },
];

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector('a')?.focus();
    // 開いている間は後ろのページを動かさない（幕を敷いて止める・2026-10-13 ui-critic）
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); return; }
      // Tab はメニューの中（× のボタンと 4 つの行）だけを回る
      if (e.key !== 'Tab') return;
      const items = [btnRef.current, ...(panelRef.current?.querySelectorAll('a') || [])].filter(Boolean);
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const mq = window.matchMedia('(min-width: 768px)');
    const onWide = () => { if (mq.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    mq.addEventListener?.('change', onWide);
    return () => {
      html.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      mq.removeEventListener?.('change', onWide);
    };
  }, [open]);
  return (
    <div className="lp-menu">
      <button
        ref={btnRef}
        type="button"
        className="lp-menu-btn"
        aria-expanded={open}
        aria-controls="lp-menu-panel"
        aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size="1.4em" aria-hidden="true" /> : <Menu size="1.4em" aria-hidden="true" />}
      </button>
      {open && <div className="lp-menu-scrim" aria-hidden="true" />}
      {open && (
        <nav id="lp-menu-panel" ref={panelRef} className="lp-menu-panel" aria-label="ページの中の案内">
          <ul>
            {NAV_ITEMS.map((n) => (
              <li key={n.href}><a href={n.href} onClick={() => setOpen(false)}>{n.label}</a></li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

// 🎠 横にスワイプする列（カルーセル）の今の枚（スマホだけ・下の点）。
function useSnapIndex(ref, count) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onScroll = () => {
      const first = el.firstElementChild;
      const second = first?.nextElementSibling;
      // 1 枚ぶんの送り＝カードの幅＋カードの間
      const step = first && second ? second.getBoundingClientRect().left - first.getBoundingClientRect().left : (first?.getBoundingClientRect().width || 1);
      setAt(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / (step || 1)))));
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, count]);
  return at;
}

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
function Entry({ loc, wl, qr = false, badge = false, launch = false, center = false, label = CTA_LABEL }) {
  if (PRELAUNCH) {
    return <LpWaitlist loc={loc} done={wl.done} onDone={wl.markDone} launch={launch ? LAUNCH_LINE : ''} center={center} />;
  }
  return (
    <div className="lp-cta-row">
      <StoreCta className="lp-btn lp-btn-large" loc={loc}>{label}</StoreCta>
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
  // 公開のお知らせ: 1 か所で送ったら、ほかの入口も「お知らせします」にする。
  const [wlDone, setWlDone] = useState(false);
  const wl = { done: wlDone, markDone: useCallback(() => setWlDone(true), []) };
  // ヒーローの表示方式（2026-10-11〜）: 'illust'＝いろいろな本と会話するイラスト ↔ 'photo'＝1 冊に相談した答えの実際の画面
  // （'3d' は ?hero=3d のときだけ・lib/lpTrack.js の lpVariant）。イラストのときは注記を画面のある「読んで、終わりにしない。」の節に任せる。
  const [heroVariant] = useState(() => lpVariant());
  // 写真で共有の柱がイラストに替わったら、「共有の画像は見本の写真で…」の注記は出さない。
  const shareArt = hasArt('illust-share');
  // ビフォーアフターの絵があれば、カードの簡単な図は出さない（絵と同じことを 2 回言わない）。
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
        description: '読んだ本と会話できる読書メモアプリ。気になった一行をメモしておくと、迷ったときに AI がその本の語り口で、あなたのメモをもとに答えます。',
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
        document.querySelectorAll('.lp-reveal, .lp-sec .lp-h2, .lp-gallery, .lp-pillars > li').forEach((el) => revealIo.observe(el));
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
  const pillarsRef = useRef(null);
  const pillarAt = useSnapIndex(pillarsRef, PILLARS.length);

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
            {/* 広い画面だけ: ページの中の案内（スマホは右の 3 本線のボタンから） */}
            <ul className="lp-header-links">
              {NAV_ITEMS.map((n) => (
                <li key={n.href}><a href={n.href}>{n.label}</a></li>
              ))}
            </ul>
            {!PRELAUNCH && (
              <StoreCta
                className="lp-btn lp-btn-small lp-btn-ghost lp-header-cta"
                loc="header"
              >
                {CTA_LABEL}
              </StoreCta>
            )}
            {/* 「ログイン」は置かない（2026-10-11 オーナー「アプリでしか使わない想定なので、App Store へ流すボタンに」）。
                管理者は /?auth=signin を直接開く。右上は「無料プランで始める」1 つ（広い画面・ヒーローのボタンが外れてから）。 */}
          </nav>
          <MobileMenu />
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
              <h1 className="lp-h1">
                <span>読んだ本と、</span><span>会話しよう。</span>
              </h1>
              <p className="lp-lead lp-wbr">
                <Phrases>気になった一行をメモしておくと、迷ったときに、その本に相談できます。AI が本の語り口で、メモをもとに答えます。</Phrases>
              </p>
              <div className="lp-cta-block" ref={heroCtaRef}>
                {/* QR は最後の案内だけ（ヒーローの主ボタンの横の黒い四角がいちばん重く見えた・2026-10-16 ui-critic） */}
                <Entry loc="hero" wl={wl} badge launch />
                {/* ボタンのすぐ下の安心の一言（2026-10-12・短い言い切り） */}
                {!PRELAUNCH && <p className="lp-cta-sub lp-cta-meta lp-wbr"><Phrases>{ZERO_RISK_NOTE}</Phrases></p>}
                <div className="lp-hero-links">
                  <a className="lp-textlink" href="#lp-grow" onClick={() => lpTrack('hero_secondary', {})}>
                    <span>会話の様子を見る</span><ChevronDown size="1.1em" aria-hidden="true" />
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
                {/* イラストの右下に、実際の相談の画面を少し重ねる（イラストの型でも最初の画面で製品が見える・2026-10-12） */}
                <HeroMini />
                <HeroNote />
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
              <HeroNote />
            </figure>
            )}
          </div>
        </section>

        {/* ============ ② 受け身から会話へ ============ */}
        <section className="lp-sec lp-flow-sec" aria-labelledby="lp-flow" data-lp-sec="flow">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-flow">
                <span>一方通行の読書から、</span><span>会話する読書へ。</span>
              </h2>
              {/* 問題の自覚（損失回避・好奇心のすき間／2026-10-12）。効果の言い切りはしない */}
              <p className="lp-wbr lp-sec-lead"><Phrases>{PROBLEM_LEAD}</Phrases></p>
              {/* ビフォーアフターの絵（2026-10-12 オーナーの絵・public/lp/illust-dialogue-*.webp・LpArt.jsx）。見出しのすぐ下・2 枚のカードの上 */}
              <div className="lp-ba-wrap">
              <LpArt name="illust-dialogue" ratio="4:3" sizes="(min-width: 768px) 600px, 92vw" className="lp-art-sec lp-art-wide" alt="左は、椅子に座って本を一人で静かに読んでいる人。右は、同じ人が机で本を開き、本と人のあいだを「？」や電球、メモの吹き出しが行き来して、明るい表情でうなずいている" />
              <ul className="lp-ba">
                {BEFORE_AFTER.map((r) => (
                  <li key={r.title} className={r.after ? 'is-after' : undefined}>
                    {/* 図やカードは使わず、文の大きさだけで「これまで → これから」を見せる（2026-10-16 ui-critic・LP の文の組み） */}
                    {r.label && <p className="lp-ba-label">{r.label}</p>}
                    <p className="lp-ba-title lp-wbr"><Phrases clause>{r.title}</Phrases></p>
                    <p className="lp-ba-body lp-wbr"><Phrases>{r.body}</Phrases></p>
                  </li>
                ))}
              </ul>
              </div>
            </div>
            {/* 一番の価値（CLAUDE.md）を、会話の流れ 4 枚の見出しに（2026-10-12 ui-critic） */}
            <h2 className="lp-h2 lp-flow-head" id="lp-grow"><span>メモが増えるほど、</span><span>答えが自分向けになります</span></h2>
            <LpFlow onEvent={lpTrack} note={false} />
            <div className="lp-asks">
              <p className="lp-asks-title">相談の例</p>
              {/* 相談の入力の吹き出しの形（アプリの送った相談と同じ見た目・右寄せ） */}
              <ul>
                {ASK_EXAMPLES.map((x) => (
                  <li key={x.q}><span className="lp-asks-bubble"><span className="lp-wbr"><Phrases>{x.q}</Phrases></span></span></li>
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
                ほかにできること
              </h2>
            </div>
            {/* スマホは横にスワイプ（カルーセル・1 枚ずつ止まる・次の枚の端が見える）、広い画面は並べる（2026-10-13） */}
            <ul className="lp-pillars" ref={pillarsRef}>
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
                            src="/lp/share-story-540.webp"
                            srcSet="/lp/share-story-540.webp 540w, /lp/share-story-1080.webp 1080w"
                            sizes="(min-width: 768px) 240px, 72vw"
                            width="1080"
                            height="1920"
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
                    <h3 className="lp-h3 lp-wbr"><Phrases clause>{x.title}</Phrases>{x.plan && <span className="lp-plan-badge lp-pillar-plan">プラン</span>}</h3>
                    <p className="lp-wbr"><Phrases>{x.body}</Phrases></p>
                  </div>
                </li>
              ))}
              {/* 広い画面だけ: 格子の 6 つめに「本の記録も、ふつうにできます」（5 つの機能の後ろに穴をあけない・2026-10-16 ui-critic 第 2 回）。
                  スマホの横送りには入れない（下の .lp-basics を出す）。 */}
              <li className="lp-pillar-basics" aria-hidden="false">
                <h3 className="lp-basics-title">本の記録も、ふつうにできます</h3>
                <ul>
                  {BASICS.map((t) => <li key={t} className="lp-wbr"><Phrases>{t}</Phrases></li>)}
                </ul>
              </li>
            </ul>
            <p className="lp-gallery-dots lp-pillars-dots" aria-hidden="true">
              {PILLARS.map((x, i) => <span key={x.id} className={i === pillarAt ? 'is-on' : undefined} />)}
            </p>
            {/* 読書記録の基本（ブクログなどから乗り換える人向け・2026-10-13） */}
            <div className="lp-basics">
              <h3 className="lp-basics-title">本の記録も、ふつうにできます</h3>
              <ul>
                {BASICS.map((t) => <li key={t} className="lp-wbr"><Phrases>{t}</Phrases></li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* ============ ④ メモがゼロでも、今日から ============ */}
        <section className="lp-sec lp-band lp-start-sec" aria-labelledby="lp-start" data-lp-sec="start">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-start">
                <span>メモがまだなくても、</span><span>始められます</span>
              </h2>
            </div>
            {/* 広い画面は 絵（左）と 4 つの始め方＋入口（右）の 2 列（2026-10-12） */}
            <div className="lp-start-wrap">
              <LpArt name="illust-start" ratio="4:3" sizes="(min-width: 768px) 600px, 92vw" className="lp-art-sec lp-art-wide" alt="机で本のページをスマホで撮る人。まわりに、付箋に一言書く手・本棚の本がスマホに移る様子・本のページを撮る枠の 3 つの丸い絵が浮かんでいる" />
              <div>
                <PointList items={START_POINTS} className="lp-points" />
                <div className="lp-cta-block">
                  <Entry loc="start" wl={wl} />
                </div>
              </div>
            </div>
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

        {/* ============ 書いたメモの扱い（お金の話の前に不安を消す・2026-10-12） ============ */}
        <section className="lp-sec lp-trust-sec" aria-labelledby="lp-trust" data-lp-sec="trust">
          <div className="lp-wrap">
            {/* 安心の 3 つ（どれも実装と規約で確かめた事実だけ・2026-10-12 に料金のあと・よくある質問の頭へ） */}
            <h2 className="lp-h2 lp-trust-title" id="lp-trust">書いたメモの扱い</h2>
            {/* アイコンつきのカードはやめ、ふつうの箇条書きに（2026-10-13 オーナー「AI っぽさを徹底的に排除」） */}
            <ul className="lp-trust" aria-labelledby="lp-trust">
              {TRUST_POINTS.map((t) => (
                <li key={t} className="lp-wbr"><Phrases>{t}</Phrases></li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============ ⑤ 料金（無料プランを前に） ============ */}
        <section className="lp-sec lp-pricing" aria-labelledby="lp-pricing" data-lp-sec="pricing">
          <div className="lp-wrap">
            <div className="lp-narrow lp-sec-head">
              <h2 className="lp-h2" id="lp-pricing">
                {/* 価値の言い換え（2026-10-11 オーナー「¥1,480 を安く感じさせる」）。比べる値段（通常・定価・他社）は書かない。
                    見出しに金額を置かない（月あたりの額を請求額より大きく見せない） */}
                料金
              </h2>
              <p className="lp-wbr"><Phrases>{`プランは月 ${MONTHLY_TEXT}、本 1 冊ぶんくらいです。まずは無料プランで試してみてください。`}</Phrases></p>
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
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span className="lp-wbr"><Phrases>本とメモは何件でも。AI 以外の機能はすべて使えます。</Phrases></span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>AI の答えは<span className="lp-nb">毎月 {FREE_CONSULTS}</span><span className="lp-nb">（はじめの月は {FIRST_CONSULTS}）</span></span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>写真から書き起こし <span className="lp-nb">毎月 {FREE_OCR_PER_MONTH} 回</span></span></li>
                </ul>
                {!PRELAUNCH && <StoreCta className="lp-btn lp-btn-ghost lp-plan-cta" loc="pricing_free">{CTA_LABEL}</StoreCta>}
              </div>
              <div className="lp-plan is-paid">
                <p className="lp-plan-name"><span>月額・年額プラン</span>{TRIAL_NOTE && <span className="lp-plan-badge">{OFFER.active ? '月額は 7 日間無料' : TRIAL_NOTE}</span>}</p>
                {/* プランで手に入るもの（数は lib/tokenAmounts.js のとおり）。量は大きな数字にせず、無料プランと同じ箇条書きの 1 行目に
                    （値段より大きな数字が先に来ていた・2026-10-16 ui-critic）。 */}
                <ul className="lp-included" aria-label="プランに含まれるもの">
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>AI の答えは<span className="lp-nb">毎月 {PAID_CONSULTS}</span></span></li>
                  <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span className="lp-wbr"><Phrases>読書計画シートや AI 選書など、すべての AI 機能</Phrases></span></li>
                  {TRIAL_NOTE && (
                    <li><Check size="1.1em" strokeWidth={2.4} aria-hidden="true" /><span>無料期間中も <span className="lp-nb">AI の答え {TRIAL_CONSULTS}</span></span></li>
                  )}
                </ul>
                <p className="lp-plan-hint lp-wbr"><Phrases>{`${CONSULT_ANSWERS_NOTE}`}</Phrases></p>
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
                        <p className="lp-plan-sub"><span className="lp-nb">月あたり約 {PER_MONTH_TEXT}</span>{SAVE && <> · <span className="lp-nb">{SAVE.replace('月額プランより', '月額より')}</span></>}</p>
                      </>
                    )}
                  </div>
                  <div className="lp-plan-row">
                    <p className="lp-plan-label">月額プラン</p>
                    <p className="lp-plan-price">{MONTHLY_TEXT}<span>/ 月（税込）</span></p>
                    <p className="lp-plan-sub"><span className="lp-nb">1 日あたり約 {PER_DAY_TEXT}。</span>{OFFER.active && TRIAL_FIRST && <span className="lp-nb">{TRIAL_FIRST}。</span>}</p>
                  </div>
                </div>
                {!PRELAUNCH && <StoreCta className="lp-btn lp-plan-cta" loc="pricing">{TRIAL_NOTE ? TRIAL_CTA_LABEL : CTA_LABEL}</StoreCta>}
                {/* 自動更新・解約の説明は有料のボタンのすぐ下（App Store 3.1.2・2026-10-12） */}
                <p className="lp-renew lp-wbr">{COPY.pricingNote.map((t) => <span key={t}><Phrases>{t}</Phrases></span>)}</p>
              </div>
            </div>
            {PRELAUNCH && (
              <div className="lp-cta-block">
                <Entry loc="pricing" wl={wl} />
              </div>
            )}
          </div>
        </section>

        {/* ============ ⑥ よくある質問（上に安心の 4 つ） ============ */}
        <section className="lp-sec lp-faq" aria-labelledby="lp-faq" data-lp-sec="faq">
          <div className="lp-wrap lp-narrow">
            <h2 className="lp-h2" id="lp-faq">よくある質問</h2>
            <div className="lp-faq-list">
              {COPY.faq.map((f, i) => (
                <details className="lp-faq-item" key={f.q} open={i === 0 || undefined} onToggle={(e) => { if (e.currentTarget.open) lpTrack('faq_open', { i, q: f.q.slice(0, 40) }); }}>
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
              <span>まずは、読んだ本に</span><span>一言書いてみてください</span>
            </h2>
            <div className="lp-cta-block">
              <Entry loc="final" wl={wl} qr badge launch center />
              {/* 2 句目（プランの無料期間）は料金の区画へ戻る文字のリンク（2026-10-12） */}
              <p className="lp-cta-note lp-wbr">
                <span><Phrases>{COPY.priceLine[0]}</Phrases></span>
                <a className="lp-inline-link lp-final-plan" href="#lp-pricing" onClick={() => lpTrack('cta_click', { loc: 'final_plan' })}><Phrases>{COPY.priceLine[1]}</Phrases></a>
              </p>
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
