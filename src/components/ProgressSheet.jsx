// 📖 どこまで読んだかを記録するシート（2026-11-26 オーナー「何ページまで読んだかの記録をつけたい」
//   「電子書籍の場合ページが画面の比率によって変わるので自由に登録できるのもいいかも」・lib/readingProgress.js）。
//
// 本の詳細（読書中）の「読んだところ」から開く。単位は「ページ｜％」（電子書籍は％・どちらを選んだかは本ごとに覚える）。
// 総ページは本の情報（openBD・Google Books）から入れておき、本人が直せる（版や電子書籍で違うので）。
// 数を並べるだけ（進み具合の棒・「あと N ページ」・達成の表示は作らない）。
import { useState } from 'react';
import BottomSheet from './BottomSheet';
import { btnPrimary, btnPrimaryOff, btnLinkQuiet, input as inputStyle, segTrack, segOption } from '../styles/ui';
import { cleanProgress } from '../lib/readingProgress';

const label = { display: 'block', fontSize: 'var(--text-meta)', color: 'var(--text-2)', marginBottom: 'var(--space-1)' };
const numInput = { ...inputStyle, fontVariantNumeric: 'tabular-nums' };
const digits = (v) => String(v || '').replace(/[^\d０-９]/g, '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).slice(0, 5);

// book: 本（currentPage / totalPages / progressUnit）・infoPages: 本の情報の総ページ（無ければ 0）
export default function ProgressSheet({ book, infoPages = 0, onSave, onClose }) {
  const [unit, setUnit] = useState(book?.progressUnit === 'percent' ? 'percent' : 'page');
  const [current, setCurrent] = useState(book?.currentPage != null ? String(book.currentPage) : '');
  const [total, setTotal] = useState(book?.totalPages ? String(book.totalPages) : infoPages ? String(infoPages) : '');
  const fromInfo = !book?.totalPages && !!infoPages && total === String(infoPages);
  const v = cleanProgress({ unit, current, total });
  const canSave = v.current != null;
  const over = unit === 'page' && v.total != null && Number(current) > v.total;
  const save = () => { if (!canSave) return; onSave(v); onClose(); };
  const clear = () => { onSave({ unit, current: null, total: unit === 'page' ? v.total : null }); onClose(); };
  const onKey = (e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); save(); } };
  return (
    <BottomSheet
      title="読んだところ"
      eyebrow={book?.title ? `『${book.title}』` : ''}
      dismissLabel="キャンセル"
      onClose={onClose}
      footer={(
        <button type="button" onClick={save} disabled={!canSave} style={canSave ? btnPrimary : btnPrimaryOff}>保存</button>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {/* 単位（ページ｜％）。電子書籍は画面の大きさでページが変わるので％で */}
        <div role="radiogroup" aria-label="記録の単位" style={segTrack}>
          {[{ v: 'page', l: 'ページ' }, { v: 'percent', l: '％（電子書籍）' }].map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={unit === o.v} onClick={() => setUnit(o.v)} style={segOption(unit === o.v)}>
              {o.l}
            </button>
          ))}
        </div>
        {unit === 'page' ? (
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>いまのページ</span>
              <input type="text" inputMode="numeric" autoFocus value={current} onChange={(e) => setCurrent(digits(e.target.value))} onKeyDown={onKey} maxLength={5} placeholder="例：120" aria-invalid={over || undefined} style={numInput} />
            </label>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>総ページ</span>
              <input type="text" inputMode="numeric" value={total} onChange={(e) => setTotal(digits(e.target.value))} onKeyDown={onKey} maxLength={5} placeholder="例：320" style={numInput} />
              {fromInfo && <span style={{ ...label, margin: 'var(--space-1) 0 0', color: 'var(--text-3)' }}>本の情報から</span>}
            </label>
          </div>
        ) : (
          <label>
            <span style={label}>読んだところ（％）</span>
            <input type="text" inputMode="numeric" autoFocus value={current} onChange={(e) => setCurrent(digits(e.target.value).slice(0, 3))} onKeyDown={onKey} maxLength={3} placeholder="例：45" style={{ ...numInput, maxWidth: 160 }} />
          </label>
        )}
        {over && <p role="status" style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)' }}>総ページより先なので、{v.total} ページとして保存します。</p>}
        {book?.currentPage != null && (
          <button type="button" onClick={clear} style={{ ...btnLinkQuiet, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>記録を消す</button>
        )}
      </div>
    </BottomSheet>
  );
}
