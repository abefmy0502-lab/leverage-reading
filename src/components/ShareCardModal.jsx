// 🖼 共有できる引用カード — メモを 1 枚の画像にしてプレビュー → 共有 / 保存。
//
// 受け取った memo からカードを生成（生成中スピナー → <img> で表示）。
//   📤 共有: navigator.canShare?.({ files }) が true なら共有シート、不可なら
//            自動でダウンロードにフォールバック。
//   💾 保存: Blob をダウンロード（a[download]）。
//   閉じる: × / 背景タップ / Escape。
//
// 生成失敗・共有不可は toast で humanize、クラッシュさせない。Blob URL は revoke。

import { useEffect, useRef, useState } from 'react';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { toMessage } from '../lib/errors';
import { renderQuoteCardBlob } from '../lib/shareCard';
import { X } from 'lucide-react';

const backdrop = {
  position: 'fixed',
  inset: 0,
  zIndex: 320,
  background: 'rgba(20,16,12,0.55)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 18,
  paddingTop: 'calc(18px + env(safe-area-inset-top, 0px))',
  paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
};

const sheet = {
  width: '100%',
  maxWidth: 420,
  maxHeight: '100%',
  background: '#fff',
  borderRadius: 18,
  boxShadow: '0 18px 50px rgba(30,25,20,0.32)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const header = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '14px 8px 14px 18px',
  borderBottom: '1px solid #ece5d8',
  flex: '0 0 auto',
};

const closeBtn = {
  width: 44,
  height: 44,
  minWidth: 44,
  border: 'none',
  background: 'none',
  color: '#8a7e6b',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

const body = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
};

const previewBox = {
  width: '100%',
  aspectRatio: '1080 / 1350',
  borderRadius: 12,
  border: '1px solid #e4ddd0',
  background: '#faf6f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const footer = {
  display: 'flex',
  gap: 10,
  padding: '12px 16px',
  borderTop: '1px solid #ece5d8',
  flex: '0 0 auto',
};

const btnPrimary = (disabled) => ({
  flex: 1,
  minHeight: 48,
  padding: '12px 16px',
  borderRadius: 12,
  border: 'none',
  background: '#5c5043',
  color: '#faf6f0',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: 0.5,
});

const btnGhost = (disabled) => ({
  flex: 1,
  minHeight: 48,
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid #d4ccbe',
  background: '#faf6f0',
  color: '#5c5043',
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 600,
});

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 少し遅らせて revoke（クリック直後の取得を確実にするため）
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export default function ShareCardModal({ memo, bookTitle, author, onClose }) {
  const toast = useToast();
  const haptic = useHaptic();

  const [blob, setBlob] = useState(null);
  const [imgUrl, setImgUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const objectUrlRef = useRef(null);

  const quote = (memo?.text || '').trim();
  const page = Number.isFinite(memo?.pageNumber) ? memo.pageNumber : null;

  // 生成（モーダルが開いている間に 1 回）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    renderQuoteCardBlob({ quote, bookTitle, author, page })
      .then((b) => {
        if (cancelled) return;
        const url = URL.createObjectURL(b);
        objectUrlRef.current = url;
        setBlob(b);
        setImgUrl(url);
        setLoading(false);
        haptic.light();
      })
      .catch((e) => {
        if (cancelled) return;
        console.error('share card render error', e);
        setError(toMessage(e, '画像の生成に失敗しました。'));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // アンマウント時に Blob URL を revoke
  useEffect(() => () => {
    if (objectUrlRef.current) {
      try { URL.revokeObjectURL(objectUrlRef.current); } catch { /* ignore */ }
    }
  }, []);

  // Escape で閉じる
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shareText = (() => {
    const t = (bookTitle || '').trim();
    return t ? `『${t}』より` : '';
  })();

  const handleShare = async () => {
    if (!blob) return;
    const file = new File([blob], 'orime.png', { type: 'image/png' });
    try {
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
        haptic.success();
      } else {
        // 共有不可な環境では自動でダウンロードへフォールバック
        downloadBlob(blob, 'orime.png');
        haptic.success();
        toast.info('共有に対応していないため、画像を保存しました');
      }
    } catch (e) {
      // ユーザーが共有シートをキャンセルした場合は黙って無視
      if (e && e.name === 'AbortError') return;
      console.error('share error', e);
      toast.error(toMessage(e, '共有できませんでした。'));
    }
  };

  const handleSave = () => {
    if (!blob) return;
    try {
      downloadBlob(blob, 'orime.png');
      haptic.success();
      toast.success('画像を保存しました');
    } catch (e) {
      console.error('save error', e);
      toast.error(toMessage(e, '保存できませんでした。'));
    }
  };

  return (
    <div
      style={backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="引用カードを共有"
    >
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#3d362c', flex: 1 }}>
            🖼 画像で共有
          </span>
          <button type="button" style={closeBtn} onClick={onClose} aria-label="閉じる">
            <X size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div style={body}>
          <div style={previewBox}>
            {loading && (
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: '#8a7e6b' }}
                aria-live="polite"
                aria-busy="true"
              >
                <span className="skeleton" style={{ width: 40, height: 40, borderRadius: 999 }} aria-hidden="true" />
                <span style={{ fontSize: 12 }}>カードを作成中…</span>
              </div>
            )}
            {!loading && error && (
              <div style={{ padding: 24, textAlign: 'center', color: '#a05040', fontSize: 13, lineHeight: 1.7 }} role="alert">
                {error}
              </div>
            )}
            {!loading && !error && imgUrl && (
              <img
                src={imgUrl}
                alt="メモから作成した引用カードのプレビュー"
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
              />
            )}
          </div>
          {!loading && !error && (
            <p style={{ fontSize: 11, color: '#a89e8c', margin: 0, lineHeight: 1.7, textAlign: 'center' }}>
              この 1 枚だけを外に出せます。SNS への自動投稿はしません。
            </p>
          )}
        </div>

        <div style={footer}>
          <button
            type="button"
            style={btnPrimary(loading || !!error || !blob)}
            onClick={handleShare}
            disabled={loading || !!error || !blob}
          >
            📤 共有
          </button>
          <button
            type="button"
            style={btnGhost(loading || !!error || !blob)}
            onClick={handleSave}
            disabled={loading || !!error || !blob}
          >
            💾 保存
          </button>
        </div>
      </div>
    </div>
  );
}
