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
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from '../styles/ui';
import { useLongPress } from '../hooks/useLongPress';

const wrap = { padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 };
const card = { background: 'var(--c-card)', border: '1px solid var(--c-hairline)', borderRadius: 12, padding: '12px 14px' };
const sectionTitle = { fontSize: 13, fontWeight: 600, color: 'var(--c-brand)', margin: '0 0 8px' };
const inp = { width: '100%', padding: '10px 12px', fontSize: 16, border: '1px solid var(--c-hairline-strong)', borderRadius: 10, background: '#fff', color: 'var(--c-ink)', fontFamily: 'inherit', boxSizing: 'border-box' };
const ta = { ...inp, resize: 'vertical', minHeight: 200, lineHeight: 1.7 };
const btnGhost = { ...uiBtnGhost, width: 'auto', padding: '6px 14px', borderRadius: 8, fontSize: 11, minHeight: 44 };
const btnPrimary = { ...uiBtnPrimary, width: 'auto', padding: '12px 18px', fontSize: 14, minHeight: 44 };
const dangerBtn = { ...btnGhost, color: 'var(--c-critical)', borderColor: '#c4a0a0' };
const pill = (active) => ({
  flex: 1,
  minHeight: 44,
  padding: '6px 0',
  border: 'none',
  background: active ? 'var(--c-brand)' : 'transparent',
  color: active ? 'var(--c-card)' : 'var(--c-ink-soft)',
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

// グループごとの badge 色 (既存配色をベースに plan を追加)
const GROUP_BADGE = {
  memo:     { bg: '#e2ecd8', fg: '#4a6a3a' }, // 4.0:1→約5.4:1（11px 文字の WCAG AA 対応）
  summary:  { bg: 'var(--c-soft-2)', fg: 'var(--c-brand)' },
  learning: { bg: '#f5e6c8', fg: 'var(--color-accent)' },
  plan:     { bg: '#e3eaf3', fg: '#3a5a78' },
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
      style={{ position: 'fixed', inset: 0, zIndex: 870, background: 'rgba(30,25,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "var(--font-app)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ background: 'var(--c-card)', borderRadius: 'var(--radius-md)', width: 'min(440px, 100%)', maxHeight: 'min(85vh, 85dvh)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--c-hairline)' }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--c-brand)', cursor: 'pointer', width: 44, height: 44, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
          <p style={{ fontSize: 14, color: 'var(--c-ink)', fontWeight: 500, margin: 0, flex: 1 }}>{title}</p>
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
          {errorMsg && <p style={{ color: 'var(--c-critical)', fontSize: 12, marginTop: 8 }}>{errorMsg}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--c-hairline)' }}>
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
  const meta = KIND_META[item.kind] || KIND_META.card;
  const isPersonal = item.kind === 'personal';
  const isCard = item.kind === 'card';
  const isField = !!meta.column; // books の列 (summary を含む 7 種類)
  const badge = GROUP_BADGE[meta.group] || GROUP_BADGE.memo;
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
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: badge.bg, color: badge.fg, fontWeight: 600 }}>
          {meta.Icon && <meta.Icon size={12} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />}
          {meta.label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--c-ink-2)' }}>{fmtDate(item.created_at)}</span>
      </div>
      {item.book && (
        <p style={{ fontSize: 13, color: 'var(--c-ink)', fontWeight: 500, margin: '4px 0 2px' }}>
          {item.book.title || '（タイトル不明）'}
          {item.book.author && <span style={{ fontSize: 11, color: 'var(--c-ink-2)', fontWeight: 400 }}>　{item.book.author}</span>}
        </p>
      )}
      {(isCard && Number.isFinite(item.page_number)) || (isPersonal && category) ? (
        <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '0 0 4px' }}>
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
            <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--c-soft)', color: 'var(--c-ink-2)' }}>#{t}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button type="button" style={btnGhost} onClick={() => onEdit(item)}>編集</button>
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
      {/* Hero — 「作業量/データモデルの可視化」(9マスの 0 だらけグリッド) は本田哲学に
          反する（進捗バー撤去と同じ判断）。AI が参照する知識の総数を 1 行に凝縮する。 */}
      <div style={card}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', margin: 0 }}>
          <Brain size={15} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
          マイ読書脳の知識ベース
        </p>
        <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: '8px 0 0', lineHeight: 1.7 }}>
          AI が答えるとき参照する、あなたの知識は
          <strong style={{ color: 'var(--c-brand)', fontSize: 18, margin: '0 4px', fontVariantNumeric: 'tabular-nums' }}>{items.length}</strong>
          件。下のリストから編集・削除すると、次回の答えに即反映されます。
        </p>
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
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-soft-2)', borderRadius: 10 }}>
        <button type="button" style={pill(filterKind === 'all')} onClick={() => setFilterKind('all')}>全て</button>
        <button type="button" style={pill(filterKind === 'memo')} onClick={() => setFilterKind('memo')}>
          <StickyNote size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />メモ
        </button>
        <button type="button" style={pill(filterKind === 'summary')} onClick={() => setFilterKind('summary')}>
          <BookOpen size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />まとめ
        </button>
        <button type="button" style={pill(filterKind === 'plan')} onClick={() => setFilterKind('plan')}>
          <BarChart3 size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />計画
        </button>
        <button type="button" style={pill(filterKind === 'learning')} onClick={() => setFilterKind('learning')}>
          <Lightbulb size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />学び
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--c-ink-2)' }}>
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
        <p style={{ fontSize: 12, color: 'var(--c-ink-2)', textAlign: 'center', padding: 20 }}>読み込み中…</p>
      ) : filtered.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={<Brain size={40} strokeWidth={1.5} aria-hidden="true" />}
            title="ここに知識が集まります"
            description="本を読んでメモを残すと、AI があなたの答えを作るための材料がここに蓄積されます。"
          />
        ) : (
          <EmptyState
            icon={<Search size={40} strokeWidth={1.5} aria-hidden="true" />}
            title="見つかりませんでした"
            description="検索やフィルタの条件に合う知識はありませんでした。"
            tip="条件を変えるか「全て」に戻すと、ほかの知識が見つかります。"
          />
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
