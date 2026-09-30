// 📖 統一ヘルプモーダル
//
// 旧版は「現在の helpKey に紐づく静的コンテンツ」を出すだけだったが、本版は
// 困った時の駆け込み寺として以下を 1 画面に集約する:
//   1. 📖 この画面のヘルプ   — 既存 helpContent.js の steps / sections を踏襲（いまの画面を先に・2026-09-29）
//   2. 💡 よくある質問       — タップで確定回答を開く（AI は使わない）
//
// 既存 helpContent.js / helpKey ルーティングは破壊しない。新層を上に重ねる
// だけ。`helpKey` を内部 state にすることで、4. の切替が onClose せずに完結。

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getHelp } from '../lib/helpContent';
import { withPhraseBreaks } from './TightBubble';

// よくある質問 — 答えは決まっているので AI を走らせず、あらかじめ用意した
// 確定回答をその場で開いて見せる（原価ゼロ・即答・幻覚なし）。
const FAQ_LIST = [
  {
    q: '本の表紙が出ない時は？',
    a: '表紙は書名・著者・ISBN から自動で探します。見つからない時は、本詳細の ⋯ メニュー →「🖼 手動でアップロード」で写真を設定できます。「表紙を取り直す」で再取得も試せます。',
  },
  {
    q: '読書計画シートって何？',
    a: '読む前に「この本から得たいこと・今の課題・仮説」を整理し、重点的に読む章や読み方を AI が提案する機能です。本の詳細（積読）の「読書計画シートを作る」から作れます（任意）。',
  },
  {
    q: 'メモを編集・削除したい',
    a: 'メモカードをタップすると編集できます。削除はカードを左スワイプ、または右上の「…」から。削除しても Undo（取り消し）が5秒間出るので、うっかり消しても戻せます。',
  },
  {
    q: '行動を完了にする方法',
    a: '🔄 振り返り →「🎯 行動」タブ、または本詳細の行動リストで、チェックをタップすると完了になります。やることは期限の近い順に並びます。',
  },
  {
    q: '相談の答えの精度を上げるには？',
    a: '相談は「あなたのメモ」を根拠に答えます。気づき・ページ番号・タグを添えたメモを多く残すほど、回答が具体的で的確になります。',
  },
  {
    q: '過去の AI 選書を見たい',
    a: '💬 相談 →「🔍 AI 選書」の 🕒 履歴ボタンから、過去の相談・推薦・追加した本を見返せます。「💬 続きから」で会話を再開もできます。',
  },
  {
    q: '本の状態を変えたい',
    a: '本詳細で、今の状態に応じて次へ進めます（読みたい → 積読 → 読書中 → 読了）。読書中・読了にすると、その本にメモを残せるようになります。',
  },
];

// モバイルでは画面いっぱいに近づけるため余白を最小化、デスクトップは
// 控えめに余白。padding はインライン min() で簡易レスポンシブ。
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 850,
  background: 'var(--backdrop)',
  backdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'min(var(--space-4), 2vw)',
  fontFamily: "var(--font-app)",
  boxSizing: 'border-box',
};

const cardStyle = {
  background: 'var(--c-card)',
  borderRadius: 'var(--radius)',
  width: '100%',
  maxWidth: 'min(460px, 100vw - 16px)',
  maxHeight: 'min(85vh, 85dvh)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--shadow-overlay)',
  overflow: 'hidden',
  boxSizing: 'border-box',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'calc(var(--space-3) + env(safe-area-inset-top, 0px)) var(--space-4) var(--space-3)',
  borderBottom: '1px solid var(--c-hairline)',
  background: 'var(--surface)',
  flexShrink: 0,           // ★ 必須: body content が大きくても header が潰れない
  position: 'relative',
  zIndex: 1,
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  fontSize: 'var(--text-heading)',
  color: 'var(--c-brand)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
  borderRadius: 'var(--radius-full)',
};

const bodyStyle = {
  padding: 'var(--space-4) var(--space-4) var(--space-6)',
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
  gap: 'var(--space-6)',
  boxSizing: 'border-box',
};

const sectionTitleStyle = {
  fontSize: 'var(--text-meta)',
  fontWeight: 600,
  color: 'var(--c-ink)',
  margin: '0 0 var(--space-2)',
};

// よくある質問（FAQ）アコーディオンのスタイル。答えは確定なので AI は使わない。
const faqItemStyle = {
  border: '1px solid var(--c-hairline)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  overflow: 'hidden',
};
const faqQuestionStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  textAlign: 'left',
  padding: 'var(--space-3) var(--space-4)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  color: 'var(--c-ink)',
  minHeight: 48,
  lineHeight: 1.5,
};
const faqAnswerStyle = {
  margin: 0,
  padding: '0 var(--space-4) var(--space-4)',
  fontSize: 'var(--text-sub)',
  lineHeight: 1.8,
  color: 'var(--c-ink-soft)',
};

const onboardingLinkStyle = {
  display: 'block',
  margin: '0',
  padding: 'var(--space-3)',
  background: 'var(--c-soft)',
  border: '1px solid var(--c-hairline)',
  borderRadius: 'var(--radius)',
  fontSize: 'var(--text-meta)',
  color: 'var(--c-brand)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
  textAlign: 'left',
};

const footerStyle = {
  padding: 'var(--space-2) var(--space-4) calc(var(--space-2) + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--c-hairline)',
  fontSize: 'var(--text-caption)',
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

const stepSubtitle = { fontSize: 'var(--text-sub)', color: 'var(--c-ink-2)', lineHeight: 1.7, margin: '0 0 var(--space-3)', wordBreak: 'keep-all', overflowWrap: 'break-word' };
const stepCard = {
  background: 'var(--surface)',
  border: '1px solid var(--c-hairline)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
  marginBottom: 'var(--space-3)',
  boxShadow: 'none',
  // 文節の切れ目（withPhraseBreaks の <wbr>）でだけ折り返す。長い英数字だけは端で折る（2026-09-30）。
  wordBreak: 'keep-all',
  overflowWrap: 'break-word',
  // 画面の外のカードは描くのを後回しにする（長いヘルプを開いたときの初回の描画を軽く・2026-09-30）。
  contentVisibility: 'auto',
  containIntrinsicSize: 'auto 160px',
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  overflow: 'hidden',
};
const stepNumber = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 'var(--radius-full)', flexShrink: 0,
  background: 'var(--c-brand)', color: 'var(--accent-ink)',
  fontSize: 'var(--text-meta)', fontWeight: 700, lineHeight: 1, marginRight: 'var(--space-2)',
};
const stepTitle = {
  fontSize: 'var(--text-body)',
  fontWeight: 600,
  color: 'var(--c-ink)',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  wordBreak: 'keep-all',
};
const stepBody = { fontSize: 'var(--text-sub)', color: 'var(--c-ink-soft)', lineHeight: 1.8, margin: 'var(--space-2) 0 0', whiteSpace: 'pre-line', wordBreak: 'keep-all' };
const stepBulletList = { listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' };
const stepBullet = { fontSize: 'var(--text-sub)', color: 'var(--c-ink-soft)', lineHeight: 1.7, wordBreak: 'keep-all', display: 'flex', gap: 'var(--space-1)', alignItems: 'baseline' };
const stepBulletMark = { color: 'var(--c-brand)', flexShrink: 0 };
const stepFooter = { fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.7, margin: 'var(--space-2) 0 0', fontStyle: 'italic', wordBreak: 'keep-all' };
const tipBox = {
  marginTop: 'var(--space-2)',
  padding: 'var(--space-3) var(--space-4)',
  background: 'var(--fill)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  fontSize: 'var(--text-sub)',
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

// 文節の切れ目で折り返す（BudouX の <wbr>＋keep-all）。「3 ヶ月」「読書計画シート」なども 1 文節として割らない
// （以前は keep-all だけで折り返せる所が無く、overflow-wrap: anywhere で語の途中で割れていた・2026-09-30）。
function phrased(text) {
  if (text == null || typeof text !== 'string') return text; // React node なら素通し
  return withPhraseBreaks(text);
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

  // 開くときは .modal / .modal-backdrop（ほかのダイアログと同じ）、閉じるときは逆の動き（200ms）を見せてから外す
  // （以前は出も入りも一瞬で、ほかの画面と所作が揃っていなかった・2026-09-29）。動きを減らす設定ではすぐ閉じる。
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(closeTimerRef.current), []);
  const requestClose = useCallback(() => {
    if (closeTimerRef.current) return;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    if (reduce) { onClose?.(); return; }
    setClosing(true);
    closeTimerRef.current = setTimeout(() => onClose?.(), 200);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => {
      // IME 変換中の Esc はガード（変換キャンセルで質問下書きを失わない）。
      if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  return (
    <div className={closing ? 'modal-backdrop-exit' : 'modal-backdrop'} style={overlayStyle} role="dialog" aria-modal="true" onClick={requestClose}>
      <div ref={trapRef} className={closing ? 'modal-exit' : 'modal'} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 'var(--text-body)', color: 'var(--c-ink)', margin: 0, fontWeight: 600, flex: 1 }}>📖 ヘルプ</h2>
          <button type="button" style={closeBtnStyle} onClick={requestClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="lvg-help-body" style={bodyStyle}>
          {/* ===== 1. この画面のヘルプ（いま困っている画面の説明を先に・2026-09-29） ===== */}
          <section>
            <h3 style={sectionTitleStyle}>📖 {entry?.title || 'この画面のヘルプ'}</h3>
            {entry ? (
              <>
                {entry.description && <p style={stepSubtitle}>{phrased(entry.description)}</p>}
                {normalizeSteps(entry).map((s, i) => (
                  <section key={i} style={stepCard}>
                    <h4 style={stepTitle}>
                      <span style={stepNumber} aria-hidden="true">{s.number}</span>
                      <span>{phrased(s.title)}</span>
                    </h4>
                    {s.body && <p style={stepBody}>{phrased(s.body)}</p>}
                    {s.bullets.length > 0 && (
                      <ul style={stepBulletList}>
                        {s.bullets.map((b, j) => (
                          <li key={j} style={stepBullet}>
                            <span aria-hidden="true" style={stepBulletMark}>・</span>
                            <span>{phrased(b)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.footer && <p style={stepFooter}>{phrased(s.footer)}</p>}
                  </section>
                ))}
                {entry.tip && (
                  <div style={tipBox}>
                    💡 <strong>コツ:</strong> {entry.tip}
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 'var(--text-meta)', color: 'var(--c-ink-2)', margin: 0, lineHeight: 1.8 }}>
                この画面のヘルプはまだ用意されていません。下の「よくある質問」をご覧ください。
              </p>
            )}
          </section>

          {/* ===== 2. よくある質問（確定回答・タップで開く。答えは決まっているので AI は使わない） ===== */}
          <section>
            <h3 style={sectionTitleStyle}>💡 よくある質問</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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
                      <span style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{phrased(item.q)}</span>
                      <span
                        aria-hidden="true"
                        style={{ color: 'var(--c-brand)', flexShrink: 0, marginLeft: 'var(--space-2)', transition: 'transform .15s ease', transform: open ? 'rotate(180deg)' : 'none' }}
                      >⌄</span>
                    </button>
                    {open && <p style={{ ...faqAnswerStyle, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{phrased(item.a)}</p>}
                  </div>
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
