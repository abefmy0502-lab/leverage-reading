// 📚 本棚の写真から追加（2026-11-22 オーナー「自分の本棚（リアルなもの）を写真撮ったら AI が何冊もまとめて推測で
//   自分の本棚に登録する機能」・lib/shelfScan.js）。
//   撮る（写真を選ぶ）→ 読み取る（AI・purpose 'shelf_scan'）→ 1 冊ずつ書店の検索で確かめる → 選んで「N 冊を本棚に入れる」。
//   見つかった本ははじめから選んでおく。近い本・見つからない本・本棚にある本は選ばない（本人が選べば入る・本棚にある本は入らない）。
//   入れる状態は 1 つ選ぶ（読了・積読・読みたい）。保存は App の onAdd（ほかのアプリから取り込むと同じ保存・同じ本は足さない）。
//   写真は端末で縮めて AI に送るだけ（保存しない）。無料プランは写真から書き起こしと同じ月 10 回から。
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import MiniCover from './MiniCover';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';
import { useHaptic } from '../hooks/useHaptic';
import { usePaywall } from '../state/PaywallContext';
import { withPhraseBreaks } from './TightBubble';
import { btnPrimary, btnPrimaryOff, btnLink, groupTitle, segTrack, segOption } from '../styles/ui';
import { validateImageFile } from '../lib/limits';
import { downscaleImageForVision } from '../lib/image';
import { readShelfPhoto } from '../lib/ai';
import { ensureAiConsent } from '../lib/aiConsent';
import { toMessage } from '../lib/errors';
import { searchBooksOnServer } from '../lib/bookSearch';
import { findImportDuplicate } from '../lib/checkDuplicate';
import { freeOcrHintParts, freeOcrTapAction } from '../lib/freeOcr';
import { parseShelfScan, verifyShelfGuesses, defaultChecked, shelfImportBooks } from '../lib/shelfScan';
import { track } from '../lib/analytics';

const note = { margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const STATUS_CHOICES = [
  { id: 'done', label: '読了' },
  { id: 'before', label: '積読' },
  { id: 'want', label: '読みたい' },
];
const STATUS_NOTE = { found: '', maybe: '近い本です。合っていれば選んでください', missing: '書店で見つかりませんでした。選ぶと、読んだ書名のまま入れます', unchecked: '確かめられませんでした。選ぶと、読んだ書名のまま入れます' };

/**
 * existingBooks: 本棚の本（同じ本を見分ける）。onAdd(books, status) → { booksAdded, booksMatched, booksFailed, ... }（App の importLibrary）。
 * onUndo(outcome): 入れた本を取り消す。onClose。
 */
export default function ShelfScanSheet({ existingBooks = [], onAdd, onUndo, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const haptic = useHaptic();
  const { freeMode, freeOcrRemaining, openPaywall, refreshTokens } = usePaywall();
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const [step, setStep] = useState('pick'); // pick | reading | checking | review | saving
  const [photoUrl, setPhotoUrl] = useState('');
  const [items, setItems] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [status, setStatus] = useState('done');
  const [failure, setFailure] = useState(null); // { title, message }
  const hint = freeOcrHintParts({ freeMode, remaining: freeOcrRemaining });
  const usedUp = freeOcrTapAction({ freeMode, remaining: freeOcrRemaining }) === 'paywall';

  // 閉じたら確かめている途中の検索をやめる（写真を替えたときには止めない＝別の effect）。
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const isOwned = (b) => !!findImportDuplicate(existingBooks, { title: b?.title, author: b?.author, isbn: b?.isbn });

  const pick = () => {
    if (usedUp) { openPaywall('free_ocr_used', '本棚の写真から追加'); return; }
    inputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { toast.error(err); return; }
    // 🤝 はじめて AI に送るときは、送るもの（この写真だけ）と送り先を見せて同意をもらう（写真を選んだあと・送る前）。
    if (!(await ensureAiConsent('shelf_scan'))) return;
    setFailure(null);
    setItems([]);
    setPhotoUrl(URL.createObjectURL(file));
    setStep('reading');
    haptic.light();
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { base64, mediaType } = await downscaleImageForVision(file);
      const text = await readShelfPhoto({ base64, mediaType });
      refreshTokens?.(); // 無料プランの「今月の残り N 回」を取り直す
      const guesses = parseShelfScan(text);
      track('shelf_scan_read', { books: guesses.length });
      if (!guesses.length) {
        setFailure({ title: '本を読み取れませんでした', message: '背表紙の文字が読めるくらいに近づいて、正面から撮ってください。' });
        setStep('pick');
        return;
      }
      setItems(guesses.map((g, i) => ({ id: `s${i}`, guess: g, status: 'checking', book: null, owned: false })));
      setStep('checking');
      const done = await verifyShelfGuesses(guesses, {
        search: (q) => searchBooksOnServer(q, { signal: ctrl.signal }),
        isOwned,
        signal: ctrl.signal,
        onEach: (i, it) => setItems((prev) => prev.map((x, j) => (j === i ? it : x))),
      });
      if (ctrl.signal.aborted) return;
      setItems(done);
      setChecked(new Set(done.filter(defaultChecked).map((x) => x.id)));
      setStep('review');
      haptic.success();
      track('shelf_scan_checked', { books: done.length, found: done.filter((x) => x.status === 'found').length, owned: done.filter((x) => x.owned).length });
    } catch (e2) {
      if (e2?.name === 'AbortError') return;
      setStep('pick');
      if (e2?.notice) {
        if (!/^(この AI 機能は|今月の写真から書き起こし)/.test(e2.message)) toast.info(e2.message);
        refreshTokens?.();
        return;
      }
      const reason = toMessage(e2, '');
      setFailure({ title: '写真を読み取れませんでした', message: /お試しください/.test(reason) ? reason : `${reason}もう一度お試しください。` });
    }
  };

  const toggle = (it) => {
    if (it.owned || it.dup) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
      return next;
    });
  };

  const selectable = items.filter((x) => !x.owned && !x.dup);
  const count = selectable.filter((x) => checked.has(x.id)).length;
  const checkedDone = items.filter((x) => x.status !== 'checking').length;

  const save = async () => {
    if (!count || step === 'saving') return;
    setStep('saving');
    try {
      const books = shelfImportBooks(items, checked, status);
      const outcome = await onAdd(books, status);
      const added = outcome?.booksAdded || 0;
      track('shelf_scan_added', { books: added, status });
      haptic.success();
      onClose();
      if (added > 0) {
        toast.undo({
          message: `${added} 冊を本棚に入れました`,
          onUndo: async () => {
            try { await onUndo?.(outcome); } catch { toast.error('取り消せませんでした。'); }
          },
        });
      } else {
        toast.info('もう本棚にある本でした。');
      }
      if (outcome?.booksFailed) toast.error(`${outcome.booksFailed} 冊は入れられませんでした。通信状況を確認して、もう一度お試しください。`);
    } catch (e) {
      setStep('review');
      toast.error(toMessage(e, '本棚に入れられませんでした。もう一度お試しください。'));
    }
  };

  const busy = step === 'reading' || step === 'checking' || step === 'saving';
  const footer = step === 'review' || step === 'saving' ? (
    <button type="button" onClick={save} disabled={!count || step === 'saving'} aria-busy={step === 'saving' || undefined} style={count ? btnPrimary : btnPrimaryOff}>
      {step === 'saving' ? '入れています…' : count ? `${count} 冊を本棚に入れる` : '入れる本を選んでください'}
    </button>
  ) : step === 'pick' ? (
    <>
      <button type="button" onClick={pick} style={{ ...btnPrimary, gap: 'var(--space-2)' }}>
        <Camera size="1.1em" aria-hidden="true" />本棚を撮る・写真を選ぶ
      </button>
      {hint && <p style={{ ...note, marginTop: 'var(--space-2)', textAlign: 'center', ...(usedUp ? {} : { color: 'var(--text-3)' }) }}>{hint.join('')}</p>}
    </>
  ) : null;

  const list = useMemo(() => {
    // 選べる本（見つかった → 近い → 見つからない）を上に、本棚にある本はいちばん下にまとめる。
    const order = { found: 0, maybe: 1, unchecked: 2, missing: 3, checking: 4 };
    const off = (x) => (x.owned || x.dup ? 1 : 0);
    return [...items].sort((a, b) => (off(a) - off(b)) || (order[a.status] - order[b.status]));
  }, [items]);

  return createPortal(
    <BottomSheet
      title="本棚の写真から追加"
      onClose={onClose}
      dismissLabel={step === 'reading' || step === 'checking' ? '閉じる' : 'キャンセル'}
      footer={footer}
      beforeClose={step === 'review' && count > 0 ? () => confirm({
        title: '読み取った本を入れずに閉じますか？',
        message: 'もう一度入れるには、写真を撮り直します。',
        confirmLabel: '閉じる',
        cancelLabel: '選び続ける',
      }) : null}
    >
      <div style={step === 'pick' ? undefined : { minHeight: 'min(60vh, 560px)' }}>
        <input ref={inputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
        {step === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-body)', lineHeight: 1.5, color: 'var(--text)', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks('背表紙から書名を読み取ります。')}
            </p>
            <ul style={{ margin: 0, paddingLeft: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', ...note, fontSize: 'var(--text-sub)' }}>
              <li>{withPhraseBreaks('背表紙の文字が読めるくらいに近づいて、正面から')}</li>
              <li>{withPhraseBreaks('1 枚で 40 冊まで。多い棚は段ごとに')}</li>
              <li>{withPhraseBreaks('入れる前に、1 冊ずつ確かめられます')}</li>
            </ul>
            <p style={{ ...note, color: 'var(--text-3)' }}>{withPhraseBreaks('写真は書名を読むためだけに AI（Anthropic の Claude）へ送り、保存しません。')}</p>
            {failure && (
              <ErrorMessage title={failure.title} description={failure.message} actions={[{ label: '写真を選び直す', onClick: pick, variant: 'secondary' }]} />
            )}
          </div>
        )}

        {(step === 'reading' || step === 'checking') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              {photoUrl && <img src={photoUrl} alt="読み取っている本棚の写真" style={{ width: 'var(--space-16)', height: 'var(--space-16)', objectFit: 'cover', borderRadius: 'var(--radius)', border: '1px solid var(--separator)', flexShrink: 0 }} />}
              <div className="ai-thinking" role="status" style={{ flex: 1 }}>
                <span className="ai-thinking-dot" aria-hidden="true" />
                <span>{step === 'reading' ? '本を読み取っています' : `書店で確かめています（${checkedDone}/${items.length}）`}</span>
              </div>
            </div>
            {step === 'checking' && items.map((it) => (
              <div key={it.id} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', minHeight: 'var(--tap-min)' }}>
                {it.status === 'checking'
                  ? <SkeletonBlock width="40px" height="60px" />
                  : <MiniCover title={it.book?.title || it.guess.title} cover={it.book?.cover || ''} width={40} showTitle={false} />}
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sub)', color: it.status === 'checking' ? 'var(--text-2)' : 'var(--text)', overflowWrap: 'anywhere' }}>{it.book?.title || it.guess.title}</span>
              </div>
            ))}
          </div>
        )}

        {(step === 'review' || step === 'saving') && (
          <div>
            <p style={{ margin: 0, fontSize: 'var(--text-body)', color: 'var(--text)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {withPhraseBreaks(`${items.length} 冊を読み取りました。入れる本を選んでください。`)}
            </p>
            <p id="shelfscan-status" style={{ ...groupTitle, margin: 'var(--space-6) 0 var(--space-2)' }}>入れる状態</p>
            <div role="radiogroup" aria-labelledby="shelfscan-status" style={segTrack}>
              {STATUS_CHOICES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={status === c.id} onClick={() => setStatus(c.id)} style={segOption(status === c.id)}>{c.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: 'var(--space-6) 0 var(--space-1)' }}>
              <p style={{ ...groupTitle, margin: 0 }}>読み取った本</p>
              {selectable.length > 1 && (
                <button type="button" style={{ ...btnLink, fontSize: 'var(--text-sub)', marginRight: 'calc(-1 * var(--space-1))' }} onClick={() => setChecked(count === selectable.length ? new Set() : new Set(selectable.map((x) => x.id)))}>
                  {count === selectable.length ? 'すべて外す' : 'すべて選ぶ'}
                </button>
              )}
            </div>
            <div role="list">
              {list.map((it, i) => {
                const on = checked.has(it.id) && !it.owned && !it.dup;
                const off = it.owned || it.dup;
                const b = it.book || it.guess;
                return (
                  <div role="listitem" key={it.id} style={{ borderTop: i ? '1px solid var(--separator)' : 'none' }}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={off || undefined}
                      onClick={() => toggle(it)}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', width: '100%', minHeight: 'var(--tap-min)', padding: 'var(--space-3) 0', background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', cursor: off ? 'default' : 'pointer' }}
                    >
                      <span aria-hidden="true" style={{ width: '1.5em', height: '1.5em', borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-body)', background: on ? 'var(--accent)' : 'transparent', color: 'var(--accent-ink)', boxShadow: on ? 'none' : `inset 0 0 0 1.5px var(${off ? '--separator' : '--border'})` }}>
                        {on && <Check size="0.9em" strokeWidth={3} />}
                      </span>
                      <MiniCover title={b.title} cover={it.book?.cover || ''} width={40} showTitle={false} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--text-body)', fontWeight: 600, lineHeight: 1.5, color: off ? 'var(--text-2)' : 'var(--text)', overflowWrap: 'anywhere' }}>{b.title}</span>
                        {b.author && <span style={{ display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{b.author}</span>}
                        {(off || STATUS_NOTE[it.status]) && (
                          <span style={{ display: 'block', marginTop: 'var(--space-1)', ...note }}>{it.owned ? 'もう本棚にあります' : it.dup ? '上と同じ本です' : withPhraseBreaks(STATUS_NOTE[it.status])}</span>
                        )}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={pick} disabled={busy} style={{ ...btnLink, marginTop: 'var(--space-4)', marginLeft: 'calc(-1 * var(--space-1))' }}>別の写真で読み取る</button>
          </div>
        )}
      </div>
    </BottomSheet>,
    document.body,
  );
}
