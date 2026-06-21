import { useEffect, useMemo, useRef, useState } from 'react';
import { useBookMemos } from '../hooks/useBookMemos';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import { MemoListSkeleton } from './Skeleton';
import { LIMITS } from '../lib/limits';
import ContextMenu from './ContextMenu';
import BookMemoCard from './BookMemoCard';
import BookMemoEditor from './BookMemoEditor';

const MODE_KEY = 'leverageMemoMode';

const modeTab = (active) => ({
  flex: 1,
  minHeight: 44,
  padding: '10px 0',
  border: 'none',
  background: active ? '#5c5043' : 'transparent',
  color: active ? '#faf6f0' : '#5c5548',
  fontSize: 13,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 8,
  transition: 'background .15s, color .15s',
});

const sortTab = (active) => ({
  flex: 1,
  padding: '8px 0',
  minHeight: 44,
  border: 'none',
  background: active ? '#5c5043' : 'transparent',
  color: active ? '#faf6f0' : '#8a7e6b',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 8,
  transition: 'background .15s',
});

const addBtn = {
  width: '100%',
  padding: '12px 0',
  minHeight: 44,
  borderRadius: 10,
  border: '1px dashed #c4b8a6',
  background: '#faf6f0',
  color: '#5c5043',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
};

const summaryTextarea = {
  width: '100%',
  minHeight: 300,
  maxHeight: 600,
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid #d4ccbe',
  borderRadius: 10,
  background: '#fff',
  color: '#3d362c',
  fontFamily: 'inherit',
  lineHeight: 1.8,
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

const summarySaveBtn = (saving) => ({
  width: '100%',
  padding: '12px 0',
  borderRadius: 10,
  border: 'none',
  background: '#5c5043',
  color: '#faf6f0',
  cursor: saving ? 'default' : 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  letterSpacing: 1,
  opacity: saving ? 0.6 : 1,
  marginTop: 10,
});

function loadInitialMode() {
  if (typeof window === 'undefined') return 'card';
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === 'summary' ? 'summary' : 'card';
  } catch {
    return 'card';
  }
}

function SummarySection({ bookId, summaryText, onSaveSummary }) {
  const [text, setText] = useState(summaryText || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const flashTimerRef = useRef(null);

  // Reset local text only when the underlying book changes,
  // so unsaved typing is preserved when toggling tabs.
  useEffect(() => {
    setText(summaryText || '');
    setErrorMsg('');
    setSavedFlash(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const handleSave = async () => {
    if (saving || !onSaveSummary) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await onSaveSummary(text);
      setSavedFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSavedFlash(false), 1000);
    } catch (e) {
      console.error('summary save error', e);
      setErrorMsg(e?.message || 'まとめメモの保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const label = saving ? '保存中...' : savedFlash ? '保存しました ✓' : '保存';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ fontSize: 13, color: '#5c5548', fontWeight: 600, margin: 0 }}>まとめメモ</p>
        <p style={{ fontSize: 11, color: '#a89e8c', margin: '2px 0 8px', lineHeight: 1.6 }}>
          本全体の感想・学びを自由に書く欄です。
        </p>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.nativeEvent.isComposing) {
            e.preventDefault();
          }
        }}
        placeholder={'本を読んで得た学び・全体の感想・行動につなげたいポイントなど。'}
        style={summaryTextarea}
        maxLength={LIMITS.summaryMemo}
      />
      {errorMsg && (
        <p style={{ color: '#a05040', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={summarySaveBtn(saving)}
      >
        {label}
      </button>
    </div>
  );
}

export default function BookMemoList({ bookId, bookTitle, summaryText = '', onSaveSummary }) {
  const [mode, setMode] = useState(loadInitialMode);
  const [sortBy, setSortBy] = useState('page');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const {
    memos,
    loading,
    isUsableBookId,
    createMemo,
    updateMemo,
    deleteMemo,
    restoreMemoFromSnapshot,
  } = useBookMemos(bookId, { sortBy });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore quota errors */
    }
  }, [mode]);

  // Scroll the BookMemoList into view on tab change so the new tab's content
  // starts at the top of the viewport. We use scrollIntoView (not window
  // scrollTo 0) because the BookMemoList sits inside the page below the book
  // header — jumping to absolute top would hide context the user expects.
  const rootRef = useRef(null);
  const isFirstModeRender = useRef(true);
  useEffect(() => {
    if (isFirstModeRender.current) {
      isFirstModeRender.current = false;
      return;
    }
    rootRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [mode]);

  const allTags = useMemo(() => {
    const s = new Set();
    memos.forEach((m) => (m.tags || []).forEach((t) => s.add(t)));
    return [...s];
  }, [memos]);

  const lastPageNumber = useMemo(() => {
    const nums = memos.map((m) => m.pageNumber).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return '';
    return Math.max(...nums);
  }, [memos]);

  const openCreate = () => {
    setEditingMemo(null);
    setEditorOpen(true);
  };
  const openEdit = (memo) => {
    setEditingMemo(memo);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingMemo(null);
  };

  const handleCreate = async (payload) => {
    const result = await createMemo(payload);
    toast.success('メモを保存しました');
    return result;
  };

  const handleUpdate = async (memoId, payload) => {
    const result = await updateMemo(memoId, payload);
    toast.success('メモを更新しました');
    return result;
  };

  // Inner delete: snapshot, fire delete, show Undo toast. Used by both the
  // confirm-fronted handler (kebab/long-press menu) and the swipe gesture.
  const performDelete = (memo) => {
    const snapshot = { ...memo };
    const deletionPromise = deleteMemo(memo.id).catch((e) => {
      toast.error(toMessage(e, 'メモの削除に失敗しました。'));
      throw e;
    });
    toast.undo({
      message: snapshot.photoPath
        ? 'メモを削除しました\n※写真は復元できません'
        : 'メモを削除しました',
      onUndo: async () => {
        try {
          await deletionPromise.catch(() => {});
          await restoreMemoFromSnapshot(snapshot);
          toast.info('削除を取り消しました');
        } catch (e) {
          toast.error(toMessage(e, '復元に失敗しました。'));
        }
      },
    });
  };

  // Confirmed delete (kebab "⋮" → 削除 / long-press menu → 削除).
  const handleDelete = async (memo) => {
    const ok = await confirm({
      title: 'このメモを削除しますか？',
      message: memo.photoPath
        ? '写真も Storage から削除されます。\n（取消した場合、本文は復元されますが写真は戻りません）'
        : '元に戻すには取消ボタンを押してください。',
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    performDelete(memo);
  };

  // Swipe-driven delete (gesture itself = intent, no confirm modal).
  const handleSwipeDelete = (memo) => performDelete(memo);

  // Long-press → ContextMenu state
  const [memoMenu, setMemoMenu] = useState(null); // { x, y, memo }

  const cardSection = !isUsableBookId ? (
    <div
      style={{
        padding: '14px',
        background: '#faf6f0',
        border: '1px dashed #d4ccbe',
        borderRadius: 10,
        fontSize: 12,
        color: '#8a7e6b',
        lineHeight: 1.7,
      }}
    >
      本を一度保存するとカード形式のメモを追加できます。
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, background: '#f0ebe2', borderRadius: 10 }}>
        <button type="button" style={sortTab(sortBy === 'page')} onClick={() => setSortBy('page')}>
          📖 ページ順
        </button>
        <button
          type="button"
          style={sortTab(sortBy === 'created_desc')}
          onClick={() => setSortBy('created_desc')}
        >
          🕒 新しい順
        </button>
      </div>

      <button type="button" onClick={openCreate} style={addBtn}>
        ＋ 新しいメモ
      </button>

      {loading && memos.length === 0 && <MemoListSkeleton rows={3} />}

      {!loading && memos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '28px 16px', color: '#5c5548' }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>📝</div>
          <p style={{ fontSize: 13, color: '#5c5548', margin: 0, lineHeight: 1.7 }}>
            読みながら気になった一行を、ひとつ残してみましょう。
          </p>
          <p style={{ fontSize: 11, color: '#a89e8c', margin: '6px 0 0', lineHeight: 1.7 }}>
            残した一行は、あとで「振り返り」の想起として、ふいに戻ってきます。
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {memos.map((m) => (
          <BookMemoCard
            key={m.id}
            memo={m}
            onEdit={openEdit}
            onDelete={handleDelete}
            onSwipeDelete={handleSwipeDelete}
            onLongPress={(payload) => setMemoMenu(payload)}
          />
        ))}
      </div>
    </div>
  );

  const summarySection = onSaveSummary ? (
    <SummarySection bookId={bookId} summaryText={summaryText} onSaveSummary={onSaveSummary} />
  ) : (
    <div
      style={{
        padding: '14px',
        background: '#faf6f0',
        border: '1px dashed #d4ccbe',
        borderRadius: 10,
        fontSize: 12,
        color: '#8a7e6b',
        lineHeight: 1.7,
      }}
    >
      この画面ではまとめメモを編集できません。
    </div>
  );

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, background: '#eae3d6', borderRadius: 10 }}>
        <button type="button" style={modeTab(mode === 'card')} onClick={() => setMode('card')}>
          📇 カード
        </button>
        <button type="button" style={modeTab(mode === 'summary')} onClick={() => setMode('summary')}>
          📝 まとめ
        </button>
      </div>

      {/* Both sections stay mounted so unsaved typing is preserved across tab switches. */}
      <div style={{ display: mode === 'card' ? 'block' : 'none' }}>{cardSection}</div>
      <div style={{ display: mode === 'summary' ? 'block' : 'none' }}>{summarySection}</div>

      {memoMenu && (
        <ContextMenu
          x={memoMenu.x}
          y={memoMenu.y}
          onClose={() => setMemoMenu(null)}
          items={[
            { label: '編集', icon: '✏️', onClick: () => openEdit(memoMenu.memo) },
            { label: '削除', icon: '🗑️', destructive: true, onClick: () => handleDelete(memoMenu.memo) },
          ]}
        />
      )}

      {editorOpen && (
        <BookMemoEditor
          bookTitle={bookTitle}
          initial={editingMemo}
          defaultPageNumber={
            !editingMemo && Number.isFinite(lastPageNumber) ? lastPageNumber + 1 : ''
          }
          allTags={allTags}
          onClose={closeEditor}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
