// 🌱 Landing Page — Orime (絵文字削減・プロ版)
//
// 旧版から: 絵文字を 90% 削減 / serif 見出し + sans 本文 / 仮想ユーザー quote /
// データドリブン Pain セクション / 価値 + 安心訴求 / 紙テクスチャ背景。
// SVG アイコンは lucide-react 既存依存をそのまま使用。

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { BUILD_LABEL } from '../lib/buildInfo';
import './landing.css';

// 📱 App Store ダウンロード URL。
// ⚠️ TODO(developer): App Store 公開後、実際のアプリページ URL に差し替える。
//    （例: https://apps.apple.com/jp/app/orime/id0000000000）
//    公開前のプレースホルダのままだと App Store のトップに飛ぶだけなので、
//    審査通過・公開のタイミングで必ず実 URL を入れること。
const APP_STORE_URL = 'https://apps.apple.com/jp/app/orime';

const setMeta = (name, content, attr = 'name') => {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
};

// 🗣 社会的証明（お客様の声）枠。
// ⚠️ ここには「実在ユーザーの本物の声」だけを入れる。捏造・盛り・架空の数字は
//    絶対にNG（景表法・ステマ規制・ブランド思想の誠実さに反する）。許可を得た
//    実際の声が出てきたら 1〜2 件でも入れる。空の間はセクションごと非表示になる。
// 形式: { quote: 'ユーザーの言葉', attribution: '匿名可。例: 30代・営業 / X: @handle（許可を得た範囲で）' }
const TESTIMONIALS = [];

// 「記録型(無料の読書管理アプリ) vs 想起・活用型(Orime)」の対比。
// cold流入の最大の反論「無料で記録できるのに、なぜ有料？」に料金提示の直前で答える。
// ※存在しない機能は書かない（データ移行/CSVインポートは未実装なので主張しない）。
const COMPARE_ROWS = [
  { label: 'できること', others: '読んだ本の記録・本棚', us: '記録はもちろん' },
  { label: '読んだ後', others: '自分で見返す（つい忘れる）', us: '忘れた頃にそっと“想起”' },
  { label: '知識の活用', others: '探すのが手間', us: '自分のメモを根拠に AI が答える' },
  { label: '行動への接続', others: '記録で止まりがち', us: '1 冊から行動リスト＋追跡' },
  { label: '続く理由', others: '記録のやる気頼み', us: '“想起”が習慣を支える' },
];

export default function Landing() {
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Orime｜読書を、行動に変える読書メモ';
    const tags = [
      setMeta('description',
        '読みっぱなしを、やめる。Orime は、本の"折り目"のように大事な気づきを後から呼び戻し、行動に変える iOS 読書アプリ。月 ¥1,480、いつでも解約可能・データは残ります。App Store で公開中。'),
      setMeta('og:title', '読みっぱなしを、やめる。| Orime', 'property'),
      setMeta('og:description', '読んだ気づきを後から呼び戻し、行動に変える読書アプリ', 'property'),
      setMeta('og:type', 'website', 'property'),
    ];

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

    const handleScroll = () => setShowStickyCta(window.scrollY > 400);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

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
      }, { threshold: 0.1 });
      sections.forEach((s) => {
        observer.observe(s);
        fallbackTimers.push(setTimeout(() => s.classList.add('visible'), 1500));
      });
    } else {
      sections.forEach((s) => s.classList.add('visible'));
    }

    return () => {
      document.title = prevTitle;
      tags.forEach((el) => el && el.parentElement && el.parentElement.removeChild(el));
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

  // 📱 iOS アプリ専用サービスのため、すべての主要 CTA は App Store へ誘導する。
  //（利用は iOS アプリのみ。Web は紹介 LP の役割に専念する）
  const goToAppStore = () => { window.location.href = APP_STORE_URL; };
  // 既にアカウントを持つ人（LP に着地した既存ユーザー）向けのログイン導線。
  // 利用はアプリが中心だが、Web からでもログイン自体は可能なため残す。
  const goToLogin = () => { window.location.href = '/?auth=signin'; };

  return (
    <div className="lp-root">
      {/* ============ Sticky 下部 CTA ============ */}
      {showStickyCta && (
        <div className="sticky-cta" role="region" aria-label="申し込み">
          <div className="sticky-inner">
            <div className="sticky-price">
              <span className="sticky-price-main">月 ¥1,480</span>
              <span className="sticky-price-sub">iOS アプリ・いつでも解約OK</span>
            </div>
            <button type="button" onClick={goToAppStore} className="sticky-btn">
              App Store で入手 →
            </button>
          </div>
        </div>
      )}

      {/* ============ 1. Hero ============ */}
      <section className="hero">
        <p className="hero-eyebrow">読んだ本を、ちゃんと活かす。</p>
        <h1 className="hero-headline">
          読みっぱなしを、<br />
          やめる。
        </h1>
        <p className="hero-subhead">
          AI があなたの課題から本を選び、<br />
          読み方を整理し、行動の管理まで手伝います。<br />
          <br />
          読んで終わりにしない読書アプリです。
        </p>
        <button type="button" onClick={goToAppStore} className="cta-primary cta-hero">
          App Store でダウンロード →
        </button>
        <p className="hero-note">
          iPhone 専用アプリ・月 ¥1,480・いつでも解約OK・データは残ります
        </p>
        <p className="hero-login">
          すでにアカウントをお持ちの方は{' '}
          <button type="button" onClick={goToLogin} className="hero-login-link">ログイン</button>
        </p>

        {/* TODO(developer): 実数値が確定したら trust-bar を有効化する。
            嘘の数字 (例: "2,400+ ユーザー") を入れるのは絶対に NG なので
            実装段階では空にしておく。
            <div className="trust-bar">
              <div className="trust-item">
                <span className="trust-num">100+</span>
                <span className="trust-label">先行登録ユーザー</span>
              </div>
              ...
            </div>
        */}

        <div className="hero-mockup">
          <PhoneFrame
            src="/lp/hero-bookshelf.jpg"
            alt="Orime の本棚画面 — 6 冊が表紙付きで並ぶ"
            size="medium"
            float
          />
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 2. Pain（事実の提示・煽らない） ============ */}
      <section className="pain fade-in">
        <p className="section-eyebrow">よくある悩み</p>
        <h2 className="section-headline">
          「読んだのに、<br />
          覚えてない」。
        </h2>

        <p className="pain-conclusion">
          本の中身は、時間とともに薄れていきます。<br />
          <strong>Orime は、読んだことを思い出し、行動に変えるためのアプリです。</strong>
        </p>

        <button type="button" onClick={goToAppStore} className="cta-secondary">
          くわしく見る →
        </button>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 3. Mechanisms (数字主体・ペルソナ引用) ============ */}
      <section className="mechanisms fade-in">
        <p className="section-eyebrow">仕組み</p>
        <h2 className="section-headline">
          読書を活かす、<br />
          3 つの仕組み
        </h2>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">01</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>本選びの<span className="no-break">精度が上がる。</span></h3>
            <p className="mech-lead">
              買った本が「自分に刺さらなかった」<br />
              という経験は、誰にでもあります。
            </p>
            <p className="mech-body">
              AI 選書は、あなたの現在の課題を会話で深掘りし、年代・職業・状況に合わせた本だけを提案。買う前に「自分に必要かどうか」が判断できます。
            </p>
            <div className="mech-screenshot">
              <PhoneFrame
                src="/lp/ai-recommendation.jpg"
                alt="AI 選書による本の詳細推薦"
                size="small"
              />
            </div>
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">02</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>1 冊からの<span className="no-break">行動が増える。</span></h3>
            <p className="mech-lead">
              本を読んでも、なかなか行動に<br />
              つながらない——よくある悩みです。
            </p>
            <p className="mech-body">
              読む前に AI が「投資目的・現在の課題・仮説」を整理。重点的に読むべき章を提案するので、1 冊から具体的な行動を引き出しやすくなります。
            </p>
            <div className="mech-screenshot">
              <PhoneFrame
                src="/lp/setup-sheet.jpg"
                alt="AI が設計する読書計画シート (目標数値 / 投資戦略 / 重点的に読む箇所)"
                size="small"
              />
            </div>
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">03</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>知識の<span className="no-break">活用度が上がる。</span></h3>
            <p className="mech-lead">
              読んだ内容は、時間とともに忘れがち。<br />
              本棚に眠ったままになりがちです。
            </p>
            <p className="mech-body">
              過去に読んだ本のメモ・投資目的・行動が、あなた専用 AI に蓄積されます。「決断に迷う時の判断軸は？」と聞けば、過去の本の知識から、あなた専用の答えが返ってくる。
            </p>
            <div className="mech-screenshot mech-screenshot-double">
              <div className="screenshot-pair">
                <div className="screenshot-step">
                  <p className="screenshot-step-label">① 質問する</p>
                  <PhoneFrame
                    src="/lp/mybook-brain-asking.jpg"
                    alt="マイ読書脳に質問を入力している画面"
                    size="small"
                  />
                </div>
                <div className="screenshot-arrow" aria-hidden="true">→</div>
                <div className="screenshot-step">
                  <p className="screenshot-step-label">② 過去の本から回答</p>
                  <PhoneFrame
                    src="/lp/mybook-brain-answer-bottom.jpg"
                    alt="参照した本付きで返ってくる AI の回答"
                    size="small"
                  />
                </div>
              </div>
              <p className="screenshot-caption">
                質問するたびに、過去のメモから回答 + 参照した本が表示されます
              </p>
            </div>
          </div>
        </div>

      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 4. 行動管理アピール (action-management.jpg を主役に) ============ */}
      <section className="action-feature fade-in">
        <p className="section-eyebrow">読みっぱなしを防ぐ</p>
        <h2 className="section-headline">
          本から決めた行動を、<br />
          最後まで追跡する。
        </h2>

        <div className="action-feature-grid">
          <div className="action-feature-text">
            <p className="action-feature-lead">
              本を読んでも、行動が習慣にならなければ意味がない。
            </p>
            <ul className="action-feature-list">
              <li>📖 メモの一行から、そのまま行動に</li>
              <li>📅 期限・優先度・繰り返しを設定</li>
              <li>✅ 本を横断して「やること」を一覧</li>
              <li>💭 完了時に振り返りメモを残せる</li>
            </ul>
            <p className="action-feature-conclusion">
              読書 → 行動 → 振り返り のサイクルを<br />
              アプリ 1 つで完結します。
            </p>
          </div>

          <div className="action-feature-image">
            <PhoneFrame
              src="/lp/action-management.jpg"
              alt="行動管理画面 — 達成率 100% / 繰り返しタスク / 期限色分け"
              size="medium"
            />
          </div>
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 4.3 比較（記録型 vs 想起・活用型）= なぜ無料の記録アプリでは続かないか ============ */}
      <section className="compare fade-in" aria-label="他の読書アプリとの違い">
        <p className="section-eyebrow">記録で終わらせない</p>
        <h2 className="section-headline">
          無料の&quot;記録アプリ&quot;と、<br />
          何が違うのか。
        </h2>
        <p className="compare-lead">
          本を記録できるアプリはたくさんあります。Orime が向き合うのは、その先——<strong>「読んだのに、身につかない」</strong>です。
        </p>

        <div className="compare-table">
          <div className="compare-row compare-head">
            <span className="compare-axis" aria-hidden="true" />
            <span className="compare-col">一般的な<br />読書管理アプリ</span>
            <span className="compare-col compare-us">Orime</span>
          </div>
          {COMPARE_ROWS.map((r) => (
            <div className="compare-row" key={r.label}>
              <span className="compare-axis">{r.label}</span>
              <span className="compare-col compare-other">{r.others}</span>
              <span className="compare-col compare-us">{r.us}</span>
            </div>
          ))}
        </div>

        <p className="compare-note">
          これまで他の読書アプリで&quot;記録&quot;してきた方も、ここから<strong>&quot;思い出して活かす&quot;読書</strong>に切り替えられます。
        </p>
        <button type="button" onClick={goToAppStore} className="cta-secondary">
          違いを試してみる →
        </button>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 4.5 社会的証明（実在の声がある時だけ表示） ============ */}
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

      {TESTIMONIALS.length > 0 && <div className="lp-section-divider" aria-hidden="true" />}

      {/* ============ 5. Pricing ============ */}
      <section className="pricing fade-in">
        <p className="section-eyebrow">料金</p>
        <h2 className="section-headline">
          読書を、行動に。
        </h2>

        <div className="price-card">
          <div className="price-num">
            <span className="price-yen">¥</span>
            <span className="price-main">1,480</span>
            <span className="price-period">/ 月</span>
          </div>
          <p className="price-equiv">
            年額なら <strong>¥12,800</strong>（月あたり約 ¥1,066・お得）
          </p>

          <ul className="price-features">
            <li><Check size={16} strokeWidth={2.5} /> AI 選書 / 読書計画 / 行動管理 すべて利用可</li>
            <li><Check size={16} strokeWidth={2.5} /> マイ読書脳（過去の知識を AI 検索）</li>
            <li><Check size={16} strokeWidth={2.5} /> 本の登録数・メモ数 無制限</li>
            <li><Check size={16} strokeWidth={2.5} /> いつでも解約可能</li>
            <li><Check size={16} strokeWidth={2.5} /> 解約しても契約期間終了まで利用可</li>
            <li><Check size={16} strokeWidth={2.5} /> 違約金・手数料 ゼロ</li>
          </ul>

          <button type="button" onClick={goToAppStore} className="cta-primary cta-large">
            App Store でダウンロード →
          </button>
          <p className="price-note">
            iPhone 専用・お支払いは App Store・いつでも解約OK・データは残ります
          </p>
        </div>

        {/* 3 つの保証 (旧 Risk Reversal を Pricing 内に統合) */}
        <div className="guarantee-row">
          <div className="g-item">
            <strong>App Store で解約</strong>
            <p>サブスク設定からいつでも</p>
          </div>
          <div className="g-item">
            <strong>違約金ゼロ</strong>
            <p>解約手数料も一切なし</p>
          </div>
          <div className="g-item">
            <strong>データ保持</strong>
            <p>解約してもメモは消えない</p>
          </div>
        </div>
      </section>

      {/* ============ 6. 最終 CTA + FAQ (1 セクションに統合) ============ */}
      <section className="final-cta fade-in">
        <h2 className="final-headline">
          読みっぱなしを、<br />
          やめてみませんか。
        </h2>
        <p className="final-sub">
          読んで終わりにしない読書を、<br />
          AI と一緒に始めてみましょう。
        </p>
        <button type="button" onClick={goToAppStore} className="cta-primary cta-final cta-large">
          App Store でダウンロード →
        </button>
        <p className="final-note">
          iPhone 専用アプリ・月 ¥1,480・いつでも解約OK・データは残ります
        </p>

        <div className="faq-compact" role="region" aria-label="よくある質問">
          <p className="faq-compact-eyebrow">よくある質問</p>
          <details className="faq-compact-item">
            <summary>iPhone 以外でも使えますか？<span className="faq-compact-mark" aria-hidden="true" /></summary>
            <p>現在 Orime は <strong>iPhone（iOS）専用アプリ</strong>として App Store で公開しています。Android 版は今後検討中です。このページはサービスのご紹介ページで、ご利用には App Store からのインストールが必要です。</p>
          </details>
          <details className="faq-compact-item">
            <summary>解約は本当に簡単？<span className="faq-compact-mark" aria-hidden="true" /></summary>
            <p>iPhone の「設定 → 自分の名前 → サブスクリプション」からいつでも解約できます（App Store の標準の仕組み）。違約金や手数料は一切ありません。</p>
          </details>
          <details className="faq-compact-item">
            <summary>解約後、データは消えますか？<span className="faq-compact-mark" aria-hidden="true" /></summary>
            <p>消えません。解約後もアカウントとメモはすべて保持され、再開すればそのまま戻ります。契約期間内は引き続き全機能をご利用いただけます。</p>
          </details>
          <details className="faq-compact-item">
            <summary>料金はいくらですか？<span className="faq-compact-mark" aria-hidden="true" /></summary>
            <p>月 ¥1,480、または年額 ¥12,800（月あたり約 ¥1,066）で、すべての機能をご利用いただけます。お支払いは App Store 経由（Apple ID）です。いつでも解約でき、解約後もデータは残ります。</p>
          </details>
          <details className="faq-compact-item">
            <summary>使う時間がない人でも大丈夫？<span className="faq-compact-mark" aria-hidden="true" /></summary>
            <p>1 日 5 分から始められます。AI が「重点的に読む章」を絞ってくれるので、忙しい方ほど効果が出ます。</p>
          </details>
        </div>
      </section>

      {/* ============ Footer ============ */}
      <footer className="lp-footer">
        <p className="lp-footer-brand">Orime</p>
        <div className="footer-links">
          <a href="/legal/terms">利用規約</a>
          <a href="/legal/privacy">プライバシーポリシー</a>
          <a href="/legal/sct">特定商取引法に基づく表記</a>
          <a href="mailto:leverage.book0502@gmail.com">お問い合わせ</a>
        </div>
        <p className="copyright">© 2026 Orime</p>
        {/* 🏷️ ビルド識別子。配信中の版が新旧どちらかを一目で判別するための控えめな表記。
            （ログイン不要で確認できるよう、あえてランディング最下部に置く） */}
        <p
          className="build-stamp"
          style={{ fontSize: 10, color: '#b3a994', marginTop: 6, letterSpacing: 0.3 }}
        >
          {BUILD_LABEL}
        </p>
      </footer>
    </div>
  );
}

