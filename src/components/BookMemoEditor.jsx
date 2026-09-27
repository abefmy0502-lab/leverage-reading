import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useAppDataCache } from '../state/AppDataCache';
import { toMessage } from '../lib/errors';
import { LIMITS, validateImageFile } from '../lib/limits';
import PhotoToTextButton from './PhotoToTextButton';
import { condenseMemo } from '../lib/ai';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { btnPrimary as uiBtnPrimary, btnGhost as uiBtnGhost, input as uiInput } from '../styles/ui';
import { ensureHttps } from '../lib/url';
import { BookOpen, Sparkles, Undo2, ImagePlus, ChevronLeft, X } from 'lucide-react';
import { useBlockEdgeSwipe } from '../hooks/useEdgeSwipeBack';

// Use 100dvh so iOS Safari URL bar resizes don't break full-screen editor.
// Older browsers without dvh support gracefully ignore the property.
// 100dvh respects iOS Safari's dynamic URL bar; modern targets all support it.
// We also bind height to visualViewport via JS below for on-screen-keyboard fitting.
// 見た目は DESIGN.md のトークンのみ（QuickMemoSheet と同じ部品・同じ値）。
const overlay = {
  position: 'fixed',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  height: '100dvh',
  zIndex: 300,
  background: 'var(--bg)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--font-ui)',
  color: 'var(--text)',
  paddingTop: 'env(safe-area-inset-top, 0px)',
};

const headerBar = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-1) var(--space-4)',
  borderBottom: '1px solid var(--separator)',
  background: 'var(--surface)',
  flexShrink: 0,
};

// アプリ標準の iOS の戻る（‹ ＋ 文字・--accent・高さ 44。すべての本の「‹ ホーム」と同じ形）。
const backBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  minHeight: 44,
  padding: '0 var(--space-2) 0 0',
  background: 'none',
  border: 'none',
  color: 'var(--accent)',
  fontSize: 'var(--text-body)',
  fontFamily: 'inherit',
  flexShrink: 0,
};

const body = {
  flex: 1,
  overflowY: 'auto',
  padding: 'var(--space-4) var(--space-4) var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-6)',
};

const footer = {
  display: 'flex',
  gap: 'var(--space-3)',
  padding: 'var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom))',
  borderTop: '1px solid var(--separator)',
  background: 'var(--surface)',
  flexShrink: 0,
};

const inp = { ...uiInput };

// メモは「読む文章」（DESIGN §2: 明朝 18・行間 1.6）。QuickMemoSheet と同じ。
const ta = {
  ...inp,
  resize: 'vertical',
  minHeight: 200,
  fontFamily: 'var(--font-read)',
  fontSize: 'var(--text-read)',
  lineHeight: 1.6,
};

const btnPrimary = { ...uiBtnPrimary, width: 'auto', flex: 1 };

const btnGhost = { ...uiBtnGhost, width: 'auto', flex: 1 };

// 行の中の副ボタン（DESIGN §5 btnRow: 高さ 44・15・600・文字は本文色）。
const btnRow = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  minHeight: 44,
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

// 文字ボタン（DESIGN §5「文字」: --accent・押せる範囲は高さ 44）。
const btnTextSm = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-1)',
  minHeight: 44,
  padding: 'var(--space-2) 0',
  border: 'none',
  background: 'transparent',
  color: 'var(--accent)',
  fontSize: 'var(--text-sub)',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const fieldLabel = {
  fontSize: 'var(--text-caption)',
  color: 'var(--text-2)',
  fontWeight: 600,
  display: 'block',
  marginBottom: 'var(--space-2)',
};

// チップ（DESIGN §5: --fill 面・13px・見た目 32・押せる範囲 44）。
const tagPill = {
  fontSize: 'var(--text-meta)',
  minHeight: 32,
  padding: '0 0 0 var(--space-3)',
  borderRadius: 'var(--radius)',
  background: 'var(--fill)',
  color: 'var(--text)',
  display: 'inline-flex',
  alignItems: 'center',
};

// 候補のタグ（DESIGN §5 のチップ: 見た目 32、押せる範囲 44 は外側のボタンで取る）。
const tagSuggestionBtn = {
  display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0,
  background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
};
const tagSuggestionFace = {
  display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 var(--space-3)',
  borderRadius: 'var(--radius)', background: 'var(--fill)', color: 'var(--text)', fontSize: 'var(--text-meta)',
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
  // 開いている間は左端スワイプで画面を戻さない（書きかけが確認なしに消えないように）
  useBlockEdgeSwipe(true);
  const isEdit = Boolean(initial?.id);
  const [pageNumber, setPageNumber] = useState(
    initial?.pageNumber != null ? String(initial.pageNumber) : (defaultPageNumber !== '' ? String(defaultPageNumber) : '')
  );
  const [text, setText] = useState(initial?.text || defaultText || '');
  // ✨ 凝縮（本田流レバレッジメモ化）— 元テキストを保持して「↩ 元に戻す」可能に。
  const [condensing, setCondensing] = useState(false);
  const [condensedFrom, setCondensedFrom] = useState(null);
  const toast = useToast();
  const confirmDialog = useConfirm();

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
    } catch (e) {
      // 例外（429/通信断/API エラー）を握り潰すとスピナーが止まるだけで無反応に
      // 見え、連打を誘発する。必ず失敗を伝える。
      toast.error(toMessage(e, '凝縮に失敗しました。少し時間をおいて再度お試しください。'));
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
  // ♿ 全画面エディタも Tab を内部に閉じ込める（背景の本詳細へ抜けない）。
  const trapRef = useFocusTrap(true);
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
    if (pageNumber !== '' && pageNumber != null) parts.push(`p.${pageNumber}`);
    return parts.join(' ');
  })();

  // body 直下へ portal で描く。本の詳細の .detail-enter は入場アニメの transform が残るため、
  // その中に置くと position: fixed が画面ではなく親基準になり、z-index も親の重なりに閉じ込め
  // られて、下のタブバーと「メモを書く」ボタンが保存ボタンの上に重なっていた。
  return createPortal(
    <div ref={(el) => { overlayRef.current = el; trapRef.current = el; }} style={overlay} role="dialog" aria-modal="true" aria-label={isEdit ? 'メモを編集' : 'メモを追加'}>
      <div style={headerBar}>
        <button
          type="button"
          onClick={async () => {
            if (busy) return;
            // 下書きを打ち込んだ状態の「戻る」は無確認で捨てない（本文・写真・
            // タグのいずれかが初期値から変わっている時だけ確認を挟む）。
            const dirty =
              text !== (initial?.text || defaultText || '')
              || !!photoFile
              || JSON.stringify(tags) !== JSON.stringify(initial?.tags || []);
            if (dirty) {
              const ok = await confirmDialog({
                title: '保存していない変更があります',
                message: '破棄すると、この変更は失われます。',
                confirmLabel: '破棄する',
                cancelLabel: '編集を続ける',
                danger: true,
              });
              if (!ok) return;
            }
            onClose?.();
          }}
          style={{ ...backBtn, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.4 : 1 }}
          aria-disabled={busy}
        >
          <ChevronLeft size={22} aria-hidden="true" />戻る
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 'var(--text-meta)', color: 'var(--text-2)', margin: 0, lineHeight: 1.3 }}>{isEdit ? 'メモを編集' : 'メモを追加'}</p>
          <p
            style={{
              fontSize: 'var(--text-sub)',
              color: 'var(--text)',
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.3,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              minWidth: 0,
            }}
          >
            <BookOpen size={14} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--text-2)' }} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bookTitle || '本'}</span>
          </p>
        </div>
      </div>

      <div style={body}>
        <div>
          <label htmlFor="memo-body" style={fieldLabel}>メモ本文</label>
          <textarea
            id="memo-body"
            ref={bodyRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="心が動いた一行を書き留める"
            style={ta}
            maxLength={LIMITS.memoText}
          />
          <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
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
                style={{ ...btnRow, cursor: condensing ? 'default' : 'pointer', opacity: condensing ? 0.6 : 1 }}
              >
                <Sparkles size={16} aria-hidden="true" />
                {condensing ? '凝縮中…' : '凝縮'}
              </button>
            )}
            {condensedFrom != null && (
              <button
                type="button"
                onClick={undoCondense}
                aria-label="凝縮を元に戻す"
                style={{ ...btnTextSm, padding: 'var(--space-2) var(--space-1)' }}
              >
                <Undo2 size={16} aria-hidden="true" />
                元に戻す
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="memo-page" style={fieldLabel}>ページ番号（任意）</label>
          <input
            id="memo-page"
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
          <label style={fieldLabel}>写真（任意）</label>
          {!shownPreview && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={btnRow}
              >
                <ImagePlus size={16} aria-hidden="true" />
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
              <img
                src={ensureHttps(shownPreview)}
                alt={previewAlt}
                style={{
                  maxWidth: '100%',
                  maxHeight: 280,
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--separator)',
                  display: 'block',
                }}
              />
              <button
                type="button"
                onClick={clearPhoto}
                style={{ ...btnTextSm, color: 'var(--error)' }}
              >
                <X size={16} aria-hidden="true" />写真を削除
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
          <label htmlFor="memo-tag" style={fieldLabel}>タグ（任意）</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: tags.length ? 'var(--space-2)' : 0 }}>
            {tags.map((t, i) => (
              <span key={`${t}-${i}`} style={tagPill}>
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(i)}
                  aria-label={`タグ「${t}」を削除`}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-2)',
                    cursor: 'pointer',
                    padding: 0,
                    // 見た目はチップ（32）に収め、押せる範囲は 44×44（DESIGN §6）。
                    width: 44,
                    height: 44,
                    margin: 'calc(-1 * var(--space-2)) 0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--text-3)' }}>過去のタグ</span>
              {suggestions.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => addTag(t)}
                  style={tagSuggestionBtn}
                >
                  <span style={tagSuggestionFace}>+ {t}</span>
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              id="memo-tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="タグを追加"
              style={{ ...inp, flex: 1, minWidth: 0, width: 'auto' }}
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
              style={{ ...btnGhost, flex: 'none', padding: '0 var(--space-4)' }}
            >
              追加
            </button>
          </div>
        </div>

        {errorMsg && (
          <p role="alert" style={{ color: 'var(--error)', fontSize: 'var(--text-meta)', lineHeight: 1.5, margin: 0 }}>{errorMsg}</p>
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
    </div>,
    document.body,
  );
}
