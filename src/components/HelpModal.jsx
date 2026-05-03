// 📖 統一ヘルプモーダル
//
// 旧版は「現在の helpKey に紐づく静的コンテンツ」を出すだけだったが、本版は
// 困った時の駆け込み寺として以下を 1 画面に集約する:
//   1. 🤖 AI に質問する     — Claude にアプリ操作を聞ける検索バー
//   2. 💡 よくある質問       — タップで上の AI に流し込む chips
//   3. 📖 この画面のヘルプ   — 既存 helpContent.js の steps / sections を踏襲
//   4. 🔁 他の画面のヘルプ   — 本棚 / 振り返り / AI を切替
//
// 既存 helpContent.js / helpKey ルーティングは破壊しない。新層を上に重ねる
// だけ。`helpKey` を内部 state にすることで、4. の切替が onClose せずに完結。

import { useEffect, useRef, useState } from 'react';
import { getHelp } from '../lib/helpContent';
import { callClaude } from '../lib/ai';
import { PROMPTS } from '../lib/prompts';

// helpKey → 大きいタブ分類。4. の「他の画面のヘルプ」に使う。
const KEY_TO_TAB = {
  bookList: 'bookshelf',
  bookDetailWant: 'bookshelf',
  bookDetailBefore: 'bookshelf',
  bookDetailReading: 'bookshelf',
  bookDetailDone: 'bookshelf',
  memoEditor: 'bookshelf',
  actions: 'bookshelf',
  review: 'review',
  actionList: 'review',
  aiAdvisor: 'ai',
  myBookBrain: 'ai',
};

const TABS = [
  { id: 'bookshelf', icon: '📚', label: '本棚', defaultKey: 'bookList' },
  { id: 'review', icon: '🔄', label: '振り返り', defaultKey: 'review' },
  { id: 'ai', icon: '🤖', label: 'AI', defaultKey: 'aiAdvisor' },
];

const FAQ_LIST = [
  '本の表紙が出ない時は？',
  'AI 読書計画って何？',
  'メモを編集・削除したい',
  '行動を完了にする方法',
  'マイ読書脳の精度を上げるには？',
  '過去の AI 選書を見たい',
  '本のステータスを変えたい',
];

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 850,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  fontFamily: "'Noto Serif JP', Georgia, serif",
};

const cardStyle = {
  background: '#faf6f0',
  borderRadius: 16,
  width: 'min(460px, 100%)',
  maxHeight: 'min(85vh, 85dvh)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  overflow: 'hidden',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 16px',
  borderBottom: '1px solid #e4ddd0',
  background: '#fff',
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: '#5c5043',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
  borderRadius: 10,
};

const bodyStyle = {
  padding: '16px 16px 24px',
  overflowY: 'auto',
  flex: 1,
  WebkitOverflowScrolling: 'touch',
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: '#3d362c',
  margin: '0 0 8px',
};

const inputStyle = {
  flex: 1,
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #d4ccbe',
  background: '#fff',
  color: '#3d362c',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
};

const askBtnStyle = (disabled) => ({
  flexShrink: 0,
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: disabled ? '#d4ccbe' : '#5C4A2E',
  color: '#faf6f0',
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
});

const heroStyle = {
  background: 'linear-gradient(135deg, #5C4A2E 0%, #8B6F47 100%)',
  color: '#faf6f0',
  borderRadius: 14,
  padding: '14px 14px',
  boxShadow: '0 4px 12px rgba(92, 74, 46, 0.18)',
};

const answerCardStyle = {
  marginTop: 10,
  background: '#FFF8E1',
  border: '1px solid #e0c878',
  borderRadius: 10,
  padding: '12px 14px',
  color: '#5D4037',
  fontSize: 13,
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
};

const chipStyle = {
  padding: '7px 12px',
  background: '#fff',
  color: '#5c5043',
  border: '1px solid #d4ccbe',
  borderRadius: 999,
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  minHeight: 30,
};

const tabBtnStyle = (active) => ({
  flex: 1,
  padding: '10px 8px',
  borderRadius: 10,
  border: active ? '1.5px solid #5C4A2E' : '1px solid #d4ccbe',
  background: active ? '#f5efde' : '#fff',
  color: '#3d362c',
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  minHeight: 56,
});

const onboardingLinkStyle = {
  display: 'block',
  margin: '0',
  padding: '10px 12px',
  background: '#f0ebe2',
  border: '1px solid #e4ddd0',
  borderRadius: 10,
  fontSize: 13,
  color: '#5c5043',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
  textAlign: 'left',
};

const footerStyle = {
  padding: '10px 18px calc(10px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid #e4ddd0',
  fontSize: 11,
  color: '#a89e8c',
  textAlign: 'center',
  background: '#fff',
};

// === 統一カードレイアウト用スタイル ===
// すべての helpKey で同じ「番号付きカード」見た目になるよう steps と
// sections の両方を共通の renderCardSteps で描画する。

const stepSubtitle = { fontSize: 13, color: '#8a7e6b', margin: '0 0 14px' };
const stepCard = {
  background: '#fff',
  border: '1px solid #e4ddd0',
  borderRadius: 12,
  padding: '14px 16px',
  marginBottom: 12,
  boxShadow: '0 1px 2px rgba(30,25,20,0.04)',
  wordBreak: 'keep-all',
};
const stepNumber = { fontSize: 22, fontWeight: 700, lineHeight: 1, marginRight: 8 };
const stepTitle = {
  fontSize: 16,
  fontWeight: 600,
  color: '#3d362c',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  wordBreak: 'keep-all',
};
const stepBody = { fontSize: 14, color: '#5c5548', lineHeight: 1.7, margin: '8px 0 0', whiteSpace: 'pre-line', wordBreak: 'keep-all' };
const stepBulletList = { listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 };
const stepBullet = { fontSize: 13, color: '#5c5548', lineHeight: 1.7, wordBreak: 'keep-all' };
const stepFooter = { fontSize: 13, color: '#5C4A2E', lineHeight: 1.7, margin: '8px 0 0', fontStyle: 'italic', wordBreak: 'keep-all' };
const tipBox = {
  marginTop: 6,
  padding: '12px 14px',
  background: '#f5efde',
  border: '1px solid #e0d0a8',
  borderRadius: 10,
  fontSize: 13,
  color: '#5c5043',
  lineHeight: 1.7,
};

// 数字絵文字に変換 (1〜10)。それ以上は数字をそのまま返す。
const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function numberFor(step, index) {
  if (step.number) return step.number;
  return NUM_EMOJI[index] || `${index + 1}.`;
}

// steps と sections を 1 つの shape に正規化 (heading→title, body→description, items→bullets)。
// 結果は { number, title, body, bullets, footer } の配列。
function normalizeSteps(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.steps) && entry.steps.length > 0) {
    return entry.steps.map((s, i) => ({
      number: numberFor(s, i),
      title: s.title || '',
      body: s.body || s.description || '',
      bullets: Array.isArray(s.bullets) ? s.bullets : [],
      footer: s.footer || '',
    }));
  }
  if (Array.isArray(entry.sections) && entry.sections.length > 0) {
    return entry.sections.map((s, i) => ({
      number: numberFor({}, i),
      title: s.heading || '',
      body: s.body || '',
      bullets: Array.isArray(s.items) ? s.items : [],
      footer: '',
    }));
  }
  return [];
}

export default function HelpModal({ helpKey: initialHelpKey, onClose, onShowOnboarding }) {
  // 内部 state にすることで、「他のタブ」切替時に onClose せずモーダル内で
  // ヘルプ画面を入れ替えられる。
  const [helpKey, setHelpKey] = useState(initialHelpKey);
  const entry = getHelp(helpKey);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const askAI = async (q) => {
    const text = (q || '').trim();
    if (!text || asking) return;
    setQuestion(text);
    setAnswer('');
    setError('');
    setAsking(true);
    try {
      const res = await callClaude(PROMPTS.helpAi.system, text, { max_tokens: 600 });
      setAnswer(res || '回答を取得できませんでした。');
    } catch (e) {
      setError(e?.message || '通信エラーが発生しました。');
    } finally {
      setAsking(false);
    }
  };

  const currentTab = KEY_TO_TAB[helpKey] || 'bookshelf';

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 600, flex: 1 }}>📖 ヘルプ</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div style={bodyStyle}>
          {/* ===== 1. AI Q&A ===== */}
          <section style={heroStyle}>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>🤖 AI に質問する</p>
            <p style={{ fontSize: 11, opacity: 0.9, margin: '4px 0 10px', lineHeight: 1.6 }}>
              アプリの使い方で困ったら何でも聞いてください
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例：本の表紙が出ない時は？"
                style={inputStyle}
                disabled={asking}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    askAI(question);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => askAI(question)}
                disabled={!question.trim() || asking}
                style={askBtnStyle(!question.trim() || asking)}
              >
                {asking ? '…' : '質問する'}
              </button>
            </div>
            {asking && (
              <p style={{ fontSize: 11, color: '#fff', opacity: 0.85, margin: '10px 0 0' }}>AI が回答を作成中…</p>
            )}
            {answer && !asking && (
              <div style={answerCardStyle}>
                <p style={{ fontSize: 11, color: '#8D6E2A', fontWeight: 600, margin: '0 0 6px' }}>💡 AI の回答</p>
                {answer}
              </div>
            )}
            {error && !asking && (
              <p style={{ fontSize: 12, color: '#fff', background: '#a05040', padding: '8px 12px', borderRadius: 8, margin: '10px 0 0' }}>
                ⚠️ {error}
              </p>
            )}
          </section>

          {/* ===== 2. FAQ chips ===== */}
          <section>
            <h3 style={sectionTitleStyle}>💡 よくある質問</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FAQ_LIST.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => askAI(q)}
                  disabled={asking}
                  style={{ ...chipStyle, opacity: asking ? 0.6 : 1, cursor: asking ? 'wait' : 'pointer' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </section>

          {/* ===== 3. この画面のヘルプ (steps / sections を統一カードで描画) ===== */}
          <section>
            <h3 style={sectionTitleStyle}>📖 {entry?.title || 'この画面のヘルプ'}</h3>
            {entry ? (
              <>
                {entry.description && <p style={stepSubtitle}>{entry.description}</p>}
                {normalizeSteps(entry).map((s, i) => (
                  <section key={i} style={stepCard}>
                    <h4 style={stepTitle}>
                      <span style={stepNumber} aria-hidden="true">{s.number}</span>
                      <span>{s.title}</span>
                    </h4>
                    {s.body && <p style={stepBody}>{s.body}</p>}
                    {s.bullets.length > 0 && (
                      <ul style={stepBulletList}>
                        {s.bullets.map((b, j) => (
                          <li key={j} style={stepBullet}>・{b}</li>
                        ))}
                      </ul>
                    )}
                    {s.footer && <p style={stepFooter}>{s.footer}</p>}
                  </section>
                ))}
                {entry.tip && (
                  <div style={tipBox}>
                    💡 <strong>コツ:</strong> {entry.tip}
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#a89e8c', margin: 0, lineHeight: 1.8 }}>
                この画面のヘルプはまだ用意されていません。上の「AI に質問する」をお試しください。
              </p>
            )}
          </section>

          {/* ===== 4. 他のタブのヘルプ ===== */}
          <section>
            <h3 style={sectionTitleStyle}>🔁 他の画面のヘルプを見る</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {TABS.map((t) => {
                const active = t.id === currentTab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setHelpKey(t.defaultKey)}
                    style={tabBtnStyle(active)}
                    aria-pressed={active}
                  >
                    <span style={{ fontSize: 18 }}>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {onShowOnboarding && (
            <button
              type="button"
              style={onboardingLinkStyle}
              onClick={() => onShowOnboarding()}
            >
              📖 アプリ全体の使い方を最初から見る →
            </button>
          )}
        </div>

        {entry?.lastUpdated && (
          <div style={footerStyle}>
            このヘルプは {entry.lastUpdated} に更新されました
          </div>
        )}
      </div>
    </div>
  );
}
