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
    a: '7 日間の無料トライアルがあります。期間中はすべての機能を試せます。',
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
      setMeta('description', 'AI が読み方を設計し、行動を引き出す『投資型』読書記録。読みっぱなしの本をもう作らない。月額 ¥1,000・7 日間無料。'),
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
              7 日間無料トライアル・クレジットカード不要・いつでも解約可
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
            ✨ 初回 7 日間は無料
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
          <p style={{ fontSize: 11, color: C.textSub, marginTop: 14, lineHeight: 1.6 }}>
            ※ クレジットカード必要（無料期間中の自動課金は無し）<br />
            ※ 解約はアプリ内からワンタップ
          </p>
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
            クレジットカード不要・いつでも解約可
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
