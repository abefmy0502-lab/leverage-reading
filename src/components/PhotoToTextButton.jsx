// 📷 写真からメモを起こすボタン。
//
// 本のページを撮影 → Claude(vision) が文章を書き起こし → onText(text) で
// 親のメモ入力欄に流し込む。メモ入力の最大の摩擦「打つのが面倒」を消すための
// 共通ボタン（クイックメモ・全画面メモエディタの両方で再利用）。
//
// 画像は端末側で validateImageFile → downscaleImageForVision で縮小してから
// 送る（body サイズ・トークン・レイテンシを抑える）。AI 利用量メータリングは
// /api/claude 経由で自動適用。

import { useRef, useState } from 'react';
import { validateImageFile } from '../lib/limits';
import { downscaleImageForVision } from '../lib/image';
import { extractTextFromImage } from '../lib/ai';
import { toMessage } from '../lib/errors';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';

const baseStyle = {
  minHeight: 44,
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid var(--c-hairline-strong)',
  background: 'transparent',
  color: 'var(--c-brand)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

export default function PhotoToTextButton({ onText, disabled = false, style }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const haptic = useHaptic();

  const pick = () => {
    if (loading || disabled) return;
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

    setLoading(true);
    haptic.light();
    try {
      const { base64, mediaType } = await downscaleImageForVision(file);
      const text = await extractTextFromImage({ base64, mediaType });
      if (!text) {
        toast.error('文字を読み取れませんでした。明るく・まっすぐ撮ると精度が上がります。');
        return;
      }
      haptic.success();
      onText(text);
      toast.success('写真から書き起こしました');
    } catch (e2) {
      toast.error(toMessage(e2, '読み取りに失敗しました。'));
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
        style={{ ...baseStyle, ...style, opacity: loading || disabled ? 0.6 : 1 }}
        aria-label="写真から文章を書き起こす"
        aria-busy={loading || undefined}
      >
        {loading ? '📷 読み取り中…' : '📷 写真から起こす'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: 'none' }}
      />
    </>
  );
}
