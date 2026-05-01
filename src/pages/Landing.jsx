// 🌱 Landing Page — レバレッジ読書ログ (モバイルファースト構成)
//
// 設計原則:
//   1. モバイル (375px) で完璧に動くことが最優先
//   2. iPhone モックは縦長 1 台ずつ (横並び禁止)
//   3. 1 セクション 1 メッセージ
//   4. Sticky 下部 CTA でスクロール中に常時「無料で始める」
//   5. IntersectionObserver で fade-in、prefers-reduced-motion で停止
//
// 構成 (上から順):
//   Sticky CTA (scrollY > 400 で出現)
//   1. Hero          (縦長モック 1 台)
//   2. Pain          (悩み 4 つ縦並び)
//   3. Outcome       (5 年後の数字 3 カード)
//   4. Mechanisms    (3 つの仕組み + 各仕組みに縦長モック)
//   5. Comparison    (一般的アプリ vs 自社、縦並び)
//   6. Philosophy    (本田思想カード + 著作権 disclaimer)
//   7. Pricing       (¥1,000 / 月の大きい価格カード)
//   8. FAQ           (アコーディオン 7 問)
//   9. Final CTA     (グラデ背景・大きい)
//   Footer

import { useEffect, useState } from 'react';
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

    // ⚠ 重要: メインアプリの index.css は html/body/#root を
    //   height: 100dvh; overflow: hidden  (LINE 風 flex column 用)
    // で組んでいる。LP では #root も含めてスクロールを許可する必要がある。
    // 'lp-active' クラスを 3 箇所に付け、landing.css 側で !important 解除する。
    const root = document.getElementById('root');
    document.documentElement.classList.add('lp-active');
    document.body.classList.add('lp-active');
    if (root) root.classList.add('lp-active');
    // クラス側で勝てない外部スタイルがある場合の二重防衛 — inline で上書き
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

    const handleScroll = () => {
      setShowStickyCta(window.scrollY > 400);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    // IntersectionObserver でフェードイン。1 秒経っても発火しなければ
    // 強制 visible にする保険を仕込む (低スペック端末で観察が走らないケース対策)。
    // js-ready クラスが付いた状態のみ opacity:0 が効く設計 (CSS 側) なので、
    // JS が動かなければそもそも全セクションが visible のまま表示される。
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
        const t = setTimeout(() => s.classList.add('visible'), 1500);
        fallbackTimers.push(t);
      });
    } else {
      sections.forEach((s) => s.classList.add('visible'));
    }

    // 🩺 デバッグログ — Safari Web Inspector で「スクロール詰まり」の原因を
    // 切り分けるため、各セクションの計算済み高さと html/body の overflow を出す。
    const debugTimer = setTimeout(() => {
      try {
        const allSections = document.querySelectorAll('.lp-root section');
        // eslint-disable-next-line no-console
        console.log('[LP debug] sections count:', allSections.length);
        allSections.forEach((s, i) => {
          const cs = getComputedStyle(s);
          // eslint-disable-next-line no-console
          console.log(`[LP debug] section ${i}:`, {
            tag: s.className.split(' ')[0],
            height: s.offsetHeight,
            display: cs.display,
            visibility: cs.visibility,
            overflow: cs.overflow,
          });
        });
        // eslint-disable-next-line no-console
        console.log('[LP debug] body overflow:', getComputedStyle(document.body).overflow,
          'body height:', getComputedStyle(document.body).height);
        // eslint-disable-next-line no-console
        console.log('[LP debug] html overflow:', getComputedStyle(document.documentElement).overflow,
          'html height:', getComputedStyle(document.documentElement).height);
        // eslint-disable-next-line no-console
        console.log('[LP debug] #root overflow:', root && getComputedStyle(root).overflow,
          '#root height:', root && getComputedStyle(root).height,
          '#root display:', root && getComputedStyle(root).display);
        // eslint-disable-next-line no-console
        console.log('[LP debug] body scrollHeight:', document.body.scrollHeight,
          'window innerHeight:', window.innerHeight);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[LP debug] log failed', e);
      }
    }, 500);

    return () => {
      document.title = prevTitle;
      tags.forEach((el) => el && el.parentElement && el.parentElement.removeChild(el));
      window.removeEventListener('scroll', handleScroll);
      if (observer) observer.disconnect();
      fallbackTimers.forEach(clearTimeout);
      clearTimeout(debugTimer);
      // クラス + inline style を完全復元
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
      {/* ============ Sticky 下部 CTA(モバイル必須) ============ */}
      {showStickyCta && (
        <div className="sticky-cta" role="region" aria-label="申し込み">
          <button type="button" onClick={goToSignup} className="sticky-cta-btn">
            無料で始める →
          </button>
          <p className="sticky-cta-note">5 日間無料・期間中の解約で課金なし</p>
        </div>
      )}

      {/* ============ 1. Hero ============ */}
      <section className="hero">
        <div className="hero-badge">📚 投資型読書 PWA</div>
        <h1 className="hero-title">
          読みっぱなしの本、<br />
          もう作らない。
        </h1>
        <p className="hero-subhead">
          AI が読み方を設計し、行動を引き出す。<br />
          1,500 円の本を、人生の投資に変えるアプリ。
        </p>
        <button type="button" onClick={goToSignup} className="cta-primary cta-hero">
          無料で始める →
        </button>
        <p className="hero-note">
          5 日間無料・解約料金なし<br />
          期間中の解約で課金は発生しません
        </p>

        <div className="hero-mockup">
          <div className="phone-frame" aria-hidden="true">
            <div className="phone-screen bookshelf-preview">
              <div className="screen-status">9:41 ・ 100% 🔋</div>
              <div className="screen-title">📚 本棚</div>
              <div className="book-row"><div className="book-cover c1" />レバレッジ・リーディング<small>読書中</small></div>
              <div className="book-row"><div className="book-cover c2" />武器になる哲学<small>読みたい</small></div>
              <div className="book-row"><div className="book-cover c3" />影響力の武器<small>読了</small></div>
              <div className="book-row"><div className="book-cover c4" />エッセンシャル思考<small>読書前</small></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 2. Pain ============ */}
      <section className="pain fade-in">
        <p className="section-eyebrow">こんな悩み、ありませんか？</p>
        <h2>
          「読んだはずなのに、<br />
          覚えていない」
        </h2>
        <div className="pain-list">
          <div className="pain-item">📖 1 ヶ月後には内容を忘れている</div>
          <div className="pain-item">📝 メモを取っても見返さない</div>
          <div className="pain-item">🤔 何を読めばいいか分からない</div>
          <div className="pain-item">💸 本代が成果につながらない</div>
        </div>
        <p className="pain-conclusion">原因は『読み方』を知らないだけ。</p>
      </section>

      {/* ============ 3. Outcome ============ */}
      <section className="outcome fade-in">
        <p className="section-eyebrow">想像してください</p>
        <h2>
          5 年後、あなたは<br />
          『行動できる人』になっている。
        </h2>
        <div className="outcome-stats">
          <div className="stat-card">
            <div className="stat-number">180 冊</div>
            <div className="stat-label">読了する本</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">540 個</div>
            <div className="stat-label">実行した行動</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">100 倍</div>
            <div className="stat-label">読書のリターン</div>
          </div>
        </div>
        <p className="outcome-message">
          27 万円の投資で、<br />
          人生を変える資産が積み上がります。
        </p>
      </section>

      {/* ============ 4. 3 つの仕組み ============ */}
      <section className="mechanisms fade-in">
        <p className="section-eyebrow">仕組み</p>
        <h2>
          本を「投資」に変える、<br />
          3 つの仕組み
        </h2>

        <div className="mechanism">
          <div className="mech-number">01</div>
          <div className="mech-icon">🎯</div>
          <h3>本選びの精度が 10 倍に</h3>
          <p>
            「営業成績を上げたい」と話すだけ。<br />
            AI が課題を深掘りし、選書理由付きで最適な本を提案します。
          </p>
          <div className="mech-mockup">
            <div className="phone-frame small" aria-hidden="true">
              <div className="phone-screen advisor-preview">
                <div className="advisor-msg user">営業成績を上げたい</div>
                <div className="advisor-msg ai">3 冊おすすめします</div>
                <div className="advisor-book">📕 SPIN 営業術</div>
                <div className="advisor-book">📘 武器としての交渉思考</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-number">02</div>
          <div className="mech-icon">🚀</div>
          <h3>1 冊からの行動量が 10 倍に</h3>
          <p>
            読む前に AI が読み方を設計。<br />
            重点的に読むべき箇所と、読まなくていい箇所まで明示します。
          </p>
          <div className="mech-mockup">
            <div className="phone-frame small" aria-hidden="true">
              <div className="phone-screen setup-preview">
                <div className="setup-label">📊 投資目的</div>
                <div className="setup-value">営業成績を半年で 1.5 倍にする</div>
                <div className="setup-label">⚠ 現在の課題</div>
                <div className="setup-value">初回商談での信頼構築</div>
                <div className="setup-label">💡 仮説</div>
                <div className="setup-value">フレームワーク習得で改善</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mechanism">
          <div className="mech-number">03</div>
          <div className="mech-icon">🧠</div>
          <h3>知識の活用度が 10 倍に</h3>
          <p>
            過去に読んだ本の知識から、あなた専用の AI が答える。<br />
            「決断に迷う時は？」も即答です。
          </p>
          <div className="mech-mockup">
            <div className="phone-frame small" aria-hidden="true">
              <div className="phone-screen brain-preview">
                <div className="brain-msg user">決断に迷う時の判断軸は？</div>
                <div className="brain-msg ai">『エッセンシャル思考』のメモから…</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 5. Comparison ============ */}
      <section className="comparison fade-in">
        <p className="section-eyebrow">他のアプリとの違い</p>
        <h2>
          記録だけでは、<br />
          本は資産にならない。
        </h2>

        <div className="compare-cards">
          <div className="compare-card without">
            <div className="compare-label">一般的な読書アプリ</div>
            <ul>
              <li>📕 読了の記録</li>
              <li>⭐ レビュー投稿</li>
              <li>👥 SNS 共有</li>
              <li className="missing">❌ AI 選書なし</li>
              <li className="missing">❌ 読書計画なし</li>
              <li className="missing">❌ 行動管理なし</li>
            </ul>
          </div>
          <div className="compare-card with">
            <div className="compare-label">レバレッジ読書ログ</div>
            <ul>
              <li>📚 読了の記録</li>
              <li>🤖 AI 選書アドバイザー</li>
              <li>📋 AI が読書計画を設計</li>
              <li>✅ 期限・優先度付き行動管理</li>
              <li>🧠 過去の本から答える AI</li>
              <li>💎 ROI ひとことまとめで成果記録</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ============ 6. Philosophy (本田思想) ============ */}
      <section className="philosophy fade-in">
        <p className="section-eyebrow">設計思想</p>
        <h2>
          ベースは、<br />
          『レバレッジ・リーディング』
        </h2>
        <div className="philosophy-card">
          <p>
            このアプリは、本田直之氏の名著
            <strong>『レバレッジ・リーディング』（東洋経済新報社）</strong>
            の思想を、ソフトウェアで体現したものです。
          </p>
          <ul className="philosophy-quotes">
            <li>「本は最高の投資」</li>
            <li>「目的を持って読む」</li>
            <li>「全部読まない、必要な部分だけ抜き出す」</li>
            <li>「行動につなげない読書はゴミ」</li>
          </ul>
          <p>これらの原則を、誰でも実践できる形にしました。</p>
          <p className="disclaimer">
            ※ 著者・出版社とは公式提携・許諾関係はありません。<br />
            書籍の思想を独自にソフトウェア化したサードパーティ製ツールです。
          </p>
        </div>
      </section>

      {/* ============ 7. Pricing ============ */}
      <section className="pricing fade-in">
        <p className="section-eyebrow">料金</p>
        <h2>シンプルな 1 プラン。</h2>

        <div className="price-card">
          <div className="price-amount">
            <span className="yen">¥</span>
            <span className="num">1,000</span>
            <span className="per">/ 月</span>
          </div>
          <div className="price-trial">初回 5 日間は無料</div>

          <ul className="price-features">
            <li>✅ 全機能を無制限で利用可能</li>
            <li>✅ AI 選書（無制限）</li>
            <li>✅ マイ読書脳（無制限）</li>
            <li>✅ クラウド同期（全デバイス）</li>
            <li>✅ いつでも 1 タップで解約</li>
          </ul>

          <button type="button" onClick={goToSignup} className="cta-primary cta-pricing">
            無料で始める →
          </button>

          <div className="price-notes">
            <p>• クレジットカード登録が必要です</p>
            <p>• 5 日以内の解約で一切課金されません</p>
            <p>• 6 日目以降、自動で月額 ¥1,000 の課金が始まります</p>
            <p>• 解約はアプリ内から 1 タップで完了</p>
          </div>
        </div>
      </section>

      {/* ============ 8. FAQ ============ */}
      <section className="faq fade-in">
        <p className="section-eyebrow">よくある質問</p>
        <h2>
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
        <h2>
          読書を、<br />
          投資にする。
        </h2>
        <p className="final-sub">5 日間、すべての機能を無料で試せます。</p>
        <button type="button" onClick={goToSignup} className="cta-primary cta-final">
          無料で始める →
        </button>
        <p className="final-note">
          クレジットカード登録が必要・期間中の解約で課金なし
        </p>
      </section>

      {/* ============ Footer ============ */}
      <footer className="lp-footer">
        <p>📚 レバレッジ読書ログ</p>
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
