import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { getRandomFromCategory } from '../lib/quotes';
import { track } from '../lib/analytics';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from '../styles/ui';

const STORAGE_KEY = 'onboardingCompleted';

// スライドは 約束（相談相手が育つ）→ メモ → 相談(核心) → 行動 の一本道。
// 一番の価値「読むほど、自分だけの相談相手が育つ」（CLAUDE.md・2026-09-26 裁定）を
// 3 枚目に置く。思い出しカード（旧「想起」）は手段なので 4 枚目で一言だけ触れる。
// 文体注意: 引用符強調（"凝縮" 等）とダーシ（——）は翻訳調に見えるため使わない。
const slides = [
  {
    icon: '📖',
    title: '読むほど、自分だけの相談相手が育つ',
    body: '困ったとき、前に読んだ本にヒントがあったはずなのに、思い出せない。\nOrime は、あなたが読んだ本とメモを覚えておいて、困ったときの相談相手になる読書アプリです。',
  },
  {
    icon: '✍️',
    title: 'まず、一行を残す',
    body: '本を読みながら、心が動いた一行をメモするだけ。\n完璧じゃなくていい。長くなくていい。\nその一行が、あなたの相談相手の材料になります。',
  },
  {
    icon: '💬',
    title: '困ったら、相談する',
    body: '仕事や人間関係で迷ったら、Orime に相談してください。\nあなたが残したメモを根拠に、どの本のどの気づきが使えるかを答えます。\nメモが増えるほど、答えはあなたらしくなっていきます。',
  },
  {
    icon: '🎯',
    title: '答えを、行動に変える',
    body: '相談の答えには、明日からできる一歩がつきます。\nそのまま行動リストに入れて、読んだ本をあなたの変化につなげましょう。\n忘れかけたメモは、思い出しカードとしてときどき戻ってきます。',
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
  zIndex: 'var(--z-overlay)',
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
  background: 'var(--c-card)',
  borderRadius: 16,
  width: 'min(420px, 100%)',
  // 低い画面高 (iPhone SE 等) でも CTA が必ず収まるよう、カード全体の高さを
  // ビューポートに収める。内側のスライド本文だけをスクロールさせ、フッター
  // (ドット + ボタン) は常に見える位置に固定する。
  maxHeight: 'calc(100dvh - 32px)',
  padding: '24px 22px 18px',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
  fontFamily: "var(--font-app)",
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
  background: active ? 'var(--c-brand)' : 'var(--c-hairline-strong)',
  transition: 'background .15s',
});

const btnPrimary = { ...uiBtnPrimary, width: 'auto', flex: 1, minHeight: 44, padding: '12px 0', fontSize: 14 };

const btnGhost = { ...uiBtnGhost, width: 'auto', flex: 1, minHeight: 44, padding: '12px 0', fontSize: 14, color: 'var(--c-ink-soft)' };

const closeBtnStyle = {
  position: 'absolute',
  top: 2,
  right: 6,
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--c-ink-2)',
  cursor: 'pointer',
  padding: 0,
  width: 44,
  height: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export default function Onboarding({ onClose, onStart, onStartAdvisor, onStartQuickstart }) {
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const isLast = step === slides.length - 1;
  // Lazy initializer — runs once on first render, never on module load.
  const [welcomeQuote] = useState(() => getRandomFromCategory('encouragement'));
  // 📊 signup_source: 「どこで知りましたか」の1タップ計測（任意・スキップ可）。
  // チャネル別の獲得効率（note/X/検索）を測る唯一の一次データ。値は analytics の
  // sanitizer 適合（≤32字の固定スラッグ）。1度選んだら変更なしで送信済み扱い。
  const [srcPicked, setSrcPicked] = useState('');
  const pickSource = (key) => {
    if (srcPicked) return;
    setSrcPicked(key);
    track('signup_source', { ch: key });
  };
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

  // 📚 これまで読んだ本で相談相手をつくる（初日クイックスタート）。一番の価値
  // 「自分だけの相談相手」を初日に体験させる主導線（2026-09-26）。未配線なら本追加へ。
  const startQuickstart = () => {
    markOnboardingCompleted();
    onClose?.();
    (onStartQuickstart || onStart)?.();
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
              background: 'var(--c-soft-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              color: 'var(--c-brand)',
            }}
          >
            {slide.icon}
          </div>
          <h2 style={{ fontSize: 18, color: 'var(--c-ink)', margin: '6px 0 0', fontWeight: 500 }}>
            {slide.title}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: 'var(--c-ink-soft)',
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
              <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', fontStyle: 'italic', lineHeight: 1.7, margin: 0 }}>
                “{welcomeQuote.text}”
              </p>
              {welcomeQuote.author && (
                <p style={{ fontSize: 10, color: 'var(--c-ink-2)', margin: '4px 0 0' }}>— {welcomeQuote.author}</p>
              )}
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
            {/* 📊 signup_source（任意）: 押しつけないよう1行・小さく。選択後はお礼だけ。 */}
            <div style={{ marginBottom: 2 }}>
              <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '0 0 6px' }}>
                {srcPicked ? 'ありがとうございます 🙏' : 'Orime をどこで知りましたか？（任意）'}
              </p>
              {!srcPicked && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[['note', 'note'], ['x', 'X (Twitter)'], ['appstore', 'App Store検索'], ['friend', '知人'], ['other', 'その他']].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => pickSource(key)}
                      style={{ padding: '7px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                        border: '1px solid var(--c-hairline-strong)', background: 'transparent', color: 'var(--c-ink-2)', minHeight: 34 }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 主CTA＝これまで読んだ本と覚えている一言を入れて、その場で相談する
                （初日に「自分だけの相談相手」を体験する最短路・2026-09-26）。
                いま読んでいる本の追加・AI 選書は副導線。 */}
            <button
              type="button"
              style={{ ...btnPrimary, flex: 'unset', width: '100%' }}
              onClick={startQuickstart}
            >
              📚 これまで読んだ本から始める
            </button>
            <button
              type="button"
              style={{ ...btnGhost, flex: 'unset', width: '100%' }}
              onClick={startAdding}
            >
              いま読んでいる本を追加する
            </button>
            <button
              type="button"
              style={{ ...btnGhost, flex: 'unset', width: '100%' }}
              onClick={startAdvisor}
            >
              🤖 まだ無い／悩みからAIに選んでもらう
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
