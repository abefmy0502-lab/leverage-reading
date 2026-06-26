// 📩 FeedbackForm — bottom-sheet feedback / feature-request form.
//
// Opens from AccountSettings ("📩 フィードバックを送る"). Writes a row to
// public.feedback (see supabase_feedback.sql) using useFeedback. Submission
// is anonymous-ish: name + email are optional; user_id ties back via RLS so
// only the submitter (and admins via service_role) can read it later.

import { useEffect, useRef, useState } from 'react';
import { useFeedback, FEEDBACK_CATEGORIES, FEEDBACK_LIMITS } from '../hooks/useFeedback';
import { useToast } from './Toast';
import { toMessage } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from '../styles/ui';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 900,
  background: 'rgba(30,25,20,0.45)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  fontFamily: "var(--font-app)",
};

const sheetStyle = {
  width: 'min(520px, 100%)',
  maxHeight: 'min(92vh, 92dvh)',
  background: 'var(--c-card)',
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 -4px 20px rgba(0,0,0,0.10)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  animation: 'slideUp .25s',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 'calc(8px + env(safe-area-inset-top, 0px)) 16px 12px',
  borderBottom: '1px solid var(--c-hairline)',
};

const closeBtn = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--c-brand)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  padding: 0,
  fontFamily: 'inherit',
};

const bodyStyle = {
  padding: '14px 18px',
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--c-brand)',
  display: 'block',
  marginBottom: 6,
};

const inpStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid var(--c-hairline-strong)',
  borderRadius: 10,
  background: '#fff',
  color: 'var(--c-ink)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
};

const taStyle = {
  ...inpStyle,
  resize: 'vertical',
  minHeight: 200,
  maxHeight: 500,
  lineHeight: 1.7,
};

const radioRowStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const radioItemStyle = (active) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  borderRadius: 10,
  border: active ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
  background: active ? 'var(--c-soft-2)' : '#fff',
  cursor: 'pointer',
  fontSize: 14,
  color: 'var(--c-ink)',
  minHeight: 44,
  fontFamily: 'inherit',
});

const footerStyle = {
  display: 'flex',
  gap: 10,
  padding: '12px 18px calc(12px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--c-hairline)',
};

const btnPrimary = { ...uiBtnPrimary, width: 'auto', flex: 1, padding: '12px 18px', fontSize: 14, minHeight: 44 };

const btnGhost = { ...uiBtnGhost, width: 'auto', flex: 1, padding: '12px 18px', fontSize: 14, minHeight: 44 };

export default function FeedbackForm({ onClose }) {
  const { submitFeedback } = useFeedback();
  const toast = useToast();
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[1].value); // default: 機能の追加要望
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef(null);

  // Close on ESC for desktop users.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose?.();
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
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={() => !busy && onClose?.()}>
      <div ref={sheetRef} style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div className="lvg-sheet-handle" aria-hidden="true" />
        <div style={headerStyle}>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="閉じる" disabled={busy}>×</button>
          <h2 style={{ fontSize: 16, color: 'var(--c-ink)', margin: 0, fontWeight: 500, flex: 1 }}>📩 フィードバック・要望</h2>
        </div>

        <div style={bodyStyle}>
          <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: 0, lineHeight: 1.7 }}>
            アプリの改善のため、ご意見・ご要望をお寄せください。<br />
            すべての投稿に目を通させていただきます🙏
          </p>

          {/* Category */}
          <div role="radiogroup" aria-label="カテゴリ">
            <span style={labelStyle}>カテゴリ <span style={{ color: 'var(--c-critical)' }}>*</span></span>
            <div style={radioRowStyle}>
              {FEEDBACK_CATEGORIES.map((c) => (
                <label key={c.value} style={radioItemStyle(category === c.value)}>
                  <input
                    type="radio"
                    name="feedback-category"
                    value={c.value}
                    checked={category === c.value}
                    onChange={() => setCategory(c.value)}
                    style={{ accentColor: 'var(--c-brand)' }}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Content */}
          <div>
            <label htmlFor="feedback-content" style={labelStyle}>
              内容 <span style={{ color: 'var(--c-critical)' }}>*</span>
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
            <p style={{ fontSize: 10, color: 'var(--c-ink-2)', textAlign: 'right', margin: '4px 2px 0' }}>
              {content.length} / {FEEDBACK_LIMITS.content}
            </p>
          </div>

          {/* Name (optional) */}
          <div>
            <label htmlFor="feedback-name" style={labelStyle}>
              お名前 <span style={{ color: 'var(--c-ink-2)', fontWeight: 400 }}>（任意）</span>
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
              連絡先メールアドレス <span style={{ color: 'var(--c-ink-2)', fontWeight: 400 }}>（任意）</span>
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
            <p style={{ fontSize: 10, color: 'var(--c-ink-2)', margin: '4px 2px 0' }}>
              返信なしでも構いません。
            </p>
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
            {busy ? '送信中…' : '📤 送信する'}
          </button>
        </div>
      </div>
    </div>
  );
}
