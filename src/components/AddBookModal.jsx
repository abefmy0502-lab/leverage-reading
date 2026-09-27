// AddBookModal — 全画面の「本を追加」。検索欄 1 つ＋結果＋バーコード＋手動入力を 1 画面で完結。
//
// 検索欄・結果一覧・検索の振り分け（書名 / 著者 / ISBN）は BookSearchModal.jsx の共通部品を使う
// （このファイルは遅延読み込みなので、共通部品は常に読み込まれている側に置いてある）。
//
// 状態（useBookQuerySearch）:
//   'idle'      : 初期。検索欄＋バーコード＋手動入力
//   'searching' : 検索中（結果の形のスケルトン）
//   'results'   : 結果あり（本棚にある本は「追加済み」・押すとその本を開く）
//   'notfound'  : 0 件（手動入力へ）
//   'error'     : 検索エラー（もう一度試す / 手動入力）

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanBarcode, Camera, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { findDuplicateBook, STATUS_LABEL } from '../lib/checkDuplicate';
import { btnPrimary, btnGhost, btnText } from '../styles/ui';
import {
  BookSearchField,
  BookSearchStatus,
  SearchButton,
  manualSeedFromQuery,
  normalizeBookQuery,
  useBookQuerySearch,
} from './BookSearchModal';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 200,
  background: 'var(--bg)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--font-ui)',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const headerStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  minHeight: 44,
  padding: 'var(--space-1) var(--space-4)',
  borderBottom: '1px solid var(--separator)',
};

const bodyStyle = {
  flex: 1,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  overscrollBehavior: 'contain',
  padding: 'var(--space-4) var(--space-4) var(--space-8)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

// ---------------------------------------------------------------------------
// 📷 バーコード読み取り
// ---------------------------------------------------------------------------

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

// カメラ画面は明るい画面・暗い画面どちらでも黒地（ファインダーは UI ではなく映像そのもの）。
// 上に載せる文字・枠は --on-cover（明暗で変えない白）で描く。
const CAMERA_BG = 'black';
const onCoverAlpha = (pct) => `color-mix(in srgb, var(--on-cover) ${pct}%, transparent)`;

const camOverlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  background: CAMERA_BG,
  color: 'var(--on-cover)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--font-ui)',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};

const ISBN_HINT = 'ISBN を入力してください。';

// BarcodeScanner — カメラを起動して書籍バーコード(EAN-13/EAN-8)を読み取り、
// 成功したら onDetect(isbn) を呼ぶ。停止は確実に: アンマウント・close・読取成功
// いずれでも stopStream() が走り、全 track を stop する（カメラ消し忘れ防止）。
function BarcodeScanner({ onDetect, onClose, onTypeIsbn }) {
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
        setScanError(`この端末ではバーコードを読み取れません。${ISBN_HINT}`);
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
              ? `カメラを使えませんでした。端末の「設定」でカメラを許可するか、${ISBN_HINT}`
              : `カメラを起動できませんでした。${ISBN_HINT}`,
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
            ? `カメラを使えませんでした。ブラウザの設定でカメラを許可するか、${ISBN_HINT}`
            : `カメラを起動できませんでした。${ISBN_HINT}`,
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
    <div ref={trapRef} style={camOverlayStyle} role="dialog" aria-modal="true" aria-label="バーコードを読み取る">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-4)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600 }}>バーコードを読み取る</h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label="閉じる"
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-full)',
            border: 'none',
            padding: 0,
            background: onCoverAlpha(16),
            color: 'var(--on-cover)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {scanError ? (
          <div style={{ width: '100%', padding: 'var(--space-6) var(--space-4)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center' }}><Camera size={32} /></div>
            <p role="alert" style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-body)', lineHeight: 1.5 }}>{scanError}</p>
            {/* 行き止まり防止: 案内している「ISBN を入力」を、そのまま押せる主ボタンにする。 */}
            <button
              type="button"
              onClick={() => { handleClose(); onTypeIsbn?.(); }}
              style={btnPrimary}
            >
              ISBN を入力する
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
            {/* 読取ガイド枠（枠の外は暗く落とす） */}
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
                border: '2px solid var(--on-cover)',
                borderRadius: 'var(--radius)',
                boxShadow: '0 0 0 100vmax var(--backdrop)',
              }}
            />
            <p
              aria-live="polite"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 'var(--space-8)',
                margin: 0,
                padding: '0 var(--space-4)',
                textAlign: 'center',
                fontSize: 'var(--text-sub)',
                lineHeight: 1.5,
              }}
            >
              {ready ? 'バーコードを枠に合わせてください' : 'カメラを起動しています…'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 本を追加
// ---------------------------------------------------------------------------

export default function AddBookModal({ onClose, onSelect, onManual, existingBooks = [], onOpenExisting }) {
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef(null);
  const search = useBookQuerySearch();
  // バーコードスキャナ（入れ子ダイアログ）を開いている間は、そちらのトラップに
  // 譲るため本体のトラップを無効化する。
  const trapRef = useFocusTrap(!scanning);

  const hasQuery = !!normalizeBookQuery(query);
  const isSearching = search.status === 'searching';

  // 開いたらすぐ打てるように検索欄へ（フォーカストラップが先頭のボタンへ当てた後に上書き）。
  useEffect(() => {
    try { inputRef.current?.focus(); } catch { /* ignore */ }
  }, []);

  const runSearch = (q = query) => search.run(q);
  const openManual = () => onManual(manualSeedFromQuery(query));

  // 📷 読み取った ISBN を検索欄に入れて、そのまま検索。
  // BarcodeScanner の effect 依存に入るため参照を安定させる（不安定だと親の再レンダーの
  // たびにカメラが止まって取り直され、一瞬固まる）。
  const { run } = search;
  const handleScanDetect = useCallback((scannedIsbn) => {
    setScanning(false);
    if (!scannedIsbn) return;
    setQuery(scannedIsbn);
    run(scannedIsbn);
  }, [run]);
  const closeScanner = useCallback(() => setScanning(false), []);
  const focusQuery = useCallback(() => {
    setTimeout(() => { try { inputRef.current?.focus(); } catch { /* ignore */ } }, 180);
  }, []);

  const getExisting = (book) => {
    const existing = findDuplicateBook(existingBooks, book);
    return existing ? { book: existing, statusLabel: STATUS_LABEL[existing.status] || '本棚' } : null;
  };

  const handlePick = (book, opts = {}) => {
    // 既に本棚にある本は追加せず、その本を開く。
    if (opts.isExisting && opts.existing) {
      onOpenExisting?.(opts.existing);
      return;
    }
    onSelect?.(book);
  };

  // 手動入力の入口は、どの状態でも下の文字ボタン 1 か所だけ。
  const showManualLink = true;

  return (
    <div ref={trapRef} style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby="add-book-title">
      {scanning && (
        <BarcodeScanner onDetect={handleScanDetect} onClose={closeScanner} onTypeIsbn={focusQuery} />
      )}

      <div style={headerStyle}>
        {/* iOS の全画面モーダルの作法: 「キャンセル」は左上（右上は決定の場所）。
            検索中でも閉じられる（応答が返らなくても閉じ込めない。中断はフック側が行う）。 */}
        <button
          type="button"
          onClick={onClose}
          style={{
            justifySelf: 'start',
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'var(--text-body)',
            lineHeight: 1.3,
            color: 'var(--accent)',
          }}
        >
          キャンセル
        </button>
        <h2 id="add-book-title" style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.3, color: 'var(--text)' }}>
          本を追加
        </h2>
        <span />
      </div>

      <div style={bodyStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <BookSearchField
            id="add-book-query"
            value={query}
            onChange={setQuery}
            onSubmit={() => runSearch()}
            inputRef={inputRef}
          />
          <SearchButton
            empty={!hasQuery}
            searching={isSearching}
            onSearch={() => runSearch()}
            onEmpty={() => inputRef.current?.focus()}
          />
          {/* カメラが使える環境だけ（使えない環境ではボタン自体を出さない）。 */}
          {BARCODE_SUPPORTED && (
            <button type="button" onClick={() => setScanning(true)} style={btnGhost}>
              <ScanBarcode size={20} aria-hidden="true" />
              バーコードで探す
            </button>
          )}
        </div>

        {/* 0 件・エラーのときは、説明と「手動で入力する」を 1 まとまりに（次の操作が離れて浮かないように）。 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: (search.status === 'notfound' || search.status === 'error') ? 0 : 'var(--space-6)' }}>
          <BookSearchStatus
            search={search}
            onRetry={() => runSearch()}
            onManual={openManual}
            onPick={handlePick}
            getExisting={getExisting}
          />

          {showManualLink && (
            <button type="button" onClick={openManual} style={{ ...btnText, alignSelf: 'center' }}>
              手動で入力する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
