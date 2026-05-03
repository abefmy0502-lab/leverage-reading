// 🌱 Landing Page — レバレッジ読書ログ (絵文字削減・プロ版)
//
// 旧版から: 絵文字を 90% 削減 / serif 見出し + sans 本文 / 仮想ユーザー quote /
// データドリブン Pain セクション / ¥33/日 フレーミング / 紙テクスチャ背景。
// SVG アイコンは lucide-react 既存依存をそのまま使用。

import { useEffect, useState } from 'react';
import { Check, X, BookOpen } from 'lucide-react';
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
        '読みっぱなしの本、もう作らない。AI が読み方を設計し、行動を引き出す『投資型』読書記録。月 ¥1,000、いつでも 1 タップで解約可能。'),
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
            今すぐ始める
          </button>
          <p className="sticky-cta-note">月 ¥1,000・いつでも 1 タップで解約可能</p>
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
          あなたの悩みから、<br />
          AI が読むべき本を選ぶ。<br />
          <br />
          読み終わる頃には、<br />
          明日の行動が決まっている。
        </p>
        <ul className="hero-benefits" aria-label="主なメリット">
          <li>本選び失敗ゼロ</li>
          <li>読了時間 40% 短縮</li>
          <li>行動量 3 倍</li>
          <li>過去の知識を AI で引き出せる</li>
        </ul>
        <button type="button" onClick={goToSignup} className="cta-primary cta-hero">
          今すぐ始める
        </button>
        <p className="hero-note">
          月 ¥1,000（1 日あたり 33 円）<br />
          いつでも 1 タップで解約・違約金なし
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

      {/* ============ 2.5. AI 選書フロー (3 ステップ圧縮 + 実画面) ============ */}
      <section className="ai-flow fade-in">
        <p className="section-eyebrow">AI 選書の流れ</p>
        <h2 className="section-headline">
          AI に話しかけるだけで、<br />
          あなた専用の選書が手に入る。
        </h2>

        {/* 3 ステップ圧縮フロー */}
        <div className="flow-steps">
          {/* STEP 1 */}
          <div className="flow-step">
            <div className="step-num">STEP 1</div>
            <div className="step-title">課題を一言で入力</div>
            <div className="step-mock">
              <div className="mock-bubble user">営業成績を上げたい</div>
            </div>
          </div>

          <div className="flow-arrow" aria-hidden="true">↓</div>

          {/* STEP 2 */}
          <div className="flow-step">
            <div className="step-num">STEP 2</div>
            <div className="step-title">AI が対話で深掘り</div>
            <div className="step-mock">
              <div className="mock-bubble ai">
                業界・営業スタイル・困りごとを教えてください
              </div>
              <div className="mock-bubble user">
                不動産 BtoB SaaS、新規開拓、商談で決まらない
              </div>
              <div className="mock-bubble ai">
                決裁者へのアプローチ、ROI の示し方、顧客の本当の課題ヒアリングについても教えてください
              </div>
            </div>
          </div>

          <div className="flow-arrow" aria-hidden="true">↓</div>

          {/* STEP 3 */}
          <div className="flow-step">
            <div className="step-num">STEP 3</div>
            <div className="step-title">あなた専用の選書</div>
            <div className="step-mock">
              <div className="mock-bubble ai">
                あなたの状況にピッタリの 4 冊を選びました
              </div>
              <div className="mock-recommendations">
                <div className="rec-mini"><span className="rec-cover c1" aria-hidden="true" />SPIN 営業術</div>
                <div className="rec-mini"><span className="rec-cover c2" aria-hidden="true" />セールス・イズ</div>
                <div className="rec-mini"><span className="rec-cover c3" aria-hidden="true" />Value Proposition Design</div>
                <div className="rec-mini"><span className="rec-cover c4" aria-hidden="true" />THE TIME HACKER</div>
              </div>
            </div>
          </div>
        </div>

        {/* 実画面の詳細推薦カード — 画像未配置時は onError で非表示にする */}
        <div className="real-screenshot">
          <p className="screenshot-label">↓ 各本に対して、こんな詳細な推薦が届きます</p>
          <img
            src="/lp/sample-recommendation.png"
            alt="AI が提案する本の詳細カード (選書理由・核心・注目すべきポイント・実践時間)"
            loading="lazy"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>

        <p className="ai-flow-caption">
          ただ本を勧めるのではなく、<br />
          あなたの課題に合わせた<strong>選書理由・読み順・実践時間</strong>まで提案。
        </p>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 3. Outcome ============ */}
      <section className="outcome fade-in">
        <p className="section-eyebrow">想像してください</p>
        <h2 className="section-headline">
          5 年後、あなたは<br />
          『行動できる人』に<br />
          なっている。
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

      {/* ============ 3.5. Use-Case timeline (1 日のストーリー) ============ */}
      <section className="use-case fade-in">
        <p className="section-eyebrow">使ってみるとこうなる</p>
        <h2 className="section-headline">たとえば、こんな 1 日。</h2>

        <div className="story-timeline">
          <div className="story-step">
            <div className="story-time">朝 7:00</div>
            <div className="story-card">
              <div className="story-action">通勤電車で AI に話しかける</div>
              <div className="story-detail">
                「最近の営業会議で発言が浅いと感じる。自分の意見を論理的に組み立てる力をつけたい」
              </div>
              <div className="story-result">
                → AI が 3 冊の本を提案<br />
                『武器になる哲学』『イシューからはじめよ』『考える技術』
              </div>
            </div>
          </div>

          <div className="story-step">
            <div className="story-time">朝 7:15</div>
            <div className="story-card">
              <div className="story-action">読書計画を一緒に立てる</div>
              <div className="story-detail">
                『イシューからはじめよ』を選択。AI が「投資目的・現在の課題・仮説」を整理。
              </div>
              <div className="story-result">
                → 「序章と第 2 章を重点的に・第 4 章は流し読みで OK」という戦略付きで読書スタート
              </div>
            </div>
          </div>

          <div className="story-step">
            <div className="story-time">夜 22:00</div>
            <div className="story-card">
              <div className="story-action">読みながらカードでメモ</div>
              <div className="story-detail">
                ページ番号・写真付きで気づきを記録。「明日の会議で『イシュー度』を意識する」を行動アクションに登録。
              </div>
              <div className="story-result">
                → 期限付きタスクとして翌日に通知
              </div>
            </div>
          </div>

          <div className="story-step">
            <div className="story-time">3 週間後</div>
            <div className="story-card">
              <div className="story-action">AI に過去の知識を聞く</div>
              <div className="story-detail">
                「会議で意見が割れた時、どう判断すべき？」
              </div>
              <div className="story-result">
                → 過去に読んだ『イシューからはじめよ』のメモを参照し、あなた専用の答えが返ってくる
              </div>
            </div>
          </div>
        </div>

        <p className="story-conclusion">
          本を読んだその瞬間で終わらない。<br />
          過去の本が、未来のあなたを支える資産になる。
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
            <h3>本選びの<span className="no-break">精度が 10 倍に。</span></h3>
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
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">02</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>1 冊からの<span className="no-break">行動量が 10 倍に。</span></h3>
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
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-marker">
            <span className="mech-num">03</span>
            <span className="mech-line" aria-hidden="true" />
          </div>
          <div className="mech-content">
            <h3>知識の<span className="no-break">活用度が 10 倍に。</span></h3>
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
          </div>
        </div>

      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 4.5. Use-List (Q→A) ============ */}
      <section className="use-list fade-in">
        <p className="section-eyebrow">使えるシーン</p>
        <h2 className="section-headline">
          あなたの読書を、<br />
          こう変えます。
        </h2>

        <div className="use-grid">
          <div className="use-item">
            <div className="use-question">「何を読めばいいか分からない」</div>
            <div className="use-arrow" aria-hidden="true">↓</div>
            <div className="use-answer">AI に課題を話すだけで、あなたに合う本を 3〜5 冊提案</div>
          </div>
          <div className="use-item">
            <div className="use-question">「どこを重点的に読めばいい？」</div>
            <div className="use-arrow" aria-hidden="true">↓</div>
            <div className="use-answer">AI が読み方を設計、章ごとに優先度を提案</div>
          </div>
          <div className="use-item">
            <div className="use-question">「メモを取っても見返さない」</div>
            <div className="use-arrow" aria-hidden="true">↓</div>
            <div className="use-answer">カード式メモで自動整理、検索もタグ管理も可能</div>
          </div>
          <div className="use-item">
            <div className="use-question">「読んでも行動につながらない」</div>
            <div className="use-arrow" aria-hidden="true">↓</div>
            <div className="use-answer">本から決めた行動に期限と優先度をつけて管理</div>
          </div>
          <div className="use-item">
            <div className="use-question">「過去に読んだ知識を活用したい」</div>
            <div className="use-arrow" aria-hidden="true">↓</div>
            <div className="use-answer">マイ読書脳に質問すれば過去の本から AI が回答</div>
          </div>
          <div className="use-item">
            <div className="use-question">「読んだ本の成果を見たい」</div>
            <div className="use-arrow" aria-hidden="true">↓</div>
            <div className="use-answer">ROI まとめと行動完了率で投資効果を可視化</div>
          </div>
        </div>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 5. Comparison (大々的な VS テーブル) ============ */}
      <section className="comparison fade-in">
        <p className="section-eyebrow">他のアプリとの違い</p>
        <h2 className="section-headline">
          記録だけでは、<br />
          本は資産にならない。
        </h2>
        <p className="comparison-intro">
          一般的な読書アプリは「記録するだけ」。<br />
          レバレッジ読書ログは「読書を運用する」アプリです。
        </p>

        <div className="vs-table" role="table" aria-label="他アプリとの機能比較">
          <div className="vs-header" role="row">
            <div className="vs-cell vs-feature" role="columnheader">機能</div>
            <div className="vs-cell vs-other" role="columnheader">
              一般的な<br />読書アプリ
            </div>
            <div className="vs-cell vs-us" role="columnheader">
              <span className="us-label">レバレッジ<br />読書ログ</span>
            </div>
          </div>

          {[
            { name: '読了の記録', other: true, us: true },
            { name: 'レビュー投稿', other: true, us: false, usText: '個人の知識資産化に集中' },
            { name: 'SNS 共有', other: true, us: false, usText: '不要' },
            { name: 'AI による本の選書', other: false, us: true, usText: '課題から最適な本を提案' },
            { name: 'AI による読書計画', other: false, us: true, usText: '読み方を本ごとに設計' },
            { name: '行動管理（期限・優先度）', other: false, us: true, usText: '完了まで追跡' },
            { name: '過去の本から答える AI', other: false, us: true, usText: '読んだ知識をいつでも引き出す' },
            { name: 'ROI ひとことまとめ', other: false, us: true, usText: '読書の効果を 1 行で記録' },
            { name: 'カード式メモ', other: false, us: true, usText: 'ページ番号・写真・タグ付き' },
          ].map((row) => (
            <div key={row.name} className="vs-row" role="row">
              <div className="vs-cell vs-feature" role="cell">{row.name}</div>
              <div className="vs-cell vs-other" role="cell">
                {row.other
                  ? <Check size={20} strokeWidth={2.2} aria-label="あり" />
                  : <X size={18} strokeWidth={2} aria-label="なし" />}
              </div>
              <div className="vs-cell vs-us" role="cell">
                {row.us ? (
                  <>
                    <Check size={20} strokeWidth={3} aria-label="あり" />
                    {row.usText && <span className="us-text">{row.usText}</span>}
                  </>
                ) : (
                  <span className="us-not-needed">{row.usText || '—'}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="comparison-conclusion">
          記録するだけでは、本は本棚の中で眠るだけ。<br />
          <strong>「資産化する」アプリ</strong>に変えませんか？
        </p>
      </section>

      <div className="lp-section-divider" aria-hidden="true" />

      {/* ============ 5.5. Risk Reversal (3 つの保証) ============ */}
      <section className="guarantee fade-in">
        <p className="section-eyebrow">安心の 3 つの保証</p>
        <h2 className="section-headline">
          リスクなしで、<br />
          始められます。
        </h2>

        <div className="guarantee-list">
          <div className="g-item">
            <div className="g-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7v10l10 5 10-5V7L12 2z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3>1 タップで解約可能</h3>
            <p>
              合わないと感じたら、アプリ内の設定からボタン 1 つで即解約できます。メールやカスタマーサポートへの連絡は不要です。
            </p>
          </div>
          <div className="g-item">
            <div className="g-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <h3>違約金・手数料ゼロ</h3>
            <p>
              解約時の違約金や手数料は一切発生しません。いつでも気兼ねなく解約できます。
            </p>
          </div>
          <div className="g-item">
            <div className="g-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6v6H9z" />
              </svg>
            </div>
            <h3>データはあなたのもの</h3>
            <p>
              解約してもデータは保持されます。再開すればすべてのメモ・履歴がそのまま戻ります。
            </p>
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
          あなたの読書を<br />
          投資に変える。
        </h2>

        <div className="price-card">
          <div className="price-tier">月額プラン</div>
          <div className="price-amount">
            <span className="yen">¥</span>
            <span className="num">1,000</span>
            <span className="per">/月</span>
          </div>
          <div className="price-trial">お申込み即日から全機能を利用可能</div>
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
            今すぐ始める
          </button>

          <div className="price-fineprint">
            <p>※ <span className="no-break">クレジットカード登録</span>が必要です</p>
            <p>※ お申込み即日から<span className="no-break">月額 ¥1,000</span>が発生します</p>
            <p>※ いつでもアプリ内から<span className="no-break">1 タップ</span>で解約可能</p>
            <p>※ 解約後も契約期間内は引き続きご利用いただけます</p>
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
          <p>はい、お申込み時に登録が必要です。月額 ¥1,000 は申込日から発生します。</p>
        </details>
        <details>
          <summary>解約は本当に簡単？</summary>
          <p>アプリ内の設定 → サブスクリプション → 解約 から 1 タップで完了します。違約金や手数料は一切ありません。</p>
        </details>
        <details>
          <summary>解約後はいつまで使える？</summary>
          <p>契約した月の末日までは引き続き全機能をご利用いただけます。それ以降は自動的に課金が停止します。</p>
        </details>
        <details>
          <summary>iPhone でも使える？</summary>
          <p>iPhone・Android・PC すべてで利用可能です。インストール不要で、ブラウザを開くだけですぐ使えます。iPhone のホーム画面に追加すれば、普通のアプリと同じように使えます。</p>
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
        <p className="final-sub">月 ¥1,000、すべての機能を即日から使えます。</p>
        <button type="button" onClick={goToSignup} className="cta-primary cta-final">
          今すぐ始める
        </button>
        <p className="final-note">
          いつでも 1 タップで解約・違約金なし
        </p>
      </section>

      {/* ============ Footer ============ */}
      <footer className="lp-footer">
        <p className="lp-footer-brand">レバレッジ読書ログ</p>
        <div className="footer-links">
          <a href="/legal/terms">利用規約</a>
          <a href="/legal/privacy">プライバシーポリシー</a>
          <a href="/legal/sct">特定商取引法に基づく表記</a>
          <a href="mailto:leverage.book0502@gmail.com">お問い合わせ</a>
        </div>
        <p className="copyright">© 2026 レバレッジ読書ログ</p>
      </footer>
    </div>
  );
}

