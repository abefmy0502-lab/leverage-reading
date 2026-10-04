// 📚 本棚の本カード 2 種。App.jsx から切り出した自己完結コンポーネント。
//   - BookCoverCard: グリッド表示（表紙主役）
//   - SwipeableBookCard: リスト表示（スワイプ削除 + 長押し）
// トップレベル定義なので per-card hooks（useLongPress）が Rules of Hooks に従う。
// 表紙プレースホルダ色は src/lib/coverPalette.js（paletteFor）を参照。

import { memo, useState, useEffect } from 'react';
import { useLongPress } from '../hooks/useLongPress';
import { paletteFor } from '../lib/coverPalette';
import { ensureHttps } from '../lib/url';
import { isCoverLikeSize } from '../lib/bookCover';
import { ChevronRight } from 'lucide-react';
import SwipeableCard from './SwipeableCard';
import { Stars } from './formPrimitives';
import { searchMarkStyle } from '../styles/searchMark';
import { getSt } from '../lib/status';
import { withPhraseBreaks, longestPhraseLength } from './TightBubble';

// 状態の表示用ラベル（押せない）。DESIGN §5「表示用ラベル」: 面を付けず、アイコン＋--text-2 13 の文字。
// 本の一覧の行（著者の横）と本の詳細の見出しで共有する。
export function StatusLabel({ status, style }) {
  const s = getSt(status);
  const Icon = s.Icon;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', whiteSpace: 'nowrap', flexShrink: 0, ...style }}>
      {Icon && <Icon size="1.1em" strokeWidth={1.75} aria-hidden="true" style={{ flexShrink: 0 }} />}
      {s.label}
    </span>
  );
}

// グリッド表示用の本カード（表紙主役）。表紙無し / 画像 404 時は
// タイトルベースの色付きプレースホルダにフォールバック。
// showStatus: 状態で絞り込んでいるときは全部同じ状態なので、表紙の上の状態を出さない（App が「すべて」のときだけ true）。
export const BookCoverCard = memo(function BookCoverCard({ book, isJustDone, onOpen, onLongPress, onAutoRetry, showStatus = true }) {
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, book }),
  });
  const [from, to] = paletteFor(book.title);
  // book.id をキーに使って、book が変わった時のみ broken state をリセット。
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setBroken(false); setLoaded(false); }, [book.id, book.cover]);
  const showPlaceholder = !book.cover || broken;
  // 表紙が出ない本はバックグラウンドで再解決をキューイング（coverAutoRetry が 1 冊ずつ・
  // 「見つからない」は 7 日おく）。保存済みの URL が読めなかったときは、その URL を
  // brokenCover として渡す（それだけは差し替えてよい）。
  useEffect(() => {
    if (showPlaceholder) onAutoRetry?.(book, broken && book.cover ? { brokenCover: book.cover } : undefined);
  }, [showPlaceholder, book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      className="book-cover-card"
      onClick={() => onOpen?.(book)}
      {...longPress.bind}
      style={{
        animation: isJustDone ? 'leverage-card-celebrate 2.4s ease both' : undefined,
      }}
    >
      <div className="book-cover-image-wrap">
        {/* グラデーションプレースホルダは常に下敷き: (a) ロード待ちの間も
            タイトル入りの色面が見える（生成りの空白にしない） (b) 画像は
            onLoad で opacity フェードイン＝突然のポップインを消す
            (c) onError 時の白フラッシュも起きない。 */}
        <div
          className="book-cover-placeholder"
          style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          {withPhraseBreaks(book.title, { scriptBreaks: true })}
        </div>
        {!showPlaceholder && (
          <img
            className={`book-cover-img${loaded ? ' is-loaded' : ''}`}
            src={ensureHttps(book.cover)}
            alt=""
            loading="lazy"
            decoding="async"
            // キャッシュ済み画像は onLoad が発火しないことがあるため、
            // ref で complete を同期検出して即表示（再訪時のフェード再生なし）。
            ref={(el) => {
              if (el && el.complete && el.naturalWidth > 1 && !loaded) setLoaded(true);
            }}
            onError={() => setBroken(true)}
            // 1×1 の透明画像・Google Books の "No cover"（128×170・縦/横 1.33）を実画像と区別する。
            // 判定は確認（checkImageExists）と同じ isCoverLikeSize（配信元ごと）。以前はここだけ
            // 全配信元に 1.35 を課していて、確認を通って保存された正方形寄りの表紙（楽天の
            // _ex=420x420・ムック・自分で撮った写真）が本棚ではずっとグラデーションのままだった。
            onLoad={(e) => {
              const t = e?.target;
              if (!t) return;
              if (!isCoverLikeSize(book.cover, t.naturalWidth || 0, t.naturalHeight || 0)) { setBroken(true); return; }
              setLoaded(true);
            }}
          />
        )}
      </div>
      {/* 文節の切れ目でだけ折り返す（「チーズはどこへ消／えた？」と語の途中で割れていた・2026-10-04）。 */}
      <p className="book-cover-title">{withPhraseBreaks(book.title, { scriptBreaks: true })}</p>
      {/* 著者が無い本も 1 行ぶん空けて、状態の行をとなりのカードとそろえる。 */}
      <p className="book-cover-author" aria-hidden={book.author ? undefined : true}>{book.author || '\u00a0'}</p>
      {/* 状態は表紙に重ねず、著者の下に面なしのラベルで（DESIGN §5「表示用ラベル」）。
          状態で絞り込んでいるときは全部同じなので出さない（showStatus=false）。 */}
      {showStatus && book.status && <StatusLabel status={book.status} style={{ marginTop: 'var(--space-1)', maxWidth: '100%' }} />}
    </button>
  );
});

// 🖼 小さな表紙サムネ（縦長比率固定）。「続きから」等のミニカード用。
// BookCoverCard と同じ流儀 — タイトル入りの色付きプレースホルダを常に下敷きにし、
// 画像は onLoad でフェードイン・失敗(onError/1×1ダミー)時はプレースホルダに退避。
// 生の <img> を直接置くと、読み込み中/失敗時に「白い空き枠」になる（本棚の
// 続きからで実際に起きていた）。
export function MiniCover({ book, width = 44, radius = 4, onAutoRetry }) {
  const [from, to] = paletteFor(book.title);
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setBroken(false); setLoaded(false); }, [book.id, book.cover]);
  const show = !!book.cover && !broken;
  useEffect(() => {
    if (!show) onAutoRetry?.(book, broken && book.cover ? { brokenCover: book.cover } : undefined);
  }, [show, book.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const height = Math.round(width * 1.42); // 一般的な書籍の縦横比
  const showTitle = width >= 48 && longestPhraseLength(book.title, { scriptBreaks: true }) * 12 <= width - 8 - 2; // 2: 字幅の端数で行からはみ出さない余裕
  return (
    // 表紙は「本の形」（DESIGN §4 の例外: 角丸 4）。影は使わず、極細の枠で面と分ける（暗い画面でも成立）。
    <div style={{ position: 'relative', width, height, borderRadius: radius, overflow: 'hidden', flexShrink: 0, boxShadow: 'inset 0 0 0 1px var(--separator)' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, ${from}, ${to})`,
          color: 'var(--on-cover)', fontSize: 'var(--text-caption)', fontWeight: 600,
          padding: 'var(--space-1)', lineHeight: 1.3, overflow: 'hidden',
        }}
      >
        {/* 幅 48 未満の小さな表紙には書名を出さない（1 行に 2〜3 字しか入らず「1兆ド／ルコ」のように割れて読めない・
            書名は横の行に出ている・2026-09-29）。出すときは文節の切れ目（BudouX の <wbr>）でだけ折り返す。
            行の切り詰めは内側の文字にかける（箱全体にかけると、下の行が半分だけ見えてしまう）。 */}
        {/* さらに、いちばん長い文節が 1 行に収まる表紙にだけ出す（字 12 × 字数 ≦ 幅 − 内側の余白 8・2026-09-29）。 */}
        {showTitle && (
          <span style={{ display: '-webkit-box', WebkitLineClamp: Math.max(1, Math.floor((height - 8) / 16)), WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
            {withPhraseBreaks(book.title, { scriptBreaks: true })}
          </span>
        )}
      </div>
      {show && (
        <img
          src={ensureHttps(book.cover)}
          alt=""
          loading="lazy"
          decoding="async"
          ref={(el) => { if (el && el.complete && el.naturalWidth > 1 && !loaded) setLoaded(true); }}
          onError={() => setBroken(true)}
          onLoad={(e) => {
            const t = e?.target;
            if (!t) return;
            if (!isCoverLikeSize(book.cover, t.naturalWidth || 0, t.naturalHeight || 0)) { setBroken(true); return; }
            setLoaded(true);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity .25s ease' }}
        />
      )}
    </div>
  );
}

// 検索の一致の印つきの文字（[{ text, match }]・無ければそのまま）。
function Marked({ segments, text }) {
  if (!Array.isArray(segments)) return text;
  return segments.map((s, i) => (s.match ? <mark key={i} style={searchMarkStyle}>{s.text}</mark> : <span key={i}>{s.text}</span>));
}

// Swipeable + long-pressable book row used on the bookshelf list.
// highlight: すべての本の検索で書名・著者・タグで見つかったとき、その部分に印（{ title, author: 印の配列 | null, tag: タグ | null }・2026-09-30）。
export const SwipeableBookCard = memo(function SwipeableBookCard({ book, index, isJustDone, onOpen, onSwipeDelete, onLongPress, onAutoRetry, showStatus = true, highlight = null }) {
  const longPress = useLongPress({
    onLongPress: ({ clientX, clientY }) => onLongPress?.({ x: clientX, y: clientY, book }),
  });
  // 表紙の読込・失敗検知・裏での再解決（onAutoRetry）は MiniCover が受け持つ。
  return (
    <SwipeableCard onDelete={() => onSwipeDelete?.(book)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${book.title || '無題'} を開く`}
        onClick={() => onOpen?.(book)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onOpen?.(book);
          }
        }}
        {...longPress.bind}
        style={{
          background: "var(--surface)",
          borderRadius: 'var(--radius)',
          padding: "var(--space-3) var(--space-4)",
          border: "1px solid var(--separator)",
          cursor: "pointer",
          transition: "background .12s ease, box-shadow .35s ease, transform .12s ease",
          animation: isJustDone
            ? "leverage-card-celebrate 2.4s ease both"
            // スタッガーは最初の一画面分（8件）だけ。無制限だと 60 冊目は
            // 1.2 秒不可視になり、詳細から戻るたびに画面が空白→パラパラ出現する。
            : `slideUp .3s ease ${Math.min(index, 8) * 0.02}s both`,
          // 長押しでカード周辺のテキスト選択 / iOS の callout を抑止。
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <div style={{ display: "flex", gap: 'var(--space-3)', alignItems: "center" }}>
          {/* 表紙は共通の MiniCover（読込フェード・失敗検知・代用表紙つき・角丸 4）。 */}
          <MiniCover book={book} width={44} onAutoRetry={onAutoRetry} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-body)', fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Marked segments={highlight?.title} text={book.title} /></div>
            {/* 状態 → 評価 · 著者 を 1 行に（行を短く）。長さが変わる著者を最後に置き、
                省略されても区切りの位置が本ごとにずれないようにする。状態は押せないラベル＝面なし。 */}
            <div style={{ display: "flex", alignItems: "center", gap: 'var(--space-2)', marginTop: 'var(--space-1)', minWidth: 0 }}>
              {showStatus && <StatusLabel status={book.status} />}
              {book.rating > 0 && <span style={{ flexShrink: 0, display: 'inline-flex' }}><Stars r={book.rating} size="calc(12rem / 17)" /></span>}
              {book.author && (showStatus || book.rating > 0) && <span aria-hidden="true" style={{ fontSize: 'var(--text-meta)', color: 'var(--text-3)', flexShrink: 0 }}>·</span>}
              {book.author && <span style={{ flex: 1, fontSize: 'var(--text-meta)', color: "var(--text-2)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Marked segments={highlight?.author} text={book.author} /></span>}
            </div>
            {/* タグで見つかったときだけ、そのタグを 1 行（行の中にタグを並べないので、見つかった理由が分かるように）。 */}
            {highlight?.tag && (
              <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <mark style={{ ...searchMarkStyle, color: 'var(--text-2)' }}>#{highlight.tag}</mark>
              </div>
            )}
          </div>
          <ChevronRight size={18} strokeWidth={1.75} color="var(--text-3)" aria-hidden="true" />
        </div>
      </div>
    </SwipeableCard>
  );
});
