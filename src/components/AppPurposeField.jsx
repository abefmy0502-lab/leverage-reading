// 🎯 「Orime を入れた理由」の入力（初回ガイドの 2 枚目と、設定の書き直しのシートで共通・2026-10-18）。
//
// よくある理由のチップ（押すと欄に入る＝そのまま・直して・書き足して使える）→ 自分の言葉の欄（2 行・80 字まで）。
// チップは選ぶためのチップ（44・lib/appPurpose.js の APP_PURPOSE_CHOICES）。欄と同じ文のチップだけ選択中に。
// 欄が空かチップの文のままなら置きかえ、自分の言葉が入っていれば消さずに後ろへ足す（AI 選書の答えのチップと同じ）。
// hint: 欄の下 4 の 13/--text-2 の 1 行（初回ガイドで、空の間「次へ」を押せない理由）。
import { Chip } from './formPrimitives';
import { input as uiInput } from '../styles/ui';
import { APP_PURPOSE_CHOICES, APP_PURPOSE_MAX, cleanPurposeText } from '../lib/appPurpose';

export function applyPurposeChoice(value, choice) {
  const cur = cleanPurposeText(value);
  if (!cur || APP_PURPOSE_CHOICES.includes(cur)) return choice;
  return cleanPurposeText(`${cur} ${choice}`);
}

const fieldStyle = { ...uiInput, minHeight: 'calc(2 * 1.6em + 2 * var(--space-3) + 2px)', lineHeight: 1.6, resize: 'none', display: 'block' };

export default function AppPurposeField({ value, onChange, inputRef = null, id = 'app-purpose-input', hint = '' }) {
  const current = cleanPurposeText(value);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div role="group" aria-label="よくある理由" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', rowGap: 'var(--space-2)' }}>
        {APP_PURPOSE_CHOICES.map((c) => (
          <Chip key={c} size="select" aria-pressed={current === c} active={current === c} onClick={() => onChange(applyPurposeChoice(value, c))}>
            {c}
          </Chip>
        ))}
      </div>
      <textarea
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault(); }}
        rows={2}
        maxLength={APP_PURPOSE_MAX}
        placeholder="自分の言葉で書く"
        aria-label="Orime を入れた理由"
        aria-describedby={hint ? `${id}-hint` : undefined}
        style={fieldStyle}
      />
      {hint && <p id={`${id}-hint`} style={{ margin: 'calc(var(--space-1) - var(--space-3)) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
