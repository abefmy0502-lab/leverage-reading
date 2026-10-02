// 📸 LP のアプリの実画面（お試しモードで撮影・public/lp/<名前>-<light|dark>-<390|780>.webp）。
// 暗い画面の端末には暗い画面の写真を出す。撮り直しは npm run demo → npm run lp:shots。
export default function Shot({ name, alt, eager = false, ratio = [390, 844], imgRef, className = 'lp-shot', hidden = false }) {
  const set = (scheme) => `/lp/${name}-${scheme}-390.webp 390w, /lp/${name}-${scheme}-780.webp 780w`;
  const sizes = '(min-width: 768px) 300px, 72vw';
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" type="image/webp" srcSet={set('dark')} sizes={sizes} />
      <img
        ref={imgRef}
        className={className}
        src={`/lp/${name}-light-780.webp`}
        srcSet={set('light')}
        sizes={sizes}
        width={ratio[0]}
        height={ratio[1]}
        alt={hidden ? '' : alt}
        aria-hidden={hidden || undefined}
        loading={eager ? 'eager' : 'lazy'}
        fetchpriority={eager ? 'high' : undefined}
        decoding={eager ? undefined : 'async'}
      />
    </picture>
  );
}
