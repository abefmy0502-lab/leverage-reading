// 📤 一文をシェア — 「この本の一文」を 1 枚の画像にして、端末の共有シートへ。
//
// 開いた時点で、いちばん上の候補（ページつきのメモ → 新しい順・メモの「…」から開いたらそのメモ）を
// ストーリー 9:16・紙 で描き終えておく＝そのまま「シェアする」を押すだけ（ワンタップ）。
// 変えたいときだけ:
//   地   … 写真（自分の写真を選ぶ・指で動かす／2 本指で拡大）/ 紙 / 夜 / 表紙の色 / 透明（ステッカー）
//   形   … ストーリー 9:16 / 投稿 4:5 / 正方形 1:1（透明は中身に合わせた大きさなので出さない）
//   文字の位置 … 上 / 中央 / 下（写真のときだけ）
//   どの一文にする？
// 画像に入るのは、選んだ一文・書名・著者・ページ・表紙・Orime のロゴと URL だけ（数字や日付は入れない）。
// プレビューが、外に出る画像そのもの。写真は端末の中だけで描く（どこにも送らない）。
// 選んだ地・形・文字の位置は、アプリを開いている間だけ覚える（次にシートを開いたときも同じ）。
//
// props:
//   book         … { id, title, author, cover, totalPages }（必須）
//   memos        … この本のメモ（無ければこのシートで読み込む）
//   initialMemoId… 先に選んでおくメモ（メモの「…」→「この一文をシェア」）
//   onWriteMemo  … メモが無いときの「メモを書く」
//   onClose

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Quote, ImagePlus, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd } from 'lucide-react';
import BottomSheet from './BottomSheet';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { useBookMemos } from '../hooks/useBookMemos';
import { toMessage } from '../lib/errors';
import { validateImageFile, MAX_IMAGE_BYTES } from '../lib/limits';
import { track, EVENTS } from '../lib/analytics';
import { SITE_URL } from '../lib/legalLinks';
import {
  drawShareCard, canvasToBlob, prepareCover, prepareFonts, prepareLogo, loadPhotoFile, readShareTheme,
} from '../lib/shareCard';
import {
  orderLineCandidates, buildShareText, shareFilename, FORMATS, panView, zoomView, clampLine,
} from '../lib/shareCardLayout';
import { shareImage, saveImage } from '../lib/shareImage';
import { btnPrimary, btnPrimaryOff, btnLink, groupTitle } from '../styles/ui';

const FORMAT_OPTIONS = [
  { v: 'story', label: 'ストーリー' },
  { v: 'post', label: '投稿' },
  { v: 'square', label: '正方形' },
];
const STYLE_LABELS = { photo: '写真', paper: '紙', night: '夜', cover: '表紙の色', sticker: '透明' };
const POS_OPTIONS = [
  { v: 'top', label: '文字を上に', Icon: AlignVerticalJustifyStart },
  { v: 'center', label: '文字を中央に', Icon: AlignVerticalJustifyCenter },
  { v: 'bottom', label: '文字を下に', Icon: AlignVerticalJustifyEnd },
];

// 🧪 開発専用（お試しモード）: &share=slow で画像を作っている途中、&share=fail で作れなかったときの表示を撮る。
// 本番は import.meta.env.DEV=false で常に null。
const DEMO_SHARE = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true' && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('share')
  : null;

// アプリを開いている間だけ覚える（写真そのものは覚えない）。
const session = { style: 'paper', format: 'story', textPos: 'bottom' };

// プレビューの高さ（シートが 1 画面に収まるように・形が変わっても高さは同じ）。
const PREVIEW_H = 'min(40vh, 340px)';

// 形の切り替えは、振り返り・相談のサブタブ（.sub-tab）と同じ見た目（選択中は --accent-soft の面）。
const segBtn = (on) => ({
  minHeight: 44,
  padding: '0 var(--space-2)',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: on ? 'var(--accent-soft)' : 'transparent',
  color: on ? 'var(--accent)' : 'var(--text-2)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: on ? 600 : 400,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});
// 地の見本（押せる範囲 44・見た目は 28 の円＝「形そのもの」DESIGN §4 の例外）。
const swatchBtn = {
  width: 44,
  height: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 'var(--radius-full)',
  flexShrink: 0,
};
const ring = (on) => (on ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : 'inset 0 0 0 1px var(--border)');
const swatchDot = (bg, on) => ({ width: 28, height: 28, borderRadius: 'var(--radius-full)', background: bg, boxShadow: ring(on) });
// 透明の見本・プレビューの地（暗い市松＝白い文字が見える。画像には入らない）。
const checker = (size) => `repeating-conic-gradient(var(--share-sticker-backdrop-a) 0% 25%, var(--share-sticker-backdrop-b) 0% 50%) 50% / ${size}px ${size}px`;
// 「写真を選ぶ」のチップ（押すとすぐ写真を選べる）。
const photoChip = (on) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 44,
  padding: '0 var(--space-3) 0 var(--space-2)',
  borderRadius: 'var(--radius)',
  border: on ? '1px solid var(--accent)' : '1px solid transparent',
  background: on ? 'var(--accent-soft)' : 'var(--fill)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
});
const iconBtn = (on) => ({
  ...swatchBtn,
  borderRadius: 'var(--radius)',
  background: on ? 'var(--accent-soft)' : 'transparent',
  color: on ? 'var(--accent)' : 'var(--text-2)',
});

// ページの無いメモは、書いた日で見分ける。
function memoDate(m) {
  const d = new Date(m.createdAt || m.created_at || '');
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日のメモ`;
}

const pickCard = (on) => ({
  flex: '0 0 auto',
  width: 220,
  textAlign: 'left',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius)',
  border: on ? '1px solid var(--accent)' : '1px solid var(--separator)',
  background: on ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  scrollSnapAlign: 'start',
});

// HEIC は端末（iOS の Safari）が JPEG に直して渡すことが多いが、そのまま来たときも読めれば使う。
function checkPhoto(file) {
  if (!file) return 'no-file';
  const heic = /image\/hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  if (heic) return file.size > MAX_IMAGE_BYTES ? '画像が大きすぎます。1 枚あたり 10 MB 以下にしてください。' : null;
  return validateImageFile(file);
}

export default function ShareSheet({ book, memos: memosProp, initialMemoId = null, onWriteMemo, onClose }) {
  const toast = useToast();
  const haptic = useHaptic();
  // メモを渡されなかったとき（本棚の長押しから開いたなど）だけ、ここで読み込む。
  const loaded = useBookMemos(memosProp ? null : book?.id);
  const memos = memosProp || loaded.memos;
  const memosLoading = !memosProp && loaded.loading;

  const candidates = useMemo(() => orderLineCandidates(memos, initialMemoId), [memos, initialMemoId]);
  const [memoId, setMemoId] = useState(initialMemoId);
  const chosen = candidates.find((m) => m.id === memoId) || candidates[0] || null;
  const knownMaxPage = useMemo(
    () => (memos || []).reduce((mx, m) => (Number.isFinite(m.pageNumber) ? Math.max(mx, m.pageNumber) : mx), 0),
    [memos],
  );

  const [format, setFormatState] = useState(session.format);
  const [style, setStyleState] = useState(session.style === 'photo' ? 'paper' : session.style);
  const [textPos, setTextPosState] = useState(session.textPos);
  const setFormat = (v) => { session.format = v; setFormatState(v); };
  const setStyle = (v) => { session.style = v; setStyleState(v); };
  const setTextPos = (v) => { session.textPos = v; setTextPosState(v); };

  const [photo, setPhoto] = useState(null); // { source, width, height, thumb }
  const [view, setView] = useState({ panX: 0, panY: 0, zoom: 1 });
  const viewRef = useRef(view);
  const [assets, setAssets] = useState(null); // { cover, fonts, logo }
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dims, setDims] = useState(FORMATS.story);
  const [card, setCard] = useState(null); // { blob, key, line }
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false); // 写真を動かしている間（画像が古いのでシェアは押せない）
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const keyRef = useRef('');
  const blobTimer = useRef(null);
  const rafRef = useRef(0);

  // 表紙・書体・ロゴを 1 回だけ準備する（外部の表紙は自前の中継を通す・読めなければ代用表紙）。
  useEffect(() => {
    let alive = true;
    if (DEMO_SHARE === 'slow') return () => { alive = false; };
    const sample = `${book?.title || ''}${book?.author || ''}${(memos || []).map((m) => m.text || '').join('').slice(0, 1500)}`;
    Promise.all([
      prepareCover(book).catch(() => ({ image: null, tone: null })),
      prepareFonts(sample),
      prepareLogo(),
    ]).then(([cover, fonts, logo]) => { if (alive) setAssets({ cover, fonts, logo }); });
    return () => { alive = false; };
  }, [book?.cover, memos?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const effStyle = style === 'photo' && !photo ? 'paper' : style;
  const drawKey = chosen && assets
    ? JSON.stringify([chosen.id, chosen.text, chosen.pageNumber, effStyle, format, textPos, photo?.width, photo?.height, view, book?.title, book?.author, retry])
    : '';

  // canvas に描く（同期）。失敗は ErrorMessage へ。
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chosen || !assets) return false;
    try {
      if (DEMO_SHARE === 'fail') throw new Error('この端末では画像を作れませんでした。');
      const r = drawShareCard(canvas, {
        line: chosen.text,
        page: Number.isFinite(chosen.pageNumber) ? chosen.pageNumber : null,
        title: book?.title || '',
        author: book?.author || '',
        totalPages: book?.totalPages,
        knownMaxPage,
        seedKey: chosen.id,
        cover: assets.cover,
        fonts: assets.fonts,
        logo: assets.logo,
        style: effStyle,
        format,
        photo,
        view: viewRef.current,
        textPos,
      });
      setDims((d) => (d.w === r.width && d.h === r.height ? d : { w: r.width, h: r.height }));
      setStatus('ready');
      return true;
    } catch (e) {
      console.error('share card draw error', e);
      setError(toMessage(e, '画像を作れませんでした。'));
      setStatus('error');
      return false;
    }
  }, [chosen, assets, book?.title, book?.author, book?.totalPages, knownMaxPage, effStyle, format, photo, textPos]);

  // 描いたものを PNG にしておく（シェアを押した瞬間に共有シートを開けるように）。
  const scheduleBlob = useCallback((key) => {
    keyRef.current = key;
    clearTimeout(blobTimer.current);
    blobTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvasToBlob(canvas)
        .then((blob) => {
          if (keyRef.current !== key) return;
          setCard({ blob, key });
        })
        .catch((e) => {
          if (keyRef.current !== key) return;
          setError(toMessage(e, '画像を作れませんでした。'));
          setStatus('error');
        });
    }, 180);
  }, []);

  useEffect(() => {
    if (!drawKey) return;
    viewRef.current = view;
    if (draw()) scheduleBlob(drawKey);
  }, [drawKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearTimeout(blobTimer.current); cancelAnimationFrame(rafRef.current); }, []);

  // ---- 写真を指で動かす・拡大する（写真のときだけ）
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const canPan = effStyle === 'photo' && !!photo;
  const redrawSoon = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => draw());
  };
  const dimsForPan = () => ({ pw: photo.width, ph: photo.height, W: FORMATS[format].w, H: FORMATS[format].h });
  const cssToCard = () => {
    const c = canvasRef.current;
    return c && c.clientWidth ? c.width / c.clientWidth : 1;
  };
  const onPointerDown = (e) => {
    if (!canPan) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), zoom: viewRef.current.zoom || 1 };
    }
  };
  const onPointerMove = (e) => {
    if (!canPan || !pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!dragging) setDragging(true);
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = (gesture.current.zoom * d) / Math.max(1, gesture.current.pinch);
      viewRef.current = zoomView(viewRef.current, target / (viewRef.current.zoom || 1));
    } else {
      const k = cssToCard();
      viewRef.current = panView(viewRef.current, (e.clientX - prev.x) * k, (e.clientY - prev.y) * k, dimsForPan());
    }
    redrawSoon();
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0 && dragging) {
      setDragging(false);
      setView({ ...viewRef.current });
    }
  };
  // マウスのホイール・トラックパッドで拡大（ページはスクロールさせない）。
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !canPan) return undefined;
    let t = null;
    const onWheel = (e) => {
      e.preventDefault();
      viewRef.current = zoomView(viewRef.current, Math.exp(-e.deltaY * 0.002));
      setDragging(true);
      redrawSoon();
      clearTimeout(t);
      t = setTimeout(() => { setDragging(false); setView({ ...viewRef.current }); }, 160);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => { c.removeEventListener('wheel', onWheel); clearTimeout(t); };
  }, [canPan, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 写真を選ぶ
  const openPicker = () => { try { fileRef.current?.click(); } catch { /* ignore */ } };
  const onPhotoPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じ写真をもう一度選べるように
    if (!file) return;
    const err = checkPhoto(file);
    if (err) { toast.error(err); return; }
    try {
      const p = await loadPhotoFile(file);
      let thumb = '';
      try {
        const t = document.createElement('canvas');
        t.width = 56; t.height = 56;
        const s = Math.max(56 / p.width, 56 / p.height);
        t.getContext('2d').drawImage(p.source, (56 - p.width * s) / 2, (56 - p.height * s) / 2, p.width * s, p.height * s);
        thumb = t.toDataURL('image/jpeg', 0.7);
      } catch { /* 見本の小さな写真が作れなくても使える */ }
      setPhoto({ ...p, thumb });
      const v = { panX: 0, panY: 0, zoom: 1 };
      viewRef.current = v;
      setView(v);
      setStyle('photo');
      haptic.light();
    } catch (e2) {
      toast.error(toMessage(e2, 'この写真は読み込めませんでした。'));
    }
  };

  const ready = status === 'ready' && !!card && card.key === drawKey && !busy && !dragging;
  const filename = shareFilename({ format: effStyle === 'sticker' ? 'sticker' : format, style: effStyle });
  const lineForText = chosen ? chosen.text : '';

  const handleShare = async () => {
    if (!ready) return;
    haptic.light();
    setBusy(true);
    try {
      // 共有の文は、画像に入れた一文と同じ（120 字まで）。await を挟まずに共有シートを開く。
      const text = buildShareText({ title: book?.title, line: clampLine(lineForText).text, siteUrl: SITE_URL });
      const result = await shareImage({ blob: card.blob, filename, text });
      if (result !== 'cancelled') track(EVENTS.SHARE_CARD, { kind: 'line', style: effStyle, format: effStyle === 'sticker' ? 'sticker' : format, via: result });
      if (result === 'saved') toast.info('この端末では共有できないため、画像を保存しました。');
    } catch (e) {
      toast.error(toMessage(e, 'シェアできませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const result = await saveImage({ blob: card.blob, filename });
      if (result !== 'cancelled') track(EVENTS.SHARE_CARD, { kind: 'line', style: effStyle, format: effStyle === 'sticker' ? 'sticker' : format, via: 'saved' });
      if (result === 'saved') { haptic.success(); toast.success('画像を保存しました。'); }
    } catch (e) {
      toast.error(toMessage(e, '保存できませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  // 地の見本の色（表紙の色は、そのときの表紙から作った色）。
  const swatchColor = (v) => {
    try { return readShareTheme(v, { tone: assets?.cover?.tone, title: book?.title }).bg || 'var(--fill)'; } catch { return 'var(--fill)'; }
  };

  const noLine = !memosLoading && candidates.length === 0;
  const aspect = `${dims.w} / ${dims.h}`;

  const footer = noLine ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <button
        type="button"
        onClick={handleSave}
        disabled={!ready}
        // 文字の端をシートの余白 16 に揃える（btnLink の左右 4 を負の余白で打ち消す）。
        style={{ ...btnLink, marginLeft: 'calc(-1 * var(--space-1))', color: ready ? 'var(--accent)' : 'var(--text-3)', opacity: 1, cursor: ready ? 'pointer' : 'default', flexShrink: 0 }}
      >
        画像を保存
      </button>
      <button type="button" onClick={handleShare} disabled={!ready} aria-busy={busy || !ready} style={{ ...(ready ? btnPrimary : btnPrimaryOff), flex: 1 }}>
        シェアする
      </button>
    </div>
  );

  return (
    <BottomSheet title="一文をシェア" onClose={onClose} footer={footer} dismissLabel="キャンセル">
      <input ref={fileRef} type="file" accept="image/*" onChange={onPhotoPicked} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />

      {memosLoading && (
        <div style={{ display: 'flex', justifyContent: 'center' }} aria-busy="true" aria-label="読み込み中">
          <SkeletonBlock width={`calc(${PREVIEW_H} * 9 / 16)`} height={PREVIEW_H} radius="var(--radius)" />
        </div>
      )}

      {noLine && (
        <EmptyState
          icon={<Quote size={34} aria-hidden="true" />}
          title="シェアしたい一文をメモに残しましょう"
          actions={onWriteMemo ? [{ label: 'メモを書く', onClick: onWriteMemo, variant: 'secondary' }] : []}
        />
      )}

      {!memosLoading && chosen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* プレビュー＝外に出る画像そのもの（写真のときは指で動かせる） */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
            <div
              style={{
                position: 'relative', height: PREVIEW_H, aspectRatio: aspect, maxWidth: '100%',
                borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--separator)',
                background: effStyle === 'sticker' ? checker(16) : 'var(--fill)',
              }}
            >
              <canvas
                ref={canvasRef}
                role="img"
                aria-label={`『${book?.title || ''}』の一文の画像（${STYLE_LABELS[effStyle]}${effStyle === 'sticker' ? '' : `・${FORMAT_OPTIONS.find((o) => o.v === format)?.label}`}）`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  display: 'block', width: '100%', height: '100%',
                  visibility: status === 'ready' ? 'visible' : 'hidden',
                  touchAction: canPan ? 'none' : 'auto',
                  cursor: canPan ? 'grab' : 'default',
                }}
              />
              {status === 'loading' && (
                <div style={{ position: 'absolute', inset: 0 }} aria-busy="true" aria-label="画像を作っています">
                  <SkeletonBlock width="100%" height="100%" radius="var(--radius)" />
                </div>
              )}
              {status === 'error' && (
                <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', alignItems: 'center', background: 'var(--surface)' }}>
                  <ErrorMessage
                    title="画像を作れませんでした"
                    description={error}
                    actions={[{ label: 'もう一度', onClick: () => { setStatus('loading'); setRetry((n) => n + 1); } }]}
                  />
                </div>
              )}
            </div>
            {canPan && (
              <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>指で動かす・2 本の指で拡大</p>
            )}
          </div>

          {/* 地（写真を選ぶ・紙・夜・表紙の色・透明） */}
          <div role="radiogroup" aria-label="地" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
            <button
              type="button"
              role="radio"
              aria-checked={effStyle === 'photo'}
              aria-label={photo ? (effStyle === 'photo' ? '写真を選び直す' : '写真') : '写真を選ぶ'}
              onClick={() => { if (!photo || effStyle === 'photo') openPicker(); else setStyle('photo'); }}
              style={{ ...photoChip(effStyle === 'photo'), marginRight: 'var(--space-2)' }}
            >
              {photo?.thumb
                ? <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 'var(--radius-full)', background: `center / cover no-repeat url(${photo.thumb})`, flexShrink: 0 }} />
                : <ImagePlus size={20} aria-hidden="true" style={{ color: 'var(--text-2)' }} />}
              {photo ? '写真' : '写真を選ぶ'}
            </button>
            {['paper', 'night', 'cover', 'sticker'].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={effStyle === v} aria-label={STYLE_LABELS[v]} title={STYLE_LABELS[v]} onClick={() => setStyle(v)} style={swatchBtn}>
                <span aria-hidden="true" style={swatchDot(v === 'sticker' ? checker(8) : swatchColor(v), effStyle === v)} />
              </button>
            ))}
          </div>

          {/* 形（透明は中身に合わせた大きさなので出さない）と、写真のときの文字の位置 */}
          {effStyle !== 'sticker' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'calc(-1 * var(--space-3))' }}>
              <div role="radiogroup" aria-label="画像の形" style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                {FORMAT_OPTIONS.map((o) => (
                  <button key={o.v} type="button" role="radio" aria-checked={format === o.v} onClick={() => setFormat(o.v)} style={segBtn(format === o.v)}>
                    {o.label}
                  </button>
                ))}
              </div>
              {effStyle === 'photo' && (
                <div role="radiogroup" aria-label="文字の位置" style={{ display: 'inline-flex', gap: 0 }}>
                  {POS_OPTIONS.map(({ v, label, Icon }) => (
                    <button key={v} type="button" role="radio" aria-checked={textPos === v} aria-label={label} title={label} onClick={() => setTextPos(v)} style={iconBtn(textPos === v)}>
                      <Icon size={20} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* どの一文にする？（候補が 2 つ以上のときだけ） */}
          {candidates.length > 1 && (
            <section aria-labelledby="share-pick-title">
              <h4 id="share-pick-title" style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>どの一文にする？</h4>
              <div
                role="radiogroup"
                aria-labelledby="share-pick-title"
                style={{ display: 'flex', gap: 'var(--space-3)', overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 calc(-1 * var(--space-4))', padding: '0 var(--space-4)', scrollPaddingLeft: 'var(--space-4)', WebkitOverflowScrolling: 'touch' }}
              >
                {candidates.map((m) => {
                  const on = m.id === chosen.id;
                  return (
                    <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => setMemoId(m.id)} style={pickCard(on)}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                        {m.text}
                      </span>
                      <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>
                        {Number.isFinite(m.pageNumber) ? `p.${m.pageNumber}` : memoDate(m)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
