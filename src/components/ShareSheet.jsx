// 📷 写真で共有 — Strava のように、撮った写真の上に読書の記録（と一文）を重ねて、1 タップで共有する。
// （旧「一文をシェア」も同じシート。メモの「…」から開くと、その一文を選んだ「一文」の見せ方で開く。）
//
// 開いた時点で、いちばんよい 1 枚を描き終えておく＝そのまま「共有する」を押すだけ:
//   写真あり（カメラの入口）… 写真＋記録（書名・著者・読了日／メモの件数／実行した行動）＋いちばん新しいメモの一文
//   メモから                … 紙＋その一文
// 変えたいときだけ:
//   どの本？（ホームから開いたとき）… 今月／読書中・読了の本を 1 タップで切り替え
//   別の一文                         … 1 タップで次のメモへ（記録では「一文を外す」も）
//   見せ方                           … 記録／一文（小さな見本を並べる）
//   形                               … 投稿 4:5 ／ ストーリー 9:16（どちらも SNS で切られない範囲に文字を置く）
//   地                               … 写真（撮り直す・選ぶ）／紙／夜／表紙の色／透明（ステッカー）
// 画像に入るのは、本人が画面で見ている情報だけ（書名・著者・日付・件数・一文・Orime のロゴ）。
// 写真は端末の中だけで描く（どこにも送らない・アップロードしない）。
// 選んだ地・形は、アプリを開いている間だけ覚える（写真そのものは覚えない）。
//
// props:
//   book            … 開いた本 { id, title, author, cover, totalPages, status, doneDate, startDate, actions, leverageMemo }
//   books           … 本棚の本（ホームから開いたとき＝「どの本？」の切り替えと今月の数字に使う）
//   memos           … book のメモ（無ければこのシートで読み込む）
//   initialMemoId   … 先に選んでおくメモ（メモの「…」→「この一文をシェア」）
//   initialPhotoFile… カメラで撮った写真（ホーム・本の詳細・読了の入口）
//   initialSubject  … { kind: 'book', bookId } | { kind: 'month' }（省略時は book、無ければ pickShareSubject）
//   from            … 計測用の入口の名前（home / detail / done / memo / menu）
//   onClose

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Shuffle, CalendarDays, ChevronDown, Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import ContextMenu from './ContextMenu';
import { SkeletonBlock } from './Skeleton';
import { MiniCover } from './BookCards';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { useBookMemos } from '../hooks/useBookMemos';
import { useAuth } from '../hooks/useAuth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { toMessage } from '../lib/errors';
import { validateImageFile, MAX_IMAGE_BYTES } from '../lib/limits';
import { track, EVENTS } from '../lib/analytics';
import { SITE_URL } from '../lib/legalLinks';
import {
  drawShareCard, drawPhotoDragFrame, canvasToBlob, prepareCover, prepareFonts, prepareLogo, loadPhotoFile, readShareTheme,
} from '../lib/shareCard';
import { buildShareText, shareFilename, FORMATS, panView, zoomView } from '../lib/shareCardLayout';
import {
  pickShareSubject, subjectChoices, bookRecord, monthRecord, orderQuoteCandidates, quoteText,
  swapQuote, swapQuoteLabel, availableVariants, buildRecordShareText, fmtStamp,
} from '../lib/shareOverlay';
import { shareImage, saveImage } from '../lib/shareImage';
import { btnPrimary, btnPrimaryOff, btnLink } from '../styles/ui';

const FORMAT_OPTIONS = [
  { v: 'post', label: '投稿', aria: '投稿（4:5）' },
  { v: 'story', label: 'ストーリー', aria: 'ストーリー（9:16）' },
];
const VARIANT_LABELS = { record: '記録', quote: '一文' };
const STYLE_LABELS = { photo: '写真', paper: '紙', night: '夜', cover: '表紙の色', sticker: '透明' };
const BG_OPTIONS = ['paper', 'night', 'cover', 'sticker'];

// 🧪 開発専用（お試しモード）: &share=slow で画像を作っている途中、&share=fail で作れなかったときの表示を撮る。
// 本番は import.meta.env.DEV=false で常に null。
const DEMO_SHARE = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true' && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('share')
  : null;

// アプリを開いている間だけ覚える（写真そのものは覚えない）。
const session = { style: 'paper', format: 'post' };

// プレビューの高さ（シートが 1 画面に収まるように・形が変わっても高さは同じ）。
const PREVIEW_H = 'min(28vh, 248px)';
// 見せ方の見本の高さ（幅は形に合わせる）。
const THUMB_H = 64;

// 選んでいる状態は中立の見た目（DESIGN §3-1 の --fill＝選択中の面・--text の輪）。栗色は主ボタンと文字ボタンだけに
// 残し、「共有する」がいちばん目立つようにする（2026-09-30 ui-critic）。
const SELECTED_RING = '0 0 0 2px var(--surface), 0 0 0 4px var(--text)';
// 形の切り替え（投稿／ストーリー）。太さは 600 のまま変えない（選ぶたびに幅が変わって跳ねない）。
const segBtn = (on) => ({
  minHeight: 44,
  padding: '0 var(--space-3)',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: on ? 'var(--fill)' : 'transparent',
  color: on ? 'var(--text)' : 'var(--text-2)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});
// 背景の見本（幅 64 でそろえる＝名前の長さで間が変わらない・見た目は 28 の円＝「形そのもの」DESIGN §4 の例外）。
const swatchLabeledBtn = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
  width: 64,
  minHeight: 44,
  padding: 'var(--space-1) 0',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 'var(--radius)',
  fontFamily: 'inherit',
  flexShrink: 0,
};
const swatchLabel = (on) => ({ fontSize: 'var(--text-meta)', lineHeight: 1.2, fontWeight: on ? 600 : 400, color: on ? 'var(--text)' : 'var(--text-2)', whiteSpace: 'nowrap' });
const ring = (on) => (on ? SELECTED_RING : 'inset 0 0 0 1px var(--border)');
const swatchDot = (bg, on) => ({ width: 28, height: 28, borderRadius: 'var(--radius-full)', background: bg, boxShadow: ring(on) });
// 透明の見本・プレビューの地（暗い市松＝白い文字が見える。画像には入らない）。
const checker = (size) => `repeating-conic-gradient(var(--share-sticker-backdrop-a) 0% 25%, var(--share-sticker-backdrop-b) 0% 50%) 50% / ${size}px ${size}px`;
// 「写真を選ぶ」のチップ（写真が無いときだけ出る・押すとすぐ写真を選べる＝操作のチップ DESIGN §5）。
const photoChip = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  minHeight: 44,
  padding: '0 var(--space-3) 0 var(--space-2)',
  borderRadius: 'var(--radius)',
  border: 'none',
  background: 'var(--fill)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};
// 「どの本？」のチップ（選ぶためのチップ 44）。選んでいる本は --fill の面＋--border の枠＋--text。
// 太さは変えない（横に送る列の幅が跳ねない）。
const subjectChip = (on) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  flexShrink: 0,
  minHeight: 44,
  maxWidth: 200,
  padding: 'var(--space-1) var(--space-3) var(--space-1) var(--space-1)',
  borderRadius: 'var(--radius)',
  border: on ? '1px solid var(--border)' : '1px solid var(--separator)',
  background: on ? 'var(--fill)' : 'transparent',
  color: on ? 'var(--text)' : 'var(--text-2)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: 400,
  cursor: 'pointer',
  scrollSnapAlign: 'start',
});
// 見せ方の見本（押せる範囲は見本＋名前・選んでいるものは --text の輪）。
const thumbBtn = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-1)',
  padding: 'var(--space-1)',
  minWidth: 44,
  border: 'none',
  background: 'transparent',
  borderRadius: 'var(--radius)',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

// HEIC は端末（iOS の Safari）が JPEG に直して渡すことが多いが、そのまま来たときも読めれば使う。
function checkPhoto(file) {
  if (!file) return 'no-file';
  const heic = /image\/hei[cf]/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  if (heic) return file.size > MAX_IMAGE_BYTES ? '画像が大きすぎます。1 枚あたり 10 MB 以下にしてください。' : null;
  return validateImageFile(file);
}

function monthStartIso(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// 今月書いたメモ（今月の数字と一文の候補）。「今月」を選んだときだけ読む。アプリを開いている間は覚えておく。
const monthMemoCache = new Map();
function useMonthMemos(enabled) {
  const { user } = useAuth();
  const key = `${user?.id || ''}|${monthStartIso()}`;
  const [state, setState] = useState(() => monthMemoCache.get(key) || { memos: [], loading: !!enabled });
  useEffect(() => {
    if (!enabled) return undefined;
    const hit = monthMemoCache.get(key);
    if (hit) { setState(hit); return undefined; }
    if (!isSupabaseConfigured || !user?.id) { setState({ memos: [], loading: false }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const { data, error } = await supabase
        .from('book_memos')
        .select('id, text, book_id, page_number, photo_path, created_at')
        .eq('user_id', user.id)
        .gte('created_at', monthStartIso())
        .order('created_at', { ascending: false })
        .limit(500);
      if (!alive) return;
      const memos = error ? [] : (data || []).map((m) => ({
        id: m.id, text: m.text || '', bookId: m.book_id, pageNumber: m.page_number ?? null, photoPath: m.photo_path || null, createdAt: m.created_at,
      }));
      const next = { memos, loading: false };
      if (!error) monthMemoCache.set(key, next);
      setState(next);
    })();
    return () => { alive = false; };
  }, [enabled, key, user?.id]);
  return state;
}

export default function ShareSheet({
  book: bookProp = null,
  books = null,
  memos: memosProp,
  initialMemoId = null,
  initialPhotoFile = null,
  initialSubject = null,
  from = 'menu',
  onClose,
}) {
  const toast = useToast();
  const haptic = useHaptic();
  const now = useMemo(() => new Date(), []);

  // ---- どの本？（本 1 冊 か 今月）
  const [subject, setSubject] = useState(() => initialSubject || (bookProp ? { kind: 'book', bookId: bookProp.id } : pickShareSubject(books)));
  const choices = useMemo(
    () => (books ? subjectChoices(books, { selectedId: subject.kind === 'book' ? subject.bookId : null }) : []),
    [books, subject],
  );
  const showSwitcher = choices.length > 1;
  const subjectBook = subject.kind === 'book'
    ? ((bookProp && bookProp.id === subject.bookId) ? bookProp : (books || []).find((b) => b.id === subject.bookId) || null)
    : null;
  const isMonth = subject.kind === 'month' || !subjectBook;

  // メモ: 開いた本のメモを渡されたらそれを使い、ほかの本はここで読む。今月は今月のメモを読む。
  const usePropMemos = !!memosProp && !!subjectBook && !!bookProp && subjectBook.id === bookProp.id;
  const loaded = useBookMemos(!usePropMemos && subjectBook ? subjectBook.id : null);
  const month = useMonthMemos(isMonth);
  const memos = isMonth ? month.memos : (usePropMemos ? memosProp : loaded.memos);
  const memosLoading = isMonth ? month.loading : (!usePropMemos && loaded.loading);

  const record = useMemo(
    () => (isMonth ? monthRecord(books || [], month.memos, now) : bookRecord(subjectBook, memos, now)),
    [isMonth, books, month.memos, subjectBook, memos, now],
  );
  const candidates = useMemo(() => orderQuoteCandidates(memos, { preferId: initialMemoId }), [memos, initialMemoId]);
  const variants = availableVariants(candidates.length > 0);

  // ---- 見せ方・一文・形・地
  const [variantPref, setVariantPref] = useState(initialMemoId ? 'quote' : 'record');
  const variant = variants.includes(variantPref) ? variantPref : 'record';
  const [quoteIndex, setQuoteIndex] = useState(0);
  // 本を切り替えたら、その本のいちばん新しい一文から。
  const subjectKey = subject.kind === 'book' ? `b:${subject.bookId}` : 'month';
  const lastSubjectKey = useRef(subjectKey);
  useEffect(() => {
    if (lastSubjectKey.current !== subjectKey) { lastSubjectKey.current = subjectKey; setQuoteIndex(0); }
  }, [subjectKey]);
  const qi = candidates.length === 0 ? -1 : (variant === 'quote' && quoteIndex < 0 ? 0 : Math.min(quoteIndex, candidates.length - 1));
  const chosen = qi >= 0 ? candidates[qi] : null;
  // 一文の本（今月の一文は、その一文を書いた本）。
  const lineBook = chosen && isMonth ? ((books || []).find((b) => b.id === chosen.bookId) || null) : subjectBook;
  const knownMaxPage = useMemo(
    () => (memos || []).reduce((mx, m) => (Number.isFinite(m.pageNumber) && (!lineBook || !m.bookId || m.bookId === lineBook.id) ? Math.max(mx, m.pageNumber) : mx), 0),
    [memos, lineBook],
  );

  const [format, setFormatState] = useState(session.format === 'story' ? 'story' : 'post');
  const [style, setStyleState] = useState(initialPhotoFile ? 'photo' : (session.style === 'photo' ? 'paper' : session.style));
  const setFormat = (v) => { session.format = v; setFormatState(v); };
  const setStyle = (v) => { session.style = v; setStyleState(v); };

  const [photo, setPhoto] = useState(null); // { source, width, height, thumb }
  const [photoLoading, setPhotoLoading] = useState(!!initialPhotoFile);
  const [view, setView] = useState({ panX: 0, panY: 0, zoom: 1 });
  const viewRef = useRef(view);
  const [assets, setAssets] = useState(null); // { cover, covers, fonts, logo }
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dims, setDims] = useState(FORMATS.post);
  const [card, setCard] = useState(null); // { blob, key, line }
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false); // 写真を動かしている間（画像が古いのでシェアは押せない）
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const keyRef = useRef('');
  const blobTimer = useRef(null);
  const rafRef = useRef(0);
  const drawnLineRef = useRef('');

  // ---- 写真を読む（撮った写真・選んだ写真）。端末の中だけで縮めて使う。
  const readPhoto = useCallback(async (file) => {
    const err = checkPhoto(file);
    if (err) {
      if (err !== 'no-file') toast.error(err);
      return false;
    }
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
      setPhoto({ ...p, thumb, id: Date.now() });
      const v = { panX: 0, panY: 0, zoom: 1 };
      viewRef.current = v;
      setView(v);
      setStyle('photo');
      return true;
    } catch (e2) {
      toast.error(toMessage(e2, 'この写真は読み込めませんでした。'));
      return false;
    }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialPhotoFile) return undefined;
    let alive = true;
    readPhoto(initialPhotoFile).then((ok) => {
      if (!alive) return;
      setPhotoLoading(false);
      if (!ok) setStyleState(session.style === 'photo' ? 'paper' : session.style);
    });
    return () => { alive = false; };
  }, [initialPhotoFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 表紙・書体・ロゴを準備する（外部の表紙は自前の中継を通す・読めなければ代用表紙）。
  const coverBook = variant === 'quote' ? lineBook : subjectBook;
  const monthCoverBooks = isMonth && variant === 'record' ? (record.finishedBooks || []) : [];
  const coverKey = JSON.stringify([coverBook?.cover || '', coverBook?.title || '', monthCoverBooks.map((b) => b.cover || b.title)]);
  useEffect(() => {
    let alive = true;
    if (DEMO_SHARE === 'slow') return () => { alive = false; };
    const sample = `${record.title}${record.sub}${record.kicker}${(memos || []).map((m) => m.text || '').join('').slice(0, 1500)}${(record.stats || []).map((s) => s.label + s.value).join('')}`;
    Promise.all([
      coverBook ? prepareCover(coverBook).catch(() => ({ image: null, tone: null })) : Promise.resolve({ image: null, tone: null }),
      Promise.all(monthCoverBooks.map((b) => prepareCover(b).catch(() => ({ image: null, tone: null })).then((c) => ({ cover: c, title: b.title })))),
      prepareFonts(sample),
      prepareLogo(),
    ]).then(([cover, covers, fonts, logo]) => { if (alive) setAssets({ cover, covers, fonts, logo, ver: Date.now() }); });
    return () => { alive = false; };
  }, [coverKey, memos?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 表紙の色は、表紙のある 1 冊（今月なら読み終えた本があるとき）だけ。本が無い今月の 1 枚では意味が無いので出さない。
  const coverAllowed = !isMonth || (record.finishedBooks || []).length > 0;
  const effStyle = (style === 'photo' && !photo) || (style === 'cover' && !coverAllowed) ? 'paper' : style;
  const [bgMenu, setBgMenu] = useState(null); // 写真のときの「写真以外 ▾」のメニューの位置
  const lineText = chosen ? quoteText(chosen.text, variant) : '';
  const ready0 = !!assets && !memosLoading && !photoLoading;
  const drawKey = ready0
    ? JSON.stringify([variant, subjectKey, chosen?.id, lineText, chosen?.pageNumber, effStyle, format, photo?.id, view, record.kicker, record.title, record.sub, record.stats, lineBook?.title, lineBook?.author, retry, assets.ver])
    : '';

  // 描く材料（書き出す 1 枚・動かしている間の 1 コマ・見本で共通）。
  const cardOpts = (v = variant) => {
    const q = chosen || (v === 'quote' ? candidates[0] : null);
    const lb = q && isMonth ? ((books || []).find((b) => b.id === q.bookId) || null) : subjectBook;
    return {
      layout: v,
      record,
      stamp: fmtStamp(now),
      line: q ? quoteText(q.text, v) : '',
      page: v === 'quote' && q && Number.isFinite(q.pageNumber) ? q.pageNumber : null,
      title: (v === 'quote' ? lb?.title : subjectBook?.title) || record.title || '',
      author: (v === 'quote' ? lb?.author : subjectBook?.author) || '',
      totalPages: lb?.totalPages,
      knownMaxPage,
      seedKey: q?.id || subjectKey,
      cover: assets.cover,
      covers: v === 'record' ? assets.covers : [],
      fonts: assets.fonts,
      logo: assets.logo,
      style: effStyle,
      format,
      photo,
      view: viewRef.current,
      textPos: 'bottom',
    };
  };
  // canvas に描く（同期・書き出す大きさで全部）。失敗は ErrorMessage へ。
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready0) return false;
    try {
      if (DEMO_SHARE === 'fail') throw new Error('紙・夜など、ほかの色を選ぶか、もう一度お試しください。');
      const r = drawShareCard(canvas, cardOpts());
      drawnLineRef.current = r.line || '';
      setDims((d) => (d.w === r.width && d.h === r.height ? d : { w: r.width, h: r.height }));
      setStatus('ready');
      return true;
    } catch (e) {
      console.error('share card draw error', e);
      setError(toMessage(e, '紙・夜など、ほかの色を選ぶか、もう一度お試しください。'));
      setStatus('error');
      return false;
    }
  }, [drawKey, ready0]); // eslint-disable-line react-hooks/exhaustive-deps

  // 描いたものを PNG にしておく（共有を押した瞬間に共有シートを開けるように）。
  const scheduleBlob = useCallback((key) => {
    keyRef.current = key;
    clearTimeout(blobTimer.current);
    blobTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvasToBlob(canvas)
        .then((blob) => {
          if (keyRef.current !== key) return;
          setCard({ blob, key, line: drawnLineRef.current });
        })
        .catch((e) => {
          if (keyRef.current !== key) return;
          setError(toMessage(e, '紙・夜など、ほかの色を選ぶか、もう一度お試しください。'));
          setStatus('error');
        });
    }, 180);
  }, []);

  useEffect(() => {
    if (!drawKey) { setStatus('loading'); return; }
    viewRef.current = view;
    if (draw()) scheduleBlob(drawKey);
  }, [drawKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearTimeout(blobTimer.current); cancelAnimationFrame(rafRef.current); }, []);

  // ---- 見せ方の見本（記録／一文）。本物の画像を小さく描く（描き終えてから少し待って・指を動かしている間は描かない）。
  const thumbRefs = useRef({});
  const thumbKey = drawKey ? JSON.stringify([drawKey, variants]) : '';
  useEffect(() => {
    if (!thumbKey || variants.length < 2 || dragging || status !== 'ready') return undefined;
    const t = setTimeout(() => {
      variants.forEach((v) => {
        const tc = thumbRefs.current[v];
        if (!tc) return;
        try {
          let src = canvasRef.current;
          if (v !== variant) {
            src = document.createElement('canvas');
            drawShareCard(src, cardOpts(v));
          }
          const ctx = tc.getContext('2d');
          ctx.clearRect(0, 0, tc.width, tc.height);
          const s = Math.min(tc.width / src.width, tc.height / src.height);
          const w = src.width * s;
          const h = src.height * s;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(src, (tc.width - w) / 2, (tc.height - h) / 2, w, h);
        } catch { /* 見本が描けなくても本体は使える */ }
      });
    }, 260);
    return () => clearTimeout(t);
  }, [thumbKey, dragging, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 写真を指で動かす・拡大する（写真のときだけ）
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const canPan = effStyle === 'photo' && !!photo;
  // 動かし方の一言は、写真を選んだ直後に 3 秒だけ出して消す（画像の文字・ロゴに重ね続けない・2026-09-29）。
  const [panHint, setPanHint] = useState(false);
  useEffect(() => {
    if (!canPan) { setPanHint(false); return undefined; }
    setPanHint(true);
    const t = setTimeout(() => setPanHint(false), 3000);
    return () => clearTimeout(t);
  }, [canPan, photo]);
  // 動かしている間は、画面に見える大きさで写真＋重ねる層だけを描く（1 コマを軽く・F8）。指を離したら全部を描き直す。
  const dragCache = useRef({});
  const redrawSoon = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || !ready0) return;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const targetWidth = Math.max(570, Math.round((canvas.clientWidth || 0) * dpr));
      let ok = false;
      try { ok = drawPhotoDragFrame(canvas, cardOpts(), dragCache.current, { targetWidth }); } catch { ok = false; }
      if (!ok) draw();
    });
  };
  // 指を離したとき: 置き方が変わっていれば drawKey が変わって描き直す。同じなら（動かして元の位置に戻した）ここで描き直す。
  const latest = useRef({});
  latest.current = { view, drawKey, draw };
  const finishDrag = () => {
    cancelAnimationFrame(rafRef.current);
    const next = { ...viewRef.current };
    const cur = latest.current;
    if (JSON.stringify(next) === JSON.stringify(cur.view)) {
      if (cur.draw()) scheduleBlob(cur.drawKey);
    } else {
      setView(next);
    }
  };
  const dimsForPan = () => ({ pw: photo.width, ph: photo.height, W: FORMATS[format].w, H: FORMATS[format].h });
  // 画面の 1px が画像の何 px か（動かしている間は canvas の中身が小さいので、書き出す大きさ＝形の幅で数える）。
  const cssToCard = () => {
    const c = canvasRef.current;
    return c && c.clientWidth ? (FORMATS[format]?.w || c.width) / c.clientWidth : 1;
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
      finishDrag();
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
      t = setTimeout(() => { setDragging(false); finishDrag(); }, 160);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => { c.removeEventListener('wheel', onWheel); clearTimeout(t); };
  }, [canPan, draw]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 写真を選ぶ（シートの中では、撮る・アルバムから選ぶ の両方を選べる＝capture を付けない）
  const openPicker = () => { try { fileRef.current?.click(); } catch { /* ignore */ } };
  const onPhotoPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じ写真をもう一度選べるように
    if (!file) return;
    if (await readPhoto(file)) haptic.light();
  };

  const ready = status === 'ready' && !!card && card.key === drawKey && !busy && !dragging;
  const filename = shareFilename({ format: effStyle === 'sticker' ? 'sticker' : format, style: effStyle });
  const trackProps = (via) => ({ kind: variant === 'record' ? 'record' : 'line', style: effStyle, format: effStyle === 'sticker' ? 'sticker' : format, via, subject: isMonth ? 'month' : 'book', from });

  const handleShare = async () => {
    if (!ready) return;
    haptic.light();
    setBusy(true);
    try {
      // 共有の文は、画像に入れたものと同じ。await を挟まずに共有シートを開く。
      const text = variant === 'record'
        ? buildRecordShareText({ record, quote: card.line, siteUrl: SITE_URL })
        : buildShareText({ title: lineBook?.title, line: card.line, siteUrl: SITE_URL });
      const result = await shareImage({ blob: card.blob, filename, text });
      if (result !== 'cancelled') track(EVENTS.SHARE_CARD, trackProps(result));
      if (result === 'saved') toast.info('この端末では共有できないため、画像を保存しました。');
    } catch (e) {
      toast.error(toMessage(e, '共有できませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const result = await saveImage({ blob: card.blob, filename });
      if (result !== 'cancelled') track(EVENTS.SHARE_CARD, trackProps('saved'));
      if (result === 'saved') { haptic.success(); toast.success('画像を保存しました。'); }
    } catch (e) {
      toast.error(toMessage(e, '保存できませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  // 地の見本の色（表紙の色は、そのときの表紙から作った色）。
  const swatchColor = (v) => {
    try { return readShareTheme(v, { tone: assets?.cover?.tone, title: coverBook?.title || record.title }).bg || 'var(--fill)'; } catch { return 'var(--fill)'; }
  };

  const aspect = `${dims.w} / ${dims.h}`;
  const swapLabel = swapQuoteLabel(qi, candidates.length, variant === 'record');
  const thumbAspect = effStyle === 'sticker' ? 1 : FORMATS[format].w / FORMATS[format].h;
  const thumbW = Math.round(THUMB_H * thumbAspect);
  const subjectName = isMonth ? `${now.getMonth() + 1}月の読書` : `『${subjectBook?.title || ''}』`;

  const footer = (
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
        共有する
      </button>
    </div>
  );

  return (
    <BottomSheet title={photo ? '写真で共有' : '画像で共有'} onClose={onClose} footer={footer} dismissLabel="キャンセル">
      <input ref={fileRef} type="file" accept="image/*" onChange={onPhotoPicked} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* どの本？（ホームから開いたとき・今月 → 読書中 → 読了） */}
        {showSwitcher && (
          <div
            role="radiogroup"
            aria-label="どの本を共有するか"
            style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', scrollSnapType: 'x proximity', margin: 'calc(-1 * var(--space-1)) calc(-1 * var(--space-4))', padding: 'var(--space-1) var(--space-4)', scrollPaddingLeft: 'var(--space-4)', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {choices.map((c) => {
              const on = c.kind === 'month' ? isMonth : (!isMonth && subjectBook?.id === c.bookId);
              return (
                <button
                  key={c.kind === 'month' ? 'month' : c.bookId}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setSubject(c.kind === 'month' ? { kind: 'month' } : { kind: 'book', bookId: c.bookId }); haptic.light(); }}
                  style={c.kind === 'month' ? { ...subjectChip(on), paddingLeft: 'var(--space-3)' } : subjectChip(on)}
                >
                  {c.kind === 'month'
                    ? <><CalendarDays size={18} aria-hidden="true" />今月</>
                    : <><MiniCover book={c.book} width={24} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.book.title}</span></>}
                </button>
              );
            })}
          </div>
        )}

        {/* プレビュー＝外に出る画像そのもの（写真のときは指で動かせる） */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
          <div
            style={{
              display: status === 'error' ? 'none' : 'block',
              position: 'relative', height: PREVIEW_H, aspectRatio: aspect, maxWidth: '100%',
              borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--separator)',
              background: effStyle === 'sticker' ? checker(16) : 'var(--fill)',
            }}
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${subjectName}の画像（${VARIANT_LABELS[variant]}・${STYLE_LABELS[effStyle]}${effStyle === 'sticker' ? '' : `・${FORMAT_OPTIONS.find((o) => o.v === format)?.aria}`}）`}
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
            {/* 写真の動かし方は、写真の上の一番上に 3 秒だけ重ねる（記録・一文は下にあるので重ならない）。 */}
            {canPan && status === 'ready' && (
              <p aria-hidden={!panHint || undefined} style={{ position: 'absolute', left: '50%', top: 'var(--space-2)', opacity: panHint ? 1 : 0, transition: 'opacity var(--duration-base) var(--ease-out)', transform: 'translateX(-50%)', width: 'max-content', maxWidth: 'calc(100% - 2 * var(--space-2))', boxSizing: 'border-box', margin: 0, padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius)', background: 'var(--photo-backdrop)', color: 'var(--on-cover)', fontSize: 'var(--text-meta)', lineHeight: 1.4, textAlign: 'center', wordBreak: 'keep-all', pointerEvents: 'none' }}>
                <span style={{ display: 'inline-block' }}>指で動かす・</span><span style={{ display: 'inline-block' }}>2 本の指で拡大</span>
              </p>
            )}
          </div>
          {/* 失敗の案内はプレビューと同じ高さの場所に出す（地を変えて描き直せたときに、下の部品が上下に動かない）。 */}
          {status === 'error' && (
            <div style={{ alignSelf: 'stretch', minHeight: PREVIEW_H, display: 'grid' }}>
              <ErrorMessage
                className="error-message--fill"
                title="画像を作れませんでした"
                description={error && !error.startsWith('画像を作れませんでした') ? error : undefined}
                actions={[{ label: 'もう一度', onClick: () => { setStatus('loading'); setRetry((n) => n + 1); } }]}
              />
            </div>
          )}
          {/* 別の一文（1 タップで次のメモへ・記録では外すこともできる） */}
          {swapLabel && status !== 'error' && (
            // 画像を作っている間は押せない（違う一文の画像のまま共有しない）。薄くせず色だけ変える（DESIGN §5 押せないボタン）。
            <button
              type="button"
              disabled={status !== 'ready'}
              onClick={() => { setQuoteIndex(swapQuote(qi, candidates.length, variant === 'record')); haptic.light(); }}
              style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', color: status === 'ready' ? 'var(--accent)' : 'var(--text-3)', opacity: 1, cursor: status === 'ready' ? 'pointer' : 'default' }}
            >
              <Shuffle size={18} aria-hidden="true" />
              {swapLabel}
            </button>
          )}
        </div>

        {/* 見せ方（記録／一文の見本）と形（投稿 4:5／ストーリー 9:16） */}
        <div style={{ display: 'flex', alignItems: variants.length > 1 ? 'flex-start' : 'center', justifyContent: variants.length > 1 ? 'space-between' : 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {variants.length > 1 && (
            <div role="radiogroup" aria-label="見せ方" style={{ display: 'inline-flex', gap: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }}>
              {variants.map((v) => {
                const on = v === variant;
                return (
                  <button key={v} type="button" role="radio" aria-checked={on} onClick={() => { setVariantPref(v); if (v === 'quote' && qi < 0) setQuoteIndex(0); }} style={thumbBtn}>
                    <canvas
                      ref={(el) => { thumbRefs.current[v] = el; }}
                      width={thumbW * 2}
                      height={THUMB_H * 2}
                      aria-hidden="true"
                      style={{ display: 'block', width: thumbW, height: THUMB_H, borderRadius: 'var(--radius)', background: effStyle === 'sticker' ? checker(8) : 'var(--fill)', boxShadow: ring(on) }}
                    />
                    <span style={swatchLabel(on)}>{VARIANT_LABELS[v]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {effStyle !== 'sticker' && (
            // 見本（64＋上下の余白 8）と同じ高さの中で上下の中央に（見本の名前の行に引っぱられない）。
            <div role="radiogroup" aria-label="画像の形" style={{ display: 'inline-flex', gap: 'var(--space-1)', ...(variants.length > 1 ? { height: THUMB_H + 8, alignItems: 'center' } : {}) }}>
              {FORMAT_OPTIONS.map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={format === o.v} aria-label={o.aria} onClick={() => setFormat(o.v)} style={segBtn(format === o.v)}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 地。写真があるときは選ぶものを減らす: 行を出さず「写真以外 ▾」のメニュー 1 つ（紙・夜・表紙の色・透明・写真を選び直す）。
            写真が無いときは「写真を選ぶ」＋紙・夜・表紙の色・透明の見本（2026-09-30 ui-critic）。 */}
        {photo ? (
          <div style={{ display: 'flex', justifyContent: 'flex-start', paddingBottom: 'var(--space-2)' }}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={!!bgMenu}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setBgMenu({ x: r.left + 120, y: r.top - 8 }); }}
              style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}
            >
              {effStyle === 'photo' ? '写真以外' : `背景：${STYLE_LABELS[effStyle]}`}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {bgMenu && (
              <ContextMenu
                x={bgMenu.x}
                y={bgMenu.y}
                onClose={() => setBgMenu(null)}
                items={[
                  // 印は ✓ だけ（選んでいる行）。ほかの行は同じ幅の空き（DESIGN §5 絞り込みのメニュー）。
                  { label: STYLE_LABELS.photo, icon: effStyle === 'photo' ? <Check size={16} aria-hidden="true" /> : <span style={{ width: 16 }} aria-hidden="true" />, onClick: () => setStyle('photo') },
                  ...BG_OPTIONS.filter((v) => v !== 'cover' || coverAllowed).map((v) => ({
                    label: STYLE_LABELS[v],
                    icon: effStyle === v ? <Check size={16} aria-hidden="true" /> : <span style={{ width: 16 }} aria-hidden="true" />,
                    onClick: () => setStyle(v),
                  })),
                  { label: '写真を選び直す', icon: <span style={{ width: 16 }} aria-hidden="true" />, onClick: openPicker },
                ]}
              />
            )}
          </div>
        ) : (
          <div role="radiogroup" aria-label="背景" style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', paddingBottom: 'var(--space-2)' }}>
            {/* 390 幅で見本 4 つと 1 行に収まるよう、見える名前は「写真」（読み上げは「写真を選ぶ」）。 */}
            <button type="button" onClick={openPicker} aria-label="写真を選ぶ" title="写真を選ぶ" style={photoChip}>
              <ImagePlus size={20} aria-hidden="true" style={{ color: 'var(--text-2)' }} />
              写真
            </button>
            {BG_OPTIONS.filter((v) => v !== 'cover' || coverAllowed).map((v) => (
              // 「透明（ステッカー用）」は 390 幅の 1 行に収まらないので、見える名前は「透明」のまま、
              // 読み上げと長押しの名前で用途まで言う（2026-09-29）。
              <button key={v} type="button" role="radio" aria-checked={effStyle === v} onClick={() => setStyle(v)} style={swatchLabeledBtn}
                aria-label={v === 'sticker' ? '透明（ステッカー用）' : undefined} title={v === 'sticker' ? '透明（ステッカー用）' : undefined}>
                {v === 'cover' && !assets?.cover
                  // 表紙を読み込むまでは、表紙の色が分からないので骨組みの丸（代用の色を一瞬出さない）。
                  ? <SkeletonBlock width={28} height={28} radius="var(--radius-full)" style={{ boxShadow: ring(effStyle === v) }} />
                  : <span aria-hidden="true" style={swatchDot(v === 'sticker' ? checker(8) : swatchColor(v), effStyle === v)} />}
                <span style={swatchLabel(effStyle === v)}>{STYLE_LABELS[v]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
