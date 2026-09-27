// メモを書くシート（SPEC §2「読みながら片手でサッと」）。
// 最初に見えるのは本文だけ。ページ番号・写真から書き起こす・タグ（全画面の
// BookMemoEditor へ引き継ぐ）は「＋ ページ・写真」で開く（SPEC §2）。
// ページ番号は直前のメモ＋1 を既定値として覚えておく（開かなくても保存される）。
// 見た目は DESIGN.md のトークンのみ。

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { toMessage } from '../lib/errors';
import { LIMITS } from '../lib/limits';
import PhotoToTextButton from './PhotoToTextButton';
import { condenseMemo } from '../lib/ai';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { Sparkles, Undo2, Plus, Minus, ChevronRight } from 'lucide-react';
import { btnPrimary, btnPrimaryOff, btnLink, groupTitle } from '../styles/ui';
import { useBlockEdgeSwipe } from '../hooks/useEdgeSwipeBack';

const KEYFRAMES_ID = '__leverage-sheet-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
@keyframes leverage-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes leverage-sheet-down { from { transform: translateY(0); } to { transform: translateY(100%); } }
@keyframes leverage-fade-in { from { opacity: 0; } to { opacity: 1; } }
`;
  document.head.appendChild(style);
}

const backdrop = {
  position: 'fixed',
  inset: 0,
  background: 'var(--backdrop)',
  zIndex: 700,
  animation: 'leverage-fade-in .15s ease',
  WebkitBackdropFilter: 'var(--backdrop-blur-strong)',
  backdropFilter: 'var(--backdrop-blur-strong)',
};

const sheetWrap = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 701,
  background: 'var(--surface)',
  borderTopLeftRadius: 'var(--radius)',
  borderTopRightRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-overlay)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '85vh',
  animation: 'leverage-sheet-up .25s cubic-bezier(0.2,0.9,0.3,1)',
  fontFamily: "var(--font-app)",
  // safe-area は footer 側の calc で 1 回だけ確保する（ここにも入れると
  // 二重加算でホームインジケータ上に余計な空白帯が出る）。
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-4) var(--space-3)',
  borderBottom: '1px solid var(--separator)',
};

// DESIGN §5: 下に決定ボタン（保存）があるシートは、右上に「キャンセル」（BottomSheet と同じ見た目）。
const cancelBtn = {
  background: 'none',
  border: 'none',
  fontSize: 'var(--text-body)',
  fontWeight: 400,
  color: 'var(--text-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minWidth: 44,
  minHeight: 44,
  padding: 0,
  flexShrink: 0,
};

const bodyStyle = {
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
};

// 小さな見出し（DESIGN §5・ui.js groupTitle）。
const fieldLabel = {
  ...groupTitle,
  display: 'block',
  marginBottom: 'var(--space-2)',
};

const inp = {
  width: '100%',
  minHeight: 48,
  padding: 'var(--space-3)',
  fontSize: 'max(16px, var(--text-body))',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const ta = {
  ...inp,
  resize: 'none', // Web のサイズ変更つまみは iOS の作法にない
  display: 'block', // 行の下の余り（インラインの隙間 約 7）を出さない
  minHeight: 160,
  // メモは「読む文章」（DESIGN §2: 明朝 18・行間 1.6）
  fontFamily: 'var(--font-read)',
  fontSize: 'var(--text-read)',
  lineHeight: 1.6,
};

const footerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px))',
  borderTop: '1px solid var(--separator)',
};

// 文字ボタン（DESIGN §5・ui.js btnLink＝高さ 44・15/600）。左端を本文の端にそろえる。
const detailLink = { ...btnLink, padding: 0, gap: 'var(--space-1)' };

// 本文の下の小さな副ボタン（DESIGN §5 btnRow と同じ寸法: 高さ 44・15・600）。
const rowBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', minHeight: 44,
  padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text)', fontSize: 'var(--text-sub)', fontWeight: 600,
  fontFamily: 'inherit', cursor: 'pointer',
};

// 主ボタン（DESIGN §5: 高さ 48・17・600）。押せないときは薄くせず btnPrimaryOff。
const saveBtn = (disabled) => (disabled ? btnPrimaryOff : btnPrimary);

export default function QuickMemoSheet({
  bookTitle,
  defaultPageNumber = '',
  onClose,
  onCreate,
  onOpenFullEditor,
}) {
  // 開いている間は左端スワイプで画面を戻さない（書きかけが確認なしに消えないように）
  useBlockEdgeSwipe(true);
  ensureKeyframes();
  const [pageNumber, setPageNumber] = useState(defaultPageNumber !== '' ? String(defaultPageNumber) : '');
  const [text, setText] = useState('');
  // ＋ ページ・写真（最初は閉じる＝本文だけを見せる）。
  const [moreOpen, setMoreOpen] = useState(false);
  // ページ番号を自分で触ったか。触っていなければ、既定値（直前＋1）が後から届いたときに
  // 反映する（ホームから開くと、メモ一覧の読み込みより先にシートが開くため）。
  const pageTouchedRef = useRef(false);
  useEffect(() => {
    if (pageTouchedRef.current) return;
    setPageNumber(defaultPageNumber !== '' && defaultPageNumber != null ? String(defaultPageNumber) : '');
  }, [defaultPageNumber]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // 閉じアニメーション中（入りが滑らかなのに出だけ瞬間消滅、の非対称を解消）。
  const [closing, setClosing] = useState(false);
  // 下スワイプで閉じるドラッグ（ハンドル/ヘッダー起点）。キーボード追従の
  // transform と競合しないよう、ドラッグ中は vv 追従を一時停止する。
  const dragStartYRef = useRef(null);
  const draggingRef = useRef(false);
  // ✨ 凝縮（本田流レバレッジメモ化）— 元テキストを保持して「↩ 元に戻す」可能に。
  const [condensing, setCondensing] = useState(false);
  const [condensedFrom, setCondensedFrom] = useState(null);
  const textRef = useRef(null);
  const sheetRef = useRef(null);
  // ♿ Tab をシート内に閉じ込め、閉じたら元の要素へ復帰（aria-modal と実挙動を一致）。
  const trapRef = useFocusTrap(true);
  const toast = useToast();
  const confirmDialog = useConfirm();

  const handleCondense = async () => {
    if (condensing) return;
    const src = text.trim();
    if (src.replace(/\s/g, '').length < 60) {
      toast.info('もう少し長いメモで凝縮が活きます。');
      return;
    }
    setCondensing(true);
    try {
      const out = await condenseMemo({ text: src });
      if (out && out.trim() && out.trim() !== src) {
        setCondensedFrom(text); // 元に戻せるよう保持
        setText(out.trim());
        toast.success('本質だけに凝縮しました。');
      } else {
        toast.error('うまく凝縮できませんでした。少し時間をおいて再度お試しください。');
      }
    } catch (e) {
      // 例外（429/通信断/API エラー）を握り潰すとスピナーが止まるだけで無反応に
      // 見え、連打を誘発する。必ず失敗を伝える。
      toast.error(toMessage(e, '凝縮に失敗しました。少し時間をおいて再度お試しください。'));
    } finally {
      setCondensing(false);
    }
  };

  const undoCondense = () => {
    if (condensedFrom == null) return;
    setText(condensedFrom);
    setCondensedFrom(null);
  };

  useEffect(() => {
    // Auto-focus the textarea when the sheet opens.
    setTimeout(() => textRef.current?.focus(), 80);
  }, []);

  // Keyboard push-up: visualViewport changes height when the on-screen
  // keyboard appears. Resize the sheet so its content stays visible.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const apply = () => {
      if (!sheetRef.current) return;
      if (draggingRef.current) return; // ドラッグ中は指の transform を優先
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      sheetRef.current.style.transform = offset > 60 ? `translateY(-${offset}px)` : '';
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  // 閉じは必ず slide-down を経由する（入りが .25s で滑らかに上がるのに、
  // 出だけ瞬間消滅すると往復の所作が非対称で安っぽい）。
  const animateClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose?.(), 220); // アニメ長と一致
  };

  // 保存中(busy)は閉じない。保存途中で閉じると onCreate の成否フィードバック
  // (errorMsg) がアンマウントで消え、ユーザーに結果が届かない。
  // condensing（AI 凝縮中）も閉じさせない — backdrop/Esc で閉じると結果と下書きが
  // 破棄され AI コストだけ消費する。busy と同格のガードにする。
  // 書きかけの本文がある時は、backdrop/Esc/下スワイプのどこから閉じても
  // 一度だけ確認を挟む（誤タップ 1 回で下書きが消える事故を防ぐ）。
  const requestClose = async () => {
    if (busy || condensing) return;
    if (text.trim()) {
      const ok = await confirmDialog({
        title: '書きかけのメモを破棄しますか？',
        message: '保存されていない内容は失われます。',
        confirmLabel: '破棄する',
        cancelLabel: '書き続ける',
        danger: true,
      });
      if (!ok) return;
    }
    animateClose();
  };

  // 下スワイプで閉じる（iOS のシート標準所作。ハンドル/ヘッダー起点のみ —
  // 本文 textarea のスクロール/選択とは競合させない）。
  const onDragStart = (e) => {
    if (busy || condensing || closing) return;
    // キーボード追従 transform が効いている間はドラッグを開始しない（競合回避）。
    const t = sheetRef.current?.style?.transform || '';
    if (t && t !== 'none' && !t.startsWith('translateY(0')) return;
    dragStartYRef.current = e.touches?.[0]?.clientY ?? null;
  };
  const onDragMove = (e) => {
    if (dragStartYRef.current == null || !sheetRef.current) return;
    const dy = (e.touches?.[0]?.clientY ?? 0) - dragStartYRef.current;
    if (dy <= 0) return;
    draggingRef.current = true;
    sheetRef.current.style.transition = 'none';
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onDragEnd = (e) => {
    const startY = dragStartYRef.current;
    dragStartYRef.current = null;
    if (!draggingRef.current || !sheetRef.current || startY == null) return;
    draggingRef.current = false;
    const dy = Math.max(0, (e.changedTouches?.[0]?.clientY ?? startY) - startY);
    const el = sheetRef.current;
    el.style.transition = 'transform .22s cubic-bezier(0.2,0.9,0.3,1)';
    if (dy > 110 && !busy && !condensing) {
      // 書きかけがある時は勝手に閉じず、シートを戻してから確認を出す
      // （backdrop / Esc と同じガードに合流）。
      if (text.trim()) {
        el.style.transform = '';
        requestClose();
        return;
      }
      el.style.transform = 'translateY(100%)';
      setTimeout(() => onClose?.(), 200);
    } else {
      el.style.transform = '';
    }
  };

  // Escape closes（保存中・AI 凝縮中は無視 — backdrop タップと同じガード）。
  // IME 変換中の Esc（変換キャンセル）でシートごと閉じて下書きを失わないよう
  // isComposing をガードする。閉じは slide-down 経由で backdrop と所作を揃える。
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy && !condensing && !e.isComposing && !e.nativeEvent?.isComposing) {
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleSave = async () => {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setErrorMsg('メモ本文を入力してください。');
      return;
    }
    const parsed = parseInt(pageNumber, 10);
    setBusy(true);
    setErrorMsg('');
    try {
      await onCreate({
        pageNumber: Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 99999) : null,
        text: trimmed,
        photoFile: null,
        tags: [],
      });
      animateClose(); // 保存後も滑って閉じる（出入りの所作を統一）
    } catch (e) {
      setErrorMsg(toMessage(e, 'メモの保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handleDetailHandoff = () => {
    if (busy) return; // 保存の在空中に引き継ぐと同内容メモが二重作成される
    const parsed = parseInt(pageNumber, 10);
    onOpenFullEditor?.({
      pageNumber: Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 99999) : null,
      text,
    });
    onClose?.();
  };

  // body 直下に出す。画面の中（アニメーションの transform がかかった要素の中）に置くと
  // position: fixed が画面ではなくその要素に対して効き、下のタブが保存ボタンを覆っていた（2026-09-27）。
  const sheet = (
    <>
      <div
        style={{ ...backdrop, ...(closing ? { opacity: 0, transition: 'opacity .18s ease' } : {}) }}
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={(el) => { sheetRef.current = el; trapRef.current = el; }}
        style={{
          ...sheetWrap,
          animation: closing
            ? 'leverage-sheet-down .22s cubic-bezier(0.3,0,0.8,0.3) forwards'
            : sheetWrap.animation,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="メモを書く"
      >
        {/* ハンドル+ヘッダー = 掴んで下に振ると閉じる（iOS シートの標準所作） */}
        <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
        <div className="lvg-sheet-handle" aria-hidden="true" />
        <div style={headerStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', margin: 0 }}>メモを書く</p>
            <p
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--text)',
                fontWeight: 600,
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {bookTitle || '本'}
            </p>
          </div>
          <button type="button" style={cancelBtn} onClick={requestClose}>
            キャンセル
          </button>
        </div>
        </div>{/* /drag zone (handle + header) */}

        <div style={bodyStyle}>
          <div>
            <textarea
              aria-label="メモ本文"
              data-font-lg=""
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.nativeEvent.isComposing) {
                  e.preventDefault();
                }
              }}
              placeholder="心が動いた一行を書き留める"
              style={ta}
              maxLength={LIMITS.memoText}
            />
          </div>

          {/* 凝縮 — 十分な長さの時だけ出す（話した冗長メモを核心 1 行へ）。 */}
          {(text.trim().replace(/\s/g, '').length >= 60 || condensedFrom != null) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {text.trim().replace(/\s/g, '').length >= 60 && (
                <button
                  type="button"
                  onClick={handleCondense}
                  disabled={condensing}
                  aria-label="メモを凝縮する"
                  // 凝縮中は薄くせず、枠と文字の色＋文言で示す（DESIGN §5「押せないボタン」）。
                  style={condensing ? { ...rowBtn, border: '1px solid var(--separator)', color: 'var(--text-3)', cursor: 'default', opacity: 1 } : rowBtn}
                >
                  <Sparkles size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                  {condensing ? '凝縮中…' : '凝縮'}
                </button>
              )}
              {condensedFrom != null && (
                <button type="button" onClick={undoCondense} aria-label="凝縮を元に戻す" style={{ ...rowBtn, border: 'none', color: 'var(--text-2)' }}>
                  <Undo2 size={16} aria-hidden="true" />
                  元に戻す
                </button>
              )}
            </div>
          )}

          {/* ＋ ページ・写真 — 閉じていても、ページ番号（直前＋1）は保存される。
              高さ 44 の文字ボタンの上の余り（約 12）を詰め、見た目で本文欄の下 約 8 に置く。 */}
          <div style={{ marginTop: 'calc(-1 * var(--space-4))' }}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              style={detailLink}
            >
              {moreOpen ? <Minus size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
              ページ・写真
              {!moreOpen && pageNumber !== '' && (
                <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>（p.{pageNumber}）</span>
              )}
            </button>
            {moreOpen && (
              // ページ番号（112）と「写真から書き起こす」（残りの幅いっぱい）を 1 行に。
              <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', columnGap: 'var(--space-3)', alignItems: 'end', marginTop: 'var(--space-2)' }}>
                <div>
                  <label htmlFor="quick-memo-page" style={fieldLabel}>ページ番号</label>
                  <input
                    id="quick-memo-page"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99999}
                    value={pageNumber}
                    onChange={(e) => { pageTouchedRef.current = true; setPageNumber(e.target.value); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        textRef.current?.focus();
                      }
                    }}
                    placeholder="78"
                    style={{ ...inp, width: '100%', textAlign: 'center' }}
                  />
                </div>
                <PhotoToTextButton
                  style={{ minHeight: 48, width: '100%' }}
                  onText={(t) =>
                    setText((prev) => (prev ? `${prev}\n${t}` : t).slice(0, LIMITS.memoText))
                  }
                />
              </div>
            )}
            {moreOpen && onOpenFullEditor && (
              <button type="button" style={{ ...detailLink, marginTop: 0 }} onClick={handleDetailHandoff}>
                タグもつける（全画面で書く）<ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {errorMsg && (
            <p role="alert" style={{ color: 'var(--error)', fontSize: 'var(--text-sub)', lineHeight: 1.5, margin: 0 }}>{errorMsg}</p>
          )}
        </div>

        <div style={footerStyle}>
          <button type="button" style={saveBtn(busy || !text.trim())} onClick={handleSave} disabled={busy || !text.trim()}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </>
  );
  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}
