// 📝 写真で共有の「一文を選ぶ」（2026-10-17 オーナー「一文を選択できるようにしてください」）。
//
// 前は「別の一文」で 1 つずつ次へ送るだけだった＝欲しい一文までたどり着けない。重ねる候補（自分の言葉のメモ・AI まとめは入れない）を
// 一覧にして、押した一文を画像に重ねる。並びは候補の順（本のときは新しい順・今年は「いちばん残した一文」から）。
// 記録の重ね方だけは「一文を入れない」も選べる（allowNone）。
// 2026-11-15 オーナー「自分がメモした文章を選択できるように・いろんなパターンを想定してわかりやすく」:
//   上に「あなたが残したメモから選べます」の 1 行。行を押すと全文を選んで閉じる。2 文以上のメモは右の ▾（44×44 の別のボタン）で
//   開いて 1 文ずつ選べる（splitQuoteSentences）。選んだ文は onSelect(i, part) の part（全文は null）。選んだ印（面・枠・✓）は 1 行だけ。
//   読み上げは radiogroup の radio（aria-checked）と、開閉のボタン（aria-expanded）。メモが 1 件だけでも開ける。
// 見た目は BottomSheet（layer='dialog'＝共有のシートの上に重ねる）。行は 3 行まで・下に「p.64 · 5/27」（今月・今年は書名も）。
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { fmtDateJa } from '../lib/dates';
import { splitQuoteSentences } from '../lib/shareOverlay';
import { withPhraseBreaks } from './TightBubble';

const rowStyle = (on) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) var(--space-6)',
  columnGap: 'var(--space-3)',
  alignItems: 'start',
  width: '100%',
  minHeight: 'var(--tap-min)',
  padding: 'var(--space-3) var(--space-4)',
  border: `1px solid ${on ? 'var(--accent)' : 'var(--separator)'}`,
  borderRadius: 'var(--radius)',
  background: on ? 'var(--accent-soft)' : 'var(--surface)',
  color: 'var(--text)',
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer',
});

// 文節で折り返す（語の途中で割らない・DESIGN の決まり）。
const textStyle = {
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontSize: 'var(--text-body)',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'keep-all',
  overflowWrap: 'break-word',
};

const metaStyle = { marginTop: 'var(--space-1)', color: 'var(--text-2)', fontSize: 'var(--text-meta)' };

// 開閉のボタン（行の右・44×44・行とは別のボタン）。
const toggleStyle = {
  flexShrink: 0,
  width: 'var(--tap-min)',
  minHeight: 'var(--tap-min)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--separator)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  color: 'var(--text-2)',
  cursor: 'pointer',
  padding: 0,
};

export function quoteMeta(m, bookTitle = '') {
  return [bookTitle ? `『${bookTitle}』` : '', Number.isFinite(m?.pageNumber) ? `p.${m.pageNumber}` : '', fmtDateJa(m?.createdAt)].filter(Boolean).join(' · ');
}

export default function QuotePickerSheet({ candidates, selected, selectedPart = null, allowNone = false, bookTitleOf = null, onSelect, onClose }) {
  const pick = (i, part = null) => { onSelect(i, part); onClose(); };
  // 開いているメモ。はじめは、一部を選んでいるメモを開いておく。
  const [openIdx, setOpenIdx] = useState(selectedPart && selected >= 0 ? selected : null);
  const lead = candidates.length > 1
    ? 'あなたが残したメモから選べます。長いメモは、▾ で使う文だけを選べます。'
    : '長いメモは、▾ で使う文だけを選べます。';
  const check = <Check size="1.2em" color="var(--accent)" aria-hidden="true" style={{ marginTop: 'var(--space-1)' }} />;
  // 共有のシートの中から開くので、document.body に出す（親のシートの動きに位置が引きずられない）
  return createPortal(
    <BottomSheet title="一文を選ぶ" onClose={onClose} layer="dialog">
      <p style={{ margin: '0 0 var(--space-3)', color: 'var(--text-2)', fontSize: 'var(--text-sub)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{withPhraseBreaks(lead)}</p>
      <ul role="radiogroup" aria-label="画像に重ねる一文" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
        {allowNone && (
          <li>
            <button type="button" role="radio" aria-checked={selected < 0} onClick={() => pick(-1)} style={rowStyle(selected < 0)}>
              <span style={{ fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--text-2)' }}>一文を入れない</span>
              {selected < 0 && check}
            </button>
          </li>
        )}
        {candidates.map((m, i) => {
          const meta = quoteMeta(m, bookTitleOf ? bookTitleOf(m) : '');
          const parts = splitQuoteSentences(m.text);
          const open = openIdx === i && parts.length > 0;
          const fullOn = i === selected && !selectedPart;
          const text = String(m.text || '').trim();
          return (
            <li key={m.id || i}>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--space-2)' }}>
                <button type="button" role="radio" aria-checked={fullOn} onClick={() => pick(i)} style={{ ...rowStyle(fullOn), flex: 1, minWidth: 0 }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={open ? { ...textStyle, WebkitLineClamp: 'unset', display: 'block' } : textStyle}>{withPhraseBreaks(text)}</span>
                    {meta && <span style={{ ...metaStyle, display: 'block' }}>{meta}</span>}
                  </span>
                  {fullOn ? check : <span aria-hidden="true" />}
                </button>
                {parts.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? 'このメモの 1 文ずつの一覧を閉じる' : 'このメモから 1 文だけを選ぶ'}
                    onClick={() => setOpenIdx(open ? null : i)}
                    style={toggleStyle}
                  >
                    <ChevronDown size="1.2em" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--duration-fast) var(--ease-out)' }} />
                  </button>
                )}
              </div>
              {open && (
                <ul role="radiogroup" aria-label="このメモから使う 1 文" style={{ listStyle: 'none', margin: 'var(--space-2) 0 0', padding: '0 calc(var(--tap-min) + var(--space-2)) 0 var(--space-4)', display: 'grid', gap: 'var(--space-2)' }}>
                  {parts.map((t) => {
                    const pOn = i === selected && selectedPart === t;
                    return (
                      <li key={t}>
                        <button type="button" role="radio" aria-checked={pOn} onClick={() => pick(i, t)} style={rowStyle(pOn)}>
                          <span style={{ fontSize: 'var(--text-body)', lineHeight: 1.6, minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>{withPhraseBreaks(t)}</span>
                          {pOn ? check : <span aria-hidden="true" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {candidates.length === 1 && (
        <p style={{ margin: 'var(--space-4) 0 0', color: 'var(--text-2)', fontSize: 'var(--text-meta)', lineHeight: 1.6, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
          {withPhraseBreaks('この本のメモは、いまこの 1 件です。メモが増えると、ここから選べます。')}
        </p>
      )}
    </BottomSheet>,
    document.body,
  );
}
