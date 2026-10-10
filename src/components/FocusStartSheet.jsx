// ⏱ 集中モードを始める前のシート（2026-10-09・SPEC §2-2）。
//
// 「タイマー」（15・30・45・60 分）と「計測」（0 から数える・終わりは自分で）の 2 択。
// 前回の選び方と時間を端末に覚えておき（lib/readingTime.js の loadFocusPrefs）、2 回目からは
// 主ボタン「読みはじめる」を押すだけで始まる。下の 1 行は、おわり方（長押し）だけを言う
// （集中モードの画面には説明を置かないので、ここで 1 度だけ）。
//
// 2026-10-10 オーナー「電車で乗り換えの駅まで集中して読みたい」: 分のチップの下の全幅のチップ「時刻まで」。
// 選ぶと下に「おわる時刻」（TimeInput＝いつも「18:45」の書き方・既定は いま＋20 分を 5 分に切り上げ）と「21 分 読めます」。
// いまより前・6 時間を超える時刻は、その下に理由を出して「読みはじめる」を押せなくする。
// 前回「時刻」を選んでいたら、次も「時刻」を選んだ形で開く（時刻は いま＋20 分 に出し直す）。
import { useEffect, useState } from 'react';
import BottomSheet from './BottomSheet';
import { btnPrimary, btnPrimaryOff, groupTitle, input } from '../styles/ui';
import { FOCUS_MINUTES, loadFocusPrefs, saveFocusPrefs, defaultUntilTime, checkUntil } from '../lib/readingTime';
import TimeInput from './TimeInput';
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

// initialUntil: 初めから「時刻」を選んで開く（お試しモードの &focus=until）。
// 「21 分」「1 時間 5 分」「2 時間」。
function fmtLen(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} 分`;
  return m ? `${h} 時間 ${m} 分` : `${h} 時間`;
}

export default function FocusStartSheet({ onStart, onClose, initialUntil = false }) {
  const [prefs] = useState(loadFocusPrefs);
  const [mode, setMode] = useState(initialUntil ? 'timer' : prefs.mode);
  const [minutes, setMinutes] = useState(prefs.minutes);
  const [useUntil, setUseUntil] = useState(initialUntil || prefs.until);
  const [untilText, setUntilText] = useState(() => defaultUntilTime());
  // 残りの分は時間とともに変わるので、開いている間は 15 秒ごとに出し直す。
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (mode !== 'timer' || !useUntil) return undefined;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [mode, useUntil]);
  const isUntil = mode === 'timer' && useUntil;
  const check = isUntil ? checkUntil(untilText, now) : null;
  const blocked = isUntil && !check.ok;
  const start = () => {
    if (isUntil) {
      const c = checkUntil(untilText, Date.now());
      if (!c.ok) { setNow(Date.now()); return; }
      saveFocusPrefs({ mode, minutes, until: true });
      onStart({ mode, minutes, untilMs: c.untilMs });
      return;
    }
    // 計測のときは「時刻」を覚えない（次は前回の測り方＝計測で開く）。
    saveFocusPrefs({ mode, minutes, until: false });
    onStart({ mode, minutes });
  };
  const pickMinutes = (m) => { setMinutes(m); setUseUntil(false); };
  const pickUntil = () => {
    // 選び直したときに古い時刻が残っていたら（いまより前になっていたら）いま＋20 分に出し直す。
    if (!checkUntil(untilText, Date.now()).ok) setUntilText(defaultUntilTime());
    setNow(Date.now());
    setUseUntil(true);
  };
  return (
    <BottomSheet
      title="読む"
      onClose={onClose}
      dismissLabel="キャンセル"
      footer={<button type="button" onClick={start} disabled={blocked} aria-disabled={blocked || undefined} style={blocked ? btnPrimaryOff : btnPrimary} data-focus-start="">読みはじめる</button>}
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
          <div role="radiogroup" aria-labelledby="focus-min-title" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {FOCUS_MINUTES.map((m) => (
                <button key={m} type="button" role="radio" tabIndex={mode === 'timer' ? undefined : -1} aria-checked={!useUntil && minutes === m} aria-label={`${m} 分`} onClick={() => pickMinutes(m)} style={choice(!useUntil && minutes === m)}>
                  {m} 分
                </button>
              ))}
            </div>
            {/* 「時刻まで」は分のチップの下の 1 行を全幅で（5 つ並べると文字を大きくしたときに詰まる・2026-10-10 ui-critic）。 */}
            <button type="button" role="radio" tabIndex={mode === 'timer' ? undefined : -1} aria-checked={useUntil} aria-label="時刻まで" onClick={pickUntil} style={{ ...choice(useUntil), flex: 'none', width: '100%' }} data-focus-until="">
              時刻まで
            </button>
          </div>
        </div>
        {/* おわる時刻の欄はタイマーで「時刻まで」を選んだときだけ（計測では場所を取らない）。 */}
        {isUntil && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label htmlFor="focus-until-time" style={{ ...groupTitle, margin: 0 }}>おわる時刻</label>
            <TimeInput
              id="focus-until-time"
              value={untilText}
              onChange={(e) => { setUntilText(e.target.value); setNow(Date.now()); }}
              aria-describedby="focus-until-note"
              aria-invalid={check && !check.ok ? true : undefined}
              style={{ ...input, ...(check && !check.ok ? { borderColor: 'var(--error)' } : null) }}
            />
            <p id="focus-until-note" role={check && !check.ok ? 'alert' : undefined} style={{ margin: 0, fontSize: 'var(--text-meta)', lineHeight: 1.5, color: check && !check.ok ? 'var(--error)' : 'var(--text-2)', fontVariantNumeric: 'tabular-nums', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
              {check.ok ? `${fmtLen(check.minutes)} 読めます` : withPhraseBreaks(check.message)}
            </p>
          </div>
        )}
        <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
          {withPhraseBreaks('おわるときは「おわる」を長く押します。')}
        </p>
      </div>
    </BottomSheet>
  );
}
