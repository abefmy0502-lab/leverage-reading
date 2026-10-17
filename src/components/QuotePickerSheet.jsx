// 📝 写真で共有の「一文を選ぶ」（2026-10-17 オーナー「一文を選択できるようにしてください」）。
//
// 前は「別の一文」で 1 つずつ次へ送るだけだった＝欲しい一文までたどり着けない。重ねる候補（自分の言葉のメモ・AI まとめは入れない）を
// 一覧にして、押した一文を画像に重ねる。並びは候補の順（本のときは新しい順・今年は「いちばん残した一文」から）。
// 記録の重ね方だけは「一文を入れない」も選べる（allowNone）。
// 見た目は BottomSheet（layer='dialog'＝共有のシートの上に重ねる）。行は 3 行まで・下に「p.64 · 5/27」（今月・今年は書名も）。
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import { fmtDateJa } from '../lib/dates';

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

const textStyle = {
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontSize: 'var(--text-body)',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};

const metaStyle = { marginTop: 'var(--space-1)', color: 'var(--text-2)', fontSize: 'var(--text-meta)' };

export function quoteMeta(m, bookTitle = '') {
  return [bookTitle ? `『${bookTitle}』` : '', Number.isFinite(m?.pageNumber) ? `p.${m.pageNumber}` : '', fmtDateJa(m?.createdAt)].filter(Boolean).join(' · ');
}

export default function QuotePickerSheet({ candidates, selected, allowNone = false, bookTitleOf = null, onSelect, onClose }) {
  const pick = (i) => { onSelect(i); onClose(); };
  // 共有のシートの中から開くので、document.body に出す（親のシートの動きに位置が引きずられない）
  return createPortal(
    <BottomSheet title="一文を選ぶ" onClose={onClose} dismissLabel="閉じる" layer="dialog">
      <ul role="listbox" aria-label="画像に重ねる一文" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-2)' }}>
        {allowNone && (
          <li>
            <button type="button" role="option" aria-selected={selected < 0} onClick={() => pick(-1)} style={rowStyle(selected < 0)}>
              <span style={{ fontSize: 'var(--text-body)', lineHeight: 1.6, color: 'var(--text-2)' }}>一文を入れない</span>
              {selected < 0 && <Check size="1.2em" color="var(--accent)" aria-hidden="true" />}
            </button>
          </li>
        )}
        {candidates.map((m, i) => {
          const on = i === selected;
          const meta = quoteMeta(m, bookTitleOf ? bookTitleOf(m) : '');
          return (
            <li key={m.id || i}>
              <button type="button" role="option" aria-selected={on} onClick={() => pick(i)} style={rowStyle(on)}>
                <span style={{ minWidth: 0 }}>
                  <span style={textStyle}>{String(m.text || '').trim()}</span>
                  {meta && <span style={{ ...metaStyle, display: 'block' }}>{meta}</span>}
                </span>
                {on && <Check size="1.2em" color="var(--accent)" aria-hidden="true" style={{ marginTop: 'var(--space-1)' }} />}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>,
    document.body,
  );
}
