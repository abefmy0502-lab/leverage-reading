// 🫶 命に関わる言葉が書かれたときの、相談窓口の案内（15/--text の 1 文＋高さ 44 の外部リンク・2026-10-08 ui-critic）。
//   AI 選書（BookAdvisor）と相談（MyBookBrain・2026-11-21 App 審査 1.4.1）で同じものを使う。言葉の判定は lib/advisorInterview.js の needsCareLine。
import { ExternalLink as IcExternal } from 'lucide-react';
import { btnLink as uiBtnLink } from '../styles/ui';
import { withPhraseBreaks } from './TightBubble';
import { CARE_LINE, CARE_LINK } from '../lib/advisorInterview';

export default function CareNote({ style = null }) {
  return (
    <div role="note" style={{ marginTop: 'var(--space-3)', ...style }}>
      <p style={{ fontSize: 'var(--text-sub)', color: 'var(--text)', lineHeight: 1.6, margin: 0, wordBreak: 'keep-all', overflowWrap: 'anywhere' }}>
        {withPhraseBreaks(CARE_LINE)}
      </p>
      <a
        href={CARE_LINK.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${CARE_LINK.label}を開く（外部リンク）`}
        style={{ ...uiBtnLink, gap: 0, flexWrap: 'wrap', justifyContent: 'flex-start', textAlign: 'left', textDecoration: 'none', marginLeft: 'calc(-1 * var(--space-1))' }}
      >
        {CARE_LINK.name}<span style={{ whiteSpace: 'nowrap' }}>{CARE_LINK.org}<IcExternal size="1em" aria-hidden="true" style={{ marginLeft: 'var(--space-1)', verticalAlign: '-0.125em' }} /></span>
      </a>
    </div>
  );
}
