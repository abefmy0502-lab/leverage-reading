// 📚 Knowledge Manager — surfaces ALL of the data the AI uses (card memos,
// summary memos, personal learnings) in a single editable view, so the user
// can prune / fix what their マイ読書脳 sees.
//
// Three "kinds":
//   card     — book_memos with source_type='book'
//   personal — book_memos with source_type='personal'
//   summary  — synthesised from books.leverage_memo (no separate row)
//
// Edit:
//   card     — opens BookMemoEditor (full editor)
//   personal — opens an inline simple-text modal
//   summary  — opens an inline simple-text modal (writes books.leverage_memo)
//
// Delete (with 5-second Undo via Toast):
//   card     — DB delete + Storage photo delete; Undo re-INSERTs (photo lost)
//   personal — DB delete; Undo re-INSERTs
//   summary  — clear (set leverage_memo = ''); Undo restores previous text

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import BookMemoEditor from './BookMemoEditor';
import SwipeableCard from './SwipeableCard';
import ContextMenu from './ContextMenu';
import PullToRefresh from './PullToRefresh';
import { useLongPress } from '../hooks/useLongPress';

const wrap = { padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 };
const card = { background: '#faf6f0', border: '1px solid #e4ddd0', borderRadius: 12, padding: '12px 14px' };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: '#5c5043', margin: '0 0 8px' };
const inp = { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid #d4ccbe', borderRadius: 10, background: '#fff', color: '#3d362c', fontFamily: 'inherit', boxSizing: 'border-box' };
const ta = { ...inp, resize: 'vertical', minHeight: 200, lineHeight: 1.7 };
const btnGhost = { padding: '6px 10px', borderRadius: 8, border: '1px solid #d4ccbe', background: 'transparent', color: '#5c5043', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, minHeight: 30 };
const btnPrimary = { padding: '12px 18px', borderRadius: 10, border: 'none', background: '#5c5043', color: '#faf6f0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, letterSpacing: 1, minHeight: 44 };
const dangerBtn = { ...btnGhost, color: '#a05040', borderColor: '#c4a0a0' };
const pill = (active) => ({
  flex: 1,
  minHeight: 36,
  padding: '6px 0',
  border: 'none',
  background: active ? '#5c5043' : 'transparent',
  color: active ? '#faf6f0' : '#5c5548',
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 8,
});

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function pickCategory(tags) {
  if (!Array.isArray(tags)) return null;
  const cat = tags.find((t) => typeof t === 'string' && t.startsWith('@'));
  return cat ? cat.slice(1) : null;
}

const KIND_META = {
  card: { icon: '📝', label: 'カード式メモ' },
  summary: { icon: '📖', label: 'まとめメモ' },
  personal: { icon: '💡', label: '学びログ' },
};

// ============================================================================
// Simple text-edit modal (used for summary + personal edit)
// ============================================================================
function TextEditModal({ title, initialText, onClose, onSave, maxLength }) {
  const [text, setText] = useState(initialText || '');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const taRef = useRef(null);

  useEffect(() => {
    setTimeout(() => taRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      await onSave(text);
      onClose?.();
    } catch (e) {
      setErrorMsg(toMessage(e, '保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 870, background: 'rgba(30,25,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'Noto Serif JP', Georgia, serif" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ background: '#faf6f0', borderRadius: 14, width: 'min(440px, 100%)', maxHeight: 'min(85vh, 85dvh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid #e4ddd0' }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#5c5043', cursor: 'pointer', width: 44, height: 44, padding: 0 }} aria-label="閉じる">×</button>
          <p style={{ fontSize: 14, color: '#3d362c', fontWeight: 500, margin: 0, flex: 1 }}>{title}</p>
        </div>
        <div style={{ padding: '14px 16px', flex: 1, overflowY: 'auto' }}>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault();
            }}
            style={ta}
            maxLength={maxLength}
          />
          {errorMsg && <p style={{ color: '#a05040', fontSize: 12, marginTop: 8 }}>{errorMsg}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid #e4ddd0' }}>
          <button type="button" onClick={onClose} style={{ ...btnGhost, flex: 1, minHeight: 44 }}>キャンセル</button>
          <button type="button" onClick={save} disabled={busy} style={{ ...btnPrimary, flex: 1, opacity: busy ? 0.6 : 1 }}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Knowledge card (display-only; parent provides handlers)
// ============================================================================
function KnowledgeCard({ item, onEdit, onDelete, onSwipeDelete, onLongPress }) {
  const meta = KIND_META[item.kind];
  const isPersonal = item.kind === 'personal';
  const isSummary = item.kind === 'summary';
  const isCard = item.kind === 'card';
  const category = isPersonal ? pickCategory(item.tags) : null;
  const visibleTags = isPersonal
    ? (item.tags || []).filter((t) => !t.startsWith('@'))
    : item.tags || [];
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, item }),
  });

  const inner = (
    <div style={card} {...(onLongPress ? longPress.bind : {})}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: isSummary ? '#eae3d6' : isPersonal ? '#f5e6c8' : '#e2ecd8', color: isSummary ? '#5c5043' : isPersonal ? '#8a7040' : '#5a7a48', fontWeight: 600 }}>
          {meta.icon} {meta.label}
        </span>
        <span style={{ fontSize: 10, color: '#a89e8c' }}>{fmtDate(item.created_at)}</span>
      </div>
      {item.book && (
        <p style={{ fontSize: 13, color: '#3d362c', fontWeight: 500, margin: '4px 0 2px' }}>
          {item.book.title || '（タイトル不明）'}
          {item.book.author && <span style={{ fontSize: 11, color: '#9a8e7a', fontWeight: 400 }}>　{item.book.author}</span>}
        </p>
      )}
      {(isCard && Number.isFinite(item.page_number)) || (isPersonal && category) ? (
        <p style={{ fontSize: 11, color: '#8a7e6b', margin: '0 0 4px' }}>
          {isCard && Number.isFinite(item.page_number) && <>P.{item.page_number}　</>}
          {isPersonal && category && <>カテゴリ: {category}</>}
        </p>
      ) : null}
      <p style={{ fontSize: 13, color: '#4a4036', lineHeight: 1.7, margin: '6px 0', whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto', paddingRight: 6 }}>
        {item.text}
      </p>
      {visibleTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {visibleTags.map((t) => (
            <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#f0ebe2', color: '#7a6e58' }}>#{t}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button type="button" style={btnGhost} onClick={() => onEdit(item)}>編集</button>
        <button type="button" style={dangerBtn} onClick={() => onDelete(item)}>
          {isSummary ? 'クリア' : '削除'}
        </button>
      </div>
    </div>
  );

  if (onSwipeDelete) {
    return (
      <SwipeableCard
        onDelete={() => onSwipeDelete(item)}
        actionLabel={isSummary ? '🧹 クリア' : undefined}
      >
        {inner}
      </SwipeableCard>
    );
  }
  return inner;
}

// ============================================================================
// Main component
// ============================================================================
export default function KnowledgeManager({ onChanged }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  const [filterKind, setFilterKind] = useState('all'); // all | card | summary | personal
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest | oldest | title

  const [editingItem, setEditingItem] = useState(null);
  const [textEdit, setTextEdit] = useState(null); // { title, initialText, onSave, maxLength }

  const refresh = () => {
    setRefreshTick((t) => t + 1);
    onChanged?.();
  };

  useEffect(() => {
    if (!user || !isSupabaseConfigured) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [memosRes, booksRes] = await Promise.all([
        supabase
          .from('book_memos')
          .select('*, book:books(id, title, author)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('books')
          .select('id, title, author, leverage_memo, updated_at, created_at')
          .eq('user_id', user.id)
          .not('leverage_memo', 'is', null)
          .neq('leverage_memo', ''),
      ]);
      if (cancelled) return;

      const memoItems = (memosRes.data || []).map((m) => ({
        ...m,
        kind: m.source_type === 'personal' ? 'personal' : 'card',
      }));
      const summaryItems = (booksRes.data || []).map((b) => ({
        kind: 'summary',
        id: `summary-${b.id}`,
        book_id: b.id,
        book: { id: b.id, title: b.title, author: b.author },
        text: b.leverage_memo || '',
        tags: [],
        page_number: null,
        created_at: b.updated_at || b.created_at,
      }));
      setItems([...memoItems, ...summaryItems]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshTick]);

  const counts = useMemo(() => {
    const c = { card: 0, summary: 0, personal: 0 };
    items.forEach((it) => { c[it.kind] = (c[it.kind] || 0) + 1; });
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = items.filter((it) => {
      if (filterKind !== 'all' && it.kind !== filterKind) return false;
      if (!q) return true;
      const hay = [
        it.text || '',
        it.book?.title || '',
        it.book?.author || '',
        ...(it.tags || []),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    arr = [...arr].sort((a, b) => {
      if (sortBy === 'oldest') return (a.created_at || '').localeCompare(b.created_at || '');
      if (sortBy === 'title') {
        const ta2 = (a.book?.title || '').toLowerCase();
        const tb = (b.book?.title || '').toLowerCase();
        return ta2.localeCompare(tb, 'ja');
      }
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return arr;
  }, [items, filterKind, search, sortBy]);

  // ===== Edit handlers =====
  const handleEdit = (item) => {
    if (item.kind === 'card') {
      setEditingItem(item);
      return;
    }
    if (item.kind === 'summary') {
      setTextEdit({
        title: `まとめメモを編集: ${item.book?.title || ''}`,
        initialText: item.text || '',
        maxLength: LIMITS.summaryMemo,
        onSave: async (newText) => {
          const { error } = await supabase
            .from('books')
            .update({ leverage_memo: newText })
            .eq('id', item.book_id)
            .eq('user_id', user.id);
          if (error) throw error;
          toast.success('まとめメモを更新しました');
          refresh();
        },
      });
      return;
    }
    if (item.kind === 'personal') {
      setTextEdit({
        title: '学びログを編集',
        initialText: item.text || '',
        maxLength: LIMITS.memoText,
        onSave: async (newText) => {
          const { error } = await supabase
            .from('book_memos')
            .update({ text: newText, updated_at: new Date().toISOString() })
            .eq('id', item.id)
            .eq('user_id', user.id);
          if (error) throw error;
          toast.success('学びログを更新しました');
          refresh();
        },
      });
    }
  };

  const handleCardMemoUpdate = async (memoId, payload) => {
    if (!user) throw new Error('未ログイン');
    const { error } = await supabase
      .from('book_memos')
      .update({
        page_number: Number.isFinite(payload.pageNumber) ? payload.pageNumber : null,
        text: payload.text || '',
        tags: payload.tags || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', memoId)
      .eq('user_id', user.id);
    if (error) throw error;
    toast.success('メモを更新しました');
    refresh();
  };

  // ===== Delete handlers (with Undo) =====
  // Inner delete: row + photo + Undo. Used by both confirm-fronted and swipe.
  const performDeleteMemo = (item) => {
    const snapshot = { ...item };
    const promise = (async () => {
      const { error } = await supabase
        .from('book_memos')
        .delete()
        .eq('id', item.id)
        .eq('user_id', user.id);
      if (error) throw error;
      if (item.kind === 'card' && item.photo_path) {
        try {
          await supabase.storage.from('book-memo-photos').remove([item.photo_path]);
        } catch { /* ignore */ }
      }
    })().catch((e) => {
      toast.error(toMessage(e, 'メモの削除に失敗しました。'));
      throw e;
    });

    setItems((arr) => arr.filter((x) => x.id !== item.id));

    toast.undo({
      message: snapshot.photo_path
        ? '知識を削除しました\n※写真は復元できません'
        : '知識を削除しました',
      onUndo: async () => {
        try {
          await promise.catch(() => {});
          const payload = {
            id: snapshot.id,
            book_id: snapshot.book_id || null,
            user_id: user.id,
            page_number: snapshot.page_number ?? null,
            text: snapshot.text || '',
            tags: snapshot.tags || [],
            photo_path: null,
            source_type: snapshot.kind === 'personal' ? 'personal' : 'book',
          };
          if (snapshot.created_at) payload.created_at = snapshot.created_at;
          const { error } = await supabase.from('book_memos').insert([payload]);
          if (error) throw error;
          toast.info('削除を取り消しました');
          refresh();
        } catch (e) {
          toast.error(toMessage(e, '復元に失敗しました。'));
        }
      },
    });
  };

  const performClearSummary = (item) => {
    const previousText = item.text || '';
    const promise = supabase
      .from('books')
      .update({ leverage_memo: '' })
      .eq('id', item.book_id)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch((e) => {
        toast.error(toMessage(e, 'クリアに失敗しました。'));
        throw e;
      });

    setItems((arr) => arr.filter((x) => x.id !== item.id));

    toast.undo({
      message: 'まとめメモをクリアしました',
      onUndo: async () => {
        try {
          await promise.catch(() => {});
          const { error } = await supabase
            .from('books')
            .update({ leverage_memo: previousText })
            .eq('id', item.book_id)
            .eq('user_id', user.id);
          if (error) throw error;
          toast.info('クリアを取り消しました');
          refresh();
        } catch (e) {
          toast.error(toMessage(e, '復元に失敗しました。'));
        }
      },
    });
  };

  // Tap-driven (kebab "削除/クリア" button or long-press menu): confirm first.
  const handleDelete = async (item) => {
    if (item.kind === 'summary') {
      const ok = await confirm({
        title: 'まとめメモをクリアしますか？',
        message: '本自体は残ります。AI の参照対象からは外れます。\n5 秒以内なら「取消」で復元できます。',
        confirmLabel: 'クリアする',
        cancelLabel: 'キャンセル',
        danger: true,
      });
      if (!ok) return;
      performClearSummary(item);
    } else {
      const ok = await confirm({
        title: 'この知識を削除しますか？',
        message: 'AI の参照対象から除外されます。\n5 秒以内なら「取消」で復元できます。',
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        danger: true,
      });
      if (!ok) return;
      performDeleteMemo(item);
    }
  };

  // Swipe-driven (gesture itself = intent, no confirm).
  const handleSwipeDelete = (item) => {
    if (item.kind === 'summary') performClearSummary(item);
    else performDeleteMemo(item);
  };

  // Long-press menu state
  const [itemMenu, setItemMenu] = useState(null); // { x, y, item }

  return (
    <PullToRefresh onRefresh={async () => { refresh(); }}>
    <div style={wrap}>
      {itemMenu && (
        <ContextMenu
          x={itemMenu.x}
          y={itemMenu.y}
          onClose={() => setItemMenu(null)}
          items={[
            { label: '編集', icon: '✏️', onClick: () => handleEdit(itemMenu.item) },
            {
              label: itemMenu.item.kind === 'summary' ? 'クリア' : '削除',
              icon: itemMenu.item.kind === 'summary' ? '🧹' : '🗑️',
              destructive: true,
              onClick: () => handleDelete(itemMenu.item),
            },
          ]}
        />
      )}
      {/* Hero */}
      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#3d362c', margin: 0 }}>📚 マイ読書脳の知識ベース</p>
        <p style={{ fontSize: 11, color: '#8a7e6b', margin: '4px 0 8px', lineHeight: 1.7 }}>
          AI が参照している知識の一覧です。編集・削除で AI の答えに即座に反映されます。
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: '#5c5548' }}>
          <span>📝 カード式メモ: <strong>{counts.card || 0}</strong> 件</span>
          <span>📖 まとめメモ: <strong>{counts.summary || 0}</strong> 冊分</span>
          <span>💡 学びログ: <strong>{counts.personal || 0}</strong> 件</span>
          <span>合計: <strong>{items.length}</strong> 件</span>
        </div>
      </div>

      {/* Search + filter + sort */}
      <input
        type="search"
        placeholder="🔍 本文・タイトル・著者・タグ"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
        style={inp}
      />
      <div style={{ display: 'flex', gap: 4, padding: 4, background: '#eae3d6', borderRadius: 10 }}>
        <button type="button" style={pill(filterKind === 'all')} onClick={() => setFilterKind('all')}>全て</button>
        <button type="button" style={pill(filterKind === 'card')} onClick={() => setFilterKind('card')}>📝 メモ</button>
        <button type="button" style={pill(filterKind === 'summary')} onClick={() => setFilterKind('summary')}>📖 まとめ</button>
        <button type="button" style={pill(filterKind === 'personal')} onClick={() => setFilterKind('personal')}>💡 学び</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8a7e6b' }}>
        <span>並び順</span>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px' }}>
          <option value="newest">新しい順</option>
          <option value="oldest">古い順</option>
          <option value="title">本のタイトル順</option>
        </select>
        <span style={{ marginLeft: 'auto' }}>{filtered.length} 件</span>
      </div>

      {/* List */}
      {loading ? (
        <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: 20 }}>読み込み中…</p>
      ) : filtered.length === 0 ? (
        <p style={{ fontSize: 12, color: '#a89e8c', textAlign: 'center', padding: 30, lineHeight: 1.7 }}>
          {items.length === 0
            ? 'まだ知識がありません。本を読んでメモを残すと、ここに蓄積されます。'
            : '該当する知識が見つかりませんでした。'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((it) => (
            <KnowledgeCard
              key={it.kind === 'summary' ? it.id : `${it.kind}-${it.id}`}
              item={it}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSwipeDelete={handleSwipeDelete}
              onLongPress={(payload) => setItemMenu(payload)}
            />
          ))}
        </div>
      )}

      {/* Card memo editor (full editor) */}
      {editingItem && editingItem.kind === 'card' && (
        <BookMemoEditor
          bookTitle={editingItem.book?.title || ''}
          initial={{
            id: editingItem.id,
            pageNumber: editingItem.page_number,
            text: editingItem.text || '',
            tags: editingItem.tags || [],
            photoPath: editingItem.photo_path || null,
            bookId: editingItem.book_id,
          }}
          allTags={[]}
          onClose={() => setEditingItem(null)}
          onCreate={async () => { /* create flow not used here */ }}
          onUpdate={async (memoId, payload) => {
            await handleCardMemoUpdate(memoId, payload);
          }}
        />
      )}

      {/* Inline text-edit modal for summary + personal */}
      {textEdit && (
        <TextEditModal
          title={textEdit.title}
          initialText={textEdit.initialText}
          maxLength={textEdit.maxLength}
          onClose={() => setTextEdit(null)}
          onSave={textEdit.onSave}
        />
      )}
    </div>
    </PullToRefresh>
  );
}
