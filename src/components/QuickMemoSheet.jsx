// メモを書くシート（SPEC §2「読みながら片手でサッと」）。
// 最初に見えるのは本文だけ。ページ番号・写真から書き起こす・よく使うタグ（押して付ける）は
// 「＋ ページ・写真」で開く（SPEC §2）。写真を添える・新しいタグは全画面（BookMemoEditor）へ引き継ぐ。
// ページ番号は直前のメモ＋1 を既定値として覚えておく（開かなくても保存される）。
// 見た目は DESIGN.md のトークンのみ。

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { toMessage, toSaveMessage } from '../lib/errors';
import { withPhraseBreaks } from './TightBubble';
import { LIMITS } from '../lib/limits';
import PhotoToTextButton from './PhotoToTextButton';
import { Chip } from './formPrimitives';
import { condenseMemo } from '../lib/ai';
import { ensureAiConsent } from '../lib/aiConsent';
import { usePaywall } from '../state/PaywallContext';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { Sparkles, Undo2, Plus, Minus, ChevronRight, X } from 'lucide-react';
import { btnPrimary, btnPrimaryOff, btnGhost, btnLink, groupTitle } from '../styles/ui';
import { useBlockEdgeSwipe } from '../hooks/useEdgeSwipeBack';
import { useBackLayer } from '../hooks/useHistoryBack';
import { closeDelayMs } from '../lib/motion';

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
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + var(--safe-bottom-kb))',
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
  frequentTags = [], // よく使うタグ（「＋ ページ・写真」の中にチップで並べ、押して付ける・2026-09-29）
  // 📷 初回ガイドの「本のページを撮る」から来たとき（2026-10-02）: 本文が空の間は、入力欄の上に全幅の
  //   「写真から書き起こす」（副ボタン・ScanText 20）を置く。主ボタンは「保存」のまま。書き起こした（本文が入った）ら、
  //   いつもの場所（「＋ ページ・写真」の中）に戻る。
  startWithPhoto = false,
  // 包む class（集中モードから開くと 'focus-dark-scope'＝暗い値のトークンで描く・2026-10-09）。display: contents なので並びは変えない。
  scopeClass = '',
}) {
  ensureKeyframes();
  const [pageNumber, setPageNumber] = useState(defaultPageNumber !== '' ? String(defaultPageNumber) : '');
  const [text, setText] = useState('');
  // 📷 入力欄の上の「写真から書き起こす」（本のページを撮るから来て、本文がまだ空のあいだだけ）。
  const photoLead = startWithPhoto && !text.trim();
  const [tags, setTags] = useState([]);
  const toggleTag = (t) => setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  // ＋ ページ・写真（最初は閉じる＝本文だけを見せる）。
  const [moreOpen, setMoreOpen] = useState(false);
  // 一度開いたら中身は残す（畳むときも高さを縮める動きで閉じるため・畳んでいる間は visibility: hidden）。
  const [moreMounted, setMoreMounted] = useState(false);
  // ページ番号を使うか: 「＋ ページ・写真」を開いて欄を見た（＝既定値を確かめた）か、自分で入れたときだけ保存する。
  // 開かずに保存したメモに直前＋1 のページが黙って付き、相談の根拠に誤ったページが載るのを防ぐ（2026-09-27）。
  const [pageUsed, setPageUsed] = useState(false);
  // 写真から書き起こした文を入れたか（保存のときに知らせる＝初日の計測 onboard_path_done の photo だけに使う）。
  const usedPhotoRef = useRef(false);
  const onPhotoText = (t) => {
    usedPhotoRef.current = true;
    setText((prev) => (prev ? `${prev}\n${t}` : t).slice(0, LIMITS.memoText));
  };
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

  // 凝縮はプランの機能（フリーミアム）。無料プランなら有料プランの画面を開く（書きかけは残る）。
  const { requirePlan } = usePaywall();
  const handleCondense = async () => {
    if (condensing) return;
    if (!requirePlan('凝縮')) return;
    const src = text.trim();
    if (src.replace(/\s/g, '').length < 60) {
      toast.info('もう少し長いメモで凝縮が活きます。');
      return;
    }
    // 🤝 はじめて AI に送るときの同意（lib/aiConsent.js）。やめたら何も変えない。
    if (!(await ensureAiConsent('condense'))) return;
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
      // 見え、連打を誘発する。必ず失敗を伝える（トークンの上限は案内・プランの案内は画面が開くので重ねない）。
      if (e?.notice) { if (!/^この AI 機能は/.test(e.message)) toast.info(e.message); }
      else toast.error(toMessage(e, '凝縮に失敗しました。少し時間をおいて再度お試しください。'));
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
    // 写真の形で開いたときは入力欄に入らない（キーボードで「写真から書き起こす」が隠れないように）。
    if (!startWithPhoto) setTimeout(() => textRef.current?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 「＋ ページ・写真」の中身は、開き終わって手が空いたら畳んだまま作っておく（押した瞬間に作ると、
  // 遅い端末では最初のコマまでに広がる動きが終わりかけて、一度に伸びて見えた）。
  useEffect(() => {
    if (moreMounted || typeof window === 'undefined') return undefined;
    const ric = window.requestIdleCallback;
    const id = ric ? ric(() => setMoreMounted(true), { timeout: 800 }) : window.setTimeout(() => setMoreMounted(true), 400);
    return () => { if (ric) window.cancelIdleCallback?.(id); else window.clearTimeout(id); };
  }, [moreMounted]);

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
    // 動きを減らす設定では待たずに閉じる（2026-09-30）。
    const wait = closeDelayMs(220); // アニメ長と一致
    if (!wait) { onClose?.(); return; }
    setClosing(true);
    setTimeout(() => onClose?.(), wait);
  };

  // 保存中(busy)は閉じない。保存途中で閉じると onCreate の成否フィードバック
  // (errorMsg) がアンマウントで消え、ユーザーに結果が届かない。
  // condensing（AI 凝縮中）も閉じさせない — backdrop/Esc で閉じると結果と下書きが
  // 破棄され AI コストだけ消費する。busy と同格のガードにする。
  // 書きかけの本文がある時は、backdrop/Esc/下スワイプのどこから閉じても
  // 一度だけ確認を挟む（誤タップ 1 回で下書きが消える事故を防ぐ）。
  // 閉じ始めたら true、閉じなかったら（保存中・「編集を続ける」）false を返す（「戻る」の積み直しに使う）。
  const requestClose = async () => {
    if (busy || condensing) return false;
    if (text.trim()) {
      const ok = await confirmDialog({
        // 新しいメモの書きかけ（ボタンの「書いたことを消す」と同じ言葉で・2026-09-29）。
        title: '書きかけのメモがあります',
        message: '消すと、元に戻せません。',
        confirmLabel: '書いたことを消す',
        cancelLabel: '編集を続ける',
        danger: true,
      });
      if (!ok) {
        // 「編集を続ける」: 書いていた場所へすぐ戻れるように本文へフォーカスを戻す（キーボードも戻る）。
        // 確認の画面が閉じてフォーカスを返し終えてから当てる。
        setTimeout(() => {
          try { textRef.current?.focus({ preventScroll: true }); } catch { /* ignore */ }
        }, 0);
        return false;
      }
    }
    animateClose();
    return true;
  };

  // 開いている間は左端スワイプで画面を戻さない。ブラウザ / Android の「戻る」はこのシートだけを閉じる
  // （空ならそのまま・書きかけがあれば確認・2026-09-29）。
  // 書きかけがあれば背景を押したときと同じ「保存していない変更があります」を出す（requestClose）。
  // overBlock: 自分の useBlockEdgeSwipe があっても「戻る」をこのシートに渡す。
  // requestClose が false（保存中・「編集を続ける」）を返したら、App は履歴を積み直してその場に留まる。
  useBlockEdgeSwipe(true);
  useBackLayer(true, () => requestClose(), { overBlock: true });

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
    const parsed = pageUsed ? parseInt(pageNumber, 10) : NaN;
    setBusy(true);
    setErrorMsg('');
    try {
      await onCreate({
        pageNumber: Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 99999) : null,
        text: trimmed,
        photoFile: null,
        tags,
        fromPhoto: usedPhotoRef.current, // 保存には使わない（呼び出し側の計測だけ）
      });
      animateClose(); // 保存後も滑って閉じる（出入りの所作を統一）
    } catch (e) {
      setErrorMsg(toSaveMessage(e, 'メモの保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const handleDetailHandoff = () => {
    if (busy) return; // 保存の在空中に引き継ぐと同内容メモが二重作成される
    const parsed = pageUsed ? parseInt(pageNumber, 10) : NaN;
    onOpenFullEditor?.({
      pageNumber: Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 99999) : null,
      text,
      tags,
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
        // 閉じている途中の印（下の知らせの位置がシートの高さを避けたまま跳ねないように・Toast.jsx）。
        data-closing={closing ? 'true' : undefined}
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
          {photoLead && (
            // 入力欄の上の全幅の副ボタン（btnGhost・アイコン 20 は .photo-lead の CSS）。部品は PhotoToTextButton のまま
            // （今月の残り回数・読み取り中・失敗の案内もこの部品が出す）。
            // 1 列のグリッド＝ボタンの下の「今月の残り N 回」（無料プラン）・読み取り中・失敗の案内との間は 8（rowGap）。
            <div className="photo-lead" style={{ display: 'grid', gridTemplateColumns: '1fr', rowGap: 'var(--space-2)' }}>
              <PhotoToTextButton style={{ ...btnGhost, width: '100%', gap: 'var(--space-2)' }} onText={onPhotoText} />
            </div>
          )}
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
                  <Sparkles size={16} aria-hidden="true" />
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

          {/* ＋ ページ・写真 — 一度開いて欄を見たときだけページ番号を保存する（開かなければページなし）。
              欄には直前＋1 を入れておく（続けて書くときの手間を省く）。
              高さ 44 の文字ボタンの上の余りを 12 だけ詰める（16 詰めると押せる範囲が本文欄に重なる）。 */}
          <div style={{ marginTop: 'calc(-1 * var(--space-3))' }}>
            <button
              type="button"
              // 押しても本文の欄からフォーカスを外さない（キーボードが閉じてシートが上下に 2 回動いていた・2026-09-29）。
              onPointerDown={(e) => { if (document.activeElement === textRef.current) e.preventDefault(); }}
              onMouseDown={(e) => { if (document.activeElement === textRef.current) e.preventDefault(); }}
              onClick={() => { setMoreMounted(true); setMoreOpen((v) => !v); setPageUsed(true); }}
              aria-expanded={moreOpen}
              aria-controls="quick-memo-more"
              style={detailLink}
            >
              {moreOpen ? <Minus size="1.1em" aria-hidden="true" /> : <Plus size="1.1em" aria-hidden="true" />}
              ページ・写真
              {!moreOpen && ((pageUsed && pageNumber !== '') || tags.length > 0) && (
                <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>
                  （{[pageUsed && pageNumber !== '' ? `p.${pageNumber}` : '', ...tags].filter(Boolean).join('・')}）
                </span>
              )}
            </button>
            {/* 開く・畳むは高さを 200ms で広げる／縮める（シートが一度に 320 伸びて跳ねていた・2026-09-29）。
                動きを減らす設定では index.css の全体の指定で一瞬になる。 */}
            <div
              id="quick-memo-more"
              style={{
                display: 'grid',
                gridTemplateRows: moreOpen ? '1fr' : '0fr',
                visibility: moreOpen ? 'visible' : 'hidden',
                transition: `grid-template-rows var(--duration-fast) var(--ease-out), visibility 0s linear ${moreOpen ? '0s' : 'var(--duration-fast)'}`,
              }}
            >
            {/* 内側に 4 の余白を足して同じだけ外へ出す（欄のフォーカスの輪が切れないように）。 */}
            <div style={{ minHeight: 0, overflow: 'hidden', padding: 'var(--space-1)', margin: 'calc(-1 * var(--space-1))' }}>
            {moreMounted && (
              // ページ番号（7 × 16 = 112・5 桁が入る幅）と「写真から書き起こす」（残りの幅いっぱい）を 1 行に。
              // その下の行（無料プランの残りの回数・読み取り中・失敗の案内）とは 8 あける（rowGap）。
              <div style={{ display: 'grid', gridTemplateColumns: 'calc(7 * var(--space-4)) 1fr', columnGap: 'var(--space-3)', rowGap: 'var(--space-2)', alignItems: 'end' }}>
                <div>
                  <label htmlFor="quick-memo-page" style={fieldLabel}>ページ番号</label>
                  <input
                    id="quick-memo-page"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99999}
                    value={pageNumber}
                    onChange={(e) => { pageTouchedRef.current = true; setPageUsed(true); setPageNumber(e.target.value); }}
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
                {/* 入力欄の上に出しているあいだは、ここには置かない（同じボタンを 2 つ並べない）。 */}
                {!photoLead && (
                  <PhotoToTextButton
                    style={{ minHeight: 48, width: '100%' }}
                    onText={onPhotoText}
                  />
                )}
              </div>
            )}
            {/* よく使うタグ（選ぶためのチップ・押すと付く／もう一度で外す）。見出し→チップ 8・チップ同士 8（DESIGN §5）。
                ページ・写真の行とは別のまとまりなので間は 24（DESIGN §1 グループの間）。
                表記は本の編集画面のタグ（TagInput）と同じ: 付ける前は「＋ タグ」、付けたら「タグ ×」（# は付けない）。 */}
            {moreMounted && frequentTags.length > 0 && (
              <div style={{ marginTop: 'var(--space-6)' }}>
                <p id="quick-memo-tags" style={fieldLabel}>タグ</p>
                <div role="group" aria-labelledby="quick-memo-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {frequentTags.map((t) => {
                    const on = tags.includes(t);
                    return (
                      <Chip key={t} size="select" active={on} aria-pressed={on} aria-label={on ? `「${t}」を外す` : `「${t}」を付ける`} onClick={() => toggleTag(t)}>
                        {!on && <Plus size="0.95em" aria-hidden="true" style={{ flexShrink: 0 }} />}
                        {t}
                        {on && <X size="0.95em" aria-hidden="true" style={{ flexShrink: 0 }} />}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            )}
            {/* 写真を添える・新しいタグを作るは全画面で（写真から書き起こすは、どちらでも同じボタン）。 */}
            {moreMounted && onOpenFullEditor && (
              <button type="button" style={{ ...detailLink, marginTop: frequentTags.length > 0 ? 'var(--space-1)' : 0 }} onClick={handleDetailHandoff}>
                写真を添える・新しいタグ（全画面で書く）<ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
            </div>
            </div>
          </div>

          {errorMsg && (
            <p role="alert" style={{ color: 'var(--error)', fontSize: 'var(--text-sub)', lineHeight: 1.5, margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(errorMsg)}</p>
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
  const scoped = scopeClass ? <div className={scopeClass} style={{ display: 'contents' }}>{sheet}</div> : sheet;
  return typeof document !== 'undefined' ? createPortal(scoped, document.body) : scoped;
}
