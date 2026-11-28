// 📷 QR コードを読み取る（2026-11-28 オーナー「インスタグラムのように QR コードでアカウント交換」）。
//   相手のプロフィールの QR（フォローのリンク）を読むと、すぐに onFound(publicId) を呼んで閉じる。
//   カメラの開き方・許可が無いときの案内・明暗どちらでも黒地は、バーコードの読み取り（BarcodeScanner）と同じ。
//   Android などの BarcodeDetector があればそれを、無ければ ZXing の QR の読み取り（使うときに読み込む）。
//   映像はどこにも送らない。orime の QR でないとき・自分の QR のときは、枠の下の 1 行で知らせて読み続ける。
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X } from 'lucide-react';
import { withPhraseBreaks } from './TightBubble';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useHaptic } from '../hooks/useHaptic';
import { btnPrimary } from '../styles/ui';
import { canOpenAppSettings, openAppSettings } from '../lib/sharePhotoPick';
import { scanResult } from '../lib/followQr';
import { track } from '../lib/analytics';

const HAS_NATIVE_DETECTOR = typeof window !== 'undefined' && 'BarcodeDetector' in window;
export const QR_SCAN_SUPPORTED =
  typeof window !== 'undefined' &&
  !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
  window.isSecureContext !== false;

let qrEngine = null;
function loadQrEngine() {
  if (!qrEngine) {
    qrEngine = Promise.all([import('@zxing/browser'), import('@zxing/library')])
      .then(([browser, lib]) => {
        const hints = new Map();
        hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.QR_CODE]);
        return { reader: new browser.BrowserQRCodeReader(hints) };
      })
      .catch((e) => { qrEngine = null; throw e; });
  }
  return qrEngine;
}

const onCoverAlpha = (pct) => `color-mix(in srgb, var(--on-cover) ${pct}%, transparent)`;
const overlay = {
  // シート（--z-dialog の上の本体）より前・確かめるダイアログ（--z-confirm）より後ろ。body に出す（シートの下に隠れないように）。
  position: 'fixed', inset: 0, zIndex: 'calc(var(--z-dialog) + 2)', background: 'var(--focus-bg)', color: 'var(--on-cover)',
  display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-ui)',
  paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
};
const roundBtn = {
  width: 'var(--tap-min)', height: 'var(--tap-min)', borderRadius: 'var(--radius-full)', border: 'none', padding: 0,
  background: onCoverAlpha(16), color: 'var(--on-cover)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};
const DEFAULT_HINT = '相手の QR コードを枠の中に';

/** myPublicId: 自分の ID（自分の QR を読んだと分かるように）。onFound(publicId)・onClose()。 */
export default function QrScanner({ myPublicId = '', onFound, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const closedRef = useRef(false);
  const hintTimerRef = useRef(null);
  const trapRef = useFocusTrap(true);
  const haptic = useHaptic();
  const [error, setError] = useState(null);
  const [settingsDenied, setSettingsDenied] = useState(false);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(DEFAULT_HINT);
  const lastOtherRef = useRef('');

  const stopAll = useCallback(() => {
    clearTimeout(loopRef.current);
    if (typeof loopRef.current === 'number') cancelAnimationFrame(loopRef.current);
    loopRef.current = null;
    clearTimeout(hintTimerRef.current);
    const s = streamRef.current;
    if (s) { try { s.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ } streamRef.current = null; }
    const v = videoRef.current;
    if (v) { try { v.pause(); } catch { /* ignore */ } v.srcObject = null; }
  }, []);

  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    stopAll();
    onClose?.();
  }, [stopAll, onClose]);

  const handleText = useCallback((text) => {
    if (closedRef.current) return;
    const r = scanResult(text, myPublicId);
    if (r.kind === 'follow') {
      closedRef.current = true;
      try { haptic.success(); } catch { /* ignore */ }
      track('follow_qr', { action: 'scanned' });
      stopAll();
      onFound?.(r.id);
      return;
    }
    // 同じ QR を映している間は、知らせを出し直さない
    if (lastOtherRef.current === text) return;
    lastOtherRef.current = text;
    try { haptic.warning(); } catch { /* ignore */ }
    setHint(r.kind === 'self' ? 'これはあなたの QR コードです。相手の QR を映してください。' : 'orime のプロフィールの QR コードではありません。');
    clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => { setHint(DEFAULT_HINT); lastOtherRef.current = ''; }, 3000);
  }, [myPublicId, haptic, stopAll, onFound]);
  const handleRef = useRef(handleText);
  handleRef.current = handleText;

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!QR_SCAN_SUPPORTED) { setError('この端末では QR コードを読み取れません。相手に ID を教えてもらい、「ID でフォロー」から入れてください。'); return; }
      let detector = null;
      if (HAS_NATIVE_DETECTOR) {
        try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
      }
      const enginePromise = detector ? Promise.resolve(null) : loadQrEngine();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        if (cancelled) return;
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        if (denied && canOpenAppSettings()) { setSettingsDenied(true); setError('カメラの使用が許可されていません。'); return; }
        setError(denied ? 'カメラを使えませんでした。端末の「設定」でカメラを許可してください。' : 'カメラを起動できませんでした。');
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      try { await v.play(); } catch { /* iOS の自動再生の失敗は無視して読み取りは続ける */ }
      let engine = null;
      if (!detector) {
        try { engine = await enginePromise; } catch {
          if (!cancelled) setError('読み取りの準備ができませんでした。もう一度開いてください。');
          return;
        }
      }
      if (cancelled) return;
      setReady(true);
      const canvas = canvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = async () => {
        if (cancelled || closedRef.current) return;
        if (v.readyState >= 2) {
          try {
            if (detector) {
              const codes = await detector.detect(v);
              const hit = (codes || []).map((c) => String(c.rawValue || '')).find(Boolean);
              if (hit) handleRef.current(hit);
            } else {
              // 真ん中の正方形（短い辺の 80%）を 720 まで縮めて読む＝軽く・離れた QR も読める
              const vw = v.videoWidth; const vh = v.videoHeight;
              if (vw && vh) {
                const side = Math.round(Math.min(vw, vh) * 0.8);
                const out = Math.min(720, side);
                if (canvas.width !== out) { canvas.width = out; canvas.height = out; }
                ctx.drawImage(v, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, out, out);
                try {
                  const res = engine.reader.decodeFromCanvas(canvas);
                  const text = String(res?.getText?.() || '');
                  if (text) handleRef.current(text);
                } catch { /* 見つからない（NotFound）は次へ */ }
              }
            }
          } catch { /* 一過性のエラーは次へ */ }
        }
        loopRef.current = detector ? requestAnimationFrame(tick) : setTimeout(tick, 60);
      };
      tick();
    }
    start();
    return () => { cancelled = true; stopAll(); };
  }, [stopAll]);

  return createPortal(
    <div ref={trapRef} style={overlay} role="dialog" aria-modal="true" aria-label="QR コードを読み取る">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)' }}>
        <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 'var(--text-body)', fontWeight: 600 }}>QR コードを読み取る</h2>
        <button type="button" onClick={close} aria-label="閉じる" style={roundBtn}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {error ? (
          <div style={{ width: '100%', padding: 'var(--space-6) var(--space-4)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center' }}><Camera size={32} /></div>
            <p role="alert" style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-body)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(error)}</p>
            {settingsDenied
              ? <button type="button" onClick={() => { openAppSettings(); }} style={btnPrimary}>設定を開く</button>
              : <button type="button" onClick={close} style={btnPrimary}>閉じる</button>}
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <canvas ref={canvasRef} hidden />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div aria-hidden="true" style={{ width: '64%', maxWidth: 280, aspectRatio: '1 / 1', border: '2px solid var(--on-cover)', borderRadius: 'var(--radius)', boxShadow: '0 0 0 100vmax var(--backdrop)' }} />
              <p aria-live="polite" style={{ margin: 'var(--space-4) 0 0', padding: '0 var(--space-4)', textAlign: 'center', fontSize: 'var(--text-sub)', lineHeight: 1.5, color: onCoverAlpha(90), wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
                {ready ? withPhraseBreaks(hint) : 'カメラを起動しています…'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
