// 🎯 TodayAction — ホームの「次の一歩」。全本横断の未完了アクションから
// 1 件だけを、想起カード (DailyResurface) の隣に静かに置く。
//
// 「開く=過去の気づきが甦る」の次に「次の一歩を、その場でひとつ片づける」を
// 並べることで、読書 → 行動 の循環が毎日のホームで回る。チェックを押すと
// その場で完了 (楽観的 UI + Undo は親側 applyActionToggle が担当)。

const card = {
  background: 'linear-gradient(180deg, #fbf8f1 0%, #f6f1e6 100%)',
  border: '1px solid #ece3d2',
  borderRadius: 16,
  padding: '16px 18px',
  marginBottom: 14,
  boxShadow: '0 1px 2px rgba(60,50,40,0.04)',
  animation: 'lvg-home-card 450ms var(--ease-out, ease) both',
  animationDelay: '80ms',
};

const eyebrow = {
  fontSize: 11,
  color: '#a8966f',
  letterSpacing: '0.06em',
  fontWeight: 600,
  margin: '0 0 10px',
  display: 'block',
};

const row = { display: 'flex', alignItems: 'flex-start', gap: 12 };

const checkBtn = {
  width: 28,
  height: 28,
  flexShrink: 0,
  borderRadius: 999,
  border: '2px solid #c9bda2',
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
  marginTop: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#8a7040',
  fontFamily: 'inherit',
};

const bodyBtn = {
  flex: 1,
  minWidth: 0,
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const actionText = {
  fontSize: 15,
  lineHeight: 1.6,
  color: '#3d362c',
  margin: 0,
  fontWeight: 500,
};

const metaRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '8px 0 0',
  fontSize: 12,
  color: '#8a7e6b',
};

function deadlineLabel(deadline) {
  if (!deadline) return null;
  const d = new Date(deadline + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}日遅れ`, color: '#c0392b', bg: '#fdecea' };
  if (diff === 0) return { text: '今日まで', color: '#b9770e', bg: '#fdf3e2' };
  if (diff === 1) return { text: '明日まで', color: '#b9770e', bg: '#fdf3e2' };
  if (diff <= 7) return { text: `あと${diff}日`, color: '#7a6f59', bg: '#f0ebe0' };
  return { text: `${d.getMonth() + 1}/${d.getDate()}`, color: '#8a7e6b', bg: '#f0ebe0' };
}

export default function TodayAction({ action, onComplete, onOpen }) {
  if (!action) return null;
  const dl = deadlineLabel(action.deadline);

  return (
    <section style={card} aria-label="次の一歩">
      <span style={eyebrow}>🎯 次の一歩</span>
      <div style={row}>
        <button
          type="button"
          style={checkBtn}
          onClick={(e) => { e.stopPropagation(); onComplete?.(); }}
          aria-label="完了にする"
          title="完了にする"
        />
        <button type="button" style={bodyBtn} onClick={onOpen} aria-label="この行動の本を開く">
          <p style={actionText}>{(action.text || '').trim()}</p>
          <div style={metaRow}>
            {dl && (
              <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, color: dl.color, background: dl.bg, fontWeight: 600 }}>
                {dl.text}
              </span>
            )}
            {action.bookTitle && (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                『{action.bookTitle}』より
              </span>
            )}
          </div>
        </button>
      </div>
    </section>
  );
}
