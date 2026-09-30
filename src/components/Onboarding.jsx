import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { track } from '../lib/analytics';
import { BookOpen, MessageCircle, X, ChevronLeft, ChevronDown } from 'lucide-react';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost, btnLink } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';

const STORAGE_KEY = 'onboardingCompleted';

// スライドは 2 枚だけ（2026-09-29・始めるまでのタップを減らす）:
//   1. 約束 — 一番の価値「読むほど、自分だけの相談相手が育つ」（CLAUDE.md・2026-09-26 裁定）。
//      メモ → 相談 → 行動 の流れを本文 1 文にまとめる（旧 2〜4 枚目の中身）。
//   2. 最初の一歩 — 無料でできる始め方（これまで読んだ本から始める／いま読んでいる本／取り込む）。
// 思い出しカード（旧「想起」）は手段なのでここでは触れない（振り返りで出会う）。
// 文体注意: 引用符強調（"凝縮" 等）とダーシ（——）は翻訳調に見えるため使わない。
// 本文は 2 行程度まで（DESIGN 原則 6: なくても伝わる補足は置かない）。
const slides = [
  {
    Icon: MessageCircle,
    title: '読むほど、自分だけの相談相手が育つ',
    // 行動は会話で決める（2026-09-30）ので「一歩まで答える」とは約束しない。
    body: '心が動いた一行をメモしておくと、困ったときに、あなたのメモを根拠に答え、やることを一緒に決めます。',
  },
  {
    Icon: BookOpen,
    title: 'まずは、これまで読んだ本から',
    body: '覚えていることを一言ずつ。5\u00a0分で、あなたの相談相手ができます。',
  },
];

// 「どこで知りましたか」の選択肢（analytics の sanitizer 適合＝≤32字の固定スラッグ）。
const SOURCES = [['note', 'note'], ['x', 'X (Twitter)'], ['appstore', 'App Store検索'], ['friend', '知人'], ['other', 'その他']];

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
  background: 'var(--backdrop)',
  backdropFilter: 'var(--backdrop-blur)',
  WebkitBackdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // 小型端末でカードがビューポートより高くなったら overlay 自体をスクロール
  // させて CTA が画面外に押し出されないようにする。セーフエリアも加味。
  overflowY: 'auto',
  padding: 'max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left))',
};

const cardStyle = {
  position: 'relative',
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  width: 'min(420px, 100%)',
  // 低い画面高 (iPhone SE 等) でも CTA が必ず収まるよう、カード全体の高さを
  // ビューポートに収める。内側のスライド本文だけをスクロールさせ、フッター
  // (ドット + ボタン) は常に見える位置に固定する。
  maxHeight: 'calc(100dvh - var(--space-8))',
  padding: 'var(--space-6) var(--space-4) var(--space-4)',
  boxShadow: 'var(--shadow-overlay)',
  fontFamily: 'var(--font-ui)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  boxSizing: 'border-box',
};

const dotsRow = {
  display: 'flex',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  flexShrink: 0,
};

// ページ位置のドット（形そのもの＝円）。現在地だけアクセント（選択中の表示）。
const dot = (active) => ({
  width: 'var(--space-2)',
  height: 'var(--space-2)',
  borderRadius: '50%',
  background: active ? 'var(--accent)' : 'var(--border)',
  transition: 'background .15s',
});

// ボタンは正典そのまま（17・600・高さ 48）。横並び用に幅だけ変える。
const btnPrimary = { ...uiBtnPrimary, width: 'auto', flex: 1 };
const btnGhost = { ...uiBtnGhost, width: 'auto', flex: 1 };

const closeBtnStyle = {
  position: 'absolute',
  top: 'var(--space-2)',
  right: 'var(--space-2)',
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  cursor: 'pointer',
  padding: 0,
  width: 44,
  height: 44,
  borderRadius: 'var(--radius)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};
// 2 枚目以降の「戻る」: × と左右対称の位置・大きさ（最後の画面でも戻れるように）。
const backBtnStyle = { ...closeBtnStyle, right: 'auto', left: 'var(--space-2)' };

// 横スワイプでページを送る（左へ＝次・右へ＝前）。縦スクロールと取り違えないよう、横の動きが十分大きいときだけ。
const SWIPE_MIN_PX = 48;

// 「どこで知りましたか」のチップ。押すとすぐ記録される操作のチップなので、DESIGN §5「操作のチップ」の 44・15。
const chipHit = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const chipFace = (selected) => ({
  display: 'inline-flex',
  alignItems: 'center',
  height: 44,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  background: selected ? 'var(--accent-soft)' : 'var(--fill)',
  color: selected ? 'var(--accent)' : 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontWeight: selected ? 600 : 400,
});

export default function Onboarding({ onClose, onStart, onImport, onStartQuickstart }) {
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const isLast = step === slides.length - 1;
  // Lazy initializer — runs once on first render, never on module load.
  // 📊 signup_source: 「どこで知りましたか」の1タップ計測（任意・スキップ可）。
  // チャネル別の獲得効率（note/X/検索）を測る唯一の一次データ。値は analytics の
  // sanitizer 適合（≤32字の固定スラッグ）。1度選んだら変更なしで送信済み扱い。
  const [srcPicked, setSrcPicked] = useState('');
  // 「どこで知りましたか」は畳んでおき、押したときだけ選択肢を出す（最後の画面の押せるものを減らす・2026-09-29）。
  const [srcOpen, setSrcOpen] = useState(false);
  const pickSource = (key) => {
    if (srcPicked) return;
    setSrcPicked(key);
    track('signup_source', { ch: key });
  };
  const trapRef = useFocusTrap(true);
  // 2 枚目はボタンが増えてカードが高くなる。一瞬で伸びないよう、高さと中身を --duration-fast（200ms）で
  // なめらかに変える（2026-09-29）。動きを減らす設定の人には動かさない。値はトークンから読む。
  const heightRef = useRef(null);
  const stepRef = useRef(step);
  useLayoutEffect(() => {
    const el = trapRef.current;
    if (!el) return;
    const prev = heightRef.current;
    const next = el.getBoundingClientRect().height;
    heightRef.current = next;
    const changed = stepRef.current !== step;
    stepRef.current = step;
    if (!changed || prev == null || Math.abs(prev - next) < 1 || typeof el.animate !== 'function') return;
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    if (reduce) return;
    let duration = 200;
    let easing = 'ease-out';
    try {
      const cs = getComputedStyle(document.documentElement);
      duration = parseFloat(cs.getPropertyValue('--duration-fast')) || duration;
      easing = cs.getPropertyValue('--ease-out').trim() || easing;
    } catch { /* 既定のまま */ }
    try {
      el.animate([{ height: `${prev}px`, overflow: 'hidden' }, { height: `${next}px`, overflow: 'hidden' }], { duration, easing });
      Array.from(el.children).forEach((c) => {
        if (c.tagName !== 'BUTTON') c.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
      });
    } catch { /* 動かせない環境はそのまま */ }
  });
  const goPrev = () => setStep((s) => Math.max(0, s - 1));
  const goNext = () => setStep((s) => Math.min(slides.length - 1, s + 1));
  const touchStart = useRef(null);
  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const start = touchStart.current;
    touchStart.current = null;
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goNext(); else goPrev();
  };
  // 開いたときのフォーカスは × ではなく見出しへ（読み上げが「閉じる」から始まらないように）。
  // useFocusTrap の初期フォーカス（最初のボタン＝×）の後に実行されるよう、この effect を後に置く。
  const titleRef = useRef(null);
  useEffect(() => {
    try { titleRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
  }, [step]); // 画面を切り替えるたびに見出しへ（押したボタンが消えてフォーカスが外れないように）

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

  // 📥 ブクログ・読書メーター・Kindle から取り込む（無料の最初の一歩・2026-09-27）。
  // 旧「悩みから AI 選書で探す」は AI 選書がプランの機能になったため差し替え（無料は相談だけ）。
  const startImport = () => {
    markOnboardingCompleted();
    onClose?.();
    (onImport || onStart)?.();
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
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div ref={trapRef} style={cardStyle} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {step > 0 && (
          <button type="button" style={backBtnStyle} onClick={goPrev} aria-label="戻る">
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
        )}
        <button type="button" style={closeBtnStyle} onClick={dismiss} aria-label="閉じる">
          <X size={22} aria-hidden="true" />
        </button>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-3)',
            // 本文だけをスクロールさせる領域。フッターは下に固定されるので、
            // 低い画面高でもボタンは常に押せる位置に残る。
            overflowY: 'auto',
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* アイコンの丸は飾りなのでアクセントを使わない（DESIGN §3-2）。 */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--fill)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-2)',
              flexShrink: 0,
            }}
          >
            <slide.Icon size={30} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2
            id="onb-title"
            ref={titleRef}
            tabIndex={-1}
            style={{ fontSize: 'var(--text-heading)', color: 'var(--text)', margin: 0, fontWeight: 600, lineHeight: 1.3, textAlign: 'center', outline: 'none', wordBreak: 'auto-phrase', textWrap: 'balance' }}
          >
            {slide.title}
          </h2>
          {/* 文節の切れ目（BudouX の <wbr>）でだけ折り返す（「困った／ときに」のように語の途中で割らない・iOS の Safari は auto-phrase を知らない） */}
          <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, textAlign: 'center', margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'pretty' }}>
            {withPhraseBreaks(slide.body)}
          </p>
        </div>

        {/* 読み上げでは「1 / 4」と今の位置を伝える（点そのものは読ませない）。 */}
        <div style={dotsRow} role="img" aria-label={`${step + 1} / ${slides.length}`}>
          {slides.map((_, i) => (
            <span key={i} style={dot(i === step)} aria-hidden="true" />
          ))}
        </div>

        {isLast ? (
          // 最後の画面は主役を 1 つに（DESIGN 原則 2）。主＝これまで読んだ本から始める
          // （初日に「自分だけの相談相手」を体験する最短路）、副＝いま読んでいる本を追加。
          // 取り込み（ブクログ・Kindle）は文字ボタンに下げ、「どこで知りましたか」は一番下へ。
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flexShrink: 0 }}>
              <button type="button" style={{ ...btnPrimary, flex: 'none', width: '100%' }} onClick={startQuickstart}>
                これまで読んだ本から始める
              </button>
              <button type="button" style={{ ...btnGhost, flex: 'none', width: '100%' }} onClick={startAdding}>
                いま読んでいる本を追加する
              </button>
              {/* 閉じるのは右上の × だけ（同じ操作を 2 か所に出さない・DESIGN §5）。
                  ガイドはヘルプの「使い方を最初から見る」で見直せる。 */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                {/* 1 行に収まる短い名前（ホーム・設定と同じ「ほかのアプリから取り込む」・2026-09-29）。
                    どのアプリから取り込めるか（ブクログ・読書メーター・Kindle）は、開いたシートで言う。 */}
                <button type="button" style={{ ...btnLink, textAlign: 'center' }} onClick={startImport}>
                  ほかのアプリから取り込む
                </button>
              </div>
            </div>
            {/* signup_source（任意）: 押しつけないよう一番下に小さく畳んでおく（13/--text-2 の一行＋▾）。
                押したときだけ選択肢を出し、選んだあとは選んだチップを残してお礼だけ。 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)', flexShrink: 0, borderTop: '1px solid var(--separator)', paddingTop: 'var(--space-1)' }}>
              {srcOpen ? (
                <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 'var(--space-2) 0 0', textAlign: 'center' }} aria-live="polite">
                  {srcPicked ? 'ありがとうございます' : 'Orime をどこで知りましたか？（任意）'}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setSrcOpen(true)}
                  aria-expanded={false}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: '0 var(--space-2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}
                >
                  Orime をどこで知りましたか？（任意）
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
              )}
              {srcOpen && (
              <div style={{ display: 'flex', columnGap: 'var(--space-2)', rowGap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
                {/* 選んだ後も全チップを残し、選んだものだけ選択中（--accent-soft 面・--accent 文字）に。カードの高さが跳ねないように。 */}
                {SOURCES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pickSource(key)}
                    aria-pressed={srcPicked === key}
                    style={{ ...chipHit, cursor: srcPicked ? 'default' : 'pointer' }}
                  >
                    <span style={chipFace(srcPicked === key)}>{label}</span>
                  </button>
                ))}
              </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexShrink: 0 }}>
            {/* 戻るは左上の ‹ だけ（最後の画面でも同じ場所にある・同じ操作を 2 か所に出さない）→「次へ」は常に全幅。 */}
            <button type="button" style={btnPrimary} onClick={goNext}>
              次へ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
