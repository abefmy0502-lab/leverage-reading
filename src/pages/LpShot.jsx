// 📸 LP のアプリの実画面（public/lp/<名前>-<light|dark>-<390|780>.webp）。
// 2026-11-11 オーナー「実際の画面を貼りたい」: hero・flow-line・flow-talk・flow-voice・action・focus・fields・library・advisor の 9 枚は
// オーナーの iPhone の実際の画面（暗い画面・明るい画面にも同じ写真）。npm run lp:shots を流すとお試しモードの写真で上書きされるので、流すなら flow-source と share だけ。
// sizes: 写真の表示幅（既定はヒーロー・会話の流れの大きさ。柱の小さな写真は Landing.jsx が渡す）。
export default function Shot({ name, alt, eager = false, ratio = [390, 844], imgRef, className = 'lp-shot', hidden = false, sizes = '(min-width: 768px) 300px, 72vw' }) {
  const set = (scheme) => `/lp/${name}-${scheme}-390.webp 390w, /lp/${name}-${scheme}-780.webp 780w`;
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
