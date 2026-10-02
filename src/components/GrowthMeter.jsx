// 🌱 「あと N 件で相談相手が育ちます」（2026-10-02・lib/firstDay.js の growthMeterText）。
//
// メモが 1〜9 件の間だけ、ホームと相談の上に出す静かな一行（10 件で消える＝7 日間無料の案内と重ならない）。
// 答えはメモが増えるほど深くなる、という見込みを先に伝える。点数・バッジ・連続日数・棒グラフにはしない（事実の数だけ）。
// 見た目は相談の答えの下の「あなたのメモ N 件から答えました」と同じ（芽のアイコン 16・--text-3 ＋ 13/--text-2）。
import { Sprout } from 'lucide-react';
import { growthMeterText } from '../lib/firstDay';

export default function GrowthMeter({ memoCount, style }) {
  const text = growthMeterText(memoCount);
  if (!text) return null;
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
        <Sprout size={16} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
      </span>
      <span style={{ minWidth: 0 }}>{text}</span>
    </p>
  );
}
