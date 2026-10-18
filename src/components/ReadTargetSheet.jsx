// ⏳ 読む時間の目安を決めるシート（2026-10-18 オーナー）。
//
// 本の詳細の「読む」の右の「目安を決める」／「目安 5 時間」から開く。選ぶと保存して閉じる。
// 目安は数として並べて見せるだけ（%・残り・達成・警告は出さない＝lib/readTarget.js）。
// 見た目は BottomSheet（題「読む時間の目安」・上の小さな行に『書名』）＋選ぶためのチップ（44）。
import BottomSheet from './BottomSheet';
import { Chip } from './formPrimitives';
import { READ_TARGET_CHOICES, fmtTarget, cleanTarget } from '../lib/readTarget';
import { useReadingSessions } from '../hooks/useReadingSessions';
import { totalSeconds, MIN_SESSION_SEC } from '../lib/readingTime';
import { fmtReadingTotal } from '../lib/readingStats';

export default function ReadTargetSheet({ book, onSelect, onClose }) {
  const { rows } = useReadingSessions();
  const sec = totalSeconds(rows, book?.id);
  const current = cleanTarget(book?.readTargetMin);
  const pick = (m) => { onSelect(m); onClose(); };
  return (
    <BottomSheet title="読む時間の目安" eyebrow={book?.title ? `『${book.title}』` : ''} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* 説明の文は置かない（DESIGN §0-6）。これまでの読書の時間だけをデータの行で */}
        {sec >= MIN_SESSION_SEC && (
          <p style={{ margin: 0, fontSize: 'var(--text-meta)', color: 'var(--text-3)' }}>これまで {fmtReadingTotal(sec)}</p>
        )}
        <div role="radiogroup" aria-label="読む時間の目安" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 'var(--space-2)', rowGap: 'var(--space-2)' }}>
          {READ_TARGET_CHOICES.map((m) => (
            <Chip key={m} size="select" role="radio" aria-checked={current === m} active={current === m} onClick={() => pick(m)}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTarget(m)}</span>
            </Chip>
          ))}
          {/* 「決めない」は時間の並びに混ぜず、次の行の頭に */}
          <span aria-hidden="true" style={{ flexBasis: '100%', height: 0 }} />
          <Chip size="select" role="radio" aria-checked={!current} active={!current} onClick={() => pick(0)}>
            決めない
          </Chip>
        </div>
      </div>
    </BottomSheet>
  );
}
