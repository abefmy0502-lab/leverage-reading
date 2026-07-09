import { useEffect, useRef, useState } from 'react';
import { useAppDataCache } from '../state/AppDataCache';
import { toMessage } from '../lib/errors';
import { LIMITS, validateImageFile } from '../lib/limits';
import PhotoToTextButton from './PhotoToTextButton';
import { condenseMemo } from '../lib/ai';
import { useToast } from './Toast';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost } from '../styles/ui';
import { ensureHttps } from '../lib/url';
import { BookOpen, Sparkles, Undo2, Camera, Mic, ArrowLeft } from 'lucide-react';

// Use 100dvh so iOS Safari URL bar resizes don't break full-screen editor.
// Older browsers without dvh support gracefully ignore the property.
// 100dvh respects iOS Safari's dynamic URL bar; modern targets all support it.
// We also bind height to visualViewport via JS below for on-screen-keyboard fitting.
const overlay = {
  position: 'fixed',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  height: '100dvh',
  zIndex: 300,
  background: 'var(--color-bg)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "var(--font-app)",
  color: 'var(--c-ink)',
  paddingTop: 'env(safe-area-inset-top, 0px)',
};

const headerBar = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 18px',
  borderBottom: '1px solid var(--c-hairline)',
  background: 'var(--c-card)',
  flexShrink: 0,
};

const body = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px 18px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const footer = {
  display: 'flex',
  gap: 10,
  padding: '12px 18px calc(12px + env(safe-area-inset-bottom))',
  borderTop: '1px solid var(--c-hairline)',
  background: 'var(--c-card)',
  flexShrink: 0,
};

const inp = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid var(--c-hairline-strong)',
  borderRadius: 10,
  background: '#fff',
  outline: 'none',
  color: 'var(--c-ink)',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const ta = { ...inp, resize: 'vertical', minHeight: 200, lineHeight: 1.7 };

const btnPrimary = { ...uiBtnPrimary, width: 'auto', flex: 1, padding: '12px 0', fontSize: 14 };

const btnGhost = { ...uiBtnGhost, width: 'auto', flex: 1, padding: '12px 0', fontSize: 14 };

const fieldLabel = {
  fontSize: 13,
  color: 'var(--c-ink-soft)',
  fontWeight: 500,
  display: 'block',
  marginBottom: 4,
};

const tagPill = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 10,
  background: 'var(--c-soft-2)',
  color: 'var(--c-ink-2)',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const tagSuggestionBtn = {
  fontSize: 10,
  padding: '8px 8px',
  minHeight: 32,
  borderRadius: 10,
  border: '1px dashed var(--c-hairline-strong)',
  background: 'transparent',
  color: 'var(--c-ink-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function blockEnter(e) {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
    e.preventDefault();
  }
}

export default function BookMemoEditor({
  bookTitle,
  initial,
  defaultPageNumber = '',
  defaultText = '',
  allTags = [],
  onClose,
  onCreate,
  onUpdate,
}) {
  const isEdit = Boolean(initial?.id);
  const [pageNumber, setPageNumber] = useState(
    initial?.pageNumber != null ? String(initial.pageNumber) : (defaultPageNumber !== '' ? String(defaultPageNumber) : '')
  );
  const [text, setText] = useState(initial?.text || defaultText || '');
  // ✨ 凝縮（本田流レバレッジメモ化）— 元テキストを保持して「↩ 元に戻す」可能に。
  const [condensing, setCondensing] = useState(false);
  const [condensedFrom, setCondensedFrom] = useState(null);
  const toast = useToast();

  const handleCondense = async () => {
    if (condensing) return;
    const src = text.trim();
    if (src.replace(/\s/g, '').length < 60) {
      toast.info('もう少し長いメモで凝縮が活きます。');
      return;
    }
    setCondensing(true);
    try {
      const out = await condenseMemo({ text: src });
      if (out && out.trim() && out.trim() !== src) {
        setCondensedFrom(text); // 元に戻せるよう保持
        setText(out.trim());
        toast.success('本質だけに凝縮しました。');
      } else {
        toast.error('うまく凝縮できませんでした。少し時間をおいて再度お試しください。');
      }
    } finally {
      setCondensing(false);
    }
  };

  const undoCondense = () => {
    if (condensedFrom == null) return;
    setText(condensedFrom);
    setCondensedFrom(null);
  };
  const [tags, setTags] = useState(initial?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [existingPhotoPath, setExistingPhotoPath] = useState(initial?.photoPath || null);
  const [removePhotoFlag, setRemovePhotoFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);
  const overlayRef = useRef(null);
  const bodyRef = useRef(null);

  // 新規メモは本文へ自動フォーカス（毎日の「ひとこと書く」を1タップ短縮）。
  // 編集時はフォーカスを奪わない（ページ/タグの微調整を邪魔しない）。QuickMemoSheet と同じ流儀。
  useEffect(() => {
    if (isEdit) return undefined;
    const t = setTimeout(() => bodyRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [isEdit]);

  // Keyboard push-up: clamp the editor's height to visualViewport so the
  // bottom action bar stays visible when the on-screen keyboard appears.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const apply = () => {
      if (!overlayRef.current) return;
      overlayRef.current.style.height = `${vv.height}px`;
      // iOS Safari はフォーカス時にページが自動スクロールすると offsetTop > 0
      // になる。overlay は top:0 固定なので、translateY で可視ビューポートの
      // 先頭にピン留めしないと下部の保存バーがキーボード裏に潜る
      // （QuickMemoSheet と同じ追従思想。Capacitor resize:native では 0 で無害）。
      overlayRef.current.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : '';
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  // Generate preview URL from selected file
  useEffect(() => {
    if (!photoFile) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  // For edit mode: load signed URL of existing photo (via cache)
  const cache = useAppDataCache();
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(() =>
    existingPhotoPath ? cache.getCachedPhotoUrl(existingPhotoPath) : null
  );
  useEffect(() => {
    let cancelled = false;
    if (!existingPhotoPath || removePhotoFlag) {
      setExistingPhotoUrl(null);
      return undefined;
    }
    const cached = cache.getCachedPhotoUrl(existingPhotoPath);
    if (cached) {
      setExistingPhotoUrl(cached);
      return undefined;
    }
    cache.fetchPhotoUrl(existingPhotoPath).then((url) => {
      if (!cancelled) setExistingPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [existingPhotoPath, removePhotoFlag, cache]);

  const addTag = (raw) => {
    const t = (raw || tagInput).trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const removeTag = (i) => setTags(tags.filter((_, j) => j !== i));

  const resetForNext = (lastPage) => {
    setText('');
    setTags([]);
    setTagInput('');
    setPhotoFile(null);
    setPreviewUrl(null);
    setExistingPhotoPath(null);
    setRemovePhotoFlag(false);
    setErrorMsg('');
    if (Number.isFinite(lastPage)) {
      setPageNumber(String(lastPage + 1));
    } else {
      setPageNumber('');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const buildPayload = () => {
    const parsed = parseInt(pageNumber, 10);
    // 入力欄に打ちかけて未確定（Enter/＋を押す前）のタグも保存に含める＝取りこぼし防止。
    const pendingTag = tagInput.trim();
    const finalTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;
    return {
      pageNumber: Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 99999) : null,
      text: text.trim(),
      photoFile: photoFile || null,
      tags: finalTags,
      removePhotoFlag,
    };
  };

  const validate = (payload) => {
    if (!payload.text && !payload.photoFile && !existingPhotoPath) {
      return '本文または写真のいずれかを入力してください。';
    }
    return null;
  };

  const save = async (continueAfter) => {
    if (busy) return;
    const payload = buildPayload();
    const v = validate(payload);
    if (v) {
      setErrorMsg(v);
      return;
    }
    setBusy(true);
    setErrorMsg('');
    try {
      if (isEdit) {
        await onUpdate(initial.id, payload);
      } else {
        await onCreate({
          pageNumber: payload.pageNumber,
          text: payload.text,
          photoFile: payload.photoFile,
          tags: payload.tags,
        });
      }
      if (continueAfter && !isEdit) {
        resetForNext(payload.pageNumber);
      } else {
        onClose?.();
      }
    } catch (e) {
      console.error('memo save error', e);
      setErrorMsg(toMessage(e, 'メモの保存に失敗しました。'));
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateImageFile(f);
    if (err) {
      setErrorMsg(err);
      // Reset the input so the user can pick again
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setErrorMsg('');
    setPhotoFile(f);
    setRemovePhotoFlag(false);
    setExistingPhotoPath(null);
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPreviewUrl(null);
    // 「元写真を削除→新写真を選択→やっぱり削除」の順だと existingPhotoPath は
    // 既に null（onFile がクリア済み）でフラグが立たず、保存後に元写真が復活する。
    // このセッションの初期状態で写真を持っていたなら、プレビューを空にした時点で
    // 常に削除フラグを立てる（再度 onFile されれば false に戻るので置換は壊れない）。
    if (existingPhotoPath || initial?.photoPath) setRemovePhotoFlag(true);
    setExistingPhotoPath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const suggestions = (allTags || []).filter((t) => !tags.includes(t));

  const shownPreview = previewUrl || existingPhotoUrl;

  // 文脈のある alt（事実ベース）: 本タイトル + ページ番号を補う
  const previewAlt = (() => {
    const parts = ['メモに添付する写真のプレビュー'];
    if (bookTitle) parts.push(`『${bookTitle}』`);
    if (pageNumber !== '' && pageNumber != null) parts.push(`P.${pageNumber}`);
    return parts.join(' ');
  })();

  return (
    <div ref={overlayRef} style={overlay} role="dialog" aria-modal="true">
      <div style={headerBar}>
        <button
          type="button"
          onClick={() => { if (!busy) onClose?.(); }}
          style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--c-brand)', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.4 : 1, padding: '11px 8px', margin: '-11px -8px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
          aria-disabled={busy}
          aria-label="戻る"
        >
          <ArrowLeft size={15} aria-hidden="true" style={{ marginRight: 3 }} />戻る
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 11, color: 'var(--c-ink-2)', margin: 0 }}>{isEdit ? 'メモを編集' : 'メモを追加'}</p>
          <p
            style={{
              fontSize: 14,
              color: 'var(--c-ink)',
              fontWeight: 500,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <BookOpen size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {bookTitle || '本'}
          </p>
        </div>
      </div>

      <div style={body}>
        <div>
          <label style={fieldLabel}>ページ番号（任意）</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={99999}
            value={pageNumber}
            onChange={(e) => setPageNumber(e.target.value)}
            onKeyDown={blockEnter}
            placeholder="78"
            style={{ ...inp, width: 140, textAlign: 'center' }}
          />
        </div>

        <div>
          <label style={fieldLabel}>メモ本文</label>
          <textarea
            ref={bodyRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="メモを入力…"
            style={ta}
            maxLength={LIMITS.memoText}
          />
          {/* 💡 OS 標準のディクテーションへの導線（自前録音は持たない＝速い・無料・端末内）。 */}
          <p style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '6px 0 0', fontSize: 11, color: 'var(--c-ink-3)' }}>
            <Mic size={12} aria-hidden="true" />
            キーボードの🎤を押すと、話して入力できます
          </p>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <PhotoToTextButton
              onText={(t) =>
                setText((prev) => (prev ? `${prev}\n${t}` : t).slice(0, LIMITS.memoText))
              }
            />
            {/* ✨ 3行に凝縮 — 長文/OCR を本田流レバレッジメモ化。十分な長さの時だけ出す。 */}
            {text.trim().replace(/\s/g, '').length >= 60 && (
              <button
                type="button"
                onClick={handleCondense}
                disabled={condensing}
                aria-label="メモを凝縮する"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40,
                  padding: '8px 14px', borderRadius: 10, border: '1px solid var(--c-hairline-strong)',
                  background: 'transparent', color: 'var(--c-brand)', fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit', cursor: condensing ? 'default' : 'pointer', opacity: condensing ? 0.6 : 1,
                }}
              >
                <Sparkles size={14} aria-hidden="true" style={{ marginRight: 5 }} />
                {condensing ? '凝縮中…' : '凝縮'}
              </button>
            )}
            {condensedFrom != null && (
              <button
                type="button"
                onClick={undoCondense}
                aria-label="凝縮を元に戻す"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 40,
                  padding: '8px 12px', borderRadius: 10, border: 'none',
                  background: 'transparent', color: 'var(--c-ink-3)', fontSize: 12, fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                <Undo2 size={13} aria-hidden="true" style={{ marginRight: 4 }} />
                元に戻す
              </button>
            )}
          </div>
        </div>

        <div>
          <label style={fieldLabel}>写真（任意）</label>
          {!shownPreview && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...btnGhost,
                  flex: 'none',
                  display: 'inline-block',
                  padding: '12px 16px',
                  minHeight: 44,
                  fontSize: 13,
                }}
              >
                <Camera size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }} />
                写真を追加
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                style={{ display: 'none' }}
              />
            </>
          )}
          {shownPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <img
                src={ensureHttps(shownPreview)}
                alt={previewAlt}
                style={{
                  maxWidth: '100%',
                  maxHeight: 280,
                  borderRadius: 8,
                  border: '1px solid var(--c-hairline)',
                  display: 'block',
                }}
              />
              <button
                type="button"
                onClick={clearPhoto}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 12,
                  color: 'var(--c-critical)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  padding: '11px 8px',
                  margin: '-7px -8px',
                  minHeight: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                ✕ 写真を削除
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>

        <div>
          <label style={fieldLabel}>タグ（任意）</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: tags.length ? 6 : 0 }}>
            {tags.map((t, i) => (
              <span key={`${t}-${i}`} style={tagPill}>
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(i)}
                  aria-label="タグを削除"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 14,
                    color: 'var(--c-ink-2)',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    margin: '-6px -6px -6px 0',
                    minWidth: 28,
                    minHeight: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--c-ink-3)', lineHeight: '22px' }}>過去のタグ:</span>
              {suggestions.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  style={tagSuggestionBtn}
                >
                  + {t}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="タグを追加"
              style={{ ...inp, flex: 1 }}
              maxLength={LIMITS.tag}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <button
              type="button"
              onClick={() => addTag()}
              style={{ ...btnGhost, flex: 'none', padding: '6px 14px', minHeight: 44, fontSize: 12 }}
            >
              追加
            </button>
          </div>
        </div>

        {errorMsg && (
          <p style={{ color: 'var(--c-critical)', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
        )}
      </div>

      <div style={footer}>
        {!isEdit && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy}
            style={{ ...btnGhost, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? '保存中…' : '保存して次へ'}
          </button>
        )}
        <button
          type="button"
          onClick={() => save(false)}
          disabled={busy}
          style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
}
