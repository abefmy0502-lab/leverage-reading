// 📩 FeedbackForm — bottom-sheet feedback / feature-request form.
//
// Opens from AccountSettings (「フィードバック・要望を送る」). Writes a row to
// public.feedback (see supabase_feedback.sql) using useFeedback. Submission
// is anonymous-ish: name + email are optional; user_id ties back via RLS so
// only the submitter (and admins via service_role) can read it later.

import { useEffect, useId, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Check } from 'lucide-react';
import { useFeedback, FEEDBACK_CATEGORIES, FEEDBACK_LIMITS } from '../hooks/useFeedback';
import { useToast } from './Toast';
import { toMessage } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import { btnPrimary, btnPrimaryOff, input as uiInput } from '../styles/ui';

// 見た目は DESIGN.md のトークンのみ（シートは BottomSheet と同じ面・影・背景）。
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 900,
  background: 'var(--backdrop)',
  WebkitBackdropFilter: 'var(--backdrop-blur)',
  backdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  fontFamily: 'var(--font-ui)',
};

const sheetStyle = {
  width: 'min(520px, 100%)',
  maxHeight: 'min(92vh, 92dvh)',
  background: 'var(--surface)',
  borderTopLeftRadius: 'var(--radius)',
  borderTopRightRadius: 'var(--radius)',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: 'var(--shadow-overlay)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  animation: 'slideUp .25s',
};

// 見出しの行は BottomSheet と同じ形（題名 17/600 を左・右上に「キャンセル」＝--text-2・17/400）。
// 下に決定ボタン（送信する）があるので、右上は「完了」ではなく「キャンセル」（DESIGN §5「シート」）。
const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 44,
  padding: 'var(--space-1) var(--space-4) var(--space-2)',
  borderBottom: '1px solid var(--separator)',
};

const cancelBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  fontSize: 'var(--text-body)',
  fontWeight: 400,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
  minWidth: 44,
  padding: 0,
};

const bodyStyle = {
  padding: 'var(--space-4)',
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

const labelStyle = {
  fontSize: 'var(--text-caption)',
  fontWeight: 600,
  color: 'var(--text-2)',
  display: 'block',
  marginBottom: 'var(--space-2)',
};

const inpStyle = uiInput;

const taStyle = {
  ...inpStyle,
  // 大きさを変えるつまみは出さない（右下の三角が枠に重なって見える・iOS では使えない）。
  resize: 'none',
  minHeight: 200,
  maxHeight: 500,
  lineHeight: 1.5,
};

// カテゴリは iOS の選択リストの形（DESIGN §5「選択の丸いチェック」）: 1 枚のカードに行を並べ、
// 行の間は --separator の線・左に 24 の丸（選ぶと --accent の塗り＋✓）・選んだ行は --accent-soft の面。
// ブラウザ既定のラジオは見せず、本物の input を透明にして丸の上に重ねる（押せる・読み上げ・キーボードはそのまま）。
const radioRowStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
};

const radioItemStyle = (active, first) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4)',
  borderTop: first ? 'none' : '1px solid var(--separator)',
  background: active ? 'var(--accent-soft)' : 'transparent',
  cursor: 'pointer',
  fontSize: 'var(--text-body)',
  lineHeight: 1.4,
  color: 'var(--text)',
  minHeight: 48,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
});

const checkSize = 'var(--space-6)'; // 24
const checkCircle = (on, focused) => ({
  width: checkSize, height: checkSize, borderRadius: '50%', boxSizing: 'border-box',
  display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
  background: on ? 'var(--accent)' : 'transparent',
  border: on ? 'none' : '2px solid var(--border)',
  color: 'var(--accent-ink)',
  // キーボードで触れたときだけ --accent-soft の輪（AuthScreen の同意と同じ）。
  boxShadow: focused ? '0 0 0 3px var(--accent-soft)' : 'none',
});
const radioNative = { position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' };

// 「（必須）」「（任意）」は赤い＊ではなく文字で（13/--text-2・色だけに頼らない）。
const reqStyle = { fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-2)' };

const metaStyle = { fontSize: 'var(--text-caption)', fontWeight: 400, color: 'var(--text-3)', margin: 'var(--space-1) var(--space-1) 0' };

const footerStyle = {
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--separator)',
};

// 「🐛 バグ報告」→「バグ報告」。先頭の絵文字（＋異体字セレクタ）と空白だけを落とす。
const stripLeadingEmoji = (label) => String(label || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '');

export default function FeedbackForm({ onClose }) {
  const { submitFeedback } = useFeedback();
  const toast = useToast();
  // カテゴリは「その他」を選んだ状態で始める（「要望」が付いたまま不具合の報告が届くのを防ぎつつ、
  // 選ばないと送れない＝理由の分からない押せないボタン、をなくす・2026-09-29）。
  const [category, setCategory] = useState('other');
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusedCat, setFocusedCat] = useState(''); // キーボードで触れている選択肢（輪を出す）
  const sheetRef = useRef(null);
  const trapRef = useFocusTrap(true); // ♿ Tab をフォーム内に閉じ込める
  const titleId = useId(); // ♿ ダイアログの名前＝見出し
  // 開いたらすぐ書けるように、本文の欄にカーソルを置く（描き終えた次のフレーム・画面は動かさない・2026-09-30）。
  const contentRef = useRef(null);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try { contentRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Close on ESC for desktop users.
  useEffect(() => {
    const onKey = (e) => {
      // IME 変換中の Esc はガード（変換キャンセルでシートごと閉じない）。
      if (e.key === 'Escape' && !busy && !e.isComposing && !e.nativeEvent?.isComposing) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // Push the sheet up over the iOS keyboard via visualViewport (matches the
  // QuickMemoSheet / LearningSheet pattern).
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const apply = () => {
      if (!sheetRef.current) return;
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheetRef.current.style.transform = offset > 60 ? `translateY(-${offset}px)` : '';
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  const submit = async () => {
    if (!category) {
      toast.error('カテゴリを選んでください。');
      return;
    }
    if (!content.trim()) {
      toast.error('内容を入力してください。');
      return;
    }
    setBusy(true);
    try {
      await submitFeedback({ category, content, name, email });
      toast.success('フィードバックを受け取りました。ありがとうございます！');
      onClose?.();
    } catch (e) {
      toast.error(toMessage(e, 'フィードバックの送信に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={trapRef}
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        // 親（設定モーダル）の overlay onClick まで bubbling すると両方一緒に閉じる。
        e.stopPropagation();
        if (!busy) onClose?.();
      }}
    >
      <div ref={sheetRef} style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        {/* ハンドルは押す部品ではなく「掴んで下へ」の目印（BottomSheet と同じ）。 */}
        <div style={{ padding: 'var(--space-2) 0 var(--space-1)' }}>
          <div className="lvg-sheet-handle" aria-hidden="true" />
        </div>
        <div style={headerStyle}>
          <h2 id={titleId} style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, fontWeight: 600 }}>フィードバック・要望</h2>
          {/* 閉じるのは右上の「キャンセル」だけ（下は「送信する」1 つ・同じ操作を 2 か所に出さない）。送信中は場所を残して隠す。 */}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-hidden={busy || undefined}
            tabIndex={busy ? -1 : undefined}
            style={{ ...cancelBtn, visibility: busy ? 'hidden' : 'visible' }}
          >
            キャンセル
          </button>
        </div>

        <div style={bodyStyle}>
          {/* Category */}
          <div role="radiogroup" aria-label="カテゴリ（必須）">
            <span style={labelStyle}>カテゴリ<span style={reqStyle}>（必須）</span></span>
            <div style={radioRowStyle}>
              {FEEDBACK_CATEGORIES.map((c, i) => {
                const on = category === c.value;
                return (
                  <label key={c.value} style={radioItemStyle(on, i === 0)}>
                    <span style={{ position: 'relative', width: checkSize, height: checkSize, flexShrink: 0 }}>
                      <input
                        type="radio"
                        name="feedback-category"
                        value={c.value}
                        checked={on}
                        onChange={() => setCategory(c.value)}
                        onFocus={(e) => { let v = true; try { v = e.target.matches(':focus-visible'); } catch { /* ignore */ } setFocusedCat(v ? c.value : ''); }}
                        onBlur={() => setFocusedCat('')}
                        style={radioNative}
                      />
                      <span aria-hidden="true" style={checkCircle(on, focusedCat === c.value)}>
                        {on && <Check size={16} strokeWidth={3} />}
                      </span>
                    </span>
                    {/* ラベル先頭の絵文字は表示しない（DESIGN §3-2: 絵文字を本文に混ぜない）。
                        定義（hooks/useFeedback.js）は運営画面等でも使うのでそのまま。 */}
                    <span style={{ fontWeight: on ? 600 : 400 }}>{stripLeadingEmoji(c.label)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div>
            <label htmlFor="feedback-content" style={labelStyle}>
              内容<span style={reqStyle}>（必須）</span>
            </label>
            <textarea
              ref={contentRef}
              id="feedback-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                // IME ガード: 変換中の Enter を握らない (デフォルト挙動 = 改行)
                if (e.nativeEvent.isComposing) return;
              }}
              placeholder={'どのような改善・要望ですか？\n具体的に書いていただけると助かります。\n\n例：\n・本の画面の◯◯ボタンが押しにくい\n・✕✕機能を追加してほしい'}
              maxLength={FEEDBACK_LIMITS.content}
              rows={8}
              style={taStyle}
              aria-required="true"
              disabled={busy}
            />
            <p style={{ ...metaStyle, textAlign: 'right' }}>
              {content.length} / {FEEDBACK_LIMITS.content}
            </p>
          </div>

          {/* Name (optional) */}
          <div>
            <label htmlFor="feedback-name" style={labelStyle}>
              お名前<span style={reqStyle}>（任意）</span>
            </label>
            <input
              id="feedback-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="匿名でも OK"
              maxLength={FEEDBACK_LIMITS.name}
              style={inpStyle}
              autoComplete="name"
              disabled={busy}
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label htmlFor="feedback-email" style={labelStyle}>
              連絡先メールアドレス<span style={reqStyle}>（任意）</span>
            </label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="返信が必要な場合のみ"
              maxLength={FEEDBACK_LIMITS.email}
              style={inpStyle}
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              disabled={busy}
            />
          </div>
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !content.trim() || !category}
            // 押せないときは薄くせず、面と文字の色で示す（DESIGN §5「押せないボタン」）。
            style={busy || !content.trim() || !category ? btnPrimaryOff : btnPrimary}
          >
            {busy ? '送信中…' : '送信する'}
          </button>
        </div>
      </div>
    </div>
  );
}
