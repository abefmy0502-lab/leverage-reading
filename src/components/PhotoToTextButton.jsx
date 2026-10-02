// 📷 写真からメモを起こすボタン。
//
// 本のページを撮影 → Claude(vision) が文章を書き起こし → onText(text) で
// 親のメモ入力欄に流し込む。メモ入力の最大の摩擦「打つのが面倒」を消すための
// 共通ボタン（クイックメモ・全画面メモエディタの両方で再利用）。
//
// 画像は端末側で validateImageFile → downscaleImageForVision で縮小してから
// 送る（body サイズ・トークン・レイテンシを抑える）。AI 利用量メータリングは
// /api/claude 経由で自動適用。
//
// 📷 無料プランでも毎月 10 回使える（2026-10-02・相談のトークンとは別・lib/freeOcr.js）。無料プランの人には
// ボタンの下に「今月 あと 8 回」を小さく出し、0 回のときは「◯月1日に戻ります」。0 回で押すと有料プランの画面を開く
// （プランの機能を押した＝7 日間無料をすすめてよい場面・GLOSSARY ②）。

import { useEffect, useRef, useState } from 'react';
import { validateImageFile } from '../lib/limits';
import { downscaleImageForVision } from '../lib/image';
import { extractTextFromImage } from '../lib/ai';
import { ensureAiConsent } from '../lib/aiConsent';
import { toMessage } from '../lib/errors';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { ScanText } from 'lucide-react';
import { usePaywall } from '../state/PaywallContext';
import ErrorMessage from './ErrorMessage';
import { freeOcrHintParts, freeOcrTapAction } from '../lib/freeOcr';

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
// 無料プランの残りの回数（付随情報＝--text-3・13 の小さな文字）。グリッドではボタンの列の下に、
// 折り返す横並び（全画面のメモ）でも書き起こすボタンのすぐ下の行に（「凝縮」はその次の行）。
const hintStyle = {
  gridColumn: '-2 / -1',
  flexBasis: '100%',
  margin: 0, // ボタンとの間（8）は親の行の間（メモを書くシートの rowGap・全画面の gap）で取る
  fontSize: 'var(--text-meta)',
  lineHeight: 1.5,
  color: 'var(--text-3)',
};

export default function PhotoToTextButton({ onText, disabled = false, style }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  // 読み取りに失敗したときの案内（シートの中に出す）。写真は持っておき「もう一度」で同じ写真を送り直す。
  const [failure, setFailure] = useState(null);
  // 読み取り中・失敗したときに、送った写真を小さく見せる（何を読んでいるのか・何をもう一度送るのか分かるように）。
  // 読み取り中と失敗は同じ場所（ボタンの下の 1 行）に出し、写真の位置を動かさない。
  const [thumbFile, setThumbFile] = useState(null);
  const [thumbUrl, setThumbUrl] = useState(null);
  useEffect(() => {
    if (!thumbFile || typeof URL === 'undefined' || !URL.createObjectURL) { setThumbUrl(null); return undefined; }
    const url = URL.createObjectURL(thumbFile);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbFile]);
  const lastFileRef = useRef(null);
  const toast = useToast();
  const haptic = useHaptic();
  // 無料プランは毎月 10 回（今月の分を使い切っていたら、撮る前に有料プランの画面を開く）。
  const { freeMode, freeOcrRemaining, openPaywall, refreshTokens } = usePaywall();
  const hint = freeOcrHintParts({ freeMode, remaining: freeOcrRemaining });

  const pick = () => {
    if (loading || disabled) return;
    if (freeOcrTapAction({ freeMode, remaining: freeOcrRemaining }) === 'paywall') {
      openPaywall('free_ocr_used', '写真から書き起こし');
      return;
    }
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
    // 🤝 はじめて AI に送るときは、送る内容（この写真だけ）と送り先を見せて同意をもらう（lib/aiConsent.js）。
    //   写真を選んだあと・送る前に聞く（撮る前に聞くと、iPhone で写真の画面が開けなくなることがある）。やめたら何も送らない。
    if (!(await ensureAiConsent('ocr'))) { lastFileRef.current = null; return; }
    setFailure(null);
    setThumbFile(file);
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
      setThumbFile(null);
      onText(text);
      toast.success('写真から書き起こしました。');
    } catch (e2) {
      // トークンの上限は案内として。プランの案内・無料の回数の使い切り（402）は有料プランの画面が開くので重ねない。
      if (e2?.notice) {
        setThumbFile(null);
        if (!/^(この AI 機能は|今月の写真から書き起こし)/.test(e2.message)) toast.info(e2.message);
        refreshTokens?.(); // 「今月 あと N 回」を取り直す
        return;
      }
      // 理由のあとに次の一歩を短く（理由の文がすでに「お試しください」を含むときは重ねない・2026-09-29 に文を短く）。
      const reason = toMessage(e2, '');
      const message = /お試しください/.test(reason) ? reason : `${reason}もう一度お試しください。`;
      setFailure({ title: '写真を読み取れませんでした', message, retry: true });
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
        aria-label={loading ? '読み取り中…' : `写真から書き起こす（ページの文章をメモに入れる${hint ? `・${hint.join('')}` : ''}）`}
        aria-busy={loading || undefined}
      >
        <ScanText size={16} aria-hidden="true" />
        {loading ? '読み取り中…' : '写真から書き起こす'}
      </button>
      {hint && !loading && !failure && (
        <p style={hintStyle} aria-hidden="true">
          {hint.map((part) => <span key={part} style={{ whiteSpace: 'nowrap' }}>{part}</span>)}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        // capture を付けない: 撮影だけでなく、写真ライブラリからも選べるように（iOS の選択シートが出る）。
        accept="image/*"
        data-ocr-input=""
        onChange={onFile}
        style={{ display: 'none' }}
      />
      {(loading || failure) && (
        // 並べ方（グリッド／折り返す横並び）どちらでも、ボタンの下の 1 行ぶんを使う。
        // 読み取り中は写真の右に「写真を読み取っています」。失敗は写真の下に全幅の案内（説明を狭い幅に押し込まない・2026-09-29）。
        // どちらも写真は同じ場所（左上）。
        <div style={{ gridColumn: '1 / -1', flexBasis: '100%', marginTop: 0, display: 'flex', flexDirection: loading ? 'row' : 'column', alignItems: loading ? 'flex-start' : 'stretch', gap: loading ? 'var(--space-3)' : 'var(--space-2)' }}>
          {thumbUrl && (
            <img src={thumbUrl} alt={loading ? '読み取っている写真' : '読み取れなかった写真'} style={{ width: 'var(--space-12)', height: 'var(--space-12)', objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--separator)', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div className="ai-thinking" role="status" style={{ minHeight: 'var(--space-12)' }}>
              <span className="ai-thinking-dot" aria-hidden="true" />
              <span>写真を読み取っています</span>
            </div>
          ) : (
          <ErrorMessage
            title={failure.title}
            description={failure.message}
            actions={[
              failure.retry && lastFileRef.current
                ? { label: 'もう一度', onClick: () => run(lastFileRef.current), variant: 'secondary' }
                : { label: '写真を選び直す', onClick: pick, variant: 'secondary' },
            ]}
          />
          )}
          </div>
        </div>
      )}
    </>
  );
}
