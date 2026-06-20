// 💭 DailyResurface — ホーム最上部に出す「ふと、思い出したい一節」のヒーローカード。
//
// ユーザー自身の過去メモを、開いた瞬間に静かに差し出す。読書アプリの核心
// (読みっぱなしにしない・気づきが甦る) を、ナビの奥ではなく主役に置くための面。
// 文学的に感じられるよう本文は明朝、ゆったりした行間にする。

const card = {
  background: 'linear-gradient(180deg, #fffdf8 0%, #faf6ef 100%)',
  border: '1px solid #ece3d2',
  borderRadius: 16,
  padding: '16px 18px 14px',
  marginBottom: 14,
  boxShadow: '0 1px 2px rgba(60,50,40,0.04)',
  animation: 'lvg-home-card 450ms var(--ease-out, ease) both',
};

const eyebrowRow = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
};

const eyebrow = {
  fontSize: 11,
  color: '#a8966f',
  letterSpacing: '0.06em',
  fontWeight: 600,
};

const rerollBtn = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: 'none',
  background: 'transparent',
  color: '#b0a489',
  fontSize: 15,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  flexShrink: 0,
};

const bodyBase = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: 'inherit',
};

const memoText = {
  fontFamily: "'Noto Serif JP', Georgia, serif",
  fontSize: 16,
  lineHeight: 1.9,
  color: '#3d362c',
  margin: 0,
  whiteSpace: 'pre-wrap',
  display: '-webkit-box',
  WebkitLineClamp: 6,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const sourceLine = {
  fontSize: 12,
  color: '#8a7e6b',
  margin: '10px 0 0',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

export default function DailyResurface({ memo, book, onReroll, onOpen }) {
  if (!memo) return null;
  const isPersonal = !book && (memo.source_type === 'personal' || !memo.book_id);
  const tappable = !!book;

  const inner = (
    <>
      <p style={memoText}>{(memo.text || '').trim()}</p>
      <p style={sourceLine}>
        {isPersonal ? (
          <span>🧠 学びの記録より</span>
        ) : book ? (
          <>
            <span aria-hidden="true">📖</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              『{book.title}』
            </span>
            {memo.page_number ? <span style={{ color: '#b0a489' }}>p.{memo.page_number}</span> : null}
          </>
        ) : (
          <span>📖 あなたのメモより</span>
        )}
        {tappable && <span style={{ marginLeft: 'auto', color: '#b0a489' }}>›</span>}
      </p>
    </>
  );

  return (
    <section style={card} aria-label="ふと思い出したい一節">
      <div style={eyebrowRow}>
        <span style={eyebrow}>💭 ふと、思い出したい</span>
        <button
          type="button"
          style={rerollBtn}
          onClick={(e) => { e.stopPropagation(); onReroll?.(); }}
          aria-label="別の一節を引く"
          title="別の一節を引く"
        >
          🔄
        </button>
      </div>
      {tappable ? (
        <button type="button" style={bodyBase} onClick={onOpen} aria-label={`『${book.title}』を開く`}>
          {inner}
        </button>
      ) : (
        <div style={bodyBase}>{inner}</div>
      )}
    </section>
  );
}
