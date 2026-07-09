// 📱 LP 専用 — iPhone 風の枠で実アプリスクショを見せる。
//
// CSS は src/pages/landing.css の `.phone-frame*` 一帯を参照。本コンポーネ
// ントはサイズ別の width / padding をインラインで決めるだけ。LP だけで
// 使う想定なので、ベースアプリ側からは import しない。
//
// Props:
//   src   — 画像 URL (例: '/lp/hero-bookshelf.jpg')
//   alt   — 必須。スクリーンリーダーは画像の中身を読み上げる
//   size  — 'small' | 'medium' | 'large'
//   float — true で 4 秒周期の浮遊アニメ (prefers-reduced-motion で無効化)
//   eager — true で LCP 候補として即時読込 (hero 用。既定は lazy)
//   ratio — 'w/h' 形式のアスペクト比 (例 '868/1424')。指定すると読込前から
//           高さが確保され CLS(レイアウトシフト) が出ない

const SIZES = {
  small: { width: 220, padding: 6 },
  medium: { width: 280, padding: 8 },
  large: { width: 320, padding: 10 },
};

export default function PhoneFrame({ src, alt, size = 'medium', float = false, eager = false, ratio }) {
  const s = SIZES[size] || SIZES.medium;
  return (
    <div
      className={`phone-frame phone-frame-${size}${float ? ' float' : ''}`}
      style={{ width: s.width, padding: s.padding }}
    >
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchpriority={eager ? 'high' : undefined}
        decoding={eager ? undefined : 'async'}
        className="phone-screen-img"
        style={ratio ? { aspectRatio: ratio } : undefined}
      />
    </div>
  );
}
