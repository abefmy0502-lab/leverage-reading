// 📚 AddBookModal — 全画面シート式の本追加 UI（検索 + 結果 + 手動入力切替を 1 画面で完結）。
//
// シンプル化第 2 弾: 旧フローは AddBookModal → 「検索」ボタン → 別の
// BookSearchModal に遷移、という 2 段階だった。今回はそれを撤廃し、
// 同じモーダル内に 3 入力欄・検索ボタン・結果リスト・手動入力リンク
// すべてを収めて、画面遷移なしで完結させる。
//
// 状態マシン:
//   'idle'      : 初期。フォームのみ + 手動入力リンク
//   'searching' : 検索中（フォーム disabled、下にスピナー）
//   'results'   : 結果あり
//   'notfound'  : 結果 0 件
//   'error'     : 検索エラー（リトライ可能）

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { findDuplicateBook, STATUS_LABEL } from '../lib/checkDuplicate';
import { searchBooksAdvanced } from '../lib/bookSearch';
import { ensureHttps } from '../lib/url';
import { LIMITS } from '../lib/limits';
import { toMessage } from '../lib/errors';
import { SkeletonBlock } from './Skeleton';

// 表示件数のページング基準。最初は 20、「もっと見る」で +10 ずつ増やし、
// API 負荷とユーザビリティの観点から 50 で打ち止め。
const INITIAL_DISPLAY = 20;
const DISPLAY_STEP = 10;
const MAX_DISPLAY = 50;

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'var(--color-bg, #f5f0e8)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "var(--font-app)",
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const headerStyle = {
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--color-separator)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-2)',
  background: 'var(--color-surface)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const closeBtn = {
  background: 'none',
  border: 'none',
  fontSize: 22,
  color: 'var(--color-secondary)',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
};

const bodyStyle = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: 'var(--space-5) var(--space-4) var(--space-8)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-secondary)',
  display: 'block',
  marginBottom: 6,
};

const inpStyle = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 16,
  border: '1px solid var(--color-separator)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  outline: 'none',
  color: 'var(--color-label)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const searchBtnStyle = {
  width: '100%',
  padding: '14px 0',
  borderRadius: 'var(--radius-md)',
  border: 'none',
  background: 'var(--color-accent-strong)',
  color: 'var(--color-text-inverse)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: 0.5,
  minHeight: 48,
};

const dividerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  color: 'var(--color-tertiary)',
  fontSize: 11,
  margin: 'var(--space-4) 0 var(--space-2)',
};
const dividerLine = { flex: 1, height: 1, background: 'var(--color-separator)' };

const manualBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '12px 16px',
  border: '1px solid var(--color-separator)',
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  color: 'var(--color-secondary)',
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
  width: '100%',
  minHeight: 44,
};

const resultCardStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-separator)',
  background: 'var(--color-surface)',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  width: '100%',
};

function ResultCard({ book, onPick, existing, statusLabel }) {
  // 既に本棚にある本は「✅ 追加済み」バッジを表示し、タップで既存本へ遷移する
  // ように onPick(existing, { isExisting: true }) を呼ぶ。
  const isExisting = !!existing;
  return (
    <button
      type="button"
      onClick={() => onPick(book, { isExisting, existing })}
      aria-label={isExisting ? `『${book.title}』 (既に本棚にあり、開く)` : `『${book.title}』を選択`}
      style={{
        ...resultCardStyle,
        ...(isExisting ? { background: 'var(--c-soft)', borderColor: '#b9d4a3' } : {}),
      }}
    >
      {book.cover ? (
        <img
          src={ensureHttps(book.cover)}
          alt=""
          style={{ width: 44, height: 60, objectFit: 'cover', borderRadius: 4, flexShrink: 0, border: '1px solid var(--color-separator)', opacity: isExisting ? 0.7 : 1 }}
        />
      ) : (
        <div style={{ width: 44, height: 60, background: 'var(--color-bg-hover)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📕</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-label)', lineHeight: 1.4, marginBottom: 2 }}>{book.title}</div>
        {book.author && <div style={{ fontSize: 11, color: 'var(--color-secondary)' }}>✍️ {book.author}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {book.publisher && <span style={{ fontSize: 10, color: 'var(--color-tertiary)' }}>🏢 {book.publisher}</span>}
          {book.pubYear && <span style={{ fontSize: 10, color: 'var(--color-tertiary)' }}>📅 {book.pubYear}</span>}
        </div>
        {book.isbn && <div style={{ fontSize: 10, color: 'var(--color-tertiary)', marginTop: 3 }}>🔢 {book.isbn}</div>}
        {isExisting && (
          <div
            style={{
              marginTop: 6,
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: 999,
              background: '#eaf5e3',
              border: '1px solid #b9d4a3',
              color: '#4a6e3a',
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            ✅ 追加済み（{statusLabel || '本棚'}）— タップで開く
          </div>
        )}
      </div>
    </button>
  );
}

// 検索中の placeholder。スピナー単体より「結果がもうすぐ来る」ことが
// 伝わるよう、実際の結果カードと同じ骨格（表紙 + 2 行）の skeleton を
// 数枚並べる。すべて components.css の .skeleton（shimmer）を再利用し、
// prefers-reduced-motion は global で抑制済み。
function SearchSkeletonRow() {
  return (
    <div style={{ ...resultCardStyle, cursor: 'default' }} aria-hidden="true">
      <SkeletonBlock width={44} height={60} radius={4} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
        <SkeletonBlock width="80%" height={13} radius="var(--radius-full)" />
        <SkeletonBlock width="45%" height={10} radius="var(--radius-full)" />
        <SkeletonBlock width="30%" height={9} radius="var(--radius-full)" />
      </div>
    </div>
  );
}

function SearchSkeleton({ rows = 3 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '4px 0 8px', color: 'var(--color-tertiary)' }}>
        <div
          aria-hidden="true"
          style={{
            width: 16,
            height: 16,
            border: '2px solid var(--color-separator)',
            borderTopColor: 'var(--color-accent-strong)',
            borderRadius: '50%',
            animation: 'lvg-ptr-spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: 12 }}>本を探しています…</span>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <SearchSkeletonRow key={i} />
      ))}
    </div>
  );
}

// ネイティブの Web 標準 BarcodeDetector が使えるか（Android Chrome 等）。
// あれば最速・最省電力なのでこちらを優先する。
const HAS_NATIVE_DETECTOR =
  typeof window !== 'undefined' && 'BarcodeDetector' in window;

// バーコード読取ボタンを出してよいか。カメラ（getUserMedia）が使える HTTPS 環境
// なら true。BarcodeDetector 非対応端末（iOS Safari / WKWebView 等）は ZXing を
// 遅延ロードしてフォールバックするので、もはや BarcodeDetector の有無は問わない。
const BARCODE_SUPPORTED =
  typeof window !== 'undefined' &&
  !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
  window.isSecureContext !== false;

const camOverlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  background: '#000',
  display: 'flex',
  flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

// 📷 BarcodeScanner — カメラを起動して書籍バーコード(EAN-13/EAN-8)を読み取り、
// 成功したら onDetect(isbn) を呼ぶ。停止は確実に: アンマウント・close・読取成功
// いずれでも stopStream() が走り、全 track を stop する（カメラ消し忘れ防止）。
function BarcodeScanner({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const rafRef = useRef(null);
  const zxingControlsRef = useRef(null); // ZXing フォールバック時のカメラ停止ハンドル
  const doneRef = useRef(false); // 二重発火防止（成功 or close で立てる）
  const [scanError, setScanError] = useState(null);
  const [ready, setReady] = useState(false);
  const trapRef = useFocusTrap(true);

  const stopStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // ZXing フォールバックのカメラ＆デコードループを停止（自前 stream とは別管理）。
    if (zxingControlsRef.current) {
      try { zxingControlsRef.current.stop(); } catch { /* ignore */ }
      zxingControlsRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      try { v.pause(); } catch { /* ignore */ }
      v.srcObject = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    stopStream();
    onClose?.();
  }, [stopStream, onClose]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // 二重ガード: 親が出すのは BARCODE_SUPPORTED 時のみだが、ここでも防御。
      if (!BARCODE_SUPPORTED) {
        setScanError('お使いのブラウザはバーコード読取に未対応です。ISBN を手入力してください。');
        return;
      }
      // ===== 経路A: ネイティブ BarcodeDetector（あれば最優先・最省電力）=====
      if (HAS_NATIVE_DETECTOR) {
        try {
          detectorRef.current = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
        } catch {
          detectorRef.current = null;
        }
      }

      // ===== 経路B: ZXing フォールバック（iOS Safari / WKWebView 等、BarcodeDetector
      //        非対応端末）。ライブラリは遅延 import なので初回ロードには影響しない。 =====
      if (!detectorRef.current) {
        try {
          const [{ BrowserMultiFormatReader }, lib] = await Promise.all([
            import('@zxing/browser'),
            import('@zxing/library'),
          ]);
          if (cancelled || doneRef.current) return;
          const hints = new Map();
          hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.EAN_13, lib.BarcodeFormat.EAN_8]);
          const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
          const v = videoRef.current;
          if (!v) return;
          // decodeFromConstraints が getUserMedia(背面カメラ) → video 再生 → 連続デコードを担う。
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } }, audio: false },
            v,
            (result) => {
              if (cancelled || doneRef.current || !result) return;
              const raw = (result.getText() || '').replace(/[^0-9]/g, '');
              if (raw.length === 13 && (raw.startsWith('978') || raw.startsWith('979'))) {
                doneRef.current = true;
                stopStream();
                onDetect?.(raw);
              }
            },
          );
          if (cancelled || doneRef.current) { try { controls.stop(); } catch { /* ignore */ } return; }
          zxingControlsRef.current = controls;
          setReady(true);
        } catch (e) {
          if (cancelled) return;
          const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
          setScanError(
            denied
              ? 'カメラの使用が許可されませんでした。ブラウザの設定でカメラを許可するか、ISBN を手入力してください。'
              : 'カメラを起動できませんでした。ISBN を手入力してください。',
          );
        }
        return;
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (e) {
        if (cancelled) {
          try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
          return;
        }
        // 権限拒否・カメラ無し等。クラッシュさせず案内のみ。
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        setScanError(
          denied
            ? 'カメラの使用が許可されませんでした。ブラウザの設定でカメラを許可するか、ISBN を手入力してください。'
            : 'カメラを起動できませんでした。ISBN を手入力してください。',
        );
        return;
      }

      if (cancelled) {
        try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) {
        try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        return;
      }
      v.srcObject = stream;
      try { await v.play(); } catch { /* iOS で自動再生に失敗しても scan は試行 */ }
      if (cancelled) return;
      setReady(true);

      const tick = async () => {
        if (cancelled || doneRef.current) return;
        const detector = detectorRef.current;
        const video = videoRef.current;
        if (detector && video && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            if (cancelled || doneRef.current) return;
            const hit = codes && codes.find((c) => {
              const raw = (c.rawValue || '').replace(/[^0-9]/g, '');
              // 書籍バーコードは ISBN-13（978 / 979 始まりの 13 桁）
              return raw.length === 13 && (raw.startsWith('978') || raw.startsWith('979'));
            });
            if (hit) {
              const isbn = (hit.rawValue || '').replace(/[^0-9]/g, '');
              doneRef.current = true;
              stopStream();
              onDetect?.(isbn);
              return;
            }
          } catch {
            // detect の一過性エラーは無視して次フレーム継続。
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream, onDetect]);

  return (
    <div ref={trapRef} style={camOverlayStyle} role="dialog" aria-modal="true" aria-label="バーコードをスキャン">
      <div
        style={{
          padding: 'var(--space-3) var(--space-4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          color: '#fff',
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: 'inherit' }}>📷 バーコードをスキャン</span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="閉じる"
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: '#fff',
            fontSize: 22,
            cursor: 'pointer',
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {scanError ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: '#fff', maxWidth: 360 }}>
            <div aria-hidden="true" style={{ fontSize: 36, marginBottom: 'var(--space-3)' }}>📷</div>
            <p role="alert" style={{ fontSize: 14, lineHeight: 1.7, margin: 0, fontFamily: 'inherit' }}>{scanError}</p>
            <button
              type="button"
              onClick={handleClose}
              style={{
                marginTop: 'var(--space-5)',
                padding: '12px 20px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: '#fff',
                color: '#111',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                minHeight: 44,
              }}
            >
              閉じる
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* 読取ガイド枠 */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '72%',
                maxWidth: 320,
                height: 120,
                border: '2px solid rgba(255,255,255,0.9)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
              }}
            />
            <div
              aria-live="polite"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 'calc(var(--space-6) + env(safe-area-inset-bottom, 0px))',
                textAlign: 'center',
                color: '#fff',
                fontSize: 13,
                lineHeight: 1.6,
                padding: '0 var(--space-5)',
                fontFamily: 'inherit',
              }}
            >
              {ready
                ? '本の裏のバーコードを枠内に合わせてください'
                : 'カメラを起動しています…'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AddBookModal({ onClose, onSelect, onManual, existingBooks = [], onOpenExisting }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [state, setState] = useState('idle'); // 'idle' | 'searching' | 'results' | 'notfound' | 'error'
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [displayCount, setDisplayCount] = useState(INITIAL_DISPLAY);
  const [scanning, setScanning] = useState(false);
  // 直近の検索 AbortController を保持。新しい検索 / モーダル close 時に
  // 既存リクエストを中断して、後着の応答が state を上書きする race を防ぐ。
  const abortRef = useRef(null);
  useEffect(() => () => { try { abortRef.current?.abort(); } catch { /* ignore */ } }, []);
  // バーコードスキャナ（入れ子ダイアログ）を開いている間は、そちらのトラップに
  // 譲るため本体のトラップを無効化する。
  const trapRef = useFocusTrap(!scanning);

  const hasInput = !!(title.trim() || author.trim() || isbn.trim());
  const isSearching = state === 'searching';

  const runSearch = async (override) => {
    // override は { title, author, isbn } の部分指定。バーコード読取直後など
    // setState の反映前に最新値で検索したいケースで使う。
    const q = {
      title: (override?.title ?? title).trim(),
      author: (override?.author ?? author).trim(),
      isbn: (override?.isbn ?? isbn).trim(),
    };
    if (!q.title && !q.author && !q.isbn) return;
    // 直前の検索があれば中断 — 連続検索で後着の結果が state を上書きして
    // 「画面が固まる」現象を起こすのを防ぐ最大の対策。
    try { abortRef.current?.abort(); } catch { /* ignore */ }
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setState('searching');
    setError(null);
    setResults([]);
    setDisplayCount(INITIAL_DISPLAY);

    let res;
    try {
      res = await searchBooksAdvanced(
        { title: q.title, author: q.author, isbn: q.isbn },
        { signal: ctrl.signal },
      );
    } catch (e) {
      // abort で投げられた AbortError は最新の検索が支配しているので、
      // 古いハンドラはここで早期 return する。state は触らない。
      if (e?.name === 'AbortError' || ctrl.signal.aborted) return;
      // 生エラーが万一漏れても toMessage で humanize（生スタック/SQL を出さない）
      setError(toMessage(e, '検索でエラーが発生しました。'));
      setState('error');
      return;
    }

    // 自分が aborted されている = 後続の検索が始まっている = state を上書きしない
    if (ctrl.signal.aborted) return;

    if (!res.ok) {
      // res.error は bookSearch 側で用意済みの安全な日本語だが、念のため
      // toMessage を通して将来の生エラー混入を防ぐ。
      setError(toMessage(res.error, '検索でエラーが発生しました。'));
      setState('error');
      return;
    }
    if (!res.results || res.results.length === 0) {
      setState('notfound');
      return;
    }
    setResults(res.results);
    setState('results');
  };

  const onEnter = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      runSearch();
    }
  };

  // 📷 バーコード読取成功 → ISBN 欄に流し込み、他条件をクリアして既存検索へ委譲。
  const handleScanDetect = (scannedIsbn) => {
    setScanning(false);
    if (!scannedIsbn) return;
    setIsbn(scannedIsbn);
    setTitle('');
    setAuthor('');
    // setState の反映を待たず override で即検索（既存 runSearch をそのまま利用）。
    runSearch({ isbn: scannedIsbn, title: '', author: '' });
  };

  const handlePick = (book, opts = {}) => {
    // 既に本棚にある本は追加せず、親に既存本を開かせる。
    if (opts.isExisting && opts.existing) {
      onOpenExisting?.(opts.existing);
      return;
    }
    onSelect?.(book);
  };

  // 表示件数 = min(displayCount, results.length, MAX_DISPLAY)
  const visibleCount = Math.min(displayCount, results.length, MAX_DISPLAY);
  const visibleResults = results.slice(0, visibleCount);
  // 「もっと見る」が押せるのは: ロード済み結果が残っていて、かつ 50 上限未満。
  const canShowMore = visibleCount < Math.min(results.length, MAX_DISPLAY);
  const tooMany = results.length >= 20;

  return (
    <div ref={trapRef} style={overlayStyle} role="dialog" aria-modal="true">
      {scanning && (
        <BarcodeScanner
          onDetect={handleScanDetect}
          onClose={() => setScanning(false)}
        />
      )}
      <div style={headerStyle}>
        <h2 style={{ fontSize: 16, color: 'var(--color-label)', margin: 0, fontWeight: 600, flex: 1 }}>📚 本を追加</h2>
        <button type="button" onClick={onClose} style={closeBtn} aria-label="閉じる" disabled={isSearching} aria-disabled={isSearching}>×</button>
      </div>

      <div style={bodyStyle}>
        <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: 0, lineHeight: 1.7 }}>
          ISBN（本の裏のバーコード番号）・書名・著者で検索できます
        </p>
        {/* === Form (常に上部に表示) === */}
        <div>
          <label htmlFor="add-book-title" style={labelStyle}>タイトル</label>
          <input
            id="add-book-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onEnter}
            placeholder="例：レバレッジ・リーディング"
            style={inpStyle}
            maxLength={LIMITS.bookTitle}
            disabled={isSearching}
          />
        </div>
        <div>
          <label htmlFor="add-book-author" style={labelStyle}>
            著者 <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="add-book-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onKeyDown={onEnter}
            placeholder="例：本田 直之"
            style={inpStyle}
            maxLength={LIMITS.bookAuthor}
            disabled={isSearching}
          />
        </div>
        <div>
          <label htmlFor="add-book-isbn" style={labelStyle}>
            ISBN <span style={{ fontWeight: 400, color: 'var(--color-tertiary)' }}>（任意）</span>
          </label>
          <input
            id="add-book-isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            onKeyDown={onEnter}
            placeholder="978-4-7631-9742-3"
            style={inpStyle}
            maxLength={LIMITS.bookIsbn}
            inputMode="numeric"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isSearching}
          />
        </div>

        <button
          type="button"
          onClick={() => runSearch()}
          disabled={!hasInput || isSearching}
          style={{ ...searchBtnStyle, opacity: !hasInput || isSearching ? 0.5 : 1 }}
        >
          {isSearching ? '検索中…' : '🔍 検索'}
        </button>

        {/* 📷 バーコードで追加（対応端末のみ）。iOS Safari 等 BarcodeDetector
            未対応の端末では BARCODE_SUPPORTED=false → ボタン自体を非表示。 */}
        {BARCODE_SUPPORTED && (
          <button
            type="button"
            onClick={() => setScanning(true)}
            disabled={isSearching}
            style={{ ...manualBtnStyle, opacity: isSearching ? 0.5 : 1 }}
          >
            📷 バーコードで追加
          </button>
        )}

        {/* === 結果エリア (状態に応じて切替) === */}

        {state === 'idle' && (
          <>
            <div style={dividerStyle}>
              <div style={dividerLine} />
              <span>または</span>
              <div style={dividerLine} />
            </div>
            <button type="button" onClick={onManual} style={manualBtnStyle}>
              📝 検索でヒットしない場合は手動入力
            </button>
          </>
        )}

        {/* === 動的領域: 状態遷移を支援技術へ通知（過剰でない polite） === */}
        <div aria-live="polite" aria-busy={isSearching} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {isSearching && <SearchSkeleton />}

        {state === 'error' && (
          <div role="alert" style={{ background: 'var(--color-error-soft)', border: '1px solid var(--color-error)', borderLeft: '4px solid var(--color-error)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <p style={{ fontSize: 14, color: 'var(--color-label)', margin: 0, fontWeight: 600 }}>⚠️ 検索でエラーが発生しました</p>
            <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: '6px 0 10px', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{error}</p>
            <button
              type="button"
              onClick={() => runSearch()}
              style={{
                padding: '10px 16px', borderRadius: 'var(--radius-md)', border: 'none',
                background: 'var(--color-accent-strong)', color: 'var(--color-text-inverse)',
                fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
                minHeight: 44,
              }}
            >
              ↻ もう一度試す
            </button>
            <button
              type="button"
              onClick={onManual}
              style={{ ...manualBtnStyle, marginTop: 'var(--space-3)' }}
            >
              📝 手動で追加する
            </button>
          </div>
        )}

        {state === 'notfound' && (
          <div style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-2)' }}>
            <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 'var(--space-2)' }}>🔍</div>
            <p style={{ fontSize: 14, color: 'var(--color-label)', margin: 0, fontWeight: 600, lineHeight: 1.6 }}>
              該当する本が見つかりませんでした
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-secondary)', margin: '6px 0 16px', lineHeight: 1.7 }}>
              書名を変えて再検索するか、ISBN（本の裏のバーコード番号）で検索すると見つかりやすくなります。
            </p>
            <button type="button" onClick={onManual} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', minHeight: 48, padding: '13px 18px', borderRadius: 'var(--radius-md)',
              border: 'none', background: 'var(--color-accent-strong)', color: 'var(--color-text-inverse)',
              fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              📝 このまま手動で追加する
            </button>
          </div>
        )}

        {state === 'results' && (
          <>
            <p style={{ fontSize: 12, color: 'var(--color-secondary)', margin: 0, fontWeight: 500 }}>
              {results.length} 件中 {visibleCount} 件を表示
            </p>
            {tooMany && (
              <p style={{ fontSize: 11, color: 'var(--color-secondary)', margin: 0 }}>
                💡 著者や ISBN を追加で絞り込めます
              </p>
            )}
            <div className="list-item-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visibleResults.map((b, i) => {
                // ISBN がある時は ISBN ベース、無い時は title+index で衝突回避。
                // 連続検索後に key が前回と被ると React の reconcile が崩れるバグを防ぐ。
                const existing = findDuplicateBook(existingBooks, b);
                const statusLabel = existing ? (STATUS_LABEL[existing.status] || '本棚') : null;
                return (
                  <div key={`r-${b.isbn || `${b.title}-${i}`}`} className="list-item-enter">
                    <ResultCard book={b} onPick={handlePick} existing={existing} statusLabel={statusLabel} />
                  </div>
                );
              })}
            </div>
            {canShowMore && (
              <button
                type="button"
                onClick={() => setDisplayCount((n) => Math.min(n + DISPLAY_STEP, MAX_DISPLAY, results.length))}
                aria-label={`さらに ${Math.min(DISPLAY_STEP, results.length - visibleCount, MAX_DISPLAY - visibleCount)} 件表示`}
                style={{
                  ...manualBtnStyle,
                  background: 'var(--color-accent-soft)',
                  border: '1px solid var(--color-separator)',
                  color: 'var(--color-accent-strong)',
                  fontWeight: 600,
                }}
              >
                ↓ もっと見る（あと {Math.min(DISPLAY_STEP, results.length - visibleCount, MAX_DISPLAY - visibleCount)} 件）
              </button>
            )}
            {!canShowMore && results.length > MAX_DISPLAY && (
              <p style={{ fontSize: 11, color: 'var(--color-secondary)', margin: 0, textAlign: 'center' }}>
                これ以上は表示しません。著者や ISBN を追加して絞り込めます。
              </p>
            )}
            <button
              type="button"
              onClick={onManual}
              style={{ ...manualBtnStyle, marginTop: 'var(--space-3)' }}
            >
              📝 該当が無ければ手動入力
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
