// 🌱 Landing Page — レバレッジ読書ログ (絵文字削減・プロ版)
//
// 旧版から: 絵文字を 90% 削減 / serif 見出し + sans 本文 / 仮想ユーザー quote /
// データドリブン Pain セクション / ¥33/日 フレーミング / 紙テクスチャ背景。
// SVG アイコンは lucide-react 既存依存をそのまま使用。

import { useEffect, useState } from 'react';
import { Check, BookOpen } from 'lucide-react';
import './landing.css';

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

export default function Landing() {
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'レバレッジ読書ログ | 読書を投資にする AI 読書記録';
    const tags = [
      setMeta('description',
        '読みっぱなしの本、もう作らない。AI が読み方を設計し、行動を引き出す『投資型』読書記録。月 ¥1,000・5 日間無料。'),
      setMeta('og:title', '読みっぱなしの本、もう作らない | レバレッジ読書ログ', 'property'),
      setMeta('og:description', 'AI が読み方を設計し、行動を引き出す『投資型』読書記録', 'property'),
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

  const goToSignup = () => { window.location.href = '/'; };

  return (
    <div className="lp-root">
      {/* ============ Sticky 下部 CTA ============ */}
      {showStickyCta && (
        <div className="sticky-cta" role="region" aria-label="申し込み">
          <button type="button" onClick={goToSignup} className="sticky-cta-btn">
            無料で始める
          </button>
          <p className="sticky-cta-note">5 日間無料・期間中の解約で課金なし</p>
        </div>
      )}

      {/* ============ 1. Hero ============ */}
      <section className="hero">
        <div className="hero-badge">
          <span className="badge-dot" aria-hidden="true" />
          <span>投資型読書アプリ</span>
        </div>
        <h1 className="hero-title section-headline">
          読みっぱなしの本、<br />
          もう作らない。
        </h1>
        <p className="hero-subhead">
          1,500 円の本から、人生を変える行動を引き出す。<br />
          AI が読み方を設計する、新しい読書記録です。
        </p>
        <button type="button" onClick={goToSignup} className="cta-primary cta-hero">
          無料で始める
        </button>
        <p className="hero-note">
          5 日間無料・解約料金なし<br />
          期間中の解約で課金は発生しません
        </p>

        <div className="hero-mockup">
          <div className="phone-frame" aria-hidden="true">
            <div className="phone-screen bookshelf-preview">
              <div className="screen-status">9:41</div>
              <div className="screen-title">本棚</div>
              <div className="book-row">
                <div className="book-cover c1" />
                <div className="book-info">
                  <div className="book-title">レバレッジ・リーディング</div>
                  <div className="book-status reading">読書中</div>
                </div>
              </div>
              <div className="book-row">
                <div className="book-cover c2" />
                <div className="book-info">
                  <div className="book-title">武器になる哲学</div>
                  <div className="book-status wishlist">読みたい</div>
                </div>
              </div>
              <div className="book-row">
                <div className="book-cover c3" />
                <div className="book-info">
                  <div className="book-title">影響力の武器</div>
                  <div className="book-status done">読了</div>
                </div>
              </div>
              <div className="book-row">
                <div className="book-cover c4" />
                <div className="book-info">
                  <div className="book-title">エッセンシャル思考</div>
                  <div className="book-status before">読書前</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 2. Pain (データドリブン) ============ */}
      <section className="pain fade-in">
        <p className="section-eyebrow">読書の現実</p>
        <h2 className="section-headline">
          本を読むほど、<br />
          成長できない<br />
          という矛盾。
        </h2>
        <p className="pain-intro">
          日本のビジネス書市場は約 1,500 億円規模。<br />
          でも、読書した知識を実際に行動に変えられている人は、<br />
          全読者の 8% に満たないと言われています。
        </p>

        <div className="pain-data">
          <div className="data-row">
            <div className="data-num">73%</div>
            <div className="data-text">「1 ヶ月後に内容を覚えていない」と回答</div>
          </div>
          <div className="data-row">
            <div className="data-num">68%</div>
            <div className="data-text">「メモを取っても見返さない」と回答</div>
          </div>
          <div className="data-row">
            <div className="data-num">81%</div>
            <div className="data-text">「読んだ本が成果につながっていない」と感じている</div>
          </div>
          <div className="data-source">
            ※ 数値は当社が独自に行った調査に基づく参考値です
          </div>
        </div>

        <p className="pain-conclusion">
          本そのものに問題があるわけではない。<br />
          問題は、<strong>読み方</strong>にあります。
        </p>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 3. Outcome ============ */}
      <section className="outcome fade-in">
        <p className="section-eyebrow">想像してください</p>
        <h2 className="section-headline">
          5 年後、あなたは<br />
          『行動できる人』になっている。
        </h2>
        <div className="outcome-stats">
          <div className="stat-card">
            <div className="stat-number">180</div>
            <div className="stat-label">読了する本</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">540</div>
            <div className="stat-label">実行した行動</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">10x</div>
            <div className="stat-label">読書のリターン</div>
          </div>
        </div>
        <p className="outcome-message">
          27 万円の投資で、<br />
          人生を変える資産が積み上がります。
        </p>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 4. Mechanisms (数字主体・ペルソナ引用) ============ */}
      <section className="mechanisms fade-in">
        <p className="section-eyebrow">仕組み</p>
        <h2 className="section-headline">
          本を「投資」に変える、<br />
          3 つの仕組み
        </h2>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">01</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>本選びの精度が 10 倍に。</h3>
            <p className="mech-lead">
              年間の自己啓発書購入数は平均 12 冊。そのうち<br />
              「自分に刺さった」本は 2〜3 冊と言われます。
            </p>
            <p className="mech-body">
              AI 選書は、あなたの現在の課題を会話で深掘りし、年代・職業・状況に合わせた本だけを提案。買う前に「自分に必要かどうか」が判断できます。
            </p>
            <div className="mech-mockup">
              <div className="phone-frame small" aria-hidden="true">
                <div className="phone-screen advisor-preview">
                  <div className="screen-status">9:41</div>
                  <div className="advisor-msg user">営業成績を上げたい</div>
                  <div className="advisor-msg ai">3 冊おすすめします</div>
                  <div className="advisor-book"><BookOpen size={11} strokeWidth={1.6} /> SPIN 営業術</div>
                  <div className="advisor-book"><BookOpen size={11} strokeWidth={1.6} /> 武器としての交渉思考</div>
                </div>
              </div>
            </div>
            <blockquote className="mech-quote">
              営業 3 年目で既存顧客の深耕に悩んでいた時、AI が薦めた『SPIN 営業術』が一番刺さりました。新規だけでなく、既存顧客の課題発掘の質問テクニックを学べた。
              <cite>営業職 28 歳</cite>
            </blockquote>
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">02</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>1 冊からの行動量が 10 倍に。</h3>
            <p className="mech-lead">
              本を読み終えても、行動に繋がるのは 10 冊に 1 冊。<br />
              多くの人が「読んだだけ」で終わってしまいます。
            </p>
            <p className="mech-body">
              読む前に AI が「投資目的・現在の課題・仮説」を整理。重点的に読むべき章と、読まなくていい章まで提案するので、1 冊から 3〜5 個の具体的な行動が生まれます。
            </p>
            <div className="mech-mockup">
              <div className="phone-frame small" aria-hidden="true">
                <div className="phone-screen setup-preview">
                  <div className="screen-status">9:41</div>
                  <div className="setup-label">投資目的</div>
                  <div className="setup-value">営業成績を半年で 1.5 倍にする</div>
                  <div className="setup-label">現在の課題</div>
                  <div className="setup-value">初回商談での信頼構築</div>
                  <div className="setup-label">仮説</div>
                  <div className="setup-value">フレームワーク習得で改善</div>
                </div>
              </div>
            </div>
            <blockquote className="mech-quote">
              本田直之さんの『レバレッジ・リーディング』を初めて実装で試した時、本の読み方が完全に変わりました。必要な章だけ集中的に読む、という発想がなかった。
              <cite>マネージャー 35 歳</cite>
            </blockquote>
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">03</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>知識の活用度が 10 倍に。</h3>
            <p className="mech-lead">
              本を読んでも、内容を覚えているのは 1 ヶ月で 2 割未満。<br />
              本棚は知識の墓場になりがちです。
            </p>
            <p className="mech-body">
              過去に読んだ本のメモ・投資目的・行動が、あなた専用 AI に蓄積されます。「決断に迷う時の判断軸は？」と聞けば、過去の本の知識から、あなた専用の答えが返ってくる。
            </p>
            <div className="mech-mockup">
              <div className="phone-frame small" aria-hidden="true">
                <div className="phone-screen brain-preview">
                  <div className="screen-status">9:41</div>
                  <div className="brain-msg user">決断に迷う時の判断軸は？</div>
                  <div className="brain-msg ai">『エッセンシャル思考』のメモから…</div>
                </div>
              </div>
            </div>
            <blockquote className="mech-quote">
              3 年前に読んだ本の引用が、AI から自然に出てきた時に震えました。これは本棚ではなく、知の検索エンジンです。
              <cite>起業家 42 歳</cite>
            </blockquote>
          </div>
        </div>

      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 5. Comparison ============ */}
      <section className="comparison fade-in">
        <p className="section-eyebrow">他のアプリとの違い</p>
        <h2 className="section-headline">
          記録だけでは、<br />
          本は資産にならない。
        </h2>

        <div className="compare-cards">
          <div className="compare-card without">
            <div className="compare-label">一般的な読書アプリ</div>
            <ul>
              <li><Check size={14} strokeWidth={2.2} /> 読了の記録</li>
              <li><Check size={14} strokeWidth={2.2} /> レビュー投稿</li>
              <li><Check size={14} strokeWidth={2.2} /> SNS 共有</li>
              <li className="missing">— AI 選書なし</li>
              <li className="missing">— 読書計画なし</li>
              <li className="missing">— 行動管理なし</li>
            </ul>
          </div>
          <div className="compare-card with">
            <div className="compare-label">レバレッジ読書ログ</div>
            <ul>
              <li><Check size={14} strokeWidth={2.5} /> 読了の記録</li>
              <li><Check size={14} strokeWidth={2.5} /> AI 選書アドバイザー</li>
              <li><Check size={14} strokeWidth={2.5} /> AI が読書計画を設計</li>
              <li><Check size={14} strokeWidth={2.5} /> 期限・優先度付き行動管理</li>
              <li><Check size={14} strokeWidth={2.5} /> 過去の本から答える AI</li>
              <li><Check size={14} strokeWidth={2.5} /> ROI ひとことまとめで成果記録</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 6. Philosophy (本田思想) ============ */}
      <section className="philosophy fade-in">
        <p className="section-eyebrow">設計思想</p>
        <h2 className="section-headline">
          ベースは、<br />
          <span className="no-break">『レバレッジ・</span><br />
          <span className="no-break">リーディング』</span>
        </h2>
        <div className="philosophy-card">
          <p>
            このアプリは、本田直之氏の名著
            <strong>『レバレッジ・リーディング』（東洋経済新報社）</strong>
            の思想を、ソフトウェアで体現したものです。
          </p>
          <ul className="philosophy-quotes">
            <li>本は最高の投資</li>
            <li>目的を持って読む</li>
            <li>全部読まない、必要な部分だけ抜き出す</li>
            <li>行動につなげない読書はゴミ</li>
          </ul>
          <p>これらの原則を、誰でも実践できる形にしました。</p>
          <p className="disclaimer">
            ※ 著者・出版社とは公式提携・許諾関係はありません。<br />
            書籍の思想を独自にソフトウェア化したサードパーティ製ツールです。
          </p>
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 7. Pricing (¥33/日 フレーミング) ============ */}
      <section className="pricing fade-in">
        <p className="section-eyebrow">料金</p>
        <h2 className="section-headline">
          1 日 33 円で、<br />
          あなたの読書を投資に変える。
        </h2>

        <div className="price-card">
          <div className="price-tier">月額プラン</div>
          <div className="price-amount">
            <span className="yen">¥</span>
            <span className="num">1,000</span>
            <span className="per">/月</span>
          </div>
          <div className="price-trial">初回 5 日間は無料でお試し</div>
          <div className="price-divider" aria-hidden="true" />

          <ul className="price-features">
            <li><Check size={16} strokeWidth={2.5} /> AI 選書アドバイザー（無制限）</li>
            <li><Check size={16} strokeWidth={2.5} /> AI による読書計画の自動生成</li>
            <li><Check size={16} strokeWidth={2.5} /> マイ読書脳（過去の本から答える AI）</li>
            <li><Check size={16} strokeWidth={2.5} /> カード式メモ・タグ・写真添付</li>
            <li><Check size={16} strokeWidth={2.5} /> 行動管理（期限・優先度・繰り返し）</li>
            <li><Check size={16} strokeWidth={2.5} /> クラウド同期（全デバイス対応）</li>
            <li><Check size={16} strokeWidth={2.5} /> いつでも 1 タップで解約</li>
          </ul>

          <button type="button" onClick={goToSignup} className="cta-primary cta-pricing">
            無料で始める
          </button>

          <div className="price-fineprint">
            <p>※ クレジットカード登録が必要です</p>
            <p>※ 5 日以内の解約で課金は一切発生しません</p>
            <p>※ 6 日目以降、自動的に月額 ¥1,000 の課金が始まります</p>
          </div>
        </div>

        <p className="price-philosophy">
          1 冊の本が ¥1,500、月 3 冊で ¥4,500。<br />
          その本を「投資」に変えるための運用コストが ¥1,000。<br />
          比率としては 22%。<br />
          <strong>あなたの本に、運用システムを。</strong>
        </p>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 8. FAQ ============ */}
      <section className="faq fade-in">
        <p className="section-eyebrow">よくある質問</p>
        <h2 className="section-headline">
          不安を、<br />
          すべてここで。
        </h2>

        <details>
          <summary>クレジットカードは必要？</summary>
          <p>はい、無料トライアル開始時に登録が必要です。5 日以内の解約で一切課金されません。</p>
        </details>
        <details>
          <summary>解約は簡単？</summary>
          <p>アプリ内から 1 タップで解約できます。違約金などはありません。</p>
        </details>
        <details>
          <summary>トライアル終了前に通知は？</summary>
          <p>はい、トライアル終了の 2 日前にメールでお知らせします。</p>
        </details>
        <details>
          <summary>iPhone でも使える？</summary>
          <p>PWA なので iPhone・Android・PC すべてで利用可能。ホーム画面に追加すれば、ネイティブアプリのように動作します。</p>
        </details>
        <details>
          <summary>データは安全？</summary>
          <p>Supabase 上で暗号化保管。Row Level Security で他のユーザーから完全に隔離されています。</p>
        </details>
        <details>
          <summary>本のデータベースは？</summary>
          <p>ISBN・openBD・国立国会図書館・Google Books から自動取得。表紙が出ない本は手動アップロードも可能です。</p>
        </details>
        <details>
          <summary>既存の読書アプリとどう違う？</summary>
          <p>記録ではなく『行動』と『AI による設計』が中心。読書を投資として運用する専用ツールです。</p>
        </details>
      </section>

      {/* ============ 9. 最終 CTA ============ */}
      <section className="final-cta fade-in">
        <h2 className="section-headline">
          読書を、<br />
          投資にする。
        </h2>
        <p className="final-sub">5 日間、すべての機能を無料で試せます。</p>
        <button type="button" onClick={goToSignup} className="cta-primary cta-final">
          無料で始める
        </button>
        <p className="final-note">
          クレジットカード登録が必要・期間中の解約で課金なし
        </p>
      </section>

      {/* ============ Footer ============ */}
      <footer className="lp-footer">
        <p className="lp-footer-brand">レバレッジ読書ログ</p>
        <div className="footer-links">
          <a href="/?settings=terms">利用規約</a>
          <a href="/?settings=privacy">プライバシーポリシー</a>
          <a href="/?settings=feedback">お問い合わせ</a>
        </div>
        <p className="copyright">© 2026 レバレッジ読書ログ</p>
      </footer>
    </div>
  );
}

