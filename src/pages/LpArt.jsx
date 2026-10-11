// 🖼 LP の節のイラストの受け皿（2026-10-11 オーナー「実際の画面だけでなく、イメージ図・イラストで伝えたい」）。
//
// オーナーがヒーローと同じタッチの絵を節ごとに作る。public/lp/<name>-light-<390|780|1560>.webp を置くだけで、
// その場所が絵に替わる（無ければ今のまま＝画面写真か、何も出さない）。明るい版だけ・暗い画面はヒーローと同じ絵のカード
// （.lp-illust-img＝角丸 12・暗い画面では --border の細い線）。確かめ方はヒーローと同じ（<name>-light-780.webp を読めるか）。
// 置き場所と書き出し方は docs/lp-measurement.md。
//
//   name                比     置く場所
//   illust-dialogue     4:3    ②「読んで、終わりにしない。」の頭（これまで → Orime の下）
//   illust-action       1:1    ③ 柱「成果につなげる」（明日の一歩）
//   illust-focus        1:1    ③ 柱「習慣にする」（集中モード）
//   illust-share        1:1    ③ 柱「発信して、続ける」（写真で共有）
//   illust-fields       1:1    ③ 柱「自分の読書を客観的に見る」（分野）
//   illust-start        4:3    ④「メモがゼロでも、今日から。」の頭
//
// 対話の 4 コマ（実際の画面）と見本の注記は、絵が届いても流れの節に残す（証拠）。
import { useEffect, useState } from 'react';

export const ART_NAMES = ['illust-dialogue', 'illust-action', 'illust-focus', 'illust-share', 'illust-fields', 'illust-start'];
export const ART_WIDTHS = [390, 780, 1560];
export const artSrc = (name, w, scheme = 'light') => `/lp/${name}-${scheme}-${w}.webp`;
export const artSet = (name, scheme = 'light') => ART_WIDTHS.map((w) => `${artSrc(name, w, scheme)} ${w}w`).join(', ');

// 同じ画像を何度も確かめない（ページの中で 1 回）。値: true（ある）／false（無い）。
const known = new Map();
const waiters = new Map();

function probe(url) {
  if (known.has(url)) return Promise.resolve(known.get(url));
  if (waiters.has(url)) return waiters.get(url);
  const p = new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve(false); return; }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  }).then((ok) => { known.set(url, ok); return ok; });
  waiters.set(url, p);
  return p;
}

// その画像（780 の幅）が置いてあるか（確かめるまでは false＝今の形のまま）。scheme='dark' は暗い画面用の版。
export function useArt(name, scheme = 'light') {
  const url = artSrc(name, 780, scheme);
  const [ok, setOk] = useState(() => known.get(url) === true);
  useEffect(() => {
    let alive = true;
    probe(url).then((v) => { if (alive) setOk(v); });
    return () => { alive = false; };
  }, [url]);
  return ok;
}

// 絵があれば絵、無ければ fallback（今の画面写真など・null なら何も出さない）。
// 暗い画面用の版（<name>-dark-*.webp）があれば <picture> で出し分ける（無ければ明るい版を暗い画面でも＝絵のカード）。
export default function LpArt({ name, alt, ratio = '4:3', sizes = '(min-width: 768px) 420px, 92vw', className = '', fallback = null }) {
  const ok = useArt(name);
  const dark = useArt(name, 'dark');
  if (!ok) return fallback;
  const [rw, rh] = ratio.split(':').map(Number);
  return (
    <picture>
      {dark && <source media="(prefers-color-scheme: dark)" type="image/webp" srcSet={artSet(name, 'dark')} sizes={sizes} />}
      <img
        className={`lp-art lp-illust-img${dark ? ' has-dark' : ''}${className ? ` ${className}` : ''}`}
        src={artSrc(name, 780)}
        srcSet={artSet(name)}
        sizes={sizes}
        width={1560}
        height={Math.round((1560 * rh) / rw)}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
