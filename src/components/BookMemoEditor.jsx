import { useEffect, useRef, useState } from 'react';
import { getMemoPhotoUrl } from '../hooks/useBookMemos';

const overlay = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  background: '#f5f0e8',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'Noto Serif JP', Georgia, serif",
  color: '#3d362c',
};

const headerBar = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 18px',
  borderBottom: '1px solid #e4ddd0',
  background: '#faf6f0',
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
  borderTop: '1px solid #e4ddd0',
  background: '#faf6f0',
  flexShrink: 0,
};

const inp = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid #d4ccbe',
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
  color: '#faf6f0',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  letterSpacing: 1,
};

const btnGhost = {
  flex: 1,
  padding: '12px 0',
  borderRadius: 10,
  border: '1px solid #d4ccbe',
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
  color: '#7a6e58',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const tagSuggestionBtn = {
  fontSize: 10,
  padding: '2px 8px',
  borderRadius: 10,
  border: '1px dashed #d4ccbe',
  background: 'transparent',
  color: '#8a7e6b',
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
  allTags = [],
  onClose,
  onCreate,
  onUpdate,
}) {
  const isEdit = Boolean(initial?.id);
  const [pageNumber, setPageNumber] = useState(
    initial?.pageNumber != null ? String(initial.pageNumber) : (defaultPageNumber !== '' ? String(defaultPageNumber) : '')
  );
  const [text, setText] = useState(initial?.text || '');
  const [tags, setTags] = useState(initial?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [existingPhotoPath, setExistingPhotoPath] = useState(initial?.photoPath || null);
  const [removePhotoFlag, setRemovePhotoFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

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

  // For edit mode: load signed URL of existing photo
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!existingPhotoPath || removePhotoFlag) {
      setExistingPhotoUrl(null);
      return undefined;
    }
    getMemoPhotoUrl(existingPhotoPath).then((url) => {
      if (!cancelled) setExistingPhotoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [existingPhotoPath, removePhotoFlag]);

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
      setErrorMsg(e?.message || 'メモの保存に失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
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

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={headerBar}>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', fontSize: 14, color: '#5c5043', cursor: 'pointer', padding: 4 }}
        >
          ← 戻る
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 11, color: '#a89e8c', margin: 0 }}>{isEdit ? 'メモを編集' : 'メモを追加'}</p>
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
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'・印象に残ったフレーズ\n・すぐ使えるノウハウ\n・考え方の転換点'}
            style={ta}
          />
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
                  padding: '10px 16px',
                  fontSize: 13,
                }}
              >
                📷 写真を追加
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFile}
                style={{ display: 'none' }}
              />
            </>
          )}
          {shownPreview && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
              <img
                src={shownPreview}
                alt="preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: 280,
                  borderRadius: 8,
                  border: '1px solid #e4ddd0',
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
                  padding: 4,
                }}
              >
                ✕ 写真を削除
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
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
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 12,
                    color: '#a89e8c',
                    cursor: 'pointer',
                    padding: 0,
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
              style={{ ...btnGhost, flex: 'none', padding: '6px 14px', fontSize: 12 }}
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
