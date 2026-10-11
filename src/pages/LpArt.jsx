// 🖼 LP の節のイラストの受け皿（2026-10-11 オーナー「実際の画面だけでなく、イメージ図・イラストで伝えたい」）。
//
// オーナーがヒーローと同じタッチの絵を節ごとに作る。public/lp/<name>-light-<390|780|1560>.webp を置くだけで、
// その場所が絵に替わる（無ければ今のまま＝画面写真か、何も出さない）。明るい版だけ・暗い画面はヒーローと同じ絵のカード
// （.lp-illust-img＝角丸 12・暗い画面では細い線・少し暗く）。絵があるかは、ビルドのときに vite.config.js が public/lp を見て
// 焼き込む一覧（__LP_ART__）で決める＝開いた画面で画像を探しに行かない（無い絵の 404 を出さない）。置いたら公開し直せば替わる。
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

export const ART_NAMES = ['illust-dialogue', 'illust-action', 'illust-focus', 'illust-share', 'illust-fields', 'illust-start'];
export const ART_WIDTHS = [390, 780, 1560];
export const artSrc = (name, w, scheme = 'light') => `/lp/${name}-${scheme}-${w}.webp`;
export const artSet = (name, scheme = 'light') => ART_WIDTHS.map((w) => `${artSrc(name, w, scheme)} ${w}w`).join(', ');

// ビルドのときに焼き込んだ一覧（'<名前>-<light|dark>'）。テストなど define が無いときは空＝どの絵も無い。
// eslint-disable-next-line no-undef
const PRESENT = new Set(typeof __LP_ART__ !== 'undefined' ? __LP_ART__ : []);

// その絵が置いてあるか（scheme='dark' は暗い画面用の版）。
export function hasArt(name, scheme = 'light') {
  return PRESENT.has(`${name}-${scheme}`);
}
// 前の形（フック）の名前のまま使えるように。中身はビルドの一覧を見るだけ。
export const useArt = hasArt;

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
