// 🪙 読書計画シートを作ろうとしてトークンを使い切っていたときの案内（2026-10-11）。
//   相談・AI 選書と同じカード（TokensOutCard）＝題 → 戻る日 → 「トークンを追加」（買えるプランの人だけ）
//   → 7 日間無料は解約の期限 → 文字ボタン「トークンの使い方を見る」（TokenUsageSheet）。
//   無料プランは読書計画シートを押した時点で有料プランの画面が開くので、ここには来ない（決まりどおり）。
import { useState } from 'react';
import TokensOutCard from './TokensOutCard';
import TokenUsageSheet from './TokenUsageSheet';
import { usePaywall } from '../state/PaywallContext';
import { monthDayLabelJa } from '../lib/tokens';
import { trialCancelShortLine } from '../lib/trialNudge';
import { requestPaywall } from '../lib/freeTrial';

export default function PlanTokensOut({ style = null }) {
  const { plan, canBuyTokens, openTokenSheet, trialEndsAt, tokenAllowance } = usePaywall();
  const [usageOpen, setUsageOpen] = useState(false);
  return (
    <>
      <TokensOutCard
        plan={plan}
        trialEndLabel={plan === 'trial' ? monthDayLabelJa(trialEndsAt) : ''}
        cancelLine={plan === 'trial' ? trialCancelShortLine(trialEndsAt) : ''}
        tokenAllowance={tokenAllowance}
        onAdd={canBuyTokens ? openTokenSheet : null}
        onUsage={() => setUsageOpen(true)}
        style={style}
      />
      {usageOpen && (
        <TokenUsageSheet
          from="plan"
          onClose={() => setUsageOpen(false)}
          onAdd={() => { setUsageOpen(false); openTokenSheet(); }}
          onPlans={(reason) => { setUsageOpen(false); requestPaywall(reason); }}
        />
      )}
    </>
  );
}
