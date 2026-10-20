// 🌱 「あと N 件で相談相手が育ちます」（2026-10-02・lib/firstDay.js の growthMeterText）。
//
// メモが 1〜9 件の間だけ、ホームと相談の上に出す静かな一行（10 件で消える＝7 日間無料の案内と重ならない）。
// 答えはメモが増えるほど深くなる、という見込みを先に伝える。点数・バッジ・連続日数・棒グラフにはしない（事実の数だけ）。
// 見た目は相談の答えの下の「あなたのメモ N 件から答えました」と同じ（芽のアイコン 16・--text-3 ＋ 13/--text-2）。
import { Sprout } from 'lucide-react';
import { growthMeterText } from '../lib/firstDay';
import { withPhraseBreaks } from './TightBubble';
import { btnLink } from '../styles/ui';

// action: { label, onClick }（2026-10-20 オーナー「入れたばかり・1 週間の人の満足度を最大化」）— ホームでだけ、
//   一行の右に次の一歩の文字ボタンを 1 つ（はじめての相談の前は「相談してみる」・そのあとはメモの無い本へ「一言ずつ残す」）。
//   見た目は「相談相手が育ちました」（GrownLine）と同じ: 1 行に収まれば右、折り返したら文の頭にそろえる。
export default function GrowthMeter({ memoCount, style, action = null }) {
  const text = growthMeterText(memoCount);
  if (!text) return null;
  if (action) {
    return (
      <div data-growth-meter="" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 'var(--space-2)', ...style }}>
        <GrowthMeter memoCount={memoCount} style={{ flex: '1 1 10em', minWidth: 0 }} />
        <span style={{ display: 'flex', alignItems: 'center', paddingLeft: 'calc(var(--text-meta) * 1.2)' }}>
          <button type="button" onClick={action.onClick} style={{ ...btnLink, fontSize: 'min(var(--text-sub), var(--text-bar-max))', whiteSpace: 'nowrap', marginRight: 'calc(-1 * var(--space-1))' }}>{action.label}</button>
        </span>
      </div>
    );
  }
  return (
    <p
      data-growth-meter=""
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)', margin: 0,
        fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {/* 2 行に折り返しても、アイコンは 1 行目の高さの中央に置く。 */}
      <span style={{ display: 'inline-flex', alignItems: 'center', height: '1.5em', flexShrink: 0 }}>
        <Sprout size="1.2em" aria-hidden="true" style={{ color: 'var(--text-3)' }} />
      </span>
      {/* 文節の切れ目でだけ折り返す（BudouX の <wbr>＋keep-all・iOS の Safari は auto-phrase を知らない）。 */}
      <span style={{ minWidth: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>{withPhraseBreaks(text)}</span>
    </p>
  );
}
