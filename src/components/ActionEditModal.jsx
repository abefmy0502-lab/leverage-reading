// ✏️ ActionEditModal — 行動タブから直接タスクを編集するモーダル。
//
// 旧: 編集には本詳細を開く → 行動セクション → そこで編集、と 3 タップ要した。
// 新: 行動カードのケバブメニュー →「編集」で即その場でモーダルを開く。
// text / priority / deadline / recurrence / reflection をその場で更新。
//
// 親 (App.jsx) から `action` と onSave / onClose / onDelete を受ける。
// onSave({ text, priority, deadline, recurrence, reflection }) を呼ぶと
// App.jsx 側で saveBook 経由で永続化する (useBooks に処理を集約)。

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LIMITS } from '../lib/limits';
import { useConfirm } from './ConfirmDialog';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(30,25,20,0.55)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontFamily: "var(--font-app)",
  boxSizing: 'border-box',
};

const cardStyle = {
  background: '#faf6f0',
  borderRadius: 16,
  width: '100%',
  maxWidth: 'min(440px, 100vw - 16px)',
  maxHeight: 'min(90vh, 90dvh)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
  boxShadow: '0 16px 48px rgba(30,25,20,0.18)',
};

const headerStyle = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '14px 16px',
  borderBottom: '1px solid #e4ddd0',
  background: '#fff',
};

const closeBtn = {
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
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  WebkitOverflowScrolling: 'touch',
  boxSizing: 'border-box',
};

const labelStyle = { fontSize: 12, color: '#5c5043', fontWeight: 600, marginBottom: 4, display: 'block' };
const inpStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid #d4ccbe',
  borderRadius: 10,
  background: '#fff',
  color: '#3d362c',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  outline: 'none',
};
const taStyle = { ...inpStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.6 };

const chipBtn = (active) => ({
  flex: 1,
  padding: '8px 10px',
  borderRadius: 10,
  border: active ? '1.5px solid #5c5043' : '1px solid #d4ccbe',
  background: active ? '#eae3d6' : '#fff',
  color: active ? '#3d362c' : '#5c5043',
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 36,
});

const footerStyle = {
  flexShrink: 0,
  display: 'flex',
  gap: 8,
  padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid #e4ddd0',
  background: '#fff',
};

const PRIORITIES = [
  { v: 'high',   label: '🔴 高' },
  { v: 'medium', label: '🟡 中' },
  { v: 'low',    label: '🟢 低' },
];

const RECURRENCES = [
  { v: '',        label: '繰り返さない' },
  { v: 'weekly',  label: '毎週' },
  { v: 'monthly', label: '毎月' },
];

export default function ActionEditModal({ action, onSave, onClose, onDelete }) {
  const [text, setText] = useState(action?.text || '');
  const [deadline, setDeadline] = useState(action?.deadline || '');
  const [priority, setPriority] = useState(action?.priority || 'medium');
  const [recurrence, setRecurrence] = useState(action?.recurrence || '');
  const [reflection, setReflection] = useState(action?.reflection || '');
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (busy) return;
    if (!text.trim()) {
      // 空保存は不可。inline の visual hint で OK。
      return;
    }
    setBusy(true);
    try {
      await onSave({
        text: text.trim(),
        deadline: deadline || '',
        priority: priority || 'medium',
        recurrence: recurrence || null,
        reflection: reflection || '',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    const ok = await confirm({
      title: '行動を削除',
      message: 'この行動を削除しますか？',
      confirmLabel: '削除',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onDelete?.();
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div style={overlayStyle} role="dialog" aria-modal="true" onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={{ fontSize: 16, color: '#3d362c', margin: 0, fontWeight: 600, flex: 1 }}>✏️ 行動を編集</h2>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="閉じる">×</button>
        </div>

        <div style={bodyStyle}>
          <div>
            <label style={labelStyle} htmlFor="ae-text">📋 行動内容</label>
            <textarea
              id="ae-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
              placeholder="例：営業会議で結論ファーストを実践する"
              rows={3}
              style={taStyle}
              maxLength={LIMITS.actionText || 500}
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="ae-deadline">📅 期限</label>
            <input
              id="ae-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={inpStyle}
            />
          </div>

          <div>
            <span style={labelStyle}>🎯 優先度</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {PRIORITIES.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => setPriority(p.v)}
                  style={chipBtn(priority === p.v)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle} htmlFor="ae-rec">🔁 繰り返し</label>
            <select
              id="ae-rec"
              value={recurrence || ''}
              onChange={(e) => setRecurrence(e.target.value)}
              style={inpStyle}
            >
              {RECURRENCES.map((r) => (
                <option key={r.v} value={r.v}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle} htmlFor="ae-ref">💭 振り返り (任意)</label>
            <textarea
              id="ae-ref"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
              placeholder="やってみてどうだったか (任意)"
              rows={2}
              style={taStyle}
              maxLength={LIMITS.memoText}
            />
          </div>
        </div>

        <div style={footerStyle}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid #c4a0a0',
              background: '#fdf0ed',
              color: '#a05040',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              minHeight: 44,
              opacity: busy ? 0.6 : 1,
            }}
          >
            🗑 削除
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid #d4ccbe',
              background: '#fff',
              color: '#5c5043',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer',
              minHeight: 44,
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !text.trim()}
            style={{
              flex: 1.4,
              padding: '12px 14px',
              borderRadius: 10,
              border: 'none',
              background: busy || !text.trim() ? '#d4ccbe' : '#5c5043',
              color: '#faf6f0',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: busy || !text.trim() ? 'not-allowed' : 'pointer',
              minHeight: 44,
            }}
          >
            {busy ? '保存中…' : '💾 保存'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
