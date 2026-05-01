// 🌱 Landing Page — レバレッジ読書ログ
//
// 商用化に向けた縦スクロール型 LP。8 セクション + フッター構成:
//   1. Hero            ファーストビュー
//   2. Problem         読書の課題
//   3. Solution        投資型読書という考え方
//   4. How it works    3 ステップ
//   5. Features        機能 8 種
//   6. Why us          他アプリとの比較
//   7. Pricing         料金プラン
//   8. FAQ + 最終 CTA
//   9. Footer
//
// 認証もスマホ判定もここでは要らない。最低限のスクロール監視 +
// IntersectionObserver で fade-in を仕込むだけの自己完結 component。
// 「無料で始める」ボタンは window.location を本体の "/" に戻すことで
// 既存の AuthScreen フローに合流させる。

import { useEffect, useRef, useState } from 'react';

const C = {
  primary: '#5C4A2E',
  accent: '#8B6F47',
  bgWarm: '#F5F1E8',
  bgWarmer: '#FAF6EC',
  textMain: '#2C2C2C',
  textSub: '#666666',
  success: '#2E7D32',
  error: '#C62828',
  cardBorder: '#E5DFD2',
  cardBg: '#FFFFFF',
};

const FONT = `'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', system-ui, -apple-system, sans-serif`;

// ---------- Section wrapper with fade-in on scroll ----------
function Section({ id, children, bg = '#fff', pad = 80 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <section
      id={id}
      ref={ref}
      style={{
        background: bg,
        padding: `${pad}px 20px`,
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.7s ease, transform 0.7s ease',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

// ---------- Phone mockup (CSS only, no PNG) ----------
function PhoneMockup({ title = '📚 本棚', children, color = C.primary }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 230,
        background: '#1a1a1a',
        borderRadius: 32,
        padding: 8,
        boxShadow: '0 20px 50px rgba(30, 25, 20, 0.25), 0 8px 16px rgba(30, 25, 20, 0.15)',
      }}
    >
      <div
        style={{
          background: '#FAF6EC',
          borderRadius: 26,
          height: 460,
          padding: '20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 12, color: C.textSub, fontWeight: 600 }}>9:41 ・ 100% 🔋</div>
        <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 4 }}>{title}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, color: C.textMain, lineHeight: 1.5 }}>
          {children}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid #e0d8c8', paddingTop: 8, fontSize: 9, color: C.textSub }}>
          <span>📚 本棚</span>
          <span>🔄 振り返り</span>
          <span>🤖 AI</span>
        </div>
      </div>
    </div>
  );
}

const MockBookCard = ({ title, status, color }) => (
  <div style={{ background: '#fff', borderRadius: 8, padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center', border: '1px solid #e0d8c8' }}>
    <div style={{ width: 22, height: 30, background: color, borderRadius: 3, flexShrink: 0 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
      <div style={{ fontSize: 8, color: C.textSub, marginTop: 1 }}>{status}</div>
    </div>
  </div>
);

const ChatBubble = ({ role, text }) => (
  <div style={{ display: 'flex', justifyContent: role === 'user' ? 'flex-end' : 'flex-start' }}>
    <div
      style={{
        maxWidth: '80%',
        padding: '6px 10px',
        borderRadius: 10,
        background: role === 'user' ? C.primary : '#f0ebe2',
        color: role === 'user' ? '#fff' : C.textMain,
        fontSize: 10,
        lineHeight: 1.5,
      }}
    >
      {text}
    </div>
  </div>
);

// ---------- Section content ----------

const PROBLEMS = [
  { icon: '📖', text: '読んだ本の内容、1 ヶ月後には覚えていない' },
  { icon: '📝', text: 'メモを取っても、後から読み返さない' },
  { icon: '🤔', text: '何を読めばいいか分からず、自己啓発書ばかり買う' },
  { icon: '💸', text: '1500 円の本が、1500 円分の行動になっていない' },
];

const STEPS = [
  {
    n: 1,
    icon: '🎯',
    title: 'AI が課題から本を選ぶ',
    desc: 'あなたの「営業成績を上げたい」「自信を持ちたい」を AI に伝えるだけ。あなたに最適な本を、選書理由付きで提案します。',
  },
  {
    n: 2,
    icon: '📋',
    title: 'AI が読み方を設計する',
    desc: '読む前に「投資目的・現在の課題・仮説」を AI と整理。重点的に読むべき箇所と、読まなくていい箇所まで提案します。',
  },
  {
    n: 3,
    icon: '✅',
    title: '行動が習慣になる',
    desc: '本から決めた行動に期限と優先度をつけて管理。完了後の振り返りメモで、知識が血肉化します。',
  },
];

const FEATURES = [
  { icon: '📚', title: '本棚', desc: '読みたい・読書中・読了をスマートに管理。表紙は自動取得、出ない時は手動アップロード。' },
  { icon: '🤖', title: 'AI 選書アドバイザー', desc: 'あなたの課題を AI と会話で深掘り。最適な本を、選書理由付きで提案します。' },
  { icon: '📋', title: 'AI 読書計画', desc: '投資目的・現在の課題・仮説を整理し、本ごとの最適な読み方戦略を AI が提案。' },
  { icon: '📝', title: 'カード式メモ', desc: '1 メモ = 1 カードで蓄積。ページ番号・写真・タグ付きで後から検索可能。' },
  { icon: '🧠', title: 'マイ読書脳', desc: 'あなたが読んだ本の知識から、あなた専用の AI が答える。「決断に迷う時は？」も即答。' },
  { icon: '✅', title: '行動管理', desc: '期限・優先度・繰り返し設定可能。完了率と振り返りメモで習慣化を可視化。' },
  { icon: '🔄', title: '振り返り', desc: 'タイムライン・横断検索で過去のメモを即座に呼び出し。' },
  { icon: '🎁', title: 'クラウド同期', desc: 'PWA でスマホ・PC どこからでもアクセス。データは Supabase で暗号化。' },
];

const COMPARE = [
  { row: '記録', them: { v: '⭕', label: '読了管理' }, us: { v: '⭕', label: '読了管理' } },
  { row: 'コミュニティ', them: { v: '⭕', label: 'レビュー・SNS' }, us: { v: '❌', label: '個人の知識資産化に集中' } },
  { row: 'AI 選書', them: { v: '❌', label: '—' }, us: { v: '⭕', label: '課題から本を提案' } },
  { row: '読書計画', them: { v: '❌', label: '—' }, us: { v: '⭕', label: 'AI が読み方を設計' } },
  { row: '行動管理', them: { v: '❌', label: '—' }, us: { v: '⭕', label: '期限・優先度・振り返り' } },
  { row: 'パーソナル AI', them: { v: '❌', label: '—' }, us: { v: '⭕', label: 'あなたの知識から答える AI' } },
];

const FAQS = [
  {
    q: '解約は簡単？',
    a: 'アプリ内から 1 タップで解約できます。違約金などはありません。',
  },
  {
    q: 'データは安全？',
    a: 'Supabase 上で暗号化保管。Row Level Security で他のユーザーから完全に隔離されています。',
  },
  {
    q: 'iPhone でも使える？',
    a: 'PWA（Progressive Web App）なので、iPhone・Android・PC のすべてで使えます。ホーム画面に追加すれば、ネイティブアプリのように動作します。',
  },
  {
    q: '既存の読書記録アプリとどう違う？',
    a: '一般的なアプリは「記録」が中心ですが、本アプリは「行動」と「AI による設計」が中心です。読書を投資として運用するための専用ツールです。',
  },
  {
    q: '本のデータベースは？',
    a: 'ISBN・openBD・国立国会図書館・Google Books などから自動取得。表紙が出ない場合は手動アップロードも可能です。',
  },
  {
    q: '無料プランはありますか？',
    a: '5 日間の無料トライアルがあります。期間中はすべての機能を試せます。',
  },
  {
    q: 'クレジットカードは必要ですか？',
    a: 'はい、無料トライアル開始時にクレジットカード登録が必要です。ただし、5 日以内に解約すれば一切課金されません。6 日目以降に自動的に月額 ¥1,000 の課金が始まります。',
  },
  {
    q: 'トライアル期間が終わる前に通知はありますか？',
    a: 'はい、トライアル終了の 2 日前にメール通知をお送りします。解約をご希望の場合は、それまでにアプリ内の設定から解約してください。',
  },
  {
    q: 'トライアル中の解約はどうすれば？',
    a: 'アプリ内の設定 → サブスクリプション → 解約 から 1 タップで可能です。解約しても残り日数までは引き続きすべての機能をご利用いただけます。',
  },
];

// ---------- Main component ----------

export default function Landing() {
  const goSignup = () => { window.location.href = '/'; };

  // SEO: dynamic title/meta on mount.
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'レバレッジ読書ログ | 読書を投資にする AI 読書記録';
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
    const tags = [
      setMeta('description', 'AI が読み方を設計し、行動を引き出す『投資型』読書記録。読みっぱなしの本をもう作らない。月額 ¥1,000・5 日間無料。'),
      setMeta('og:title', '読みっぱなしの本、もう作らない | レバレッジ読書ログ', 'property'),
      setMeta('og:description', 'AI が読み方を設計し、行動を引き出す『投資型』読書記録', 'property'),
      setMeta('og:type', 'website', 'property'),
    ];
    return () => {
      document.title = prevTitle;
      tags.forEach((el) => el && el.parentElement && el.parentElement.removeChild(el));
    };
  }, []);

  // CSS for focus styles, hover, prefers-reduced-motion.
  const css = `
    .lp-root { font-family: ${FONT}; color: ${C.textMain}; line-height: 1.7; }
    .lp-root h1, .lp-root h2 { letter-spacing: -0.02em; }
    .lp-cta-primary {
      background: ${C.primary};
      color: #fff;
      padding: 16px 32px;
      border-radius: 32px;
      font-size: 17px;
      font-weight: 600;
      display: inline-block;
      text-decoration: none;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      box-shadow: 0 4px 12px rgba(92, 74, 46, 0.2);
      border: none;
      cursor: pointer;
      font-family: inherit;
    }
    .lp-cta-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(92, 74, 46, 0.3); }
    .lp-cta-primary:active { transform: translateY(0); }
    .lp-cta-secondary {
      background: transparent;
      color: ${C.primary};
      padding: 14px 28px;
      border-radius: 32px;
      font-size: 15px;
      font-weight: 500;
      display: inline-block;
      text-decoration: none;
      border: 1.5px solid ${C.primary};
      cursor: pointer;
      font-family: inherit;
      transition: background 0.2s ease;
    }
    .lp-cta-secondary:hover { background: rgba(92,74,46,0.06); }
    .lp-card { background: #fff; border: 1px solid ${C.cardBorder}; border-radius: 14px; padding: 24px; transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .lp-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(30, 25, 20, 0.08); }
    .lp-grid-4 { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 720px) { .lp-grid-4 { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1024px) { .lp-grid-4 { grid-template-columns: repeat(4, 1fr); } }
    .lp-grid-3 { display: grid; grid-template-columns: 1fr; gap: 24px; }
    @media (min-width: 720px) { .lp-grid-3 { grid-template-columns: repeat(3, 1fr); } }
    .lp-grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; }
    @media (min-width: 720px) { .lp-grid-2 { grid-template-columns: repeat(2, 1fr); } }
    .lp-hero-grid { display: grid; grid-template-columns: 1fr; gap: 40px; align-items: center; }
    @media (min-width: 900px) { .lp-hero-grid { grid-template-columns: 1.2fr 1fr; gap: 60px; } }
    .lp-hero-mockups { display: flex; gap: 16px; justify-content: center; transform: rotate(-2deg); }
    .lp-hero-mockups > :nth-child(2) { transform: rotate(4deg) translateY(20px); }
    @keyframes lp-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
    .lp-float { animation: lp-float 4s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) {
      .lp-float { animation: none !important; }
      .lp-cta-primary:hover, .lp-card:hover { transform: none !important; }
    }
    .lp-faq-item { border-bottom: 1px solid ${C.cardBorder}; }
    .lp-faq-item summary { padding: 18px 4px; cursor: pointer; font-size: 15px; font-weight: 600; list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .lp-faq-item summary::-webkit-details-marker { display: none; }
    .lp-faq-item summary::after { content: '+'; font-size: 22px; color: ${C.accent}; transition: transform 0.2s ease; }
    .lp-faq-item[open] summary::after { transform: rotate(45deg); }
    .lp-faq-item .ans { padding: 0 4px 18px; color: ${C.textSub}; font-size: 14px; line-height: 1.8; }
    .lp-h1 { font-size: clamp(34px, 6.5vw, 60px); font-weight: 800; line-height: 1.2; margin: 0 0 24px; color: ${C.textMain}; }
    .lp-h2 { font-size: clamp(26px, 4vw, 38px); font-weight: 800; line-height: 1.3; margin: 0 0 20px; color: ${C.textMain}; }
    .lp-sub { font-size: clamp(16px, 2.2vw, 20px); line-height: 1.7; color: ${C.textSub}; margin: 0 0 32px; }
    .lp-anchor { display: block; height: 1px; visibility: hidden; }

    /* 100x ROI セクション */
    .lp-roi-compare {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }
    @media (min-width: 720px) { .lp-roi-compare { grid-template-columns: 1fr 1fr; gap: 20px; } }
    .lp-roi-col {
      padding: 22px 20px;
      border-radius: 14px;
    }
    .lp-roi-col-bad {
      background: #FFF5F5;
      border-left: 4px solid ${C.error};
    }
    .lp-roi-col-good {
      background: #F0FAF0;
      border-left: 4px solid ${C.success};
    }
    .lp-mech-compare {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }
    @media (min-width: 720px) { .lp-mech-compare { grid-template-columns: 1fr 1fr; } }
    .lp-impact-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    @media (min-width: 720px) { .lp-impact-grid { grid-template-columns: repeat(5, 1fr); } }
  `;

  return (
    <div className="lp-root">
      <style>{css}</style>

      {/* ===== 1. Hero ===== */}
      <Section id="hero" bg={`linear-gradient(160deg, ${C.bgWarm} 0%, ${C.bgWarmer} 100%)`} pad={70}>
        <div className="lp-hero-grid">
          <div>
            <h1 className="lp-h1">
              読みっぱなしの本、<br />
              もう作らない。
            </h1>
            <p className="lp-sub">
              AI が読み方を設計し、行動を引き出す<br />
              『投資型』読書記録
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="lp-cta-primary" onClick={goSignup}>無料で始める →</button>
              <a href="#features" className="lp-cta-secondary">詳しく見る ↓</a>
            </div>
            <p style={{ marginTop: 16, fontSize: 12, color: C.textSub }}>
              5 日間無料トライアル・解約料金なし・期間中の解約で課金は発生しません
            </p>
          </div>
          <div className="lp-float">
            <div className="lp-hero-mockups">
              <PhoneMockup title="📚 本棚">
                <MockBookCard title="レバレッジ・リーディング" status="読書中" color={C.accent} />
                <MockBookCard title="武器になる哲学" status="読みたい" color="#7B1FA2" />
                <MockBookCard title="影響力の武器" status="読了" color={C.success} />
                <MockBookCard title="エッセンシャル思考" status="読書前" color="#1976D2" />
              </PhoneMockup>
              <PhoneMockup title="🤖 AI 選書">
                <ChatBubble role="user" text="営業成績を上げたい" />
                <ChatBubble role="ai" text="3 冊おすすめします。" />
                <div style={{ background: '#fff', border: '1px solid #e0d8c8', borderRadius: 6, padding: '6px 8px', fontSize: 10 }}>
                  📕 『SPIN 営業術』<br />
                  <span style={{ color: C.textSub, fontSize: 9 }}>初回商談の信頼構築に</span>
                </div>
              </PhoneMockup>
            </div>
          </div>
        </div>
      </Section>

      {/* ===== 2. Problem ===== */}
      <Section id="problem" bg="#fff" pad={70}>
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>
          その本、<br />
          本当に身についていますか？
        </h2>
        <p className="lp-sub" style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 40px' }}>
          読書習慣がある人の多くが、こんな悩みを抱えています。
        </p>
        <div className="lp-grid-4">
          {PROBLEMS.map((p) => (
            <div key={p.text} className="lp-card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>{p.icon}</div>
              <p style={{ fontSize: 14, color: C.textMain, margin: 0, lineHeight: 1.7 }}>{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 3. Solution ===== */}
      <Section id="solution" bg={`linear-gradient(180deg, ${C.bgWarmer} 0%, ${C.bgWarm} 100%)`} pad={80}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 className="lp-h2">
            そう、必要だったのは<br />
            『投資型読書』
          </h2>
          <p style={{ fontSize: 17, lineHeight: 2, color: C.textMain, margin: '40px 0' }}>
            本は最高の投資です。<br />
            1500 円で、誰かが何十年もかけて磨いた知恵を手に入れられる。
          </p>
          <p style={{ fontSize: 17, lineHeight: 2, color: C.textMain, margin: '40px 0' }}>
            でも、読みっぱなしでは投資のリターンはゼロ。<br />
            読み方を設計し、行動に変えて初めて、リターンが発生します。
          </p>
          <p style={{ fontSize: 18, lineHeight: 2, color: C.primary, fontWeight: 700, margin: '40px 0 0' }}>
            レバレッジ読書ログは、<br />
            あなたの読書を「投資の運用」に変えるための、<br />
            唯一の専用ツールです。
          </p>
        </div>

        {/* ベース思想カード — 本田直之『レバレッジ・リーディング』への言及 */}
        <div
          style={{
            maxWidth: 720,
            margin: '64px auto 0',
            background: 'linear-gradient(135deg, #F5F1E8, #FAF6EC)',
            padding: '28px 24px',
            borderRadius: 16,
            borderLeft: `4px solid ${C.primary}`,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 28 }} aria-hidden="true">📕</span>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.primary, margin: 0, lineHeight: 1.4 }}>
              ベースは、ベストセラー<br />
              『レバレッジ・リーディング』の思想
            </h3>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.9, color: C.textMain, margin: '12px 0' }}>
            このアプリの設計は、本田直之氏の名著<br />
            『レバレッジ・リーディング』（東洋経済新報社）の思想を<br />
            ソフトウェアとして体現したものです。
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0', fontSize: 15, lineHeight: 2, color: C.primary, fontWeight: 500 }}>
            <li>「本は最高の投資」</li>
            <li>「目的を持って読む」</li>
            <li>「全部読まない、必要な部分だけ抜き出す」</li>
            <li>「行動につなげない読書はゴミ」</li>
          </ul>
          <p style={{ fontSize: 13, lineHeight: 1.8, color: C.textMain, margin: '12px 0 0' }}>
            こうしたレバレッジ流の読書術を、AI と組み合わせることで、誰でも実践できる形にしました。
          </p>
          <p style={{ fontSize: 11, lineHeight: 1.6, color: '#999', marginTop: 16 }}>
            ※ 本田直之氏・東洋経済新報社とは公式提携・許諾関係はありません。本書の思想・哲学を独自にソフトウェアで実装したサードパーティ製ツールです。
          </p>
        </div>
      </Section>

      {/* ===== 3.5. 100倍 ROI セクション ===== */}
      <Section id="roi" bg="#fff" pad={80}>
        <div style={{ textAlign: 'center', maxWidth: 800, margin: '0 auto' }}>
          <h2 className="lp-h2">
            1,500 円の本から、<br />
            15 万円分の価値を引き出す。
          </h2>
          <p className="lp-sub" style={{ margin: '12px auto 0' }}>
            読書の ROI を 100 倍にする、3 つの仕組み
          </p>
          <p style={{ fontSize: 16, lineHeight: 2, color: C.textMain, margin: '36px auto 0', textAlign: 'left' }}>
            本は 1 冊 1,500 円。<br />
            読みっぱなしの人にとっては、ただの紙の束。<br />
            でも『投資』として運用する人にとっては、<br />
            人生を変える最高のリターンを生む資産です。
          </p>
          <p style={{ fontSize: 15, lineHeight: 2, color: C.textSub, margin: '20px auto 0', textAlign: 'left' }}>
            このアプリを使う人と、使わない人で、<br />
            同じ本を読んでも 10 倍以上の差が生まれます。
          </p>
        </div>

        {/* 比較セクション (2 カラム、モバイルでは縦) */}
        <div className="lp-roi-compare" style={{ marginTop: 48 }}>
          <div className="lp-roi-col lp-roi-col-bad">
            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.error, margin: '0 0 14px' }}>
              🔻 アプリなしの読書
            </h3>
            <div style={{ fontSize: 13, color: C.textMain, lineHeight: 1.9, fontWeight: 600, marginBottom: 14 }}>
              📕 月 3 冊 × 1,500 円 = 4,500 円
            </div>
            {[
              { x: 'なんとなくで本を選ぶ', y: '半分はハズレ本' },
              { x: '読みっぱなしで内容を忘れる', y: '1 ヶ月後に覚えているのは 1 割未満' },
              { x: 'メモを取っても見返さない', y: '知識が活用されない' },
              { x: '行動につながらない', y: '「いい本だった」で終わる' },
            ].map((row) => (
              <div key={row.x} style={{ marginBottom: 10, fontSize: 13, color: C.textMain, lineHeight: 1.7 }}>
                <div>❌ {row.x}</div>
                <div style={{ paddingLeft: 18, color: C.textSub, fontSize: 12 }}>→ {row.y}</div>
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #d0a0a0', fontSize: 13, color: C.error, fontWeight: 700 }}>
              📊 年間 ROI：ほぼゼロ<br />
              <span style={{ fontWeight: 400, color: C.textSub, fontSize: 12, display: 'block', marginTop: 4 }}>
                18,000 円の出費で、何も変わらない
              </span>
            </div>
          </div>
          <div className="lp-roi-col lp-roi-col-good">
            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.success, margin: '0 0 14px' }}>
              ✨ レバレッジ読書ログを使った読書
            </h3>
            <div style={{ fontSize: 13, color: C.textMain, lineHeight: 1.9, fontWeight: 600, marginBottom: 14 }}>
              📚 月 3 冊 × 1,500 円 = 4,500 円
            </div>
            {[
              { x: 'AI が課題に最適な本を選書', y: 'ハズレなく、刺さる本だけ' },
              { x: 'AI が読み方を設計', y: '重点箇所を集中的に読破' },
              { x: 'メモが構造化され蓄積される', y: '過去の本の知識が AI 経由で蘇る' },
              { x: '期限・優先度付き行動管理', y: '1 冊から 3〜5 個の具体的行動' },
            ].map((row) => (
              <div key={row.x} style={{ marginBottom: 10, fontSize: 13, color: C.textMain, lineHeight: 1.7 }}>
                <div>✅ {row.x}</div>
                <div style={{ paddingLeft: 18, color: C.textSub, fontSize: 12 }}>→ {row.y}</div>
              </div>
            ))}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #a0c0a0', fontSize: 13, color: C.success, fontWeight: 700 }}>
              📊 年間 ROI：50〜150 万円相当<br />
              <span style={{ fontWeight: 400, color: C.textSub, fontSize: 12, display: 'block', marginTop: 4 }}>
                18,000 円の投資で、行動と成果が積み上がる
              </span>
            </div>
          </div>
        </div>

        {/* 3 つの仕組み */}
        <div style={{ maxWidth: 800, margin: '64px auto 0' }}>
          <h3 style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', margin: '0 0 32px', color: C.textMain, lineHeight: 1.5 }}>
            3 つの仕組みで、<br />
            あなたの読書を 100 倍の投資に変える
          </h3>

          {[
            {
              icon: '🎯',
              title: '本選びの精度が 10 倍に',
              body: 'AI 選書アドバイザーが、あなたの「現在の課題」「達成したいこと」を深掘りし、年代・職業・状況に最適な本を提案します。\n\n「自己啓発書ばかり買って同じ内容を繰り返し読んでしまう」「ベストセラーを買ったけど自分には合わなかった」こんな失敗を完全に防ぎます。',
              example: {
                head: '具体例',
                text: '「営業成績を上げたい」と入れるだけで、あなたが新規開拓に悩んでいるのか、既存顧客の深耕に悩んでいるのかを AI が判断し、それぞれに最適な 3〜5 冊を選書理由付きで提案。',
              },
            },
            {
              icon: '🚀',
              title: '1 冊からの行動量が 10 倍に',
              body: '読む前に AI が「投資目的・課題・仮説」を整理し、本を最大効率で活用する読み方戦略を提案します。\n\n重点的に読むべき章と、読まなくていい章まで明示。1〜2 時間で本のエッセンスを抽出し、具体的な行動アクションを 3〜5 個生成します。',
              compare: { bad: '平均的な読書：1 冊から 1 個の行動が生まれれば良い方', good: 'このアプリ：1 冊から 3〜5 個の行動が確実に生まれる' },
            },
            {
              icon: '🧠',
              title: '知識の活用度が 10 倍に',
              body: '過去に読んだすべての本の知識が、あなた専用の AI「マイ読書脳」に蓄積されます。\n\n「決断に迷う時の判断軸は？」「明日のプレゼンで意識すべきことは？」これらの質問に対し、過去の本のメモ・投資目的・ROI まとめからあなた専用の答えが返ってきます。',
              compare: { bad: '平均的な読書：読んだ知識の活用率は数 %', good: 'このアプリ：必要な瞬間に過去の知識が即座に呼び出される' },
            },
          ].map((m, i) => (
            <div
              key={m.title}
              style={{
                margin: '0 0 24px',
                padding: '28px 24px',
                background: '#fff',
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 16,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
                仕組み {i + 1}
              </div>
              <div style={{ fontSize: 44, marginBottom: 8 }}>{m.icon}</div>
              <h4 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 14px', color: C.primary }}>
                {m.title}
              </h4>
              <p style={{ fontSize: 14, color: C.textMain, lineHeight: 1.9, margin: 0, whiteSpace: 'pre-line' }}>
                {m.body}
              </p>
              {m.example && (
                <div style={{ marginTop: 16, padding: '14px 16px', background: C.bgWarmer, borderRadius: 10, borderLeft: `3px solid ${C.accent}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 6 }}>
                    💡 {m.example.head}
                  </div>
                  <p style={{ fontSize: 13, color: C.textMain, lineHeight: 1.8, margin: 0 }}>{m.example.text}</p>
                </div>
              )}
              {m.compare && (
                <div className="lp-mech-compare" style={{ marginTop: 16 }}>
                  <div style={{ padding: 12, background: '#FFF5F5', borderRadius: 8, fontSize: 12, color: C.textMain, lineHeight: 1.7 }}>
                    🔻 {m.compare.bad}
                  </div>
                  <div style={{ padding: 12, background: '#F0FAF0', borderRadius: 8, fontSize: 12, color: C.textMain, lineHeight: 1.7 }}>
                    ✨ {m.compare.good}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 数字で見るインパクト */}
        <div
          style={{
            maxWidth: 900,
            margin: '64px auto 0',
            padding: '36px 24px',
            background: `linear-gradient(135deg, ${C.bgWarm}, #fff)`,
            borderRadius: 20,
            textAlign: 'center',
          }}
        >
          <h3 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 28px', color: C.textMain, lineHeight: 1.5 }}>
            このアプリを 5 年使い続けると…
          </h3>
          <div className="lp-impact-grid">
            {[
              { icon: '📚', n: '180+', label: '読了する本' },
              { icon: '✅', n: '540+', label: '実行された行動' },
              { icon: '🧠', n: '∞', label: '蓄積される知識' },
              { icon: '💎', n: '¥270k', label: '累計の投資' },
              { icon: '📈', n: 'x10', label: 'リターン推定' },
            ].map((s) => (
              <div key={s.label}>
                <div style={{ fontSize: 28 }}>{s.icon}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.primary, lineHeight: 1, marginTop: 4 }}>{s.n}</div>
                <div style={{ fontSize: 11, color: C.textSub, marginTop: 6, lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 28, fontSize: 16, lineHeight: 2, color: C.primary, fontWeight: 700 }}>
            5 年で 27 万円の投資が、<br />
            あなたの人生を変える資産になります。
          </p>
        </div>
      </Section>

      {/* ===== 4. How it works ===== */}
      <Section id="how" bg="#fff" pad={80}>
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>
          たった 3 ステップで、<br />
          読書が投資になる
        </h2>
        <div className="lp-grid-3" style={{ marginTop: 50 }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ textAlign: 'center', padding: '0 8px' }}>
              <div
                style={{
                  fontSize: 11,
                  color: C.accent,
                  fontWeight: 700,
                  letterSpacing: 2,
                  marginBottom: 8,
                }}
              >
                STEP {s.n}
              </div>
              <div style={{ fontSize: 56, marginBottom: 12 }}>{s.icon}</div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 12px', color: C.textMain }}>
                {s.title}
              </h3>
              <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.8, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 5. Features ===== */}
      <Section id="features" bg={C.bgWarmer} pad={80}>
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>
          必要な機能のすべてが、<br />
          ここに。
        </h2>
        <div className="lp-grid-4" style={{ marginTop: 40 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-card">
              <div style={{ fontSize: 28, marginBottom: 8 }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: C.primary }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 6. Why us ===== */}
      <Section id="why" bg={C.bgWarm} pad={80}>
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>
          読書記録アプリは多い。<br />
          でも、これは違う。
        </h2>
        <div
          style={{
            marginTop: 32,
            background: '#fff',
            borderRadius: 14,
            padding: '8px 0',
            overflow: 'auto',
            border: `1px solid ${C.cardBorder}`,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#faf6ec' }}>
                <th style={{ padding: '14px 12px', fontWeight: 600, color: C.textSub, textAlign: 'left', fontSize: 12 }}></th>
                <th style={{ padding: '14px 12px', fontWeight: 600, color: C.textSub, fontSize: 12 }}>一般的な読書アプリ</th>
                <th style={{ padding: '14px 12px', fontWeight: 700, color: C.primary, background: '#fff8e1', fontSize: 12 }}>
                  レバレッジ読書ログ
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row, i) => (
                <tr key={row.row} style={{ borderTop: '1px solid #f0ebe2' }}>
                  <td style={{ padding: '12px', fontWeight: 600, color: C.textMain }}>{row.row}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: C.textSub }}>
                    <div style={{ fontSize: 18 }}>{row.them.v}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>{row.them.label}</div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', background: '#fff8e1' }}>
                    <div style={{ fontSize: 18, color: row.us.v === '⭕' ? C.success : C.error }}>{row.us.v}</div>
                    <div style={{ fontSize: 11, marginTop: 2, color: C.textMain }}>{row.us.label}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ textAlign: 'center', marginTop: 32, fontSize: 16, lineHeight: 1.8, color: C.textMain, fontWeight: 600 }}>
          ただ記録するアプリではありません。<br />
          読書を「資産化」するための運用システムです。
        </p>
      </Section>

      {/* ===== 7. Pricing ===== */}
      <Section id="pricing" bg="#fff" pad={80}>
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>
          シンプルな 1 プラン。<br />
          必要なものすべてが含まれます。
        </h2>
        <div
          style={{
            margin: '40px auto 0',
            maxWidth: 420,
            background: `linear-gradient(160deg, #fff 0%, ${C.bgWarmer} 100%)`,
            border: `2px solid ${C.accent}`,
            borderRadius: 20,
            padding: '32px 28px',
            textAlign: 'center',
            boxShadow: '0 12px 32px rgba(92, 74, 46, 0.12)',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>💎</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px', color: C.primary }}>月額プラン</h3>
          <div style={{ fontSize: 44, fontWeight: 800, color: C.primary, lineHeight: 1 }}>
            ¥1,000 <span style={{ fontSize: 16, fontWeight: 500, color: C.textSub }}>/ 月</span>
          </div>
          <div style={{ fontSize: 13, color: C.success, fontWeight: 600, margin: '12px 0 24px' }}>
            ✨ 初回 5 日間は無料
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', textAlign: 'left' }}>
            {[
              'すべての機能を制限なく',
              'AI 選書アドバイザー（無制限）',
              'マイ読書脳（無制限質問）',
              'クラウド同期（全デバイス対応）',
              'いつでも解約可能',
            ].map((b) => (
              <li key={b} style={{ padding: '8px 0', fontSize: 14, color: C.textMain, display: 'flex', gap: 10 }}>
                <span style={{ color: C.success, fontWeight: 700 }}>✓</span> {b}
              </li>
            ))}
          </ul>
          <button type="button" className="lp-cta-primary" onClick={goSignup} style={{ width: '100%', textAlign: 'center' }}>
            無料で始める →
          </button>
          <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', textAlign: 'left', fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
            <li style={{ padding: '4px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: C.success, fontWeight: 700 }}>✓</span>
              <span>初回 5 日間は無料（全機能利用可能）</span>
            </li>
            <li style={{ padding: '4px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: C.success, fontWeight: 700 }}>✓</span>
              <span>クレジットカード登録が必要</span>
            </li>
            <li style={{ padding: '4px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: C.success, fontWeight: 700 }}>✓</span>
              <span>5 日以内に解約すれば一切課金されません</span>
            </li>
            <li style={{ padding: '4px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: C.success, fontWeight: 700 }}>✓</span>
              <span>6 日目以降、自動的に月額 ¥1,000 が発生します</span>
            </li>
            <li style={{ padding: '4px 0', display: 'flex', gap: 8 }}>
              <span style={{ color: C.success, fontWeight: 700 }}>✓</span>
              <span>解約はアプリ内から 1 タップで完了</span>
            </li>
          </ul>
        </div>
      </Section>

      {/* ===== 8. FAQ ===== */}
      <Section id="faq" bg={C.bgWarmer} pad={80}>
        <h2 className="lp-h2" style={{ textAlign: 'center' }}>よくある質問</h2>
        <div style={{ maxWidth: 720, margin: '32px auto 0', background: '#fff', borderRadius: 14, padding: '0 20px', border: `1px solid ${C.cardBorder}` }}>
          {FAQS.map((item) => (
            <details key={item.q} className="lp-faq-item">
              <summary>{item.q}</summary>
              <div className="ans">{item.a}</div>
            </details>
          ))}
        </div>

        {/* 最終 CTA */}
        <div style={{ textAlign: 'center', marginTop: 80 }}>
          <h2 className="lp-h2">読書を、投資にする。</h2>
          <div style={{ marginTop: 32 }}>
            <button type="button" className="lp-cta-primary" onClick={goSignup} style={{ fontSize: 18, padding: '18px 40px' }}>
              無料で始める →
            </button>
          </div>
          <p style={{ fontSize: 13, color: C.textSub, marginTop: 16 }}>
            5 日間無料・期間中の解約で課金なし・いつでも解約可
          </p>
        </div>
      </Section>

      {/* ===== Footer ===== */}
      <footer style={{ background: '#1a1a1a', color: '#fff', padding: '40px 20px', textAlign: 'center', fontFamily: FONT }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📚 レバレッジ読書ログ</div>
          <div style={{ fontSize: 12, color: '#bbb', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
            <a href="/" style={{ color: '#bbb', textDecoration: 'none' }}>アプリへ</a>
            <span>・</span>
            <a href="/?settings=terms" style={{ color: '#bbb', textDecoration: 'none' }}>利用規約</a>
            <span>・</span>
            <a href="/?settings=privacy" style={{ color: '#bbb', textDecoration: 'none' }}>プライバシーポリシー</a>
            <span>・</span>
            <a href="/?settings=feedback" style={{ color: '#bbb', textDecoration: 'none' }}>お問い合わせ</a>
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>© 2026 レバレッジ読書ログ</div>
        </div>
      </footer>
    </div>
  );
}
