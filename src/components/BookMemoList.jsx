import { useMemo, useState } from 'react';
import { useBookMemos } from '../hooks/useBookMemos';
import BookMemoCard from './BookMemoCard';
import BookMemoEditor from './BookMemoEditor';

const sortTab = (active) => ({
  flex: 1,
  padding: '8px 0',
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
  borderRadius: 10,
  border: '1px dashed #c4b8a6',
  background: '#faf6f0',
  color: '#5c5043',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 500,
};

export default function BookMemoList({ bookId, bookTitle }) {
  const [sortBy, setSortBy] = useState('page');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState(null);
  const { memos, loading, isUsableBookId, createMemo, updateMemo, deleteMemo } = useBookMemos(bookId, { sortBy });

  const allTags = useMemo(() => {
    const s = new Set();
    memos.forEach((m) => (m.tags || []).forEach((t) => s.add(t)));
    return [...s];
  }, [memos]);

  const lastPageNumber = useMemo(() => {
    const nums = memos
      .map((m) => m.pageNumber)
      .filter((n) => Number.isFinite(n));
    if (nums.length === 0) return '';
    return Math.max(...nums);
  }, [memos]);

  if (!isUsableBookId) {
    return (
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
        本を一度保存するとメモを追加できます。
      </div>
    );
  }

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: '#f0ebe2',
          borderRadius: 10,
        }}
      >
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

      {loading && memos.length === 0 && (
        <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: '12px 0' }}>
          読み込み中...
        </p>
      )}

      {!loading && memos.length === 0 && (
        <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: '20px 0', lineHeight: 1.7 }}>
          まだメモがありません。<br />「＋ 新しいメモ」から最初の1件を追加しましょう。
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {memos.map((m) => (
          <BookMemoCard key={m.id} memo={m} onEdit={openEdit} onDelete={(memo) => deleteMemo(memo.id)} />
        ))}
      </div>

      {editorOpen && (
        <BookMemoEditor
          bookTitle={bookTitle}
          initial={editingMemo}
          defaultPageNumber={
            !editingMemo && Number.isFinite(lastPageNumber) ? lastPageNumber + 1 : ''
          }
          allTags={allTags}
          onClose={closeEditor}
          onCreate={createMemo}
          onUpdate={updateMemo}
        />
      )}
    </div>
  );
}
