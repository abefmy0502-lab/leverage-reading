// 📩 FeedbackForm — bottom-sheet feedback / feature-request form.
//
// Opens from AccountSettings (「フィードバック・要望を送る」). Writes a row to
// public.feedback (see supabase_feedback.sql) using useFeedback. Submission
// is anonymous-ish: name + email are optional; user_id ties back via RLS so
// only the submitter (and admins via service_role) can read it later.

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X } from 'lucide-react';
import { useFeedback, FEEDBACK_CATEGORIES, FEEDBACK_LIMITS } from '../hooks/useFeedback';
import { useToast } from './Toast';
import { toMessage } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost, input as uiInput } from '../styles/ui';

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

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'calc(var(--space-2) + env(safe-area-inset-top, 0px)) var(--space-4) var(--space-2) var(--space-2)',
  borderBottom: '1px solid var(--separator)',
};

const closeBtn = {
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  fontFamily: 'inherit',
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
  resize: 'vertical',
  minHeight: 200,
  maxHeight: 500,
  lineHeight: 1.5,
};

const radioRowStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
};

const radioItemStyle = (active) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  cursor: 'pointer',
  fontSize: 'var(--text-body)',
  color: 'var(--text)',
  minHeight: 44,
  boxSizing: 'border-box',
  fontFamily: 'inherit',
});

const metaStyle = { fontSize: 'var(--text-caption)', fontWeight: 400, color: 'var(--text-3)', margin: 'var(--space-1) var(--space-1) 0' };

const footerStyle = {
  display: 'flex',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--separator)',
};

const btnPrimary = { ...uiBtnPrimary, width: 'auto', flex: 1 };

const btnGhost = { ...uiBtnGhost, width: 'auto', flex: 1 };

// 「🐛 バグ報告」→「バグ報告」。先頭の絵文字（＋異体字セレクタ）と空白だけを落とす。
const stripLeadingEmoji = (label) => String(label || '').replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '');

export default function FeedbackForm({ onClose }) {
  const { submitFeedback } = useFeedback();
  const toast = useToast();
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[1].value); // default: 機能の追加要望
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef(null);
  const trapRef = useFocusTrap(true); // ♿ Tab をフォーム内に閉じ込める

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
      onClick={(e) => {
        // 親（設定モーダル）の overlay onClick まで bubbling すると両方一緒に閉じる。
        e.stopPropagation();
        if (!busy) onClose?.();
      }}
    >
      <div ref={sheetRef} style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div className="lvg-sheet-handle" aria-hidden="true" />
        <div style={headerStyle}>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="閉じる" disabled={busy}><X size={20} aria-hidden="true" /></button>
          <h2 style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, fontWeight: 700, flex: 1, lineHeight: 1.3 }}>フィードバック・要望</h2>
        </div>

        <div style={bodyStyle}>
          {/* Category */}
          <div role="radiogroup" aria-label="カテゴリ">
            <span style={labelStyle}>カテゴリ <span style={{ color: 'var(--error)' }}>*</span></span>
            <div style={radioRowStyle}>
              {FEEDBACK_CATEGORIES.map((c) => (
                <label key={c.value} style={radioItemStyle(category === c.value)}>
                  <input
                    type="radio"
                    name="feedback-category"
                    value={c.value}
                    checked={category === c.value}
                    onChange={() => setCategory(c.value)}
                    style={{ accentColor: 'var(--accent)', margin: 0 }}
                  />
                  {/* ラベル先頭の絵文字は表示しない（DESIGN §3-2: 絵文字を本文に混ぜない）。
                      定義（hooks/useFeedback.js）は運営画面等でも使うのでそのまま。 */}
                  <span>{stripLeadingEmoji(c.label)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Content */}
          <div>
            <label htmlFor="feedback-content" style={labelStyle}>
              内容 <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <textarea
              id="feedback-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                // IME ガード: 変換中の Enter を握らない (デフォルト挙動 = 改行)
                if (e.nativeEvent.isComposing) return;
              }}
              placeholder={'どのような改善・要望ですか？\n具体的に書いていただけると助かります。\n\n例：\n・本詳細画面の◯◯ボタンが押しにくい\n・✕✕機能を追加してほしい'}
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
              お名前 <span style={{ fontWeight: 400 }}>（任意）</span>
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
              連絡先メールアドレス <span style={{ fontWeight: 400 }}>（任意）</span>
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
          <button type="button" onClick={onClose} style={btnGhost} disabled={busy}>
            キャンセル
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !content.trim()}
            style={{ ...btnPrimary, opacity: busy || !content.trim() ? 0.6 : 1 }}
            aria-label="フィードバックを送信"
          >
            {busy ? '送信中…' : '送信する'}
          </button>
        </div>
      </div>
    </div>
  );
}
