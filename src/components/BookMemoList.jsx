import { useEffect, useMemo, useRef, useState } from 'react';
import { useBookMemos } from '../hooks/useBookMemos';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import { summarizeCards } from '../lib/ai';
import { MemoListSkeleton } from './Skeleton';
import EmptyState from './EmptyState';
import { LIMITS } from '../lib/limits';
import ContextMenu from './ContextMenu';
import BookMemoCard from './BookMemoCard';
import BookMemoEditor from './BookMemoEditor';
import ShareCardModal from './ShareCardModal';
import { StickyNote, FileText, BookOpen, Clock, Quote, Plus, Pencil, Copy, Image, Trash2, Sparkles, Target } from 'lucide-react';

const MODE_KEY = 'leverageMemoMode';

const modeTab = (active) => ({
  flex: 1,
  minHeight: 44,
  padding: '10px 0',
  border: 'none',
  background: active ? 'var(--c-brand)' : 'transparent',
  color: active ? 'var(--c-card)' : 'var(--c-ink-soft)',
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
  background: active ? 'var(--c-brand)' : 'transparent',
  color: active ? 'var(--c-card)' : '#8a7e6b',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 8,
  transition: 'background .15s',
});

const quoteChip = (active) => ({
  alignSelf: 'flex-start',
  minHeight: 44,
  padding: '8px 14px',
  border: active ? '1px solid var(--c-brand)' : '1px solid var(--c-hairline-strong)',
  background: active ? 'var(--c-brand)' : 'var(--c-card)',
  color: active ? 'var(--c-card)' : 'var(--c-ink-soft)',
  fontSize: 12,
  fontWeight: active ? 600 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  borderRadius: 999,
  transition: 'background .15s, color .15s, border-color .15s',
});

const addBtn = {
  width: '100%',
  padding: '12px 0',
  minHeight: 44,
  borderRadius: 10,
  border: '1px dashed #c4b8a6',
  background: 'var(--c-card)',
  color: 'var(--c-brand)',
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
  border: '1px solid var(--c-hairline-strong)',
  borderRadius: 10,
  background: '#fff',
  color: 'var(--c-ink)',
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
  background: 'var(--c-brand)',
  color: 'var(--c-card)',
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

function SummarySection({ bookId, bookTitle, cards = [], summaryText, onSaveSummary }) {
  const [text, setText] = useState(summaryText || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [generating, setGenerating] = useState(false);
  const flashTimerRef = useRef(null);
  const haptic = useHaptic();
  const toast = useToast();
  const confirm = useConfirm();

  // カードが2枚以上たまっていれば「カードからまとめを生成」を提案できる。
  const cardTexts = (cards || []).map((t) => String(t || '').trim()).filter(Boolean);
  const canGenerate = cardTexts.length >= 2;

  // 📝 カード→まとめ生成。既存のまとめがあれば上書き確認してから差し替える。
  const handleGenerate = async () => {
    if (generating || !canGenerate) return;
    if (text.trim()) {
      const ok = await confirm({
        title: 'まとめを生成しますか？',
        message: '今のまとめメモを、カードから生成した内容で置き換えます。よろしいですか？',
        confirmLabel: '生成する',
      });
      if (!ok) return;
    }
    setGenerating(true);
    setErrorMsg('');
    try {
      const result = await summarizeCards({ title: bookTitle, cards: cardTexts });
      if (!result) {
        toast.error('まとめを生成できませんでした。カードを増やして再度お試しください。');
        return;
      }
      setText(result);
      haptic.success();
      toast.success('カードからまとめを生成しました。確認して保存してください。');
    } catch (e) {
      setErrorMsg(toMessage(e, 'まとめの生成に失敗しました。'));
    } finally {
      setGenerating(false);
    }
  };

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
      haptic.success();
      setSavedFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setSavedFlash(false), 1000);
    } catch (e) {
      console.error('summary save error', e);
      setErrorMsg(toMessage(e, 'まとめメモの保存に失敗しました。'));
    } finally {
      setSaving(false);
    }
  };

  const label = saving ? '保存中...' : savedFlash ? '保存しました ✓' : '保存';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={{ fontSize: 13, color: 'var(--c-ink-soft)', fontWeight: 600, margin: 0 }}>まとめメモ</p>
        <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: '2px 0 8px', lineHeight: 1.6 }}>
          本全体の感想・学びを1枚に。カードがたまっていれば AI が下書きを作れます。
        </p>
      </div>
      {canGenerate && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            alignSelf: 'flex-start', minHeight: 38, padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--c-hairline-strong)', background: 'var(--c-soft)',
            color: 'var(--c-brand)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1,
          }}
        >
          <Sparkles size={14} aria-hidden="true" />
          {generating ? 'まとめを生成中…' : 'カードからまとめを生成'}
        </button>
      )}
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
        <p style={{ color: 'var(--c-critical)', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
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

export default function BookMemoList({ bookId, bookTitle, bookAuthor = '', summaryText = '', onSaveSummary, onMakeAction }) {
  const [mode, setMode] = useState(loadInitialMode);
  const [sortBy, setSortBy] = useState('page');
  const [quoteOnly, setQuoteOnly] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState(null);
  const [shareMemo, setShareMemo] = useState(null);
  // 直近に追加したメモ id — 1.5 秒だけ .just-added グローを当てる。
  const [justAddedId, setJustAddedId] = useState(null);
  // 「最初の気づきを残したあと、想起の体験へ繋ぐ」一度きりの控えめなヒント。
  // 新規ユーザーが"記録して終わり"でなく振り返り(想起)に辿り着けるよう、初メモ後に
  // 1回だけ出す。localStorage で既読管理し、二度は出さない(Apple Notes 級の控えめさ)。
  const [recallHintSeen, setRecallHintSeen] = useState(() => {
    if (typeof window === 'undefined') return true;
    try { return window.localStorage.getItem('recallHintSeen') === 'true'; } catch { return true; }
  });
  const dismissRecallHint = () => {
    setRecallHintSeen(true);
    try { window.localStorage.setItem('recallHintSeen', 'true'); } catch { /* ignore */ }
  };
  const toast = useToast();
  const haptic = useHaptic();
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

  // 「📖 引用のみ」フィルタ: ページ番号が入っているメモ＝引用・抜き書きとみなす。
  // 並び（page / created_desc）は useBookMemos 側で済んでいるので順序は保たれる。
  const visibleMemos = useMemo(
    () => (quoteOnly ? memos.filter((m) => Number.isFinite(m.pageNumber)) : memos),
    [memos, quoteOnly]
  );

  // メモ本文をクリップボードへ。ページ番号があれば「(p.42)」を併記して引用作業を楽にする。
  const handleCopy = async (memo) => {
    const body = (memo?.text || '').trim();
    if (!body) {
      toast.error('コピーできる本文がありません');
      return;
    }
    const text = Number.isFinite(memo.pageNumber) ? `${body} (p.${memo.pageNumber})` : body;
    try {
      await navigator.clipboard.writeText(text);
      haptic.light();
      toast.success('コピーしました');
    } catch {
      toast.error('コピーできませんでした。');
    }
  };

  // 🖼 引用カード（画像）を生成するモーダルを開く。本文が空のメモは導線が出ない
  // ので（コピー同様）ここでは到達しない想定だが、念のためガードする。
  const handleShare = (memo) => {
    if (!(memo?.text || '').trim()) {
      toast.error('共有できる本文がありません');
      return;
    }
    haptic.light();
    setShareMemo(memo);
  };

  // 🎯 このメモを、その場で行動に変える（メモ本文＋ページを起点に紐づけ）。
  const handleMakeAction = async (memo) => {
    if (!onMakeAction || !(memo?.text || '').trim()) return;
    const ok = await onMakeAction(bookId, {
      text: memo.text,
      sourceMemoId: memo.id || null,
      sourcePage: memo.pageNumber ?? memo.page_number ?? null,
    });
    if (ok) { haptic.success(); toast.success('🎯 行動に追加しました'); }
  };

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
    haptic.success();
    // 🎯 保存直後に「行動にする」を 1 タップで提案し、キャプチャと行動を溶接する
    //    （読む→行動の最大リークを塞ぐ）。本文のあるメモかつ onMakeAction がある時だけ。
    const actionText = (result?.text ?? payload?.text ?? '').trim();
    if (onMakeAction && actionText && result?.id) {
      toast.show({
        type: 'success',
        message: 'メモを保存しました',
        duration: 6000,
        action: {
          label: '🎯 行動にする',
          onClick: () => handleMakeAction({
            id: result.id,
            text: actionText,
            pageNumber: result.page_number ?? payload?.pageNumber ?? null,
          }),
        },
      });
    } else {
      toast.success('メモを保存しました');
    }
    // 新着カードを 1.5 秒だけ淡くグロー（.just-added）— どこに入ったかを
    // 無音で示す。timeout で必ず class を外す（forwards の透明が固定される為）。
    if (result?.id) {
      setJustAddedId(result.id);
      setTimeout(() => setJustAddedId((cur) => (cur === result.id ? null : cur)), 1600);
    }
    return result;
  };

  const handleUpdate = async (memoId, payload) => {
    const result = await updateMemo(memoId, payload);
    haptic.success();
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
        background: 'var(--c-card)',
        border: '1px dashed var(--c-hairline-strong)',
        borderRadius: 10,
        fontSize: 12,
        color: 'var(--c-ink-2)',
        lineHeight: 1.7,
      }}
    >
      本を一度保存するとカード形式のメモを追加できます。
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-soft)', borderRadius: 10 }}>
        <button type="button" style={sortTab(sortBy === 'page')} onClick={() => setSortBy('page')}>
          <BookOpen size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
          ページ順
        </button>
        <button
          type="button"
          style={sortTab(sortBy === 'created_desc')}
          onClick={() => setSortBy('created_desc')}
        >
          <Clock size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
          新しい順
        </button>
      </div>

      <button
        type="button"
        style={quoteChip(quoteOnly)}
        onClick={() => setQuoteOnly((v) => !v)}
        aria-pressed={quoteOnly}
      >
        <Quote size={13} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
        引用のみ
      </button>

      <button type="button" onClick={openCreate} style={addBtn}>
        <Plus size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
        新しいメモ
      </button>

      {loading && memos.length === 0 && <MemoListSkeleton rows={3} />}

      {!loading && memos.length === 0 && (
        <EmptyState
          icon={<StickyNote size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="まだメモがありません"
          description="読みながら気になった一行を、ひとつ残してみましょう。"
          tip="残した一行は、あとで「振り返り」の想起として、ふいに戻ってきます。"
        />
      )}

      {!loading && memos.length > 0 && quoteOnly && visibleMemos.length === 0 && (
        <EmptyState
          icon={<BookOpen size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="ページ番号付きのメモがまだありません"
          description="メモにページ番号を入れておくと、引用したい一行をここから素早く取り出せます。"
        />
      )}

      {!loading && memos.length > 0 && !recallHintSeen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            background: '#f4efe7',
            border: '1px solid var(--c-hairline)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 10,
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--c-ink-soft)', margin: 0, lineHeight: 1.7, flex: 1 }}>
            最初の気づきが残りました。下の「🔄 振り返り」を開くと、これがランダムに、そして忘れた頃にそっと戻ってきます。
          </p>
          <button
            type="button"
            onClick={dismissRecallHint}
            style={{
              flexShrink: 0,
              minHeight: 32,
              padding: '4px 10px',
              border: '1px solid var(--c-hairline-strong)',
              background: 'var(--c-card)',
              color: 'var(--c-brand)',
              borderRadius: 8,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            aria-label="ヒントを閉じる"
          >
            わかった
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleMemos.map((m) => (
          <BookMemoCard
            key={m.id}
            memo={m}
            highlight={m.id === justAddedId}
            onEdit={openEdit}
            onCopy={handleCopy}
            onShare={handleShare}
            onMakeAction={onMakeAction ? handleMakeAction : undefined}
            onDelete={handleDelete}
            onSwipeDelete={handleSwipeDelete}
            onLongPress={(payload) => setMemoMenu(payload)}
          />
        ))}
      </div>
    </div>
  );

  const summarySection = onSaveSummary ? (
    <SummarySection bookId={bookId} bookTitle={bookTitle} cards={memos.map((m) => m.text)} summaryText={summaryText} onSaveSummary={onSaveSummary} />
  ) : (
    <div
      style={{
        padding: '14px',
        background: 'var(--c-card)',
        border: '1px dashed var(--c-hairline-strong)',
        borderRadius: 10,
        fontSize: 12,
        color: 'var(--c-ink-2)',
        lineHeight: 1.7,
      }}
    >
      この画面ではまとめメモを編集できません。
    </div>
  );

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--c-soft-2)', borderRadius: 10 }}>
        <button type="button" style={modeTab(mode === 'card')} onClick={() => setMode('card')}>
          <StickyNote size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
          カード
        </button>
        <button type="button" style={modeTab(mode === 'summary')} onClick={() => setMode('summary')}>
          <FileText size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
          まとめ
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
            { label: '編集', icon: <Pencil size={16} aria-hidden="true" />, onClick: () => openEdit(memoMenu.memo) },
            { label: 'コピー', icon: <Copy size={16} aria-hidden="true" />, onClick: () => handleCopy(memoMenu.memo) },
            ...(onMakeAction && (memoMenu.memo?.text || '').trim()
              ? [{ label: '行動にする', icon: <Target size={16} aria-hidden="true" />, onClick: () => handleMakeAction(memoMenu.memo) }]
              : []),
            ...((memoMenu.memo?.text || '').trim()
              ? [{ label: '画像で共有', icon: <Image size={16} aria-hidden="true" />, onClick: () => handleShare(memoMenu.memo) }]
              : []),
            { label: '削除', icon: <Trash2 size={16} aria-hidden="true" />, destructive: true, onClick: () => handleDelete(memoMenu.memo) },
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

      {shareMemo && (
        <ShareCardModal
          memo={shareMemo}
          bookTitle={bookTitle}
          author={bookAuthor}
          onClose={() => setShareMemo(null)}
        />
      )}
    </div>
  );
}
