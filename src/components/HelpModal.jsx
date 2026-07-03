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
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getHelp } from '../lib/helpContent';
import { callClaude } from '../lib/ai';
import { PROMPTS } from '../lib/prompts';
import { toMessage } from '../lib/errors';

const FAQ_LIST = [
  '本の表紙が出ない時は？',
  'AI 読書計画って何？',
  'メモを編集・削除したい',
  '行動を完了にする方法',
  'マイ読書脳の精度を上げるには？',
  '過去の AI 選書を見たい',
  '本のステータスを変えたい',
];

// モバイルでは画面いっぱいに近づけるため余白を最小化、デスクトップは
// 控えめに余白。padding はインライン min() で簡易レスポンシブ。
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 850,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'min(20px, 2vw)',
  fontFamily: "var(--font-app)",
  boxSizing: 'border-box',
};

const cardStyle = {
  background: 'var(--c-card)',
  borderRadius: 16,
  width: '100%',
  maxWidth: 'min(460px, 100vw - 16px)',
  maxHeight: 'min(85vh, 85dvh)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 14px',
  borderBottom: '1px solid var(--c-hairline)',
  background: '#fff',
  flexShrink: 0,           // ★ 必須: body content が大きくても header が潰れない
  position: 'relative',
  zIndex: 1,
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--c-brand)',
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
  padding: '14px 14px 20px',
  overflowY: 'auto',
  overflowX: 'hidden',
  // flex 子要素を「正しくスクロールさせる」3 点セット:
  //   - flexGrow 1 / flexShrink 1 で残り高さを使い切る
  //   - minHeight 0 で content の intrinsic 高さを超えてシュリンクできる
  // 旧コードは `flex: 1` (= 1 1 0%) だけで minHeight が無く、content が
  // 大きい時に header が押し上げられて AI Q&A が上に被る現象が出ていた
  flexGrow: 1,
  flexShrink: 1,
  minHeight: 0,
  width: '100%',
  WebkitOverflowScrolling: 'touch',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  boxSizing: 'border-box',
};

const sectionTitleStyle = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--c-ink)',
  margin: '0 0 8px',
};

const inputStyle = {
  flex: '1 1 0',
  minWidth: 0,
  width: 0,
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--c-hairline-strong)',
  background: '#fff',
  color: 'var(--c-ink)',
  fontSize: 16,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

const askBtnStyle = (disabled) => ({
  flexShrink: 0,
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: disabled ? 'var(--c-hairline-strong)' : '#5C4A2E',
  color: 'var(--c-card)',
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
});

const heroStyle = {
  background: 'var(--c-brand)',
  color: 'var(--c-card)',
  borderRadius: 14,
  padding: '14px 14px',
  boxShadow: '0 4px 12px rgba(92, 74, 46, 0.18)',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
  // 防御的に position と margin を明示。何らかの inheritance や stacking
  // context の影響で Hero が body 領域から飛び出す事故を確実に防ぐ。
  position: 'static',
  margin: 0,
  flexShrink: 0,
};

const answerCardStyle = {
  marginTop: 10,
  background: 'var(--color-warning-soft)',
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
  color: 'var(--c-brand)',
  border: '1px solid var(--c-hairline-strong)',
  borderRadius: 999,
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  minHeight: 30,
};

const onboardingLinkStyle = {
  display: 'block',
  margin: '0',
  padding: '10px 12px',
  background: 'var(--c-soft)',
  border: '1px solid var(--c-hairline)',
  borderRadius: 10,
  fontSize: 13,
  color: 'var(--c-brand)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
  textAlign: 'left',
};

const footerStyle = {
  padding: '10px 18px calc(10px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--c-hairline)',
  fontSize: 11,
  color: 'var(--c-ink-2)',
  textAlign: 'center',
  background: '#fff',
  flexShrink: 0,           // ★ header と同様、潰れないように固定
  position: 'relative',
  zIndex: 1,
};

// === 統一カードレイアウト用スタイル ===
// すべての helpKey で同じ「番号付きカード」見た目になるよう steps と
// sections の両方を共通の renderCardSteps で描画する。

const stepSubtitle = { fontSize: 13, color: 'var(--c-ink-2)', margin: '0 0 14px' };
const stepCard = {
  background: '#fff',
  border: '1px solid var(--c-hairline)',
  borderRadius: 12,
  padding: '14px 16px',
  marginBottom: 12,
  boxShadow: '0 1px 2px rgba(30,25,20,0.04)',
  wordBreak: 'keep-all',
  overflowWrap: 'anywhere',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
};
const stepNumber = { fontSize: 22, fontWeight: 700, lineHeight: 1, marginRight: 8 };
const stepTitle = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--c-ink)',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  wordBreak: 'keep-all',
};
const stepBody = { fontSize: 14, color: 'var(--c-ink-soft)', lineHeight: 1.7, margin: '8px 0 0', whiteSpace: 'pre-line', wordBreak: 'keep-all' };
const stepBulletList = { listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', flexDirection: 'column', gap: 2 };
const stepBullet = { fontSize: 13, color: 'var(--c-ink-soft)', lineHeight: 1.7, wordBreak: 'keep-all' };
const stepFooter = { fontSize: 13, color: '#5C4A2E', lineHeight: 1.7, margin: '8px 0 0', fontStyle: 'italic', wordBreak: 'keep-all' };
const tipBox = {
  marginTop: 6,
  padding: '12px 14px',
  background: '#f5efde',
  border: '1px solid #e0d0a8',
  borderRadius: 10,
  fontSize: 13,
  color: 'var(--c-brand)',
  lineHeight: 1.7,
};

// 数字絵文字に変換 (1〜10)。それ以上は数字をそのまま返す。
const NUM_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
function numberFor(step, index) {
  if (step.number) return step.number;
  return NUM_EMOJI[index] || `${index + 1}.`;
}

// 改行されたくない語を自動 nowrap 化 — `word-break: keep-all` は CSS 仕様上
// 数字↔CJK の境目 (例: 「3ヶ月前」の 3 と ヶ の間) では効かないため、
// JSX レベルで <span class="nowrap"> で囲む必要がある。
// ここに追加するパターン:
//   - 数字 + 単位 (ヶ月前 / 週間 / 日 / 年 / 冊 / 時間 / メモ / カード …)
//   - 半年前 / 半年 などの慣用句
//   - ブランド/専門語 (AI 読書計画 / マイ読書脳 / カード式メモ / 投資の効果 …)
const NOWRAP_RE = /(\d+(?:ヶ月前|ヶ月|週間|日前|日|年前|年|冊|時間|分|メモ|カード|位))|(半年前|半年)|(AI 読書計画|AI 選書|AI まとめ|マイ読書脳|カード式メモ|まとめメモ|投資の効果|投資対効果|レバレッジメモ|学びログ)/g;

function wrapNowrap(text) {
  if (text == null) return text;
  if (typeof text !== 'string') return text; // React node なら素通し
  const parts = [];
  let lastIndex = 0;
  // 正規表現は state-ful なので毎呼び出しでリセット
  NOWRAP_RE.lastIndex = 0;
  let m;
  let key = 0;
  while ((m = NOWRAP_RE.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push(<span key={`nw-${key++}`} className="nowrap">{m[0]}</span>);
    lastIndex = NOWRAP_RE.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
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

export default function HelpModal({ helpKey, onClose, onShowOnboarding }) {
  const entry = getHelp(helpKey);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const trapRef = useFocusTrap(true);

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
      const res = await callClaude(PROMPTS.helpAi.system, text, { max_tokens: 600, cacheSystem: true });
      setAnswer(res || '回答を取得できませんでした。');
    } catch (e) {
      // 他画面と同様に humanize（生の英語スタック/内部メッセージを出さない）。
      setError(toMessage(e, '通信エラーが発生しました。少し時間をおいて再度お試しください。'));
    } finally {
      setAsking(false);
    }
  };

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div ref={trapRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: 'var(--c-ink)', margin: 0, fontWeight: 600, flex: 1 }}>📖 ヘルプ</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="lvg-help-body" style={bodyStyle}>
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
              <p style={{ fontSize: 12, color: '#fff', background: 'var(--c-critical)', padding: '8px 12px', borderRadius: 8, margin: '10px 0 0' }}>
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
                      <span>{wrapNowrap(s.title)}</span>
                    </h4>
                    {s.body && <p style={stepBody}>{wrapNowrap(s.body)}</p>}
                    {s.bullets.length > 0 && (
                      <ul style={stepBulletList}>
                        {s.bullets.map((b, j) => (
                          <li key={j} style={stepBullet}>・{wrapNowrap(b)}</li>
                        ))}
                      </ul>
                    )}
                    {s.footer && <p style={stepFooter}>{wrapNowrap(s.footer)}</p>}
                  </section>
                ))}
                {entry.tip && (
                  <div style={tipBox}>
                    💡 <strong>コツ:</strong> {entry.tip}
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--c-ink-2)', margin: 0, lineHeight: 1.8 }}>
                この画面のヘルプはまだ用意されていません。上の「AI に質問する」をお試しください。
              </p>
            )}
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
