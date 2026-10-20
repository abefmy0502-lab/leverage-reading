// 🪙➕ プランの人（有料・7 日間無料）がトークンを使い切ったときの案内カード（相談と AI 選書で共通・2026-10-04）。
// 組み立て: 題（17/600）→ 戻る日・使える日（15/--text-2）→ カードの中に「トークンを追加」（7 日間無料は枠線・有料は塗り）
//   → 7 日間無料は「続けないときは M月D日までに解約」の小さな 1 行 → 脇役（children：メモを検索して探す など）。
// 日付と「800 トークン」は 1 かたまり（途中で改行しない）。
import { btnPrimary, btnGhost, btnLinkQuiet } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';
import { nextResetLabelJa } from '../lib/freeTrial';
import { PAID_TOKENS } from '../lib/tokens';
import { fmtTokens } from '../lib/consultHelpers';

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--separator)', borderRadius: 'var(--radius)', padding: 'var(--space-4)' };
const titleStyle = { margin: 0, fontSize: 'var(--text-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const subStyle = { margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sub)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
// 文節の切れ目（<wbr>）でだけ折り返す（「無料プランに／戻ります」と割らない）。
export const trialCancelLineStyle = { margin: 'var(--space-2) 0 0', fontSize: 'var(--text-meta)', color: 'var(--text-2)', lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere' };
const nowrap = { whiteSpace: 'nowrap' };

// onUsage: 文字ボタン「トークンの使い方を見る」（使い切ると相談の上の行の残りの数が消えるので、入口をここにも・2026-10-11）。
// memoNote: 相談で使うとき「それまでは、あなたのメモから探して答えます。」を添える（使い切っても相談は送れる・2026-10-20）。
export default function TokensOutCard({ plan, trialEndLabel = '', cancelLine = '', tokenAllowance = null, memoNote = false, onAdd, onUsage = null, children = null, style = null }) {
  const trial = plan === 'trial';
  // 量が分からない（読み込み前・取れなかった）ときは有料の毎月の量（「0 トークンに戻ります」と出さない）。
  const allowance = Number(tokenAllowance) > 0 ? tokenAllowance : PAID_TOKENS;
  return (
    <section aria-label="トークンは、ここまで" role="status" style={style ? { ...cardStyle, ...style } : cardStyle}>
      <p style={titleStyle}>
        {withPhraseBreaks(trial ? '無料期間のトークンは、ここまでです' : '今月のトークンは、ここまでです')}
      </p>
      {!trial ? (
        <p style={subStyle}>
          {/* 「800 トークンに戻ります」は 1 つの塊（「に戻ります」だけが次の行に落ちない・2026-10-11 リリース前の採点）。 */}
          <span style={nowrap}>{nextResetLabelJa()}</span>に <span style={nowrap}>{fmtTokens(allowance)} トークンに戻ります{memoNote ? '。' : ''}</span>
        </p>
      ) : trialEndLabel ? (
        <p style={subStyle}>
          無料期間が終わる<span style={nowrap}>{trialEndLabel}</span>から、<span style={nowrap}>毎月 {fmtTokens(PAID_TOKENS)} トークン使えます。</span>
        </p>
      ) : null}
      {memoNote && <p style={subStyle}>{withPhraseBreaks('それまでは、あなたのメモから探して答えます。')}</p>}
      {onAdd && (
        <button type="button" onClick={onAdd} style={{ ...(trial ? btnGhost : btnPrimary), marginTop: 'var(--space-3)' }}>
          トークンを追加
        </button>
      )}
      {onAdd && cancelLine && <p style={trialCancelLineStyle}>{withPhraseBreaks(cancelLine)}</p>}
      {onUsage && (
        <button type="button" onClick={onUsage} style={{ ...btnLinkQuiet, width: '100%', marginTop: 'var(--space-2)' }}>
          トークンの使い方を見る
        </button>
      )}
      {children}
    </section>
  );
}
