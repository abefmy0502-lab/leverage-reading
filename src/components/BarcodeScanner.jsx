// 📷 バーコードで本を入れる（2026-11-26 作り直し・オーナー「本のバーコードの読み取りのスピードを上げたい・めっちゃ快適に
//   レベルが高いものに」）。AddBookModal から開く。
//
// 速さ:
//   ・読み取りの部品（ZXing）は「本を追加」を開いたときに先に読み込んでおく（preloadBarcodeEngine）＝カメラがすぐ立ち上がる。
//   ・カメラは高めの解像度（1920×1080 を目安）・連続オートフォーカスで開き、画面全体ではなく「枠の中」だけを切り出して読む
//     （1 回の読み取りが軽い＝回数を多く回せる・離れた小さなバーコードも読める）。Android などの BarcodeDetector があればそれを使う。
//   ・チェックディジットの合う本の ISBN（978/979）だけを受け取る＝読み違いで別の本が出ない。
// 快適さ:
//   ・読めたら枠が光り、軽く震え、カメラのまま下に本のカード（表紙・書名・著者）。状態のボタン（読みたい・積読・読書中・読了）を
//     押すとその場で本棚へ入り、そのまま次の本を読める（続けて何冊でも）。入れた本は「元に戻す」で外せる。
//   ・本棚にある本は「本棚にあります（積読）」と言い、二重に入れない。見つからない本は「ISBN で探す」「手で入れる」。
//   ・暗い所ではライト（使える端末だけ）。最後に選んだ状態は端末に覚える。
// AI は使わない。カメラの映像はどこにも送らない（読んだ ISBN で本を探すだけ）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X, Flashlight, FlashlightOff, Check, RotateCcw } from 'lucide-react';
import { MiniCover } from './BookCards';
import { withPhraseBreaks } from './TightBubble';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHaptic } from '../hooks/useHaptic';
import { btnPrimary, btnLink } from '../styles/ui';
import { canOpenAppSettings, openAppSettings } from '../lib/sharePhotoPick';
import { isBookIsbn13, isRepeatScan, lookupIsbn } from '../lib/barcodeLookup';
import { findDuplicateBook, STATUS_LABEL } from '../lib/checkDuplicate';
import { track } from '../lib/analytics';

// ネイティブの Web 標準 BarcodeDetector（Android Chrome 等）。あれば最速・最省電力なのでこちらを優先する。
const HAS_NATIVE_DETECTOR = typeof window !== 'undefined' && 'BarcodeDetector' in window;
// カメラ（getUserMedia）が使える HTTPS 環境なら読み取りボタンを出す。
export const BARCODE_SUPPORTED =
  typeof window !== 'undefined' &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
  window.isSecureContext !== false;

// 🔥 読み取りの部品を先に読み込む（本を追加を開いたとき・ボタンに触れたとき）。2 回目からは何もしない。
let enginePromise = null;
export function preloadBarcodeEngine() {
  if (HAS_NATIVE_DETECTOR || !BARCODE_SUPPORTED) return null;
  if (!enginePromise) {
    enginePromise = Promise.all([import('@zxing/browser'), import('@zxing/library')])
      .then(([browser, lib]) => {
        const hints = new Map();
        hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.EAN_13]);
        hints.set(lib.DecodeHintType.TRY_HARDER, true);
        return { reader: new browser.BrowserMultiFormatReader(hints), lib };
      })
      .catch((e) => { enginePromise = null; throw e; });
  }
  return enginePromise;
}

const STATUSES = ['want', 'before', 'reading', 'done'];
const LAST_STATUS_KEY = 'orime.barcodeStatus.v1';
const readLastStatus = () => { try { const s = localStorage.getItem(LAST_STATUS_KEY); return STATUSES.includes(s) ? s : 'before'; } catch { return 'before'; } };
const writeLastStatus = (s) => { try { localStorage.setItem(LAST_STATUS_KEY, s); } catch { /* ignore */ } };

// カメラ画面は明暗どちらでも黒地（ファインダーは映像そのもの）。上の文字・枠は --on-cover（明暗で変えない白）。
const onCoverAlpha = (pct) => `color-mix(in srgb, var(--on-cover) ${pct}%, transparent)`;
const overlay = {
  position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', background: 'var(--focus-bg)', color: 'var(--on-cover)',
  display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-ui)',
  paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};
const roundBtn = {
  width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: 'var(--radius-full)', border: 'none', padding: 0,
  background: onCoverAlpha(16), color: 'var(--on-cover)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const ISBN_HINT = 'ISBN を入力してください。';

/**
 * onAdd(book, status) → Promise<outcome|null>（本棚へ入れる・App の importLibrary）
 * onUndo(outcome)（入れた本を外す）
 * onPick(book)（「くわしく入れる」＝今までの本を追加の流れ・スキャナーは閉じる）
 * onManualIsbn(isbn)（見つからないとき「手で入れる」）・onTypeIsbn()（カメラが使えないとき ISBN を打つ）
 */
export default function BarcodeScanner({ existingBooks = [], onAdd, onUndo, onPick, onManualIsbn, onTypeIsbn, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const closedRef = useRef(false);
  const busyRef = useRef(false);   // 本を探している・入れている間は次を読まない
  const lastRef = useRef(null);    // 直前に読んだ ISBN（同じ本を続けて拾わない）
  const lookupCtl = useRef(null);
  const trapRef = useFocusTrap(true);
  const haptic = useHaptic();
  const [error, setError] = useState(null);
  // カメラの許可が無く、iPhone のアプリで設定を直接開けるとき（写真で共有と同じ開き方・ui-critic 2026-11-26）
  const [settingsDenied, setSettingsDenied] = useState(false);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState({ can: false, on: false });
  const [flash, setFlash] = useState(0);          // 読めた瞬間に枠を光らせる
  const [card, setCard] = useState(null);         // { phase: 'looking'|'found'|'missing'|'offline'|'added', isbn, book, existing, status, outcome }
  const [lastStatus, setLastStatus] = useState(readLastStatus);
  const [addedCount, setAddedCount] = useState(0);
  const existingRef = useRef(existingBooks);
  existingRef.current = existingBooks;

  const stopAll = useCallback(() => {
    clearTimeout(loopRef.current);
    if (typeof loopRef.current === 'number') cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    try { lookupCtl.current?.abort(); } catch { /* ignore */ }
    const s = streamRef.current;
    if (s) { try { s.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } streamRef.current = null; }
    const v = videoRef.current;
    if (v) { try { v.pause(); } catch { /* ignore */ } v.srcObject = null; }
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    stopAll();
    onClose?.(addedCount);
  }, [stopAll, onClose, addedCount]);

  // 読めた ISBN を本に引き当てて、カードに出す
  const handleIsbn = useCallback(async (isbn) => {
    if (busyRef.current || closedRef.current) return;
    if (isRepeatScan(lastRef.current, isbn)) return;
    // 出ているカードと同じ本は読み直さない（入れた直後の「元に戻す」を、映ったままのバーコードで消さない・2026-11-26 確かめた）
    if (cardRef.current?.isbn === isbn) { lastRef.current = { isbn, at: Date.now() }; return; }
    lastRef.current = { isbn, at: Date.now() };
    busyRef.current = true;
    setFlash((n) => n + 1);
    try { haptic.success(); } catch { /* ignore */ }
    track('barcode_scanned', {});
    setCard({ phase: 'looking', isbn });
    const ctl = new AbortController();
    lookupCtl.current = ctl;
    try {
      const r = await lookupIsbn(isbn, { signal: ctl.signal });
      if (closedRef.current) return;
      if (!r.ok) { setCard({ phase: 'offline', isbn }); return; }
      if (!r.book) { setCard({ phase: 'missing', isbn }); return; }
      const existing = findDuplicateBook(existingRef.current, r.book) || null;
      setCard({ phase: 'found', isbn, book: r.book, existing });
    } catch (e) {
      if (e?.name !== 'AbortError' && !closedRef.current) setCard({ phase: 'offline', isbn });
    } finally {
      busyRef.current = false;
    }
  }, [haptic]);
  const cardRef = useRef(null);
  cardRef.current = card;
  const handleIsbnRef = useRef(handleIsbn);
  handleIsbnRef.current = handleIsbn;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!BARCODE_SUPPORTED) { setError(`この端末ではバーコードを読み取れません。${ISBN_HINT}`); return; }
      let detector = null;
      if (HAS_NATIVE_DETECTOR) {
        try { detector = new window.BarcodeDetector({ formats: ['ean_13'] }); } catch { detector = null; }
      }
      // 部品の読み込みとカメラの起動を同時に（先読みしてあれば待たない）
      const enginePromiseLocal = detector ? Promise.resolve(null) : preloadBarcodeEngine();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (e) {
        if (cancelled) return;
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        if (denied && canOpenAppSettings()) { setSettingsDenied(true); setError('カメラの使用が許可されていません。'); return; }
        setError(denied ? `カメラを使えませんでした。端末の「設定」でカメラを許可するか、${ISBN_HINT}` : `カメラを起動できませんでした。${ISBN_HINT}`);
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const track0 = stream.getVideoTracks()[0];
      // 連続オートフォーカス・ライトが使えるか（使える端末だけ）
      try {
        const caps = track0?.getCapabilities?.() || {};
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          await track0.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }
        if (caps.torch) setTorch({ can: true, on: false });
      } catch { /* ignore */ }
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      try { await v.play(); } catch { /* iOS の自動再生の失敗は無視して読み取りは続ける */ }
      let engine = null;
      if (!detector) {
        try { engine = await enginePromiseLocal; } catch {
          if (!cancelled) setError(`読み取りの準備ができませんでした。${ISBN_HINT}`);
          return;
        }
      }
      if (cancelled) return;
      setReady(true);

      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      // 枠の中だけを切り出す（映像は object-fit: cover で見えている＝画面の枠の位置を映像の座標に直す・枠より少し広めに）
      //   1 回おきに「見えている横幅いっぱい・枠の上下にも広い帯」も読む＝本を近づけてバーコードが枠からはみ出しても読める
      //   （2026-11-26 偽のカメラで確かめた: 枠だけだと、枠より大きく映ったバーコードを読めなかった）。
      let wide = false;
      const crop = () => {
        const vw = v.videoWidth; const vh = v.videoHeight;
        const fr = frameRef.current?.getBoundingClientRect?.(); const vr = v.getBoundingClientRect();
        if (!vw || !vh || !fr || !vr.width) return null;
        const scale = Math.max(vr.width / vw, vr.height / vh);
        const ox = (vw * scale - vr.width) / 2; const oy = (vh * scale - vr.height) / 2;
        wide = !wide;
        const padX = wide ? Math.max(0, fr.left - vr.left) : fr.width * 0.08;
        const padY = wide ? fr.height * 1.6 : fr.height * 0.35;
        const sx = (fr.left - vr.left - padX + ox) / scale; const sy = (fr.top - vr.top - padY + oy) / scale;
        const sw = (fr.width + padX * 2) / scale; const sh = (fr.height + padY * 2) / scale;
        return { sx: Math.max(0, sx), sy: Math.max(0, sy), sw: Math.min(vw - Math.max(0, sx), sw), sh: Math.min(vh - Math.max(0, sy), sh) };
      };
      const tick = async () => {
        if (cancelled || closedRef.current) return;
        if (!busyRef.current && v.readyState >= 2) {
          try {
            if (detector) {
              const codes = await detector.detect(v);
              const hit = (codes || []).map((c) => String(c.rawValue || '').replace(/[^0-9]/g, '')).find(isBookIsbn13);
              if (hit) handleIsbnRef.current(hit);
            } else {
              const r = crop();
              if (r) {
                // 横は 960 まで縮める（ZXing の 1 次元の読み取りは横の解像度が効く・縦は少しでいい）
                const outW = Math.min(960, Math.round(r.sw));
                const outH = Math.max(80, Math.round(r.sh * (outW / r.sw)));
                if (canvas.width !== outW) canvas.width = outW;
                if (canvas.height !== outH) canvas.height = outH;
                ctx.drawImage(v, r.sx, r.sy, r.sw, r.sh, 0, 0, outW, outH);
                try {
                  const res = engine.reader.decodeFromCanvas(canvas);
                  const code = String(res?.getText?.() || '').replace(/[^0-9]/g, '');
                  if (isBookIsbn13(code)) handleIsbnRef.current(code);
                } catch { /* 見つからない（NotFound）は次へ */ }
              }
            }
          } catch { /* 一過性のエラーは次へ */ }
        }
        // 次の読み取り（ZXing は 1 回ごとに少し息をつく＝画面の動きを止めない）
        loopRef.current = detector ? requestAnimationFrame(tick) : setTimeout(tick, 40);
      };
      tick();
    }
    start();
    return () => { cancelled = true; stopAll(); };
  }, [stopAll]);

  const toggleTorch = async () => {
    const t = streamRef.current?.getVideoTracks?.()[0];
    if (!t) return;
    const on = !torch.on;
    try { await t.applyConstraints({ advanced: [{ torch: on }] }); setTorch({ can: true, on }); } catch { /* ignore */ }
  };

  // 状態を選んで、その場で本棚へ（カメラは止めない）
  const add = async (status) => {
    if (!card?.book || card.phase !== 'found' || busyRef.current) return;
    busyRef.current = true;
    setLastStatus(status); writeLastStatus(status);
    try {
      const outcome = await onAdd?.(card.book, status);
      if (closedRef.current) return;
      if (outcome && (outcome.booksAdded || 0) > 0) {
        try { haptic.light(); } catch { /* ignore */ }
        setAddedCount((n) => n + 1);
        setCard((c) => (c && c.isbn === card.isbn ? { ...c, phase: 'added', status, outcome } : c));
        track('barcode_added', { status });
      } else {
        setCard((c) => (c ? { ...c, phase: 'found', existing: findDuplicateBook(existingRef.current, c.book) || c.existing, failed: true } : c));
      }
    } finally {
      busyRef.current = false;
    }
  };
  const undo = async () => {
    if (!card?.outcome) return;
    const c = card;
    setCard({ ...c, phase: 'found', outcome: null });
    setAddedCount((n) => Math.max(0, n - 1));
    lastRef.current = null;
    try { await onUndo?.(c.outcome); } catch { /* ignore */ }
  };

  const shortTitle = (t) => String(t || '').trim();

  // ---- 下のカード
  const cardBox = {
    margin: '0 var(--space-4) var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius)',
    background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow-3)',
  };
  // 前に選んだ状態は動詞つきの主ボタン（押すと本棚に入る＝「選んだ面」に見せない）・ほかの 3 つは下の枠のボタン。
  //   文字が大きいときは折り返して 2 行に（4 つを 1 行に詰めない・ui-critic 2026-11-26）。
  const primaryAdd = {
    width: '100%', minHeight: 'var(--tap-min)', padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius)',
    border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)',
    fontFamily: 'inherit', fontSize: 'var(--text-body)', fontWeight: 600, cursor: 'pointer',
    marginTop: 'var(--space-3)', wordBreak: 'keep-all', overflowWrap: 'anywhere',
  };
  const statusBtn = {
    flex: '1 1 auto', minWidth: 0, minHeight: 'var(--tap-min)', padding: '0 var(--space-3)',
    borderRadius: 'var(--radius)', fontFamily: 'inherit', fontSize: 'var(--text-sub)', fontWeight: 600, cursor: 'pointer',
    border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', whiteSpace: 'nowrap',
  };
  const linkOnCard = { background: 'none', border: 'none', padding: 'var(--space-2) var(--space-1)', minHeight: 'var(--tap-min)', fontFamily: 'inherit', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' };

  const renderCard = () => {
    if (!card) return null;
    if (card.phase === 'looking') {
      return (
        <div style={{ ...cardBox, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }} role="status">
          <span style={{ width: 40, height: 56, borderRadius: 'var(--radius-cover)', background: 'var(--fill)', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>本を探しています…</span>
        </div>
      );
    }
    if (card.phase === 'missing' || card.phase === 'offline') {
      return (
        <div style={cardBox} role="status">
          <p style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.5 }}>
            {withPhraseBreaks(card.phase === 'offline' ? 'つながらず、本を探せませんでした。' : 'この ISBN の本が見つかりませんでした。')}
          </p>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{`ISBN ${card.isbn}`}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-4)', marginTop: 'var(--space-1)', marginLeft: 'calc(-1 * var(--space-1))' }}>
            {card.phase === 'offline' && <button type="button" style={linkOnCard} onClick={() => { lastRef.current = null; handleIsbn(card.isbn); }}>もう一度</button>}
            <button type="button" style={linkOnCard} onClick={() => { closedRef.current = true; stopAll(); onManualIsbn?.(card.isbn); }}>手で入れる</button>
          </div>
        </div>
      );
    }
    const b = card.book;
    const author = String(b.author || '').split(/[,、，]/)[0].trim();
    return (
      <div style={cardBox} data-barcode-card="">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <MiniCover book={{ id: `isbn:${card.isbn}`, title: b.title, cover: b.cover || '' }} width={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sub)', fontWeight: 600, lineHeight: 1.4, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(shortTitle(b.title), { scriptBreaks: true })}</p>
            {author && <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{author}</p>}
          </div>
        </div>
        {card.phase === 'added' ? (
          <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sub)', fontWeight: 600, color: 'var(--success)', whiteSpace: 'nowrap' }}>
              <Check size="1.1em" aria-hidden="true" />{`${STATUS_LABEL[card.status]}に入れました`}
            </span>
            <button type="button" onClick={undo} style={{ ...linkOnCard, color: 'var(--text-2)', whiteSpace: 'nowrap', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginRight: 'calc(-1 * var(--space-1))' }}>
              <RotateCcw size="1em" aria-hidden="true" />元に戻す
            </button>
          </div>
        ) : card.existing ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--text-sub)', color: 'var(--text-2)' }}>{`本棚にあります（${STATUS_LABEL[card.existing.status] || '本棚'}）`}</span>
          </div>
        ) : (
          <>
            {card.failed && <p role="alert" style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--error)' }}>入れられませんでした。もう一度押してください。</p>}
            <button type="button" onClick={() => add(lastStatus)} style={primaryAdd}>{`${STATUS_LABEL[lastStatus]}に入れる`}</button>
            <div role="group" aria-label="ほかの状態で本棚に入れる" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              {STATUSES.filter((s) => s !== lastStatus).map((s) => (
                <button key={s} type="button" onClick={() => add(s)} aria-label={`${STATUS_LABEL[s]}に入れる`} style={statusBtn}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
            <button type="button" onClick={() => { closedRef.current = true; stopAll(); onPick?.(b); }} style={{ ...linkOnCard, color: 'var(--text-2)', marginLeft: 'calc(-1 * var(--space-1))', marginBottom: 'calc(-1 * var(--space-2))' }}>
              くわしく入れる
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div ref={trapRef} style={overlay} role="dialog" aria-modal="true" aria-label="バーコードで本を入れる">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)' }}>
        <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 'var(--text-body)', fontWeight: 600, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          バーコードで入れる
          {addedCount > 0 && <span style={{ display: 'inline-block', marginLeft: 'var(--space-2)', fontSize: 'var(--text-meta)', fontWeight: 400, color: onCoverAlpha(80) }}>{`${addedCount} 冊を入れました`}</span>}
        </h2>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>
          {torch.can && (
            <button type="button" onClick={toggleTorch} aria-pressed={torch.on} aria-label={torch.on ? 'ライトを消す' : 'ライトをつける'} style={{ ...roundBtn, background: torch.on ? 'var(--on-cover)' : roundBtn.background, color: torch.on ? 'var(--focus-bg)' : 'var(--on-cover)' }}>
              {torch.on ? <Flashlight size={20} aria-hidden="true" /> : <FlashlightOff size={20} aria-hidden="true" />}
            </button>
          )}
          {addedCount > 0 ? (
            // 入れたあとは「完了」（× だと入れた本が取り消されるように見える・iOS の作法）
            <button type="button" onClick={close} style={{ ...roundBtn, width: 'auto', padding: '0 var(--space-4)', whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 'var(--text-body)', fontWeight: 600 }}>完了</button>
          ) : (
            <button type="button" onClick={close} aria-label="閉じる" style={roundBtn}>
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {error ? (
          <div style={{ width: '100%', padding: 'var(--space-6) var(--space-4)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center' }}><Camera size={32} /></div>
            <p role="alert" style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-body)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(error)}</p>
            {settingsDenied ? (
              <>
                <button type="button" onClick={() => { openAppSettings(); }} style={btnPrimary}>設定を開く</button>
                <button type="button" onClick={() => { close(); onTypeIsbn?.(); }} style={{ ...btnLink, alignSelf: 'center', color: 'var(--on-cover)' }}>ISBN を入力する</button>
              </>
            ) : (
              <button type="button" onClick={() => { close(); onTypeIsbn?.(); }} style={btnPrimary}>ISBN を入力する</button>
            )}
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <canvas ref={canvasRef} hidden />
            {/* 枠（外は暗く）と、その下の 1 行。読めた瞬間に枠が光る */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '22%', pointerEvents: 'none' }}>
              <div
                ref={frameRef}
                key={flash}
                aria-hidden="true"
                className={flash ? 'barcode-frame-hit' : undefined}
                style={{ position: 'relative', width: '80%', maxWidth: 360, aspectRatio: '10 / 3', border: '2px solid var(--on-cover)', borderRadius: 'var(--radius)', boxShadow: '0 0 0 100vmax var(--backdrop)', overflow: 'hidden' }}
              >
                {ready && !card && <span className="barcode-scanline" />}
              </div>
              <p aria-live="polite" style={{ margin: 'var(--space-4) 0 0', padding: '0 var(--space-4)', textAlign: 'center', fontSize: 'var(--text-sub)', lineHeight: 1.5, color: onCoverAlpha(90), wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                {!ready ? 'カメラを起動しています…' : card ? '' : withPhraseBreaks('本の裏のバーコード（978 から始まる方）を枠に')}
              </p>
            </div>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>{renderCard()}</div>
          </>
        )}
      </div>
    </div>
  );
}
