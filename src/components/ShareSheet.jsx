// 📤 一文をシェア — 「この本の一文」を 1 枚の画像にして、端末の共有シートへ。
//
// 開いた時点で、いちばん上の候補（ページつきのメモ → 新しい順・メモの「…」から開いたらそのメモ）を
// ストーリー 9:16・紙 で描き終えておく＝そのまま「シェアする」を押すだけ（ワンタップ）。
// 変えたいときだけ: 形（ストーリー / 投稿）・色（紙 / 夜 / 表紙の色）・どの一文にする？
// 画像に入るのは、選んだ一文・書名・著者・ページ・表紙・Orime の文字と URL だけ。
// プレビューが、外に出る画像そのもの（ここに無いものは外に出ない）。
//
// props:
//   book         … { id, title, author, cover }（必須）
//   memos        … この本のメモ（無ければこのシートで読み込む）
//   initialMemoId… 先に選んでおくメモ（メモの「…」→「この一文をシェア」）
//   onWriteMemo  … メモが無いときの「メモを書く」
//   onClose

import { useEffect, useMemo, useRef, useState } from 'react';
import { Quote } from 'lucide-react';
import BottomSheet from './BottomSheet';
import EmptyState from './EmptyState';
import ErrorMessage from './ErrorMessage';
import { SkeletonBlock } from './Skeleton';
import { useToast } from './Toast';
import { useHaptic } from '../hooks/useHaptic';
import { useBookMemos } from '../hooks/useBookMemos';
import { toMessage } from '../lib/errors';
import { track, EVENTS } from '../lib/analytics';
import { SITE_URL } from '../lib/legalLinks';
import { renderLineCard, prepareCover, readShareTheme } from '../lib/shareCard';
import { orderLineCandidates, buildShareText, shareFilename } from '../lib/shareCardLayout';
import { shareImage, saveImage } from '../lib/shareImage';
import { btnPrimary, btnPrimaryOff, btnLink, groupTitle } from '../styles/ui';

const FORMAT_OPTIONS = [
  { v: 'story', label: 'ストーリー' },
  { v: 'post', label: '投稿' },
];
const STYLE_OPTIONS = [
  { v: 'paper', label: '紙' },
  { v: 'night', label: '夜' },
  { v: 'cover', label: '表紙の色' },
];

// プレビューの高さ（シートが 1 画面に収まるように・形が変わっても高さは同じ）。
const PREVIEW_H = 'min(40vh, 340px)';

// 形の切り替えは、振り返り・相談のサブタブ（.sub-tab）と同じ見た目（選択中は --accent-soft の面）。
const segWrap = { display: 'inline-flex', gap: 'var(--space-1)', flexShrink: 0 };
const segBtn = (on) => ({
  minHeight: 44,
  padding: '0 var(--space-3)',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: on ? 'var(--accent-soft)' : 'transparent',
  color: on ? 'var(--accent)' : 'var(--text-2)',
  fontFamily: 'inherit',
  fontSize: 'var(--text-sub)',
  fontWeight: on ? 600 : 400,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});
// 色の見本（押せる範囲 44・見た目は 28 の円＝「形そのもの」DESIGN §4 の例外）。
const swatchBtn = {
  width: 44,
  height: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 'var(--radius-full)',
};
const swatchDot = (color, on) => ({
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-full)',
  background: color,
  boxShadow: on
    ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)'
    : 'inset 0 0 0 1px var(--border)',
});

// ページの無いメモは、書いた日で見分ける。
function memoDate(m) {
  const d = new Date(m.createdAt || m.created_at || '');
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日のメモ`;
}

const pickCard = (on) => ({
  flex: '0 0 auto',
  width: 220,
  textAlign: 'left',
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius)',
  border: on ? '1px solid var(--accent)' : '1px solid var(--separator)',
  background: on ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  cursor: 'pointer',
  scrollSnapAlign: 'start',
});

export default function ShareSheet({ book, memos: memosProp, initialMemoId = null, onWriteMemo, onClose }) {
  const toast = useToast();
  const haptic = useHaptic();
  // メモを渡されなかったとき（本棚の長押しから開いたなど）だけ、ここで読み込む。
  const loaded = useBookMemos(memosProp ? null : book?.id);
  const memos = memosProp || loaded.memos;
  const memosLoading = !memosProp && loaded.loading;

  const candidates = useMemo(() => orderLineCandidates(memos, initialMemoId), [memos, initialMemoId]);
  const [memoId, setMemoId] = useState(initialMemoId);
  const chosen = candidates.find((m) => m.id === memoId) || candidates[0] || null;

  const [format, setFormat] = useState('story');
  const [style, setStyle] = useState('paper');
  const [cover, setCover] = useState(null); // prepareCover の結果（null＝読み込み中）
  const [card, setCard] = useState(null); // { url, blob, line }
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rendering, setRendering] = useState(true);
  const genRef = useRef(0);
  const urlRef = useRef(null);

  // 表紙は 1 回だけ読む（外部の画像は自前の中継を通す・読めなければ代用表紙）。
  useEffect(() => {
    let alive = true;
    prepareCover(book).then((c) => { if (alive) setCover(c); }).catch(() => { if (alive) setCover({ image: null, tone: null }); });
    return () => { alive = false; };
  }, [book?.cover]); // eslint-disable-line react-hooks/exhaustive-deps

  // 選んだものが変わるたびに描き直す（前の画像は、新しい画像ができるまで出したまま）。
  useEffect(() => {
    if (!chosen || !cover) return undefined;
    const gen = ++genRef.current;
    setRendering(true);
    setError('');
    renderLineCard({
      line: chosen.text,
      page: Number.isFinite(chosen.pageNumber) ? chosen.pageNumber : null,
      title: book?.title || '',
      author: book?.author || '',
      cover,
      style,
      format,
    })
      .then(({ blob, line }) => {
        if (gen !== genRef.current) return;
        const url = URL.createObjectURL(blob);
        const prev = urlRef.current;
        urlRef.current = url;
        setCard({ url, blob, line, format });
        setStatus('ready');
        setRendering(false);
        if (prev) setTimeout(() => { try { URL.revokeObjectURL(prev); } catch { /* ignore */ } }, 1000);
      })
      .catch((e) => {
        if (gen !== genRef.current) return;
        console.error('share card render error', e);
        setError(toMessage(e, '画像を作れませんでした。'));
        setStatus('error');
        setRendering(false);
      });
    return undefined;
  }, [chosen?.id, chosen?.text, chosen?.pageNumber, cover, style, format, retry, book?.title, book?.author]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (urlRef.current) { try { URL.revokeObjectURL(urlRef.current); } catch { /* ignore */ } }
  }, []);

  // 描き直している間は押せない（前の形・色の画像を出したままなので、違う画像を送らないように）。
  const ready = status === 'ready' && !!card && !busy && !rendering;
  const filename = shareFilename({ format, style });

  const handleShare = async () => {
    if (!ready) return;
    haptic.light();
    setBusy(true);
    try {
      const text = buildShareText({ title: book?.title, line: card.line, siteUrl: SITE_URL });
      const result = await shareImage({ blob: card.blob, filename, text });
      if (result !== 'cancelled') track(EVENTS.SHARE_CARD, { kind: 'line', style, format, via: result });
      if (result === 'saved') toast.info('この端末では共有できないため、画像を保存しました。');
    } catch (e) {
      toast.error(toMessage(e, 'シェアできませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const result = await saveImage({ blob: card.blob, filename });
      if (result !== 'cancelled') track(EVENTS.SHARE_CARD, { kind: 'line', style, format, via: 'saved' });
      if (result === 'saved') { haptic.success(); toast.success('画像を保存しました。'); }
    } catch (e) {
      toast.error(toMessage(e, '保存できませんでした。'));
    } finally {
      setBusy(false);
    }
  };

  // 色の見本（そのときの表紙から作った色も見せる）。
  const swatchColor = (v) => {
    try { return readShareTheme(v, { tone: cover?.tone, title: book?.title }).bg || 'var(--fill)'; } catch { return 'var(--fill)'; }
  };

  const noLine = !memosLoading && candidates.length === 0;
  const aspect = format === 'post' ? '4 / 5' : '9 / 16';

  const footer = noLine ? null : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <button
        type="button"
        onClick={handleSave}
        disabled={!ready}
        style={{ ...btnLink, color: ready ? 'var(--accent)' : 'var(--text-3)', opacity: 1, cursor: ready ? 'pointer' : 'default', flexShrink: 0 }}
      >
        画像を保存
      </button>
      <button type="button" onClick={handleShare} disabled={!ready} aria-busy={busy || rendering} style={{ ...(ready ? btnPrimary : btnPrimaryOff), flex: 1 }}>
        シェアする
      </button>
    </div>
  );

  return (
    <BottomSheet title="一文をシェア" onClose={onClose} footer={footer} dismissLabel="キャンセル">
      {memosLoading && (
        <div style={{ display: 'flex', justifyContent: 'center' }} aria-busy="true" aria-label="読み込み中">
          <SkeletonBlock width={`calc(${PREVIEW_H} * 9 / 16)`} height={PREVIEW_H} radius="var(--radius)" />
        </div>
      )}

      {noLine && (
        <EmptyState
          icon={<Quote size={34} aria-hidden="true" />}
          title="シェアしたい一文をメモに残しましょう"
          actions={onWriteMemo ? [{ label: 'メモを書く', onClick: onWriteMemo, variant: 'secondary' }] : []}
        />
      )}

      {!memosLoading && chosen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* プレビュー＝外に出る画像そのもの */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{ position: 'relative', height: PREVIEW_H, aspectRatio: aspect, borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px var(--separator)', background: 'var(--fill)' }}
              aria-live="polite"
            >
              {status === 'error' ? (
                <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', display: 'flex', alignItems: 'center' }}>
                  <ErrorMessage
                    title="画像を作れませんでした"
                    description={error}
                    actions={[{ label: 'もう一度', onClick: () => setRetry((n) => n + 1) }]}
                  />
                </div>
              ) : card && card.format === format ? (
                <img
                  src={card.url}
                  alt={`『${book?.title || ''}』の一文の画像（${format === 'post' ? '投稿' : 'ストーリー'}・${STYLE_OPTIONS.find((o) => o.v === style)?.label}）`}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <SkeletonBlock width="100%" height="100%" radius="var(--radius)" />
              )}
            </div>
          </div>

          {/* 形と色（1 行）。形は切り替え（セグメント）1 つ、色は見本の丸。 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <div role="radiogroup" aria-label="画像の形" style={segWrap}>
              {FORMAT_OPTIONS.map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={format === o.v} onClick={() => setFormat(o.v)} style={segBtn(format === o.v)}>
                  {o.label}
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="色" style={{ display: 'flex', marginRight: 'calc(-1 * var(--space-2))' }}>
              {STYLE_OPTIONS.map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={style === o.v} aria-label={o.label} title={o.label} onClick={() => setStyle(o.v)} style={swatchBtn}>
                  <span aria-hidden="true" style={swatchDot(swatchColor(o.v), style === o.v)} />
                </button>
              ))}
            </div>
          </div>

          {/* どの一文にする？（候補が 2 つ以上のときだけ） */}
          {candidates.length > 1 && (
            <section aria-labelledby="share-pick-title">
              <h4 id="share-pick-title" style={{ ...groupTitle, marginBottom: 'var(--space-2)' }}>どの一文にする？</h4>
              <div
                role="radiogroup"
                aria-labelledby="share-pick-title"
                style={{ display: 'flex', gap: 'var(--space-3)', overflowX: 'auto', scrollSnapType: 'x mandatory', margin: '0 calc(-1 * var(--space-4))', padding: '0 var(--space-4)', scrollPaddingLeft: 'var(--space-4)', WebkitOverflowScrolling: 'touch' }}
              >
                {candidates.map((m) => {
                  const on = m.id === chosen.id;
                  return (
                    <button key={m.id} type="button" role="radio" aria-checked={on} onClick={() => setMemoId(m.id)} style={pickCard(on)}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontFamily: 'var(--font-read)', fontSize: 'var(--text-sub)', lineHeight: 1.6, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                        {m.text}
                      </span>
                      <span style={{ display: 'block', marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>
                        {Number.isFinite(m.pageNumber) ? `p.${m.pageNumber}` : memoDate(m)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
