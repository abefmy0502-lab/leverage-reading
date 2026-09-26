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

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getHelp } from '../lib/helpContent';

// よくある質問 — 答えは決まっているので AI を走らせず、あらかじめ用意した
// 確定回答をその場で開いて見せる（原価ゼロ・即答・幻覚なし）。
const FAQ_LIST = [
  {
    q: '本の表紙が出ない時は？',
    a: '表紙は書名・著者・ISBN から自動で探します。見つからない時は、本詳細の ⋯ メニュー →「🖼 手動でアップロード」で写真を設定できます。「表紙を取り直す」で再取得も試せます。',
  },
  {
    q: 'AI 読書計画って何？',
    a: '読む前に「この本から得たいこと・今の課題・仮説」を整理し、重点的に読む章や読み方を AI が提案する機能です。本詳細（積読）の「AI 読書計画を始める」から作れます（任意）。',
  },
  {
    q: 'メモを編集・削除したい',
    a: 'メモカードをタップすると編集できます。削除はカードを左スワイプ、または ⋮ メニューから。削除しても Undo（取り消し）が5秒間出るので、うっかり消しても戻せます。',
  },
  {
    q: '行動を完了にする方法',
    a: '🔄 振り返り →「🎯 行動」タブ、または本詳細の行動リストで、チェックをタップすると完了になります。完了率や期限もそこで確認できます。',
  },
  {
    q: '相談の答えの精度を上げるには？',
    a: '相談は「あなたのメモ」を根拠に答えます。気づき・ページ番号・タグを添えたメモを多く残すほど、回答が具体的で的確になります。',
  },
  {
    q: '過去の AI 選書を見たい',
    a: '🤖 AI →「🔍 AI 選書」の 🕒 履歴ボタンから、過去の相談・推薦・追加した本を見返せます。「💬 続きから」で会話を再開もできます。',
  },
  {
    q: '本のステータスを変えたい',
    a: '本詳細で、今の状態に応じて次へ進めます（読みたい → 積読 → 読書中 → 読了）。読書中・読了にすると、その本にメモを残せるようになります。',
  },
];

// モバイルでは画面いっぱいに近づけるため余白を最小化、デスクトップは
// 控えめに余白。padding はインライン min() で簡易レスポンシブ。
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 850,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'var(--backdrop-blur)',
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
  background: 'var(--surface)',
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

// よくある質問（FAQ）アコーディオンのスタイル。答えは確定なので AI は使わない。
const faqItemStyle = {
  border: '1px solid var(--c-hairline)',
  borderRadius: 10,
  background: 'var(--surface)',
  overflow: 'hidden',
};
const faqQuestionStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  textAlign: 'left',
  padding: '13px 14px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--c-ink)',
  minHeight: 48,
  lineHeight: 1.5,
};
const faqAnswerStyle = {
  margin: 0,
  padding: '0 14px 14px',
  fontSize: 14,
  lineHeight: 1.8,
  color: 'var(--c-ink-soft)',
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
  background: 'var(--surface)',
  flexShrink: 0,           // ★ header と同様、潰れないように固定
  position: 'relative',
  zIndex: 1,
};

// === 統一カードレイアウト用スタイル ===
// すべての helpKey で同じ「番号付きカード」見た目になるよう steps と
// sections の両方を共通の renderCardSteps で描画する。

const stepSubtitle = { fontSize: 14, color: 'var(--c-ink-2)', lineHeight: 1.7, margin: '0 0 14px' };
const stepCard = {
  background: 'var(--surface)',
  border: '1px solid var(--c-hairline)',
  borderRadius: 12,
  padding: '16px 16px',
  marginBottom: 14,
  boxShadow: '0 1px 2px rgba(30,25,20,0.04)',
  wordBreak: 'keep-all',
  overflowWrap: 'anywhere',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
};
const stepNumber = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 999, flexShrink: 0,
  background: 'var(--c-brand)', color: 'var(--c-brand-ink, #fff)',
  fontSize: 13, fontWeight: 700, lineHeight: 1, marginRight: 8,
};
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
const stepBody = { fontSize: 15, color: 'var(--c-ink-soft)', lineHeight: 1.8, margin: '10px 0 0', whiteSpace: 'pre-line', wordBreak: 'keep-all' };
const stepBulletList = { listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 8 };
const stepBullet = { fontSize: 14, color: 'var(--c-ink-soft)', lineHeight: 1.7, wordBreak: 'keep-all', display: 'flex', gap: 6, alignItems: 'baseline' };
const stepBulletMark = { color: 'var(--c-brand)', flexShrink: 0 };
const stepFooter = { fontSize: 13, color: '#5C4A2E', lineHeight: 1.7, margin: '10px 0 0', fontStyle: 'italic', wordBreak: 'keep-all' };
const tipBox = {
  marginTop: 6,
  padding: '13px 15px',
  background: '#f5efde',
  border: '1px solid #e0d0a8',
  borderRadius: 10,
  fontSize: 14,
  color: 'var(--c-brand)',
  lineHeight: 1.8,
};

// 数字絵文字に変換 (1〜10)。それ以上は数字をそのまま返す。
// 番号はブランド色の丸バッジで描く（stepNumber スタイル）。以前の青い
// keycap 絵文字（1️⃣2️⃣…）はアプリの茶系の世界観から浮いていた。
function numberFor(step, index) {
  if (step.number) return step.number;
  return String(index + 1);
}

// 改行されたくない語を自動 nowrap 化 — `word-break: keep-all` は CSS 仕様上
// 数字↔CJK の境目 (例: 「3ヶ月前」の 3 と ヶ の間) では効かないため、
// JSX レベルで <span class="nowrap"> で囲む必要がある。
// ここに追加するパターン:
//   - 数字 + 単位 (ヶ月前 / 週間 / 日 / 年 / 冊 / 時間 / メモ / カード …)
//   - 半年前 / 半年 などの慣用句
//   - ブランド/専門語 (AI 読書計画 / マイ読書脳 / カード式メモ / 投資の効果 …)
const NOWRAP_RE = /(\d+(?:ヶ月前|ヶ月|週間|日前|日|年前|年|冊|時間|分|メモ|カード|位))|(半年前|半年)|(AI 読書計画|AI 選書|AI まとめ|マイ読書脳|カード式メモ|まとめメモ|投資の効果|投資対効果|テーマまとめ|学びログ)/g;

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

  const [openFaq, setOpenFaq] = useState(-1); // 開いている FAQ の index（-1=全て閉）
  const trapRef = useFocusTrap(true);

  useEffect(() => {
    const onKey = (e) => {
      // IME 変換中の Esc はガード（変換キャンセルで質問下書きを失わない）。
      if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div ref={trapRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: 'var(--c-ink)', margin: 0, fontWeight: 600, flex: 1 }}>📖 ヘルプ</h2>
          <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="lvg-help-body" style={bodyStyle}>
          {/* ===== よくある質問（確定回答・タップで開く。答えは決まっているので AI は使わない） ===== */}
          <section>
            <h3 style={sectionTitleStyle}>💡 よくある質問</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FAQ_LIST.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={item.q} style={faqItemStyle}>
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? -1 : i)}
                      style={faqQuestionStyle}
                      aria-expanded={open}
                    >
                      <span>{item.q}</span>
                      <span
                        aria-hidden="true"
                        style={{ color: 'var(--c-brand)', flexShrink: 0, marginLeft: 8, transition: 'transform .15s ease', transform: open ? 'rotate(180deg)' : 'none' }}
                      >⌄</span>
                    </button>
                    {open && <p style={faqAnswerStyle}>{item.a}</p>}
                  </div>
                );
              })}
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
                          <li key={j} style={stepBullet}>
                            <span aria-hidden="true" style={stepBulletMark}>・</span>
                            <span>{wrapNowrap(b)}</span>
                          </li>
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
                この画面のヘルプはまだ用意されていません。上の「よくある質問」をご覧ください。
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
