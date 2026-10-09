// ✏️ ActionEditModal — 行動タブから直接タスクを編集するモーダル。
//
// 旧: 編集には本詳細を開く → 行動セクション → そこで編集、と 3 タップ要した。
// 新: 行動カードのケバブメニュー →「編集」で即その場でモーダルを開く。
// text / priority / deadline / recurrence / reflection をその場で更新。
//
// 親 (App.jsx) から `action` と onSave / onClose / onDelete を受ける。
// onSave({ text, priority, deadline, recurrence, reflection }) を呼ぶと
// App.jsx 側で saveBook 経由で永続化する (useBooks に処理を集約)。

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LIMITS } from '../lib/limits';
import { useConfirm } from './ConfirmDialog';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBlockEdgeSwipe } from '../hooks/useEdgeSwipeBack';
import { ArrowUp, Minus, ArrowDown, X } from 'lucide-react';
import { btnPrimary, btnPrimaryOff, btnGhost, btnGhostOff, btnLink, groupTitle, input as uiInput } from '../styles/ui';
import { toLocalYmd } from '../lib/dates';
import { DATE_HINT } from '../lib/dateHint';
import { withPhraseBreaks } from './TightBubble';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-dialog)',
  background: 'var(--backdrop)',
  backdropFilter: 'var(--backdrop-blur)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-4)',
  fontFamily: 'var(--font-ui)',
  boxSizing: 'border-box',
};

// 見た目はトークンと ui.js の部品だけ（角丸 12・文字 12 以上・栗色は主ボタンと選択中だけ・2026-09-27）。
const cardStyle = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  width: '100%',
  maxWidth: 'min(440px, 100vw - 16px)',
  maxHeight: 'min(90vh, 90dvh)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
  boxShadow: 'var(--shadow-overlay)',
};

const headerStyle = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
  borderBottom: '1px solid var(--separator)',
  background: 'var(--surface)',
};

const closeBtn = {
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  padding: 0,
  borderRadius: 'var(--radius)',
};

const bodyStyle = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  minHeight: 0,
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
  WebkitOverflowScrolling: 'touch',
  boxSizing: 'border-box',
};

// 欄の見出し（12/600/--text-2・DESIGN §5 groupTitle）。
const labelStyle = { ...groupTitle, display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginBottom: 'var(--space-2)' };
const inpStyle = { ...uiInput, outline: 'none' };
const taStyle = { ...inpStyle, resize: 'none', minHeight: 96, lineHeight: 1.6 };

// 優先度の選択（高さ 44）。期限の「明日」「来週」と同じ操作のチップの形（--fill・枠なし・選んでいるものは
// --accent-soft＋--accent/600・DESIGN §5・2026-10-01 ui-critic）。
const chipBtn = (active) => ({
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  border: 'none',
  background: active ? 'var(--accent-soft)' : 'var(--fill)',
  color: active ? 'var(--accent)' : 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontWeight: active ? 600 : 400,
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
});

const footerStyle = {
  flexShrink: 0,
  display: 'flex',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + var(--safe-bottom-kb))',
  borderTop: '1px solid var(--separator)',
  background: 'var(--surface)',
};

// 期限をすぐ決める操作のチップ（DESIGN §5「操作のチップ」: --fill・枠なし・高さ 44・15/--text・選んでいる日は --accent-soft＋--accent/600）。
const quickChip = (active) => ({
  minHeight: 44,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  border: 'none',
  background: active ? 'var(--accent-soft)' : 'var(--fill)',
  color: active ? 'var(--accent)' : 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontWeight: active ? 600 : 400,
  fontFamily: 'inherit',
  cursor: 'pointer',
  flexShrink: 0,
});
const daysFromToday = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toLocalYmd(d); };
const QUICK_DEADLINES = [
  { label: '明日', days: 1 },
  { label: '来週', days: 7 },
];

const PRIORITIES = [
  { v: 'high',   label: (<><ArrowUp size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />高</>) },
  { v: 'medium', label: (<><Minus size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />中</>) },
  { v: 'low',    label: (<><ArrowDown size="1em" aria-hidden="true" style={{ flexShrink: 0 }} />低</>) },
];

const RECURRENCES = [
  // 見出しが「繰り返し」なので「なし」（3 つを同じ幅に並べる・2026-10-04 ui-critic）。
  { v: '',        label: 'なし' },
  { v: 'weekly',  label: '毎週' },
  { v: 'monthly', label: '毎月' },
];

// mode: 'edit'（既定・従来挙動） | 'create'（行動タブの「＋行動を追加」用）。
// create では削除ボタンと「振り返り」欄を出さない（まだやっていない行動に
// 振り返りは書けない）。保存 payload の形は両モードで同一。
// step: 「期限を見直す」で期限を過ぎた行動を順に開くとき { index, total }（見出しを「期限を見直す（2/5）」、
//   あとがあれば保存ボタンを「保存して次へ」に・2026-09-30）。
// onSkip: 「期限を見直す」の途中で、この行動は変えずに次へ（step があるときだけ出す・2026-09-30）。
// bookTitle: どの本の行動か（題の下に『書名』・追加のときは本を選んだすぐあとなので特に・2026-10-04）。無ければ action.bookTitle。
export default function ActionEditModal({ action, onSave, onClose, onDelete, onSkip, mode = 'edit', step = null, bookTitle = null }) {
  const shownBookTitle = bookTitle || action?.bookTitle || '';
  const isCreate = mode === 'create';
  // 「期限を見直す」の途中（期限を決め直すのが目的なので、期限の欄にカーソルを置き、ボタンは短い言葉に）。
  const reviewing = !!step;
  const hasNext = !!(step && step.index < step.total);
  const [text, setText] = useState(action?.text || '');
  const [deadline, setDeadline] = useState(action?.deadline || '');
  const [priority, setPriority] = useState(action?.priority || 'medium');
  const [recurrence, setRecurrence] = useState(action?.recurrence || '');
  const [reflection, setReflection] = useState(action?.reflection || '');
  const [busy, setBusy] = useState(false);
  // 保存できなかった理由（onSave が { error } を返したとき）。知らせ（Toast）はこのモーダルの下に隠れて読めないので、
  // 決定ボタンのすぐ上に 1 行で出す（書いた内容はそのまま・メモを書くシートと同じ形・2026-10-04）。
  const [saveError, setSaveError] = useState('');
  // 保存の在空中にモーダルが閉じて再入力→重複作成される穴を塞ぐ（Escape/背景/×共通）。
  const busyRef = useRef(false);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  const confirm = useConfirm();
  const trapRef = useFocusTrap(true);
  const titleId = useId(); // ♿ ダイアログの名前＝見出し（読み上げで名前が無いまま開かない）
  // 開いている間は左端スワイプ・ブラウザの「戻る」で画面ごと離れない（書きかけの行動を失わない）。
  useBlockEdgeSwipe(true);

  // 書きかけ・直しかけのまま背景・×・Esc で閉じると、書いたことが黙って消えていた（2026-10-04）。
  //   変えたところがあるときだけ確かめる（メモの書きかけと同じ言葉・ConfirmDialog）。
  const dirty = text !== (action?.text || '')
    || deadline !== (action?.deadline || '')
    || priority !== (action?.priority || 'medium')
    || (recurrence || '') !== (action?.recurrence || '')
    || reflection !== (action?.reflection || '');
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const closingRef = useRef(false);
  const requestClose = async () => {
    if (busyRef.current || closingRef.current) return;
    if (!dirtyRef.current) { onClose?.(); return; }
    closingRef.current = true;
    const ok = await confirm(isCreate ? {
      title: '書きかけの行動があります',
      message: '消すと、元に戻せません。',
      confirmLabel: '書いたことを消す',
      cancelLabel: '編集を続ける',
      danger: true,
    } : {
      title: '保存していない変更があります',
      message: '行動は元のまま残ります。',
      confirmLabel: '直したところを捨てる',
      cancelLabel: '編集を続ける',
      danger: true,
    });
    closingRef.current = false;
    if (ok) onClose?.();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    // IME 変換中の Esc（変換キャンセル）でモーダルごと閉じて下書きを失わない
    // よう isComposing をガード（QuickMemoSheet と同パターン）。
    const onKey = (e) => { if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing && !busyRef.current) requestCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSave = async () => {
    if (busy) return;
    if (!text.trim()) {
      // 空保存は不可。inline の visual hint で OK。
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      const res = await onSave({
        text: text.trim(),
        deadline: deadline || '',
        priority: priority || 'medium',
        recurrence: recurrence || null,
        reflection: reflection || '',
      });
      if (res && res.error) setSaveError(res.error);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    const ok = await confirm({
      title: '行動を削除しますか？',
      message: '削除した行動は元に戻せません。',
      confirmLabel: '削除する',
      cancelLabel: 'やめる',
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
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={() => { if (!busy) requestClose(); }}>
      <div ref={trapRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id={titleId} style={{ fontSize: 'var(--text-body)', color: 'var(--text)', margin: 0, fontWeight: 600 }}>{isCreate ? '行動を追加' : step ? `期限を見直す（${step.index}/${step.total}）` : '行動を編集'}</h2>
            {shownBookTitle && (
              <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFeatureSettings: '"palt"' }}>『{shownBookTitle}』</p>
            )}
          </div>
          {/* やめる・キャンセルは右上の × 1 か所（下の行は 削除＋保存 だけ・2026-10-01 ui-critic）。 */}
          <button type="button" style={closeBtn} onClick={() => { if (!busy) requestClose(); }} aria-label={reviewing ? '見直しをやめる' : '閉じる'}><X size={20} aria-hidden="true" /></button>
        </div>

        <div style={bodyStyle}>
          <div>
            <label style={labelStyle} htmlFor="ae-text">行動</label>
            <textarea
              id="ae-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
              placeholder="例：営業会議で結論ファーストを実践する"
              rows={3}
              style={taStyle}
              maxLength={LIMITS.actionText || 500}
              autoFocus={!reviewing}
            />
          </div>

          <div>
            <label style={labelStyle} htmlFor="ae-deadline">期限</label>
            <input
              id="ae-deadline"
              type="date"
              value={deadline}
              data-empty={deadline ? undefined : DATE_HINT}
              onChange={(e) => setDeadline(e.target.value)}
              style={inpStyle}
              autoFocus={reviewing}
            />
            {/* よく使う期限は 1 回で（2026-09-30）。見直しの途中は、同じ行の右に「この行動は飛ばす」。 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              {QUICK_DEADLINES.map((q) => {
                const v = daysFromToday(q.days);
                return (
                  <button key={q.label} type="button" aria-pressed={deadline === v} onClick={() => setDeadline(v)} style={quickChip(deadline === v)}>
                    {q.label}
                  </button>
                );
              })}
              {reviewing && onSkip && (
                <button
                  type="button"
                  onClick={() => { if (!busy) onSkip(); }}
                  disabled={busy}
                  style={{ ...btnLink, marginLeft: 'auto', marginRight: 'calc(-1 * var(--space-1))', color: busy ? 'var(--text-3)' : btnLink.color, opacity: 1 }}
                >
                  この行動は飛ばす
                </button>
              )}
            </div>
          </div>

          <div>
            <span style={labelStyle} id="ae-priority">優先度</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }} role="group" aria-labelledby="ae-priority">
              {PRIORITIES.map((p) => (
                <button
                  key={p.v}
                  type="button"
                  aria-pressed={priority === p.v}
                  onClick={() => setPriority(p.v)}
                  style={chipBtn(priority === p.v)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 繰り返しも優先度と同じ操作のチップ（端末のプルダウンを開かずに 1 回で選べる・2026-10-04）。
              文字を大きくして 1 行に収まらないときは折り返す。 */}
          <div>
            <span style={labelStyle} id="ae-rec">繰り返し</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }} role="group" aria-labelledby="ae-rec">
              {RECURRENCES.map((r) => (
                <button
                  key={r.v}
                  type="button"
                  aria-pressed={(recurrence || '') === r.v}
                  onClick={() => setRecurrence(r.v)}
                  style={{ ...chipBtn((recurrence || '') === r.v), whiteSpace: 'nowrap' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* ふりかえりは、やり終えた行動だけ（まだの行動に「やってみてどうだったか」は書けない・2026-09-30）。 */}
          {!isCreate && action?.done && (
            <div>
              <label style={labelStyle} htmlFor="ae-ref">ふりかえり（任意）</label>
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

        {saveError && (
          <p role="alert" style={{ margin: 0, padding: 'var(--space-3) var(--space-4)', color: 'var(--error)', fontSize: 'var(--text-sub)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(saveError)}</p>
        )}
        <div style={footerStyle}>
          {!isCreate && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            // 削除は文字色だけ赤の副ボタン（押せないときは薄くせず文字色で示す）。
            style={{ ...(busy ? btnGhostOff : btnGhost), width: 'auto', flexShrink: 0, whiteSpace: 'nowrap', color: busy ? 'var(--text-3)' : 'var(--error)' }}
          >
            削除
          </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !text.trim()}
            style={{ ...(busy || !text.trim() ? btnPrimaryOff : btnPrimary), flex: 1, width: 'auto', whiteSpace: 'nowrap' }}
          >
            {busy ? '保存中…' : (isCreate ? '追加' : hasNext ? '次へ' : '保存')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
