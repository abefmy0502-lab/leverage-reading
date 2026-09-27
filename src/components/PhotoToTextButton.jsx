// 📷 写真からメモを起こすボタン。
//
// 本のページを撮影 → Claude(vision) が文章を書き起こし → onText(text) で
// 親のメモ入力欄に流し込む。メモ入力の最大の摩擦「打つのが面倒」を消すための
// 共通ボタン（クイックメモ・全画面メモエディタの両方で再利用）。
//
// 画像は端末側で validateImageFile → downscaleImageForVision で縮小してから
// 送る（body サイズ・トークン・レイテンシを抑える）。AI 利用量メータリングは
// /api/claude 経由で自動適用。

import { useEffect, useRef, useState } from 'react';
import { validateImageFile } from '../lib/limits';
import { downscaleImageForVision } from '../lib/image';
import { extractTextFromImage } from '../lib/ai';
import { toMessage } from '../lib/errors';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { ScanText, RotateCw } from 'lucide-react';
import { usePaywall } from '../state/PaywallContext';
import ErrorMessage from './ErrorMessage';

const baseStyle = {
  minHeight: 44,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-1)',
};
// 読み取り中は薄くせず、枠と文字の色で押せないことを示す（DESIGN §5「押せないボタン」）。
const offStyle = { border: '1px solid var(--separator)', color: 'var(--text-3)', cursor: 'default', opacity: 1 };

export default function PhotoToTextButton({ onText, disabled = false, style }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  // 読み取りに失敗したときの案内（シートの中に出す）。写真は持っておき「もう一度試す」で同じ写真を送り直す。
  const [failure, setFailure] = useState(null);
  // 失敗したとき、送り直す写真を小さく見せる（何をもう一度送るのか分かるように）。
  const [thumbUrl, setThumbUrl] = useState(null);
  useEffect(() => {
    const file = failure?.retry ? lastFileRef.current : null;
    if (!file || typeof URL === 'undefined' || !URL.createObjectURL) { setThumbUrl(null); return undefined; }
    const url = URL.createObjectURL(file);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [failure]);
  const lastFileRef = useRef(null);
  const toast = useToast();
  const haptic = useHaptic();
  // 写真から書き起こすはプランの機能（フリーミアム）。無料プランなら撮る前に有料プランの画面を開く。
  const { requirePlan } = usePaywall();

  const pick = () => {
    if (loading || disabled) return;
    if (!requirePlan('写真からの書き起こし')) return;
    inputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file again re-fires onChange.
    e.target.value = '';
    if (!file) return;

    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    lastFileRef.current = file;
    await run(file);
  };

  const run = async (file) => {
    if (!file || loading) return;
    setFailure(null);
    setLoading(true);
    haptic.light();
    try {
      const { base64, mediaType } = await downscaleImageForVision(file);
      const text = await extractTextFromImage({ base64, mediaType });
      if (!text) {
        // 同じ写真を送り直しても変わらないので、撮り直し（選び直し）を案内する。
        setFailure({ title: '文字を読み取れませんでした', message: '明るく・まっすぐ撮ると精度が上がります。', retry: false });
        return;
      }
      haptic.success();
      lastFileRef.current = null;
      onText(text);
      toast.success('写真から書き起こしました。');
    } catch (e2) {
      // トークンの上限は案内として。プランの案内（402）は有料プランの画面が開くので重ねない。
      if (e2?.notice) { if (!/^この AI 機能は/.test(e2.message)) toast.info(e2.message); return; }
      setFailure({ title: '写真を読み取れませんでした', message: toMessage(e2, 'もう一度お試しください。'), retry: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={pick}
        disabled={loading || disabled}
        style={{ ...baseStyle, ...style, ...(loading || disabled ? offStyle : { opacity: 1 }) }}
        aria-label={loading ? '読み取り中…' : '写真から書き起こす（ページの文章をメモに入れる）'}
        aria-busy={loading || undefined}
      >
        <ScanText size={16} aria-hidden="true" />
        {loading ? '読み取り中…' : '写真から書き起こす'}
      </button>
      <input
        ref={inputRef}
        type="file"
        // capture を付けない: 撮影だけでなく、写真ライブラリからも選べるように（iOS の選択シートが出る）。
        accept="image/*"
        onChange={onFile}
        style={{ display: 'none' }}
      />
      {failure && !loading && (
        // 並べ方（グリッド／折り返す横並び）どちらでも、ボタンの下の 1 行ぶんを使う。
        <div style={{ gridColumn: '1 / -1', flexBasis: '100%', marginTop: 'var(--space-2)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          {thumbUrl && (
            <img src={thumbUrl} alt="読み取れなかった写真" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--separator)', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
          <ErrorMessage
            icon={null}
            title={failure.title}
            description={failure.message}
            actions={[
              failure.retry && lastFileRef.current
                ? { label: 'もう一度試す', onClick: () => run(lastFileRef.current), variant: 'secondary', icon: <RotateCw size={16} /> }
                : { label: '写真を選び直す', onClick: pick, variant: 'secondary' },
            ]}
          />
          </div>
        </div>
      )}
    </>
  );
}
