import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getRandomFromCategory } from '../lib/quotes';

const STORAGE_KEY = 'onboardingCompleted';

const slides = [
  {
    icon: '📚',
    title: '読んだ本を、記録する',
    body: '読みたい・読書中・読了をかんたんに管理。\n表紙は自動取得、気づきや感想はそのまま残せます。',
  },
  {
    icon: '🤖',
    title: 'AI が読書を加速',
    body: 'AI 選書アドバイザーが課題に最適な本を提案。\n読み方の戦略まで一緒に設計します。',
  },
  {
    icon: '🧠',
    title: 'マイ読書脳が答える',
    body: '過去に読んだ本の知識から、あなた専用の AI が回答。\n「決断に迷う時は?」も即答できます。',
  },
  {
    icon: '✨',
    title: '読書を、行動に変える',
    body: '読みっぱなしを防ぎ、本から具体的な行動を引き出す。\n残した一行は、忘れた頃に「🔄 振り返り」でふいに戻ってきます。\nまずは気軽に、1冊から。',
  },
];

export function isOnboardingCompleted() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (e) {
    console.warn('localStorage read failed (onboarding):', e);
    // Be conservative: pretend completed so we don't loop the modal in private
    // browsing or storage-disabled contexts where writes also fail.
    return true;
  }
}

export function markOnboardingCompleted() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, 'true');
  } catch (e) {
    console.warn('localStorage write failed (onboarding):', e);
  }
}

export function clearOnboardingCompletion() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('localStorage remove failed (onboarding):', e);
  }
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 800,
  background: 'rgba(30,25,20,0.55)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // 小型端末でカードがビューポートより高くなったら overlay 自体をスクロール
  // させて CTA が画面外に押し出されないようにする。セーフエリアも加味。
  overflowY: 'auto',
  padding: 'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
};

const cardStyle = {
  background: '#faf6f0',
  borderRadius: 16,
  width: 'min(420px, 100%)',
  // 低い画面高 (iPhone SE 等) でも CTA が必ず収まるよう、カード全体の高さを
  // ビューポートに収める。内側のスライド本文だけをスクロールさせ、フッター
  // (ドット + ボタン) は常に見える位置に固定する。
  maxHeight: 'calc(100dvh - 32px)',
  padding: '24px 22px 18px',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  fontFamily: "'Noto Serif JP', Georgia, serif",
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const dotsRow = {
  display: 'flex',
  justifyContent: 'center',
  gap: 6,
  marginTop: 4,
  flexShrink: 0,
};

const dot = (active) => ({
  width: 8,
  height: 8,
  borderRadius: 4,
  background: active ? '#5c5043' : '#d4ccbe',
  transition: 'background .15s',
});

const btnPrimary = {
  flex: 1,
  minHeight: 44,
  padding: '12px 0',
  borderRadius: 10,
  border: 'none',
  background: '#5c5043',
  color: '#faf6f0',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: 1,
};

const btnGhost = {
  flex: 1,
  minHeight: 44,
  padding: '12px 0',
  borderRadius: 10,
  border: '1px solid #d4ccbe',
  background: 'transparent',
  color: '#5c5548',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const closeBtnStyle = {
  position: 'absolute',
  top: 2,
  right: 6,
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: '#6b5f4d',
  cursor: 'pointer',
  padding: 0,
  width: 44,
  height: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export default function Onboarding({ onClose, onStart, onStartAdvisor }) {
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const isLast = step === slides.length - 1;
  // Lazy initializer — runs once on first render, never on module load.
  const [welcomeQuote] = useState(() => getRandomFromCategory('encouragement'));
  const trapRef = useFocusTrap(true);

  // Every dismissal path marks the onboarding as completed.
  // The user can re-trigger it explicitly via the "ヘルプ" button
  // (which calls clearOnboardingCompletion before reopening).
  const dismiss = () => {
    markOnboardingCompleted();
    onClose?.();
  };

  // 「行動」で締める導線 — 最後のカードの CTA。説明で終わらせず、
  // 閉じたあと本追加 (AddBookModal) を直接開く。onStart 未配線でも
  // 単に閉じるだけで壊れない (graceful degradation)。
  const startAdding = () => {
    markOnboardingCompleted();
    onClose?.();
    onStart?.();
  };

  // 🤖 AI 選書へ直行（初日の最短 time-to-value）。手元に登録したい本が無くても、
  // 「いまの悩み」を話すだけで価値（本の提案）を体験できる＝空アプリで手が止まらない。
  const startAdvisor = () => {
    markOnboardingCompleted();
    onClose?.();
    (onStartAdvisor || onStart)?.();
  };

  // Track the latest dismiss in a ref so the Escape-key effect doesn't need to
  // re-bind when callbacks change.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  // Allow Escape to dismiss
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') dismissRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div ref={trapRef} style={{ ...cardStyle, position: 'relative' }}>
        <button type="button" style={closeBtnStyle} onClick={dismiss} aria-label="閉じる">
          ×
        </button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            paddingTop: 6,
            // 本文だけをスクロールさせる領域。フッターは下に固定されるので、
            // 低い画面高でもボタンは常に押せる位置に残る。
            overflowY: 'auto',
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: '50%',
              background: '#eae3d6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              color: '#5c5043',
            }}
          >
            {slide.icon}
          </div>
          <h2 style={{ fontSize: 18, color: '#3d362c', margin: '6px 0 0', fontWeight: 500 }}>
            {slide.title}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: '#5c5548',
              lineHeight: 1.8,
              textAlign: 'center',
              margin: 0,
              whiteSpace: 'pre-line',
            }}
          >
            {slide.body}
          </p>
          {step === 0 && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                background: '#f5efde',
                border: '1px solid #e0d0a8',
                borderRadius: 10,
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: 12, color: '#5c5548', fontStyle: 'italic', lineHeight: 1.7, margin: 0 }}>
                “{welcomeQuote.text}”
              </p>
              <p style={{ fontSize: 10, color: '#6b5f4d', margin: '4px 0 0' }}>— {welcomeQuote.author}</p>
            </div>
          )}
        </div>

        <div style={dotsRow}>
          {slides.map((_, i) => (
            <span key={i} style={dot(i === step)} />
          ))}
        </div>

        {isLast ? (
          // 最後のカードは「行動」で締める。主 CTA は本追加を直接開き、
          // 説明で終わらせない。下に控えめな「あとで」を残して逃げ道も確保。
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, flexShrink: 0 }}>
            {/* 主CTA＝AI選書: 手元に本が無くても「いまの悩み」を話すだけで価値を体験
                できる初日最短ルート。空アプリで手が止まる事故を防ぐ。 */}
            <button
              type="button"
              style={{ ...btnPrimary, flex: 'unset', width: '100%' }}
              onClick={startAdvisor}
            >
              🤖 悩みからAIに本を選んでもらう
            </button>
            <button
              type="button"
              style={{ ...btnGhost, flex: 'unset', width: '100%' }}
              onClick={startAdding}
            >
              📚 自分で本を追加する
            </button>
            <button
              type="button"
              style={{ ...btnGhost, flex: 'unset', width: '100%', border: 'none' }}
              onClick={dismiss}
            >
              あとで
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexShrink: 0 }}>
            {step > 0 ? (
              <button type="button" style={btnGhost} onClick={() => setStep((s) => Math.max(0, s - 1))}>
                ← 戻る
              </button>
            ) : (
              <button type="button" style={btnGhost} onClick={dismiss}>
                あとで
              </button>
            )}
            <button type="button" style={btnPrimary} onClick={() => setStep((s) => Math.min(slides.length - 1, s + 1))}>
              次へ →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
