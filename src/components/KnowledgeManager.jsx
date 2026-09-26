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
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  Brain,
  StickyNote,
  BookOpen,
  Lightbulb,
  BarChart3,
  AlertTriangle,
  Bot,
  Gem,
  Map as MapIcon,
  Search,
  Pencil,
  Trash2,
  Eraser,
  X,
} from 'lucide-react';
import { MemoListSkeleton } from './Skeleton';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { toMessage, isSchemaError } from '../lib/errors';
import { LIMITS, validateImageFile, ALLOWED_IMAGE_EXT } from '../lib/limits';
import BookMemoEditor from './BookMemoEditor';
import EmptyState from './EmptyState.jsx';
import SwipeableCard from './SwipeableCard';
import ContextMenu from './ContextMenu';
import PullToRefresh from './PullToRefresh';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost, input as uiInput } from '../styles/ui';
import { useLongPress } from '../hooks/useLongPress';

// 見た目は DESIGN.md のトークンのみ。題名「根拠にできる情報」と「‹ 相談」は親（MyBookBrain）が出し、
// 左右の余白 16 も親の viewScroll が持つ（ここで重ねない）。
const wrap = { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' };
const card = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const inp = { ...uiInput, minHeight: 44, padding: 'var(--space-2) var(--space-3)' };
// 本文の編集欄＝読む文章（明朝 18・行間 1.6）。
const ta = { ...uiInput, resize: 'vertical', minHeight: 200, fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', lineHeight: 1.6 };
// 行の中の副ボタン（DESIGN §5 btnRow: 高さ 44・15・600）。
const btnRow = { ...uiBtnGhost, width: 'auto', minHeight: 44, padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sub)' };
const dangerBtn = { ...btnRow, color: 'var(--error)' };
const btnPrimary = { ...uiBtnPrimary, width: 'auto' };
const btnGhost = { ...uiBtnGhost, width: 'auto' };
const selectStyle = { ...inp, flex: 1, minWidth: 0, width: 'auto', cursor: 'pointer' };

// 種類の絞り込み（切り替えを 2 段重ねにしないよう、並び順と同じ 1 行のメニューにする・DESIGN §5）。
const FILTER_OPTIONS = [
  { value: 'all', label: 'すべての種類' },
  { value: 'memo', label: 'メモ' },
  { value: 'summary', label: 'まとめ' },
  { value: 'plan', label: '計画' },
  { value: 'learning', label: '学び' },
];

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

// 全 9 種の知識アイテム。`column` を持つものは books テーブルの列で、編集
// は TextEditModal、削除は「列を null にクリア」で統一処理 (= 既存の summary
// と同じフロー)。column を持たない card / personal は book_memos の行なので
// 行ごと delete + undo (既存挙動)。`group` は フィルタピル用 (memo / summary /
// plan / learning) のグルーピングタグ。
const KIND_META = {
  card:              { Icon: StickyNote,   label: 'カード式メモ', group: 'memo' },
  summary:           { Icon: BookOpen,     label: 'まとめメモ',   group: 'summary', column: 'leverage_memo' },
  personal:          { Icon: Lightbulb,    label: '学びログ',     group: 'learning' },
  invest_purpose:    { Icon: BarChart3,    label: '得たいこと',   group: 'plan',    column: 'invest_purpose' },
  current_challenge: { Icon: AlertTriangle, label: '現在の課題',  group: 'plan',    column: 'current_challenge' },
  hypothesis:        { Icon: Lightbulb,    label: '仮説',         group: 'plan',    column: 'hypothesis' },
  ai_summary:        { Icon: Bot,          label: 'AI まとめ',    group: 'summary', column: 'ai_summary' },
  roi_summary:       { Icon: Gem,          label: '一番の収穫',   group: 'summary', column: 'roi_summary' },
  ai_strategy:       { Icon: MapIcon,      label: '戦略',         group: 'plan',    column: 'ai_strategy' },
  // gatherKnowledge が AI コンテキストに含める列は全てここに出す（透明性と
  // 除外手段の担保）。選書理由も AI が参照するため、見えない・消せないは NG。
  book_reason:       { Icon: Bot,          label: '選書理由',     group: 'plan',    column: 'book_reason' },
};

// ============================================================================
// Simple text-edit modal (used for summary + personal edit)
// ============================================================================
function TextEditModal({ title, initialText, onClose, onSave, maxLength }) {
  const trapRef = useFocusTrap(true); // ♿ Tab をダイアログ内に閉じ込める
  const [text, setText] = useState(initialText || '');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const taRef = useRef(null);

  useEffect(() => {
    setTimeout(() => taRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      // IME 変換中の Esc はガード（変換キャンセルで編集モーダルごと閉じない）。
      if (e.key === 'Escape' && !e.isComposing && !e.nativeEvent?.isComposing) onClose?.();
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
      ref={trapRef}
      style={{ position: 'fixed', inset: 0, zIndex: 870, background: 'var(--backdrop)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)', fontFamily: 'var(--font-ui)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-overlay)', width: 'min(440px, 100%)', maxHeight: 'min(85vh, 85dvh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-1) var(--space-4) var(--space-1) var(--space-1)', borderBottom: '1px solid var(--separator)' }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', width: 44, height: 44, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
          <p style={{ fontSize: 'var(--text-body)', color: 'var(--text)', fontWeight: 600, margin: 0, flex: 1, minWidth: 0, lineHeight: 1.3 }}>{title}</p>
        </div>
        <div style={{ padding: 'var(--space-4)', flex: 1, overflowY: 'auto' }}>
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
          {errorMsg && <p role="alert" style={{ color: 'var(--error)', fontSize: 'var(--text-meta)', margin: 'var(--space-2) 0 0', lineHeight: 1.5 }}>{errorMsg}</p>}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--separator)' }}>
          <button type="button" onClick={onClose} style={{ ...btnGhost, flex: 1 }}>キャンセル</button>
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
  const meta = KIND_META[item.kind] || KIND_META.card;
  const isPersonal = item.kind === 'personal';
  const isCard = item.kind === 'card';
  const isField = !!meta.column; // books の列 (summary を含む 7 種類)
  const category = isPersonal ? pickCategory(item.tags) : null;
  const visibleTags = isPersonal
    ? (item.tags || []).filter((t) => !t.startsWith('@'))
    : item.tags || [];
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, item }),
  });

  const metaLine = [
    isCard && Number.isFinite(item.page_number) ? `P.${item.page_number}` : null,
    isPersonal && category ? `カテゴリ: ${category}` : null,
  ].filter(Boolean).join('・');

  const inner = (
    <div style={card} {...(onLongPress ? longPress.bind : {})}>
      {/* 種類は文字＋線のアイコンで示す（色で分けない・DESIGN §3-2） */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-meta)', fontWeight: 600, color: 'var(--text-2)' }}>
          {meta.Icon && <meta.Icon size={14} aria-hidden="true" />}
          {meta.label}
        </span>
        <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>{fmtDate(item.created_at)}</span>
      </div>
      {item.book && (
        <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', fontWeight: 600, margin: 'var(--space-2) 0 0', lineHeight: 1.5 }}>
          {item.book.title || '（タイトル不明）'}
          {item.book.author && <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', fontWeight: 400 }}>　{item.book.author}</span>}
        </p>
      )}
      {metaLine && (
        <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 'var(--space-1) 0 0', lineHeight: 1.5 }}>{metaLine}</p>
      )}
      {/* 本文＝読む文章（明朝 18・行間 1.6） */}
      <p style={{ fontFamily: 'var(--font-read)', fontSize: 'var(--text-read)', color: 'var(--text)', lineHeight: 1.6, margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 240, overflowY: 'auto' }}>
        {item.text}
      </p>
      {visibleTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
          {visibleTags.map((t) => (
            <span key={t} style={{ fontSize: 'var(--text-meta)', padding: '0 var(--space-2)', borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text-2)', lineHeight: 1.8 }}>#{t}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <button type="button" style={btnRow} onClick={() => onEdit(item)}>編集</button>
        <button type="button" style={dangerBtn} onClick={() => onDelete(item)}>
          {isField ? 'クリア' : '削除'}
        </button>
      </div>
    </div>
  );

  if (onSwipeDelete) {
    return (
      <SwipeableCard
        onDelete={() => onSwipeDelete(item)}
        actionLabel={isField ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            <Eraser size={16} strokeWidth={1.75} aria-hidden="true" />
            クリア
          </span>
        ) : undefined}
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
export default function KnowledgeManager({ onChanged, onBooksMutated }) {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // フィルタ: 'all' / KIND_META.group のいずれか ('memo' | 'summary' | 'plan' | 'learning')
  const [filterKind, setFilterKind] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // newest | oldest | title

  const [editingItem, setEditingItem] = useState(null);
  const [textEdit, setTextEdit] = useState(null); // { title, initialText, onSave, maxLength }

  const refresh = () => {
    setRefreshTick((t) => t + 1);
    onChanged?.();
  };

  // books テーブルの列（まとめメモ / 投資目的 / AI まとめ等）を Supabase 直
  // UPDATE した後に呼ぶ。⚠️ ここで App 側（useBooks）の books state を再同期
  // しないと、以降ユーザーがその本に対して行う任意の saveBook（ステータス変更・
  // 行動トグル等）が stale な旧値で全列上書きし、ここで行った編集・クリアが
  // 黙って巻き戻る。fire-and-forget（失敗しても本画面の操作は成立している）。
  const notifyBooksMutated = () => {
    try { onBooksMutated?.(); } catch { /* non-critical */ }
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
      // books の全 setup フィールドを 1 クエリで取得し、非空のフィールドごとに
      // 統一形式の item を生成する。staged fallback で未マイグレーション DB
      // (古い列が無い) でも段階縮退して動作する。
      const FIELD_SELECTS = [
        'id, title, author, updated_at, created_at, leverage_memo, invest_purpose, current_challenge, hypothesis, book_reason, ai_summary, roi_summary, ai_strategy',
        'id, title, author, updated_at, created_at, leverage_memo, invest_purpose, current_challenge, hypothesis, ai_summary, roi_summary, ai_strategy',
        'id, title, author, updated_at, created_at, leverage_memo, invest_purpose, ai_summary, roi_summary, ai_strategy',
        'id, title, author, updated_at, created_at, leverage_memo, ai_summary, roi_summary',
        'id, title, author, updated_at, created_at, leverage_memo',
      ];
      const fetchBookFields = async () => {
        for (const sel of FIELD_SELECTS) {
          // eslint-disable-next-line no-await-in-loop
          const r = await supabase.from('books').select(sel).eq('user_id', user.id);
          if (!r.error) return r.data || [];
          // 列が無い schema エラーなら次の stage に縮退。それ以外（権限など）は
          // 即座に空で諦める。判定は lib/errors.js の isSchemaError（唯一の真実）。
          if (!isSchemaError(r.error)) return [];
        }
        return [];
      };

      const [memosRes, bookRows] = await Promise.all([
        supabase
          .from('book_memos')
          .select('*, book:books(id, title, author)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        fetchBookFields(),
      ]);
      if (cancelled) return;

      const memoItems = (memosRes.data || []).map((m) => ({
        ...m,
        kind: m.source_type === 'personal' ? 'personal' : 'card',
      }));

      // 各本の非空フィールドごとに 1 item を作る。kind = column 名 (summary は
      // 例外で leverage_memo にマップ — 後方互換のため既存の "summary" を維持)。
      const isFilled = (v) => typeof v === 'string' && v.trim().length > 0;
      const FIELD_KINDS = [
        ['summary',           'leverage_memo'],
        ['invest_purpose',    'invest_purpose'],
        ['current_challenge', 'current_challenge'],
        ['hypothesis',        'hypothesis'],
        ['book_reason',       'book_reason'],
        ['ai_summary',        'ai_summary'],
        ['roi_summary',       'roi_summary'],
        ['ai_strategy',       'ai_strategy'],
      ];
      const fieldItems = [];
      for (const b of bookRows) {
        for (const [kind, col] of FIELD_KINDS) {
          if (!isFilled(b[col])) continue;
          fieldItems.push({
            kind,
            id: `${kind}-${b.id}`,
            book_id: b.id,
            book: { id: b.id, title: b.title, author: b.author },
            text: b[col] || '',
            tags: [],
            page_number: null,
            created_at: b.updated_at || b.created_at,
          });
        }
      }

      setItems([...memoItems, ...fieldItems]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, refreshTick]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = items.filter((it) => {
      if (filterKind !== 'all') {
        const group = KIND_META[it.kind]?.group;
        if (group !== filterKind) return false;
      }
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
    const meta = KIND_META[item.kind];
    if (meta?.column) {
      // books の任意の text 列を編集 (summary / invest_purpose / current_challenge
      // / hypothesis / ai_summary / roi_summary / ai_strategy)
      const isSummaryLike = item.kind === 'summary'; // text が長い系は summary 上限
      setTextEdit({
        title: `${meta.label} を編集${item.book?.title ? `: ${item.book.title}` : ''}`,
        initialText: item.text || '',
        maxLength: isSummaryLike ? LIMITS.summaryMemo : LIMITS.memoText,
        onSave: async (newText) => {
          const { error } = await supabase
            .from('books')
            .update({ [meta.column]: newText })
            .eq('id', item.book_id)
            .eq('user_id', user.id);
          if (error) throw error;
          toast.success(`${meta.label} を更新しました。`);
          refresh();
          notifyBooksMutated();
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
          toast.success('学びログを更新しました。');
          refresh();
        },
      });
    }
  };

  const handleCardMemoUpdate = async (memoId, payload, item) => {
    if (!user) throw new Error('未ログイン');
    // 写真の追加/削除も反映する（BookMemoEditor は photoFile / removePhotoFlag を
    // 渡してくる。無視すると成功トーストの裏でユーザーの写真変更が黙って消える）。
    const patch = {
      page_number: Number.isFinite(payload.pageNumber) ? payload.pageNumber : null,
      text: payload.text || '',
      tags: payload.tags || [],
      updated_at: new Date().toISOString(),
    };
    const oldPath = item?.photo_path || null;
    let uploadedPath = null;
    if (payload.photoFile) {
      const vErr = validateImageFile(payload.photoFile);
      if (vErr) throw new Error(vErr);
      // 正規経路（useBookMemos.uploadPhoto）と同じ圧縮・拡張子矯正を通す。
      // 生アップロードだと 8MB/4000px がそのまま保存され、一覧表示が重くなる。
      let fileToUpload = payload.photoFile;
      try {
        // 動的 import: アップロード時のみ必要（初回バンドル削減）。
        const { default: imageCompression } = await import('browser-image-compression');
        fileToUpload = await imageCompression(payload.photoFile, {
          maxSizeMB: 0.3,
          maxWidthOrHeight: 1200,
          useWebWorker: true,
        });
      } catch { /* 圧縮失敗時は元ファイルで続行 */ }
      const rawExt = (payload.photoFile.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const ext = ALLOWED_IMAGE_EXT.includes(rawExt) ? rawExt : 'jpg';
      const dir = item?.book_id || 'personal';
      uploadedPath = `${user.id}/${dir}/${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('book-memo-photos')
        .upload(uploadedPath, fileToUpload, { upsert: false, contentType: fileToUpload.type || payload.photoFile.type || 'image/jpeg' });
      if (upErr) throw upErr;
      patch.photo_path = uploadedPath;
    } else if (payload.removePhotoFlag) {
      patch.photo_path = null;
    }
    const { error } = await supabase
      .from('book_memos')
      .update(patch)
      .eq('id', memoId)
      .eq('user_id', user.id);
    if (error) {
      // DB 更新に失敗したら、今アップロードした孤児ファイルを掃除。
      if (uploadedPath) {
        try { await supabase.storage.from('book-memo-photos').remove([uploadedPath]); } catch { /* ignore */ }
      }
      throw error;
    }
    // 置換/削除が確定した後で旧写真を片づける（best-effort）。
    if (oldPath && (payload.photoFile || payload.removePhotoFlag)) {
      try { await supabase.storage.from('book-memo-photos').remove([oldPath]); } catch { /* ignore */ }
    }
    toast.success('メモを更新しました。');
    refresh();
  };

  // ===== Delete handlers (with Undo) =====
  // Inner delete: row + photo + Undo. Used by both confirm-fronted and swipe.
  const performDeleteMemo = (item) => {
    const snapshot = { ...item };
    let deleteFailed = false;
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
      deleteFailed = true;
      toast.error(toMessage(e, 'メモの削除に失敗しました。'));
      // 楽観的に消したカードを一覧へ戻す（rollback）。戻さないと DB に残って
      // いる行が画面から消えっぱなしになり、「削除済み」と誤認させる。
      // rethrow しない（誰も await しない unhandled rejection を作らない）。
      setItems((arr) => (arr.some((x) => x.id === snapshot.id) ? arr : [snapshot, ...arr]));
    });

    setItems((arr) => arr.filter((x) => x.id !== item.id));

    toast.undo({
      message: snapshot.photo_path
        ? '知識を削除しました\n※写真は復元できません'
        : '知識を削除しました',
      onUndo: async () => {
        try {
          await promise.catch(() => {});
          // 削除自体が失敗して rollback 済みなら、再 INSERT は重複キーで必ず
          // 失敗する。行は既に画面と DB にあるので、静かに何もしない。
          if (deleteFailed) return;
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
          toast.info('削除を取り消しました。');
          refresh();
        } catch (e) {
          toast.error(toMessage(e, '復元に失敗しました。'));
        }
      },
    });
  };

  // 任意の books.{column} を空にする (= AI の参照対象から外す)。
  // Undo で previousText を書き戻す。summary だけでなく 7 つの book-field 全部に対応。
  const performClearField = (item) => {
    const meta = KIND_META[item.kind];
    if (!meta?.column) return;
    const column = meta.column;
    const previousText = item.text || '';
    let clearFailed = false;
    const promise = supabase
      .from('books')
      .update({ [column]: '' })
      .eq('id', item.book_id)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) throw error;
        notifyBooksMutated();
      })
      .catch((e) => {
        clearFailed = true;
        toast.error(toMessage(e, 'クリアに失敗しました。'));
        // rollback: 楽観的に消したアイテムを戻す（rethrow しない）。
        setItems((arr) => (arr.some((x) => x.id === item.id) ? arr : [item, ...arr]));
      });

    setItems((arr) => arr.filter((x) => x.id !== item.id));

    toast.undo({
      message: `${meta.label} をクリアしました`,
      onUndo: async () => {
        try {
          await promise.catch(() => {});
          // クリア自体が失敗して rollback 済みなら何もしない（値は元のまま）。
          if (clearFailed) return;
          const { error } = await supabase
            .from('books')
            .update({ [column]: previousText })
            .eq('id', item.book_id)
            .eq('user_id', user.id);
          if (error) throw error;
          toast.info('クリアを取り消しました。');
          refresh();
          notifyBooksMutated();
        } catch (e) {
          toast.error(toMessage(e, '復元に失敗しました。'));
        }
      },
    });
  };

  // Tap-driven (kebab "削除/クリア" button or long-press menu): confirm first.
  const handleDelete = async (item) => {
    const meta = KIND_META[item.kind];
    if (meta?.column) {
      const ok = await confirm({
        title: `${meta.label} をクリアしますか？`,
        message: '本自体は残ります。AI の参照対象からは外れます。\n5 秒以内なら「取消」で復元できます。',
        confirmLabel: 'クリアする',
        cancelLabel: 'キャンセル',
        danger: true,
      });
      if (!ok) return;
      performClearField(item);
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
    const meta = KIND_META[item.kind];
    if (meta?.column) performClearField(item);
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
            { label: '編集', icon: <Pencil size={16} aria-hidden="true" />, onClick: () => handleEdit(itemMenu.item) },
            {
              label: KIND_META[itemMenu.item.kind]?.column ? 'クリア' : '削除',
              icon: KIND_META[itemMenu.item.kind]?.column
                ? <Eraser size={16} aria-hidden="true" />
                : <Trash2 size={16} aria-hidden="true" />,
              destructive: true,
              onClick: () => handleDelete(itemMenu.item),
            },
          ]}
        />
      )}
      {/* 検索＋絞り込み＋並び順。題名・説明文は置かない（親が題名を出す・DESIGN 原則 6）。 */}
      <div style={{ position: 'relative' }}>
        <Search size={18} aria-hidden="true" style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
        <input
          type="search"
          placeholder="本文・タイトル・著者・タグ"
          aria-label="根拠にできる情報を検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.nativeEvent.isComposing) e.preventDefault(); }}
          style={{ ...inp, paddingLeft: 'calc(var(--space-8) + var(--space-2))' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} aria-label="種類で絞り込む" style={selectStyle}>
          {FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="並び順" style={selectStyle}>
          <option value="newest">新しい順</option>
          <option value="oldest">古い順</option>
          <option value="title">本のタイトル順</option>
        </select>
      </div>
      {!loading && items.length > 0 && (
        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)', lineHeight: 1.5 }}>
          {filtered.length === items.length ? `${items.length} 件` : `${items.length} 件中 ${filtered.length} 件`}
        </p>
      )}

      {/* List */}
      {loading ? (
        <MemoListSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={<Brain size={32} strokeWidth={1.5} aria-hidden="true" />}
            title="まだ根拠にできる情報はありません"
            description="本のメモや学びを書くと、ここに並びます。"
          />
        ) : (
          <EmptyState
            icon={<Search size={32} strokeWidth={1.5} aria-hidden="true" />}
            title="見つかりませんでした"
            description="条件を変えるか、「すべての種類」に戻してください。"
          />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {filtered.map((it) => (
            <KnowledgeCard
              // book-field 系は item.id がすでに `${kind}-${book_id}` で
              // unique。card/personal は book_memos.id (UUID) なので
              // `${kind}-${id}` で衝突回避する。
              key={KIND_META[it.kind]?.column ? it.id : `${it.kind}-${it.id}`}
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
            await handleCardMemoUpdate(memoId, payload, editingItem);
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
