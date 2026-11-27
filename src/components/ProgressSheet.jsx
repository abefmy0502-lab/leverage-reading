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
export default function ProgressSheet({ book, infoPages = 0, onSave, onClear, onClose }) {
  const [unit, setUnit] = useState(book?.progressUnit === 'percent' ? 'percent' : 'page');
  // 単位ごとの下書き（％ → ページ → ％ と替えても、打った数が消えない・2026-11-26 点検）
  const [drafts, setDrafts] = useState(() => ({ [book?.progressUnit === 'percent' ? 'percent' : 'page']: book?.currentPage != null ? String(book.currentPage) : '' }));
  const current = drafts[unit] ?? '';
  const setCurrent = (v) => setDrafts((d) => ({ ...d, [unit]: v }));
  const [total, setTotal] = useState(book?.totalPages ? String(book.totalPages) : infoPages ? String(infoPages) : '');
  const fromInfo = !book?.totalPages && !!infoPages && total === String(infoPages);
  const v = cleanProgress({ unit, current, total });
  const canSave = v.current != null;
  const over = unit === 'page' && v.total != null && Number(current) > v.total;
  const overPct = unit === 'percent' && Number(current) > 100;
  // ％で保存しても、本の総ページの記録は残す（2026-11-26 ui-critic）
  const save = () => { if (!canSave) return; onSave(unit === 'percent' ? { ...v, total: book?.totalPages ?? null } : v); onClose(); };
  // 消すのは親（元に戻すつきの知らせ）に任せる
  const clear = () => { onClear?.(); onClose(); };
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
            // 単位ごとに別の下書き（ページの 120 が％の 100 として保存されない・戻すと元の数が出る）
            <button key={o.v} type="button" role="radio" aria-checked={unit === o.v} onClick={() => setUnit(o.v)} style={segOption(unit === o.v)}>
              {o.l}
            </button>
          ))}
        </div>
        {/* ページ｜％ を替えてもシートの高さを変えない（2026-11-27 点検: 替えるたびにシートの上端が 80 ほど上下していた）。
            ％のときは欄を全幅に（右半分を見えない欄で空けると、欄が 1 つ読み込めていないように見えた・ui-critic）。
            「本の情報から」の 1 行は、本の情報に総ページがあるときだけ、どちらの単位でも同じ高さを取る。 */}
        <div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>{unit === 'page' ? 'いまのページ' : '読んだところ（％）'}</span>
              {unit === 'page' ? (
                <input key="page" type="text" inputMode="numeric" autoFocus value={current} onChange={(e) => setCurrent(digits(e.target.value))} onKeyDown={onKey} maxLength={5} placeholder="例：120" style={numInput} />
              ) : (
                <input key="percent" type="text" inputMode="numeric" autoFocus value={current} onChange={(e) => setCurrent(digits(e.target.value).slice(0, 3))} onKeyDown={onKey} maxLength={3} placeholder="例：45" style={numInput} />
              )}
            </label>
            {unit === 'page' && (
              <label style={{ flex: 1, minWidth: 0 }}>
                <span style={label}>総ページ</span>
                <input type="text" inputMode="numeric" value={total} onChange={(e) => setTotal(digits(e.target.value))} onKeyDown={onKey} maxLength={5} placeholder="例：320" style={numInput} />
              </label>
            )}
          </div>
          {/* 欄の下の 1 行（どちらの単位でも同じ高さ＝替えてもシートが跳ねない）。ページは「本の情報から」（総ページの下）・
              ％ は短い案内（空の帯に見えていた・2026-11-27 ui-critic）。範囲の外の知らせもここに入れて高さを変えない。 */}
          {(() => {
            const msg = unit === 'page'
              ? (current !== '' && !canSave ? '1 から 20000 までのページを入れてください。' : over ? `総ページより先なので、${v.total} ページとして保存します。` : '')
              : (overPct ? '100％ として保存します。' : '');
            const text = msg || (unit === 'page' ? (fromInfo ? '本の情報から' : '') : '電子書籍の画面に出る ％ を入れます');
            const right = !msg && unit === 'page';
            return (
              <p role={msg ? 'status' : undefined} style={{ ...label, margin: 'var(--space-1) 0 0', minHeight: 'calc(var(--text-meta) * 1.5)', lineHeight: 1.5, color: msg ? 'var(--text-2)' : 'var(--text-3)', paddingLeft: right ? 'calc(50% + var(--space-3) / 2)' : 0 }}>
                {text}
              </p>
            );
          })()}
        </div>
        {over && (
          // 総ページが版違いのこともあるので、総ページを直す道も（2026-11-26 点検）
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 'var(--space-3)', marginTop: 'calc(-1 * var(--space-3))' }}>
            <button type="button" onClick={() => setTotal(String(Number(current)))} style={{ ...btnLinkQuiet, marginLeft: 'calc(-1 * var(--space-1))' }}>{`総ページを ${Number(current)} にする`}</button>
          </div>
        )}
        {book?.currentPage != null && (
          <button type="button" onClick={clear} style={{ ...btnLinkQuiet, alignSelf: 'flex-start', marginLeft: 'calc(-1 * var(--space-1))' }}>記録を消す</button>
        )}
      </div>
    </BottomSheet>
  );
}
