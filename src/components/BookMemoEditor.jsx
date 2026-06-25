import { useEffect, useRef, useState } from 'react';
import { useAppDataCache } from '../state/AppDataCache';
import { toMessage } from '../lib/errors';
import { LIMITS, validateImageFile } from '../lib/limits';
import PhotoToTextButton from './PhotoToTextButton';
import { ensureHttps } from '../lib/url';

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
  background: '#f5f0e8',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "var(--font-app)",
  color: '#3d362c',
  paddingTop: 'env(safe-area-inset-top, 0px)',
};

const headerBar = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 18px',
  borderBottom: '1px solid #ece5d9',
  background: '#fffdf8',
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
  borderTop: '1px solid #ece5d9',
  background: '#fffdf8',
  flexShrink: 0,
};

const inp = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 16,
  border: '1px solid #e0d8ca',
  borderRadius: 10,
  background: '#fff',
  outline: 'none',
  color: '#3d362c',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const ta = { ...inp, resize: 'vertical', minHeight: 200, lineHeight: 1.7 };

const btnPrimary = {
  flex: 1,
  padding: '12px 0',
  borderRadius: 10,
  border: 'none',
  background: '#5c5043',
  color: '#fffdf8',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  letterSpacing: 1,
};

const btnGhost = {
  flex: 1,
  padding: '12px 0',
  borderRadius: 10,
  border: '1px solid #e0d8ca',
  background: 'transparent',
  color: '#5c5043',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
};

const fieldLabel = {
  fontSize: 13,
  color: '#5c5548',
  fontWeight: 500,
  display: 'block',
  marginBottom: 4,
};

const tagPill = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 10,
  background: '#eae3d6',
  color: '#6b5f4d',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const tagSuggestionBtn = {
  fontSize: 10,
  padding: '8px 8px',
  minHeight: 32,
  borderRadius: 10,
  border: '1px dashed #e0d8ca',
  background: 'transparent',
  color: '#6b5f4d',
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
    return {
      pageNumber: Number.isFinite(parsed) ? parsed : null,
      text: text.trim(),
      photoFile: photoFile || null,
      tags,
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
    if (existingPhotoPath) setRemovePhotoFlag(true);
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
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: 14, color: '#5c5043', cursor: 'pointer', padding: '11px 8px', margin: '-11px -8px', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
        >
          ← 戻る
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 11, color: '#6b5f4d', margin: 0 }}>{isEdit ? 'メモを編集' : 'メモを追加'}</p>
          <p
            style={{
              fontSize: 14,
              color: '#3d362c',
              fontWeight: 500,
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            📚 {bookTitle || '本'}
          </p>
        </div>
      </div>

      <div style={body}>
        <div>
          <label style={fieldLabel}>ページ番号（任意）</label>
          <input
            type="number"
            inputMode="numeric"
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
            placeholder="メモを入力..."
            style={ta}
            maxLength={LIMITS.memoText}
          />
          <div style={{ marginTop: 8 }}>
            <PhotoToTextButton
              onText={(t) =>
                setText((prev) => (prev ? `${prev}\n${t}` : t).slice(0, LIMITS.memoText))
              }
            />
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
                📷 写真を追加
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
                  border: '1px solid #ece5d9',
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
                  color: '#a05040',
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
                    color: '#6b5f4d',
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
              <span style={{ fontSize: 10, color: '#b5aa96', lineHeight: '22px' }}>過去のタグ:</span>
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
          <p style={{ color: '#a05040', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{errorMsg}</p>
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
            {busy ? '保存中...' : '保存して次へ'}
          </button>
        )}
        <button
          type="button"
          onClick={() => save(false)}
          disabled={busy}
          style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
