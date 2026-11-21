// 📕 小さな表紙（2026-11-21・フォローの本棚・本・プロフィールの好きな本で同じ形）。
//   表紙が無いときはアプリの代用表紙と同じ色（書名から決まる・lib/coverPalette.js）に白い書名を文節で折り返して置く。
import { paletteFor } from '../lib/coverPalette';
import { withPhraseBreaks, longestPhraseLength } from './TightBubble';

export default function MiniCover({ title = '', cover = '', width = 72, showTitle = true }) {
  const box = {
    width, aspectRatio: '2 / 3', borderRadius: 'var(--radius-cover)', objectFit: 'cover', flexShrink: 0, display: 'block',
    border: '1px solid var(--separator)',
  };
  if (cover) return <img src={cover} alt="" style={box} loading="lazy" />;
  const [a, b] = paletteFor(title);
  // 1 文節が表紙の幅（左右 8 の空きを引く・13 の字）に入らないときは、文節で守らずに折り返す。
  //   keep-all のまま overflow-wrap で割ると小さい「ャ」が行頭に来るので、ふつうの折り返し＋strict にする。
  const tooLong = typeof width === 'number' && longestPhraseLength(title, { scriptBreaks: true }) * 13 > width - 16;
  return (
    <span
      aria-hidden="true"
      style={{
        ...box, display: 'flex', alignItems: 'flex-end', padding: 'var(--space-2)', borderColor: 'transparent',
        background: `linear-gradient(160deg, ${a}, ${b})`, color: 'var(--on-cover)', fontSize: 'var(--text-meta)', fontWeight: 600,
        // 文節で折り返し、それでも入らない長い 1 語だけ最後の手段で割る（横に切らない）。
        lineHeight: 1.4, overflow: 'hidden', wordBreak: tooLong ? 'normal' : 'keep-all', overflowWrap: 'anywhere', lineBreak: 'strict',
      }}
    >
      {/* 細い表紙（56 より細い）には書名を載せない（読めない大きさになる）。 */}
      {showTitle && (typeof width !== 'number' || width >= 56) ? (tooLong ? title : withPhraseBreaks(title, { scriptBreaks: true })) : null}
    </span>
  );
}
