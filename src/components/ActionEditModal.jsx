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
import { Pencil, ClipboardList, CalendarDays, Target, Repeat, MessageSquareQuote, Trash2, Save, ArrowUp, Minus, ArrowDown, X } from 'lucide-react';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-dialog)',
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
  background: 'var(--c-card)',
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
  borderBottom: '1px solid var(--c-hairline)',
  background: 'var(--c-card)',
};

const closeBtn = {
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

const labelStyle = { fontSize: 12, color: 'var(--c-brand)', fontWeight: 600, marginBottom: 4, display: 'block' };
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
const taStyle = { ...inpStyle, resize: 'vertical', minHeight: 80, lineHeight: 1.6 };

const chipBtn = (active) => ({
  flex: 1,
  padding: '8px 10px',
  borderRadius: 10,
  border: active ? '1.5px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
  background: active ? 'var(--c-soft-2)' : '#fff',
  color: active ? 'var(--c-ink)' : 'var(--c-brand)',
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
  borderTop: '1px solid var(--c-hairline)',
  background: 'var(--c-card)',
};

const PRIORITIES = [
  { v: 'high',   label: (<><ArrowUp size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />高</>) },
  { v: 'medium', label: (<><Minus size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />中</>) },
  { v: 'low',    label: (<><ArrowDown size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />低</>) },
];

const RECURRENCES = [
  { v: '',        label: '繰り返さない' },
  { v: 'weekly',  label: '毎週' },
  { v: 'monthly', label: '毎月' },
];

// mode: 'edit'（既定・従来挙動） | 'create'（行動タブの「＋行動を追加」用）。
// create では削除ボタンと「振り返り」欄を出さない（まだやっていない行動に
// 振り返りは書けない）。保存 payload の形は両モードで同一。
export default function ActionEditModal({ action, onSave, onClose, onDelete, mode = 'edit' }) {
  const isCreate = mode === 'create';
  const [text, setText] = useState(action?.text || '');
  const [deadline, setDeadline] = useState(action?.deadline || '');
  const [priority, setPriority] = useState(action?.priority || 'medium');
  const [recurrence, setRecurrence] = useState(action?.recurrence || '');
  const [reflection, setReflection] = useState(action?.reflection || '');
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    // IME 変換中の Esc（変換キャンセル）でモーダルごと閉じて下書きを失わない
    // よう isComposing をガード（QuickMemoSheet と同パターン）。
    const onKey = (e) => { if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) onClose?.(); };
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
          <h2 style={{ fontSize: 16, color: 'var(--c-ink)', margin: 0, fontWeight: 600, flex: 1 }}><Pencil size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />{isCreate ? '行動を追加' : '行動を編集'}</h2>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
        </div>

        <div style={bodyStyle}>
          <div>
            <label style={labelStyle} htmlFor="ae-text"><ClipboardList size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />行動内容</label>
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
            <label style={labelStyle} htmlFor="ae-deadline"><CalendarDays size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />期限</label>
            <input
              id="ae-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              style={inpStyle}
            />
          </div>

          <div>
            <span style={labelStyle}><Target size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />優先度</span>
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
            <label style={labelStyle} htmlFor="ae-rec"><Repeat size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />繰り返し</label>
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

          {!isCreate && (
            <div>
              <label style={labelStyle} htmlFor="ae-ref"><MessageSquareQuote size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />振り返り (任意)</label>
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
          )}
        </div>

        <div style={footerStyle}>
          {!isCreate && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--c-critical-line)',
              background: 'var(--c-critical-soft)',
              color: 'var(--c-critical)',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              minHeight: 44,
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Trash2 size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />削除
          </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--c-hairline-strong)',
              background: 'var(--c-card)',
              color: 'var(--c-brand)',
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
              background: busy || !text.trim() ? 'var(--c-hairline-strong)' : 'var(--c-brand)',
              color: 'var(--c-card)',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 700,
              cursor: busy || !text.trim() ? 'not-allowed' : 'pointer',
              minHeight: 44,
            }}
          >
            {busy ? '保存中…' : (<><Save size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />{isCreate ? '追加' : '保存'}</>)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
