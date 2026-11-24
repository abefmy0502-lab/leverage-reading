// 🎨 orime のロゴ（2026-11-24 オーナー「ロゴを変えたい」・素材は scripts/brand-assets.mjs が public/brand/ に書き出す）。
//   kind: 'mark'＝記号だけ／'wordmark'＝小文字の「orime」だけ／'lockup'＝記号＋文字の横組み。
//   暗い画面では暗い地用の色の SVG に替える（端末の設定に従う＝アプリの暗い画面と同じ決まり）。
//   サービス名はどこでも小文字の「orime」（2026-11-24・読み上げの名前も orime）。
const SRC = {
  mark: { light: '/brand/orime-mark.svg', dark: '/brand/orime-mark-dark.svg', ratio: 375 / 263 },
  wordmark: { light: '/brand/orime-wordmark.svg', dark: '/brand/orime-wordmark-dark.svg', ratio: 729 / 194 },
  lockup: { light: '/brand/orime-lockup.svg', dark: '/brand/orime-lockup-dark.svg', ratio: 1166 / 263 },
};

export default function BrandLogo({ kind = 'mark', height = 28, alt = 'orime', style, className }) {
  const s = SRC[kind] || SRC.mark;
  const width = Math.round(height * s.ratio);
  return (
    <picture className={className} style={{ display: 'block', lineHeight: 0, ...style }}>
      <source srcSet={s.dark} media="(prefers-color-scheme: dark)" />
      <img src={s.light} alt={alt} width={width} height={height} style={{ display: 'block', width, height }} />
    </picture>
  );
}
