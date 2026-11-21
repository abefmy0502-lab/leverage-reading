// 📕 小さな表紙（2026-11-21・フォローの本棚・本・プロフィールの好きな本で同じ形）。
//   表紙が無いときはアプリの代用表紙と同じ色（書名から決まる・lib/coverPalette.js）に白い書名を文節で折り返して置く。
import { paletteFor } from '../lib/coverPalette';
import { withPhraseBreaks } from './TightBubble';

export default function MiniCover({ title = '', cover = '', width = 72, showTitle = true }) {
  const box = {
    width, aspectRatio: '2 / 3', borderRadius: 'var(--radius-cover)', objectFit: 'cover', flexShrink: 0, display: 'block',
    border: '1px solid var(--separator)',
  };
  if (cover) return <img src={cover} alt="" style={box} loading="lazy" />;
  const [a, b] = paletteFor(title);
  return (
    <span
      aria-hidden="true"
      style={{
        ...box, display: 'flex', alignItems: 'flex-end', padding: 'var(--space-2)', borderColor: 'transparent',
        background: `linear-gradient(160deg, ${a}, ${b})`, color: 'var(--on-cover)', fontSize: 'var(--text-meta)', fontWeight: 600,
        lineHeight: 1.4, overflow: 'hidden', wordBreak: 'keep-all', overflowWrap: 'break-word',
      }}
    >
      {/* 細い表紙（56 より細い）には書名を載せない（読めない大きさになる）。 */}
      {showTitle && (typeof width !== 'number' || width >= 56) ? withPhraseBreaks(title, { scriptBreaks: true }) : null}
    </span>
  );
}
