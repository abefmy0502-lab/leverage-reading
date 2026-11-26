import { withPhraseBreaks } from './TightBubble';
import { nextResetLabelJa } from '../lib/freeTrial';
import { card } from '../styles/ui';

// 🧯 無料の AI の全体の予算が今月は尽きたときの案内（相談・AI 選書で共通・2026-11-26）。
//   本人のトークンは残っているので、プランはすすめない（すすめてよい ① ではない）。
//   note: 戻る日のあとに続ける 1 文（相談は「それまでは、あなたのメモから探して答えます。」）。
//   children: AI を使わずにできる次の一歩（文字のボタン）。
export default function PoolOutCard({ note = '', children = null, style = null }) {
  return (
    <section aria-label="今月の無料の AI は、ここまで" style={{ ...card, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', ...style }}>
      <p style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks('今月の無料の AI は、ここまでです')}
      </p>
      <p style={{ margin: 0, fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks('使う方がとても多く、全体の上限に達しました。')}<span style={{ whiteSpace: 'nowrap' }}>{nextResetLabelJa()}</span>{withPhraseBreaks(`に戻ります。${note}`)}
      </p>
      {children && (
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-4)', marginTop: 'var(--space-2)', marginLeft: 'calc(-1 * var(--space-1))' }}>
          {children}
        </div>
      )}
    </section>
  );
}
