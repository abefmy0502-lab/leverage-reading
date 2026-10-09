// 📷 写真で共有 — Strava のように、撮った写真の上に読書の記録（と一文）を重ねて、1 タップで共有する。
// （旧「一文をシェア」も同じシート。メモの「…」から開くと、その一文を選んだ「一文」の見せ方で開く。）
//
// 開いた時点で、いちばんよい 1 枚を描き終えておく＝そのまま「共有する」を押すだけ:
//   写真あり（カメラの入口）… 写真＋記録（書名・著者・メモの件数／実行した行動）＋いちばん新しいメモの一文
//                              （読書中の本はメモがあれば「心に残った一文」から・日付は既定で入れない・2026-10-09）
//                              （重ね方・形は前に選んだもの＝端末に覚える）
//   写真なし（カメラをやめた・画像で共有）… 表紙がある本は「表紙の色」（ぼかした表紙を敷いた地＋表紙）、無ければ紙
//   メモから                … 紙＋その一文
// 変えたいときだけ:
//   どの本？（ホームから開いたとき）… 今月／（12 月だけ）今年／読書中・読了の本を 1 タップで切り替え
//   別の一文                         … 1 タップで次のメモへ（記録では「一文を外す」も）
//   重ね方（見せ方）                 … 記録／数字（大きな数字を縦に積む）／一文／雑誌（本 1 冊でメモがあるときだけ・2026-10-09）。
//                                      小さな見本を押す・プレビューを左右にスワイプ
//   形                               … 投稿 4:5 ／ ストーリー 9:16（どちらも SNS で切られない範囲に文字を置く）
//   地                               … 写真（撮り直す・アルバムから選ぶ）／紙／夜／表紙の色／透明（ステッカー）
// Orime のロゴはどの 1 枚にも必ず入る（隠せない・2026-10-05 オーナー裁定）。
// 大きくして直したいとき（2026-10-01）: プレビューを押す／「編集」→ 全画面の編集画面（ShareEditor.jsx）。
//   写真を指で動かす・拡大、自分の言葉を入れる（形 4 つ・指で動かす・大きさ）、表示する項目のスイッチ。
//   表示する項目（隠した項目）は端末に覚えて次の共有でも使う。言葉は覚えない（その 1 枚だけ）。
// 画像に入るのは、本人が画面で見ている情報だけ（書名・著者・日付・件数・一文・入れた言葉・Orime のロゴ）。
// 写真は端末の中だけで描く（どこにも送らない・アップロードしない）。
// 選んだ重ね方・形は端末に覚える（orime.share.prefs）。地はアプリを開いている間だけ（写真そのものは覚えない）。
// 書き出す画像は幅 1080・写真は JPEG（0.92）・紙や夜・透明は PNG（shareImageType）。
//
// props:
//   book            … 開いた本 { id, title, author, cover, totalPages, status, doneDate, startDate, actions, leverageMemo }
//   books           … 本棚の本（上の行の「写真で共有」から開いたとき＝「どの本？」の切り替えと今月の数字に使う）
//   memos           … book のメモ（無ければこのシートで読み込む）
//   initialMemoId   … 先に選んでおくメモ（メモの「…」→「この一文をシェア」）
//   initialPhotoFile… カメラで撮った写真（ホーム・本の詳細・読了の入口）
//   initialSubject  … { kind: 'book', bookId } | { kind: 'month' } | { kind: 'year' }（省略時は book、無ければ pickShareSubject）
//                     今年は 12 月で今年の読了が 1 冊以上のときだけ（それ以外は今月にする・2026-10-08）
// 今月・今年の共有の文には「#10月読了本」「#2026年の読書」を添える（画像には入れない・shareHashtags）。
//   from            … 計測用の入口の名前（home / review / consult / detail / done / memo / menu）
//   onClose

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Shuffle, CalendarDays, CalendarRange, ChevronDown, Check, SlidersHorizontal, Camera } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ErrorMessage from './ErrorMessage';
import ContextMenu from './ContextMenu';
import ShareEditor from './ShareEditor';
import { SkeletonBlock } from './Skeleton';
import { MiniCover } from './BookCards';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { useBookMemos } from '../hooks/useBookMemos';
import { useReadingSessions } from '../hooks/useReadingSessions';
import { shareReadingNote } from '../lib/readingTime';
import { useAuth } from '../hooks/useAuth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { toMessage } from '../lib/errors';
import { validateImageFile, MAX_IMAGE_BYTES } from '../lib/limits';
import { track, EVENTS } from '../lib/analytics';
import { SITE_URL } from '../lib/legalLinks';
import { appNow } from '../lib/appNow';
import { monthMemoCache, yearMemoCache } from '../lib/shareMemoCache';
import {
  drawShareCard, canvasToBlob, prepareCover, prepareFonts, prepareLogo, loadPhotoFile, readShareTheme, filmPhoto,
} from '../lib/shareCard';
import { buildShareText, shareFilename, FORMATS } from '../lib/shareCardLayout';
import {
  pickShareSubject, subjectChoices, bookRecord, monthRecord, yearRecord, yearChoiceAllowed, orderQuoteCandidates,
  orderYearQuoteCandidates, shareHashtags, yearMemoCountFor, quoteText,
  swapQuote, swapQuoteLabel, availableVariants, defaultVariant, buildRecordShareText, fmtStamp, fmtMagazineStamp,
  shareItemsFor, applyShareItems, shareVisibility, readHiddenItems, writeHiddenItems,
  readSharePrefs, writeSharePrefs, stepVariant,
} from '../lib/shareOverlay';
import { phraseDisplayText } from '../lib/sharePhrase';
import { withPhraseBreaks } from './TightBubble';
import { shareImage, saveImage } from '../lib/shareImage';
import { storeLinkFor } from '../lib/appStore';
import { shareCampaign } from '../lib/storeCampaign';
import { btnPrimary, btnPrimaryOff, btnLink } from '../styles/ui';

const FORMAT_OPTIONS = [
  { v: 'post', label: '投稿', aria: '投稿（4:5）' },
  { v: 'story', label: 'ストーリー', aria: 'ストーリー（9:16）' },
];
// 重ね方の名前は、押す前に中身が分かる言葉で（2026-10-08 オーナー「記録、数字という意味が伝わりにくい」）。
// コードの名前（record / stats / quote）と端末に覚える値は変えない。
// 雑誌（magazine・2026-10-09）＝大きな引用＋続きの文＋右の本のカード（本 1 冊でメモがあるときだけ）。
const VARIANT_LABELS = { record: '書名と数字', stats: '大きな数字', quote: '心に残った一文', magazine: '雑誌' };
// フィルム＝写真の色を端末の中で整えた地（彩度を少し落とし・温かく・黒を少し持ち上げる・2026-10-08）。写真があるときだけ。
const STYLE_LABELS = { photo: '写真', film: 'フィルム', paper: '紙', night: '夜', cover: '表紙の色', sticker: '透明' };
const BG_OPTIONS = ['paper', 'night', 'cover', 'sticker'];
const NO_COVER = { image: null, tone: null };
// プレビューを左右に振ったとみなす距離（これより短い・縦に近い動きは「押した」）。
const SWIPE_PX = 40;

// 🧪 開発専用（お試しモード）: &share=slow で画像を作っている途中、&share=fail で作れなかったときの表示を撮る。
// 本番は import.meta.env.DEV=false で常に null。
const DEMO_SHARE = import.meta.env.DEV && import.meta.env.VITE_DEMO === 'true' && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('share')
  : null;

// 地はアプリを開いている間だけ覚える（写真そのものは覚えない）。null＝まだ選んでいない（自動で決める）。
// 形は端末にも覚える（readSharePrefs）。端末に書けないときは、ここだけで覚える。
const session = { style: null, format: 'post' };

// 表示する項目（隠した項目）は端末に覚える（private ブラウズ・保存できない端末では毎回すべて出す）。
function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

// プレビューの高さ（シートが 1 画面に収まるように・形が変わっても高さは同じ）。
const PREVIEW_H = 'min(28vh, 248px)';
// 見せ方の見本の高さ（幅は形に合わせる）。
const THUMB_H = 64;

// 選んでいる状態は中立の見た目（DESIGN §3-1 の --fill＝選択中の面・--text の輪）。栗色は主ボタンと文字ボタンだけに
// 残し、「共有する」がいちばん目立つようにする（2026-09-30 ui-critic）。
const SELECTED_RING = '0 0 0 2px var(--surface), 0 0 0 4px var(--text)';
// 形の切り替え（投稿／ストーリー）。太さは 600 のまま変えない（選ぶたびに幅が変わって跳ねない）。
const segBtn = (on) => ({
  minHeight: 'var(--tap-min)',
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
  width: 'var(--space-16)',
  minHeight: 'var(--tap-min)',
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
  minHeight: 'var(--tap-min)',
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
  minHeight: 'var(--tap-min)',
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
  minWidth: 'var(--tap-min)',
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

// 今月書いたメモ（今月の数字と一文の候補）。「今月」を選んだときだけ読む。アプリを開いている間は覚えておく
// （メモが動いたら捨てる＝lib/shareMemoCache.js）。
function useMonthMemos(enabled, now) {
  const { user } = useAuth();
  const key = `${user?.id || ''}|${monthStartIso(now)}`;
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
        .gte('created_at', monthStartIso(now))
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

// 今年書いたメモ（今年の数字と「いちばん残した一文」の候補・2026-10-08）。「今年」を選んだときだけ読む。
// 一文を決めるのに、思い出しカードで「覚えた」を押した回数（recall_count）も読む。件数は数え上げ（読む上限より多い人のため）。
// recall_count・source_type の列が無い古い DB では外して読み直す（覚えた回数は 0 として扱う）。
// 読めなかったときは error（数字の欠けた 1 枚を作らない＝シートは「今年のメモを読み込めませんでした」）。reload で読み直す。
const YEAR_MEMO_LIMIT = 2000;
function useYearMemos(enabled, now) {
  const { user } = useAuth();
  const year = now.getFullYear();
  const key = `${user?.id || ''}|${year}`;
  const [state, setState] = useState(() => yearMemoCache.get(key) || { memos: [], count: null, loading: !!enabled, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    // 🧪 お試しモードの &share=yearfail（今年のメモを読めなかったときの表示を撮る）。
    if (DEMO_SHARE === 'yearfail' && attempt === 0) { setState({ memos: [], count: null, loading: false, error: true }); return undefined; }
    const hit = yearMemoCache.get(key);
    if (hit) { setState(hit); return undefined; }
    if (!isSupabaseConfigured || !user?.id) { setState({ memos: [], count: null, loading: false, error: false }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    (async () => {
      const from = new Date(year, 0, 1).toISOString();
      const to = new Date(year + 1, 0, 1).toISOString();
      const run = (cols) => supabase
        .from('book_memos')
        .select(cols, { count: 'exact' })
        .eq('user_id', user.id)
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at', { ascending: false })
        .limit(YEAR_MEMO_LIMIT);
      let res;
      try {
        res = await run('id, text, book_id, page_number, photo_path, created_at, recall_count, source_type');
        if (res.error) res = await run('id, text, book_id, page_number, photo_path, created_at');
      } catch (e) {
        res = { data: null, error: e, count: null };
      }
      if (!alive) return;
      const { data, error, count } = res;
      if (error) { setState({ memos: [], count: null, loading: false, error: true }); return; }
      const memos = (data || []).map((m) => ({
        id: m.id, text: m.text || '', bookId: m.book_id, pageNumber: m.page_number ?? null, photoPath: m.photo_path || null,
        createdAt: m.created_at, recallCount: m.recall_count ?? 0, sourceType: m.source_type || null,
      }));
      const next = { memos, count: Number.isFinite(count) ? count : null, loading: false, error: false };
      yearMemoCache.set(key, next);
      setState(next);
    })();
    return () => { alive = false; };
  }, [enabled, key, user?.id, year, attempt]);
  return { ...state, reload: () => setAttempt((n) => n + 1) };
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
  // 端末の日付（お試しモードは &today= で差し替えられる＝lib/appNow.js）。
  const now = useMemo(() => appNow(), []);
  // 「今年」は 12 月で、今年に読み終えた本が 1 冊以上あるときだけ（ホームなど本棚を渡された入口だけ）。
  const yearAllowed = !!books && yearChoiceAllowed(books, now);

  // ---- どの本？（本 1 冊 か 今月 か 今年）
  const [subject, setSubject] = useState(() => {
    const s = initialSubject || (bookProp ? { kind: 'book', bookId: bookProp.id } : pickShareSubject(books));
    return s.kind === 'year' && !yearAllowed ? { kind: 'month' } : s;
  });
  const choices = useMemo(
    () => (books ? subjectChoices(books, { selectedId: subject.kind === 'book' ? subject.bookId : null, includeYear: yearAllowed }) : []),
    [books, subject, yearAllowed],
  );
  const showSwitcher = choices.length > 1;
  const subjectBook = subject.kind === 'book'
    ? ((bookProp && bookProp.id === subject.bookId) ? bookProp : (books || []).find((b) => b.id === subject.bookId) || null)
    : null;
  // 本 1 冊でない 1 枚（今月・今年）。period＝'month' | 'year' | null（本 1 冊）。
  const period = subject.kind === 'year' && yearAllowed ? 'year' : (subject.kind === 'month' || !subjectBook) ? 'month' : null;
  const isPeriod = !!period;
  // ⏱ 雑誌の下の行の短い数の欄: この本の今日の読書時間（集中モード）があれば「読書 32 分」。無ければ出さない（2026-10-09）。
  const readingRows = useReadingSessions().rows;
  const readingNote = subject.kind === 'book' && subjectBook ? shareReadingNote(readingRows, subjectBook.id, now.getTime()) : null;
  const readingNoteKey = readingNote ? readingNote.value : '';

  // メモ: 開いた本のメモを渡されたらそれを使い、ほかの本はここで読む。今月は今月の、今年は今年のメモを読む。
  const usePropMemos = !!memosProp && !!subjectBook && !!bookProp && subjectBook.id === bookProp.id;
  const loaded = useBookMemos(!usePropMemos && subjectBook ? subjectBook.id : null);
  const month = useMonthMemos(period === 'month', now);
  const yearM = useYearMemos(period === 'year', now);
  const memos = period === 'year' ? yearM.memos : period === 'month' ? month.memos : (usePropMemos ? memosProp : loaded.memos);
  const memosLoading = period === 'year' ? yearM.loading : period === 'month' ? month.loading : (!usePropMemos && loaded.loading);

  const record = useMemo(
    () => (period === 'year'
      ? yearRecord(books || [], yearM.memos, now, { memoCount: yearMemoCountFor(yearM.memos, yearM.count, YEAR_MEMO_LIMIT) })
      : period === 'month' ? monthRecord(books || [], month.memos, now) : bookRecord(subjectBook, memos, now)),
    [period, books, month.memos, yearM.memos, yearM.count, subjectBook, memos, now],
  );
  // 今年は「いちばん残した一文」から（思い出しカードで「覚えた」を押した回数 → しっかり書いた → 新しい順・AI まとめは入れない）。
  const candidates = useMemo(
    () => (period === 'year' ? orderYearQuoteCandidates(memos) : orderQuoteCandidates(memos, { preferId: initialMemoId })),
    [period, memos, initialMemoId],
  );
  const variants = availableVariants(candidates.length > 0, (record.stats || []).length > 0, { book: !isPeriod && !!subjectBook });

  // ---- 重ね方（見せ方）・一文・形・地。重ね方と形は前に選んだもの（端末に覚える）。メモから開いたときは一文。
  const prefs = useMemo(() => readSharePrefs(safeStorage()), []);
  // 前に選んだ重ね方（無ければ null）。最初の重ね方は defaultVariant（読書中の本はメモがあれば一文・
  // 大きく出せる数が無い本で「大きな数字」を選んでいたら一文へ・2026-10-09）。
  const [variantPref, setVariantPref] = useState(initialMemoId ? 'quote' : (prefs.variant || null));
  const variant = defaultVariant({
    fromMemo: !!initialMemoId && variantPref === 'quote',
    hasQuote: candidates.length > 0,
    preferred: variantPref,
    variants,
    readingBook: !isPeriod && subjectBook?.status === 'reading',
  });
  const [quoteIndex, setQuoteIndex] = useState(0);
  // 本を切り替えたら、その本のいちばん新しい一文から。
  const subjectKey = period || `b:${subject.bookId}`;
  const lastSubjectKey = useRef(subjectKey);
  useEffect(() => {
    if (lastSubjectKey.current !== subjectKey) { lastSubjectKey.current = subjectKey; setQuoteIndex(0); }
  }, [subjectKey]);
    // 一文・雑誌は一文が主役なので「なし」にしない。
  const quoteLed = variant === 'quote' || variant === 'magazine';
  const qi = candidates.length === 0 ? -1 : (quoteLed && quoteIndex < 0 ? 0 : Math.min(quoteIndex, candidates.length - 1));
  const chosen = qi >= 0 ? candidates[qi] : null;
  // 一文の本（今月・今年の一文は、その一文を書いた本）。
  const lineBook = chosen && isPeriod ? ((books || []).find((b) => b.id === chosen.bookId) || null) : subjectBook;
  const knownMaxPage = useMemo(
    () => (memos || []).reduce((mx, m) => (Number.isFinite(m.pageNumber) && (!lineBook || !m.bookId || m.bookId === lineBook.id) ? Math.max(mx, m.pageNumber) : mx), 0),
    [memos, lineBook],
  );

  const [format, setFormatState] = useState(prefs.format || (session.format === 'story' ? 'story' : 'post'));
  // 地: 'auto'＝まだ選んでいない（写真が無いとき、表紙のある本は表紙の色・無ければ紙。メモから開いたときは紙）。
  const noPhotoStyle = () => (session.style && session.style !== 'photo' ? session.style : 'auto');
  const [style, setStyleState] = useState(initialPhotoFile ? 'photo' : noPhotoStyle());
  const setFormat = (v) => { session.format = v; writeSharePrefs(safeStorage(), { format: v }); setFormatState(v); };
  const setStyle = (v) => { session.style = v; setStyleState(v); };
  const chooseVariant = (v) => {
    setVariantPref(v);
    writeSharePrefs(safeStorage(), { variant: v });
    if ((v === 'quote' || v === 'magazine') && qi < 0) setQuoteIndex(0);
    haptic.light();
  };

  const [photo, setPhoto] = useState(null); // { source, width, height, thumb }
  const [photoLoading, setPhotoLoading] = useState(!!initialPhotoFile);
  const [view, setView] = useState({ panX: 0, panY: 0, zoom: 1 });
  // 表示する項目で隠した項目（前の選択を覚えておく）・自分で入れる言葉・編集画面。
  const [savedHidden, setHiddenState] = useState(() => readHiddenItems(safeStorage()));
  // 言葉を入れたら、この 1 枚だけメモの一文を隠す（1 枚に「引用」を 2 つ並べない・2026-10-01 オーナー判断）。
  // 端末には覚えない。「表示する項目」の一文をオンにすれば戻る。
  const [phraseHidesQuote, setPhraseHidesQuote] = useState(false);
  const hidden = useMemo(
    () => (phraseHidesQuote && !savedHidden.includes('quote') ? [...savedHidden, 'quote'] : savedHidden),
    [savedHidden, phraseHidesQuote],
  );
  const toggleItem = (key) => {
    if (key === 'quote' && phraseHidesQuote) { setPhraseHidesQuote(false); return; }
    setHiddenState((h) => {
      const next = h.includes(key) ? h.filter((k) => k !== key) : [...h, key];
      writeHiddenItems(safeStorage(), next);
      return next;
    });
  };
  const [phrase, setPhraseState] = useState(null);
  const setPhrase = (next) => {
    if (!phrase && next) setPhraseHidesQuote(true);
    if (!next) setPhraseHidesQuote(false);
    setPhraseState(next);
  };
  const [editorOpen, setEditorOpen] = useState(false);
  const [baseAssets, setBaseAssets] = useState(null); // { fonts, logo, ver }
  const [coverAssets, setCoverAssets] = useState(null); // { key, cover, covers, ver }
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [dims, setDims] = useState(FORMATS.post);
  const [card, setCard] = useState(null); // { blob, key, line }
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const keyRef = useRef('');
  const styleRef = useRef('paper');
  const blobTimer = useRef(null);
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
      setView({ panX: 0, panY: 0, zoom: 1 });
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
      if (!ok) setStyleState(noPhotoStyle());
    });
    return () => { alive = false; };
  }, [initialPhotoFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 書体・ロゴを準備する（端末の中・すぐ終わる）。
  useEffect(() => {
    let alive = true;
    if (DEMO_SHARE === 'slow') return () => { alive = false; };
    const sample = `${record.title}${record.sub}${record.kicker} · ${record.date?.text || ''}${(memos || []).map((m) => m.text || '').join('').slice(0, 1500)}${(record.stats || []).map((s) => s.label + s.value).join('')}`;
    Promise.all([prepareFonts(sample), prepareLogo()])
      .then(([fonts, logo]) => { if (alive) setBaseAssets({ fonts, logo, ver: Date.now() }); });
    return () => { alive = false; };
  }, [subjectKey, memos?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 表紙を準備する（外部の表紙は自前の中継を通す・読めなければ代用表紙）。通信なので遅いことがある。
  // 写真・透明の 1 枚は表紙を描かないので、表紙を待たずに描く（撮ってから重ねた画像が出るまでを短く・2026-10-05）。
  const coverBook = variant === 'quote' ? lineBook : subjectBook;
  const monthCoverBooks = isPeriod && variant !== 'quote' ? (record.finishedBooks || []) : [];
  const coverKey = JSON.stringify([coverBook?.cover || '', coverBook?.title || '', monthCoverBooks.map((b) => b.cover || b.title)]);
  useEffect(() => {
    let alive = true;
    if (DEMO_SHARE === 'slow') return () => { alive = false; };
    Promise.all([
      coverBook ? prepareCover(coverBook).catch(() => NO_COVER) : Promise.resolve(NO_COVER),
      Promise.all(monthCoverBooks.map((b) => prepareCover(b).catch(() => NO_COVER).then((c) => ({ cover: c, title: b.title })))),
    ]).then(([cover, covers]) => { if (alive) setCoverAssets({ key: coverKey, cover, covers, ver: Date.now() }); });
    return () => { alive = false; };
  }, [coverKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const coverReady = !!coverAssets && coverAssets.key === coverKey;

  // 表紙の色は、表紙のある 1 冊（今月・今年なら読み終えた本があるとき）だけ。本が無い今月の 1 枚では意味が無いので出さない。
  const coverAllowed = !isPeriod || (record.finishedBooks || []).length > 0;
  // 地を選んでいないとき（auto）: メモから開いたら紙、表紙の画像がある本は表紙の色（写真が無いときの見栄えのよい代わり）、ほかは紙。
  const autoStyle = !initialMemoId && !isPeriod && coverReady && coverAssets.cover?.image ? 'cover' : 'paper';
  const wantStyle = style === 'auto' ? autoStyle : style;
  const effStyle = ((wantStyle === 'photo' || wantStyle === 'film') && !photo) || (wantStyle === 'cover' && !coverAllowed) ? 'paper' : wantStyle;
  // 描くときはフィルムも写真の地（色を整えた写真を使う）。書き出しも写真と同じ JPEG。
  const drawStyle = effStyle === 'film' ? 'photo' : effStyle;
  const drawPhoto = useMemo(() => (effStyle === 'film' && photo ? filmPhoto(photo) : photo), [effStyle, photo]);
  styleRef.current = drawStyle;
  // 雑誌は写真・透明の上にも本のカード（表紙）を描くので、表紙を待つ。
  const needCover = variant === 'magazine' || (drawStyle !== 'photo' && drawStyle !== 'sticker');
  const assets = baseAssets
    ? {
      ...baseAssets,
      cover: coverReady ? coverAssets.cover : NO_COVER,
      covers: coverReady ? coverAssets.covers : [],
      // 写真・透明は表紙を描かないので、表紙が届いても描き直さない（「共有する」が押せなくならない）。
      ver: needCover ? `${baseAssets.ver}:${coverReady ? coverAssets.ver : 0}` : `${baseAssets.ver}`,
    }
    : null;
  const [bgMenu, setBgMenu] = useState(null); // 「背景：◯ ▾」のメニューの位置
  const lineText = chosen ? quoteText(chosen.text, variant) : '';
  // 今年のメモを読めなかったときは描かない（数字の欠けた 1 枚を共有させない）。
  const yearError = period === 'year' && !!yearM.error;
  const ready0 = !!assets && (coverReady || !needCover) && !memosLoading && !photoLoading && !yearError;
  const drawKey = ready0
    ? JSON.stringify([variant, subjectKey, chosen?.id, lineText, chosen?.pageNumber, effStyle, format, photo?.id, view, record.kicker, record.date, record.title, record.sub, record.stats, lineBook?.title, lineBook?.author, retry, assets.ver, hidden, phrase, readingNoteKey])
    : '';

  // 描く材料（書き出す 1 枚・動かしている間の 1 コマ・見本で共通）。
  const cardOpts = (v = variant) => {
    const q = chosen || (v === 'quote' || v === 'magazine' ? candidates[0] : null);
    const lb = q && isPeriod ? ((books || []).find((b) => b.id === q.bookId) || null) : subjectBook;
    return {
      layout: v,
      record,
      // 雑誌の日付は「2026.10.09 FRI」（小さく・主役にしない）。
      stamp: v === 'magazine' ? fmtMagazineStamp(now) : fmtStamp(now),
      line: q ? quoteText(q.text, v) : '',
      page: v === 'quote' && q && Number.isFinite(q.pageNumber) ? q.pageNumber : null,
      title: (v === 'quote' ? lb?.title : subjectBook?.title) || record.title || '',
      author: (v === 'quote' ? lb?.author : subjectBook?.author) || '',
      totalPages: lb?.totalPages,
      knownMaxPage,
      seedKey: q?.id || subjectKey,
      // 今年の一文には見出し「2026」（記録の見出しと同じ部品・第 2 回 ui-critic）。
      kicker: period === 'year' && v === 'quote' ? String(now.getFullYear()) : '',
      cover: assets.cover,
      covers: v !== 'quote' && v !== 'magazine' ? assets.covers : [],
      fonts: assets.fonts,
      logo: assets.logo,
      style: drawStyle,
      format,
      photo: drawPhoto,
      view,
      textPos: 'bottom',
      hidden,
      phrase: phrase && phraseDisplayText(phrase) ? phrase : null,
      // 雑誌だけが使う（ほかの重ね方は見ない）。
      note: v === 'magazine' ? readingNote : null,
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

  // 描いたものを画像にしておく（共有を押した瞬間に共有シートを開けるように）。写真は JPEG・ほかは PNG。
  const scheduleBlob = useCallback((key) => {
    keyRef.current = key;
    clearTimeout(blobTimer.current);
    blobTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvasToBlob(canvas, { style: styleRef.current })
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

  // 編集画面を開いている間は、編集画面だけが描く（閉じたら描き直して PNG にする）。
  useEffect(() => {
    if (yearError) { setStatus('error'); return; }
    if (!drawKey) { setStatus('loading'); return; }
    if (editorOpen) return;
    if (draw()) scheduleBlob(drawKey);
  }, [drawKey, editorOpen, yearError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { clearTimeout(blobTimer.current); }, []);

  // ---- 重ね方の見本（記録／数字／一文）。本物の画像を小さく描く（描き終えてから少し待って・指を動かしている間は描かない）。
  const thumbRefs = useRef({});
  const thumbKey = drawKey ? JSON.stringify([drawKey, variants]) : '';
  useEffect(() => {
    if (!thumbKey || variants.length < 2 || editorOpen || status !== 'ready') return undefined;
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
  }, [thumbKey, editorOpen, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 編集画面（写真を動かす・拡大／言葉／表示する項目）。写真を動かせるのは写真の地のときだけ。
  const canPan = drawStyle === 'photo' && !!photo;
  const items = shareItemsFor({ record, variant, hasQuote: !!chosen && variant === 'record', hasAuthor: !!String(lineBook?.author || '').trim() });
  const getEditorOpts = useCallback(() => cardOpts(), [drawKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const openEditor = () => { if (status === 'ready') { haptic.light(); setEditorOpen(true); } };

  // ---- 写真を選ぶ。「アルバム」「写真」は capture なし（iOS は「フォトライブラリ／写真を撮る」を選べる）、
  // 「撮り直す」は capture あり（すぐカメラ）。どちらも端末の中だけで使う。
  const openPicker = () => { try { fileRef.current?.click(); } catch { /* ignore */ } };
  const openCamera = () => { try { cameraRef.current?.click(); } catch { /* ignore */ } };

  // ---- プレビューを左右に振ると、隣の重ね方へ（Strava の共有と同じ）。押しただけなら編集画面。
  const swipeRef = useRef(null);
  const onPreviewPointerDown = (e) => {
    swipeRef.current = { x: e.clientX, y: e.clientY, swiped: false };
    // 指（マウス）がプレビューの外まで振れても、離したことをここで受け取る。
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  };
  const onPreviewPointerUp = (e) => {
    const s = swipeRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      s.swiped = true;
      const next = stepVariant(variants, variant, dx < 0 ? 1 : -1);
      if (next !== variant) chooseVariant(next);
    }
  };
  const onPreviewClick = () => {
    const swiped = swipeRef.current?.swiped;
    swipeRef.current = null;
    if (!swiped) openEditor();
  };
  const onPhotoPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じ写真をもう一度選べるように
    if (!file) return;
    if (await readPhoto(file)) haptic.light();
  };

  const ready = status === 'ready' && !!card && card.key === drawKey && !busy && !editorOpen;
  const filename = shareFilename({ format: effStyle === 'sticker' ? 'sticker' : format, style: drawStyle });
  const trackProps = (via) => ({ kind: variant === 'quote' ? 'line' : variant, style: effStyle, format: effStyle === 'sticker' ? 'sticker' : format, via, subject: period || 'book', from });

  const handleShare = async () => {
    if (!ready) return;
    haptic.light();
    setBusy(true);
    try {
      // 共有の文は、画像に入れたものと同じ。await を挟まずに共有シートを開く。
      // 隠した項目（書名など）は文にも入れない。今月・今年は「#10月読了本」「#2026年の読書」を添える（画像には入れない）。
      // 「#◯月読了本」は、その月に読み終えた本があるときだけ（メモだけの月は #Orime だけ・オーナー判断）。
      // 📊 リンクは、App Store の URL があればキャンペーン名（ct=share_<今月・今年>_<重ね方>）付きの App Store
      //   （どの共有から入手されたかを数える・lib/storeCampaign.js）。無い間は今までどおり紹介ページ。画像には URL を入れない。
      const tags = shareHashtags(period, now, { finishedCount: (record.finishedBooks || []).length });
      const link = storeLinkFor(shareCampaign({ variant, period })) || SITE_URL;
      // 雑誌は一文と同じ（書名と一文）。
      const text = variant !== 'quote' && variant !== 'magazine'
        ? buildRecordShareText({ record: applyShareItems(record, hidden), quote: card.line, siteUrl: link, tags })
        : buildShareText({ title: shareVisibility(hidden).title ? lineBook?.title : '', line: card.line, siteUrl: link, tags });
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
    try { return readShareTheme(v, { tone: coverReady ? coverAssets.cover?.tone : null, title: coverBook?.title || record.title }).bg || 'var(--fill)'; } catch { return 'var(--fill)'; }
  };
  // 背景のメニュー（写真・紙・夜・表紙の色・透明。印は選んでいる行の ✓ だけ・ほかは同じ幅の空き＝DESIGN §5）。
  const bgItems = [
    ...(photo ? ['photo', 'film'] : []),
    ...BG_OPTIONS.filter((v) => v !== 'cover' || coverAllowed),
  ].map((v) => ({
    label: STYLE_LABELS[v],
    icon: effStyle === v ? <Check size="1.1em" aria-hidden="true" /> : <span style={{ width: 'var(--space-4)' }} aria-hidden="true" />,
    onClick: () => setStyle(v),
  }));

  const aspect = `${dims.w} / ${dims.h}`;
  // 数字の重ね方（一文が無い）・記録で一文を隠した（表示する項目）ときは「別の一文」を出さない（替えても画像が変わらない）。
  const swapLabel = variant === 'stats' || (variant === 'record' && hidden.includes('quote')) ? null : swapQuoteLabel(qi, candidates.length, variant === 'record');
  const thumbAspect = effStyle === 'sticker' ? 1 : FORMATS[format].w / FORMATS[format].h;
  const thumbW = Math.round(THUMB_H * thumbAspect);
  const subjectName = period === 'year' ? `${now.getFullYear()}年の読書` : period === 'month' ? `${now.getMonth() + 1}月の読書` : `『${subjectBook?.title || ''}』`;

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
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onPhotoPicked} style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* どの本？（ホームから開いたとき・今月 →（12 月だけ）今年 → 読書中 → 読了） */}
        {showSwitcher && (
          <div
            role="radiogroup"
            aria-label="どの本を共有するか"
            style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', scrollSnapType: 'x proximity', margin: 'calc(-1 * var(--space-1)) calc(-1 * var(--space-4))', padding: 'var(--space-1) var(--space-4)', scrollPaddingLeft: 'var(--space-4)', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {choices.map((c) => {
              const on = c.kind === 'book' ? (!isPeriod && subjectBook?.id === c.bookId) : period === c.kind;
              return (
                <button
                  key={c.kind === 'book' ? c.bookId : c.kind}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={c.kind === 'year' ? `今年（${now.getFullYear()}年の読書）` : undefined}
                  onClick={() => { setSubject(c.kind === 'book' ? { kind: 'book', bookId: c.bookId } : { kind: c.kind }); haptic.light(); }}
                  style={c.kind !== 'book' ? { ...subjectChip(on), paddingLeft: 'var(--space-3)' } : subjectChip(on)}
                >
                  {c.kind === 'month'
                    ? <><CalendarDays size={18} aria-hidden="true" />今月</>
                    : c.kind === 'year'
                    ? <><CalendarRange size={18} aria-hidden="true" />今年</>
                    : <><MiniCover book={c.book} width={24} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{c.book.title}</span></>}
                </button>
              );
            })}
          </div>
        )}

        {/* プレビュー＝外に出る画像そのもの。押すと大きな画像の編集画面（写真を動かす・言葉・表示する項目）。
            左右に振ると隣の重ね方（記録 → 数字 → 一文）。縦の動きはシートのスクロール・下へ振って閉じるに渡す（pan-y）。 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
          <button
            type="button"
            onClick={onPreviewClick}
            onPointerDown={onPreviewPointerDown}
            onPointerUp={onPreviewPointerUp}
            onPointerCancel={() => { swipeRef.current = null; }}
            aria-label={`${subjectName}の画像（${VARIANT_LABELS[variant]}・${STYLE_LABELS[effStyle]}${effStyle === 'sticker' ? '' : `・${FORMAT_OPTIONS.find((o) => o.v === format)?.aria}`}）を大きくして編集`}
            aria-disabled={status !== 'ready' || undefined}
            style={{
              display: status === 'error' ? 'none' : 'block',
              position: 'relative', height: PREVIEW_H, aspectRatio: aspect, maxWidth: '100%',
              padding: 0, border: 'none', font: 'inherit',
              borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--separator)',
              background: effStyle === 'sticker' ? checker(16) : 'var(--fill)',
              cursor: status === 'ready' ? 'zoom-in' : 'default',
              touchAction: variants.length > 1 ? 'pan-y' : 'auto',
            }}
          >
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              style={{ display: 'block', width: '100%', height: '100%', visibility: status === 'ready' ? 'visible' : 'hidden' }}
            />
            {status === 'loading' && (
              <span style={{ position: 'absolute', inset: 0, display: 'block' }} aria-busy="true" aria-label="画像を作っています">
                <SkeletonBlock width="100%" height="100%" radius="var(--radius)" />
              </span>
            )}
          </button>
          {/* 失敗の案内はプレビューと同じ高さの場所に出す（地を変えて描き直せたときに、下の部品が上下に動かない）。 */}
          {status === 'error' && (
            <div style={{ alignSelf: 'stretch', minHeight: PREVIEW_H, display: 'grid' }}>
              {yearError ? (
                // 今年のメモを読めなかった（数字の欠けた 1 枚は作らない・「もう一度」で読み直す）。
                <ErrorMessage
                  className="error-message--fill"
                  title="今年のメモを読み込めませんでした"
                  description="通信環境を確認して、もう一度お試しください。"
                  actions={[{ label: 'もう一度', onClick: () => { setStatus('loading'); yearM.reload(); } }]}
                />
              ) : (
                <ErrorMessage
                  className="error-message--fill"
                  title="画像を作れませんでした"
                  description={error && !error.startsWith('画像を作れませんでした') ? error : undefined}
                  actions={[{ label: 'もう一度', onClick: () => { setStatus('loading'); setRetry((n) => n + 1); } }]}
                />
              )}
            </div>
          )}
          {/* 別の一文（1 タップで次のメモへ・記録では外すこともできる）と「編集」（大きな画像で直す）。
              描けなかった間も場所は残して見えなくする（描き直せたときに下の部品が上下に動かない・見えない間は押せず読み上げない）。 */}
          {/* 同じ行の右に形（投稿 4:5／ストーリー 9:16）。重ね方の見本に名前の幅を空けるため、見本の行から移した（2026-10-08）。 */}
          <div
            aria-hidden={status === 'error' || undefined}
            style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: 'var(--space-3)', rowGap: 'var(--space-1)', flexWrap: 'wrap', marginLeft: 'calc(-1 * var(--space-1))', visibility: status === 'error' ? 'hidden' : 'visible' }}
          >
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {swapLabel && (
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
            <button
              type="button"
              disabled={status !== 'ready'}
              onClick={openEditor}
              style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', color: status === 'ready' ? 'var(--accent)' : 'var(--text-3)', opacity: 1, cursor: status === 'ready' ? 'pointer' : 'default' }}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              編集
            </button>
            </div>
            {effStyle !== 'sticker' && (
              <div role="radiogroup" aria-label="画像の形" style={{ display: 'inline-flex', gap: 'var(--space-1)', marginLeft: 'auto' }}>
                {FORMAT_OPTIONS.map((o) => (
                  <button key={o.v} type="button" role="radio" aria-checked={format === o.v} aria-label={o.aria} onClick={() => setFormat(o.v)} style={segBtn(format === o.v)}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 重ね方（記録／数字／一文の見本・プレビューを左右に振っても切り替わる）と形（投稿 4:5／ストーリー 9:16）。
            見本 3 つと形の切り替えが 390 幅の 1 行に入るよう、見本の間は 4。 */}
        {/* 今年のメモを読めなかった間は、見本（空になる）を見せない（場所は残す＝読み直せたときに下が動かない）。 */}
        {variants.length > 1 && (
        <div aria-hidden={yearError || undefined} style={{ visibility: yearError ? 'hidden' : 'visible' }}>
            {/* 見本は等しい幅の列に（名前「書名と数字」「大きな数字」「心に残った一文」が 1 行に入る幅）。 */}
            <div role="radiogroup" aria-label="見せ方" style={{ display: 'grid', gridTemplateColumns: `repeat(${variants.length}, minmax(0, 1fr))`, gap: 'var(--space-1)', margin: '0 calc(-1 * var(--space-1))' }}>
              {variants.map((v) => {
                const on = v === variant;
                return (
                  <button key={v} type="button" role="radio" aria-checked={on} onClick={() => { if (v !== variant) chooseVariant(v); }} style={{ ...thumbBtn, minWidth: 0 }}>
                    <canvas
                      ref={(el) => { thumbRefs.current[v] = el; }}
                      width={thumbW * 2}
                      height={THUMB_H * 2}
                      aria-hidden="true"
                      style={{ display: 'block', width: thumbW, height: THUMB_H, borderRadius: 'var(--radius)', background: effStyle === 'sticker' ? checker(8) : 'var(--fill)', boxShadow: ring(on) }}
                    />
                    {/* 名前は文節の切れ目でだけ折り返す（文字を大きくしたとき）。 */}
                    <span style={{ ...swatchLabel(on), whiteSpace: 'normal', wordBreak: 'keep-all', overflowWrap: 'anywhere', textAlign: 'center' }}>{withPhraseBreaks(VARIANT_LABELS[v])}</span>
                  </button>
                );
              })}
            </div>
        </div>
        )}

        {/* 地。写真があるときは、撮り直す・アルバムから選ぶを文字ボタンで見せ（メニューの奥に隠さない・2026-10-05）、
            背景は右の「背景：写真 ▾」のメニュー 1 つ（写真・紙・夜・表紙の色・透明）。
            写真が無いときは「写真」（撮る・選ぶ）＋紙・夜・表紙の色・透明の見本（2026-09-30 ui-critic）。 */}
        {photo ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap', paddingBottom: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))', marginRight: 'calc(-1 * var(--space-1))' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <button type="button" onClick={openCamera} style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Camera size={18} aria-hidden="true" />
                撮り直す
              </button>
              <button type="button" onClick={openPicker} aria-label="アルバムから選ぶ" style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <ImagePlus size={18} aria-hidden="true" />
                アルバム
              </button>
            </div>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={!!bgMenu}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setBgMenu({ x: r.right - 8, y: r.top - 8 }); }}
              style={{ ...btnLink, display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
            >
              {`背景：${STYLE_LABELS[effStyle]}`}
              <ChevronDown size={16} aria-hidden="true" />
            </button>
            {bgMenu && <ContextMenu x={bgMenu.x} y={bgMenu.y} onClose={() => setBgMenu(null)} items={bgItems} />}
          </div>
        ) : (
          <div role="radiogroup" aria-label="背景" style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', paddingBottom: 'var(--space-2)' }}>
            {/* 390 幅で見本 4 つと 1 行に収まるよう、見える名前は「写真」（読み上げは「写真を選ぶ」）。 */}
            <button type="button" onClick={openPicker} aria-label="写真を撮る・選ぶ" title="写真を撮る・選ぶ" style={photoChip}>
              <ImagePlus size={20} aria-hidden="true" style={{ color: 'var(--text-2)' }} />
              写真
            </button>
            {BG_OPTIONS.filter((v) => v !== 'cover' || coverAllowed).map((v) => (
              // 「透明（ステッカー用）」は 390 幅の 1 行に収まらないので、見える名前は「透明」のまま、
              // 読み上げと長押しの名前で用途まで言う（2026-09-29）。
              <button key={v} type="button" role="radio" aria-checked={effStyle === v} onClick={() => setStyle(v)} style={swatchLabeledBtn}
                aria-label={v === 'sticker' ? '透明（ステッカー用）' : undefined} title={v === 'sticker' ? '透明（ステッカー用）' : undefined}>
                {v === 'cover' && !coverReady
                  // 表紙を読み込むまでは、表紙の色が分からないので骨組みの丸（代用の色を一瞬出さない）。
                  ? <SkeletonBlock width={28} height={28} radius="var(--radius-full)" style={{ boxShadow: ring(effStyle === v) }} />
                  : <span aria-hidden="true" style={swatchDot(v === 'sticker' ? checker(8) : swatchColor(v), effStyle === v)} />}
                <span style={swatchLabel(effStyle === v)}>{STYLE_LABELS[v]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {editorOpen && (
        <ShareEditor
          getOpts={getEditorOpts}
          drawKey={drawKey}
          ready={ready0 && !!drawKey}
          format={format}
          ground={drawStyle}
          canPan={canPan}
          photo={photo}
          view={view}
          onView={setView}
          items={items}
          hidden={hidden}
          onToggleItem={toggleItem}
          phrase={phrase}
          onPhrase={setPhrase}
          onClose={() => {
            // 中身の無い言葉は捨てる（入れかけでやめた）。
            if (phrase && !phraseDisplayText(phrase)) setPhrase(null);
            setEditorOpen(false);
          }}
        />
      )}
    </BottomSheet>
  );
}
