// 🎯 「Orime を入れた理由」の入力（初回ガイドの 2 枚目と、設定の書き直しのシートで共通・2026-10-18）。
//
// 書き出しのチップ（「仕事で、」など・lib/appPurpose.js の APP_PURPOSE_STARTERS）→ 自分の言葉の欄（2 行・80 字まで）。
// 「具体的であればあるほど良い」（オーナー）ので、チップは答えではなく書き出し: 押すと欄に入り、カーソルを末尾に置く
// （続きを書く）。欄に自分の言葉があるときは書き換えず、下の例だけをその書き出しのものに替える。
// 欄の下（4）に 13/--text-2 の 3 行ぶんの欄＝まだ足りない間は「どう書けば次へ進めるか」＋例。足りたら隠す（高さは残す＝
// 書いた途端にシートが縮んで、押したチップが指の下から逃げないように）。
import { useState } from 'react';
import { Chip } from './formPrimitives';
import { withPhraseBreaks } from './TightBubble';
import { input as uiInput } from '../styles/ui';
import { APP_PURPOSE_STARTERS, APP_PURPOSE_MAX, cleanPurposeText, purposeStarterOf, isPurposeSpecific } from '../lib/appPurpose';

// チップを押したときの欄の文。空か書き出しだけなら置きかえ、続きが書いてあれば変えない。
export function applyPurposeStarter(value, starter) {
  const cur = cleanPurposeText(value);
  if (!cur || APP_PURPOSE_STARTERS.some((s) => s.text === cur || s.text.replace(/、$/, '') === cur)) return starter;
  return value;
}

// 欄の下の案内（まだ足りない間だけ）: { lead: どう書けば進めるか（1 行）, example: 例（2 行まで）}。
export function purposeGuide(value, picked = null) {
  const cur = cleanPurposeText(value);
  const st = picked || purposeStarterOf(cur) || APP_PURPOSE_STARTERS[0];
  return { lead: cur ? '何を・いつまでに、まで書くと進めます' : '書き出しを選んで、続きを書きます', example: `例：${st.example}` };
}

const fieldStyle = { ...uiInput, minHeight: 'calc(2 * 1.6em + 2 * var(--space-3) + 2px)', lineHeight: 1.6, resize: 'none', display: 'block' };

export default function AppPurposeField({ value, onChange, id = 'app-purpose-input' }) {
  const [picked, setPicked] = useState(null);
  const ready = isPurposeSpecific(value);
  const current = purposeStarterOf(value);
  const guide = purposeGuide(value, picked);
  const pick = (s) => {
    setPicked(s);
    const next = applyPurposeStarter(value, s.text);
    onChange(next);
    // 続きをすぐ書けるように、欄の末尾にカーソル
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      try { el.focus({ preventScroll: true }); el.setSelectionRange(next.length, next.length); } catch { /* ignore */ }
    });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div role="group" aria-label="書き出し" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', rowGap: 'var(--space-2)' }}>
        {APP_PURPOSE_STARTERS.map((s) => {
          const on = (picked || current)?.text === s.text;
          return (
            <Chip key={s.text} size="select" aria-pressed={on} active={on} onClick={() => pick(s)}>
              {s.text}
            </Chip>
          );
        })}
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault(); }}
        rows={2}
        maxLength={APP_PURPOSE_MAX}
        placeholder="自分の言葉で書く"
        aria-label="Orime を入れた理由"
        aria-describedby={ready ? undefined : `${id}-hint`}
        style={fieldStyle}
      />
      <p
        id={`${id}-hint`}
        aria-hidden={ready || undefined}
        // 高さは 3 行ぶん（案内 1 行＋例 2 行まで）をいつも取る。例は文節の切れ目でだけ折り返す。
        style={{ margin: 'calc(var(--space-1) - var(--space-3)) 0 0', minHeight: 'calc(3 * 1.5em)', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, visibility: ready ? 'hidden' : 'visible', wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
      >
        {guide.lead}<br />{withPhraseBreaks(guide.example)}
      </p>
    </div>
  );
}
