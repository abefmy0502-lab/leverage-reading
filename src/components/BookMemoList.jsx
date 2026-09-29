import { useEffect, useMemo, useRef, useState } from 'react';
import { useBookMemos } from '../hooks/useBookMemos';
import { useAppDataCache } from '../state/AppDataCache';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { useConfirm } from './ConfirmDialog';
import { toMessage } from '../lib/errors';
import { summarizeCards } from '../lib/ai';
import { usePaywall } from '../state/PaywallContext';
import { MemoListSkeleton } from './Skeleton';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import { LIMITS } from '../lib/limits';
import ContextMenu from './ContextMenu';
import BookMemoCard from './BookMemoCard';
import BookMemoEditor from './BookMemoEditor';
import ShareSheet from './ShareSheet';
import { BookOpen, PencilLine, Clock, Quote, Pencil, Copy, Share, Trash2, Sparkles, Target, ChevronDown, Check } from 'lucide-react';
import { btnGhost, btnGhostOff, btnLink } from '../styles/ui';

// SPEC §2（2026-09-26）: 「カード｜まとめ」の切替タブと、二段の並び替え・引用チップ・
// 点線の「新しいメモ」は撤去。メモはカード式が基本で、並び順は小さなメニュー 1 つ。
// まとめは一覧の下の「この本のまとめ」（折りたたみ）1 か所に寄せた。
// 新しいメモの入口は、本の詳細画面右下の「メモを書く」1 つだけ（二重の入口をなくす）。
const summaryTextarea = {
  width: '100%',
  minHeight: 240,
  maxHeight: 600,
  padding: 'var(--space-3)',
  fontSize: 'var(--text-read)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'var(--font-read)', // まとめは「読む文章」（DESIGN §2）
  lineHeight: 1.6,
  resize: 'none',
  outline: 'none',
  boxSizing: 'border-box',
};

// まとめの保存は副ボタン（詳細画面の主ボタンは「メモを書く」1 つ・DESIGN §0）。
// 保存中は薄くせず btnGhostOff（DESIGN §5「押せないボタン」）。
const summarySaveBtn = (saving) => (saving ? btnGhostOff : btnGhost);


function SummarySection({ bookId, bookTitle, cards = [], summaryText, onSaveSummary }) {
  const [text, setText] = useState(summaryText || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // 失敗した操作（'save' | 'generate'）。エラーの「もう一度」で同じ操作をやり直す。
  const [errorKind, setErrorKind] = useState(null);
  const [generating, setGenerating] = useState(false);
  const flashTimerRef = useRef(null);
  const haptic = useHaptic();
  const toast = useToast();
  const confirm = useConfirm();

  // カードが2枚以上たまっていれば「カードからまとめを生成」を提案できる。
  const cardTexts = (cards || []).map((t) => String(t || '').trim()).filter(Boolean);
  const canGenerate = cardTexts.length >= 2;

  // 📝 カード→まとめ生成。既存のまとめがあれば上書き確認してから差し替える。
  // メモからまとめを作るはプランの機能（フリーミアム）。無料プランなら有料プランの画面を開く。
  const { requirePlan } = usePaywall();
  const handleGenerate = async () => {
    if (generating || !canGenerate) return;
    if (!requirePlan('メモからのまとめ作成')) return;
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
        toast.error('まとめを作れませんでした。少し時間をおいて、もう一度お試しください。');
        return;
      }
      setText(result);
      haptic.success();
      toast.success('カードからまとめを生成しました。確認して保存してください。');
    } catch (e) {
      // プランの案内（402）は有料プランの画面が開くので、ここには出さない。
      if (!(e?.notice && /^この AI 機能は/.test(e.message))) {
        setErrorMsg(toMessage(e, 'まとめの生成に失敗しました。'));
        setErrorKind('generate');
      }
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
      setErrorKind('save');
    } finally {
      setSaving(false);
    }
  };

  const label = saving ? '保存中…' : savedFlash ? '保存しました ✓' : '保存';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {/* 説明の補足文は置かない（DESIGN §0-6）。入力欄の案内文とこの文字ボタンで伝わる。 */}
      {canGenerate && (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          // 文字ボタン（DESIGN §5）。作成中は薄くせず、文字色だけ --text-3 に。
          style={{ ...btnLink, alignSelf: 'flex-start', padding: 0, gap: 'var(--space-1)', ...(generating ? { color: 'var(--text-3)', cursor: 'default' } : null) }}
        >
          <Sparkles size={16} aria-hidden="true" />
          {generating ? 'まとめを生成中…' : 'メモからまとめを作る'}
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
        <ErrorMessage
          description={errorMsg}
          actions={[{ label: 'もう一度', onClick: errorKind === 'generate' ? handleGenerate : handleSave }]}
        />
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

// afterList: メモ一覧のすぐ下（「この本のまとめ」の上）に置く要素（本の詳細の「この本に相談する」・SPEC §2 の並び）。
// onShareMemo(memo): 「この一文をシェア」を親（本の詳細）の一文シェアのシートで開く。無ければこの一覧の中で開く。
export default function BookMemoList({ bookId, bookTitle, bookAuthor = '', summaryText = '', onSaveSummary, onMakeAction, onShareMemo, afterList = null, focusMemoId = null }) {
  const [sortBy, setSortBy] = useState('page');
  const [sortMenu, setSortMenu] = useState(null); // { x, y } | null
  const [quoteOnly, setQuoteOnly] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState(null);
  const [shareMemo, setShareMemo] = useState(null);
  // 直近に追加したメモ id — 1.5 秒だけ .just-added グローを当てる。
  const [justAddedId, setJustAddedId] = useState(null);
  const toast = useToast();
  const haptic = useHaptic();
  const confirm = useConfirm();
  const {
    memos,
    loading,
    error: loadError,
    refresh,
    isUsableBookId,
    createMemo,
    updateMemo,
    deleteMemo,
    restoreMemoFromSnapshot,
  } = useBookMemos(bookId, { sortBy });
  // 読み込み中の形は、最後に分かったメモの件数に合わせる（登録したばかりの本＝0 件なら「一行を残しましょう」の高さ）。
  //   分からない（null）ときは 3 件分。読み込み中は件数・並び替えの行、「この本に相談する」、「この本のまとめ」も
  //   見えない形で場所を取っておく（読み込み後に下が押し下げられて跳ねないように・2026-09-29）。
  const cache = useAppDataCache();
  const countHint = useMemo(() => cache?.getMemoCountHint?.(bookId) ?? null, [cache, bookId]);
  const waiting = loading && memos.length === 0;
  const hidden = { visibility: 'hidden' };

  const rootRef = useRef(null);

  // 🔎 振り返りの検索などから「このメモ」を指して開いたとき（focusMemoId）: 読み込めたら
  // そのメモまで送って、少しのあいだ栗色で示す（2026-09-29）。1 つの id につき 1 回だけ。
  const [focusedId, setFocusedId] = useState(null);
  const focusDoneRef = useRef(null);
  const focusTimersRef = useRef([]);
  useEffect(() => () => { focusTimersRef.current.forEach(clearTimeout); }, []);
  useEffect(() => {
    if (!focusMemoId || focusDoneRef.current === focusMemoId || loading) return undefined;
    if (!memos.some((m) => m.id === focusMemoId)) return undefined;
    focusDoneRef.current = focusMemoId;
    if (quoteOnly) setQuoteOnly(false);
    setFocusedId(focusMemoId);
    let reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* noop */ }
    const id = focusMemoId;
    // 次の再描画（quoteOnly の解除など）で消されないよう、タイマーは ref で持ってアンマウントでだけ止める。
    focusTimersRef.current.push(setTimeout(() => {
      const el = rootRef.current?.querySelector(`[data-memo-id="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(id)) : String(id)}"]`);
      el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }, 60));
    focusTimersRef.current.push(setTimeout(() => setFocusedId((cur) => (cur === id ? null : cur)), 2400));
    return undefined;
  }, [focusMemoId, memos, loading, quoteOnly]);

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
      toast.error('コピーできる本文がありません。');
      return;
    }
    const text = Number.isFinite(memo.pageNumber) ? `${body} (p.${memo.pageNumber})` : body;
    try {
      await navigator.clipboard.writeText(text);
      haptic.light();
      toast.success('コピーしました。');
    } catch {
      toast.error('コピーできませんでした。');
    }
  };

  // 🖼 この一文をシェア（一文カードのシートを、このメモを選んだ状態で開く）。本文が空のメモは
  // 導線が出ないので（コピー同様）ここでは到達しない想定だが、念のためガードする。
  const handleShare = (memo) => {
    if (!(memo?.text || '').trim()) {
      toast.error('シェアできる本文がありません。');
      return;
    }
    haptic.light();
    if (onShareMemo) onShareMemo(memo);
    else setShareMemo(memo);
  };

  // 🎯 このメモを、その場で行動に変える（メモ本文＋ページを起点に紐づけ）。
  const handleMakeAction = async (memo) => {
    if (!onMakeAction || !(memo?.text || '').trim()) return;
    const ok = await onMakeAction(bookId, {
      text: memo.text,
      sourceMemoId: memo.id || null,
      sourcePage: memo.pageNumber ?? memo.page_number ?? null,
    });
    if (ok) { haptic.success(); toast.success('行動に追加しました。'); }
  };

  const openEdit = (memo) => {
    setEditingMemo(memo);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingMemo(null);
  };

  // opts.quiet: 「保存して次へ」で書き続けるとき。知らせ（トースト）は出さない（全画面の入力欄に重なるので、
  //   書く画面の「保存しました」で伝える・2026-09-29）。
  const handleCreate = async (payload, opts = {}) => {
    const result = await createMemo(payload);
    haptic.success();
    if (opts.quiet) {
      if (result?.id) {
        setJustAddedId(result.id);
        setTimeout(() => setJustAddedId((cur) => (cur === result.id ? null : cur)), 1600);
      }
      return result;
    }
    // 🎯 保存直後に「行動にする」を 1 タップで提案し、キャプチャと行動を溶接する
    //    （読む→行動の最大リークを塞ぐ）。本文のあるメモかつ onMakeAction がある時だけ。
    const actionText = (result?.text ?? payload?.text ?? '').trim();
    if (onMakeAction && actionText && result?.id) {
      toast.show({
        type: 'success',
        message: 'メモを保存しました。',
        duration: 6000,
        action: {
          label: '行動に追加',
          onClick: () => handleMakeAction({
            id: result.id,
            text: actionText,
            pageNumber: result.page_number ?? payload?.pageNumber ?? null,
          }),
        },
      });
    } else {
      toast.success('メモを保存しました。');
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
    toast.success('メモを更新しました。');
    return result;
  };

  // Inner delete: snapshot, fire delete, show Undo toast. Used by both the
  // confirm-fronted handler (kebab/long-press menu) and the swipe gesture.
  const performDelete = (memo) => {
    const snapshot = { ...memo };
    let deleteFailed = false;
    const deletionPromise = deleteMemo(memo.id).catch((e) => {
      toast.error(toMessage(e, 'メモの削除に失敗しました。'));
      deleteFailed = true;
      throw e;
    });
    toast.undo({
      message: snapshot.photoPath
        ? 'メモを削除しました\n※写真は復元できません'
        : 'メモを削除しました',
      onUndo: async () => {
        try {
          await deletionPromise.catch(() => {});
          // DELETE が失敗していたらメモは DB に健在 — 再 INSERT すると PK 重複で
          // 偽のエラーを出すため、Undo は no-op にする。
          if (deleteFailed) { toast.info('メモは削除されていません。'); return; }
          await restoreMemoFromSnapshot(snapshot);
          toast.info('削除を取り消しました。');
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
        ? '写真も Storage から削除されます。\n（元に戻しても、写真は戻りません）'
        : '5 秒以内なら「元に戻す」で戻せます。',
      confirmLabel: '削除する',
      cancelLabel: 'キャンセル',
      danger: true,
    });
    if (!ok) return;
    performDelete(memo);
  };

  // Swipe-driven delete (gesture itself = intent, no confirm modal).
  // 例外: 写真付きメモだけは確認を挟む — Undo（取消）を押しても写真は
  // Storage から即削除されて戻らないため、誤スワイプ＝写真の恒久消失になる。
  const handleSwipeDelete = async (memo) => {
    if (memo.photoPath) {
      const ok = await confirm({
        title: 'このメモを削除しますか？',
        message: '写真も削除されます。（元に戻しても、写真は戻りません）',
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        danger: true,
      });
      if (!ok) return;
    }
    performDelete(memo);
  };

  // Long-press → ContextMenu state
  const [memoMenu, setMemoMenu] = useState(null); // { x, y, memo }

  const cardSection = !isUsableBookId ? (
    <div
      style={{
        padding: 'var(--space-4)',
        background: 'var(--surface)',
        border: '1px solid var(--separator)',
        borderRadius: 'var(--radius)',
        fontSize: 'var(--text-sub)',
        color: 'var(--text-2)',
        lineHeight: 1.6,
      }}
    >
      本を一度保存するとカード形式のメモを追加できます。
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* 並べ替え・絞り込みは、並べ替える対象（メモ）ができてから出す。
          0 件の画面で最初に見えるのが「ページ順/新しい順/引用のみ」だと、
          書き始めのボタンがその下に埋もれる。 */}
      {/* 件数がまだ分からない（初めて開いた本）ときも、メモがある形で場所を取る（3 枚の形と同じ前提）。 */}
      {(memos.length > 0 || (waiting && countHint !== 0)) && (
        // 行の高さ 44 は押せる範囲のため。見た目では見出しとカードに寄せる（グループ内は詰める）。
        <div aria-hidden={waiting || undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', margin: 'calc(-1 * var(--space-2)) 0', ...(waiting ? hidden : null) }}>
          <span style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>
            {quoteOnly ? `ページ番号つき ${visibleMemos.length} 件` : `${memos.length} 件`}
          </span>
          <button
            type="button"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSortMenu({ x: r.right - 8, y: r.bottom + 4 }); }}
            aria-haspopup="menu"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44, padding: '0 0 0 var(--space-2)', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'var(--text-sub)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
          >
            {sortBy === 'page' ? 'ページ順' : '新しい順'}{quoteOnly ? '・ページ番号つき' : ''}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {waiting && countHint !== 0 && <MemoListSkeleton rows={countHint == null ? 3 : Math.min(countHint, 5)} />}
      {/* 0 件と分かっている本: 読み込み後に出る空の案内と同じ高さで待つ（見えない形） */}
      {waiting && countHint === 0 && (
        <div className="empty-state--flush-bottom" aria-hidden="true" style={hidden}>
          <EmptyState icon={<PencilLine size={32} strokeWidth={1.5} aria-hidden="true" />} title="心が動いた一行を残しましょう" />
        </div>
      )}

      {/* 読み込みに失敗したときは、空（「一行を残しましょう」）と見せずにやり直しを出す。 */}
      {!loading && memos.length === 0 && loadError && (
        <ErrorMessage
          title="メモを読み込めませんでした"
          description="通信の状態を確かめて、もう一度お試しください。"
          actions={[{ label: 'もう一度', onClick: () => refresh() }]}
        />
      )}

      {!loading && memos.length === 0 && !loadError && (
        // 入口は画面右下の「メモを書く」1 つ（ここに同じボタンを置かない・SPEC §2）。
        // 下の余白は次のまとまりとの間（24）に任せる（上下の余白の偏りをなくす）。
        <div className="empty-state--flush-bottom">
          <EmptyState
            icon={<PencilLine size={32} strokeWidth={1.5} aria-hidden="true" />}
            title="心が動いた一行を残しましょう"
          />
        </div>
      )}

      {!loading && memos.length > 0 && quoteOnly && visibleMemos.length === 0 && (
        <EmptyState
          icon={<BookOpen size={32} strokeWidth={1.5} aria-hidden="true" />}
          title="ページ番号付きのメモがまだありません"
          description="メモにページ番号を入れておくと、引用したい一行をここから素早く取り出せます。"
          actions={[{ label: 'すべてのメモを表示', onClick: () => setQuoteOnly(false), variant: 'secondary' }]}
        />
      )}

      {visibleMemos.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {visibleMemos.map((m) => (
          <BookMemoCard
            key={m.id}
            memo={m}
            highlight={m.id === focusedId ? 'focus' : m.id === justAddedId}
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
      )}
    </div>
  );

  // 保存先（onSaveSummary）が無い呼び出しでは「この本のまとめ」を出さない（呼び出し側はどちらも渡している）。
  const summarySection = onSaveSummary ? (
    <SummarySection bookId={bookId} bookTitle={bookTitle} cards={memos.map((m) => m.text)} summaryText={summaryText} onSaveSummary={onSaveSummary} />
  ) : null;

  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {cardSection}

      {/* 「この本に相談する」などはメモが 1 件以上あるときだけ（材料が無いと相談しても答えられない）。 */}
      {memos.length > 0 && afterList}
      {waiting && countHint !== 0 && afterList && <div aria-hidden="true" style={hidden}>{afterList}</div>}

      {/* この本のまとめ（旧「まとめ」タブ）。一覧の下に 1 か所だけ・普段は畳む。
          畳む見出しは DESIGN §5: 高さ 48・右端にシェブロン（開くと回る）・list-style なし。 */}
      {/* 読み込み中は同じ高さの見えない形で場所を取る（メモの一覧が入ったときに、まとめが下へ押し下げられて見えないように・
          読み込み後に 48 の見出しが足されて下が跳ねないように）。 */}
      {summarySection && loading && (
        <div aria-hidden="true" style={{ ...hidden, minHeight: 48, boxSizing: 'content-box', border: '1px solid var(--separator)', borderRadius: 'var(--radius)' }} />
      )}
      {summarySection && !loading && (
        <details style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: '0 var(--space-4)' }}>
          <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', minHeight: 48, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', cursor: 'pointer', listStyle: 'none' }}>
            この本のまとめ
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-meta)', fontWeight: 400, color: 'var(--text-3)' }}>{(summaryText || '').trim() ? '書いてあります' : 'まだありません'}</span>
              <ChevronDown size={20} aria-hidden="true" className="fold-chevron" style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            </span>
          </summary>
          <div style={{ paddingBottom: 'var(--space-4)' }}>{summarySection}</div>
        </details>
      )}

      {sortMenu && (
        <ContextMenu
          x={sortMenu.x}
          y={sortMenu.y}
          onClose={() => setSortMenu(null)}
          items={[
            { label: 'ページ順', icon: sortBy === 'page' ? <Check size={16} aria-hidden="true" /> : <BookOpen size={16} aria-hidden="true" />, onClick: () => setSortBy('page') },
            { label: '新しい順', icon: sortBy === 'created_desc' ? <Check size={16} aria-hidden="true" /> : <Clock size={16} aria-hidden="true" />, onClick: () => setSortBy('created_desc') },
            { label: quoteOnly ? 'すべてのメモを表示' : 'ページ番号つきだけ', icon: <Quote size={16} aria-hidden="true" />, onClick: () => setQuoteOnly((v) => !v) },
          ]}
        />
      )}

      {memoMenu && (
        <ContextMenu
          x={memoMenu.x}
          y={memoMenu.y}
          onClose={() => setMemoMenu(null)}
          items={[
            { label: '編集', icon: <Pencil size={16} aria-hidden="true" />, onClick: () => openEdit(memoMenu.memo) },
            { label: 'コピー', icon: <Copy size={16} aria-hidden="true" />, onClick: () => handleCopy(memoMenu.memo) },
            ...(onMakeAction && (memoMenu.memo?.text || '').trim()
              ? [{ label: '行動に追加', icon: <Target size={16} aria-hidden="true" />, onClick: () => handleMakeAction(memoMenu.memo) }]
              : []),
            ...((memoMenu.memo?.text || '').trim()
              ? [{ label: 'この一文をシェア', icon: <Share size={16} aria-hidden="true" />, onClick: () => handleShare(memoMenu.memo) }]
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
        <ShareSheet
          book={{ id: bookId, title: bookTitle, author: bookAuthor }}
          memos={memos}
          initialMemoId={shareMemo.id}
          onClose={() => setShareMemo(null)}
        />
      )}
    </div>
  );
}
