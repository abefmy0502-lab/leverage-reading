// 🌱 Landing Page — Orime（2026-07 全面リニューアル版）
//
// コンセプト: 「"読んだあと" が主役の一本道ストーリー」。
// 忘れる(共感) → 忘れない3つの仕掛け(想起/行動/凝縮) → 貯まるほど効く(読書脳)
// → 読む前もAIが支える → 記録アプリとの違い → 折り目のブランドストーリー
// → 料金 → FAQ → 最終CTA、の順に一本の物語で語る。
//
// 設計上の約束（旧版から継承する誠実さの原則）:
//   - 架空のユーザー数・お客様の声・効果数値は絶対に書かない
//   - 実装されていない機能を約束しない（無料トライアルは App Store 設定依存
//     のため LP では言及しない）
//   - スクショが無い機能は「スタイライズドUIモック」で表現し、実画面と紛れ
//     ないよう注記する
//
// 技術ノート:
//   - CSP は default-src 'self'。外部 JS/画像は使えない（すべてローカル資産）
//   - フォントは OS 標準（明朝=Yu Mincho/Hiragino Mincho）。Google Fonts は
//     過去に LCP 悪化で撤去済みのため再導入しない（index.html 参照）
//   - SEO: SPA のためランタイムで meta/canonical/JSON-LD を注入し、unmount で
//     復元する。JSON-LD は SoftwareApplication + FAQPage
//   - CTA は <a href>（コピー/長押し/中クリック等のネイティブ挙動を尊重）

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { BUILD_LABEL } from '../lib/buildInfo';
import { SUPPORT_EMAIL } from '../lib/contact';
import { APP_STORE_URL, isAppStoreLive } from '../lib/appStore';
import './landing.css';

// 📱 App Store ダウンロード URL は src/lib/appStore.js に一元化。
// VITE_APP_STORE_URL 未設定（= 実 URL 未確定）の間、CTA は自動で「近日公開」
// 表示に倒れる — プレースホルダー URL を踏ませて App Store の 404 に落とさない。
// 審査通過後に env へ実 URL（.../idXXXXXXXXXX）を入れれば全 CTA が一斉に有効化。

// StoreCta: App Store 導線の共通 CTA。実 URL があるときだけリンクにする。
function StoreCta({ className, children, tabIndex }) {
  if (!isAppStoreLive) {
    return (
      <span className={className} aria-disabled="true" style={{ opacity: 0.65, pointerEvents: 'none' }}>
        App Store で近日公開
      </span>
    );
  }
  return <a href={APP_STORE_URL} className={className} tabIndex={tabIndex}>{children}</a>;
}

// 🎁 無料トライアル表記（env ゲート）。App Store Connect で Introductory Offer を
// 設定したら Vercel env に VITE_TRIAL_NOTE（例: 7日間無料）を入れる — ヒーロー・
// sticky CTA・料金カード・FAQ・最終 CTA に一斉表示される。未設定の間は一切出ない
// ＝ストアの実態と食い違う虚偽表示にならない（アプリ内 Paywall は iap.js がストア
// の実プロダクトから無料期間を自動取得するため env 不要）。
const TRIAL_NOTE = (import.meta.env.VITE_TRIAL_NOTE || '').trim();

const PRICE_NOTE = TRIAL_NOTE
  ? `${TRIAL_NOTE}・月 ¥1,480（税込）・いつでも解約できます・解約してもメモは残ります`
  : '月 ¥1,480（税込）・いつでも解約できます・解約してもメモは残ります';

// 🗣 社会的証明（お客様の声）枠。
// ⚠️ ここには「実在ユーザーの本物の声」だけを入れる。捏造・盛り・架空の数字は
//    絶対にNG（景表法・ステマ規制・ブランド思想の誠実さに反する）。許可を得た
//    実際の声が出てきたら 1〜2 件でも入れる。空の間はセクションごと非表示になる。
// 形式: { quote: 'ユーザーの言葉', attribution: '匿名可。例: 30代・営業' }
const TESTIMONIALS = [];

// 比較表: 「記録するアプリ」と「思い出して使うアプリ」の違い。
// cold 流入の最大の反論「無料で記録できるのに、なぜ有料？」に料金の前で答える。
// ※存在しない機能は書かない。
const COMPARE_ROWS = [
  { label: '読んだ後', others: '見返すのは、自分しだい', us: '忘れた頃に、届け直す' },
  { label: 'メモ', others: '貯まるほど、埋もれる', us: '貯まるほど、「脳」になる' },
  { label: '行動', others: 'アプリの外で、別管理', us: '一行から、一歩に変わる' },
  { label: '続く理由', others: '意志の力', us: '仕組みの力' },
];

// FAQ はここが唯一の真実（表示と FAQPage JSON-LD の両方がこの配列から生成される）。
const FAQ_ITEMS = [
  {
    q: 'iPhone 以外でも使えますか？',
    a: '現在 Orime は iPhone（iOS）専用アプリとして App Store で公開しています。Android 版は今後検討中です。このページはサービスのご紹介ページで、ご利用には App Store からのインストールが必要です。',
  },
  {
    q: '料金はいくらですか？',
    a: `${TRIAL_NOTE ? `まず${TRIAL_NOTE}でお試しいただけます。その後は` : ''}月 ¥1,480、または年額 ¥12,800（月あたり約 ¥1,066）で、すべての機能をご利用いただけます。お支払いは App Store 経由（Apple ID）です。`,
  },
  {
    q: '解約は簡単にできますか？',
    a: 'iPhone の「設定 → 自分の名前 → サブスクリプション」からいつでも解約できます（App Store の標準の仕組みです）。違約金や解約手数料は一切ありません。',
  },
  {
    q: '解約すると、データは消えますか？',
    a: '消えません。解約後もアカウントとメモはすべて保持され、再開すればそのまま戻ります。契約期間の終わりまでは引き続き全機能をご利用いただけます。',
  },
  {
    q: '通知がしつこくなりませんか？',
    a: '想起の通知は週に数回、そっと届く程度です。設定からいつでもオフにできます。「そっと届く」を大切にしているので、煽るような通知は送りません。',
  },
  {
    q: '忙しくて、使う時間が取れるか不安です',
    a: '1 日 5 分から始められます。読みながら心が動いた一行を残すだけ。読む前の計画も AI が「重点的に読む章」を絞ってくれるので、忙しい方ほど短い時間で効果を出しやすい設計です。',
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
  // cleanup 用に「作ったなら消す / 上書きしたなら戻す」情報を返す
  return { el, created, prev };
};

export default function Landing() {
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Orime（オリメ）｜読んだ本を、忘れない。読書を行動に変える iPhone アプリ';
    const metas = [
      setMeta('description',
        '心が動いた一行をメモすると、忘れた頃に Orime が届け直す。決めた一歩はやり切るまで見届ける。読書の「読んだあと」を設計する iPhone アプリ。月¥1,480・いつでも解約できます・解約してもメモは残ります。'),
      setMeta('og:title', '読んだ本を、忘れない。| Orime（オリメ）', 'property'),
      setMeta('og:description', '忘れた頃にメモが戻り、決めた一歩を見届ける。読書の「読んだあと」を設計する iPhone アプリ。', 'property'),
      setMeta('og:type', 'website', 'property'),
    ];

    // canonical（LP は /lp でも表示されるため、正規 URL をルートに寄せる）
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${window.location.origin}/`;
    document.head.appendChild(canonical);

    // 構造化データ: アプリ情報 + FAQ（Google のリッチリザルト対象）
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Orime',
        operatingSystem: 'iOS',
        applicationCategory: 'LifestyleApplication',
        description: '読書の「読んだあと」を設計する読書メモアプリ。メモを忘れた頃に届け直し、行動を見届け、AI が知恵に凝縮する。',
        offers: { '@type': 'Offer', price: '1480', priceCurrency: 'JPY' },
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

    const handleScroll = () => setShowStickyCta(window.scrollY > 480);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    // スクロール連動のフェードイン（reduced-motion 時は CSS 側で無効化）。
    // observer が使えない/発火しない環境でも 1.5s 後に必ず可視化する。
    const lpRoot = document.querySelector('.lp-root');
    if (lpRoot) lpRoot.classList.add('js-ready');
    const sections = document.querySelectorAll('.fade-in');
    const fallbackTimers = [];
    let observer = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            observer.unobserve(e.target);
          }
        });
      }, { threshold: 0.08 });
      sections.forEach((s) => {
        observer.observe(s);
        fallbackTimers.push(setTimeout(() => s.classList.add('visible'), 1500));
      });
    } else {
      sections.forEach((s) => s.classList.add('visible'));
    }

    return () => {
      document.title = prevTitle;
      metas.forEach(({ el, created, prev: prevContent }) => {
        if (created) { el.parentElement?.removeChild(el); }
        else if (prevContent != null) { el.setAttribute('content', prevContent); }
      });
      canonical.parentElement?.removeChild(canonical);
      ld.parentElement?.removeChild(ld);
      window.removeEventListener('scroll', handleScroll);
      if (observer) observer.disconnect();
      fallbackTimers.forEach(clearTimeout);
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
      {/* a11y: キーボード利用者向けスキップリンク */}
      <a className="skip-link" href="#lp-main">本文へスキップ</a>

      {/* ============ 0. Header（常時ブランド + デスクトップの常設CTA） ============ */}
      <header className="lp-header">
        <div className="lp-header-inner">
          <a href="/" className="lp-brand" aria-label="Orime トップ">
            <img src="/icons/icon-192.png" alt="" width="28" height="28" className="lp-brand-mark" />
            <span className="lp-brand-name">Orime</span>
          </a>
          <nav className="lp-header-nav" aria-label="ヘッダー">
            <a href="/?auth=signin" className="lp-header-login">ログイン</a>
            <StoreCta className="lp-header-cta">App Store で入手</StoreCta>
          </nav>
        </div>
      </header>

      {/* ============ Sticky 下部 CTA（モバイル・スクロール後） ============ */}
      <div
        className={`sticky-cta${showStickyCta ? ' is-visible' : ''}`}
        role="region"
        aria-label="ダウンロード"
        aria-hidden={showStickyCta ? undefined : 'true'}
      >
        <div className="sticky-inner">
          <div className="sticky-price">
            <span className="sticky-price-main">{TRIAL_NOTE ? `${TRIAL_NOTE}・月 ¥1,480` : '月 ¥1,480（税込）'}</span>
            <span className="sticky-price-sub">いつでも解約できます・データは残ります</span>
          </div>
          <StoreCta className="sticky-btn" tabIndex={showStickyCta ? undefined : -1}>
            App Store で入手
          </StoreCta>
        </div>
      </div>

      <main id="lp-main">
        {/* ============ 1. Hero ============ */}
        <section className="hero">
          <p className="hero-eyebrow">iPhone 専用・読書アプリ</p>
          <h1 className="hero-headline">
            読んだ本を、<br />
            忘れない。
          </h1>
          <p className="hero-subhead">
            心が動いた一行をメモする。<br />
            忘れた頃に、Orime が届け直す。<br />
            決めた一歩は、やり切るまで見届ける。
          </p>
          <p className="hero-tagline">読書の「読んだあと」を設計するアプリです。</p>
          <div className="hero-cta-block">
            <StoreCta className="cta-primary cta-hero">App Store でダウンロード</StoreCta>
            <p className="hero-note">{PRICE_NOTE}</p>
            <p className="hero-login">
              すでにアカウントをお持ちの方は <a href="/?auth=signin" className="hero-login-link">ログイン</a>
            </p>
          </div>

          <div className="hero-mockup">
            <PhoneFrame
              src="/lp/hero-bookshelf.jpg"
              alt="Orime の本棚画面。読みたい・積読・読了のステータス付きで本の表紙が並ぶ"
              size="medium"
              float
              eager
              ratio="868/1424"
            />
          </div>
        </section>

        {/* ============ 2. Problem（忘れるのは仕様） ============ */}
        <section className="problem fade-in">
          <p className="section-eyebrow">なぜ、残らないのか</p>
          <h2 className="section-headline">
            先週読み終えた本の内容、<br />
            3 つ言えますか。
          </h2>
          <p className="problem-body">
            言えなくても、落ち込む必要はありません。<br />
            どれだけ良い本でも、読んだだけなら記憶は薄れていく。<br />
            それが人間の仕様です。
          </p>
          <p className="problem-body">
            問題は記憶力ではなく、<br className="sp-only" />
            <strong>「思い出す機会」がないこと。</strong>
          </p>
          <p className="problem-turn">
            だから Orime は、記録のためではなく、<br />
            <em>思い出して、使うため</em>に作られています。
          </p>
        </section>

        {/* ============ 3. 仕掛け 01 — 想起 ============ */}
        <section className="feature fade-in" aria-labelledby="f-recall">
          <p className="section-eyebrow">仕掛け 01 — 想起</p>
          <h2 className="section-headline" id="f-recall">
            忘れた頃に、<br />
            もう一度出会う。
          </h2>
          <p className="feature-body">
            残した一行は、数日後、ふいに戻ってきます。<br />
            「覚えた」は間隔を空け、「もう一度」は翌日に。<br />
            ちょうど忘れかけた頃に届く、忘却曲線に沿った設計です。
          </p>

          {/* 想起カードのスタイライズドUIモック（実スクショ差し替え予定） */}
          <div className="ui-mock recall-mock" role="img" aria-label="想起カードのイメージ。過去のメモが一枚表示され、「覚えた」「もう一度」を選べる">
            <p className="recall-mock-label">今日の一行</p>
            <p className="recall-mock-quote">「結果を管理するな、<br />結果を生む行動を管理せよ」</p>
            <p className="recall-mock-source">『最高の結果を出す KPI マネジメント』のメモ・42日前</p>
            <div className="recall-mock-actions" aria-hidden="true">
              <span className="recall-mock-btn primary">覚えた</span>
              <span className="recall-mock-btn">もう一度</span>
            </div>
          </div>
          <p className="mock-caption">画面はイメージです</p>

          <p className="feature-sub">
            通知は週に数回、そっと届く程度。もちろんオフにもできます。
          </p>
        </section>

        {/* ============ 4. 仕掛け 02 — 行動 ============ */}
        <section className="feature feature-alt fade-in" aria-labelledby="f-action">
          <p className="section-eyebrow">仕掛け 02 — 行動</p>
          <h2 className="section-headline" id="f-action">
            「いつかやろう」を、<br />
            期限つきの一歩に。
          </h2>
          <div className="feature-split">
            <div className="feature-split-text">
              <p className="feature-body">
                メモの一行から、そのまま行動を作れます。<br />
                期限、優先度、毎週の繰り返し。
              </p>
              <p className="feature-body">
                本をまたいで「やること」が一覧になり、<br className="pc-only" />
                今週の達成率が見える。<br />
                読書が、リストの先の<strong>習慣</strong>まで届きます。
              </p>
            </div>
            <div className="feature-split-image">
              <PhoneFrame
                src="/lp/action-management.jpg"
                alt="行動タブの画面。今週の達成率 100%、本ごとの行動が期限・繰り返し付きで並ぶ"
                size="medium"
                ratio="1179/1926"
              />
            </div>
          </div>
        </section>

        {/* ============ 5. 仕掛け 03 — 凝縮 ============ */}
        <section className="feature fade-in" aria-labelledby="f-condense">
          <p className="section-eyebrow">仕掛け 03 — 凝縮</p>
          <h2 className="section-headline" id="f-condense">
            散らばったメモが、<br />
            一枚の知恵になる。
          </h2>
          <p className="feature-body">
            メモが貯まったら、<br className="sp-only" />AI がテーマごとに削ぎ落とします。<br />
            残るのは「核心の一行」「繰り返す原則」「次の一歩」だけ。<br />
            使えるかたちまで磨かれた、<strong>あなた自身の言葉</strong>です。
          </p>

          {/* テーマまとめのスタイライズドUIモック（実スクショ差し替え予定） */}
          <div className="ui-mock condense-mock" role="img" aria-label="テーマまとめのイメージ。営業というテーマのメモが核心の一行・繰り返す原則・次の一歩に凝縮されている">
            <p className="condense-mock-theme">テーマ：営業</p>
            <div className="condense-mock-row">
              <span className="condense-mock-key">核心の一行</span>
              <span className="condense-mock-val">売り込むな。相手に「必要だ」と気づかせよ。</span>
            </div>
            <div className="condense-mock-row">
              <span className="condense-mock-key">繰り返す原則</span>
              <span className="condense-mock-val">質問で導く／数字で語る／翌日に必ず動く</span>
            </div>
            <div className="condense-mock-row">
              <span className="condense-mock-key">次の一歩</span>
              <span className="condense-mock-val">次の商談で SPIN の質問リストを試す</span>
            </div>
          </div>
          <p className="mock-caption">画面はイメージです（3 冊のメモから生成した例）</p>
        </section>

        {/* ============ 6. マイ読書脳（貯めるほど効く） ============ */}
        <section className="feature feature-alt fade-in" aria-labelledby="f-brain">
          <p className="section-eyebrow">貯めるほど、効く</p>
          <h2 className="section-headline" id="f-brain">
            過去の自分に、<br />
            相談できる。
          </h2>
          <p className="feature-body">
            「チームの成果を上げるには？」と聞けば、<strong>あなたがこれまで残したメモだけ</strong>を根拠に、答えが返ってくる。どの本の、どのメモを参照したかも示されます。
          </p>
          <p className="feature-body">
            ネットの一般論ではない。<br className="sp-only" />
            自分の言葉でできた、第二の脳です。
          </p>

          <div className="screenshot-pair">
            <figure className="screenshot-step">
              <figcaption className="screenshot-step-label">① 質問する</figcaption>
              <PhoneFrame
                src="/lp/mybook-brain-asking.jpg"
                alt="マイ読書脳に「チームの営業成績を上げるには？」と質問を入力している画面"
                size="small"
                ratio="868/1427"
              />
            </figure>
            <div className="screenshot-arrow" aria-hidden="true">→</div>
            <figure className="screenshot-step">
              <figcaption className="screenshot-step-label">② 自分のメモから回答</figcaption>
              <PhoneFrame
                src="/lp/mybook-brain-answer-bottom.jpg"
                alt="参照した本とメモの一覧つきで返ってくる AI の回答画面"
                size="small"
                ratio="869/1131"
              />
            </figure>
          </div>
        </section>

        {/* ============ 7. 読む前・読む間 ============ */}
        <section className="before fade-in" aria-labelledby="f-before">
          <p className="section-eyebrow">もちろん、読む前から</p>
          <h2 className="section-headline" id="f-before">
            何を読むかで、<br />
            半分決まる。
          </h2>
          <div className="before-grid">
            <div className="before-item">
              <h3>AI 選書</h3>
              <p>いまの課題を話すと、AI が深掘りして「そのための本」を提案。読む前から、外さない一冊に出会えます。</p>
            </div>
            <div className="before-item">
              <h3>読書計画</h3>
              <p>「なぜ読むのか」を先に言葉に。重点的に読む章まで AI が絞るから、1 冊にかける時間が短くなります。</p>
            </div>
            <div className="before-item">
              <h3>一行メモ</h3>
              <p>読みながら、心が動いた一行だけ。ページを写真に撮れば、AI が書き起こします。</p>
            </div>
          </div>
          <div className="before-screens">
            <PhoneFrame
              src="/lp/ai-recommendation.jpg"
              alt="AI 選書の画面。課題に合わせて本が理由つきで推薦されている"
              size="small"
              ratio="868/1424"
            />
            <PhoneFrame
              src="/lp/setup-sheet.jpg"
              alt="読書計画シートの画面。投資戦略と重点的に読む章が AI によって整理されている"
              size="small"
              ratio="868/1490"
            />
          </div>
        </section>

        {/* ============ 8. 比較（記録アプリとの違い） ============ */}
        <section className="compare fade-in" aria-labelledby="f-compare">
          <p className="section-eyebrow">記録で、終わらせない</p>
          <h2 className="section-headline" id="f-compare">
            「記録するアプリ」と、<br />
            何が違うのか。
          </h2>
          <p className="compare-lead">
            本を記録できるアプリは、たくさんあります。<br />
            Orime が向き合うのはその先——<strong>「読んだのに、身につかない」</strong>です。
          </p>

          <div className="compare-table" role="table" aria-label="一般的な読書管理アプリとOrimeの比較">
            <div className="compare-row compare-head" role="row">
              <span className="compare-axis" role="columnheader" aria-label="比較項目" />
              <span className="compare-col" role="columnheader">一般的な<br />記録アプリ</span>
              <span className="compare-col compare-us" role="columnheader">Orime</span>
            </div>
            {COMPARE_ROWS.map((r) => (
              <div className="compare-row" key={r.label} role="row">
                <span className="compare-axis" role="rowheader">{r.label}</span>
                <span className="compare-col compare-other" role="cell">{r.others}</span>
                <span className="compare-col compare-us" role="cell">{r.us}</span>
              </div>
            ))}
          </div>

          <StoreCta className="cta-secondary">違いを試してみる</StoreCta>
        </section>

        {/* ============ 8.5 社会的証明（実在の声がある時だけ表示） ============ */}
        {TESTIMONIALS.length > 0 && (
          <section className="testimonials fade-in" aria-label="お客様の声">
            <p className="section-eyebrow">使った人の声</p>
            <h2 className="section-headline">
              読みっぱなしから、<br />
              抜け出した人たち。
            </h2>
            <div className="testimonial-list">
              {TESTIMONIALS.map((t, i) => (
                <figure className="testimonial-card" key={i}>
                  <blockquote>{t.quote}</blockquote>
                  {t.attribution && <figcaption>— {t.attribution}</figcaption>}
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* ============ 9. ブランドストーリー（折り目） ============ */}
        <section className="story fade-in" aria-labelledby="f-story">
          <div className="story-card">
            <p className="section-eyebrow">名前の由来</p>
            <h2 className="section-headline" id="f-story">Orime は、「折り目」。</h2>
            <p className="story-body">
              大切なページの角を、そっと折る。<br />
              いつか戻ってくるための、小さな印。
            </p>
            <p className="story-body">
              Orime がやっているのは、あの折り目と同じことです。<br />
              心が動いた場所に印をつけて、<br />
              忘れた頃に、そのページへ連れ戻す。
            </p>
            <p className="story-close">読書は、読んだあとが本番だから。</p>
          </div>
        </section>

        {/* ============ 10. Pricing ============ */}
        <section className="pricing fade-in" aria-labelledby="f-pricing">
          <p className="section-eyebrow">料金</p>
          <h2 className="section-headline" id="f-pricing">
            迷わない、<br />
            ひとつの料金。
          </h2>

          <div className="price-card">
            {TRIAL_NOTE && (
              <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: '#5c5043' }}>
                🎁 まずは{TRIAL_NOTE}で、想起を体験
              </p>
            )}
            <div className="price-num" aria-label="月額1480円">
              <span className="price-yen">¥</span>
              <span className="price-main">1,480</span>
              <span className="price-period">/ 月（税込）</span>
            </div>
            <p className="price-equiv">
              年額プランなら <strong>¥12,800</strong>（月あたり約 ¥1,066）
            </p>

            <ul className="price-features">
              <li><Check size={16} strokeWidth={2.5} aria-hidden="true" /> 想起・行動・凝縮・マイ読書脳 すべて利用可</li>
              <li><Check size={16} strokeWidth={2.5} aria-hidden="true" /> AI 選書・読書計画・写真の書き起こしも込み</li>
              <li><Check size={16} strokeWidth={2.5} aria-hidden="true" /> 本の登録数・メモ数は無制限</li>
              <li><Check size={16} strokeWidth={2.5} aria-hidden="true" /> いつでも解約できます・違約金なし</li>
              <li><Check size={16} strokeWidth={2.5} aria-hidden="true" /> 解約してもメモは消えません</li>
            </ul>

            <StoreCta className="cta-primary cta-large">App Store でダウンロード</StoreCta>
            <p className="price-note">お支払いは App Store（Apple ID）経由です</p>
          </div>

          <div className="guarantee-row">
            <div className="g-item">
              <strong>解約は App Store で</strong>
              <p>サブスク設定からいつでも</p>
            </div>
            <div className="g-item">
              <strong>違約金ゼロ</strong>
              <p>解約手数料も一切なし</p>
            </div>
            <div className="g-item">
              <strong>データ保持</strong>
              <p>解約してもメモは残る</p>
            </div>
          </div>
        </section>

        {/* ============ 11. FAQ ============ */}
        <section className="faq fade-in" aria-labelledby="f-faq">
          <p className="section-eyebrow">よくある質問</p>
          <h2 className="section-headline" id="f-faq">気になることは、<br className="sp-only" />先に。</h2>
          <div className="faq-list">
            {FAQ_ITEMS.map((f) => (
              <details className="faq-item" key={f.q}>
                <summary>{f.q}<span className="faq-mark" aria-hidden="true" /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ============ 12. Final CTA ============ */}
        <section className="final-cta fade-in">
          <h2 className="final-headline">
            次の一冊から、<br />
            変えてみませんか。
          </h2>
          <p className="final-sub">
            今日残した一行が、<br className="sp-only" />
            一年後のあなたを助けにくる。
          </p>
          <StoreCta className="cta-primary cta-large cta-final">App Store でダウンロード</StoreCta>
          <p className="final-note">{PRICE_NOTE}</p>
        </section>
      </main>

      {/* ============ Footer ============ */}
      <footer className="lp-footer">
        <p className="lp-footer-brand">Orime</p>
        <p className="lp-footer-tag">読書の「読んだあと」を設計する</p>
        <div className="footer-links">
          <a href="/legal/terms">利用規約</a>
          <a href="/legal/privacy">プライバシーポリシー</a>
          <a href="/legal/sct">特定商取引法に基づく表記</a>
          <a href={`mailto:${SUPPORT_EMAIL}`}>お問い合わせ</a>
        </div>
        <p className="copyright">© 2026 Orime</p>
        {/* 🏷️ ビルド識別子。配信中の版が新旧どちらかを一目で判別するための控えめな表記。 */}
        <p className="build-stamp">{BUILD_LABEL}</p>
      </footer>
    </div>
  );
}
