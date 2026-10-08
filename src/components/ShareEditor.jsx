// ✏️ 共有の画像の編集画面（2026-10-01 オーナー要望「画像を拡大して編集できた方が良さそう」）。
//
// 共有のシートのプレビューを押す（または「編集」）と、画面の幅いっぱいの大きな画像で開く全画面。
//   - 写真: 指で動かす・2 本の指で拡大（パソコンはトラックパッドのスクロールで動かす・つまむ／ctrl＋ホイールで拡大）。
//          写真は枠を必ず覆う（photoPlacement が枠の外に出さない）。2 回タップで元の置き方に戻す
//   - 言葉: 「言葉を入れる」→ 入力欄と形（明朝の引用・太いゴシック・手書き風・白抜きの帯）・大きさ・色の入れ替え。
//          画像の上の言葉は指で動かす・2 本の指で大きさを変える（sharePhrase.js）
//   - 表示する項目: 項目ごとのスイッチ（隠した項目は場所を取らずに組み直す・次の共有でも使う）
// 見えている画像＝共有する画像（同じ drawShareCard で 1080 幅に描き、CSS で縮めて見せる）。
// 指を動かしている間だけ画面の大きさで軽く描き（drawPhotoDragFrame / drawPhraseDragFrame）、離したら描き直す。
// 変えたことはその場で共有のシートに戻る（「完了」は閉じるだけ）。写真は端末の中だけで描く。
//
// シートの外（document.body）に出すので、シートの「下へ振って閉じる」には触れない（指の操作で閉じない）。
// Esc はこの画面だけを閉じる（シートまで届かせない）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Type, Contrast, X } from 'lucide-react';
import ErrorMessage from './ErrorMessage';
import ToggleSwitch from './ToggleSwitch';
import { SkeletonBlock } from './Skeleton';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBlockEdgeSwipe } from '../hooks/useEdgeSwipeBack';
import { useHaptic } from '../hooks/useHaptic';
import { toMessage } from '../lib/errors';
import {
  drawShareCard, drawPhotoDragFrame, drawPhraseDragFrame, measurePhraseBox, prepareHandFont, whenHandFontReady, HAND_FONT_FAMILY,
} from '../lib/shareCard';
import { panView, FORMATS } from '../lib/shareCardLayout';
import {
  newPhrase, clampScale, phrasePositionFrom, PHRASE_MAX, PHRASE_STYLES, PHRASE_STYLE_LABELS, PHRASE_SCALE_MIN, PHRASE_SCALE_MAX,
} from '../lib/sharePhrase';
import { btnGhost, btnLink, groupTitle, input as inputStyle } from '../styles/ui';
import { setKeyboardAccessoryBar } from '../lib/native';

// 形の見本の書体（押す前に形が分かるように、名前をその書体で書く）。
const STYLE_FONT = {
  mincho: { fontFamily: 'var(--font-read)', fontWeight: 400 },
  bold: { fontFamily: 'var(--font-ui)', fontWeight: 700 },
  hand: { fontFamily: `${HAND_FONT_FAMILY}, var(--font-read)`, fontWeight: 600 },
  band: { fontFamily: 'var(--font-ui)', fontWeight: 600 },
};

// 選ぶためのチップ（DESIGN §5・共有のシートの「どの本？」と同じ中立の選択＝--fill の面＋--border の枠）。
const styleChip = (on) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: 'var(--tap-min)',
  padding: '0 var(--space-3)',
  borderRadius: 'var(--radius)',
  border: on ? '1px solid var(--border)' : '1px solid var(--separator)',
  background: on ? 'var(--fill)' : 'transparent',
  color: on ? 'var(--text)' : 'var(--text-2)',
  fontSize: 'var(--text-sub)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

const checker = (size) => `repeating-conic-gradient(var(--share-sticker-backdrop-a) 0% 25%, var(--share-sticker-backdrop-b) 0% 50%) 50% / ${size}px ${size}px`;
const rowStyle = (last) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  minHeight: 'var(--btn-h)',
  padding: '0 var(--space-3) 0 var(--space-4)',
  borderBottom: last ? 'none' : '1px solid var(--separator)',
});

// 🧪 開発専用（お試しモード）: &share=editslow で編集画面の読み込み中、&share=editfail で描けなかったときを撮る。
const DEMO_EDIT = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true' && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('share')
  : null;

const TAP_MS = 320;
const MOVE_PX = 6;

// 描けなかったときの案内（この画面に地の選択は無い＝戻って選んでもらう）。
const EDIT_ERROR = '「完了」で戻って紙・夜を選ぶか、もう一度お試しください。';

export default function ShareEditor({
  getOpts, drawKey, ready, format, ground, canPan, photo, view, onView,
  items = [], hidden = [], onToggleItem, phrase, onPhrase, onClose,
}) {
  useBlockEdgeSwipe(true);
  const trapRef = useFocusTrap(true);
  const haptic = useHaptic();
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const inputRef = useRef(null);
  const [size, setSize] = useState(() => FORMATS[format] || FORMATS.post);
  const [box, setBox] = useState(null); // 言葉の箱（画像の座標）
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [showBox, setShowBox] = useState(false); // 言葉の箱の点線（動かしている間・入力中・キーボードで選んだとき）
  const [handOk, setHandOk] = useState(null); // 手書き風の書体: null=読み込み中 / true / false（出さない）
  const [inputFocused, setInputFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false); // 下の欄を送ったか（画像の下端の線）
  const scrollRef = useRef(null);
  // キーボードの上に見えている高さ（visualViewport）。言葉を打っている間は、画像をこの 4 割までの大きさにして、
  // 画像と入力欄をキーボードの上に一緒に見せる（2026-10-08 オーナー「テキストを入力しているときに、画面にどのように
  // 入力されているのかが見えない」）。
  const [viewH, setViewH] = useState(() => (typeof window !== 'undefined' ? (window.visualViewport?.height || window.innerHeight) : 800));
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    const on = () => setViewH(vv?.height || window.innerHeight);
    if (vv) { vv.addEventListener('resize', on); return () => vv.removeEventListener('resize', on); }
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // 打っている間は iOS の入力補助バー（∧ ∨ 完了）を出さない（その分、画像を大きく見せる・ネイティブのときだけ）。
  useEffect(() => {
    setKeyboardAccessoryBar(!inputFocused);
    return () => { if (inputFocused) setKeyboardAccessoryBar(true); };
  }, [inputFocused]);

  // ---- Esc はこの画面だけを閉じる（下のシートの Esc まで届かせない）
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose?.();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // ---- 全部を 1080 幅で描く（共有する画像と同じ）
  const fullDraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready || DEMO_EDIT === 'editslow') return;
    try {
      if (DEMO_EDIT === 'editfail') throw new Error(EDIT_ERROR);
      const opts = getOpts();
      const r = drawShareCard(canvas, opts);
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
      setBox(opts.phrase ? measurePhraseBox(opts, { W: r.width, H: r.height }) : null);
      setStatus('ready');
    } catch (e) {
      // 編集画面には地の選択が無いので、シートの案内（「紙・夜など…を選ぶ」）は「完了」で戻る案内に置き換える。
      const msg = toMessage(e, EDIT_ERROR);
      setError(msg.startsWith('紙・夜など') ? EDIT_ERROR : msg);
      setStatus('error');
    }
  }, [getOpts, ready]);
  useEffect(() => { fullDraw(); }, [drawKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 手書き風の書体（言葉の欄を開いたときに読み込む。読み込めなければ手書き風は出さない）
  const hasPhrase = !!phrase;
  useEffect(() => {
    if (!hasPhrase || handOk !== null) return undefined;
    let alive = true;
    prepareHandFont(phrase?.text || '').then((ok) => {
      if (!alive) return;
      setHandOk(!!ok);
      if (ok && phrase?.style === 'hand') fullDraw();
      // 遅い通信で間に合わなかったときは、読み込めた時点で手書き風を出す。
      if (!ok) whenHandFontReady(phrase?.text || '').then((late) => { if (alive && late) setHandOk(true); });
    });
    return () => { alive = false; };
  }, [hasPhrase]); // eslint-disable-line react-hooks/exhaustive-deps
  // 手書き風で新しい字を打ったら、その字の分を読み込んでから描き直す。
  useEffect(() => {
    if (phrase?.style !== 'hand' || !handOk) return undefined;
    let alive = true;
    const t = setTimeout(() => {
      whenHandFontReady(phrase.text).then(() => { if (alive) fullDraw(); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [phrase?.text, phrase?.style, handOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 指の操作（写真を動かす・拡大／言葉を動かす・大きさ）
  const g = useRef({ pointers: new Map(), mode: null, moved: false, pinch: null, liveView: null, livePhrase: null, liveBox: null, cache: {}, lastTap: null, raf: 0 });
  const latest = useRef({});
  latest.current = { view, phrase, box, size, getOpts, onView, onPhrase, canPan, photo, fullDraw };

  const toCard = (clientX, clientY) => {
    const c = canvasRef.current;
    const r = c?.getBoundingClientRect();
    const { size: sz } = latest.current;
    if (!r || !r.width) return { x: 0, y: 0, k: 1 };
    const k = sz.w / r.width;
    return { x: (clientX - r.left) * k, y: (clientY - r.top) * k, k };
  };
  const hitPhrase = (pt) => {
    const b = latest.current.box;
    if (!b) return false;
    const pad = 32; // 指の太さの分だけ広く掴めるように（画像の座標）
    return pt.x >= b.x0 - pad && pt.x <= b.x0 + b.w + pad && pt.y >= b.y0 - pad && pt.y <= b.y0 + b.h + pad;
  };
  const targetWidth = () => {
    const c = canvasRef.current;
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    return Math.max(570, Math.round((c?.clientWidth || 0) * dpr));
  };
  const drawFrame = () => {
    cancelAnimationFrame(g.current.raf);
    g.current.raf = requestAnimationFrame(() => {
      const c = canvasRef.current;
      const st = g.current;
      const L = latest.current;
      if (!c || !st.mode) return;
      const opts = { ...L.getOpts(), view: st.liveView || L.view, phrase: st.livePhrase || L.phrase };
      let ok = false;
      try {
        ok = st.mode === 'photo'
          ? drawPhotoDragFrame(c, opts, st.cache, { targetWidth: targetWidth() })
          : drawPhraseDragFrame(c, opts, st.cache, { targetWidth: targetWidth() });
      } catch { ok = false; }
      if (!ok) L.fullDraw();
      if (st.mode === 'phrase' && st.livePhrase) {
        const b = measurePhraseBox(opts, { W: L.size.w, H: L.size.h });
        if (b) { st.liveBox = b; setBox(b); }
      }
    });
  };
  const photoDims = () => {
    const { photo: p, size: sz } = latest.current;
    return { pw: p.width, ph: p.height, W: sz.w, H: sz.h };
  };
  const startMode = (pt) => {
    const L = latest.current;
    const st = g.current;
    st.cache = {};
    st.moved = false;
    if (L.phrase && hitPhrase(pt)) {
      st.mode = 'phrase';
      st.livePhrase = { ...L.phrase };
      setShowBox(true);
    } else if (L.canPan && L.photo) {
      st.mode = 'photo';
      st.liveView = { ...L.view };
    } else {
      st.mode = null;
    }
  };
  const onPointerDown = (e) => {
    if (status !== 'ready') return;
    const st = g.current;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: Date.now() });
    if (st.pointers.size === 1) {
      startMode(toCard(e.clientX, e.clientY));
    } else if (st.pointers.size === 2 && !st.mode) {
      // 1 本目が何も無い場所でも、2 本の指の間が言葉の上なら言葉の大きさを変える。
      const [a, b] = [...st.pointers.values()];
      const mid = toCard((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (latest.current.phrase && hitPhrase(mid)) {
        st.mode = 'phrase';
        st.livePhrase = { ...latest.current.phrase };
        st.cache = {};
        setShowBox(true);
        st.pinch = { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: st.livePhrase.scale || 1 };
        st.moved = true;
      }
    } else if (st.pointers.size === 2 && st.mode) {
      const [a, b] = [...st.pointers.values()];
      st.pinch = {
        d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        scale: st.mode === 'phrase' ? (st.livePhrase?.scale || 1) : (st.liveView?.zoom || 1),
      };
      st.moved = true;
    }
  };
  const onPointerMove = (e) => {
    const st = g.current;
    const prev = st.pointers.get(e.pointerId);
    if (!prev || !st.mode) return;
    st.pointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });
    if (!st.moved && Math.hypot(e.clientX - prev.x0, e.clientY - prev.y0) < MOVE_PX) return;
    st.moved = true;
    const L = latest.current;
    if (st.pointers.size >= 2 && st.pinch) {
      const [a, b] = [...st.pointers.values()];
      const factor = Math.hypot(a.x - b.x, a.y - b.y) / st.pinch.d;
      if (st.mode === 'phrase') st.livePhrase = { ...st.livePhrase, scale: clampScale(st.pinch.scale * factor) };
      else st.liveView = { ...st.liveView, zoom: Math.min(4, Math.max(1, st.pinch.scale * factor)) };
    } else {
      const { k } = toCard(e.clientX, e.clientY);
      const dx = (e.clientX - prev.x) * k;
      const dy = (e.clientY - prev.y) * k;
      if (st.mode === 'phrase') {
        const b = st.liveBox || L.box;
        if (b) {
          const pos = phrasePositionFrom({ cx: b.cx + dx, cy: b.cy + dy }, b, { W: L.size.w, H: L.size.h });
          st.livePhrase = { ...st.livePhrase, ...pos };
          st.liveBox = { ...b, cx: pos.x * L.size.w, cy: pos.y * L.size.h, x0: pos.x * L.size.w - b.w / 2, y0: pos.y * L.size.h - b.h / 2 };
        }
      } else {
        st.liveView = panView(st.liveView, dx, dy, photoDims());
      }
    }
    drawFrame();
  };
  const finish = () => {
    const st = g.current;
    const L = latest.current;
    cancelAnimationFrame(st.raf);
    const mode = st.mode;
    st.mode = null;
    st.pinch = null;
    if (mode === 'phrase' && st.livePhrase) {
      const next = st.livePhrase;
      st.livePhrase = null;
      st.liveBox = null;
      if (JSON.stringify(next) === JSON.stringify(L.phrase)) L.fullDraw();
      else L.onPhrase(next);
      setTimeout(() => setShowBox(false), 1200);
    } else if (mode === 'photo' && st.liveView) {
      const next = st.liveView;
      st.liveView = null;
      if (JSON.stringify(next) === JSON.stringify(L.view)) L.fullDraw();
      else L.onView(next);
    }
  };
  const onPointerUp = (e) => {
    const st = g.current;
    const p = st.pointers.get(e.pointerId);
    st.pointers.delete(e.pointerId);
    if (st.pointers.size === 1 && st.pinch) st.pinch = null; // 残った 1 本で続けて動かせる
    if (st.pointers.size > 0) return;
    const wasMoved = st.moved;
    const pt = p ? toCard(p.x, p.y) : null;
    if (wasMoved) { finish(); return; }
    // 動かさずに離した＝タップ。2 回続けたら元に戻す（言葉の上なら大きさ、ほかは写真の置き方）。
    const mode = st.mode;
    st.mode = null;
    st.livePhrase = null;
    st.liveView = null;
    if (mode === 'phrase') setTimeout(() => setShowBox(false), 1200);
    const now = Date.now();
    const last = st.lastTap;
    if (p && last && now - last.t < TAP_MS && Math.hypot(p.x - last.x, p.y - last.y) < 24) {
      st.lastTap = null;
      const L = latest.current;
      if (pt && L.phrase && hitPhrase(pt)) {
        if ((L.phrase.scale || 1) !== 1) { L.onPhrase({ ...L.phrase, scale: 1 }); haptic.light(); }
      } else if (L.canPan && (L.view.zoom !== 1 || L.view.panX || L.view.panY)) {
        L.onView({ panX: 0, panY: 0, zoom: 1 });
        haptic.light();
      }
    } else if (p) {
      st.lastTap = { t: now, x: p.x, y: p.y };
    }
  };

  // マウスのホイール・トラックパッド: ctrl（つまむ操作）で拡大、ほかは写真を動かす（写真のときだけ）。
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    let t = null;
    const onWheel = (e) => {
      const L = latest.current;
      const st = g.current;
      if (status !== 'ready' || st.pointers.size) return;
      const pt = toCard(e.clientX, e.clientY);
      const onPhrase = L.phrase && hitPhrase(pt);
      if (!e.ctrlKey && !L.canPan) return; // 写真でなければページをそのまま送る
      e.preventDefault();
      if (!st.mode) startMode(pt);
      if (!st.mode) return;
      st.moved = true;
      if (e.ctrlKey) {
        const f = Math.exp(-e.deltaY * 0.01);
        if (st.mode === 'phrase' || onPhrase) {
          if (st.mode !== 'phrase') { st.mode = 'phrase'; st.livePhrase = { ...L.phrase }; }
          st.livePhrase = { ...st.livePhrase, scale: clampScale((st.livePhrase.scale || 1) * f) };
        } else {
          st.liveView = { ...st.liveView, zoom: Math.min(4, Math.max(1, (st.liveView.zoom || 1) * f)) };
        }
      } else if (st.mode === 'photo') {
        st.liveView = panView(st.liveView, -e.deltaX * pt.k, -e.deltaY * pt.k, photoDims());
      }
      drawFrame();
      clearTimeout(t);
      t = setTimeout(() => finish(), 180);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(t); };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS の Safari・アプリの中の画面は、2 本の指で画面ごと拡大しようとする（gesturestart）。画像の上では止める
  // （touch-action: none と二重に守る）。
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const stop = (e) => e.preventDefault();
    el.addEventListener('gesturestart', stop, { passive: false });
    el.addEventListener('gesturechange', stop, { passive: false });
    return () => { el.removeEventListener('gesturestart', stop); el.removeEventListener('gesturechange', stop); };
  }, []);

  useEffect(() => () => cancelAnimationFrame(g.current.raf), []);

  // ---- 言葉の欄
  // iOS はタップの処理の中で focus しないとキーボードを開かない（setTimeout の後では開かない）。
  // flushSync で入力欄をその場で描いてから、同じタップの中で focus する。
  const addPhrase = () => {
    flushSync(() => onPhrase(newPhrase('')));
    try { inputRef.current?.focus(); } catch { /* ignore */ }
    haptic.light();
  };
  const setPhraseField = (patch) => onPhrase({ ...(phrase || newPhrase('')), ...patch });
  // キーボードで言葉を動かす（矢印＝1%・Shift＝5%）・大きさ（＋／−）。
  const onBoxKey = (e) => {
    if (!phrase) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      const [mx, my] = moves[e.key];
      const nx = (phrase.x ?? 0.5) + mx;
      const ny = (phrase.y ?? 0.3) + my;
      const pos = box ? phrasePositionFrom({ cx: nx * size.w, cy: ny * size.h }, box, { W: size.w, H: size.h }) : { x: nx, y: ny };
      onPhrase({ ...phrase, ...pos });
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault();
      onPhrase({ ...phrase, scale: clampScale((phrase.scale || 1) * (e.key === '-' ? 0.9 : 1.1)) });
    }
  };

  const aspect = `${size.w} / ${size.h}`;
  const touchable = canPan || hasPhrase;
  // 指の操作で何が動くかを分けて書く（言葉の上＝言葉、ほか＝写真）。2 回タップで元に戻すことも。
  const hint = canPan && hasPhrase
    ? ['言葉は指で、ほかは写真が動きます', '2 本の指で大きさ・2 回タップで元に戻す']
    : canPan ? ['指で写真を動かす・2 本の指で拡大', '2 回タップで元の位置に戻す']
      : hasPhrase ? ['指で言葉を動かす・2 本の指で大きさ', '2 回タップで元の大きさに戻す'] : null;
  const styles = PHRASE_STYLES.filter((s) => s !== 'hand' || handOk);
  // 色の入れ替えは意味のあるときだけ: 帯（明るい帯↔暗い帯）と、写真の上の文字（白↔黒）。
  // 紙の上の墨の文字・夜や表紙の色の上の白い文字は入れ替えると読めないので出さない。
  const pStyle = phrase?.style || 'mincho';
  const swapLabel = !phrase ? null
    : pStyle === 'band' ? (phrase.invert ? '帯を暗くする' : '帯を明るくする')
      : ground === 'photo' ? (phrase.invert ? '文字を白にする' : '文字を黒にする') : null;
  const boxVisible = !!box && (showBox || inputFocused);

  return createPortal(
    <div
      ref={trapRef}
      role="dialog"
      aria-modal="true"
      aria-label="画像を編集"
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-overlay)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-ui)', animation: 'leverage-fade-in var(--duration-fast) var(--ease-out)' }}
    >
      {/* 上の 1 行: 題名と「完了」（変えたことはその場で効く＝閉じるだけ） */}
      <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)', borderBottom: '1px solid var(--separator)', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--space-16) 1fr var(--space-16)', alignItems: 'center', minHeight: 'var(--tap-min)', padding: '0 var(--space-4)' }}>
          <span aria-hidden="true" />
          <h2 style={{ margin: 0, textAlign: 'center', fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)' }}>画像を編集</h2>
          <button type="button" onClick={onClose} style={{ justifySelf: 'end', minHeight: 'var(--tap-min)', minWidth: 'var(--tap-min)', padding: 0, background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer' }}>
            完了
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => { const s = e.currentTarget.scrollTop > 0; if (s !== scrolled) setScrolled(s); }}
        style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <div style={{ maxWidth: 480, margin: '0 auto', paddingBottom: 'calc(var(--space-8) + env(safe-area-inset-bottom, 0px))' }}>
          {/* 大きな画像（左右 16 の内側・形の比のまま・角丸 12）。下の欄を送っても上に残る（sticky）＝スイッチを
              切り替えたり言葉を打ったりしながら画像が見える。高さは画面の 48%（入力中は 30%）まで。
              上の行との間は 12。下の欄を送ったときだけ、下端に --separator の線（重なっていることが分かる）。
              線の太さぶんはいつも取って、送ったときに高さが変わらない。 */}
          <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)', padding: 'var(--space-3) var(--space-4) var(--space-2)', borderBottom: `1px solid ${scrolled ? 'var(--separator)' : 'transparent'}` }}>
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              // 言葉を打っている間は、キーボードの上に見えている高さの 4 割まで（入力欄と一緒に見える大きさ）。
              position: 'relative', width: inputFocused ? `min(100%, ${Math.round(viewH * 0.4 * size.w / size.h)}px)` : `min(100%, calc(48dvh * ${size.w} / ${size.h}))`, margin: '0 auto', aspectRatio: aspect,
              background: ground === 'sticker' ? checker(16) : 'var(--fill)',
              borderRadius: 'var(--radius)',
              touchAction: touchable ? 'none' : 'auto', userSelect: 'none', WebkitUserSelect: 'none',
              cursor: touchable ? 'grab' : 'default', overflow: 'hidden',
            }}
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label="共有する画像"
              style={{ display: 'block', width: '100%', height: '100%', visibility: status === 'ready' ? 'visible' : 'hidden' }}
            />
            {status === 'loading' && (
              <div role="status" style={{ position: 'absolute', inset: 0 }} aria-busy="true" aria-label="画像を作っています">
                <SkeletonBlock width="100%" height="100%" radius="var(--radius)" />
              </div>
            )}
            {status === 'error' && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', padding: 'var(--space-4)' }}>
                <ErrorMessage
                  className="error-message--fill"
                  title="画像を作れませんでした"
                  description={error && !error.startsWith('画像を作れませんでした') ? error : undefined}
                  actions={[{ label: 'もう一度', onClick: () => { setStatus('loading'); fullDraw(); } }]}
                />
              </div>
            )}
            {/* 言葉の箱（掴める範囲の目印・キーボードで動かす入口）。画像には入らない */}
            {box && status === 'ready' && (
              <div
                tabIndex={0}
                role="group"
                aria-label="入れた言葉（矢印キーで動かす・＋／−で大きさ）"
                onKeyDown={onBoxKey}
                onFocus={() => setShowBox(true)}
                onBlur={() => setShowBox(false)}
                style={{
                  position: 'absolute',
                  left: `${((box.x0 - 12) / size.w) * 100}%`,
                  top: `${((box.y0 - 12) / size.h) * 100}%`,
                  width: `${((box.w + 24) / size.w) * 100}%`,
                  height: `${((box.h + 24) / size.h) * 100}%`,
                  border: '1px dashed var(--on-cover)',
                  boxShadow: '0 0 0 1px var(--photo-backdrop)',
                  borderRadius: 'var(--radius)',
                  opacity: boxVisible ? 1 : 0,
                  transition: 'opacity var(--duration-fast) var(--ease-out)',
                  pointerEvents: 'none',
                  outline: 'none',
                }}
              />
            )}
          </div>
          {hint && !inputFocused && (
            <p style={{ margin: 0, padding: 'var(--space-2) 0 0', textAlign: 'center', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all' }}>
              {hint.map((h) => <span key={h} style={{ display: 'block' }}>{h}</span>)}
            </p>
          )}
          {/* 言葉の入力欄は画像のすぐ下に（上に残る画像と一緒に＝打った言葉がどう乗るかをその場で見られる・2026-10-08）。 */}
          {phrase && (
            <input
              ref={inputRef}
              type="text"
              value={phrase.text}
              maxLength={PHRASE_MAX}
              placeholder="気に入った言葉"
              aria-label="画像に入れる言葉"
              enterKeyHint="done"
              onChange={(e) => setPhraseField({ text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.blur(); }
              }}
              onFocus={() => {
                setInputFocused(true);
                // 画像と入力欄を一緒にキーボードの上に（下の欄を送っていたら先頭へ戻す）。
                try { if (scrollRef.current) scrollRef.current.scrollTop = 0; } catch { /* ignore */ }
              }}
              onBlur={() => setInputFocused(false)}
              style={{ ...inputStyle, marginTop: 'var(--space-2)' }}
            />
          )}
          </div>

          {/* 言葉 */}
          <section aria-labelledby="share-edit-phrase" style={{ padding: 'var(--space-6) var(--space-4) 0' }}>
            <h3 id="share-edit-phrase" style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>言葉</h3>
            {!phrase ? (
              <button type="button" onClick={addPhrase} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
                <Type size={20} aria-hidden="true" />
                言葉を入れる
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {/* 入力欄は画像のすぐ下（上に残る欄）に置いた。ここは形・大きさ・色。 */}
                <div role="radiogroup" aria-label="言葉の形" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-2)' }}>
                  {styles.map((s) => {
                    const on = (phrase.style || 'mincho') === s;
                    return (
                      <button key={s} type="button" role="radio" aria-checked={on} onClick={() => { setPhraseField({ style: s }); haptic.light(); }} style={{ ...styleChip(on), ...STYLE_FONT[s] }}>
                        {PHRASE_STYLE_LABELS[s]}
                      </button>
                    );
                  })}
                  {handOk === null && <SkeletonBlock width="100%" height="var(--tap-min)" radius="var(--radius)" />}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 'var(--tap-min)' }}>
                  <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', flexShrink: 0 }}>大きさ</span>
                  <input
                    type="range"
                    min={PHRASE_SCALE_MIN}
                    max={PHRASE_SCALE_MAX}
                    step={0.05}
                    value={phrase.scale || 1}
                    onChange={(e) => setPhraseField({ scale: clampScale(e.target.value) })}
                    aria-label="言葉の大きさ"
                    style={{ flex: 1, minHeight: 'var(--tap-min)', accentColor: 'var(--accent)' }}
                  />
                </label>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: swapLabel ? 'space-between' : 'flex-end', marginLeft: 'calc(-1 * var(--space-1))', marginRight: 'calc(-1 * var(--space-1))' }}>
                  {swapLabel && (
                    <button type="button" onClick={() => { setPhraseField({ invert: !phrase.invert }); haptic.light(); }} style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <Contrast size={18} aria-hidden="true" />
                      {swapLabel}
                    </button>
                  )}
                  <button type="button" onClick={() => { onPhrase(null); haptic.light(); }} style={{ ...btnLink, color: 'var(--error)', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <X size={18} aria-hidden="true" />
                    言葉を外す
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* 表示する項目 */}
          {items.length > 0 && (
            <section aria-labelledby="share-edit-items" style={{ padding: 'var(--space-6) var(--space-4) 0' }}>
              <h3 id="share-edit-items" style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>表示する項目</h3>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                {items.map((it, i) => {
                  const on = !hidden.includes(it.key);
                  return (
                    <div key={it.key} style={rowStyle(i === items.length - 1)}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-body)', color: 'var(--text)' }}>{it.label}</span>
                      <ToggleSwitch checked={on} onChange={() => { onToggleItem(it.key); haptic.light(); }} ariaLabel={it.label} />
                    </div>
                  );
                })}
              </div>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>
                選んだ項目は、次に共有するときも使います。
              </p>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
