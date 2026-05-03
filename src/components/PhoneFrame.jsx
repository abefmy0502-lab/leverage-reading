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

const SIZES = {
  small: { width: 220, padding: 6 },
  medium: { width: 280, padding: 8 },
  large: { width: 320, padding: 10 },
};

export default function PhoneFrame({ src, alt, size = 'medium', float = false }) {
  const s = SIZES[size] || SIZES.medium;
  return (
    <div
      className={`phone-frame phone-frame-${size}${float ? ' float' : ''}`}
      style={{ width: s.width, padding: s.padding }}
    >
      <img src={src} alt={alt} loading="lazy" className="phone-screen-img" />
    </div>
  );
}
