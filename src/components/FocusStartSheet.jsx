// ⏱ 集中モードを始める前のシート（2026-10-09・SPEC §2-2）。
//
// 「タイマー」（15・30・45・60 分）と「計測」（0 から数える・終わりは自分で）の 2 択。
// 前回の選び方と時間を端末に覚えておき（lib/readingTime.js の loadFocusPrefs）、2 回目からは
// 主ボタン「読みはじめる」を押すだけで始まる。下の 1 行は、おわり方（長押し）だけを言う
// （集中モードの画面には説明を置かないので、ここで 1 度だけ）。
import { useState } from 'react';
import BottomSheet from './BottomSheet';
import { btnPrimary, groupTitle } from '../styles/ui';
import { FOCUS_MINUTES, loadFocusPrefs, saveFocusPrefs } from '../lib/readingTime';
import { withPhraseBreaks } from './TightBubble';

// 選ぶボタン（DESIGN §5「選ぶためのチップ」: 44・15・選択中は --accent-soft の面＋--accent の文字 600）。
const choice = (on) => ({
  flex: '1 1 0',
  minWidth: 0,
  minHeight: 'var(--tap-min)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-2) var(--space-2)',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: on ? 'var(--accent-soft)' : 'var(--fill)',
  color: on ? 'var(--accent)' : 'var(--text)',
  fontSize: 'var(--text-sub)',
  fontWeight: on ? 600 : 400,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
});

// 切り替え（タイマー｜計測）は、下の分のチップと見分けがつくよう面を付けない: 等分の 2 列・17・
// 選んでいる方は --text 600 と下に 2 の --accent の線、もう一方は --text-2（全体の下に --separator の線）。
const seg = (on) => ({
  flex: '1 1 0',
  minWidth: 0,
  minHeight: 'var(--btn-h)',
  border: 'none',
  borderBottom: `var(--focus-tab-line) solid ${on ? 'var(--accent)' : 'transparent'}`,
  // 選んだ方の下線を、全体の下の 1 の線に重ねる（線の太さぶん下へ）。
  marginBottom: 'calc(-1 * var(--focus-tab-line) / 2)',
  background: 'transparent',
  color: on ? 'var(--text)' : 'var(--text-2)',
  fontSize: 'var(--text-body)',
  fontWeight: on ? 600 : 400,
  fontFamily: 'inherit',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});

export default function FocusStartSheet({ onStart, onClose }) {
  const [prefs] = useState(loadFocusPrefs);
  const [mode, setMode] = useState(prefs.mode);
  const [minutes, setMinutes] = useState(prefs.minutes);
  const start = () => {
    saveFocusPrefs({ mode, minutes });
    onStart({ mode, minutes });
  };
  return (
    <BottomSheet
      title="読む"
      onClose={onClose}
      dismissLabel="キャンセル"
      footer={<button type="button" onClick={start} style={btnPrimary} data-focus-start="">読みはじめる</button>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div role="radiogroup" aria-label="時間の測り方" style={{ display: 'flex', borderBottom: '1px solid var(--separator)' }}>
          {[['timer', 'タイマー'], ['count', '計測']].map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} style={seg(mode === v)}>
              {label}
            </button>
          ))}
        </div>
        {/* 分を選ぶのはタイマーだけ。計測でも場所は空けておく（切り替えたときに上の切り替え・下の 1 行が跳ねない・
            見えない・読み上げない・Tab で止まらない＝説明の文は足さない・2026-10-09 ui-critic）。 */}
        <div style={mode === 'timer' ? undefined : { visibility: 'hidden' }} aria-hidden={mode === 'timer' ? undefined : true}>
          <p id="focus-min-title" style={{ ...groupTitle, margin: '0 0 var(--space-2)' }}>時間</p>
          <div role="radiogroup" aria-labelledby="focus-min-title" style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {FOCUS_MINUTES.map((m) => (
              <button key={m} type="button" role="radio" tabIndex={mode === 'timer' ? undefined : -1} aria-checked={minutes === m} aria-label={`${m} 分`} onClick={() => setMinutes(m)} style={choice(minutes === m)}>
                {m} 分
              </button>
            ))}
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {withPhraseBreaks('おわるときは「おわる」を長く押します。')}
        </p>
      </div>
    </BottomSheet>
  );
}
